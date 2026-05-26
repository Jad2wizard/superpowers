---
name: e2e-main-flow-testing
description: Use after the main superpowers workflow completes on a Vue project with a visual interface — offers Playwright E2E testing of the project's main user flows, iterates with manual-bug-to-test and systematic-debugging on failures until all tests pass
---

# E2E Main Flow Testing

## Overview

After implementation is complete and all unit/component tests pass, validate the project end-to-end by running Playwright against the dev server. This is a long-running task — do NOT rush it or cut corners on token usage. Every failure gets a full root-cause investigation.

**Core principle:** The project isn't done until its main user flows work in a real browser.

**Announce at start:** "I'm using the e2e-main-flow-testing skill to validate the project's main user flows."

## When to Use

After `superpowers:finishing-a-development-branch` completes successfully. Offer this to the user:

> "Implementation is complete and all tests pass. Would you like me to run Playwright E2E tests against the project's main user flows? This validates the full application in a real browser and catches issues that unit tests can miss."

Wait for the user's response. If they decline, stop here.

## Prerequisites

Verify Playwright is installed. If not:

```bash
npm install -D @playwright/test playwright
npx playwright install chromium
```

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

### Step 2: Write main-flow.spec.ts

Write to `e2e/main-flow.spec.ts`. For each confirmed flow, write a Playwright test that:

- Navigates to the starting route
- Executes user actions step by step (click, type, select)
- Takes a screenshot after each significant action
- Asserts expected UI state at each step (element visibility, text content, URL)
- Uses `page.on('console')` to capture browser console errors
- Fails with structured output: route, step, expected vs actual, screenshot path, console errors

Test structure:

```typescript
import { test, expect } from '@playwright/test'

test.describe('Main Flow: <flow name>', () => {
  test('should complete full flow', async ({ page }) => {
    const consoleErrors: string[] = []
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text())
    })

    // Step 1: Navigate
    await page.goto('http://localhost:<port>/route')
    await page.screenshot({ path: 'e2e/screenshots/<flow>-step1.png' })

    // Step 2: Action
    // ...

    // Final: Assert no console errors
    expect(consoleErrors).toHaveLength(0)
  })
})
```

Use `test.describe` per flow. Keep selectors robust — prefer `data-testid` or `role`-based selectors over CSS classes.

### Step 3: Start Dev Server and Run Tests

```bash
# Terminal 1: Start dev server
npm run dev &

# Terminal 2: Run E2E tests
npx playwright test e2e/main-flow.spec.ts --reporter=list
```

### Step 4: Handle Test Results

**All tests pass:**
- Report results with screenshot paths
- Skip to Step 5

**Tests fail:** for EACH failing test:

1. Collect failure evidence:
   - Playwright output (expected vs actual)
   - Screenshot from the failing step
   - Console errors captured
   - The route and step where it failed

2. Invoke `superpowers:manual-bug-to-test` to create an isolated reproduction for this specific failure. By now the project already has Playwright, so skip the install step.

3. The `manual-bug-to-test` skill will produce a RED reproduction. Feed this to `superpowers:systematic-debugging`.

4. `systematic-debugging` will find and fix the root cause. Let it complete fully — do NOT interrupt or rush the debugging process.

5. After the fix is committed, re-run the full E2E suite:

   ```bash
   npx playwright test e2e/main-flow.spec.ts --reporter=list
   ```

6. Repeat until all tests pass. This may take multiple cycles. Each cycle shrinks the failure list.

### Step 5: Report Results

When all main flow tests pass:

> "E2E main flow testing complete. All <N> flows pass in a real browser.
>
> - Test file: `e2e/main-flow.spec.ts`
> - Screenshots: `e2e/screenshots/`
> - <N> flows validated, <M> issues found and fixed during testing"

### Step 6: Commit

```bash
git add e2e/main-flow.spec.ts e2e/screenshots/
git commit -m "test(e2e): add main flow E2E tests with Playwright"
```

## Red Flags

| Thought | Reality |
|---------|---------|
| "The unit tests pass, E2E is overkill" | Unit tests don't catch integration issues. Real browser catches real problems. |
| "I'll fix this quickly without bug-to-test" | Every failure deserves an isolated repro and root-cause analysis. |
| "Let me fix multiple failures at once" | One at a time. Each fix gets verified before the next. |
| "These failures are probably the same root cause" | Don't assume. Investigate each independently. |
| "I'll skip screenshots to save time" | Screenshots are the evidence. Without them you're debugging blind. |
| "This is taking too long, let me wrap up" | Long-running by design. Main flows MUST work. Token budget is approved. |

## Integration

**Required skills:**
- **superpowers:manual-bug-to-test** — Create isolated reproduction for each E2E failure
- **superpowers:systematic-debugging** — Root cause investigation for each failure

**Preceded by:**
- **superpowers:finishing-a-development-branch** — Main workflow must be complete before E2E validation
