import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readAppCss } from "@shared/testing/read-app-css";

/**
 * Growth Potentials: the graph and the ladder answer each other.
 *
 * "Can we have a similar animation as in Arousal Style that whenever you hover or click
 * on the points on the graph, the appropriate sections underneath are highlighted"
 * (MO, 2026-08-22). Built on the arousal chart's contract, so the two behave alike:
 * one shared `cue`, both halves can set it, `clearOwnCue` so travelling between a dot
 * and its row does not drop the cue, and a tap on empty chart releases it.
 *
 * Verified in a browser: hovering each of the 5 dots lights its own row (5/5, both
 * directions), tapping a dot on an iPhone sets it and tapping the empty chart clears
 * it, and focusing a row from the keyboard lights its dot.
 */
const css = readAppCss();
const src = readFileSync(
  join(process.cwd(), "features/report/ui/sections/GrowthSection.tsx"),
  "utf8"
);
/**
 * The declarations of the rule whose selector list STARTS with this selector.
 * Anchored to the start of a line, or `.report-growth__rung` also matches
 * `.report-growth.is-animated .report-growth__rung` — a different rule entirely.
 */
const ruleBody = (selector: string) => {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = new RegExp(`^${esc}\\s*[,{]`, "m").exec(css);
  expect(m, `missing rule: ${selector}`).not.toBeNull();
  return css.slice(m!.index, css.indexOf("}", m!.index));
};

describe("growth cue", () => {
  it("shares one cue between the graph and the ladder", () => {
    expect(src).toContain("const [cue, setCue] = useState<number | null>(null)");
    // the graph's dots set it...
    expect(src).toContain("onMouseEnter={() => onCue(i)}");
    // ...and so do the rows, so neither half is "the control"
    expect(src).toContain("onMouseEnter={() => onCue(index)}");
    expect(src).toContain("onFocus={() => onCue(index)}");
    // a step count that always matches the rung count keeps the mapping 1:1
    expect(src).toContain("const profileSteps = hasLadder ? rungs.length");
  });

  it("only clears its own step, so travelling between a dot and its row holds", () => {
    expect(src).toContain("const clearOwnCue =");
    expect(src).toContain("onCue((current) => (current === mine ? null : current))");
    expect(src).toContain("onMouseLeave={clearOwnCue(onCue, i)}");
    expect(src).toContain("onMouseLeave={clearOwnCue(onCue, index)}");
  });

  it("releases on a tap away, since touch has no leave", () => {
    expect(src).toContain(
      'if (!(e.target as Element).closest(".report-growth__profile-cue")) onCue(null)'
    );
  });

  it("gives the dots a target a thumb can hit", () => {
    expect(src).toContain('className="report-growth__profile-hit"');
    expect(src).toContain("r={38}");
    // it paints nothing but must still take the pointer
    const hit = ruleBody(".report-growth__profile-hit");
    expect(hit).toContain("fill: transparent");
    expect(hit).toContain("pointer-events: all");
  });

  it("swells the dot from the wrapper, not the circle", () => {
    // The dot's entrance animation is `forwards`, and a filled animation value beats a
    // plain declaration — a `transform` on the circle is silently dropped, which left
    // the dot flat while its row lit up (reported 2026-08-22). Verified after the fix:
    // hovering a row grows its dot from 14.2px to 22.1px and dims the rest.
    expect(src).toContain("style={{ transformOrigin: `${dot.x}px ${dot.y}px` }}");
    const active = ruleBody(".report-growth__profile-cue.is-active");
    expect(active).toContain("transform: scale(1.55)");
    expect(active).toContain("drop-shadow");
    // the rule must target the wrapper alone — adding the circle back would break it
    expect(css).not.toContain(".report-growth__profile-cue.is-active .report-growth__profile-dot");
    const dim = ruleBody(
      ".report-growth__profile.is-cued .report-growth__profile-cue:not(.is-active)"
    );
    expect(dim).toContain("filter: opacity(0.32)");
  });

  it("highlights the cued row the way the ladder already highlights its first", () => {
    expect(ruleBody(".report-growth__rung.is-active")).toContain(
      "border-color: rgba(157, 138, 215, 0.45)"
    );
    // the first rung is orange to begin with, so its cue deepens the orange
    expect(ruleBody(".report-growth__rung.is-first.is-active")).toContain(
      "rgba(254, 104, 57, 0.45)"
    );
    // the rest step back — opacity only, never position
    const dim = ruleBody(".report-growth__ladder.is-cued .report-growth__rung:not(.is-active)");
    expect(dim).toContain("opacity: 0.55");
    expect(dim).not.toContain("translate");
    // the border is reserved at rest so nothing shifts when it appears
    expect(ruleBody(".report-growth__rung")).toContain("border: 1.128px solid transparent");
    expect(ruleBody(".report-growth__rung:focus-visible")).toContain("outline");
  });

  it("keeps the highlight for readers who ask for less motion", () => {
    const at = css.indexOf(".report-growth__profile-cue,\n  .report-growth__rung,");
    expect(at, "growth reduced-motion block").toBeGreaterThan(-1);
    expect(css.lastIndexOf("@media (prefers-reduced-motion: reduce)", at)).toBeGreaterThan(-1);
    const reduce = css.slice(at, css.indexOf("\n}\n", css.indexOf("scale: 1", at)));
    expect(reduce).toContain("transition: none");
    // the highlight is information, so only the movement goes
    expect(reduce).not.toContain("border-color");
    expect(reduce).not.toContain("background");
  });
});
