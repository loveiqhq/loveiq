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
    expect(typeof json.ok).toBe("boolean");
    expect(json.checks).toBeDefined();
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

  test("Contentsquare tag is present in the server-rendered head", async ({ request }) => {
    const res = await request.get("/");
    expect(res.status()).toBe(200);

    const html = await res.text();
    const head = html.match(/<head[^>]*>([\s\S]*?)<\/head>/i)?.[1];

    expect(head).toBeDefined();
    expect(head).toContain('src="https://t.contentsquare.net/uxa/f1a8d593041c0.js"');
    expect(head).not.toMatch(
      /https:\/\/t\.contentsquare\.net\/uxa\/f1a8d593041c0\.js"[^>]*data-cookieyes=/i
    );
    expect(head).not.toMatch(
      /https:\/\/t\.contentsquare\.net\/uxa\/f1a8d593041c0\.js"[^>]*type="text\/plain"/i
    );
  });

  test("404 page handles unknown routes", async ({ page }) => {
    const res = await page.goto("/this-page-does-not-exist");
    // Next.js returns 404 for unknown routes
    expect(res?.status()).toBe(404);
  });

  test("waitlist API rejects GET method", async ({ request }) => {
    const res = await request.get("/api/waitlist");
    // App Router returns 405 for unsupported methods
    expect(res.status()).toBe(405);
  });
});
