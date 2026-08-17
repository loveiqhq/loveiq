#!/usr/bin/env node
/**
 * Generates the blurred preview images that sit behind the paywall overlay on
 * locked report sections.
 *
 * WHY IMAGES AND NOT DOM
 * A locked section needs to look like a real chapter is behind the overlay. If
 * that content is DOM with `filter: blur()` over it, the blur is only a paint
 * effect — anyone can delete one CSS line in DevTools and read the paid chapter.
 * Rasterising the real chapter and blurring the PIXELS destroys the text before
 * it ever leaves the build machine, so the shipped file contains no recoverable
 * words.
 *
 * WHY PLAYWRIGHT BLURS IT AND NOT AN IMAGE LIBRARY
 * The blur is applied in-page, by the same CSS engine that renders
 * `--report-lock-blur` everywhere else in the report. That makes the image match
 * the rest of the locked surfaces by construction rather than by a hand-tuned
 * sigma that drifts the first time the token changes.
 *
 * USAGE
 *   npm run dev                                   # in another terminal
 *   node scripts/generate-locked-previews.mjs     # uses REPORT_TOKEN below
 *
 * The source report must be fully unlocked (`all_reports`), because the script
 * captures the REAL chapter content. Output lands in public/report-previews/.
 */
import { mkdirSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";

const TOKEN = process.env.REPORT_TOKEN ?? "rpt_WWUJ9NjXhjAoMemNIflD";
const ORIGIN = process.env.REPORT_ORIGIN ?? "http://localhost:3000";
const OUT_DIR = join(process.cwd(), "public", "report-previews");

/** Must track `--report-lock-blur` in app/globals.css. */
const LOCK_BLUR_PX = 4;

/**
 * Rasterise at quarter resolution, then let the browser scale the image back up.
 *
 * This is a SECURITY control, not a file-size trick. A 4px blur ALONE is not
 * enough: the standard lock blur is tuned for the generic stand-in text, where
 * legibility costs nothing, but here the pixels are the real paid copy, and at
 * 4px the chapter headings stay readable. Rasterising at a quarter scale
 * physically discards the high-frequency detail that carries glyph identity —
 * an 18px heading lands on ~4 pixels — so no amount of sharpening recovers the
 * words, because the information is not in the file.
 *
 * Quarter scale rather than a heavier blur on purpose: a bigger blur would make
 * these surfaces visibly softer than every other locked surface in the report,
 * whereas the browser's upscale on display lands the apparent softness back
 * around the 4px `--report-lock-blur` the rest of the report uses.
 */
const CAPTURE_SCALE = 0.25;

/**
 * Locked sections, keyed by DOM id. The card class prefix is derived at runtime
 * from `article[class*="__card"]`, so adding a section here is the only change
 * needed when a new premium chapter ships.
 */
const SECTION_IDS = [
  "typical_beliefs",
  "typical_arousal_accelerators_turn_ons_of_the_core_archetype",
  "core_insecurities",
  "confidence_level",
  "biochemical_reward_system_dynamics",
  "energy_level",
  "power_orientation",
  "curiosity_level",
  "love_language",
  "arousal_style",
  "initiation_style",
  "typical_sexual_fantasy_amp_practice_tendencies",
  "libido_challenges_in_relationships",
  "challenges_in_partnership",
  "typical_growth_potentials_for_the_core_archetype",
  "recommendations",
];

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 1200 },
  { name: "mobile", width: 430, height: 900 },
];

/**
 * Settles the page for capture: kills animation/transition so nothing is caught
 * mid-flight, and force-reveals every scroll-triggered element so charts are
 * drawn rather than blank.
 */
/**
 * Scrolls the whole report so every IntersectionObserver fires, then waits for
 * the reveal animations to finish.
 *
 * Deliberately no forcing. Two shortcuts were tried and both produced blank
 * cards: adding reveal classes by hand only covered the class names I happened
 * to know (the growth ladder animates off `.report-growth.is-animated`, so it
 * captured as blank white), and `reducedMotion: "reduce"` left 23 of 32 blank.
 * Letting the real animations run and simply waiting them out is what a reader
 * actually sees, and it needs no per-section knowledge.
 *
 * The wait covers the longest stagger in the report: the growth rungs finish at
 * 420ms delay + 4 x 130ms stagger + 520ms duration.
 */
const REVEAL_SETTLE_MS = 2500;

async function settle(page) {
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 500) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 90));
    }
    window.scrollTo(0, 0);
  });
}

/**
 * Fails the run on any blank capture.
 *
 * A blank image is the exact failure this whole feature exists to prevent — the
 * paywall floating over dead white — and it is invisible in the console output,
 * which happily prints "ok 792x729" for a card that rendered nothing. Decoding
 * each file and measuring its luminance spread is the only check that actually
 * looks at the pixels.
 */
async function verifyNotBlank(page, files) {
  return page.evaluate(async (paths) => {
    const results = [];
    for (const path of paths) {
      const img = new Image();
      img.src = path;
      try {
        await img.decode();
      } catch {
        results.push({ path, error: "failed to decode" });
        continue;
      }
      const canvas = document.createElement("canvas");
      canvas.width = Math.min(img.naturalWidth, 400);
      canvas.height = Math.min(img.naturalHeight, 400);
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
      let sum = 0;
      let sumSq = 0;
      const n = data.length / 4;
      for (let i = 0; i < data.length; i += 4) {
        const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        sum += lum;
        sumSq += lum * lum;
      }
      const mean = sum / n;
      results.push({ path, stdDev: Math.sqrt(Math.max(0, sumSq / n - mean * mean)) });
    }
    return results;
  }, files);
}

/**
 * The real chapter content is every child of the card UP TO the `__details`
 * educational expander. `__details` is excluded deliberately: it renders in the
 * locked view too, directly under the overlay, so including it would show the
 * same block twice — once blurred in the image and once sharp below it.
 */
async function captureSection(page, sectionId, viewportName) {
  // Bring the section into view and let it finish revealing BEFORE capturing.
  //
  // This is the whole ballgame: `locator.screenshot()` scrolls the element into
  // view itself, which is what STARTS the reveal — and then it shoots
  // immediately, catching the chapter at opacity 0. That is why an earlier run
  // reported a confident "ok 792x832" for 21 cards that were blank white.
  await page.locator(`#${sectionId}`).scrollIntoViewIfNeeded();
  await page.waitForTimeout(REVEAL_SETTLE_MS);

  const prepared = await page.evaluate(
    ({ sectionId, blur }) => {
      const section = document.getElementById(sectionId);
      if (!section) return { error: "section not found" };
      const cards = Array.from(section.querySelectorAll("article[class*='__card']"));
      if (cards.length === 0) return { error: "card not found" };

      // Most chapters are one card whose children are the content. The reading
      // list is a GRID of per-book cards, so capturing the first `__card` there
      // would grab a single book. When there are several, walk up to the nearest
      // ancestor holding all of them — the cards may sit inside per-item
      // wrappers, so the immediate parent is not necessarily the grid.
      let card = cards[0];
      if (cards.length > 1) {
        card = cards[0].parentElement;
        while (card && !cards.every((c) => card.contains(c))) card = card.parentElement;
        if (!card) return { error: "no common ancestor for card grid" };
      }

      const prefixMatch = cards[0].className.match(/report-[\w-]+?(?=__card)/);
      const prefix = prefixMatch ? prefixMatch[0] : null;
      if (!prefix) return { error: `cannot derive prefix from "${card.className}"` };

      // Hide the educational expander: it renders in the LOCKED view too,
      // directly under the overlay, so capturing it would show the same block
      // twice — once blurred in the image and once sharp below it.
      const details = Array.from(card.children).filter((c) =>
        /__details\b/.test((c.className || "").toString())
      );
      for (const d of details) d.style.display = "none";

      const kids = Array.from(card.children).filter((c) => c.style.display !== "none");
      if (kids.length === 0) return { error: "no content children" };

      // Nothing to exclude — capture the container as-is. Wrapping here would be
      // actively wrong: on a grid container (the reading list) the wrapper
      // becomes a single grid ITEM, so the capture collapses to one column.
      if (details.length === 0) {
        card.setAttribute("data-preview-capture", "");
        card.style.filter = `blur(${blur}px)`;
        const r = card.getBoundingClientRect();
        return { prefix, width: r.width, height: r.height, shifted: false };
      }

      // Baseline taken AFTER hiding details, so the check isolates the wrapper's
      // effect rather than re-reporting the intentional hide.
      const heightBefore = card.getBoundingClientRect().height;

      // Wrap the real content so it can be screenshotted as one element.
      // Playwright scrolls an element into view for us, which a page-level clip
      // cannot do reliably: `fullPage` re-lays-out the page at full height, so
      // coordinates measured at the real viewport no longer line up.
      const wrapper = document.createElement("div");
      wrapper.setAttribute("data-preview-capture", "");
      wrapper.style.filter = `blur(${blur}px)`;

      // Inherit the card's own layout. Most cards are column flex/grid with a
      // gap; a plain block wrapper would swallow that gap and the capture would
      // come out tighter than the chapter actually renders.
      const cardStyle = getComputedStyle(card);
      for (const prop of [
        "display",
        "flexDirection",
        "alignItems",
        "justifyContent",
        "gap",
        "rowGap",
        "columnGap",
        "gridTemplateColumns",
        "gridAutoRows",
      ]) {
        wrapper.style[prop] = cardStyle[prop];
      }
      wrapper.style.width = "100%";

      card.insertBefore(wrapper, kids[0]);
      for (const kid of kids) wrapper.appendChild(kid);

      const rect = wrapper.getBoundingClientRect();
      return {
        prefix,
        width: rect.width,
        height: rect.height,
        // A plain block wrapper around block children should not move anything.
        // Surfaced so a layout-changing section can't slip through unnoticed.
        shifted: Math.abs(card.getBoundingClientRect().height - heightBefore) > 2,
      };
    },
    { sectionId, blur: LOCK_BLUR_PX }
  );

  // Restores via the wrapper itself rather than re-deriving the anchor, so it
  // works for both the single-card and the card-grid shapes.
  const restore = async () =>
    page.evaluate((id) => {
      const section = document.getElementById(id);
      if (!section) return;
      const wrapper = section.querySelector("[data-preview-capture]");
      if (wrapper instanceof HTMLElement) {
        if (wrapper.tagName === "DIV" && !wrapper.className) {
          // A wrapper we injected — unwrap it.
          const parent = wrapper.parentElement;
          while (wrapper.firstChild) parent.insertBefore(wrapper.firstChild, wrapper);
          wrapper.remove();
        } else {
          // We captured an existing element in place; just undo our marks.
          wrapper.removeAttribute("data-preview-capture");
          wrapper.style.filter = "";
        }
      }
      for (const el of section.querySelectorAll("*")) {
        if (el instanceof HTMLElement && el.style.display === "none") el.style.display = "";
      }
    }, sectionId);

  if (prepared.error) {
    await restore();
    return { sectionId, error: prepared.error };
  }

  const name = prepared.prefix.replace(/^report-/, "");
  const file = join(OUT_DIR, `${name}-${viewportName}.jpg`);
  // Section ids are plain identifiers, so no selector escaping is needed.
  await page
    .locator(`#${sectionId} [data-preview-capture]`)
    .screenshot({ path: file, type: "jpeg", quality: 72 });

  await restore();

  return {
    sectionId,
    name,
    file,
    width: Math.round(prepared.width),
    height: Math.round(prepared.height),
    shifted: prepared.shifted,
  };
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();
  const results = [];

  for (const viewport of VIEWPORTS) {
    const page = await browser.newPage({
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: CAPTURE_SCALE,
    });
    await page.goto(`${ORIGIN}/report/${TOKEN}`, {
      waitUntil: "networkidle",
      timeout: 120_000,
    });

    const plan = await page.evaluate(() => document.body.dataset.accessPlan ?? null);
    await settle(page);

    console.log(`\n== ${viewport.name} (${viewport.width}px)${plan ? ` — plan ${plan}` : ""}`);
    for (const id of SECTION_IDS) {
      const r = await captureSection(page, id, viewport.name);
      results.push({ ...r, viewport: viewport.name });
      if (r.error) console.log(`   FAIL ${id}: ${r.error}`);
      else
        console.log(
          `   ok   ${r.name.padEnd(22)} ${r.width}x${r.height}${r.shifted ? "  <-- LAYOUT SHIFTED" : ""}`
        );
    }
    await page.close();
  }

  // Look at the pixels before declaring success.
  // Must be a same-origin document: a canvas that draws a cross-origin image is
  // tainted and getImageData throws. The 404 page is the cheapest one that
  // qualifies (goto does not throw on a 404 status).
  const verifyPage = await browser.newPage();
  await verifyPage.goto(`${ORIGIN}/__preview-verify`, { waitUntil: "domcontentloaded" });
  const captured = results.filter((r) => !r.error);
  const checks = await verifyNotBlank(
    verifyPage,
    captured.map((r) => `${ORIGIN}/report-previews/${r.name}-${r.viewport}.jpg`)
  );
  await browser.close();

  const BLANK_STDDEV = 3; // pure white is 0; a real chapter measures 20+.
  const blank = checks.filter((c) => c.error || c.stdDev < BLANK_STDDEV);
  for (const c of blank) {
    console.log(
      `   BLANK ${c.path.split("/").pop()} — ${c.error ?? `stdDev ${c.stdDev.toFixed(1)}`}`
    );
  }

  const failed = results.filter((r) => r.error);
  const bytes = readdirSync(OUT_DIR).reduce((sum, f) => sum + statSync(join(OUT_DIR, f)).size, 0);
  console.log(
    `\n${results.length - failed.length}/${results.length} captured, ` +
      `${checks.length - blank.length}/${checks.length} verified non-blank, ` +
      `${(bytes / 1024).toFixed(0)}KB total in public/report-previews/`
  );
  if (failed.length || blank.length) process.exitCode = 1;
}

await main();
