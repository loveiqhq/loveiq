/**
 * Does tapping the map row's TEXT open the paywall, with a real finger?
 *
 * 97 dead clicks landed on `.report-map-row` / `__learn-text` — the title and
 * "WHAT YOU'LL LEARN" copy that sit beside the pill CTA. On a locked section
 * that CTA is what opens the paywall, so each miss was a paywall open we never
 * got. Asserted here by tapping the TEXT, well clear of the pill, and requiring
 * the pricing modal to appear.
 */
import { chromium, webkit, devices } from "playwright";
import { stagingCookies } from "./staging-cookie.mjs";
import { touchScroll } from "./touch.mjs";

const ORIGIN = process.env.REPORT_ORIGIN ?? "http://localhost:3123";
const TOKEN = process.env.QA_TOKEN_LOCKED ?? "rpt_a9LY0Obbla1FVsclJ1nM";
const CASES = (process.env.DEVICES ?? "Pixel 7,Galaxy S5,iPhone SE,iPhone 15 Pro").split(",");

let bad = 0;
for (const name of CASES) {
  const d = name.toLowerCase();
  const engine = d.includes("iphone") || d.includes("ipad") ? "webkit" : "chromium";
  const browser = await (engine === "webkit" ? webkit : chromium).launch();
  const ctx = await browser.newContext({ ...devices[name], locale: "en-US" });
  await ctx.addCookies(stagingCookies(ORIGIN)).catch(() => {});
  const page = await ctx.newPage();
  await page.route("**/api/stripe/checkout-session", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ enabled: false, reason: "checkout_disabled", message: "stubbed" }),
    })
  );
  const cdp = engine === "chromium" ? await ctx.newCDPSession(page) : null;

  const notes = [];
  try {
    await page.goto(`${ORIGIN}/report/${TOKEN}`, {
      waitUntil: "domcontentloaded",
      timeout: 90_000,
    });
    await page
      .waitForSelector(".report-status-card__spinner", { state: "detached", timeout: 90_000 })
      .catch(() => {});
    await page
      .waitForFunction(
        () =>
          !document.querySelector(".report-status-screen") &&
          document.documentElement.scrollHeight > window.innerHeight * 1.5,
        undefined,
        { timeout: 90_000 }
      )
      .catch(() => {});
    await page.waitForTimeout(2000);
    await page
      .locator(".cky-btn-accept")
      .first()
      .click({ timeout: 8000 })
      .catch(() => {});
    await page.waitForTimeout(1000);

    // bring a map row on screen
    let found = false;
    for (let i = 0; i < 45 && !found; i += 1) {
      found = await page.evaluate(() => {
        const r = document.querySelector(".report-map-row");
        if (!r) return false;
        const b = r.getBoundingClientRect();
        if (b.top > 40 && b.bottom < window.innerHeight - 40) return true;
        r.scrollIntoView({ block: "center" });
        return false;
      });
      if (!found) await touchScroll(cdp, page, 500, { settle: 120 });
    }
    await page.waitForTimeout(900);

    // tap the LEARN TEXT, and confirm the point is outside the pill
    const pt = await page.evaluate(() => {
      const row = document.querySelector(".report-map-row");
      if (!row) return null;
      const text =
        row.querySelector(".report-map-row__learn-text") ??
        row.querySelector(".report-map-row__title");
      const cta = row.querySelector(".report-map-row__cta");
      if (!text) return null;
      const t = text.getBoundingClientRect();
      const c = cta?.getBoundingClientRect();
      const cx = Math.round(t.left + t.width / 2);
      const cy = Math.round(t.top + t.height / 2);
      const insidePill = !!c && cx >= c.left && cx <= c.right && cy >= c.top && cy <= c.bottom;
      return {
        cx,
        cy,
        insidePill,
        onScreen: cy > 0 && cy < window.innerHeight,
        ctaTag: cta?.tagName ?? null,
      };
    });
    if (!pt || !pt.onScreen) {
      // Counts as a failure of the RUN, not a pass — an inconclusive probe
      // must never be summarised as a green.
      notes.push("INCONCLUSIVE: could not bring a map row on screen");
      bad += 1;
    } else if (pt.insidePill) {
      notes.push("INCONCLUSIVE: probe point landed inside the pill");
      bad += 1;
    } else {
      await page.touchscreen.tap(pt.cx, pt.cy);
      const opened = await page
        .locator(".report-pricing-modal__dialog")
        .waitFor({ state: "visible", timeout: 12_000 })
        .then(() => true)
        .catch(() => false);
      notes.push(
        `ctaTag=${pt.ctaTag}`,
        `tapped text at (${pt.cx},${pt.cy}) outsidePill`,
        `paywall ${opened ? "OPENED" : "did NOT open"}`
      );
      if (!opened) bad += 1;
    }
  } catch (e) {
    notes.push(`exception: ${String(e.message).split("\n")[0].slice(0, 70)}`);
    bad += 1;
  }
  const ok = notes.some((n) => n.includes("OPENED"));
  console.log(`${ok ? "PASS" : "FAIL"} ${name.padEnd(16)} ${notes.join(" | ")}`);
  await ctx.close();
  await browser.close();
}
console.log(
  `\n${CASES.length - bad}/${CASES.length} devices: tapping the map row TEXT opens the paywall`
);
process.exitCode = bad ? 1 : 0;
