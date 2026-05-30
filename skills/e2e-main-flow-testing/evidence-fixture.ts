/**
 * Evidence collection fixture for Playwright E2E tests.
 *
 * Usage:
 *   import { evidenceTest as test, expect } from './evidence-fixture'
 *
 *   test('should complete flow', async ({ page, evidence }) => {
 *     evidence.custom = { flow: 'login', step: 'navigate' }
 *     await page.goto('/login')
 *
 *     evidence.custom.step = 'submit'
 *     await page.getByRole('button', { name: 'Login' }).click()
 *
 *     evidence.custom.step = 'verify'
 *     await expect(page.getByRole('heading')).toContainText('Dashboard')
 *   })
 *
 * On failure (including timedOut / interrupted), evidence is exported to e2e/output/.
 */
import { test as base, expect } from '@playwright/test'
import type { Page, TestInfo } from '@playwright/test'
import fs from 'fs/promises'
import path from 'path'

// --- Types ---
// Each interface corresponds to a specific event source being collected during the test.

/** Captured from page.on('console') — includes log, warn, error, etc. */
interface ConsoleEntry {
	type: string
	text: string
	location?: { url?: string; lineNumber?: number; columnNumber?: number }
}

/** Captured from page.on('pageerror') — uncaught exceptions in the page */
interface PageErrorEntry {
	message: string
	stack?: string
}

/** Captured from page.on('requestfailed') — network failures (DNS, CORS, connection refused) */
interface RequestFailedEntry {
	url: string
	method: string
	failure?: string
}

/** Captured from page.on('response', status >= 400) — HTTP error responses */
interface HttpErrorEntry {
	url: string
	method: string
	status: number
	statusText: string
}

/** Captured from injected console.error override — console.error calls with full stack traces */
interface ConsoleStackEntry {
	text: string
	stack: string
}

/** Captured from injected window.onerror + unhandledrejection — browser-side runtime errors with stack traces */
interface RuntimeEntry {
	kind: 'error' | 'unhandledrejection'
	message: string
	stack?: string
}

/** Internal collection state — accumulated during the test, exported on failure */
interface EvidenceState {
	consoleMessages: ConsoleEntry[]
	consoleErrorStacks: ConsoleStackEntry[]
	pageErrors: PageErrorEntry[]
	requestFailures: RequestFailedEntry[]
	httpErrors: HttpErrorEntry[]
	browserRuntimeErrors: RuntimeEntry[]
}

/** Evidence fixture — use `evidence.custom` to annotate business step context */
export interface Evidence {
	/** Arbitrary key-value pairs for debugging context */
	custom: Record<string, unknown>
}

/** Internal type — includes the mutable collection state not exposed to test code */
interface InternalEvidence extends Evidence {
	_state: EvidenceState
}

// --- Config ---

const EVIDENCE_DIR = 'e2e/output'
const RETRY_TRACKER = 'e2e/.retry-tracker.json'
const MAX_RETRIES = 3

// --- Retry Tracker ---
// Persists across test runs to enforce the 3-strike rule.
// Stored outside e2e/output/ so it survives `rm -rf e2e/output/`.

type RetryTracker = Record<string, number>

/** Read the retry tracker. Returns empty object if file doesn't exist (first run). */
async function readTracker(): Promise<RetryTracker> {
	try {
		const data = await fs.readFile(RETRY_TRACKER, 'utf8')
		return JSON.parse(data)
	} catch {
		return {}
	}
}

/** Write the retry tracker to disk. Creates the e2e/ directory if needed. */
async function writeTracker(tracker: RetryTracker): Promise<void> {
	await fs.mkdir(path.dirname(RETRY_TRACKER), { recursive: true })
	await fs.writeFile(RETRY_TRACKER, JSON.stringify(tracker, null, 2), 'utf8')
}

// --- State ---

function createState(): EvidenceState {
	return {
		consoleMessages: [],
		consoleErrorStacks: [],
		pageErrors: [],
		requestFailures: [],
		httpErrors: [],
		browserRuntimeErrors: [],
	}
}

// --- Collectors (installed before test runs) ---

/**
 * Install all page event collectors. Must be called BEFORE the test runs
 * so that events are captured from the beginning. Collectors accumulate data
 * into `state` throughout the test lifetime.
 */
async function installCollectors(page: Page, state: EvidenceState) {
	// All console messages (log, warn, error, etc.)
	// Note: Playwright's ConsoleMessage API does not provide stack traces.
	// Stack traces for console.error are captured separately via addInitScript below.
	page.on('console', (msg) => {
		state.consoleMessages.push({
			type: msg.type(),
			text: msg.text(),
			location: msg.location(),
		})
	})

	// Uncaught page exceptions (with stack traces)
	page.on('pageerror', (err) => {
		state.pageErrors.push({ message: err.message, stack: err.stack })
	})

	// Failed network requests (DNS, connection refused, CORS, etc.)
	page.on('requestfailed', (req) => {
		state.requestFailures.push({
			url: req.url(),
			method: req.method(),
			failure: req.failure()?.errorText,
		})
	})

	// HTTP 4xx / 5xx responses
	page.on('response', (res) => {
		if (res.status() >= 400) {
			state.httpErrors.push({
				url: res.url(),
				method: res.request().method(),
				status: res.status(),
				statusText: res.statusText(),
			})
		}
	})

	// Injected before any page script:
	// - Intercept console.error to capture full stack traces
	// - Hook window.onerror and unhandledrejection for runtime error stacks
	await page.addInitScript(() => {
		const w = window as any
		w.__PW_RT_ERRORS__ = []
		w.__PW_CONSOLE_ERR_STACKS__ = []

		// Intercept console.error — Playwright can't provide stacks via ConsoleMessage,
		// so we generate the stack at the call site via new Error().stack.
		const origError = console.error
		console.error = (...args: any[]) => {
			const stack = new Error().stack || ''
			w.__PW_CONSOLE_ERR_STACKS__.push({
				text: args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '),
				stack,
			})
			origError.apply(console, args)
		}

		window.addEventListener('error', (e) => {
			w.__PW_RT_ERRORS__.push({
				kind: 'error' as const,
				message: e.message || 'Unknown error',
				stack: (e.error as Error)?.stack,
			})
		})

		window.addEventListener('unhandledrejection', (e) => {
			const r = e.reason
			let msg: string
			let stk: string | undefined
			if (r instanceof Error) {
				msg = r.message
				stk = r.stack
			} else if (typeof r === 'string') {
				msg = r
			} else {
				try {
					msg = JSON.stringify(r)
				} catch {
					msg = String(r)
				}
			}
			w.__PW_RT_ERRORS__.push({ kind: 'unhandledrejection' as const, message: msg, stack: stk })
		})
	})
}

// --- Evidence Export ---
// Called once when a test fails (including timedOut / interrupted).
// Writes structured evidence to e2e/output/ for agent consumption.
// All capture operations are guarded — page may be dead after crash.

async function exportEvidence(page: Page, testInfo: TestInfo, evidence: InternalEvidence) {
	const state = evidence._state

	// Collect browser-side runtime errors and console.error stacks
	// (injected via addInitScript, collected from window.__PW_*__ variables)
	state.browserRuntimeErrors = await page.evaluate(() => {
		return (window as any).__PW_RT_ERRORS__ || []
	}).catch(() => [])
	state.consoleErrorStacks = await page.evaluate(() => {
		return (window as any).__PW_CONSOLE_ERR_STACKS__ || []
	}).catch(() => [])

	await fs.mkdir(EVIDENCE_DIR, { recursive: true })

	// Generate a filesystem-safe identifier from the test title (supports CJK characters)
	const slug = testInfo.title
		.replace(/\s+/g, '-')
		.replace(/[^a-zA-Z0-9\u4e00-\u9fa5-_]/g, '')
	const screenshotPath = path.join(EVIDENCE_DIR, `${slug}-failure.png`)
	const htmlPath = path.join(EVIDENCE_DIR, `${slug}-page.html`)
	const textPath = path.join(EVIDENCE_DIR, `${slug}-page.txt`)
	const evidencePath = path.join(EVIDENCE_DIR, `${slug}-evidence.json`)

	// Capture page state (all guarded — page may be dead after crash)
	await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {})
	const html = await page.content().catch(() => '')
	const text = await page.locator('body').innerText().catch(() => '')

	const payload = {
		title: testInfo.title,
		file: testInfo.file,
		status: testInfo.status,
		error: testInfo.error
			? { message: testInfo.error.message, stack: testInfo.error.stack }
			: null,
		url: page.url(),
		files: { screenshotPath, htmlPath, textPath },
		consoleMessages: state.consoleMessages,
		consoleErrorStacks: state.consoleErrorStacks,
		pageErrors: state.pageErrors,
		browserRuntimeErrors: state.browserRuntimeErrors,
		requestFailures: state.requestFailures,
		httpErrors: state.httpErrors,
		custom: evidence.custom,
	}

	await fs.writeFile(htmlPath, html, 'utf8').catch(() => {})
	await fs.writeFile(textPath, text, 'utf8').catch(() => {})
	await fs.writeFile(evidencePath, JSON.stringify(payload, null, 2), 'utf8').catch(() => {})

	// Attach to Playwright report for human review
	await testInfo.attach('evidence', { path: evidencePath, contentType: 'application/json' }).catch(() => {})
	await testInfo.attach('page-html', { path: htmlPath, contentType: 'text/html' }).catch(() => {})
	await testInfo.attach('page-text', { path: textPath, contentType: 'text/plain' }).catch(() => {})
	await testInfo.attach('screenshot', { path: screenshotPath, contentType: 'image/png' }).catch(() => {})

	// Stderr summary for agent consumption
	const errorSummary = testInfo.error?.message ?? testInfo.status
	console.error(`[EVIDENCE] ${evidencePath} | ERROR: ${errorSummary} | URL: ${page.url()}`)

	// Page health warnings
	const warnings: string[] = []
	if (state.consoleErrorStacks.length) warnings.push(`${state.consoleErrorStacks.length} consoleError(s)`)
	if (state.pageErrors.length) warnings.push(`${state.pageErrors.length} pageError(s)`)
	if (state.browserRuntimeErrors.length) warnings.push(`${state.browserRuntimeErrors.length} runtimeError(s)`)
	if (state.requestFailures.length) warnings.push(`${state.requestFailures.length} requestFailure(s)`)
	if (state.httpErrors.length) {
		const codes = [...new Set(state.httpErrors.map((e) => e.status))].join(', ')
		warnings.push(`${state.httpErrors.length} httpError(s) [${codes}]`)
	}
	if (warnings.length) {
		console.error(`[HEALTH] ${warnings.join(' | ')}`)
	}
}

// --- Custom Fixture ---

export const evidenceTest = base.extend<{ evidence: Evidence }>({
	evidence: async ({ page }, use, testInfo) => {
		const tracker = await readTracker()
		const count = tracker[testInfo.title] || 0

		// 3-strike enforcement: refuse to run after MAX_RETRIES failures across fix attempts.
		// This is code-level enforcement — the agent cannot circumvent it.
		// To reset after human fix: rm e2e/.retry-tracker.json
		if (count >= MAX_RETRIES) {
			console.error(
				`[ESCALATE] "${testInfo.title}" has failed ${count} times. STOP fixing. Escalate to human.`,
			)
			console.error(`[ESCALATE] Evidence preserved in ${EVIDENCE_DIR}/`)
			console.error(`[ESCALATE] To reset after human fix: rm ${RETRY_TRACKER}`)
			throw new Error(
				`ESCALATED: "${testInfo.title}" failed ${count} times after fix attempts. ` +
					`Escalate to human. Delete ${RETRY_TRACKER} to reset.`,
			)
		}

		// Normal flow: install collectors and run the test
		const state = createState()
		await installCollectors(page, state)

		const evidence: InternalEvidence = {
			custom: {},
			_state: state,
		}

		await use(evidence)

		// After test completes: handle failure or success
		if (testInfo.status !== testInfo.expectedStatus) {
			// Test failed/timedOut/interrupted — export evidence and increment retry counter
			try {
				await exportEvidence(page, testInfo, evidence)
			} catch (e) {
				console.error(`[EVIDENCE] Export failed: ${e instanceof Error ? e.message : String(e)}`)
			}
			tracker[testInfo.title] = count + 1
			await writeTracker(tracker)
			if (count + 1 >= MAX_RETRIES) {
				console.error(
					`[ESCALATE] "${testInfo.title}" has failed ${count + 1} times. Next run will be escalated to human.`,
				)
			}
		} else if (count > 0) {
			// Test passed after previous failures — reset its counter
			delete tracker[testInfo.title]
			if (Object.keys(tracker).length === 0) {
				await fs.unlink(RETRY_TRACKER).catch(() => {})
			} else {
				await writeTracker(tracker)
			}
		}
	},
})

export { expect }
