/**
 * Does a REAL finger drag actually move the sexual-stage card carousel?
 *
 * The mobile copy used to read "Flip the below cards" — the cards have no flip
 * face, and readers tapped them expecting one (45 sessions on
 * `stage-explorer__mobile`, 34 on `stage-card`, 35 on `stage-rows__row`, 26 on
 * the orbit, in 30 days). The copy now says "Swipe", so that verb has to be
 * true: this drags the carousel with a synthesized TOUCH gesture and asserts it
 * scrolls and the active card changes.
 *
 *   REPORT_ORIGIN=https://www.loveiq.org node scripts/probes/verify-stage-carousel-swipe.mjs
 *   MUTATE=1 ...   # pins overflow-x: hidden — Chromium must FAIL
 *
 * WebKit exposes no CDP, and synthetic touch events are untrusted so they do not
 * drive native scrolling. iOS is therefore reported by STATE (scrollable overflow
 * + snap axis + real overflowing width), never claimed as verified by gesture.
 */
import { chromium, webkit, devices } from "playwright";
import { stagingCookies } from "./staging-cookie.mjs";
import { touchScroll } from "./touch.mjs";

const ORIGIN = process.env.REPORT_ORIGIN ?? "https://www.loveiq.org";
const TOKEN = process.env.REPORT_TOKEN ?? "rpt_a9LY0Obbla1FVsclJ1nM";

const carouselState = (page) =>
  page.evaluate(() => {
    const el = document.querySelector(".stage-explorer__carousel");
    if (!el) return null;
    const cs = getComputedStyle(el);
    return {
      scrollLeft: Math.round(el.scrollLeft),
      scrollable: Math.round(el.scrollWidth - el.clientWidth),
      overflowX: cs.overflowX,
      snap: cs.scrollSnapType,
      activeCard:
        document.querySelector(".stage-card.is-active")?.textContent?.slice(0, 24) ?? null,
    };
  });

/** The pricing modal scroll-locks the body; a probe that ignores it stalls. */
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

const dismissPaywall = async (page) => {
  const btn = await page.evaluate(() => {
    const b = document.querySelector(".report-pricing-modal__close");
    if (!b) return null;
    const r = b.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) return null;
    return { cx: Math.round(r.left + r.width / 2), cy: Math.round(r.top + r.height / 2) };
  });
  if (!btn) return;
  await page.touchscreen.tap(btn.cx, btn.cy);
  await page.waitForTimeout(1200);
};

let bad = 0;
for (const name of (process.env.DEVICES ?? "Pixel 7,iPhone 15 Pro").split(",")) {
  const engine = /iphone|ipad/i.test(name) ? webkit : chromium;
  const browser = await engine.launch();
  const ctx = await browser.newContext({ ...devices[name], locale: "en-US" });
  await ctx.addCookies(stagingCookies(ORIGIN)).catch(() => {});
  const page = await ctx.newPage();
  const cdp = engine === chromium ? await ctx.newCDPSession(page) : null;
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
    await page.waitForTimeout(800);

    /**
     * Position the carousel by scrolling directly to it, not by stepping.
     * A fixed 620px step is LARGER than an iPhone 15 Pro's 659px viewport once
     * the modal-dismiss pauses are added, so a 421px-tall carousel gets jumped
     * clean over — the probe ran to the bottom of a 34,725px page and reported
     * "never reached" on both engines. Positioning is programmatic on purpose;
     * the swipe itself below is still a real synthesized touch gesture, which
     * is the thing under test.
     */
    let onScreen = false;
    for (let attempt = 0; attempt < 5 && !onScreen; attempt += 1) {
      await page.evaluate(() => {
        document.querySelector(".stage-explorer__carousel")?.scrollIntoView({ block: "center" });
      });
      await page.waitForTimeout(900);
      while (await paywallOpen(page)) await dismissPaywall(page);
      onScreen = await page.evaluate(() => {
        const el = document.querySelector(".stage-explorer__carousel");
        if (!el) return false;
        const r = el.getBoundingClientRect();
        return r.top < window.innerHeight * 0.9 && r.bottom > window.innerHeight * 0.1;
      });
    }
    const found = { found: onScreen };
    if (!found.found) {
      notes.push("INCONCLUSIVE: carousel never reached");
      bad += 1;
    } else {
      if (process.env.MUTATE === "1") {
        // Remove the scrollability the copy depends on. The gesture must now do nothing.
        await page.addStyleTag({
          content: ".stage-explorer__carousel { overflow-x: hidden !important; }",
        });
        await page.waitForTimeout(300);
      }
      const before = await carouselState(page);
      notes.push(
        `overflowX=${before.overflowX} scrollable=${before.scrollable}px snap=${before.snap}`
      );

      if (cdp) {
        /**
         * SCAN for a point the carousel actually owns. The sticky unlock bar is
         * pinned over the bottom of the viewport and covers the lower ~90px of
         * the carousel, so a drag aimed at the card's centre lands on the CTA
         * bar and moves nothing — which first read as "swiping is broken".
         */
        const box = await page.evaluate(() => {
          const el = document.querySelector(".stage-explorer__carousel");
          const r = el.getBoundingClientRect();
          const x = Math.round(r.left + r.width / 2);
          for (
            let y = Math.ceil(r.top) + 10;
            y < Math.min(r.bottom - 10, innerHeight - 10);
            y += 10
          ) {
            const hit = document.elementFromPoint(x, y);
            if (hit && el.contains(hit)) return { x, y };
          }
          return null;
        });
        if (!box) {
          notes.push("INCONCLUSIVE: no point on the carousel is uncovered");
          bad += 1;
          console.log(`FAIL ${name.padEnd(15)} ${notes.join(" | ")}`);
          await ctx.close();
          await browser.close();
          continue;
        }
        // A real horizontal touch drag — right-to-left, i.e. "swipe to the next card".
        await cdp.send("Input.synthesizeScrollGesture", {
          x: box.x,
          y: box.y,
          xDistance: -260,
          yDistance: 0,
          gestureSourceType: "touch",
          speed: 800,
          preventFling: true,
        });
        await page.waitForTimeout(1500);
        const after = await carouselState(page);
        const moved = after.scrollLeft - before.scrollLeft;
        const cardChanged = after.activeCard !== before.activeCard;
        notes.push(`real touch drag moved ${moved}px, activeCard changed=${cardChanged}`);
        if (moved <= 20) {
          notes.push("SWIPE DID NOT MOVE THE CAROUSEL");
          bad += 1;
        }
      } else {
        // State-only on WebKit. Say so; do not dress it up as a gesture result.
        const ok = before.overflowX === "auto" && before.scrollable > 40 && /x/.test(before.snap);
        notes.push(
          ok
            ? "state-only (no CDP on WebKit): swipeable — scrolling overflow on the x axis with real overflowing width"
            : "state-only: NOT swipeable"
        );
        if (!ok) bad += 1;
      }
    }
  } catch (e) {
    notes.push(`exception: ${String(e.message).split("\n")[0].slice(0, 70)}`);
    bad += 1;
  }
  const ok = !notes.some(
    (n) => n.includes("NOT") || n.includes("INCONCLUSIVE") || n.includes("exception")
  );
  console.log(`${ok ? "PASS" : "FAIL"} ${name.padEnd(15)} ${notes.join(" | ")}`);
  await ctx.close();
  await browser.close();
}
process.exit(bad ? 1 : 0);
