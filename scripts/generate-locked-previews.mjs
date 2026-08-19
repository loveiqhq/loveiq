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
 * The COLUMN captures use half scale and a heavier in-page blur instead.
 *
 * Those crops sit next to live text at full size, where a quarter-scale file
 * upscaled 4x reads as mush rather than as blur: the row bars came back as grey
 * blocks and the whole strip looked smudged. At half scale the upscale is 2x, so
 * what shows is the gaussian rather than the resampling, and 8px of it destroys
 * more than the 4px did at quarter scale — the security floor goes up, not down,
 * while the surface reads softer. Files stay around 3-4KB.
 */
const COLUMN_CAPTURE_SCALE = 0.5;
const COLUMN_BLUR_PX = 8;

/**
 * Padding added around a column crop before it is shot.
 *
 * A CSS blur bleeds OUTSIDE the element's box, but `locator.screenshot()` clips to
 * that box — so the soft interior ended on a razor-straight edge on all four sides,
 * which is what read as sharp. Wrapping the element in this much padding puts the
 * falloff inside the frame, so the image's own edges are soft. The app pulls the
 * padding back out with a negative margin (`--lp-pad` in globals.css) so the content
 * still lines up 1:1 with the live rows above it. 2.5x the blur: a gaussian is
 * visually finished by about 2.5 sigma.
 */
const COLUMN_CAPTURE_PAD_PX = COLUMN_BLUR_PX * 2.5;

/**
 * Locked sections, keyed by DOM id. The card class prefix is derived at runtime
 * from `article[class*="__card"]`, so adding a section here is the only change
 * needed when a new premium chapter ships.
 */
const SECTION_IDS = [
  // "typical_beliefs" and the accelerators chapter are captured per COLUMN instead
  // (see COLUMN_CAPTURES): both show their first rows as live text, so a
  // whole-chapter raster would repeat them and could not line up with two columns of
  // different row heights.
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

/**
 * Extra captures that are NOT a whole card.
 *
 * Typical Beliefs shows the first two beliefs of each column as real, sharp text
 * and everything past them as pixels. One image cannot do that: the two columns
 * sit side by side but a keep row is 51px against a loosen row's 111px, so a
 * single raster placed under the sharp rows would line up with one column and not
 * the other. Each column therefore gets its own image, captured with its first two
 * rows hidden, and the component stacks it directly under that column's sharp rows.
 *
 * `keepRows` is how many rows the section ships as live text (BELIEFS_TEASER_ROWS
 * in app/api/report/route.ts) — the capture hides exactly those so nothing appears
 * twice. Four of them: the last two are blurred in CSS so the softness ramps up
 * before the image begins, which is what stops the seam from showing.
 */
const COLUMN_CAPTURES = [
  {
    sectionId: "typical_beliefs",
    selector: ".report-beliefs__col:not(.report-beliefs__col--loosen-col) .report-beliefs__list",
    name: "beliefs-keep",
    keepRows: 4,
  },
  {
    sectionId: "typical_beliefs",
    selector: ".report-beliefs__col--loosen-col .report-beliefs__list",
    name: "beliefs-loosen",
    keepRows: 4,
  },
  // Accelerators & Brakes, same treatment: three live triggers per column
  // (ACCEL_TEASE_ROWS in AcceleratorsSection.tsx) and the rest as pixels. Five rows
  // per column, so each image carries two.
  {
    sectionId: "typical_arousal_accelerators_turn_ons_of_the_core_archetype",
    selector: ".report-accel__col:first-of-type .report-accel__rows",
    name: "accel-opens",
    keepRows: 3,
  },
  {
    sectionId: "typical_arousal_accelerators_turn_ons_of_the_core_archetype",
    selector: ".report-accel__col:last-of-type .report-accel__rows",
    name: "accel-shuts",
    keepRows: 3,
  },
  // Everything after the columns: the accelerator-vs-brake meter box and the verdict
  // line under it. Without this the locked chapter ended at the rows, so a reader
  // could not see that a whole box and a closing verdict sit behind the paywall.
  // `keepRows: 0` — nothing here is teased.
  {
    sectionId: "typical_arousal_accelerators_turn_ons_of_the_core_archetype",
    selector: ".report-accel__card",
    name: "accel-tail",
    keepRows: 0,
    only: ".report-accel__meter, .report-accel__verdict",
  },
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
 * Hides the page's fixed chrome for the whole run.
 *
 * An element screenshot captures the PAGE PIXELS inside the element's box, so
 * anything floating over that box lands in the file. Playwright scrolls the target
 * to the top of the viewport, which is exactly where the mobile topbar and chapter
 * pill live — every mobile raster shipped with a blurred "LoveIQ Report" header
 * baked into its top edge, and on a short capture (a beliefs column) the header was
 * most of the image.
 *
 * Only `position: fixed` is hidden. Those are out of flow, so removing them cannot
 * move the content being captured; sticky elements are in flow and hiding them
 * would shift the very thing we are shooting.
 */
async function hideFixedChrome(page) {
  return page.evaluate(() => {
    const hidden = [];
    // The dev-server overlay lives in a shadow root, so the sweep below cannot see
    // it — and it was rasterised into the bottom-left corner of every image.
    for (const portal of document.querySelectorAll("nextjs-portal")) {
      if (portal instanceof HTMLElement) {
        portal.style.setProperty("display", "none", "important");
        hidden.push("nextjs-portal");
      }
    }
    for (const el of document.querySelectorAll("body *")) {
      if (!(el instanceof HTMLElement)) continue;
      if (getComputedStyle(el).position !== "fixed") continue;
      el.style.setProperty("display", "none", "important");
      hidden.push(el.className.toString().split(" ")[0] || el.tagName.toLowerCase());
    }
    return hidden;
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

/**
 * Captures ONE element (a column's list) with its first `keepRows` children hidden,
 * blurred the same way `captureSection` does.
 */
async function captureColumn(page, { sectionId, selector, name, keepRows, only }, viewportName) {
  await page.locator(`#${sectionId}`).scrollIntoViewIfNeeded();
  await page.waitForTimeout(REVEAL_SETTLE_MS);

  const prepared = await page.evaluate(
    ({ sectionId, selector, keepRows, blur, only, pad }) => {
      const section = document.getElementById(sectionId);
      if (!section) return { error: "section not found" };
      const list = section.querySelector(selector);
      if (!list) return { error: `no element for "${selector}"` };

      const rows = Array.from(list.children);
      // `only`: keep just these children (used for the accel tail, where the card
      // holds the columns as well and we want the meter + verdict alone).
      if (only) {
        let kept = 0;
        for (const child of rows) {
          if (!(child instanceof HTMLElement)) continue;
          if (child.matches(only)) kept += 1;
          else child.style.display = "none";
        }
        if (kept === 0) return { error: `nothing matched "${only}"` };
      } else {
        if (rows.length <= keepRows) return { error: `only ${rows.length} rows` };
        for (const row of rows.slice(0, keepRows)) row.style.display = "none";
      }

      // The rows keep their left rule and quote glyph — the column reads as the same
      // column all the way down — but the rule goes to low contrast first.
      //
      // A long straight line is the one shape a blur cannot destroy, and at quarter
      // scale a 3px rule sits sub-pixel in the file, so the 4x upscale on display
      // rebuilds it as a crisp band down the image. Hiding it outright fixed the
      // sharpness and lost the lines; dropping the alpha to 0.16 keeps them present
      // as a soft tint of the same hue while giving the upscale no hard edge to
      // reconstruct. The hue is preserved rather than greyed: green for keep, orange
      // for loosen, as the sharp rows above show.
      for (const row of rows.slice(keepRows)) {
        if (!(row instanceof HTMLElement)) continue;
        const cs = getComputedStyle(row);
        // Only where there IS a rule: beliefs rows carry one, accelerator rows do
        // not (their straight line is the progress track, which is short and
        // horizontal — a blur handles that fine).
        if (parseFloat(cs.borderLeftWidth) > 0) {
          const rgb = cs.borderLeftColor.match(/(\d+),\s*(\d+),\s*(\d+)/);
          if (rgb) row.style.borderLeftColor = `rgba(${rgb[1]}, ${rgb[2]}, ${rgb[3]}, 0.16)`;
        }
      }

      // Wrap so the blur's falloff lands INSIDE the capture instead of being clipped
      // at the element's edge. The wrapper carries the card's own white, so the
      // falloff fades into the colour the chapter already sits on.
      const wrapper = document.createElement("div");
      wrapper.setAttribute("data-preview-capture", "");
      wrapper.setAttribute("data-preview-wrapper", "");
      wrapper.style.padding = `${pad}px`;
      wrapper.style.background = "#ffffff";
      // content-box + 100% width so the CONTENT stays the column's own width and the
      // padding overhangs: with the default border-box the content would shrink by
      // 2x pad and the blurred rows would re-wrap narrower than the live ones above.
      wrapper.style.boxSizing = "content-box";
      wrapper.style.width = "100%";
      wrapper.style.margin = `0 -${pad}px`;
      list.parentElement?.insertBefore(wrapper, list);
      wrapper.appendChild(list);

      // The padding overhangs into the gutter, and the neighbouring column paints
      // after this one (later in DOM order) — so without this the pad captures the
      // next column's left rule as a razor-sharp vertical line inside the raster,
      // which is exactly the edge a blur cannot destroy. Hide everything that isn't
      // an ancestor of the wrapper (visibility keeps layout intact) and lift the
      // wrapper above whatever is left.
      wrapper.style.position = "relative";
      wrapper.style.zIndex = "9999";
      const hidden = [];
      for (let node = wrapper; node && node !== document.body; node = node.parentElement) {
        for (const sib of Array.from(node.parentElement?.children ?? [])) {
          if (sib === node || !(sib instanceof HTMLElement) || sib.contains(wrapper)) continue;
          hidden.push([sib, sib.style.visibility]);
          sib.style.visibility = "hidden";
        }
      }
      window.__previewHidden = hidden;

      list.style.filter = `blur(${blur}px)`;
      const r = wrapper.getBoundingClientRect();
      return {
        width: r.width,
        height: r.height,
        pad,
        rows: only ? rows.length : rows.length - keepRows,
      };
    },
    { sectionId, selector, keepRows, blur: COLUMN_BLUR_PX, only, pad: COLUMN_CAPTURE_PAD_PX }
  );

  const restore = () =>
    page.evaluate(
      ({ sectionId, selector }) => {
        const section = document.getElementById(sectionId);
        for (const [el, prev] of window.__previewHidden ?? []) el.style.visibility = prev;
        window.__previewHidden = undefined;
        // Unwrap the feather wrapper first, so the list goes back where it was.
        const wrapper = section?.querySelector("[data-preview-wrapper]");
        if (wrapper instanceof HTMLElement) {
          const parent = wrapper.parentElement;
          while (wrapper.firstChild) parent?.insertBefore(wrapper.firstChild, wrapper);
          wrapper.remove();
        }
        const list = section?.querySelector(selector);
        if (!(list instanceof HTMLElement)) return;
        list.style.filter = "";
        for (const row of Array.from(list.children)) {
          if (!(row instanceof HTMLElement)) continue;
          if (row.style.display === "none") row.style.display = "";
          row.style.borderLeftColor = "";
        }
      },
      { sectionId, selector }
    );

  if (prepared.error) {
    await restore();
    return { sectionId, name, error: prepared.error };
  }

  const file = join(OUT_DIR, `${name}-${viewportName}.jpg`);
  // 88 rather than the section captures' 72: these are upscaled 4x on display, so
  // JPEG block boundaries land as visible banding rather than as noise. Still ~2KB.
  await page
    .locator(`#${sectionId} [data-preview-capture]`)
    .screenshot({ path: file, type: "jpeg", quality: 88 });
  await restore();

  return {
    sectionId,
    name,
    file,
    width: Math.round(prepared.width),
    height: Math.round(prepared.height),
    pad: prepared.pad,
    rows: prepared.rows,
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
    const hidden = await hideFixedChrome(page);

    console.log(`\n== ${viewport.name} (${viewport.width}px)${plan ? ` — plan ${plan}` : ""}`);
    console.log(`   fixed chrome hidden: ${hidden.length ? hidden.join(", ") : "none"}`);
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

    // A second page at the column scale — deviceScaleFactor is fixed per context, so
    // the finer crops need their own.
    const columnPage = await browser.newPage({
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: COLUMN_CAPTURE_SCALE,
    });
    await columnPage.goto(`${ORIGIN}/report/${TOKEN}`, {
      waitUntil: "networkidle",
      timeout: 120_000,
    });
    await settle(columnPage);
    await hideFixedChrome(columnPage);
    for (const spec of COLUMN_CAPTURES) {
      const r = await captureColumn(columnPage, spec, viewport.name);
      results.push({ ...r, viewport: viewport.name });
      if (r.error) console.log(`   FAIL ${spec.name}: ${r.error}`);
      else
        console.log(
          `   ok   ${r.name.padEnd(22)} ${r.width}x${r.height}  (${r.rows} rows past the tease, ${r.pad}px feather)`
        );
    }
    await columnPage.close();
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
