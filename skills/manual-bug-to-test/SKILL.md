---
name: manual-bug-to-test
description: Use when the human partner reports a manually discovered bug and wants to convert it into an automated failing reproduction before debugging
---

# Manual Bug to Automated Reproduction

## Overview

Convert a manually discovered bug into a Playwright `@playwright/test` reproduction. Run it in a real browser, capture structured failure evidence (evidence.json + page.html + page.txt + screenshot), confirm RED, and hand off to systematic-debugging.

**Core principle:** No automated reproduction evidence, no debugging. Evidence must be comprehensive, structured, and directly consumable by Claude Code (text-based).

## When to Use

Human-triggered. Not auto-triggered.

**Fits:**
- Bug discovered through manual browser testing
- Anomaly in a complete user flow
- Intermittent issues (Playwright can retry until it reproduces)

**Does not fit:**
- Bug already covered by an existing test (use systematic-debugging directly)
- Pure environment/configuration issues

## Prerequisites

- Project has `@playwright/test` + `playwright` installed
- Project can start a dev server via `npm run dev` (or equivalent)
- If not installed: `npm install -D @playwright/test playwright && npx playwright install chromium`

Ensure `e2e/evidence-fixture.ts` is present. If the project already ran `e2e-main-flow-testing`, it exists. Otherwise, copy it from the `e2e-main-flow-testing` skill directory:

```bash
cp skills/e2e-main-flow-testing/evidence-fixture.ts e2e/evidence-fixture.ts
```

## The Process

### Step 1: Collect Reproduction Information

Confirm all four items before proceeding to Step 2:

- [ ] **Reproduction steps**: Precise action sequence. Not "click submit", but "on route `/checkout`, fill the form, click the button with id `submit-btn`"
- [ ] **Actual behavior**: What happened (page state, error popup, white screen, console error text)
- [ ] **Expected behavior**: What SHOULD have happened
- [ ] **Environment info**: Browser, page route, data state required to trigger

Missing any item → ask, don't guess.

### Step 2: Write the Playwright Test

Write the test to `e2e/bug-<short-description>.spec.ts`. Use the smoke-template pattern: import `evidence-fixture.ts`, annotate steps with `evidence.custom`, use semantic locators and web-first assertions.

```typescript
import { evidenceTest as test, expect } from './evidence-fixture'

test('bug: <short description>', async ({ page, evidence }) => {
  evidence.custom = { bug: '<short description>', source: 'manual-report' }

  // Step 1: Navigate to the route where the bug occurs
  evidence.custom.step = 'navigate'
  await page.goto('/the-route')

  // Step 2: Execute the exact reproduction steps from Step 1
  evidence.custom.step = 'trigger-bug'
  await page.getByRole('button', { name: 'Submit' }).click()

  // Step 3: Assert expected behavior (this will fail — RED)
  evidence.custom.step = 'verify'
  await expect(page.getByTestId('result')).toContainText('Expected content')
})
```

**What the fixture collects automatically:**
- All console messages (log, warn, error) with location info
- Console error calls with full stack traces (via injected interception)
- `page.on('pageerror')` — uncaught page exceptions with stack traces
- `page.on('requestfailed')` — failed network requests
- `page.on('response', status >= 400)` — HTTP 4xx/5xx responses
- Browser-side `window.onerror` and `unhandledrejection` with stack traces
- Custom context via `evidence.custom`

**On failure, evidence is exported to `e2e/output/`:**
- `evidence.json` — structured summary with all collected events and custom context
- `page.html` — current page HTML (`page.content()`)
- `page.txt` — visible text content (`body.innerText`) — most useful for understanding the bug
- `failure.png` — full-page screenshot (for human review, not agent consumption)

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
- Assert the exact expected behavior from Step 1

**Waits:**
- Never use `page.waitForTimeout()` or `setTimeout` — arbitrary waits cause flakiness
- Locators auto-wait for actionability — no explicit waits needed for clicks/fills
- Use `waitForResponse`, `waitForURL`, or web-first assertions for specific conditions

**Test structure:**
- One test per bug — self-contained, focuses solely on reproducing the reported issue
- Use `evidence.custom.step` to annotate the current reproduction step — this appears in evidence on failure
- Navigate from scratch in each test — no relying on state from previous tests

### Step 3: Run the Test

```bash
# Start dev server
npm run dev &

# Run the bug reproduction
npx playwright test e2e/bug-<short-description>.spec.ts --reporter=list
```

Result judgment:

```
FAIL and the error matches the bug description?
  → RED confirmed. Proceed to Step 4.

FAIL but the error doesn't match the bug description?
  → The test has a problem. Check the steps and assertions, fix the test, re-run.

PASS (test passes)?
  → The test didn't catch the bug. Check url, route, trigger conditions.
    The bug may need more precise reproduction steps.
```

### Step 4: Hand Off to systematic-debugging

After RED is confirmed, invoke `superpowers:systematic-debugging` with:

```
- Test file: e2e/bug-<description>.spec.ts
- Run command: npx playwright test e2e/bug-<description>.spec.ts --reporter=list
- Failure evidence: e2e/output/<test-name>-evidence.json
```

To read the evidence:
```bash
cat e2e/output/<test-name>-evidence.json
```

The evidence JSON contains: error message + stack, URL, all console messages, console error stacks, page errors, runtime errors, request failures, HTTP errors, custom context.

Also read `e2e/output/<test-name>-page.txt` for the visible text at failure point — often more useful for understanding what went wrong than raw HTML.

**Phase 2 (pattern analysis) and Phase 3 (hypothesis verification) in systematic-debugging must run fully.** The reproduction script producing a failure ≠ the root cause has been found. Seeing an error stack and proposing a fix = skipping Phase 2 and Phase 3 — this is a violation.

## Post-Fix Verification

After the TDD GREEN fix is complete, re-run the reproduction test to confirm PASS:

```bash
npx playwright test e2e/bug-<description>.spec.ts --reporter=list
# Should output: 1 passed
```

## Red Flags

| Thought | Reality |
|---------|---------|
| "The bug is obvious, just fix it directly" | Without reproduction evidence, there's no proof. |
| "Manual reproduction is enough" | Manual depends on memory. A script is permanent evidence. |
| "I'll fix first, add the test later" | No failing reproduction = no fix target. |
| "Writing a script takes too long" | Manually reproducing N times = value of one script. The script lasts forever. |
| "I'll read the screenshot for clues" | Screenshots are for humans. Use `page.txt` and `evidence.json` instead. |
| "I'll use CSS selectors, they're quicker" | CSS selectors break on refactoring. Use `getByRole`, `getByLabel`, or `getByTestId`. |
| "I'll add `waitForTimeout` to make the bug repro" | `waitForTimeout` masks timing issues and makes reproductions flaky. Use web-first assertions. |
