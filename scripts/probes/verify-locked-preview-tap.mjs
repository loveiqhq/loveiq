/**
 * Does tapping a BLURRED LOCKED PREVIEW open that chapter's paywall?
 *
 * The previews are build-time rasters of the real chapter, so they read as
 * content; on production 16 sessions tapped one and got nothing. In several
 * chapters the paywall card is not adjacent to the preview at all, so the
 * overlay's own handler never sees the tap.
 *
 *   REPORT_ORIGIN=http://localhost:3000 node scripts/probes/verify-locked-preview-tap.mjs
 *   MUTATE=1 ... # must FAIL on every device, or this probe proves nothing
 */
import { chromium, webkit, devices } from "playwright";
import { stagingCookies } from "./staging-cookie.mjs";
import { touchScroll } from "./touch.mjs";

const ORIGIN = process.env.REPORT_ORIGIN ?? "http://localhost:3000";
const TOKEN = process.env.REPORT_TOKEN ?? "rpt_a9LY0Obbla1FVsclJ1nM";

const paywallOpen = (page) =>
  page.evaluate(() => {
    const d = document.querySelector(".report-pricing-modal__dialog");
    if (!d) return false;
    const cs = getComputedStyle(d);
    return (
      cs.visibility !== "hidden" &&
      parseFloat(cs.opacity) > 0.05 &&
      d.getBoundingClientRect().height > 20
    );
  });

/** Close by COORDINATE tap — `locator.click()` can drive a hidden duplicate. */
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
  await page.waitForTimeout(1200);
  return !(await paywallOpen(page));
};

let bad = 0;
for (const name of (process.env.DEVICES ?? "Pixel 7,iPhone 15 Pro,iPhone SE").split(",")) {
  const engine = /iphone|ipad/i.test(name) ? webkit : chromium;
  const browser = await engine.launch();
  const ctx = await browser.newContext({ ...devices[name], locale: "en-US" });
  await ctx.addCookies(stagingCookies(ORIGIN)).catch(() => {});
  const page = await ctx.newPage();
  const cdp = engine === chromium ? await ctx.newCDPSession(page) : null;
  await page.route("**/api/stripe/checkout-session", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: '{"enabled":false}' })
  );
  /**
   * MUTATION MODE: swallow clicks on a locked preview before React's delegated
   * handler sees them — the app as it behaved BEFORE this fix. Every device
   * must FAIL under this flag.
   */
  if (process.env.MUTATE === "1") {
    await page.addInitScript(() => {
      addEventListener(
        "click",
        (e) => {
          const t = e.target;
          if (t instanceof Element && t.closest(".report-locked-preview")) {
            e.stopImmediatePropagation();
          }
        },
        true
      );
    });
  }
  const notes = [];
  try {
    await page.goto(`${ORIGIN}/report/${TOKEN}`, {
      waitUntil: "domcontentloaded",
      timeout: 120_000,
    });
    await page
      .waitForSelector(".report-status-card__spinner", { state: "detached", timeout: 120_000 })
      .catch(() => {});
    await page.waitForTimeout(2500);
    await page
      .locator(".cky-btn-accept")
      .first()
      .click({ timeout: 8000 })
      .catch(() => {});
    await page.waitForTimeout(1000);

    /**
     * Hunt for an EXPOSED preview. Most locked previews sit directly under the
     * paywall card, which covers them completely — `elementFromPoint` returns
     * the overlay, and that case is already handled by the overlay's own
     * handler. The ones this fix is about are the previews with no card on top
     * of them (the teased Accelerators columns, for instance), so scroll and
     * hit-test every preview in view until one is actually reachable.
     */
    let pt = null;
    for (let i = 0; i < 70 && !pt; i += 1) {
      await touchScroll(cdp, page, 520, { settle: 100 });
      while (await paywallOpen(page)) await dismissPaywall(page);
      pt = await page.evaluate(() => {
        for (const el of document.querySelectorAll(".report-locked-preview")) {
          const b = el.getBoundingClientRect();
          if (b.bottom < 8 || b.top > innerHeight - 8 || b.height < 12) continue;
          const cx = Math.round(b.left + b.width / 2);
          const lo = Math.max(Math.ceil(b.top) + 4, 8);
          const hi = Math.min(Math.floor(b.bottom) - 4, innerHeight - 8);
          for (let cy = lo; cy <= hi; cy += 5) {
            const hit = document.elementFromPoint(cx, cy);
            if (hit && el.contains(hit)) {
              return { cx, cy, hitClass: String(hit.className || "").slice(0, 40) };
            }
          }
        }
        return null;
      });
    }
    if (!pt) {
      notes.push("INCONCLUSIVE: no exposed locked preview found");
      bad += 1;
    } else {
      /**
       * Assert the CTA FORWARD, not "a modal appeared".
       *
       * The scroll-triggered paywall opens on its own a second or two after
       * scrolling stops, so "the modal is open after I tapped" proves nothing —
       * an earlier version of this probe went green on all three devices with
       * the handler suppressed. What the fix actually does is forward a tap on
       * a locked preview to that chapter's paywall CTA, so count CTA clicks.
       * Nothing else in the page clicks a CTA on its own.
       */
      await page.evaluate(() => {
        window.__ctaClicks = 0;
        for (const b of document.querySelectorAll(".report-premium-overlay__cta")) {
          b.addEventListener("click", () => (window.__ctaClicks += 1), true);
        }
      });
      // Clear the modal so the tap reaches the preview rather than the dialog.
      while (await paywallOpen(page)) await dismissPaywall(page);
      const stillThere = await page.evaluate(
        ([x, y]) => {
          const el = document.elementFromPoint(x, y);
          return !!el?.closest(".report-locked-preview");
        },
        [pt.cx, pt.cy]
      );
      if (!stillThere) {
        notes.push("INCONCLUSIVE: preview no longer under the probe point");
        bad += 1;
      } else {
        notes.push(`tapped preview, hit=${pt.hitClass}`);
        await page.touchscreen.tap(pt.cx, pt.cy);
        await page.waitForTimeout(1200);
        const clicks = await page.evaluate(() => window.__ctaClicks ?? 0);
        notes.push(clicks > 0 ? "forwarded to paywall CTA" : "CTA never clicked");
        if (!clicks) bad += 1;
      }
    }
  } catch (e) {
    notes.push(`exception: ${String(e.message).split("\n")[0].slice(0, 70)}`);
    bad += 1;
  }
  const ok = notes.includes("forwarded to paywall CTA");
  console.log(`${ok ? "PASS" : "FAIL"} ${name.padEnd(16)} ${notes.join(" | ")}`);
  await ctx.close();
  await browser.close();
}
console.log(`\n${3 - bad}/3 devices: tapping a locked preview opens pricing`);
process.exit(bad ? 1 : 0);
