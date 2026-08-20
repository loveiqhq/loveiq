// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import BeliefsSection, { type BeliefsCopy } from "@features/report/ui/sections/BeliefsSection";

/**
 * The locked state has been through six shapes, and this is the one that holds:
 *
 *  1. one column of two rows behind an ~890px card — the paywall floated over
 *     blank white and the section read as though nothing was behind it;
 *  2. a hand-written two-column stand-in — right shape, invented words;
 *  3. a pre-blurred raster of the whole chapter — real content, but blurred at the
 *     top too, and Figma's locked frame keeps the top rows crisp;
 *  4. three real rows per column fading to transparent — the fade reached zero two
 *     thirds down, so the bottom of each column was blank white;
 *  5. six real rows receding behind blur — no white, but a nineteen-row chapter
 *     still looked like it held six;
 *  6. TWO real rows per column, sharp, and the rest of each column as a per-column
 *     raster of the real remaining rows (`beliefs-keep` / `beliefs-loosen`).
 *
 * Six is what the design and the paywall both want: the chapter stands at its true
 * length — measured 571px and 1179px per column against the unlocked report's 572
 * and 1182 — while the payload carries two beliefs per column and the rest exists
 * only as pixels that were blurred and quarter-scaled at build time.
 *
 * These tests pin the client half: the tease renders the rows it was given, sharp,
 * with the rasters after them — and it renders nothing it was not given.
 */
const lockedCopy: BeliefsCopy = {
  "learn.eyebrow": "What you will learn",
  "learn.body": "In this chapter you will learn where your beliefs came from.",
  // What a locked client now receives: the first six rows of each column (two
  // shown here — the count itself is asserted against the route below).
  keep: ["Sex is a way we care for each other", "Closeness makes me want to give"],
  loosen: [
    { belief: "My needs should come second", shift: "My pleasure matters too" },
    { belief: "If I say no, I'll hurt them", shift: "A no can hold love" },
  ],
  locked: true,
};

function renderLocked(overrides: Partial<BeliefsCopy> = {}) {
  return render(
    <BeliefsSection
      archetype="Relational Nurturer"
      copy={{ ...lockedCopy, ...overrides }}
      isUnlocked={false}
      onUnlock={() => {}}
      sectionTitle="Typical Beliefs"
    />
  );
}

afterEach(cleanup);

describe("BeliefsSection — locked tease", () => {
  it("renders the real rows it was given, in both columns", () => {
    const { container } = renderLocked();
    const fade = container.querySelector(".report-beliefs__preview-fade--tease");
    expect(fade, "locked tease is missing").not.toBeNull();
    expect(fade!.querySelectorAll(".report-beliefs__col")).toHaveLength(2);
    expect(fade!.textContent).toContain("Sex is a way we care for each other");
    expect(fade!.textContent).toContain("My needs should come second");
  });

  it("keeps the live rows sharp and carries one raster per column", () => {
    // Figma's locked frame keeps the top rows crisp — no CSS filter on the wrapper
    // or the lists — and the rows past the tease are pixels, one image per column
    // because a keep row is 51px against a loosen row's 111px.
    const { container } = renderLocked();
    const fade = container.querySelector(".report-beliefs__preview-fade--tease")!;
    expect(fade.className).not.toContain("report-preview-fade--image");

    const sources = [...fade.querySelectorAll("img")].map((img) => img.getAttribute("src"));
    expect(sources).toEqual([
      "/report-previews/beliefs-keep-desktop.jpg",
      "/report-previews/beliefs-loosen-desktop.jpg",
    ]);
    // Each image follows its column's list as the NEXT sibling — not the list's last
    // child — so both columns can share grid row tracks (label / rows / raster) and
    // the blur starts on one line across the card. Inside the list it inherited the
    // list's own height and the two columns drifted apart.
    for (const list of fade.querySelectorAll(".report-beliefs__list")) {
      expect(list.lastElementChild?.className).toContain("report-beliefs__item");
      expect(list.nextElementSibling?.className).toContain("report-locked-preview");
    }
  });

  it("labels both columns", () => {
    renderLocked();
    expect(screen.getAllByText(/Serve you/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Box you in/i).length).toBeGreaterThan(0);
  });

  it("renders only the rows the server sent, never a padded list", () => {
    // The withheld rows are absent from the payload, so the tease cannot show
    // more than it was given — that is where the paywall boundary lives now.
    const { container } = renderLocked({ keep: ["Only one belief"], loosen: [] });
    const fade = container.querySelector(".report-beliefs__preview-fade--tease")!;
    expect(fade.querySelectorAll(".report-beliefs__item")).toHaveLength(1);
    expect(fade.querySelectorAll(".report-beliefs__col")).toHaveLength(1);
  });

  it("still withholds the per-archetype body paragraph", () => {
    const { container } = renderLocked();
    expect(container.querySelector(".report-beliefs__note")).toBeNull();
  });

  it("still renders the paywall overlay over the tease", () => {
    const { container } = renderLocked();
    expect(container.querySelector('[class*="premium-overlay"]')).not.toBeNull();
  });
});

describe("BeliefsSection — how much the server ships", () => {
  it("ships five keeps and three loosens to a locked client, all of them to a paid one", () => {
    // The rows past the tease are not in the payload at all — they are the per-column
    // rasters — and the last two of each column are what let the blur come on
    // gradually before the image starts.
    //
    // The counts differ per column BY DESIGN: a keep row is one line, a loosen row
    // carries its reframe underneath and is twice as tall, so four and four started
    // the blur 214px lower in the loosen column. Five and three put the two bands
    // within ~30px at every desktop width, which is what lets the shared row tracks
    // land both rasters on one line.
    const route = readFileSync(join(process.cwd(), "app/api/report/route.ts"), "utf8");
    expect(route).toMatch(/const BELIEFS_TEASER_KEEP_ROWS = 5;/);
    expect(route).toMatch(/const BELIEFS_TEASER_LOOSEN_ROWS = 3;/);
    expect(route).toMatch(
      /length: beliefsUnlocked \? BELIEFS_KEEP_ROWS : BELIEFS_TEASER_KEEP_ROWS/
    );
    expect(route).toMatch(
      /length: beliefsUnlocked \? BELIEFS_LOOSEN_ROWS : BELIEFS_TEASER_LOOSEN_ROWS/
    );
  });

  it("captures the row rules at low contrast, since a blur cannot destroy a line", () => {
    // A long vertical line is the one shape a blur cannot destroy, and at quarter
    // scale a 3px rule sits sub-pixel in the file, so the 4x upscale rebuilds it as a
    // crisp band down the image. Hiding it outright fixed the sharpness and lost the
    // lines; 0.16 alpha keeps them as a tint of the same hue with no edge to rebuild.
    const gen = readFileSync(join(process.cwd(), "scripts/generate-locked-previews.mjs"), "utf8");
    expect(gen).toMatch(
      /borderLeftColor = `rgba\(\$\{rgb\[1\]\}, \$\{rgb\[2\]\}, \$\{rgb\[3\]\}, 0\.16\)`/
    );
    // Restored afterwards, so the unlocked page the script walks is not left mutated
    // for the next capture.
    expect(gen).toContain('row.style.borderLeftColor = ""');

    // And a second graded pass across the left edge, where those rules sit.
    const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");
    const at = css.indexOf(".report-beliefs__preview-fade--tease .report-locked-preview::before");
    expect(at, "the left-edge softening pass is missing").toBeGreaterThan(-1);
    const body = css.slice(at, css.indexOf("}", at));
    expect(body).toContain("backdrop-filter: blur(1.5px)");
    expect(body).toContain("to right");
  });

  it("captures the rasters with exactly the shipped rows hidden", () => {
    // If these numbers drift apart, the sharp rows and the image either double up
    // the same beliefs or skip one.
    const gen = readFileSync(join(process.cwd(), "scripts/generate-locked-previews.mjs"), "utf8");
    const block = gen.slice(gen.indexOf("const COLUMN_CAPTURES"), gen.indexOf("const VIEWPORTS"));
    // Scoped to the beliefs entries — the accelerators chapter shares this list and
    // teases a different number of rows (see AcceleratorsSection.locked.test.tsx).
    const beliefs = block.slice(0, block.indexOf('name: "accel-opens"'));
    expect(beliefs).toContain('name: "beliefs-keep"');
    expect(beliefs).toContain('name: "beliefs-loosen"');
    expect([...beliefs.matchAll(/keepRows: (\d+)/g)].map((m) => Number(m[1]))).toEqual([5, 3]);
  });

  it("ramps the blur up before the raster starts", () => {
    // A fully blurred image directly under sharp text reads as a pasted block. The
    // LAST TWO rows of each column carry a light CSS blur so softness climbs
    // 0 -> 0.6 -> 1.4 -> the image's own baseline, and the overlay keeps it climbing
    // down the image instead of sitting flat, which is what read as "too strong in
    // the middle". Addressed from the END of the list, not by index: the two columns
    // ship different row counts (five keeps, three loosens).
    const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");
    const bodyAt = (selector: string) => {
      const at = css.indexOf(selector);
      expect(at, `missing rule: ${selector}`).toBeGreaterThan(-1);
      return css.slice(at, css.indexOf("}", at));
    };
    const SCOPE = ".report-beliefs__preview-fade--tease .report-beliefs__list";
    expect(bodyAt(`${SCOPE} > *:nth-last-child(2)`)).toContain("filter: blur(0.6px)");
    expect(bodyAt(`${SCOPE} > *:last-child`)).toContain("filter: blur(1.4px)");
    // Every row above those two is untouched, in both columns.
    expect(css).not.toContain(`${SCOPE} > *:nth-child(`);

    const graded = bodyAt(".report-beliefs__preview-fade--tease .report-locked-preview::after");
    expect(graded).toContain("backdrop-filter: blur(2px)");
    // Masked from nothing at the top to full at the bottom — it can only ADD to the
    // raster's own blur, never subtract, so the withheld rows stay unrecoverable.
    expect(graded).toContain("rgba(0, 0, 0, 0) 0%");
    expect(graded).toContain("rgba(0, 0, 0, 1) 100%");
  });

  it("gives both columns the same row tracks so the blur starts on one line", () => {
    // Equal row counts put the two blurs at different heights because the rows are
    // different heights; the counts fix most of it and subgrid closes the rest by
    // sharing three tracks — label, rows, raster — between the columns. Desktop only:
    // below 769px the columns stack, where there is no line to match.
    const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");
    const at = css.indexOf(".report-beliefs__preview-fade--tease .report-beliefs__cols");
    expect(at, "the shared-track rule is gone").toBeGreaterThan(-1);
    const block = css.slice(at, css.indexOf("\n}", css.indexOf(".report-beliefs__col {", at)));
    expect(block).toContain("grid-template-rows: auto auto auto");
    expect(block).toContain("grid-template-rows: subgrid");
    expect(block).toContain("grid-row: span 3");
    // Guarded to the side-by-side layout.
    expect(css.slice(0, at)).toMatch(/@media \(min-width: 769px\)[^@]*$/);
  });

  it("captures a feather and pulls it back out, in both raster scopes", () => {
    // A CSS blur bleeds past the element's box but an element screenshot clips TO
    // that box, so every column crop used to end on four razor-straight edges —
    // soft inside, hard border. The capture now pads the element and the page pulls
    // the padding back out with negative margins, so the falloff is inside the file
    // and the CONTENT still lands 1:1 on the live rows above it. Both halves have to
    // agree: pad the capture without widening the img and the chapter shrinks; widen
    // without padding and the hard edge is back.
    const gen = readFileSync(join(process.cwd(), "scripts/generate-locked-previews.mjs"), "utf8");
    expect(gen).toMatch(/const COLUMN_PAD_RATIO = 2\.5;/);
    expect(gen).toMatch(/const COLUMN_CAPTURE_PAD_PX = COLUMN_BLUR_PX \* COLUMN_PAD_RATIO;/);
    // The pad overhangs into the gutter, where the next column's rule would be
    // captured as a sharp vertical line — the one shape a blur cannot destroy.
    expect(gen).toContain('sib.style.visibility = "hidden"');
    expect(gen).toContain("window.__previewHidden");

    const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");
    const bodyAt = (selector: string) => {
      const at = css.indexOf(selector);
      expect(at, `missing rule: ${selector}`).toBeGreaterThan(-1);
      return css.slice(at, css.indexOf("}", at));
    };
    // The attachment chapter's card is captured at its OWN blur (its result word is a
    // 35px headline that survived the shared one), so its feather is that blur x the
    // same ratio — the pair still has to agree, just at a different number.
    const cardBlur = Number(
      gen.slice(gen.indexOf('name: "attach-card"')).match(/blur: ([\d.]+),/)?.[1]
    );
    expect(cardBlur).toBeGreaterThan(0);
    // attach-map carries its own blur too (4px, matching every other locked chapter).
    const mapBlur = Number(
      gen.slice(gen.indexOf('name: "attach-map"')).match(/blur: ([\d.]+),/)?.[1]
    );
    expect(mapBlur).toBeGreaterThan(0);
    const scopes: [string, number][] = [
      [".report-beliefs__preview-fade--tease .report-locked-preview {", 0],
      [".report-accel__columns--tease .report-locked-preview,", 0],
      [".report-attachment__map-preview {", mapBlur],
      [".report-attachment__result-wrap--locked > .report-attachment__card-preview {", cardBlur],
    ];
    for (const [wrapper, ownBlur] of scopes) {
      const rule = bodyAt(wrapper);
      // Must match COLUMN_CAPTURE_PAD_PX: 8 * 2.5.
      // Derived from the generator, not hardcoded: --lp-pad must equal
      // COLUMN_BLUR_PX * 2.5 or the raster stops lining up 1:1 with the live rows
      // above it. Reading the constant out of the script means changing the blur
      // cannot silently desync the CSS — it fails here instead.
      const blurPx = Number(gen.match(/const COLUMN_BLUR_PX = ([\d.]+);/)?.[1]);
      expect(blurPx).toBeGreaterThan(0);
      expect(rule).toContain(`--lp-pad: ${(ownBlur || blurPx) * 2.5}px`);
    }
    // Contains the negative margins without clipping the feather off again. The
    // attachment wrappers carry it on the <picture> inside them, not on the scope.
    for (const wrapper of [
      ".report-beliefs__preview-fade--tease .report-locked-preview {",
      ".report-accel__columns--tease .report-locked-preview,",
      ".report-attachment__map-preview .report-locked-preview {",
      ".report-attachment__result-wrap--locked > .report-attachment__card-preview .report-locked-preview {",
    ]) {
      expect(bodyAt(wrapper)).toContain("display: flow-root");
    }
    for (const img of [
      ".report-beliefs__preview-fade--tease .report-locked-preview__img {",
      ".report-accel__columns--tease .report-locked-preview__img,",
      ".report-attachment__map-preview img {",
      ".report-attachment__result-wrap--locked > .report-attachment__card-preview img {",
    ]) {
      const rule = bodyAt(img);
      expect(rule).toContain("width: calc(100% + var(--lp-pad) * 2)");
      // Tailwind's preflight caps images at 100%, which clamps that straight back.
      expect(rule).toContain("max-width: none");
      expect(rule).toContain("margin: calc(var(--lp-pad) * -1)");
    }
  });

  it("keeps the paywall card below every row the reader can actually read", () => {
    // Centred, the card's top edge sat at 32px — above the live rows — so the reader
    // could see there was text and not finish it: measured, it covered 202px of
    // readable rows at 1440, 168 at 1100, 223 at 900.
    const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");
    const OVERLAY = ".report-beliefs__preview--locked > .report-premium-overlay";
    const rules = [
      ...css.matchAll(
        new RegExp(`${OVERLAY.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} \\{([^}]*)\\}`, "g")
      ),
    ].map((m) => m[1]!);
    expect(rules.length, "the card's placement rules are gone").toBeGreaterThanOrEqual(3);

    // Desktop: pushed down past the live band. The deepest live row across BOTH
    // columns is 409px from the box top (at 769, where the columns are narrowest
    // before they stack); 300 was measured against the keep column alone and covered
    // the loosen column's tail.
    const desktop = rules.find((r) => r.includes("padding-top"))!;
    expect(desktop).toContain("align-items: flex-start");
    expect(Number(desktop.match(/padding-top: (\d+)px/)![1])).toBeGreaterThanOrEqual(420);

    // Mobile: the columns stack, so the box has to clear BOTH sets of live rows —
    // they run to 1047px at 768 — with the ~560px card pinned to the bottom.
    const mobileHeights = rules
      .map((r) => r.match(/min-height: (\d+)px/))
      .filter(Boolean)
      .map((m) => Number(m![1]));
    expect(Math.min(...mobileHeights)).toBeGreaterThanOrEqual(1650);
  });

  it("adds no CSS filter of its own, and no mask anywhere", () => {
    // The rasters arrive blurred and quarter-scaled; a filter on top would make this
    // chapter visibly softer than every other locked surface. And nothing fades to
    // white: the lists cancel the shared lock mask outright.
    const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");
    const bodyAt = (selector: string) => {
      const at = css.indexOf(selector);
      expect(at, `missing rule: ${selector}`).toBeGreaterThan(-1);
      return css.slice(at, css.indexOf("}", at));
    };
    expect(bodyAt(".report-beliefs__preview-fade--tease .report-locked-preview {")).not.toContain(
      "filter"
    );
    // The image carries half a pixel to dissolve JPEG block boundaries from the 4x
    // upscale — sub-pixel smoothing, not a second lock blur. Anything ≥1px here
    // would make this chapter visibly softer than every other locked surface.
    const img = bodyAt(".report-beliefs__preview-fade--tease .report-locked-preview__img");
    const blur = img.match(/filter: blur\(([\d.]+)px\)/);
    expect(blur, "the smoothing pass is gone").not.toBeNull();
    expect(Number(blur![1])).toBeLessThan(1);
    expect(bodyAt(".report-beliefs__preview-fade--tease .report-beliefs__list {")).toContain(
      "mask-image: none"
    );
  });
});
