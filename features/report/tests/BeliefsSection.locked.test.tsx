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
    // Each image is the LAST child of its column's list, so it continues that
    // column rather than floating beside it.
    for (const list of fade.querySelectorAll(".report-beliefs__list")) {
      expect(list.lastElementChild?.className).toContain("report-locked-preview");
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
  it("ships four rows per column to a locked client, and all of them to a paid one", () => {
    // Four, because the rows past them are not in the payload at all — they are the
    // per-column rasters — and because the last two are what let the blur come on
    // gradually before the image starts. It was three rows and a fade, then six and
    // a blur, then two and a raster that began at full strength under sharp text.
    const route = readFileSync(join(process.cwd(), "app/api/report/route.ts"), "utf8");
    expect(route).toMatch(/const BELIEFS_TEASER_ROWS = 4;/);
    expect(route).toMatch(/length: beliefsUnlocked \? BELIEFS_KEEP_ROWS : BELIEFS_TEASER_ROWS/);
    expect(route).toMatch(/length: beliefsUnlocked \? BELIEFS_LOOSEN_ROWS : BELIEFS_TEASER_ROWS/);
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
    expect(body).toContain("backdrop-filter: blur(3px)");
    expect(body).toContain("to right");
  });

  it("captures the rasters with exactly the shipped rows hidden", () => {
    // If these numbers drift apart, the sharp rows and the image either double up
    // the same beliefs or skip one.
    const gen = readFileSync(join(process.cwd(), "scripts/generate-locked-previews.mjs"), "utf8");
    const block = gen.slice(gen.indexOf("const COLUMN_CAPTURES"), gen.indexOf("const VIEWPORTS"));
    expect(block).toContain('name: "beliefs-keep"');
    expect(block).toContain('name: "beliefs-loosen"');
    expect([...block.matchAll(/keepRows: (\d+)/g)].map((m) => Number(m[1]))).toEqual([4, 4]);
  });

  it("ramps the blur up before the raster starts", () => {
    // A fully blurred image directly under sharp text reads as a pasted block. Rows
    // three and four carry a light CSS blur so softness climbs 0 -> 1.2 -> 2.6 ->
    // the image's own baseline, and the overlay keeps it climbing down the image
    // instead of sitting flat, which is what read as "too strong in the middle".
    const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");
    const bodyAt = (selector: string) => {
      const at = css.indexOf(selector);
      expect(at, `missing rule: ${selector}`).toBeGreaterThan(-1);
      return css.slice(at, css.indexOf("}", at));
    };
    const SCOPE = ".report-beliefs__preview-fade--tease .report-beliefs__list";
    expect(bodyAt(`${SCOPE} > *:nth-child(3)`)).toContain("filter: blur(1.2px)");
    expect(bodyAt(`${SCOPE} > *:nth-child(4)`)).toContain("filter: blur(2.6px)");
    // Rows one and two are untouched.
    expect(css).not.toContain(`${SCOPE} > *:nth-child(1)`);
    expect(css).not.toContain(`${SCOPE} > *:nth-child(2)`);

    const graded = bodyAt(".report-beliefs__preview-fade--tease .report-locked-preview::after");
    expect(graded).toContain("backdrop-filter: blur(5px)");
    // Masked from nothing at the top to full at the bottom — it can only ADD to the
    // raster's own blur, never subtract, so the withheld rows stay unrecoverable.
    expect(graded).toContain("rgba(0, 0, 0, 0) 0%");
    expect(graded).toContain("rgba(0, 0, 0, 1) 100%");
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
