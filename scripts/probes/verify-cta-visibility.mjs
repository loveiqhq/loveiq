/**
 * Is the primary call to action actually obvious — without scrolling?
 *
 * Criterion from Marcus's list, 2026-09-15: "CTA visibility — whether
 * 'Continue', 'See results', or 'Unlock report' is immediately obvious."
 *
 * That reads like a question for a model watching a video. It is not. Every
 * part of it is measurable: is the control inside the first viewport, does a
 * tap at its centre actually reach it, and is it big enough to hit. A probe
 * answers those the same way every time; a model scoring 0.20 on defects it can
 * literally see would be guessing.
 *
 *   node scripts/probes/verify-cta-visibility.mjs
 *   MUTATE=1 node scripts/probes/verify-cta-visibility.mjs   # must FAIL
 *
 * Exit codes: 0 clean · 1 a CTA is not reachable · 3 could not measure.
 */
import { chromium, webkit, devices } from "playwright";
import { stagingCookies } from "./staging-cookie.mjs";

const ORIGIN = process.env.REPORT_ORIGIN ?? "https://www.loveiq.org";
const TOKEN = process.env.QA_TOKEN_LOCKED ?? "rpt_a9LY0Obbla1FVsclJ1nM";
/** Apple HIG 44pt / Material 48dp. 44 is the lower of the two. */
const MIN_TAP_PX = 44;

let bad = 0;
let unmeasured = 0;

/**
 * Measure a control the way a thumb meets it: is it on screen, does a tap at
 * its centre land on it, and is it big enough.
 *
 * Ownership is `el === n || n.contains(el)`. The reverse counts ANCESTORS,
 * which once inflated a 34px control to "61px tappable".
 */
const measure = (page, selector) =>
  page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return { found: true, painted: false };
    const cx = Math.round(r.left + r.width / 2);
    const cy = Math.round(r.top + r.height / 2);
    const hit = document.elementFromPoint(cx, cy);
    const cs = getComputedStyle(el);
    return {
      found: true,
      painted: cs.visibility !== "hidden" && parseFloat(cs.opacity) > 0.05,
      // "Immediately obvious" means without scrolling: fully inside the first
      // screen, not merely intersecting it.
      inFirstViewport: r.top >= 0 && r.bottom <= window.innerHeight,
      topPx: Math.round(r.top),
      viewportH: window.innerHeight,
      height: Math.round(r.height),
      width: Math.round(r.width),
      reachable: Boolean(hit && (hit === el || el.contains(hit))),
      coveredBy: hit && !(hit === el || el.contains(hit)) ? hit.className || hit.tagName : null,
    };
  }, selector);

for (const name of (process.env.DEVICES ?? "Pixel 7,iPhone 15 Pro").split(",")) {
  const engine = /iphone|ipad/i.test(name) ? webkit : chromium;
  const browser = await engine.launch();
  const ctx = await browser.newContext({ ...devices[name], locale: "en-US" });
  await ctx.addCookies(stagingCookies(ORIGIN)).catch(() => {});
  const page = await ctx.newPage();
  const notes = [];

  try {
    if (process.env.MUTATE === "1") {
      /**
       * Push the CTA off the first screen — precisely the defect.
       *
       * It has to move the STICKY BAR, not the button. The first version set
       * marginTop on the button itself and changed nothing, because the bar is
       * position:fixed and a margin inside it cannot leave the viewport. The
       * probe passed under mutation and therefore proved nothing.
       */
      await page.addInitScript(() => {
        const push = () => {
          const bar = document.querySelector(".report-sticky-unlock");
          if (bar) {
            bar.style.position = "absolute";
            bar.style.top = "9000px";
            bar.style.bottom = "auto";
          }
        };
        setInterval(push, 150);
      });
    }

    await page.goto(`${ORIGIN}/report/${TOKEN}`, {
      waitUntil: "domcontentloaded",
      timeout: 90_000,
    });
    // The report is client-rendered: a fixed wait measures the loading screen.
    await page
      .waitForFunction(() => document.body.innerText.length > 2000, { timeout: 60_000 })
      .catch(() => {});
    await page
      .locator(".cky-btn-accept")
      .first()
      .click({ timeout: 6000 })
      .catch(() => {});
    await page.waitForTimeout(1200);

    const m = await measure(page, ".report-sticky-unlock__cta");
    if (!m || !m.found) {
      notes.push("INCONCLUSIVE: no unlock CTA on the page");
      unmeasured += 1;
    } else if (!m.painted) {
      notes.push("INCONCLUSIVE: unlock CTA present but not painted");
      unmeasured += 1;
    } else {
      const problems = [];
      if (!m.inFirstViewport)
        problems.push(`off the first screen (top ${m.topPx} of ${m.viewportH})`);
      // Only report a cover when something is actually on top. An off-screen
      // element makes elementFromPoint return null, which printed the useless
      // "covered by null" alongside the real reason.
      if (!m.reachable && m.coveredBy) {
        problems.push(`covered by ${String(m.coveredBy).slice(0, 40)}`);
      } else if (!m.reachable && m.inFirstViewport) {
        problems.push("a tap at its centre does not reach it");
      }
      if (m.height < MIN_TAP_PX) problems.push(`only ${m.height}px tall`);
      if (problems.length > 0) {
        notes.push(`unlock CTA: ${problems.join(" · ")}`);
        bad += 1;
      } else {
        notes.push(`unlock CTA ok (${m.width}x${m.height} at ${m.topPx}px)`);
      }
    }
  } catch (e) {
    notes.push(`exception: ${String(e.message).split("\n")[0].slice(0, 70)}`);
    unmeasured += 1;
  }

  console.log(`${name.padEnd(16)} ${notes.join(" | ")}`);
  await ctx.close();
  await browser.close();
}

if (bad > 0) {
  console.log(`\nFAIL (${bad}) — the primary CTA is not immediately usable`);
  process.exit(1);
}
if (unmeasured > 0) {
  console.log(`\nINCONCLUSIVE (${unmeasured}) — could not measure, not a pass`);
  process.exit(3);
}
console.log("\nPASS");
process.exit(0);
