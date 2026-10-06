/**
 * AN ICON RESTING ON THE WORDS NEXT TO IT.
 *
 * Eman spotted this in a recording: the report's "Unlock the Full Report"
 * button shows its padlock jammed flat against the U, no gap at all. It looks
 * broken, and it is on the button that asks for money.
 *
 * THE CLASS OF BUG, which is why this is worth a probe rather than a one-line
 * CSS fix. The icon is absolutely positioned at `left-[calc(50%-82.92px)]` —
 * a pixel offset taken from Figma, correct for the exact string the designer
 * laid out. The label is NOT fixed: `archetype-breakdown` swaps between
 * "Unlock the Full Report" and "Unlock All Reports" depending on what the
 * reader already owns, and it is centred. A longer label grows leftward into
 * an icon that cannot move. Design handoff gives us these offsets constantly,
 * so this will happen again.
 *
 * WHY A GAP AND NOT AN OVERLAP. Tried overlap first: zero hits, because the
 * icon TOUCHES the text rather than crossing it. Measured across a whole
 * report, the separation is unambiguous — the defect sits at 1px and every
 * healthy control at 8px or more, so a threshold in between catches it with
 * nothing else to ignore:
 *
 *      1px  archetype-breakdown__cta    "Unlock the Full Report"   <- the bug
 *      8px  report-chapter-pill__btn    "Chapter:Other Archetypes"
 *     15px  archetype-breakdown__cta    "Unlock the Full Report"   (its arrow)
 *     35px  report-chapter-pill__btn    "Other Archetypes"
 *
 * WHAT THIS IS NOT. Four other ideas were tried against a healthy page and
 * rejected for producing more noise than signal: fonts (`FontFace.status` is
 * "unloaded" until a glyph needs it, so all eleven faces looked broken),
 * horizontal overflow (a carousel track is SUPPOSED to run off-screen — 1680px
 * of it), clipped text (`overflow: hidden` plus a decorative wash overlay
 * makes every healthy CTA look twice its height), and icon/label overlap
 * (never fires). A generic "does this page look right" checker is a
 * false-positive machine; this is the one measurement that separated cleanly.
 *
 *   node scripts/probes/verify-icon-label-gap.mjs
 *   MUTATE=1 node scripts/probes/verify-icon-label-gap.mjs   # must FAIL
 *
 * MUTATE MUST MUTATE THE THING THAT MAKES THE SPACE. The first version zeroed
 * `margin` and forced `position: static` — which is what the defect looked
 * like BEFORE it was fixed, when the icon was absolutely positioned. The fix
 * creates the spacing with flex `gap`, so that mutation became a no-op the
 * moment it shipped: with the padlock repaired on production, `MUTATE=1`
 * exited 0 while claiming to inject a defect. It zeroes `gap` now, and flips
 * three runs out of three.
 *
 * Verified against production 2026-09-23 after the fix deployed:
 * clean 0, MUTATE 1 (x3), unreachable 3.
 *
 * Exit 0 clean, 1 the defect reproduced, 3 could not measure.
 */
import { chromium, webkit, devices } from "playwright";

import { stagingCookies } from "./staging-cookie.mjs";

const ORIGIN = process.env.REPORT_ORIGIN ?? "https://www.loveiq.org";
const TOKEN = process.env.REPORT_TOKEN ?? "rpt_a9LY0Obbla1FVsclJ1nM";

/**
 * Below this, an icon and its label are touching. Set from the measurement in
 * the header: the defect is 1px, the tightest healthy control is 8px. Four sits
 * between them with room on both sides, so a designer tightening a button to
 * 6px does not redden CI and the broken one still fails.
 */
const MIN_GAP_PX = 4;

/**
 * Below this the page did not render enough to judge. Measured, not guessed:
 * a fully-walked report has exactly TWO controls pairing an icon with a label
 * on the same line — the unlock CTA and the chapter pill. It was 5 first, which
 * made every healthy run inconclusive.
 */
const MIN_CONTROLS = 2;

const DEVICE_LIST = (process.env.DEVICES ?? "Pixel 7,iPhone 15 Pro")
  .split(",")
  .map((d) => d.trim())
  .filter(Boolean);

let bad = 0;
let unmeasured = 0;

for (const name of DEVICE_LIST) {
  if (!devices[name]) {
    console.log(`${name}: UNKNOWN DEVICE — INCONCLUSIVE`);
    unmeasured += 1;
    continue;
  }
  const engine = /iphone|ipad/i.test(name) ? webkit : chromium;
  const browser = await engine.launch();
  const ctx = await browser.newContext({ ...devices[name], locale: "en-US" });
  await ctx.addCookies(stagingCookies(ORIGIN)).catch(() => {});
  const page = await ctx.newPage();

  try {
    if (process.env.MUTATE === "1") {
      /**
       * Shove every icon hard against its label. On an INTERVAL, because a
       * one-shot paint is stripped the moment React re-renders and a mutation
       * the app quietly undoes reports PASS while claiming to inject a defect.
       */
      await page.addInitScript(() => {
        setInterval(() => {
          for (const ctl of document.querySelectorAll("button, a[href], [role='button']")) {
            if (!ctl.querySelector("img, svg")) continue;
            // GAP, not margin. The first version zeroed `margin` and set
            // `position: static` — which was how the defect looked BEFORE it
            // was fixed, when the icon was absolutely positioned. The fix
            // creates the spacing with flex `gap`, so that mutation became a
            // no-op the moment it shipped and MUTATE=1 exited 0 while claiming
            // to inject a defect. Zero everything that can hold two flex
            // children apart.
            ctl.style.setProperty("gap", "0", "important");
            ctl.style.setProperty("column-gap", "0", "important");
            for (const i of ctl.querySelectorAll("img, svg")) {
              i.style.setProperty("margin", "0", "important");
              i.style.setProperty("padding", "0", "important");
            }
          }
        }, 200);
      });
    }

    const res = await page.goto(`${ORIGIN}/report/${TOKEN}`, {
      waitUntil: "domcontentloaded",
      timeout: 45_000,
    });
    if (!res || !res.ok()) {
      console.log(
        `${name}: report did not load (${res ? res.status() : "no response"}) — INCONCLUSIVE`
      );
      unmeasured += 1;
      await browser.close();
      continue;
    }
    await page.waitForTimeout(6000);
    await page
      .locator(".cky-btn-accept")
      .click({ timeout: 4000 })
      .catch(() => {});

    // Walk the whole page: these sections mount as they come into view, and a
    // check that only ever sees the top of the report is not checking the
    // report. The unlock CTA lives around 8,100px down.
    for (let i = 0; i < 40; i += 1) {
      await page.evaluate(() => window.scrollBy(0, 1500));
      await page.waitForTimeout(100);
    }
    await page.waitForTimeout(1200);

    const found = await page.evaluate((minGap) => {
      const shown = (el) => {
        const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return (
          cs.display !== "none" &&
          cs.visibility !== "hidden" &&
          cs.opacity !== "0" &&
          r.width > 0 &&
          r.height > 0
        );
      };
      const tight = [];
      let controls = 0;
      for (const ctl of document.querySelectorAll("button, a[href], [role='button']")) {
        if (!shown(ctl)) continue;
        const icons = [...ctl.querySelectorAll("img, svg")].filter(shown);
        // Only leaf text: a wrapper containing the icon would measure against
        // itself and report a nonsense gap.
        const labels = [...ctl.querySelectorAll("span, p")].filter(
          (e) => shown(e) && (e.textContent || "").trim().length > 1 && !e.querySelector("img, svg")
        );
        if (icons.length && labels.length) controls += 1;
        for (const icon of icons) {
          for (const label of labels) {
            const a = icon.getBoundingClientRect();
            const b = label.getBoundingClientRect();
            // Same line only. An icon above or below its caption is a stacked
            // layout, where horizontal distance means nothing.
            const sameLine = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1;
            if (!sameLine) continue;
            const gap =
              a.right <= b.left ? b.left - a.right : a.left >= b.right ? a.left - b.right : 0;
            if (gap < minGap) {
              tight.push(
                `${String(ctl.className).split(" ")[0] || ctl.tagName.toLowerCase()}: ` +
                  `icon is ${Math.round(gap)}px from "${(label.textContent || "").trim().slice(0, 30)}"`
              );
            }
          }
        }
      }
      return { tight: [...new Set(tight)], controls };
    }, MIN_GAP_PX);

    if (found.controls < MIN_CONTROLS) {
      console.log(`${name}: only ${found.controls} icon+label control(s) rendered — INCONCLUSIVE`);
      unmeasured += 1;
    } else if (found.tight.length > 0) {
      console.log(`${name}: FAIL — ${found.tight.join(" | ")}`);
      bad += 1;
    } else {
      console.log(`${name}: ok — ${found.controls} icon+label controls, all clear of their text`);
    }
  } catch (err) {
    console.log(`${name}: exception: ${String(err).slice(0, 160)} — INCONCLUSIVE`);
    unmeasured += 1;
  }
  await browser.close();
}

if (bad > 0) {
  console.log(`\nREPRODUCED on ${bad} device(s) — an icon is touching the words next to it`);
  process.exit(1);
}
if (unmeasured === DEVICE_LIST.length) {
  console.log(`\nINCONCLUSIVE (${unmeasured}) — could not measure, not a pass`);
  process.exit(3);
}
console.log("\nclean — every icon has clear space from its label");
process.exit(0);
