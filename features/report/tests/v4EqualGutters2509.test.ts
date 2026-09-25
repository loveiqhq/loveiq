import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Review 25.09, item 16 — Mark, on the articles: "My mistake! Equal space left and
 * right." The frames draw the practice and article copy 358 wide in a 392 card whose
 * padding leaves 347, so it ran 12px into the right padding: 23 on the left, 11.5 on
 * the right. The copy now keeps to the card's content box in every "Try this" and
 * "Go deeper" card, and the article's window, blur and fade follow it — the blur still
 * overhanging the text 8px a side (item 13).
 */
const css = readFileSync(join(__dirname, "..", "ui", "v3", "reportV3.css"), "utf8");

describe("V4 — the practice and article copy keep equal space left and right", () => {
  it("no longer runs a card's copy 12px into its right padding", () => {
    expect(css).not.toMatch(/min\(358px, calc\(100% \+ 12px\)\)/);
    expect(css).not.toMatch(/\.rv4-learn[^{]*\{\s*width: 358px;/);
  });

  it("lets the article's blur span the copy plus its overhang, never re-narrowed", () => {
    expect(css).not.toMatch(/\.rv4-learn__blur[^{]*\{[^}]*right: auto/);
    expect(css).not.toMatch(/\.rv4-learn__blur[^{]*\{[^}]*\bwidth:/);
  });
});
