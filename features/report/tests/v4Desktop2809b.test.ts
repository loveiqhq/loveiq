import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Desktop touch-up, 28.09 evening. Fatih: "just touch up the desktop version so please
 * can you just scale it properly to not have these huge gaps and spaces". Production's
 * column (Eman, 991cb18c) is 620–917px wide beside the sidebar, and a handful of V4
 * blocks kept their phone widths inside it — the archetype card's 323px match row and
 * tagline and 281px motivation body, the fantasy map's 300px plot and the fantasy
 * table's 328px, the top three's 100px description track, and the science cards'
 * 183px questions — leaving half the column empty beside them. The Summary's copy sat
 * centred, 80px in from its own heading.
 *
 * All of it is scoped to `.rv3.rv4` from 700px, so the phone (and the standalone 393
 * preview, `.rv4-doc`) is exactly as it was.
 */
const v3 = readFileSync(join(__dirname, "..", "ui", "v3", "reportV3.css"), "utf8");

const MARK = "Desktop touch-up — 28.09 (c)";

/** The touch-up's own CSS, comments dropped. */
const block = () => {
  const at = v3.indexOf(MARK);
  expect(at, "the desktop touch-up block").toBeGreaterThan(-1);
  // From the heading comment's own opening, so the comment strips whole.
  return v3.slice(v3.lastIndexOf("/*", at)).replace(/\/\*[\s\S]*?\*\//g, "");
};

/** The body of `selector`'s rule inside the touch-up. */
const ruleIn = (selector: string) => {
  const css = block();
  const at = css.indexOf(`${selector} {`);
  expect(at, selector).toBeGreaterThan(-1);
  return css.slice(at, css.indexOf("}", at));
};

describe("V4 desktop touch-up — scoped to the live page from 700px", () => {
  it("opens inside a 700px media query, after every phone rule", () => {
    const css = block();
    expect(css.trimStart().startsWith("@media (min-width: 700px) {")).toBe(true);
    expect(v3.slice(0, v3.indexOf(MARK)).split("\n").length).toBeGreaterThan(1884);
    // Every selector is the live page's, never the 393 preview's.
    for (const [, sel] of css.matchAll(/\n\s*([^@{}\n][^{}]*)\{/g)) {
      for (const part of sel!.split(",")) expect(part.trim()).toMatch(/^\.rv3\.rv4 /);
    }
  });
});

describe("the archetype card uses the column", () => {
  // Since 30.09 (Mark: "Text width should go all the way to the border") neither the
  // tagline nor the motivation body stops at production's 760 copy measure.
  it("runs the match row and the tagline across the card", () => {
    expect(ruleIn(".rv3.rv4 .rv3-arch__match")).toContain("width: 100%");
    const tagline = ruleIn(".rv3.rv4 .rv3-arch__tagline");
    expect(tagline).toContain("width: 100%");
    expect(tagline).not.toContain("max-width");
  });

  // The phone's fixed 191 header and 197 panel left white under a one-line tagline and
  // a one-line body here; the card sizes to its content (1031 is the phone frame's).
  it("sizes the header and the motivation panel to their content", () => {
    expect(ruleIn(".rv3.rv4 .rv3-arch__head")).toContain("min-height: 0");
    expect(ruleIn(".rv3.rv4 .rv3-arch__motive")).toContain("min-height: 0");
    expect(ruleIn(".rv3.rv4 .rv3-arch__tagline")).toContain("min-height: 0");
  });

  it("lets the motivation body run across the card, not the phone's 281", () => {
    const body = ruleIn(".rv3.rv4 .rv3-arch__motive-body");
    expect(body).toContain("width: auto");
    expect(body).not.toContain("max-width");
  });
});

// The top three (V2's desktop rows) and the science deck (a gallery) moved on in Mark's
// desktop review, 28.09 (Notion): v4DesktopReview2809.test.ts.
describe("the Summary", () => {
  it("sets the Summary's copy under its heading, not centred in the column", () => {
    const body = ruleIn(".rv3.rv4 .rv4-summary__body");
    expect(body).toContain("align-items: flex-start");
    expect(ruleIn(".rv3.rv4 .rv4-summary__copy")).toContain("width: auto");
    // Flush with it too (Mark, 30.09, "Text width.png"): not the phone's 5.5px in.
    expect(body).toContain("padding-left: 0");
  });
});

describe("Fantasy vs. Reality uses the column", () => {
  // The table runs the whole column like every other chapter (review 06.10: at its old
  // 760 its toggles stood 136px short of the others'). The map keeps its own 548, centred
  // in the column and so over the table, so the chapter's two figures share an axis.
  it("grows the map's plot to 520, centred over the table", () => {
    const map = ruleIn(".rv3.rv4 .rv4-fvm");
    expect(map).toContain("margin-left: max(0px, (100% - 548px) / 2)");
    expect(map).toContain("width: min(548px, 100%)");
    expect(ruleIn(".rv3.rv4 .rv4-fvm__img")).toContain("--fvm-plot: min(520px, 100cqi - 28px)");
  });

  it("runs the table across the whole column, its score columns growing with it", () => {
    expect(ruleIn(".rv3.rv4 .rv4-fvt")).toContain("width: 100%");
    expect(ruleIn(".rv3.rv4 .rv4-fvt")).not.toContain("760px");
    // 30% each, as V2's 896 frame spends 430 on them (Figma 8146:76002), never under 140.
    expect(ruleIn(".rv3.rv4 .rv4-fvt__cols,\n  .rv3.rv4 .rv4-fvt__row")).toContain(
      "grid-template-columns: minmax(0, 1fr) repeat(2, clamp(140px, 30%, 280px))"
    );
  });
});
