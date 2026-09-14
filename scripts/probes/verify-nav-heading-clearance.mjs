/**
 * Does the fixed chapter bar cover the report's first heading?
 *
 * On phones the chapter bar is FIXED at 80–136px. `.report-shell` is meant to
 * clear it, but a later unscoped `padding` shorthand resets its top padding to
 * 32px at every width, so the v1 welcome heading started at 112px and the bar
 * hid the top 24px of it — measured on production across all three devices.
 *
 *   REPORT_ORIGIN=https://www.loveiq.org node scripts/probes/verify-nav-heading-clearance.mjs
 *   V2=1 ...        # check report 2.0 (?v2=1) instead
 *   MUTATE=1 ...    # removes the clearance — every device must FAIL
 */
import { chromium, webkit, devices } from "playwright";
import { stagingCookies } from "./staging-cookie.mjs";
const O = process.env.REPORT_ORIGIN ?? "https://www.loveiq.org",
  T = "rpt_a9LY0Obbla1FVsclJ1nM";
let bad = 0;
for (const name of ["Pixel 7", "iPhone 15 Pro", "iPhone SE"]) {
  const engine = /iphone/i.test(name) ? webkit : chromium;
  const b = await engine.launch();
  const c = await b.newContext({ ...devices[name], locale: "en-US" });
  await c.addCookies(stagingCookies(O)).catch(() => {});
  const p = await c.newPage();
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
  const ok = r.found && r.overlapPx === 0;
  if (!ok) bad += 1;
  console.log(
    `${ok ? "PASS" : "FAIL"} ${name.padEnd(15)} heading "${r.headingText}" top=${r.headingRect?.t} ` +
      `| bar ends ${r.navRect?.b} | covered by ${r.overlapPx}px`
  );
  await b.close();
}
console.log(`\n${3 - bad}/3 devices: the first heading clears the fixed chapter bar`);
process.exit(bad ? 1 : 0);
