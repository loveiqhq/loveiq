/**
 * Two tap-reachability fixes, measured rather than eyeballed:
 *
 * 1. The sticky unlock CTA paints at 126x34 — under the 44px (Apple HIG) /
 *    48dp (Material) minimum. A `::after` hit-area expansion makes it tappable
 *    over 44px WITHOUT changing the painted pill, so the box is unchanged and
 *    only a hit test can see the difference.
 *
 * 2. `.report-findings__upsell` is `position:absolute; inset:0` over the whole
 *    blurred block (334x238 on a Pixel 7) with one 235x41 button in the middle:
 *    88% of it swallowed taps. PostHog logged 39 Android + 26 iOS dead clicks on
 *    that exact selector in 90 days. A stretched hit area routes the whole block
 *    to the unlock button.
 */
import { chromium, webkit, devices } from "playwright";
import { stagingCookies } from "./staging-cookie.mjs";
import { hitAreaHeight, touchScroll } from "./touch.mjs";

/**
 * Production by default, like every sibling probe. A localhost default means a
 * probe run without env does not fail honestly — it crashes on a refused
 * connection, and an uncaught throw exits 1, which the verifier reads as
 * "reproduced". `verify-consent-return.mjs` had the same shape and had never
 * once checked production.
 */
const ORIGIN = process.env.REPORT_ORIGIN ?? "https://www.loveiq.org";
const TOKEN = process.env.QA_TOKEN_LOCKED ?? "rpt_a9LY0Obbla1FVsclJ1nM";
const CASES = (
  process.env.DEVICES ?? "Pixel 7,Galaxy S5,Pixel 9,iPhone SE,iPhone 15 Pro,iPhone 17 Pro Max"
).split(",");

const rows = [];
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

  /**
   * Everything that touches the network is inside the try. An uncaught throw
   * here exits 1, and 1 means "the defect reproduced" — so a timeout or a
   * refused connection would have reported an untappable unlock button that
   * nobody measured, on a criterion allowed to open a pull request. The stdout
   * backstop in verify-ux-findings.mjs does not save it either: a Playwright
   * stack says "net::ERR_CONNECTION_REFUSED", which matches neither
   * "INCONCLUSIVE" nor "exception:".
   */
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
    // Tap-target size is independent of the consent banner; dismiss it first so a
    // covered CTA cannot be mistaken for a small one.
    await page
      .locator(".cky-btn-accept")
      .first()
      .click({ timeout: 8000 })
      .catch(() => {});
    await page.waitForTimeout(1200);
    for (let i = 0; i < 12; i += 1) await touchScroll(cdp, page, 600, { settle: 120 });
    await page.waitForTimeout(1000);

    const sticky = await hitAreaHeight(page, ".report-sticky-unlock__cta--mobile");

    // Tap the corner of the locked block — the region that used to do nothing.
    await page.evaluate(() =>
      document.querySelector(".report-findings__upsell")?.scrollIntoView({ block: "center" })
    );
    await page.waitForTimeout(1200);
    const upsell = await page.evaluate(() => {
      const w = document.querySelector(".report-findings__upsell");
      if (!w) return null;
      const r = w.getBoundingClientRect();
      const btn = w.querySelector(".report-findings__unlock");
      const br = btn?.getBoundingClientRect();
      // Sample a 5x5 lattice across the whole overlay, not one corner: a single
      // probe point can land inside the painted button by luck and pass on an
      // engine where the fix does not actually apply.
      let hits = 0;
      let total = 0;
      const misses = new Set();
      for (let iy = 0; iy < 5; iy += 1) {
        for (let ix = 0; ix < 5; ix += 1) {
          const x = Math.round(r.left + r.width * (0.1 + 0.2 * ix));
          const y = Math.round(r.top + r.height * (0.1 + 0.2 * iy));
          if (y < 0 || y > window.innerHeight) continue;
          total += 1;
          const t = document.elementFromPoint(x, y);
          // The wrapper carries the handler, so it counts as reachable too.
          if (t && (t === btn || btn?.contains(t) || t === w || w.contains(t))) hits += 1;
          else misses.add(t ? `${t.tagName}.${String(t.className || "").split(" ")[0]}` : "null");
        }
      }
      return {
        wrapper: { w: Math.round(r.width), h: Math.round(r.height) },
        button: br ? { w: Math.round(br.width), h: Math.round(br.height) } : null,
        hits,
        total,
        reachesButton: total > 0 && hits === total,
        topEl: misses.size ? [...misses].join(",") : "all reach the unlock affordance",
      };
    });

    rows.push({ name, sticky, upsell });
    const stickyOk = sticky && sticky.hit >= 44;
    const upsellOk = !upsell || upsell.reachesButton;
    console.log(
      `${stickyOk && upsellOk ? "PASS" : "FAIL"} ${name.padEnd(20)} sticky painted=${sticky?.box}px tappable=${sticky?.hit}px | ` +
        `locked block ${upsell ? `${upsell.hits}/${upsell.total} points tappable` : "(absent)"}` +
        (upsell && !upsell.reachesButton ? ` misses=${upsell.topEl}` : "")
    );
  } catch (err) {
    const why = String(err.message).split("\n")[0].slice(0, 70);
    rows.push({ name, failed: why });
    console.log(`INCONCLUSIVE ${name.padEnd(20)} ${why}`);
  } finally {
    await ctx.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

/**
 * Exit 0 clean · 1 the target is too small · 3 could not measure.
 *
 * A device with NO sticky bar has not told us the CTA is too small — it has
 * told us the report did not render. That used to count as a failure, and D1 is
 * one of the three criteria allowed to open a pull request, so a slow build
 * could have filed one claiming an untappable button nobody ever measured.
 */
const unmeasured = rows.filter((r) => r.failed || !r.sticky);
const measured = rows.filter((r) => !r.failed && r.sticky);
const bad = measured.filter((r) => r.sticky.hit < 44 || (r.upsell && !r.upsell.reachesButton));

console.log(
  `\n${measured.length - bad.length}/${measured.length} measured devices: unlock CTA tappable over >=44px AND the locked block routes taps to unlock`
);
if (bad.length) console.log("still short:", bad.map((r) => r.name).join(", "));

if (bad.length) process.exit(1);
if (unmeasured.length) {
  console.log(
    `INCONCLUSIVE (${unmeasured.length}) — nothing measured on ${unmeasured
      .map((r) => `${r.name}${r.failed ? ` (${r.failed})` : " (no sticky unlock bar)"}`)
      .join(", ")}`
  );
  process.exit(3);
}
process.exit(0);
