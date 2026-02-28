import { test, expect } from "@playwright/test";

const routes = [
  "/",
  "/about",
  "/waitlist",
  "/glossary",
  "/trust-zone",
  "/privacy-policy",
  "/terms-of-use",
  "/terms-and-conditions",
  "/medical-disclaimer",
  "/digital-content-terms",
  "/cookies",
  "/imprint",
  "/survey",
];

for (const path of routes) {
  test(`${path} — loads with status 200 and LoveIQ title`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => {
      // Ignore third-party script errors outside our control
      if (err.message.toLowerCase().includes("cookieyes")) return;
      errors.push(err.message);
    });

    const response = await page.goto(path);
    expect(response?.status()).toBe(200);
    await expect(page).toHaveTitle(/LoveIQ/i);

    expect(errors, `Uncaught JS errors on ${path}: ${errors.join(", ")}`).toHaveLength(0);
  });
}
