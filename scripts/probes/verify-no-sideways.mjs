#!/usr/bin/env node
/**
 * Does any page scroll sideways on a phone, or zoom in when a box is tapped?
 *
 * Two defects look identical to a reader ("zoomed in a bit, and the whole page
 * scrolls side to side") and neither shows up in a Chromium check:
 *
 *  1. A box wider than the phone. Chromium honours the page-level
 *     `overflow-x: clip` on html/body and hides it; an iPhone still pans to it
 *     (Mark, 23.09, against staging: "I can scroll sideways as it renders to
 *     big"). So this probe switches those page clips OFF and lists every box that
 *     passes the screen edge without a nearer ancestor clipping it.
 *  2. iOS focus-zoom. A text control under 16px zooms the page in when tapped and
 *     never zooms back out; a client-side navigation keeps the zoom for the rest
 *     of the visit (the staging login's 14px password box, 30.09). Playwright
 *     cannot reproduce the zoom itself, so the probe reads every visible text
 *     control's computed font-size instead. The default widths end on a landscape
 *     iPhone (667, 844, 932): iOS zooms whatever the width, and a size kept behind a
 *     breakpoint for "desktop" still reaches an iPhone held sideways.
 *
 * USAGE
 *   node scripts/probes/verify-no-sideways.mjs                        # local dev on :3000
 *   ORIGIN=http://localhost:3100 ENGINES=webkit node scripts/probes/verify-no-sideways.mjs
 *   PATHS="/report/rpt_x?v4=1,/survey" WIDTHS=375,390 node scripts/probes/verify-no-sideways.mjs
 *   MUTATE=1 node scripts/probes/verify-no-sideways.mjs              # must FAIL everywhere
 *
 * Every page walk opens the closed disclosures, scrolls the whole page once so lazily
 * mounted blocks are measured at their final size, and taps a "Does this resonate?"
 * thumb so the comment box is on screen. A page that errors, or redirects somewhere
 * else, is INCONCLUSIVE, which fails the run like a FAIL does.
 *
 * Not in the default list: /report-v4-preview. It draws the report on Figma's hard
 * 393px canvas on purpose, so on a phone narrower than 393 it pans by design.
 */
import { chromium, webkit } from "playwright";
import { stagingCookies } from "./staging-cookie.mjs";

const ORIGIN = process.env.ORIGIN ?? "http://localhost:3000";
const PATHS = (
  process.env.PATHS ??
  "/report?preview=1&v4=1,/report?preview=1&v4=1&plan=full_report,/survey,/wizard-preview,/,/login"
).split(",");
const WIDTHS = (process.env.WIDTHS ?? "320,360,375,390,393,414,430,667,844,932")
  .split(",")
  .map(Number);
const ENGINES = (process.env.ENGINES ?? "chromium,webkit").split(",");
const MUTATE = process.env.MUTATE === "1";

const UNCLIP = `html, body, .report-page { overflow-x: visible !important; overflow: visible !important; }`;
/** A box wider than any phone and a 14px text box: both must be reported. */
const MUTATION = `(() => {
  const wide = document.createElement("div");
  wide.style.cssText = "width: 700px; height: 4px";
  const box = document.createElement("input");
  box.style.cssText = "font-size: 14px";
  document.body.append(wide, box);
})()`;

async function walk(page) {
  // Open every closed disclosure outside dialogs and the nav, a few levels deep.
  for (let pass = 0; pass < 3; pass++) {
    const opened = await page.evaluate(() => {
      let n = 0;
      for (const el of document.querySelectorAll('[aria-expanded="false"]')) {
        if (el.closest('[role="dialog"], nav') || !el.getBoundingClientRect().width) continue;
        el.click();
        n++;
      }
      return n;
    });
    await page.waitForTimeout(600);
    if (!opened) break;
  }
  await page.evaluate(() => {
    document.querySelector('.report-fb__thumb, button[aria-label^="This resonates"]')?.click();
  });
  await page.evaluate(async () => {
    const height = () => document.documentElement.scrollHeight;
    for (let y = 0; y < height(); y += 500) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 90));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(800);
  await page.keyboard.press("Escape").catch(() => {});
}

function measure(page, vw) {
  return page.evaluate((vw) => {
    const inside = (r) => r.right <= vw + 0.5 && r.left >= -0.5;
    const clipsX = (el) => {
      const s = getComputedStyle(el);
      return s.overflowX !== "visible" || s.contain.includes("paint");
    };
    const wide = [];
    let boxes = 0;
    for (const el of document.querySelectorAll("body *")) {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      boxes++;
      if (inside(r) || el.closest(".sr-only")) continue;
      let a = el.parentElement;
      let clipped = false;
      for (; a && a !== document.body; a = a.parentElement) {
        if (!a.matches(".report-page") && clipsX(a) && inside(a.getBoundingClientRect())) {
          clipped = true;
          break;
        }
      }
      if (clipped) continue;
      if (getComputedStyle(el).position === "fixed" && inside(r)) continue;
      const name = `${el.tagName.toLowerCase()}.${String(el.className?.baseVal ?? el.className).slice(0, 60)}`;
      wide.push(`${name} [${Math.round(r.left)}..${Math.round(r.right)}]`);
    }
    const noZoom = /^(checkbox|radio|range|hidden|file|color|submit|button|reset|image)$/;
    const small = [...document.querySelectorAll("input, textarea, select")]
      .filter((c) => !noZoom.test(c.type) && c.getBoundingClientRect().width > 0)
      .map((c) => ({ c, px: parseFloat(getComputedStyle(c).fontSize) }))
      .filter(({ px }) => px < 16)
      .map(
        ({ c, px }) => `<${c.tagName.toLowerCase()}> ${String(c.className).slice(0, 50)} ${px}px`
      );
    return { boxes, wide, small, path: location.pathname + location.search };
  }, vw);
}

const results = [];
for (const name of ENGINES) {
  const engine = name === "webkit" ? webkit : chromium;
  const browser = await engine.launch();
  for (const path of PATHS) {
    for (const width of WIDTHS) {
      const context = await browser.newContext({
        viewport: { width, height: 800 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
      });
      await context.addCookies(stagingCookies(ORIGIN));
      const page = await context.newPage();
      const label = `${name} ${width} ${path}`;
      try {
        await page.goto(ORIGIN + path, { waitUntil: "domcontentloaded", timeout: 180_000 });
        await page.waitForTimeout(path.startsWith("/report") ? 6000 : 3000);
        const landed = new URL(page.url()).pathname;
        if (landed !== new URL(ORIGIN + path).pathname) {
          results.push({ label, verdict: "INCONCLUSIVE", detail: [`landed on ${landed}`] });
          continue;
        }
        if (path.startsWith("/report")) await walk(page);
        if (MUTATE) await page.evaluate(MUTATION);
        await page.addStyleTag({ content: UNCLIP });
        await page.waitForTimeout(400);
        const m = await measure(page, width);
        // The staging password page is a dozen boxes; an empty or crashed page is none.
        if (m.boxes < 8) {
          results.push({ label, verdict: "INCONCLUSIVE", detail: [`only ${m.boxes} boxes drawn`] });
          continue;
        }
        const detail = [
          ...m.wide.slice(0, 6).map((w) => `WIDE ${w}`),
          ...m.small.map((s) => `ZOOMS ${s}`),
        ];
        results.push({ label, verdict: detail.length ? "FAIL" : "PASS", detail });
      } catch (e) {
        results.push({ label, verdict: "INCONCLUSIVE", detail: [String(e.message).slice(0, 140)] });
      } finally {
        await context.close();
      }
    }
  }
  await browser.close();
}

for (const r of results) {
  console.log(`${r.verdict.padEnd(12)} ${r.label}`);
  for (const d of r.detail) console.log(`             ${d}`);
}
const failed = results.filter((r) => r.verdict !== "PASS");
if (MUTATE) {
  const survived = results.filter((r) => r.verdict === "PASS");
  console.log(
    survived.length
      ? `\nMUTATION SURVIVED on ${survived.length} runs: the probe cannot see what it claims to.`
      : `\nMutation caught on all ${results.length} runs.`
  );
  process.exit(survived.length ? 1 : 0);
}
console.log(`\n${results.length - failed.length}/${results.length} PASS`);
process.exit(failed.length ? 1 : 0);
