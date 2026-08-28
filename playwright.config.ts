import { createHash } from "node:crypto";
import { defineConfig, devices } from "@playwright/test";
import { loadEnvConfig } from "@next/env";

// Load .env.local so E2E tests can access env vars (e.g. STAGING_PASSWORD)
loadEnvConfig(process.cwd());

/**
 * What the suite points at. `PLAYWRIGHT_BASE_URL` runs it against a deployed
 * environment instead of a local build.
 *
 * The visual-regression workflow has always passed this variable, and until now
 * nothing read it: `baseURL` was hardcoded to localhost, so its `target_url` input
 * did nothing and every run silently tested a local build. That was the safer of
 * the two outcomes — staging is password-gated, so a run that HAD honoured it would
 * have screenshotted the login page — which is why the dead knob went unnoticed.
 */
const baseURL = process.env.PLAYWRIGHT_BASE_URL?.trim() || "http://localhost:3000";
const targetHost = new URL(baseURL).hostname;
const isLocalTarget = targetHost === "localhost" || targetHost === "127.0.0.1";

/**
 * Cookies every context starts with.
 *
 * Local: pin the landing A/B arm. `/` is a 50/50 split between two entirely
 * different designs (shared/experiments/landingVariant.ts), so without this every
 * landing assertion — and every visual baseline — would flip arm at random.
 *
 * Remote: deliberately NO arm cookie. Deployed builds name it `__Host-liq_lv`, and
 * a `__Host-` cookie may not carry a Domain attribute, which is exactly what
 * storageState has to supply. Specs that care about the arm use the `?variant=`
 * override the middleware already honours — which is what visual-regression does.
 */
const stagingPassword = process.env.STAGING_PASSWORD;
const startingCookies = [
  ...(isLocalTarget
    ? [
        {
          name: "__liq_lv",
          value: "white",
          domain: targetHost,
          path: "/",
          expires: -1,
          httpOnly: false,
          secure: false,
          sameSite: "Lax" as const,
        },
      ]
    : []),
  /**
   * Past the staging gate. proxy.ts compares `staging_session` against the hex
   * SHA-256 of STAGING_PASSWORD, so the cookie can be minted directly — no login
   * round-trip. Without it a remote run against staging redirects to /login and
   * every screenshot is of the login page.
   */
  ...(!isLocalTarget && stagingPassword
    ? [
        {
          name: "staging_session",
          value: createHash("sha256").update(stagingPassword).digest("hex"),
          domain: targetHost,
          path: "/",
          expires: -1,
          httpOnly: true,
          secure: true,
          sameSite: "Strict" as const,
        },
      ]
    : []),
];

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
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "on-first-retry",
    // See `startingCookies` above: the landing-arm pin (local only) plus the
    // staging-gate session when a remote target needs one. To test the other arm,
    // override storageState in that spec or use `?variant=`.
    storageState: { cookies: startingCookies, origins: [] },
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
  // Only build and serve locally when the target IS local. Pointing at a deployed
  // environment and then also building a local server would waste minutes and, worse,
  // leave it ambiguous which of the two was actually measured.
  webServer: isLocalTarget
    ? {
        command: "npm run build && npm run start",
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        stdout: "ignore",
        stderr: "pipe",
      }
    : undefined,
});
