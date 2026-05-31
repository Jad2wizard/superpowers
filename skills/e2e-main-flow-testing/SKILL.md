---
name: e2e-main-flow-testing
description: Use after the main superpowers workflow completes on a Vue project with a visual interface — offers Playwright E2E testing of the project's main user flows, iterates with systematic-debugging on failures until all tests pass
---

# E2E Main Flow Testing

## Overview

After implementation is complete and all unit/component tests pass, validate the project end-to-end by running Playwright against the dev server. This is a long-running task — do NOT rush it or cut corners on token usage. Every failure gets a full root-cause investigation.

**Core principle:** The project isn't done until its main user flows work in a real browser.

**Announce at start:** "I'm using the e2e-main-flow-testing skill to validate the project's main user flows."

## When to Use

After `superpowers:finishing-a-development-branch` completes successfully and the user has agreed to run E2E validation.

## Prerequisites

Verify Playwright is installed. If not:

```bash
npm install -D @playwright/test playwright
npx playwright install chromium
```

Create or update `playwright.config.ts`:

```typescript
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  retries: 0,
  reporter: [['list'], ['json', { outputFile: 'e2e/output/report.json' }]],
  use: {
    baseURL: 'http://localhost:5173', // adjust to project's dev server
    headless: false,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
  },
})
```

Config notes:
- `headless: false` — always run with a visible browser window
- `trace: 'retain-on-failure'` — Playwright trace for human debugging, not agent consumption
- `screenshot: 'only-on-failure'` — Playwright's own screenshots (for humans)
- No video — not needed
- `fullyParallel: false` — main flow tests run sequentially to avoid interference

## The Process

### Step 1: Identify Main Flows

Read the design doc (`docs/superpowers/specs/`) and implementation plan to extract the project's primary user flows. A main flow is an end-to-end path a user takes to accomplish a core task.

**Examples:**
- Browse documents → select one → view content
- Fill form → submit → see confirmation
- Login → navigate dashboard → interact with data
- Search → filter results → view detail page

Present the identified flows to the user for confirmation:

> "Here are the main user flows I identified from the design:
> 1. [flow 1 description]
> 2. [flow 2 description]
>
> Do these cover the critical paths? Any to add or remove?"

Iterate until the user confirms the list.

### Step 2: Verify Build and Dev Server

Before writing E2E tests, confirm the project builds and the dev server starts cleanly. A failing build may mask issues that affect test correctness — fix it before writing tests.

```bash
# 1. Build the project
npm run build

# 2. Start dev server in background and verify it responds
npm run dev &
DEV_PID=$!
sleep 3
curl -s -o /dev/null -w "%{http_code}" http://localhost:5173 | grep -q "200" && echo "Dev server OK" || echo "Dev server FAILED"

# 3. If verification passes, kill the test server (E2E uses Playwright's webServer config)
kill $DEV_PID 2>/dev/null
```

If the build fails or the dev server doesn't respond, fix the issue before proceeding to Step 3. Do NOT write tests against a broken build.

### Step 3: Set Up Evidence Collection and Write Tests

Copy `evidence-fixture.ts` from this skill directory to `e2e/evidence-fixture.ts` in the project. This fixture handles all evidence collection automatically — you do not need to write any collection code yourself.

Write test files to `e2e/<flow-name>.spec.ts`. Each test imports the fixture:

```typescript
import { evidenceTest as test, expect } from './evidence-fixture'

test.describe('Main Flow: <flow name>', () => {
  test('should complete full flow', async ({ page, evidence }) => {
    evidence.custom = { flow: '<flow name>', step: 'navigate' }
    await page.goto('/route')

    evidence.custom.step = 'submit-form'
    await page.getByRole('button', { name: 'Submit' }).click()
    await expect(page.getByTestId('result')).toBeVisible()

    evidence.custom.step = 'verify-result'
    await expect(page.getByTestId('result')).toContainText('Success')
  })
})
```

**What the fixture collects automatically (no code needed):**
- All console messages (log, warn, error) with location info
- `page.on('pageerror')` — uncaught page exceptions with stack traces
- `page.on('requestfailed')` — failed network requests
- `page.on('response', status >= 400)` — HTTP 4xx/5xx responses
- Browser-side `window.onerror` and `unhandledrejection` (via injected script, captures stack traces)
- Custom context via `evidence.custom` — annotate the current business step

**On failure (including timedOut and interrupted), the fixture exports to `e2e/output/`:**
- `<test-name>-evidence.json` — structured summary: error + stack, URL, all collected events, custom context
- `<test-name>-page.html` — current page HTML (`page.content()`)
- `<test-name>-page.txt` — visible text content (`body.innerText`) — most useful for understanding what the user saw
- `<test-name>-failure.png` — full-page screenshot (for human review, not agent consumption)

**On pass, no files are written.**

#### Test Writing Guidelines

**Locators — use in this priority order:**
1. `getByRole` (most resilient) — `page.getByRole('button', { name: 'Submit' })`
2. `getByLabel` / `getByPlaceholder` — `page.getByLabel('Email')`
3. `getByText` — `page.getByText('Welcome')`
4. `getByTestId` (when semantic locators aren't possible) — `page.getByTestId('submit-btn')`
5. CSS/XPath — last resort, avoid

**Assertions:**
- Always use web-first assertions (auto-retry): `await expect(locator).toBeVisible()`
- Never use generic assertions for DOM: `expect(await locator.isVisible()).toBe(true)` — no auto-retry, will flake
- Progressive assertions before critical checks: verify container visible → loading done → content correct

**Waits:**
- Never use `page.waitForTimeout()` or `setTimeout` — arbitrary waits cause flakiness
- Locators auto-wait for actionability — no explicit waits needed for clicks/fills
- Use `waitForResponse`, `waitForURL`, or web-first assertions for specific conditions

**Test structure:**
- One test per user flow — self-contained, no interdependencies
- Use `evidence.custom.step` to annotate the current business step — this appears in evidence on failure
- Each test navigates from scratch — no relying on state from previous tests

### Step 4: Clean Output and Run Tests

```bash
# Clean previous evidence (mandatory before each run)
rm -rf e2e/output/

# Start dev server (if not using Playwright webServer config)
npm run dev &

# Run E2E tests — stop on first failure
npx playwright test e2e/ --reporter=list --max-failures=1
```

`--max-failures=1` ensures the test runner stops immediately after the first failing test. Combined with `fullyParallel: false` in playwright.config.ts, tests run sequentially — one failure halts execution.

### Step 5: Handle Failures

When a test fails, the runner stops immediately (due to `--max-failures=1`). Handle the single failure:

Track a retry counter per failing test. If the **same test** fails **3 times** after 3 separate fix attempts, **stop immediately and escalate to the human** — do not attempt a 4th fix.

**Per-failure loop:**

1. Read `evidence.json` to get the full picture:
   ```bash
   cat e2e/output/<test-name>-evidence.json
   ```
   This gives you: error message + stack, URL, all console messages, page errors, runtime errors, request failures, HTTP errors, custom step context.

2. Read `page.txt` for the visible text at failure point — often more useful than raw HTML for understanding what the user saw.

3. Read `page.html` only if you need to inspect specific DOM structure.

4. **MANDATORY:** Invoke `superpowers:systematic-debugging` with the evidence. This is NOT optional — every failure MUST go through systematic-debugging for root-cause investigation before applying any fix. The evidence JSON already contains the failure reproduction — no need for a separate `manual-bug-to-test` step. Do NOT skip this step under any circumstance.

5. After the fix, re-run ALL tests from the beginning:
   ```bash
   rm -rf e2e/output/ && npx playwright test e2e/ --reporter=list --max-failures=1
   ```

6. If the same test fails again, increment its retry counter and repeat from step 1.

7. When all tests pass (no `[EVIDENCE]` lines, exit code 0), proceed to Step 6.

**3-strike escalation rule:** If a test has failed 3 times after 3 fix attempts:

- The fixture **enforces this in code** — after 3 failures, the test throws an `ESCALATED` error and refuses to run. The agent cannot circumvent this.
- The retry counter is tracked in `e2e/.retry-tracker.json` (persists across test runs, survives `rm -rf e2e/output/`).
- **STOP.** Do not attempt another fix. Do not delete the tracker file.
- **Preserve** `e2e/output/` and the Playwright trace — do NOT clean them.
- Report to the human with:
  > "E2E test `<test-name>` has failed 3 times after 3 fix attempts. I'm unable to resolve this automatically.
  >
  > Evidence preserved in:
  > - `e2e/output/<test-name>-evidence.json` — full structured evidence
  > - `e2e/output/<test-name>-page.txt` — visible text at failure
  > - `e2e/output/<test-name>-page.html` — page HTML
  > - `e2e/output/<test-name>-failure.png` — screenshot
  > - Playwright trace in `test-results/`
  >
  > To re-run after fixing: `rm e2e/.retry-tracker.json && npx playwright test e2e/ --reporter=list --max-failures=1`"

- After the human resolves the issue, delete the tracker and resume from Step 4.

**Page health warnings:** `[HEALTH]` lines in stderr indicate page-level issues (console errors, failed requests, runtime errors). Investigate these even if the test passed — they may signal hidden problems.

### Step 6: Report Results

When all main flow tests pass:

> "E2E main flow testing complete. All <N> flows pass in a real browser.
>
> - Test directory: `e2e/`
> - <N> flows validated, <M> issues found and fixed during testing"

### Step 7: Cleanup

```bash
rm -rf e2e/output/
rm -f e2e/.retry-tracker.json
```

**Cleanup is mandatory** — unless a test was escalated to the human via the 3-strike rule. In that case, `e2e/output/`, `test-results/` (trace), and `e2e/.retry-tracker.json` are preserved for the human to investigate.

## Red Flags

| Thought | Reality |
|---------|---------|
| "Unit tests pass, E2E is overkill" | Unit tests don't catch integration issues. Real browser catches real problems. |
| "I'll fix this without systematic-debugging" | Every failure goes through systematic-debugging. No fix without root-cause investigation. |
| "Let me fix multiple failures at once" | One at a time. Each fix gets verified before the next. |
| "I'll add `waitForTimeout` to fix flakiness" | Arbitrary waits mask timing issues. Use `waitForResponse` or web-first assertions. |
| "I'll keep trying, the 4th attempt might work" | The fixture blocks re-runs after 3 failures. It's code-enforced, not guidance. |

## Integration

**Required skills:**
- **superpowers:systematic-debugging** — Root cause investigation for each failure (evidence already collected by the fixture)

**Preceded by:**
- **superpowers:finishing-a-development-branch** — Main workflow must be complete before E2E validation
