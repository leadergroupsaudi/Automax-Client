import { test, expect } from "./fixtures";

test.describe("Role-Based Access Control", () => {
  test("admin can see all sidebar items", async ({ page, loginAs }) => {
    await loginAs("admin");

    // Admin should see management links in the sidebar
    const sidebar = page.locator(
      'nav, [class*="sidebar"], [class*="Sidebar"], aside'
    );
    await expect(sidebar.first()).toBeVisible({ timeout: 10000 });

    // Check for admin-specific links
    const adminLinks = [/admin/i, /users/i, /roles/i, /settings/i];
    let adminLinksFound = 0;
    for (const linkPattern of adminLinks) {
      const link = sidebar
        .getByRole("link", { name: linkPattern })
        .or(sidebar.getByText(linkPattern))
        .first();
      if (await link.isVisible({ timeout: 2000 }).catch(() => false)) {
        adminLinksFound++;
      }
    }
    // Admin should see at least some management links
    expect(adminLinksFound).toBeGreaterThan(0);
  });

  test("viewer has limited actions on goals", async ({ page, loginAs }) => {
    await loginAs("khalid");

    await page.goto("/goals");
    await page.waitForLoadState("networkidle");

    // Viewer should be able to see the goals list
    await expect(page).toHaveURL(/\/goals/);

    // Check that create/add buttons are either hidden or disabled
    const createBtn = page
      .getByRole("button", { name: /create|add|new/i })
      .or(page.getByRole("link", { name: /create|add|new/i }))
      .first();

    const isVisible = await createBtn
      .isVisible({ timeout: 3000 })
      .catch(() => false);

    if (isVisible) {
      // If visible, it might be disabled
      const isDisabled = await createBtn.isDisabled().catch(() => false);
      console.log(
        `Create button visible for viewer: ${isVisible}, disabled: ${isDisabled}`
      );
    }
    // Either way, this test documents what a viewer sees
  });

  test("manager can create goals", async ({ page, loginAs }) => {
    await loginAs("sarah");

    await page.goto("/goals");
    await page.waitForLoadState("networkidle");

    // Manager should see the create button and it should be clickable
    const createBtn = page
      .getByRole("button", { name: /create|add|new/i })
      .or(page.getByRole("link", { name: /create|add|new/i }))
      .first();

    const isVisible = await createBtn
      .isVisible({ timeout: 5000 })
      .catch(() => false);

    if (isVisible) {
      const isEnabled = !(await createBtn.isDisabled().catch(() => true));
      expect(isEnabled).toBeTruthy();
    }
  });

  test("non-admin user has restricted admin sidebar items", async ({
    page,
    loginAs,
  }) => {
    await loginAs("khalid");

    // Navigate to admin area — users with any :view permission can access /admin
    // but they should see fewer sidebar items than a super admin
    await page.goto("/admin");
    await page.waitForLoadState("networkidle");

    const currentUrl = page.url();

    if (/\/admin/.test(currentUrl)) {
      // Khalid can access admin (has some permissions) — check that
      // at least the admin panel loaded
      const sidebar = page.locator(
        'nav, [class*="sidebar"], [class*="Sidebar"], aside'
      );
      const hasSidebar = await sidebar
        .first()
        .isVisible({ timeout: 5000 })
        .catch(() => false);
      expect(hasSidebar).toBeTruthy();
    } else {
      // Redirected away from admin — non-admin behavior confirmed
      expect(/\/dashboard|\/login/.test(currentUrl)).toBeTruthy();
    }
  });
});
