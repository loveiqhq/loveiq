import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Mark's desktop review, Notion "Review Round 28.09 – Desktop" (29.09, 08:23: "Finished my
 * review for the Desktop version. left comments in Notion."). Everything here is the live
 * V4 page's (`.rv3.rv4`) from 700px, so the phone and the 393 preview (`.rv4-doc`) are
 * exactly as they were.
 */
const v3 = readFileSync(join(__dirname, "..", "ui", "v3", "reportV3.css"), "utf8");

const MARK = "Desktop review — 28.09 (Notion)";

/** This round's CSS, comments dropped. */
const block = () => {
  const at = v3.indexOf(MARK);
  expect(at, "the desktop review block").toBeGreaterThan(-1);
  return v3.slice(v3.lastIndexOf("/*", at)).replace(/\/\*[\s\S]*?\*\//g, "");
};

/** The body of `selector`'s first rule inside this round's block. */
const ruleIn = (selector: string) => {
  const css = block();
  const at = css.indexOf(`${selector} {`);
  expect(at, selector).toBeGreaterThan(-1);
  return css.slice(at, css.indexOf("}", at));
};

describe("the desktop review block", () => {
  it("opens inside a 700px media query, after the 28.09 (c) touch-up", () => {
    expect(block().trimStart().startsWith("@media (min-width: 700px) {")).toBe(true);
    expect(v3.indexOf(MARK)).toBeGreaterThan(v3.indexOf("Desktop touch-up — 28.09 (c)"));
  });
});

// "Alignment of the Practical Element is off with the rest. The left should be aligned and
// the width should be equal with the text in Desktop." Both cards kept the phone's 16px
// bleed (`margin-inline: -16px`) while the 700px column rules pinned their width, so each
// sat 16px left of the text; the 2.0 chapters' cards overhung both sides.
describe("the Try this and Learn more cards sit on the text column", () => {
  it("drops the phone's bleed and runs the column's width", () => {
    const card = ruleIn(".rv3.rv4 .rv4-try,\n  .rv3.rv4 .rv4-learn");
    expect(card).toContain("margin-inline: 0");
    expect(card).toContain("width: 100%");
  });
});
