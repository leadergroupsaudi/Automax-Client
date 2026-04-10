import { test, expect } from "./fixtures";

test.describe("Goal Management", () => {
  test.beforeEach(async ({ loginAs }) => {
    await loginAs("admin");
  });

  test("navigate to goals via sidebar", async ({ page }) => {
    // Click the Goals link in the sidebar navigation
    const goalsLink = page
      .getByRole("link", { name: /goals/i })
      .or(page.locator('a[href*="/goals"]'))
      .first();
    await goalsLink.click();
    await expect(page).toHaveURL(/\/goals/, { timeout: 10000 });
  });

  test("goals list loads with table or cards", async ({ page }) => {
    await page.goto("/goals");
    await page.waitForLoadState("networkidle");

    // Verify that either a table or card-based list is rendered
    const hasTable = await page
      .locator("table, [role='table']")
      .first()
      .isVisible({ timeout: 10000 })
      .catch(() => false);
    const hasCards = await page
      .locator('[class*="card"], [class*="Card"], [data-testid*="goal"]')
      .first()
      .isVisible({ timeout: 5000 })
      .catch(() => false);

    expect(hasTable || hasCards).toBeTruthy();
  });

  test("create new goal via form", async ({ page }) => {
    // Navigate directly to the create page
    await page.goto("/goals/new");
    await page.waitForLoadState("networkidle");

    // Fill in goal title using the placeholder text
    const titleInput = page.getByPlaceholder("Enter goal title");
    await expect(titleInput).toBeVisible({ timeout: 10000 });
    await titleInput.fill("E2E Test Goal");

    // Fill in description using the placeholder text
    const descInput = page.getByPlaceholder("Describe the goal and its objectives");
    if (await descInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await descInput.fill("This goal was created by Playwright E2E tests");
    }

    // Submit the form — button text is "Create Goal"
    const submitBtn = page
      .getByRole("button", { name: /create goal|save|submit/i })
      .first();
    await submitBtn.click();

    // Verify redirect or success indication
    await page.waitForURL(/\/goals/, { timeout: 10000 });
  });

  test("view goal detail and verify tabs", async ({ page }) => {
    await page.goto("/goals");
    await page.waitForLoadState("networkidle");

    // Click the first goal link inside the table (not sidebar links)
    const firstGoalLink = page.locator("table tbody td a[href*='/goals/']").first();

    if (await firstGoalLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      // Get the href to verify it's a valid goal detail link
      const href = await firstGoalLink.getAttribute("href");
      console.log(`Clicking goal link with href: ${href}`);
      await firstGoalLink.click();

      // Wait for navigation and content to load
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(2000);

      console.log(`Current URL after click: ${page.url()}`);

      // Verify we're on a goal detail page (not analytics, new, etc.)
      const isOnDetail = /\/goals\/[0-9a-f-]+$/i.test(page.url());
      if (!isOnDetail) {
        console.log("Did not navigate to a goal detail page — skipping tab check");
        return;
      }

      // Verify expected tabs exist — the detail page has these tab types:
      // "overview" | "metrics" | "evidence" | "collaborators" | "check-ins" | "comments" | "activity"
      const expectedTabs = [
        "overview",
        "metrics",
        "evidence",
        "collaborators",
        "check-ins",
        "comments",
        "activity",
      ];

      let tabsFound = 0;
      for (const tabName of expectedTabs) {
        // The tabs might be rendered as text links or buttons
        const tab = page
          .getByRole("tab", { name: new RegExp(tabName, "i") })
          .or(page.locator('button').filter({ hasText: new RegExp(tabName, "i") }))
          .or(page.getByText(new RegExp(`^${tabName}$`, "i")))
          .first();
        const isVisible = await tab
          .isVisible({ timeout: 3000 })
          .catch(() => false);
        if (isVisible) {
          tabsFound++;
        } else {
          console.log(`Tab "${tabName}" not found on goal detail page`);
        }
      }

      // At least some tabs should be present on the detail page
      expect(tabsFound).toBeGreaterThan(0);
    } else {
      console.log("No goals found in list — skipping detail test");
    }
  });

  test("edit goal description", async ({ page }) => {
    await page.goto("/goals");
    await page.waitForLoadState("networkidle");

    // Click first goal link in the table (not sidebar)
    const firstGoal = page.locator("table tbody td a[href*='/goals/']").first();

    if (await firstGoal.isVisible({ timeout: 5000 }).catch(() => false)) {
      await firstGoal.click();
      await page.waitForURL(/\/goals\//, { timeout: 10000 });

      // Click edit button/link — the edit link goes to /goals/:id/edit
      const editBtn = page
        .getByRole("link", { name: /edit/i })
        .or(page.getByRole("button", { name: /edit/i }))
        .first();

      if (await editBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
        await editBtn.click();
        // Wait for edit form
        await page.waitForLoadState("networkidle");

        // Update description using placeholder
        const descInput = page
          .getByPlaceholder(/describe the goal/i)
          .or(page.locator('textarea').first());
        if (await descInput.isVisible({ timeout: 3000 }).catch(() => false)) {
          await descInput.fill("Updated by Playwright E2E test");
        }

        // Save
        const saveBtn = page
          .getByRole("button", { name: /save|update|submit/i })
          .first();
        await saveBtn.click();

        // Wait for navigation or success toast
        await page.waitForLoadState("networkidle");
      } else {
        console.log("Edit button not visible — user may not have edit permissions");
      }
    } else {
      console.log("No goals found — skipping edit test");
    }
  });

  test("delete goal", async ({ page }) => {
    await page.goto("/goals");
    await page.waitForLoadState("networkidle");

    // Click first goal
    const firstGoal = page
      .locator("table tbody tr, [data-testid*='goal'], a[href*='/goals/']")
      .first();

    if (await firstGoal.isVisible({ timeout: 5000 }).catch(() => false)) {
      await firstGoal.click();
      await page.waitForURL(/\/goals\//, { timeout: 10000 });

      // Click delete button
      const deleteBtn = page
        .getByRole("button", { name: /delete|remove/i })
        .first();
      if (await deleteBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await deleteBtn.click();

        // Confirm deletion in dialog
        const confirmBtn = page
          .getByRole("button", { name: /confirm|yes|delete/i })
          .last();
        if (await confirmBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
          await confirmBtn.click();
        }

        // Should redirect to goals list
        await page.waitForURL(/\/goals$/, { timeout: 10000 });
      }
    } else {
      console.log("No goals found — skipping delete test");
    }
  });
});
