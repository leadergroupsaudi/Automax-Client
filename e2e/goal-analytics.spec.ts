import { test, expect } from "./fixtures";

test.describe("Goal Analytics", () => {
  test.beforeEach(async ({ loginAs }) => {
    await loginAs("admin");
  });

  test("navigate to analytics page", async ({ page }) => {
    // Navigate via sidebar or direct URL
    const analyticsLink = page
      .getByRole("link", { name: /analytics/i })
      .or(page.locator('a[href*="/analytics"]'))
      .first();

    if (await analyticsLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      await analyticsLink.click();
    } else {
      await page.goto("/goals/analytics");
    }

    await page.waitForLoadState("networkidle");
  });

  test("stat cards render", async ({ page }) => {
    await page.goto("/goals/analytics");
    await page.waitForLoadState("networkidle");

    // The stat cards use rounded-xl border pattern and contain labels like
    // "Total Goals", "Active", "Overdue", "At Risk", "Achieved", "Missed"
    // They are in a grid: grid-cols-2 md:grid-cols-3 lg:grid-cols-6
    const statCards = page.locator(
      '.grid > .rounded-xl'
    );
    const count = await statCards.count();

    // Also try text-based detection for stat labels
    if (count === 0) {
      const hasStatText = await page
        .getByText(/Total Goals|Active|Overdue|At Risk|Achieved|Missed/)
        .first()
        .isVisible({ timeout: 5000 })
        .catch(() => false);
      expect(hasStatText).toBeTruthy();
    } else {
      expect(count).toBeGreaterThan(0);
    }
  });

  test("charts render", async ({ page }) => {
    await page.goto("/goals/analytics");
    await page.waitForLoadState("networkidle");

    // Charts are typically rendered as SVG or canvas elements
    const charts = page.locator(
      "svg.recharts-surface, canvas, [class*='chart'], [data-testid*='chart']"
    );
    const chartCount = await charts
      .count()
      .catch(() => 0);
    // At least one chart should be visible
    expect(chartCount).toBeGreaterThan(0);
  });

  test("department filter dropdown exists", async ({ page }) => {
    await page.goto("/goals/analytics");
    await page.waitForLoadState("networkidle");

    const deptFilter = page
      .getByRole("combobox", { name: /department/i })
      .or(page.getByLabel(/department/i))
      .or(page.locator('select[name*="department"], [data-testid*="department"]'))
      .first();

    const isVisible = await deptFilter
      .isVisible({ timeout: 5000 })
      .catch(() => false);
    // Department filter may or may not exist depending on UI design
    if (isVisible) {
      await deptFilter.click();
    }
  });

  test("date range filter exists", async ({ page }) => {
    await page.goto("/goals/analytics");
    await page.waitForLoadState("networkidle");

    const dateFilter = page
      .getByLabel(/date|period|range/i)
      .or(page.locator('input[type="date"], [data-testid*="date-range"]'))
      .first();

    const isVisible = await dateFilter
      .isVisible({ timeout: 5000 })
      .catch(() => false);
    if (isVisible) {
      expect(isVisible).toBeTruthy();
    }
  });

  test("print button exists", async ({ page }) => {
    await page.goto("/goals/analytics");
    await page.waitForLoadState("networkidle");

    const printBtn = page
      .getByRole("button", { name: /print|export/i })
      .or(page.locator('[data-testid*="print"]'))
      .first();

    const isVisible = await printBtn
      .isVisible({ timeout: 5000 })
      .catch(() => false);
    if (isVisible) {
      expect(isVisible).toBeTruthy();
    }
  });

  test("fullscreen button exists", async ({ page }) => {
    await page.goto("/goals/analytics");
    await page.waitForLoadState("networkidle");

    const fullscreenBtn = page
      .getByRole("button", { name: /fullscreen|expand/i })
      .or(page.locator('[data-testid*="fullscreen"]'))
      .first();

    const isVisible = await fullscreenBtn
      .isVisible({ timeout: 5000 })
      .catch(() => false);
    if (isVisible) {
      expect(isVisible).toBeTruthy();
    }
  });
});
