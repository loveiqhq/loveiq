import { defineConfig, devices } from "@playwright/test";
import { loadEnvConfig } from "@next/env";

// Load .env.local so E2E tests can access env vars (e.g. STAGING_PASSWORD)
loadEnvConfig(process.cwd());

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : 3, // limit local parallelism so Firefox cold-start doesn't compete with 5 other simultaneous browser launches
  reporter: "html",
  expect: {
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.01,
    },
  },
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "on-first-retry",
    // Pin the landing A/B arm for every spec. `/` is a 50/50 split between two
    // different designs (see shared/experiments/landingVariant.ts), so without this
    // every landing assertion — and every visual-regression baseline — would flip
    // arm at random. The cookie is what proxy.ts reads, so no spec needs a query
    // string; to test the other arm, override storageState in that spec.
    storageState: {
      cookies: [
        {
          name: "__liq_lv",
          value: "white",
          domain: "localhost",
          path: "/",
          expires: -1,
          httpOnly: false,
          secure: false,
          sameSite: "Lax",
        },
      ],
      origins: [],
    },
  },
  projects: [
    { name: "Desktop Chrome", use: { ...devices["Desktop Chrome"] } },
    {
      name: "Desktop Firefox",
      use: { ...devices["Desktop Firefox"] },
      timeout: 60_000, // Firefox cold-start is slower than Chrome/WebKit when running in parallel
    },
    { name: "Desktop Safari", use: { ...devices["Desktop Safari"] } },
    { name: "Mobile Chrome", use: { ...devices["Pixel 7"] } },
    { name: "Mobile Safari", use: { ...devices["iPhone 15 Pro"] } },
  ],
  webServer: {
    command: "npm run build && npm run start",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
