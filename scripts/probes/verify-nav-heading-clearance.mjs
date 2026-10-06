/**
 * Does the fixed chapter bar cover the report's first heading?
 *
 * Below 1280px wide the chapter bar is FIXED at 80–136px: phones, and tablets and
 * small laptops too (measured 2026-09-26: present at 768–1279, absent from 1280).
 * On a desktop device this measures at the reader's own width (WIDTHS, which the
 * verifier passes), because Playwright's "Desktop Chrome" is 1280 wide and has no
 * bar, so a reader's claim from a 1241px Chromebook could never be measured.
 * `.report-shell` is meant to
 * clear it, but a later unscoped `padding` shorthand resets its top padding to
 * 32px at every width, so the v1 welcome heading started at 112px and the bar
 * hid the top 24px of it — measured on production across all three devices.
 *
 *   REPORT_ORIGIN=https://www.loveiq.org node scripts/probes/verify-nav-heading-clearance.mjs
 *   V2=1 ...        # check report 2.0 (?v2=1) instead
 *   MUTATE=1 ...    # removes the clearance — every device must FAIL
 *
 * Exit 0 clean · 1 the bar covers the heading · 3 could not measure.
 *
 * The third code matters here more than anywhere. This probe finds the bar and
 * the heading by walking the DOM for text starting "Chapter:" and the first
 * visible h1/h2. When the report does not render — a slow build, an expired
 * token, a 500 — neither is found. That used to count as a FAILURE, so a report
 * that never loaded reported "the chapter bar covers the first heading", and
 * C1 is one of the three criteria allowed to open a pull request. Not finding
 * the thing you are measuring is not evidence that it is broken.
 */
import { chromium, webkit, devices } from "playwright";
import { stagingCookies } from "./staging-cookie.mjs";
const O = process.env.REPORT_ORIGIN ?? "https://www.loveiq.org",
  T = "rpt_a9LY0Obbla1FVsclJ1nM";
let bad = 0;
let unmeasured = 0;
const DEVICE_NAMES = (process.env.DEVICES ?? "Pixel 7,iPhone 15 Pro,iPhone SE")
  .split(",")
  .map((d) => d.trim())
  .filter(Boolean);
const readerWidth = Math.max(
  0,
  ...(process.env.WIDTHS ?? "").split(",").map(Number).filter(Number.isFinite)
);
for (const name of DEVICE_NAMES) {
  const engine = /iphone/i.test(name) ? webkit : chromium;
  const b = await engine.launch();
  const preset = devices[name];
  const atReaderWidth = preset && !preset.isMobile && readerWidth > 0;
  const c = await b.newContext({
    ...preset,
    ...(atReaderWidth ? { viewport: { ...preset.viewport, width: readerWidth } } : {}),
    locale: "en-US",
  });
  await c.addCookies(stagingCookies(O)).catch(() => {});
  const p = await c.newPage();
  /**
   * Everything that touches the network is inside the try. An uncaught throw
   * exits 1, and 1 means "the defect reproduced" — so a timeout or a refused
   * connection reported a defect nobody measured, on a criterion allowed to
   * open a pull request. Verified before the fix: REPORT_ORIGIN=http://localhost:1
   * exited 1. The stdout backstop in verify-ux-findings.mjs does not save it
   * either — a Playwright stack says "net::ERR_CONNECTION_REFUSED", which
   * matches neither "INCONCLUSIVE" nor "exception:".
   */
  try {
    await p.goto(`${O}/report/${T}${process.env.V2 ? "?v2=1" : ""}`, {
      waitUntil: "domcontentloaded",
      timeout: 120000,
    });
    await p
      .waitForSelector(".report-status-card__spinner", { state: "detached", timeout: 120000 })
      .catch(() => {});
    await p.waitForTimeout(3000);
    if (process.env.MUTATE === "1") {
      await p.addStyleTag({ content: ".report-section--welcome { padding-top: 0 !important; }" });
      await p.waitForTimeout(300);
    }
    const r = await p.evaluate(() => {
      const rect = (el) => {
        const b = el.getBoundingClientRect();
        return {
          t: Math.round(b.top),
          b: Math.round(b.bottom),
          l: Math.round(b.left),
          r: Math.round(b.right),
        };
      };
      // the sticky chapter selector and the first visible heading
      const nav = [...document.querySelectorAll("button,div,nav")].find(
        (e) =>
          /^\s*Chapter:/.test(e.textContent || "") &&
          e.getBoundingClientRect().height > 20 &&
          e.getBoundingClientRect().height < 120
      );
      const h = [...document.querySelectorAll("h1,h2")].find(
        (e) => e.getBoundingClientRect().height > 10
      );
      if (!nav || !h) return { found: false, nav: !!nav, h: !!h };
      const n = rect(nav),
        hh = rect(h);
      const overlapY = Math.min(n.b, hh.b) - Math.max(n.t, hh.t);
      const overlapX = Math.min(n.r, hh.r) - Math.max(n.l, hh.l);
      return {
        found: true,
        navRect: n,
        headingRect: hh,
        headingText: (h.textContent || "").trim().slice(0, 24),
        overlapPx: overlapY > 0 && overlapX > 0 ? overlapY : 0,
        navZ: getComputedStyle(nav).zIndex,
        navPos: getComputedStyle(nav).position,
        scrollY: Math.round(scrollY),
      };
    });
    if (!r.found) {
      unmeasured += 1;
      console.log(
        `INCONCLUSIVE ${name.padEnd(15)} ${r.nav ? "no heading" : "no chapter bar"} on screen — ` +
          `the report did not render, or this width has no bar (1280px and up), so nothing ` +
          `was measured`
      );
    } else if (r.overlapPx > 0) {
      bad += 1;
      console.log(
        `FAIL ${name.padEnd(15)} heading "${r.headingText}" top=${r.headingRect.t} ` +
          `| bar ends ${r.navRect.b} | covered by ${r.overlapPx}px`
      );
    } else {
      console.log(
        `PASS ${name.padEnd(15)} heading "${r.headingText}" top=${r.headingRect.t} ` +
          `| bar ends ${r.navRect.b} | covered by 0px`
      );
    }
  } catch (err) {
    unmeasured += 1;
    console.log(
      `INCONCLUSIVE ${name.padEnd(15)} ${String(err.message).split("\n")[0].slice(0, 70)}`
    );
  } finally {
    await b.close().catch(() => {});
  }
}

const measured = DEVICE_NAMES.length - unmeasured;
console.log(
  `\n${measured - bad}/${measured} measured devices: the first heading clears the fixed chapter bar`
);

if (bad > 0) process.exit(1);
if (unmeasured > 0) {
  console.log(`INCONCLUSIVE (${unmeasured}) — could not measure, not a pass`);
  process.exit(3);
}
process.exit(0);
