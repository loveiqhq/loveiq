/** Tap a point in the former dead zone and assert the pricing modal opens. */
import { chromium, webkit, devices } from "playwright";
import { stagingCookies } from "./staging-cookie.mjs";
const ORIGIN = process.env.REPORT_ORIGIN ?? "http://localhost:3123";
const TOKEN = process.env.QA_TOKEN_LOCKED ?? "rpt_a9LY0Obbla1FVsclJ1nM";
for (const name of (process.env.DEVICES ?? "Pixel 7,iPhone SE,iPhone 15 Pro").split(",")) {
  const d = name.toLowerCase();
  const engine = d.includes("iphone") || d.includes("ipad") ? "webkit" : "chromium";
  const b = await (engine === "webkit" ? webkit : chromium).launch();
  const c = await b.newContext({ ...devices[name], locale: "en-US" });
  await c.addCookies(stagingCookies(ORIGIN)).catch(() => {});
  const p = await c.newPage();
  await p.route("**/api/stripe/checkout-session", (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ enabled: false, reason: "checkout_disabled", message: "stubbed" }),
    })
  );
  await p.goto(`${ORIGIN}/report/${TOKEN}`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await p
    .waitForSelector(".report-status-card__spinner", { state: "detached", timeout: 90000 })
    .catch(() => {});
  await p
    .waitForFunction(
      () =>
        !document.querySelector(".report-status-screen") &&
        document.documentElement.scrollHeight > innerHeight * 1.5,
      undefined,
      { timeout: 90000 }
    )
    .catch(() => {});
  await p.waitForTimeout(2200);
  await p
    .locator(".cky-btn-accept")
    .first()
    .click({ timeout: 8000 })
    .catch(() => {});
  await p.waitForTimeout(1200);
  await p.evaluate(() =>
    document.querySelector(".report-findings__upsell")?.scrollIntoView({ block: "center" })
  );
  await p.waitForTimeout(1300);
  const pt = await p.evaluate(() => {
    const w = document.querySelector(".report-findings__upsell");
    const btn = w?.querySelector(".report-findings__unlock");
    if (!w) return null;
    const r = w.getBoundingClientRect(),
      br = btn.getBoundingClientRect();
    // top-left region of the overlay, deliberately outside the painted pill
    const x = Math.round(r.left + r.width * 0.15),
      y = Math.round(r.top + r.height * 0.12);
    return {
      x,
      y,
      insidePill: x >= br.left && x <= br.right && y >= br.top && y <= br.bottom,
      onScreen: y >= 0 && y <= innerHeight,
    };
  });
  if (!pt || !pt.onScreen) {
    console.log(`SKIP ${name}: no on-screen upsell`);
    await c.close();
    await b.close();
    continue;
  }
  await p.touchscreen.tap(pt.x, pt.y);
  const opened = await p
    .locator(".report-pricing-modal__dialog")
    .waitFor({ state: "visible", timeout: 12000 })
    .then(() => true)
    .catch(() => false);
  console.log(
    `${opened ? "PASS" : "FAIL"} ${name.padEnd(18)} tapped (${pt.x},${pt.y}) insidePaintedPill=${pt.insidePill} -> pricing modal ${opened ? "OPENED" : "did NOT open"}`
  );
  await c.close();
  await b.close();
}
