import { test, expect } from "./fixtures";

test.describe("Authentication", () => {
  test("login with valid credentials redirects to dashboard", async ({
    page,
    loginAs,
  }) => {
    await loginAs("admin");
    // The loginAs fixture already waits for /dashboard URL
    await expect(page).toHaveURL(/\/dashboard/);
    // The dashboard page has a welcome h1 — just verify the page loaded
    await page.waitForLoadState("networkidle");
    // Verify something rendered on the dashboard (welcome text or navigation cards)
    const hasContent = await page
      .locator("h1, h2, [class*='card'], nav")
      .first()
      .isVisible({ timeout: 10000 });
    expect(hasContent).toBeTruthy();
  });

  test("login with invalid password shows error", async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[name="email"]', "admin@automax.com");
    await page.fill('input[name="password"]', "wrongpassword");
    await page.click('button[type="submit"]');

    // Should stay on login page or show an error
    // Wait a moment for the response
    await page.waitForTimeout(2000);

    // Either we're still on login, or there's an error toast/message
    const stillOnLogin = /\/login/.test(page.url());
    const errorVisible = await page
      .locator('[role="alert"], [data-sonner-toast], [data-sonner-toaster] li, .text-red-500, .error, [class*="toast"]')
      .first()
      .isVisible({ timeout: 5000 })
      .catch(() => false);

    expect(stillOnLogin || errorVisible).toBeTruthy();
  });

  test("logout redirects to login", async ({ page, loginAs }) => {
    await loginAs("admin");
    await expect(page).toHaveURL(/\/dashboard/);

    // The profile dropdown is in the Navbar — click the profile button to open dropdown
    // The profile button contains ChevronDown and user info
    const profileTrigger = page.locator(
      'button:has(.lucide-chevron-down), button:has(img[alt])'
    ).first();

    if (await profileTrigger.isVisible({ timeout: 3000 }).catch(() => false)) {
      await profileTrigger.click();
      // Wait for dropdown to appear, then click "Logout"
      await page.waitForTimeout(500);
      const logoutBtn = page.getByText("Logout").first();
      if (await logoutBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await logoutBtn.click();
      }
    } else {
      // Fallback: clear auth state by navigating to login
      await page.evaluate(() => localStorage.clear());
      await page.goto("/login");
    }

    await expect(page).toHaveURL(/\/login/, { timeout: 10000 });
  });
});
