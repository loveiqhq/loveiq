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
    // 24px centre to centre, so each dot owns a 24 x 24 target (WCAG 2.2, review 06.10).
    expect(row).toContain("gap: 16.5px");
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

  it("gives each dot a 24 x 24 target, the dots' own pitch, so no two overlap", () => {
    const target = ruleIn(".rv3.rv4 .rv3-deck__dot::after");
    expect(target).toContain('content: ""');
    expect(target).toContain("inset: -8.25px;");
    expect(target).toContain("position: absolute");
    expect(ruleIn(".rv3.rv4 .rv3-deck__dot")).toContain("position: relative");
  });

  it("sets the row 14px under the cards and lets the deck grow round it", () => {
    // The cards end 22px above the viewport's foot, over their shadow; the gallery's
    // pager sits 14 under its tiles.
    expect(ruleIn(".rv3.rv4 .rv3-deck__dots")).toContain(
      "margin-top: calc(-1 * var(--rv3-deck-dots-lift))"
    );
    expect(ruleIn(".rv3.rv4 .rv3-deck")).toContain("--rv3-deck-dots-lift: 8px");
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

// Mark: "I would likely scale up the Locked icon and the Text" ("Locked Icon.png"). From
// 700px a locked chapter's head takes the proportions he drew for the visuals' badge
// (979:507): a 38px disc with the 17px lock 10 into it, and "Unlock Report" at 10/12, 7
// under the disc. The group is the label's 69.5 at 10px, so 70 x 57. The phone keeps
// 982:379's 56 x 46.
describe("the locked chapter head's lock, at the visuals' scale", () => {
  /** [classes, elements] of a selector of classes, elements and descendant combinators. */
  const specificity = (selector: string) => {
    const parts = selector.trim().split(/\s+/);
    const classes = parts.reduce((n, p) => n + (p.match(/\./g)?.length ?? 0), 0);
    const elements = parts.filter((p) => /^[a-z]/.test(p)).length;
    return [classes, elements] as const;
  };
  const outweighs = (a: string, b: string) => {
    const [ac, ae] = specificity(a);
    const [bc, be] = specificity(b);
    return ac > bc || (ac === bc && ae > be);
  };

  it("hides the 17px lock everywhere the desktop block does not draw it", () => {
    const hide = ".rv3.rv4 .rv4-chapter__lock-disc .rv4-chapter__lock-17";
    const at = v3.indexOf(`${hide} {`);
    expect(at).toBeGreaterThan(-1);
    expect(v3.slice(0, at).split("\n").length).toBeGreaterThan(1884);
    expect(at).toBeLessThan(v3.indexOf("Desktop touch-up — 28.09 (c)"));
    expect(v3.slice(at, v3.indexOf("}", at))).toContain("display: none");
    // Heavier than the phone's own glyph rule, which shows every img in the disc: a
    // lighter one lost to it, and the phone drew both locks.
    expect(outweighs(hide, ".rv3.rv4 .rv4-chapter__lock-disc img")).toBe(true);
  });

  it("sets the group at 70 x 57 round a 38px disc", () => {
    const group = ruleIn(".rv3.rv4 .rv4-chapter__lock");
    expect(group).toContain("height: 57px");
    expect(group).toContain("width: 70px");
    const disc = ruleIn(".rv3.rv4 .rv4-chapter__lock-disc");
    expect(disc).toContain("height: 38px");
    expect(disc).toContain("width: 38px");
    expect(disc).toContain("left: 16px");
  });

  it("swaps the 14px lock for 979:507's 17px one, 10 into the disc", () => {
    expect(ruleIn(".rv3.rv4 .rv4-chapter__lock-disc img")).toContain("display: none");
    const lock = ruleIn(".rv3.rv4 .rv4-chapter__lock-disc .rv4-chapter__lock-17");
    expect(lock).toContain("display: block");
    expect(lock).toContain("left: 10px");
    expect(lock).toContain("top: 10px");
  });

  it("sets 'Unlock Report' at 10/12, 7 under the disc", () => {
    const label = ruleIn(".rv3.rv4 .rv4-chapter__lock-label");
    expect(label).toContain("font-size: 10px");
    expect(label).toContain("top: 45px");
  });
});
