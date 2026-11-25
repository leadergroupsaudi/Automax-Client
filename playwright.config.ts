import { defineConfig, devices } from "@playwright/test";

/**
 * ────────────────────────────────────────────────────────────────────────────
 * WHY THERE ARE TWO PROJECTS
 * ────────────────────────────────────────────────────────────────────────────
 * Three §7.11 tests need a restricted fixture account that no repository can
 * ship — a working login does not belong in a tracked file — and they FAIL
 * rather than skip when it is absent, which is right: a skip reports green,
 * and "the confidentiality split was never exercised" is exactly what must not
 * pass quietly.
 *
 * The consequence, left alone, was a default run that is red on every machine
 * forever. A suite that is always red is a suite nobody reads, and that would
 * retire the §7.11 verification far more thoroughly than a skip ever could.
 *
 * So the failure is kept and MOVED somewhere it means something. The tagged
 * tests are excluded from the default project and own the `eo-restricted`
 * project, which has to be asked for by name:
 *
 *     npm run test:e2e              # green out of the box
 *     npm run test:e2e:restricted   # fails loudly if the fixture is missing
 *
 * The account and how to provision it are documented in `e2e/README.md`.
 */
const EO_RESTRICTED = /@eo-restricted/;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: "html",
  use: {
    baseURL: "http://localhost:5173",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      grepInvert: EO_RESTRICTED,
    },
    {
      // Everything that needs EO_RESTRICTED_EMAIL / EO_RESTRICTED_PASSWORD.
      name: "eo-restricted",
      use: { ...devices["Desktop Chrome"] },
      grep: EO_RESTRICTED,
    },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:5173",
    reuseExistingServer: true,
    timeout: 30000,
  },
});
