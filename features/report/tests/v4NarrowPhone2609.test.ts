import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Found by review 26.09's verification sweep: on a 320-360px phone (360 is a common
 * Android width) Part I's copy, the top three's heading and lede and the Summary
 * kept Figma's 356 / 361 / 328px widths, which only fit its 393 frame, so the
 * page's clip cut the end of their lines off. They keep the drawn width and give
 * way to the column below it.
 */
const css = readFileSync(join(__dirname, "..", "ui", "v3", "reportV3.css"), "utf8");
const BLOCKS = [
  // Part I's "What shaped this report". Prose only: a designed chapter's full-bleed
  // cards run wider than the column on purpose.
  ".rv4-chapter__body > .rv3-prose",
  ".rv4-copy",
  ".rv4-copy > p",
  ".rv4-part__intro",
  ".rv4-top3__heading",
  ".rv4-top3__lede",
  ".rv4-summary__inner",
  ".rv4-summary__copy",
  ".rv4-summary__closer",
];

describe("V4 — Figma's fixed text widths give way on a narrow phone", () => {
  const at = css.indexOf("/* ══ Fixed text widths on a narrow phone");
  const rule = () => css.slice(at, css.indexOf("}", at));

  it("is appended below the frozen top of the stylesheet", () => {
    expect(at).toBeGreaterThan(-1);
    expect(css.slice(0, at).split("\n").length).toBeGreaterThan(1884);
  });

  it.each(BLOCKS)("caps %s at its column", (block) => {
    expect(rule()).toContain(block);
    expect(rule()).toContain("max-width: 100%;");
  });
});
