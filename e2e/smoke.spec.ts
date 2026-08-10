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

  test("Clarity tag is present in the server-rendered head", async ({ request }) => {
    const res = await request.get("/");
    expect(res.status()).toBe(200);

    const head = (await res.text()).match(/<head[^>]*>([\s\S]*?)<\/head>/i)?.[1];

    expect(head).toBeDefined();
    expect(head).toContain('src="/clarity-init.js"');

    // Clarity is deliberately NOT consent-gated (owner decision 2026-08-10,
    // reversing audit finding H1) — it must execute for every visitor, so it
    // carries neither type="text/plain" nor data-cookieyes. Asserted rather
    // than left implicit: those two attributes are the only thing measured to
    // withhold a tag on this site, so a well-meaning "re-gate it" edit would
    // silently cut recorded sessions to the consent rate. If gating is ever
    // wanted back, flip this test with the tag in the same commit.
    const clarityTag = head?.match(/<script[^>]*clarity-init[^>]*>/i)?.[0] ?? "";
    expect(clarityTag).not.toContain("text/plain");
    expect(clarityTag).not.toContain("data-cookieyes");
  });

  test("404 page handles unknown routes", async ({ page }) => {
    const res = await page.goto("/this-page-does-not-exist");
    // Next.js returns 404 for unknown routes
    expect(res?.status()).toBe(404);
  });
});
