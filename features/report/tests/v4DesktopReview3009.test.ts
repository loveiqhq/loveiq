import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Desktop review, Notion "Review Round 30.09 – Desktop" (Sanjin and Mark). Everything
 * here is the live V4 page's (`.rv3.rv4`) from 700px, so the phone and the 393 preview
 * (`.rv4-doc`) are exactly as they were.
 */
const v3 = readFileSync(join(__dirname, "..", "ui", "v3", "reportV3.css"), "utf8");

const MARK = "Desktop review — 30.09 (Notion)";

/** This round's CSS, comments dropped. */
const block = () => {
  const at = v3.indexOf(MARK);
  expect(at, "the 30.09 desktop review block").toBeGreaterThan(-1);
  return v3.slice(v3.lastIndexOf("/*", at)).replace(/\/\*[\s\S]*?\*\//g, "");
};

/** The body of `selector`'s first rule inside this round's block. */
const ruleIn = (selector: string) => {
  const css = block();
  const at = css.indexOf(`${selector} {`);
  expect(at, selector).toBeGreaterThan(-1);
  return css.slice(at, css.indexOf("}", at));
};

/** Every `@media <query> {` block's body after this round's mark, joined. */
const mediaAfterMark = (query: string) =>
  block()
    .split(`@media ${query} {`)
    .slice(1)
    .map((rest) => rest.slice(0, rest.indexOf("\n}\n")))
    .join("\n");

describe("the 30.09 desktop review block", () => {
  it("opens inside a 700px media query, after the 28.09 desktop review", () => {
    expect(block().trimStart().startsWith("@media (min-width: 700px) {")).toBe(true);
    expect(v3.indexOf(MARK)).toBeGreaterThan(v3.indexOf("Desktop review — 28.09 (Notion)"));
  });
});

// Sanjin: Attachment "jumps over", the deck is "hard to flip", and "the lines" are hard to
// click. From 700px the four 3px lines are the science gallery's pager: dots, the current
// one a pill in the archetype's accent, and V4's 34px disc either side.
describe("the archetype deck pages on desktop", () => {
  it("draws the arrows as the gallery's discs, 16px from the dots", () => {
    const arrow = ruleIn(".rv3.rv4 .rv3-deck__arrow");
    for (const declaration of [
      "background: rgba(121, 95, 200, 0.1)",
      "border-radius: 50%",
      "color: var(--rv3-violet)",
      "display: flex",
      "height: 34px",
      "width: 34px",
      "margin-inline: 8.5px",
    ]) {
      expect(arrow).toContain(declaration);
    }
    expect(ruleIn(".rv3.rv4 .rv3-deck__arrow svg")).toContain("width: 15px");
    expect(ruleIn('.rv3.rv4 .rv3-deck__arrow[aria-disabled="true"]')).toContain("opacity: 0.35");
  });

  it("turns the four lines into dots, the current one a pill in the accent", () => {
    const row = ruleIn(".rv3.rv4 .rv3-deck__dots");
    expect(row).toContain("gap: 7.5px");
    expect(row).toContain("justify-content: center");
    expect(row).toContain("height: auto");
    expect(row).toContain("padding: 0");
    const dot = ruleIn(".rv3.rv4 .rv3-deck__dot");
    expect(dot).toContain("flex: none");
    expect(dot).toContain("height: 7.5px");
    expect(dot).toContain("width: 7.5px");
    expect(dot).toContain("background: rgba(22, 16, 33, 0.16)");
    const current = ruleIn(".rv3.rv4 .rv3-deck__dot.is-active");
    expect(current).toContain("background: var(--rv3-deck-accent)");
    expect(current).toContain("width: 20px");
  });

  it("gives each dot a 15 x 24 target, the dots' own pitch, so no two overlap", () => {
    const target = ruleIn(".rv3.rv4 .rv3-deck__dot::after");
    expect(target).toContain('content: ""');
    expect(target).toContain("inset: -8.25px -3.75px");
    expect(target).toContain("position: absolute");
    expect(ruleIn(".rv3.rv4 .rv3-deck__dot")).toContain("position: relative");
  });

  it("sets the row 14px under the cards and lets the deck grow round it", () => {
    // The cards end 22px above the viewport's foot, over their shadow; the gallery's
    // pager sits 14 under its tiles.
    expect(ruleIn(".rv3.rv4 .rv3-deck__dots")).toContain("margin-top: -8px");
    expect(ruleIn(".rv3.rv4 .rv3-deck")).toContain("height: auto");
  });

  it("keeps the indicator's slow clock for the colour, the gallery's for the width", () => {
    expect(ruleIn(".rv3.rv4 .rv3-deck__dot").replace(/\s+/g, " ")).toContain(
      "transition: background 600ms ease-in-out, width 200ms ease"
    );
  });

  it("lifts the arrows and darkens a dot only under a fine pointer, from 700px", () => {
    // The dots are the phone's lines below 700px, so the hover waits for the width too.
    const hover = mediaAfterMark("(min-width: 700px) and (hover: hover) and (pointer: fine)");
    expect(hover).toContain('.rv3.rv4 .rv3-deck__arrow:not([aria-disabled="true"]):hover');
    expect(hover).toContain("translate: 0 -1px");
    expect(hover).toContain(".rv3.rv4 .rv3-deck__dot:not(.is-active):hover");
    expect(v3).not.toMatch(/^\.rv3[^\n{]*\.rv3-deck__(arrow|dot)[^\n{]*:hover/m);
  });

  it("stops the dots and the arrows animating for reduced motion, after their own rules", () => {
    const reduced = mediaAfterMark("(prefers-reduced-motion: reduce)");
    expect(reduced).toMatch(/\.rv3\.rv4 \.rv3-deck__dot[^{]*\{[^}]*transition: none/);
    expect(reduced).toMatch(/\.rv3\.rv4 \.rv3-deck__arrow[^{]*\{[^}]*transition: none/);
  });

  it("rings the arrows for the keyboard", () => {
    expect(ruleIn(".rv3.rv4 .rv3-deck__arrow:focus-visible")).toContain(
      "outline: 2px solid var(--rv3-violet)"
    );
  });
});
