/**
 * 16 dead clicks on `.report-practice-table__info-button` — a real <button>
 * with a real onClick. Something opens the popover and something else takes it
 * away, so reproduce it with a real finger rather than reasoning about the
 * handler list. Tap it, then look for the popover both immediately and after a
 * beat: a popover that appears and vanishes reads as "dead" to a user AND to
 * PostHog, and only the two-sample check can tell that apart from never
 * opening.
 */
import { chromium, webkit, devices } from "playwright";
import { stagingCookies } from "./staging-cookie.mjs";
import { touchScroll } from "./touch.mjs";

const ORIGIN = process.env.REPORT_ORIGIN ?? "https://www.loveiq.org";
const TOKEN = process.env.QA_TOKEN_LOCKED ?? "rpt_a9LY0Obbla1FVsclJ1nM";
const CASES = (process.env.DEVICES ?? "Pixel 7,iPhone 15 Pro,iPhone SE").split(",");

for (const name of CASES) {
  const engine = /iphone|ipad/i.test(name) ? "webkit" : "chromium";
  const browser = await (engine === "webkit" ? webkit : chromium).launch();
  const ctx = await browser.newContext({ ...devices[name], locale: "en-US" });
  await ctx.addCookies(stagingCookies(ORIGIN)).catch(() => {});
  const page = await ctx.newPage();
  const cdp = engine === "chromium" ? await ctx.newCDPSession(page) : null;
  await page.route("**/api/stripe/checkout-session", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: '{"enabled":false}' })
  );

  const notes = [];
  try {
    await page.goto(`${ORIGIN}/report/${TOKEN}`, {
      waitUntil: "domcontentloaded",
      timeout: 90_000,
    });
    await page
      .waitForSelector(".report-status-card__spinner", { state: "detached", timeout: 90_000 })
      .catch(() => {});
    await page.waitForTimeout(2500);
    await page
      .locator(".cky-btn-accept")
      .first()
      .click({ timeout: 8000 })
      .catch(() => {});
    await page.waitForTimeout(1000);

    // Scroll until an interactive info button is fully on screen.
    let pt = null;
    for (let i = 0; i < 70 && !pt; i += 1) {
      pt = await page.evaluate(() => {
        const b = [...document.querySelectorAll(".report-practice-table__info-button")].find(
          (n) => {
            const r = n.getBoundingClientRect();
            return r.width > 0 && r.top > 90 && r.bottom < innerHeight - 90;
          }
        );
        if (!b) {
          const any = document.querySelector(".report-practice-table__info-button");
          if (any) any.scrollIntoView({ block: "center" });
          return null;
        }
        const r = b.getBoundingClientRect();
        return {
          cx: Math.round(r.left + r.width / 2),
          cy: Math.round(r.top + r.height / 2),
          w: Math.round(r.width),
          h: Math.round(r.height),
        };
      });
      if (!pt) await touchScroll(cdp, page, 600, { settle: 90 });
    }
    if (!pt) {
      // An inconclusive run is a failure of the run, never a pass.
      notes.push("INCONCLUSIVE: no interactive info button reachable");
    } else {
      // Dismiss a scroll-triggered paywall — it swallows the tap and the
      // result would be meaningless.
      for (let k = 0; k < 3; k += 1) {
        if (!(await page.evaluate(() => !!document.querySelector(".report-pricing-modal__dialog"))))
          break;
        await page
          .locator(".report-pricing-modal__close")
          .first()
          .click({ timeout: 5000 })
          .catch(() => {});
        await page.waitForTimeout(700);
      }
      const seen = () =>
        page.evaluate(
          () =>
            !!document.querySelector(
              ".report-practice-table__popover, .report-practice-table__inline-popover"
            )
        );
      notes.push(`button ${pt.w}x${pt.h}px`, `popover before=${await seen()}`);
      await page.touchscreen.tap(pt.cx, pt.cy);
      await page.waitForTimeout(160);
      const immediate = await seen();
      await page.waitForTimeout(1400);
      const settled = await seen();
      const expanded = await page.evaluate(() =>
        document.querySelector(".report-practice-table__info-button[aria-expanded='true']")
          ? "yes"
          : "no"
      );
      notes.push(`popover @160ms=${immediate}`, `@1.5s=${settled}`, `aria-expanded=${expanded}`);
    }
  } catch (e) {
    notes.push(`exception: ${String(e.message).split("\n")[0].slice(0, 70)}`);
  }
  const ok = notes.some((n) => n.includes("@1.5s=true"));
  console.log(`${ok ? "PASS" : "FAIL"} ${name.padEnd(15)} ${notes.join(" | ")}`);
  await ctx.close();
  await browser.close();
}
