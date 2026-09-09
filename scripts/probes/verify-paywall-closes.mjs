/**
 * 14 dead clicks on `.report-pricing-modal__close` across 12 SESSIONS — the
 * widest spread of any dead click on the report. A ✕ that does not close reads
 * to a reader as "the paywall is stuck", which is how it would be reported.
 *
 * My own audit probes all needed a LOOP of 3-4 close attempts to clear this
 * modal, which is the clue: the scroll-triggered paywall may simply re-open.
 * So this taps ✕ exactly ONCE — the way a person does — and then watches for
 * two seconds to catch a re-open, rather than retrying until it sticks.
 */
import { chromium, webkit, devices } from "playwright";
import { stagingCookies } from "./staging-cookie.mjs";
import { touchScroll } from "./touch.mjs";

const ORIGIN = process.env.REPORT_ORIGIN ?? "https://www.loveiq.org";
const TOKEN = process.env.QA_TOKEN_LOCKED ?? "rpt_a9LY0Obbla1FVsclJ1nM";
const CASES = (process.env.DEVICES ?? "Pixel 7,iPhone 15 Pro,iPhone SE").split(",");

const open = (p) =>
  p.evaluate(() => {
    const d = document.querySelector(".report-pricing-modal__dialog");
    if (!d) return false;
    const r = d.getBoundingClientRect();
    return r.height > 20 && parseFloat(getComputedStyle(d).opacity) > 0.05;
  });

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
    await page.waitForTimeout(2200);
    await page
      .locator(".cky-btn-accept")
      .first()
      .click({ timeout: 8000 })
      .catch(() => {});
    await page.waitForTimeout(1000);

    // Scroll like a reader until the paywall shows up on its own.
    let appeared = false;
    for (let i = 0; i < 40 && !appeared; i += 1) {
      await touchScroll(cdp, page, 650, { settle: 130 });
      appeared = await open(page);
    }
    if (!appeared) {
      notes.push("INCONCLUSIVE: paywall never auto-opened while scrolling");
    } else {
      const btn = await page.evaluate(() => {
        const b = document.querySelector(".report-pricing-modal__close");
        if (!b) return null;
        const r = b.getBoundingClientRect();
        return {
          cx: Math.round(r.left + r.width / 2),
          cy: Math.round(r.top + r.height / 2),
          w: Math.round(r.width),
          h: Math.round(r.height),
        };
      });
      if (!btn) {
        notes.push("INCONCLUSIVE: no close button in an open modal");
      } else {
        notes.push(`close ${btn.w}x${btn.h}px`);
        // ONE tap, like a person. Then watch.
        await page.touchscreen.tap(btn.cx, btn.cy);
        await page.waitForTimeout(400);
        const closed400 = !(await open(page));
        await page.waitForTimeout(1800);
        const closed2s = !(await open(page));
        notes.push(`closed@400ms=${closed400}`, `still closed@2.2s=${closed2s}`);
        if (closed400 && !closed2s) notes.push("RE-OPENED BY ITSELF");
        // And does it come back the moment the reader scrolls on?
        if (closed2s) {
          await touchScroll(cdp, page, 700, { settle: 200 });
          await page.waitForTimeout(1200);
          notes.push(`reopens on next scroll=${await open(page)}`);
        }
      }
    }
  } catch (e) {
    notes.push(`exception: ${String(e.message).split("\n")[0].slice(0, 60)}`);
  }
  const ok = notes.some((n) => n.includes("still closed@2.2s=true"));
  console.log(`${ok ? "PASS" : "FAIL"} ${name.padEnd(14)} ${notes.join(" | ")}`);
  await ctx.close();
  await browser.close();
}
