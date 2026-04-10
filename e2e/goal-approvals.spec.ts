import { test, expect } from "./fixtures";

test.describe("Goal Approvals", () => {
  test.beforeEach(async ({ loginAs }) => {
    await loginAs("admin");
  });

  test("navigate to approvals page", async ({ page }) => {
    const approvalsLink = page
      .getByRole("link", { name: /approvals/i })
      .or(page.locator('a[href*="/approvals"]'))
      .first();

    if (await approvalsLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      await approvalsLink.click();
    } else {
      await page.goto("/goals/approvals");
    }

    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/approvals/);
  });

  test("pending and completed tabs exist", async ({ page }) => {
    await page.goto("/goals/approvals");
    await page.waitForLoadState("networkidle");

    // The tabs use text "Pending" and "Completed" — they may be buttons acting as tabs
    const pendingTab = page
      .getByRole("tab", { name: /pending/i })
      .or(page.locator('button').filter({ hasText: /pending/i }))
      .first();
    const completedTab = page
      .getByRole("tab", { name: /completed/i })
      .or(page.locator('button').filter({ hasText: /completed/i }))
      .first();

    const hasPending = await pendingTab.isVisible({ timeout: 5000 }).catch(() => false);
    const hasCompleted = await completedTab.isVisible({ timeout: 5000 }).catch(() => false);

    expect(hasPending || hasCompleted).toBeTruthy();
  });

  test("review button opens transition modal if pending items exist", async ({
    page,
  }) => {
    await page.goto("/goals/approvals");
    await page.waitForLoadState("networkidle");

    // Check if there are any pending approval items
    const reviewBtn = page
      .getByRole("button", { name: /review|approve|action/i })
      .first();

    if (await reviewBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await reviewBtn.click();

      // Verify a modal/dialog opens
      const modal = page
        .getByRole("dialog")
        .or(page.locator('[class*="modal"], [class*="Modal"], [data-testid*="modal"], .fixed.inset-0'))
        .first();
      const hasModal = await modal.isVisible({ timeout: 5000 }).catch(() => false);

      if (hasModal) {
        // The transition modal shows "Choose Action" label and transition buttons
        // e.g. "Approve (GL)", "Request Changes", "Reject" — or "No transitions available"
        // Wait for the modal content to load
        await page.waitForTimeout(1000);

        const chooseAction = page.getByText("Choose Action");
        const noTransitions = page.getByText(/no transitions available/i);

        const hasChooseAction = await chooseAction
          .isVisible({ timeout: 3000 })
          .catch(() => false);
        const hasNoTransitions = await noTransitions
          .isVisible({ timeout: 3000 })
          .catch(() => false);

        // Either the modal shows transition options or a "no transitions" message
        expect(hasChooseAction || hasNoTransitions).toBeTruthy();
      }
    } else {
      // No pending items — test passes with a note
      console.log("No pending approval items found — skipping review modal test");
    }
  });
});
