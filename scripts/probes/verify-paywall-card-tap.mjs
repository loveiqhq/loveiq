/**
 * The paywall card only responded on its button; readers tapped the card. 48
 * dead taps across the overlay, its card, offer row and feature rows.
 *
 * Taps the card body well clear of the CTA and requires the pricing modal, and
 * checks the desktop affordance separately since a cursor does not exist on
 * touch.
 */
import { chromium, webkit, devices } from "playwright";
import { stagingCookies } from "./staging-cookie.mjs";
import { touchScroll } from "./touch.mjs";

const ORIGIN = process.env.REPORT_ORIGIN ?? "https://www.loveiq.org";
const TOKEN = process.env.QA_TOKEN_LOCKED ?? "rpt_a9LY0Obbla1FVsclJ1nM";
let bad = 0;

/**
 * The dialog node is ALWAYS mounted — one node, hidden with `visibility` and
 * opacity when shut. So `!!querySelector(".report-pricing-modal__dialog")` is
 * true whether the paywall is open or closed, and a probe built on it reports
 * "appeared" instantly and "would not stay shut" forever. Measure what a reader
 * can actually see.
 */
const paywallOpen = (page) =>
  page.evaluate(() => {
    const d = document.querySelector(".report-pricing-modal__dialog");
    if (!d) return false;
    const cs = getComputedStyle(d);
    const r = d.getBoundingClientRect();
    return cs.visibility !== "hidden" && parseFloat(cs.opacity) > 0.05 && r.height > 20;
  });

/** Tap the modal's close button by COORDINATES and report whether it shut. */
const dismissPaywall = async (page) => {
  const btn = await page.evaluate(() => {
    const b = document.querySelector(".report-pricing-modal__close");
    if (!b) return null;
    const r = b.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) return null;
    return { cx: Math.round(r.left + r.width / 2), cy: Math.round(r.top + r.height / 2) };
  });
  if (!btn) return false;
  await page.touchscreen.tap(btn.cx, btn.cy);
  await page.waitForTimeout(1400);
  return !(await paywallOpen(page));
};

for (const name of (process.env.DEVICES ?? "Pixel 7,iPhone 15 Pro,iPhone SE").split(",")) {
  const engine = /iphone|ipad/i.test(name) ? webkit : chromium;
  const browser = await engine.launch();
  const ctx = await browser.newContext({ ...devices[name], locale: "en-US" });
  await ctx.addCookies(stagingCookies(ORIGIN)).catch(() => {});
  const page = await ctx.newPage();
  const cdp = engine === chromium ? await ctx.newCDPSession(page) : null;
  /**
   * MUTATION MODE. A probe that cannot fail proves nothing. With MUTATE=1 a
   * capture-phase listener swallows clicks on the overlay before React's
   * delegated handler sees them — the app as it behaved BEFORE the card body
   * was made tappable. Every device must FAIL under this flag; a device that
   * still passes means the probe is measuring something other than the fix.
   */
  if (process.env.MUTATE === "1") {
    await page.addInitScript(() => {
      addEventListener(
        "click",
        (e) => {
          const t = e.target;
          if (t instanceof Element && t.closest(".report-premium-overlay")) {
            e.stopImmediatePropagation();
          }
        },
        true
      );
    });
  }
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
    await page.waitForTimeout(1200);

    /**
     * Scroll like a reader until the scroll-triggered paywall opens on its own,
     * close it ONCE, then tap without scrolling again. Calling `scrollIntoView`
     * to find the card re-fires that trigger and the modal re-opens under the
     * probe, which is what made an earlier run report a false failure.
     */
    let appeared = false;
    for (let i = 0; i < 45 && !appeared; i += 1) {
      await touchScroll(cdp, page, 620, { settle: 110 });
      appeared = await paywallOpen(page);
    }
    if (appeared) {
      /**
       * Close by TAPPING COORDINATES, not `locator.click()`. A locator click
       * bypasses hit-testing and can target a hidden duplicate of the close
       * button, so the modal stays open while the probe believes it clicked.
       */
      const btn = await page.evaluate(() => {
        const b = document.querySelector(".report-pricing-modal__close");
        if (!b) return null;
        const r = b.getBoundingClientRect();
        if (r.width < 4 || r.height < 4) return null;
        return {
          cx: Math.round(r.left + r.width / 2),
          cy: Math.round(r.top + r.height / 2),
        };
      });
      if (btn) await page.touchscreen.tap(btn.cx, btn.cy);
      await page.waitForTimeout(1400);
    }
    const shut = !(await paywallOpen(page));
    if (!shut) {
      notes.push("INCONCLUSIVE: modal would not stay shut");
      bad += 1;
    } else {
      /**
       * Bring the locked card back on screen. Safe to scroll here: the
       * scroll-triggered paywall fires once per session and does NOT re-open
       * after it has been dismissed (proven by verify-paywall-closes.mjs), and
       * the assert below fails loudly if that ever stops being true.
       */
      await page.evaluate(() => {
        document
          .querySelector(".report-premium-overlay__card")
          ?.scrollIntoView({ block: "center" });
      });
      await page.waitForTimeout(1200);
      /**
       * Scrolling back to the card can re-arm the scroll-triggered paywall, so
       * dismiss it again rather than calling the run inconclusive — an earlier
       * version bailed here and reported a false failure on iPhone 15 Pro.
       */
      let reopened = 0;
      while ((await paywallOpen(page)) && reopened < 3) {
        reopened += 1;
        await dismissPaywall(page);
      }
      if (await paywallOpen(page)) {
        notes.push("INCONCLUSIVE: paywall would not stay shut near the card");
        bad += 1;
      } else {
        /**
         * Retry the scroll. While the modal is open the body is scroll-locked
         * (`overflow: hidden`), so a `scrollIntoView` issued before that lock
         * fully releases silently does nothing and the card stays off screen —
         * which made this probe fail on iPhone 15 Pro roughly one run in two.
         */
        let pt = null;
        for (let attempt = 0; attempt < 4 && !pt?.onScreen; attempt += 1) {
          await page.evaluate(() => {
            document
              .querySelector(".report-premium-overlay__card")
              ?.scrollIntoView({ block: "center" });
          });
          await page.waitForTimeout(900);
          while (await paywallOpen(page)) await dismissPaywall(page);
          const found = await page.evaluate(() => {
            const card = document.querySelector(".report-premium-overlay__card");
            const ov = document.querySelector(".report-premium-overlay");
            if (!card || !ov) return null;
            const b = card.getBoundingClientRect();
            const cta = card.querySelector(".report-premium-overlay__cta");
            const cx = Math.round(b.left + b.width / 2);
            /**
             * SCAN for a tappable point instead of assuming one. A fixed offset
             * from the card's top is wrong twice over: on a short viewport the card
             * is taller than the screen, and the sticky chapter-pill nav sits ON TOP
             * of the card, so the probe tapped the nav and called the app broken.
             * Only a point whose elementFromPoint is really inside the overlay and
             * outside the CTA tests what we claim to be testing.
             */
            const lo = Math.max(Math.ceil(b.top) + 12, 8);
            const hi = Math.min(Math.floor(b.bottom) - 12, innerHeight - 8);
            for (let cy = lo; cy <= hi; cy += 8) {
              const hit = document.elementFromPoint(cx, cy);
              if (!hit || !ov.contains(hit)) continue;
              if (cta && cta.contains(hit)) continue;
              return {
                cx,
                cy,
                onScreen: true,
                insideCta: false,
                cursor: getComputedStyle(ov).cursor,
                hitClass: String(hit.className || "").slice(0, 36),
              };
            }
            return { onScreen: false };
          });

          pt = found;
        }
        if (!pt || !pt.onScreen) {
          notes.push("INCONCLUSIVE: card not on screen after the paywall closed");
          bad += 1;
        } else if (pt.insideCta) {
          notes.push("INCONCLUSIVE: probe point landed on the CTA");
          bad += 1;
        } else {
          notes.push(`cursor=${pt.cursor}`, `tapped card body, hit=${pt.hitClass}`);
          await page.touchscreen.tap(pt.cx, pt.cy);
          let opened = false;
          for (let w = 0; w < 24 && !opened; w += 1) {
            await page.waitForTimeout(500);
            opened = await paywallOpen(page);
          }
          notes.push(opened ? "paywall OPENED" : "paywall did NOT open");
          if (!opened) bad += 1;
        }
      }
    }
  } catch (e) {
    notes.push(`exception: ${String(e.message).split("\n")[0].slice(0, 60)}`);
    bad += 1;
  }
  console.log(
    `${notes.some((n) => n === "paywall OPENED") ? "PASS" : "FAIL"} ${name.padEnd(15)} ${notes.join(" | ")}`
  );
  await ctx.close();
  await browser.close();
}
console.log(
  `\n${(process.env.DEVICES ?? "Pixel 7,iPhone 15 Pro,iPhone SE").split(",").length - bad}/3 devices: tapping the paywall CARD opens pricing`
);
process.exitCode = bad ? 1 : 0;
