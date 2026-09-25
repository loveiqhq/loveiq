import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The archetype card's dimension deck — review round 25.09, Mark (Notion):
 * "it would be even better if you build a timed animation where the icon slowly
 * changes color as right now it feels quite abrupt… just a thought/idea."
 *
 * Each slot stacks two designs of its card and cross-fades them in 180ms when focus
 * moves (the fix for 24.09's "the swipe is lagging"), and each design carries its own
 * chip — solid accent with a white glyph when focused, an 11% tint with an accent
 * glyph when peeking. So the icon's colour flipped with the cross-fade. Now each
 * copy's chip follows the SLOT's state instead and eases over 600ms: the card still
 * arrives in 180ms, and its icon keeps warming (or cooling) after it lands. V4 only.
 */

const V3_CSS = readFileSync(join(process.cwd(), "features/report/ui/v3/reportV3.css"), "utf8");
const V4 = ".rv3:is(.rv4, .rv4-doc)";

/** The stylesheet with every @media block blanked (newlines kept, so line numbers
 * hold): the reduced-motion overrides repeat these selectors further down. */
const MAIN_CSS = V3_CSS.replace(/@media[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, (m) =>
  m.replace(/[^\n]/g, " ")
);

/** The rule opened by `selector` outside any @media, last occurrence, below 1884. */
const rule = (selector: string) => {
  const at = MAIN_CSS.lastIndexOf(selector);
  expect(at, selector).toBeGreaterThan(-1);
  expect(MAIN_CSS.slice(0, at).split("\n").length, selector).toBeGreaterThan(1884);
  return MAIN_CSS.slice(at, MAIN_CSS.indexOf("}", at));
};

describe("reportV3.css — the deck's icon changes colour slowly (V4)", () => {
  it("colours each copy's chip by the slot, not by the copy", () => {
    // While its slot peeks, the (hidden) focused copy already wears the peeking tint,
    // so when the slot takes focus the chip starts from there and warms up.
    expect(
      rule(`${V4} .rv3-deck__slot.is-peeking > .rv3-deck__card.is-focused .rv3-deck__chip {`)
    ).toMatch(
      /background-color:\s*color-mix\(in srgb, var\(--rv3-deck-accent\) 11%, transparent\)/
    );
    expect(
      rule(`${V4} .rv3-deck__slot.is-peeking > .rv3-deck__card.is-focused .rv3-deck__glyph {`)
    ).toMatch(/background-color:\s*var\(--rv3-deck-accent\)/);
    // And the other way: the peeking copy of a focused slot still wears the accent,
    // so a card losing focus cools down rather than flipping.
    expect(
      rule(`${V4} .rv3-deck__slot.is-focused > .rv3-deck__card.is-peeking .rv3-deck__chip {`)
    ).toMatch(/background-color:\s*var\(--rv3-deck-accent\)/);
    expect(
      rule(`${V4} .rv3-deck__slot.is-focused > .rv3-deck__card.is-peeking .rv3-deck__glyph {`)
    ).toMatch(/background-color:\s*#fff/);
  });

  it("eases the chip and its glyph over 600ms", () => {
    const eased = rule(`${V4} .rv3-deck__chip,`);
    expect(eased).toContain(`${V4} .rv3-deck__glyph {`);
    expect(eased).toMatch(/transition:\s*background-color 600ms ease-in-out/);
  });

  it("moves the page indicator on the same clock", () => {
    expect(rule(`${V4} .rv3-deck__dot {`)).toMatch(/transition:\s*background 600ms ease-in-out/);
  });

  it("keeps the cards' own cross-fade at 180ms, so the swipe stays quick", () => {
    expect(V3_CSS).not.toMatch(
      new RegExp(
        `${V4.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} \\.rv3-deck__card\\s*\\{[^}]*transition`
      )
    );
  });

  it("stops all of it for reduced motion", () => {
    const blocks = V3_CSS.split("@media (prefers-reduced-motion: reduce)").slice(1);
    const v4Block = blocks.find((b) =>
      b.slice(0, b.indexOf("}")).includes(`${V4} .rv3-deck__chip`)
    );
    expect(v4Block, "no V4 reduced-motion block for the deck chip").toBeDefined();
    const head = v4Block!.slice(0, v4Block!.indexOf("}"));
    expect(head).toContain(`${V4} .rv3-deck__glyph`);
    expect(head).toContain(`${V4} .rv3-deck__dot`);
    expect(head).toContain("transition: none");
  });
});
