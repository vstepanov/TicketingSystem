import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright configuration (plan §6.1 E2E, S20).
 *
 * The full-journey suite runs the REAL built app against an ephemeral Postgres
 * and an in-process SMTP capture server. `globalSetup`
 * (tests/e2e/helpers/global-setup.ts) boots the backends, then starts the built
 * Next.js standalone server (via startApp in start-app.ts) once they exist;
 * `globalTeardown` stops everything.
 *
 * NOTE: we deliberately do NOT use Playwright's `webServer` option. Playwright
 * starts `webServer` and waits for its URL BEFORE running `globalSetup`, so the
 * server would boot before the ephemeral DB exists. Starting the app from inside
 * globalSetup guarantees the backends are ready first.
 *
 * The app port is deterministic (E2E_APP_PORT, default 3100) so `baseURL` can be
 * computed here at config-load time.
 *
 * NOTE: these specs are authored for correctness but were NOT executed during
 * authoring (the sandbox has no Playwright browsers / system deps). Run them
 * with `npm run test:e2e` on a machine where `npx playwright install` has run.
 */
const APP_PORT = Number(process.env.E2E_APP_PORT ?? 3100);
const BASE_URL = process.env.APP_URL ?? `http://127.0.0.1:${APP_PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  // Helpers live under tests/e2e/helpers — only run *.spec.ts as tests.
  testMatch: /.*\.spec\.ts/,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: "html",
  timeout: 60_000,
  globalSetup: "./tests/e2e/helpers/global-setup.ts",
  globalTeardown: "./tests/e2e/helpers/global-teardown.ts",
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
