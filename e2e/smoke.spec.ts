import { test, expect } from "@playwright/test";

test.describe("smoke tests", () => {
  test("landing page loads and shows hero content", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/LoveIQ/i);
    // Hero section should be visible
    await expect(page.locator("main")).toBeVisible();
  });

  test("landing page has navigation", async ({ page }) => {
    await page.goto("/");
    const nav = page.locator("nav");
    await expect(nav).toBeVisible();
  });

  test("landing page has footer", async ({ page }) => {
    await page.goto("/");
    const footer = page.locator("footer");
    await expect(footer).toBeAttached();
  });

  test("about page loads", async ({ page }) => {
    await page.goto("/about");
    await expect(page).toHaveTitle(/LoveIQ/i);
  });

  test("health endpoint responds with valid JSON", async ({ request }) => {
    const res = await request.get("/api/health");
    // 200 when all services are configured, 503 when env vars are missing (e.g. local dev)
    expect([200, 503]).toContain(res.status());
    const json = await res.json();
    // The probe deliberately returns only `{ ok }` — it must NOT reveal which
    // individual services are up/down to anonymous callers (see app/api/health).
    expect(typeof json.ok).toBe("boolean");
  });

  test("security headers are present", async ({ page }) => {
    const res = await page.goto("/");
    expect(res).not.toBeNull();
    const headers = res!.headers();
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["content-security-policy"]).toBeDefined();
    expect(headers["strict-transport-security"]).toBeDefined();
  });

  /**
   * The production analytics tags must NOT be in this build's head.
   *
   * Playwright builds and serves locally, so this run is by definition not the live
   * site — and since 2026-08-27 GA4, Google Ads, GTM and Clarity are emitted only
   * when the baked NEXT_PUBLIC_SITE_URL is a production host. Their ids are
   * hardcoded with no per-environment property, so before that gate every e2e run,
   * every dev session and every staging visit recorded into the same GA4 property,
   * Ads account and Clarity project as real customers.
   *
   * This test used to assert the opposite — that Clarity WAS present — which is
   * itself the evidence that a throwaway CI build was recording into production.
   *
   * Its other two assertions (that the tag carries no type="text/plain" and no
   * data-cookieyes) tested nothing at all: the regex they built the tag from had a
   * raw backspace byte where a `\b` was meant, so it never matched, `clarityTag`
   * was always the empty string, and both `not.toContain` checks passed vacuously.
   * That half of the contract now lives in
   * features/analytics/tests/production-analytics-gate.test.ts, asserted against
   * the layout source — which is the right layer for it anyway, being a property of
   * the code rather than of whichever environment the runner booted.
   */
  test("no production analytics tag is emitted on a non-production build", async ({ request }) => {
    const res = await request.get("/");
    expect(res.status()).toBe(200);

    const head = (await res.text()).match(/<head[^>]*>([\s\S]*?)<\/head>/i)?.[1];
    expect(head).toBeDefined();

    for (const fingerprint of [
      "clarity-init.js",
      "clarity.ms",
      "G-QTYY69L46N",
      "AW-18068690553",
      "googletagmanager.com",
    ]) {
      expect(head, fingerprint).not.toContain(fingerprint);
    }

    // CookieYes still loads everywhere: its consent cookie is what gates the
    // FIRST-party durable analytics writes, so dropping it off production would
    // silently stop the funnel tables rather than just quieten a third party.
    expect(head).toContain("cdn-cookieyes.com");
  });

  test("404 page handles unknown routes", async ({ page }) => {
    const res = await page.goto("/this-page-does-not-exist");
    // Next.js returns 404 for unknown routes
    expect(res?.status()).toBe(404);
  });
});
