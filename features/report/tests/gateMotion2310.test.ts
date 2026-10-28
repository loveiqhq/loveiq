import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Sync 23.10: motion on what reassures, on the EUR 1.99 gate (the guarantee's shield, the
 * "one time payment" line, the map's badges, the reviewers' faces) and a halo on the
 * wizard's CONTINUE. The rules that keep it safe: it all sits behind
 * `prefers-reduced-motion: no-preference`, nothing that holds the price or a button moves
 * (Playwright and Safari need a still target), and the halo takes no pointer.
 */

const GATE_CSS = readFileSync(
  join(process.cwd(), "features/report/ui/gate/initial-unlock-gate.css"),
  "utf8"
);
const WIZARD_CSS = readFileSync(
  join(process.cwd(), "features/survey/ui/wizard/wizard-motion.css"),
  "utf8"
);

/** The body of the `@media (prefers-reduced-motion: no-preference)` block after `marker`. */
function motionBlock(css: string, marker: string): string {
  const from = css.indexOf(marker);
  expect(from, marker).toBeGreaterThan(-1);
  const open = css.indexOf("@media (prefers-reduced-motion: no-preference) {", from);
  expect(open).toBeGreaterThan(-1);
  let depth = 0;
  for (let i = css.indexOf("{", open); i < css.length; i++) {
    if (css[i] === "{") depth++;
    if (css[i] === "}") depth--;
    if (depth === 0) return css.slice(open, i + 1);
  }
  throw new Error("unclosed block");
}

describe("the gate's motion (sync 23.10)", () => {
  const block = motionBlock(GATE_CSS, "Sync 23.10: motion on what reassures");

  it("plays only where motion is welcome", () => {
    for (const selector of [
      ".iug-card .iug-card__guarantee img",
      ".iug-sticky__shield",
      ".iug-card .iug-card__suffix::after",
      ".iug-map-section.animate .iug-map__chip",
      ".iug-reviews.animate .rpg-review__avatar",
    ]) {
      expect(block, selector).toContain(selector);
    }
    // Outside the block, none of these keyframes is ever applied.
    const outside = GATE_CSS.replace(block, "");
    for (const name of ["iug-shield-pop", "iug-shield-glow", "iug-underline", "iug-pop-in"]) {
      expect(outside.match(new RegExp(`animation[^;]*${name}`, "g")), name).toBeNull();
    }
  });

  it("leaves the underline drawn, at rest, for a reader who asks for less motion", () => {
    const outside = GATE_CSS.replace(block, "");
    const at = outside.indexOf(".iug-card .iug-card__suffix::after {");
    expect(at).toBeGreaterThan(-1);
    const rule = outside.slice(at, outside.indexOf("}", at));
    expect(rule).toContain('content: "";');
    expect(rule).not.toContain("transform");
    // The motion block alone starts it collapsed, to draw it.
    expect(block).toMatch(/\.iug-card__suffix::after\s*\{[^}]*transform: scaleX\(0\)/);
  });

  it("never moves the price or a button", () => {
    for (const still of ["rpg-card__cta", "rpg-card__amount", "iug-sticky__cta", "iug-card {"]) {
      expect(block, still).not.toContain(still);
    }
  });
});

describe("the wizard's CONTINUE halo (sync 23.10)", () => {
  const block = motionBlock(WIZARD_CSS, "Sync 23.10: guide with motion");

  it("breathes only where motion is welcome, and takes no pointer", () => {
    const after = block.slice(block.indexOf(".wz-root .wz-continue--nudge::after"));
    expect(after).toContain("pointer-events: none;");
    expect(after).toContain("animation: wz-nudge");
    // The halo is drawn by its shadow; the button's own box never moves.
    expect(block).not.toMatch(/\.wz-continue--nudge\s*\{[^}]*transform/);
  });
});

// The bar is always there (sync 23.10), so the page keeps room for its real height and a
// focused control scrolls clear of it (WCAG 2.4.11).
describe("the gate's room for its bar", () => {
  it("keeps the measured bar, the safe area and the cookie banner clear", () => {
    expect(GATE_CSS).toMatch(
      /--iug-sticky-room: calc\(\s*var\(--iug-sticky-h, calc\(56px \+ env\(safe-area-inset-bottom, 0px\)\)\) \+ var\(--liq-consent-h, 0px\)\s*\)/
    );
    expect(GATE_CSS).toMatch(/\.iug-page \{[^}]*padding-bottom: var\(--iug-sticky-room\);/);
    expect(GATE_CSS).toMatch(
      /html:has\(\.iug-page\) \{\s*scroll-padding-bottom: var\(--iug-sticky-room\);/
    );
  });
});
