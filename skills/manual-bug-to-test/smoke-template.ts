/**
 * Bug reproduction template — use as a starting point for manual-bug-to-test.
 *
 * This is a reference template. The actual test is written to e2e/bug-<description>.spec.ts
 * following the manual-bug-to-test skill process.
 *
 * Key patterns demonstrated:
 * - Evidence fixture: automatic collection of all diagnostic events
 * - evidence.custom: annotate each business step for debugging context
 * - Semantic locators: getByRole > getByLabel > getByText > getByTestId
 * - Web-first assertions: expect(locator).toBeVisible() with auto-retry
 */
import { evidenceTest as test, expect } from './evidence-fixture'

test.describe('Bug Reproduction: <short description>', () => {
  test('reproduces the reported bug', async ({ page, evidence }) => {
    // Annotate the bug for evidence tracking
    evidence.custom = {
      bug: '<short-description>',
      source: 'manual-report',
      step: 'init',
    }

    // --- Step 1: Navigate to the route where the bug occurs ---
    evidence.custom.step = 'navigate'
    await page.goto('/')

    // --- Step 2: Execute the exact reproduction steps from the bug report ---
    evidence.custom.step = 'trigger-bug'
    // Example: click a button that triggers the bug
    // await page.getByRole('button', { name: 'Submit' }).click()
    //
    // Example: fill a form that triggers the bug
    // await page.getByLabel('Email').fill('test@example.com')

    // --- Step 3: Assert expected behavior (this will FAIL — RED) ---
    evidence.custom.step = 'verify'
    // Example assertions:
    // await expect(page.getByTestId('result')).toContainText('Expected content')
    // await expect(page.getByRole('heading')).toBeVisible()
    // await expect(page.getByText('Success')).toBeVisible()
  })
})
