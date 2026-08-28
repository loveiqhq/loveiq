import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readAppCss } from "@shared/testing/read-app-css";

/**
 * The Over-Giving Loop's back-arrow — Figma's dashed curve, with the dashes moving.
 *
 * "Right now it looks broken and there are no animations" (MO, 2026-08-22) had three
 * separate causes, all fixed here:
 *   1. `pathLength={1}` normalised the path to one unit, so `stroke-dasharray: 3 4.5`
 *      asked for a three-unit dash on a one-unit path — one dash covering everything.
 *      It has never actually drawn as dashes.
 *   2. An <svg> is a replaced element: with `top`/`bottom` and `height: auto` the
 *      browser uses the viewBox's intrinsic 157.84px and ignores `bottom`, so the
 *      curve stopped 158px down however tall the chip stack was — on a phone it ended
 *      inside row 2.
 *   3. The only moving part was a second, brighter path that retired after three
 *      passes and faded out, so the piece was static by the time anyone scrolled back.
 *
 * Verified in a browser: 16 dashes over a 127px path, the pattern travelling UP
 * (cross-correlating two frames 280ms apart put frame B 4 device-px higher), and the
 * curve spanning the stack at 320-1440px while staying clear of the chips.
 */
const css = readAppCss();
const src = readFileSync(
  join(process.cwd(), "features/report/ui/sections/LibidoSection.tsx"),
  "utf8"
);
/** The declarations of the rule this selector belongs to — grouped selectors included. */
const ruleBody = (selector: string) => {
  const at = [css.indexOf(selector + " {"), css.indexOf(selector + ",")]
    .filter((i) => i > -1)
    .sort((a, b) => a - b)[0];
  expect(at, `missing rule: ${selector}`).toBeGreaterThan(-1);
  return css.slice(at, css.indexOf("}", at));
};

describe("libido loop arrow", () => {
  it("keeps Figma's dashed curve and arrowhead", () => {
    expect(src).toContain('strokeDasharray="3 4.5"');
    expect(src).toContain('className="report-libido__loop-curve"');
    expect(src).toContain('className="report-libido__loop-head"');
    // Figma's own setting, so it stretches with the stack
    expect(src).toContain('preserveAspectRatio="none"');
  });

  it("does not normalise the path away, so the dashes are dashes", () => {
    // scoped to the element, so the comment explaining why it went does not match
    const curveEl = src.slice(
      src.indexOf('className="report-libido__loop-curve"'),
      src.indexOf("/>", src.indexOf('className="report-libido__loop-curve"'))
    );
    expect(curveEl).not.toContain("pathLength");
    // ...and no CSS overrides the pattern back to a single dash
    expect(ruleBody(".report-libido__loop-curve")).not.toContain("stroke-dasharray");
  });

  it("stretches over the whole chip stack", () => {
    const box = ruleBody(".report-libido__loop-arrow");
    expect(box).toContain("height: calc(100% - 18px)");
    // `bottom` is ignored on a replaced element and would silently do nothing
    // (anchored to a declaration, so the comment explaining that does not match)
    expect(box).not.toMatch(/^\s*bottom:/m);
  });

  it("moves the dashes up into the arrowhead, and keeps moving", () => {
    const anim = ruleBody(".report-libido__loop-curve");
    expect(anim).toContain("libido-dash-flow");
    expect(anim).toContain("linear");
    expect(anim).toContain("infinite");
    // exactly one dash period (3 + 4.5), or the loop visibly jumps
    const kf = css.slice(css.indexOf("@keyframes libido-dash-flow"));
    expect(kf.slice(0, kf.indexOf("\n}\n"))).toContain("stroke-dashoffset: 7.5px");
    // the separate travelling segment that used to retire after 3 passes is gone
    expect(src).not.toContain("loop-current");
    expect(css).not.toContain("libido-loop-travel");
  });

  it("sends a pulse of light up the dashes into the arrowhead", () => {
    // The same dashes drawn a second time in a brighter ink, revealed only through a
    // feathered window that climbs the curve — so the marching dashes stay calm while
    // a pulse sweeps up them. Verified live: the pulse's centroid climbs 57% → 12% of
    // the curve, leaves the top, and the arrowhead flashes (fill-opacity 0.45 → 0.88)
    // on exactly those frames. Same behaviour at 390px, where the SVG is stretched.
    expect(src).toContain('mask="url(#libido-loop-window)"');
    expect(src).toContain('className="report-libido__loop-glow"');
    // both copies must share the dash animation or the bright dashes sit between the
    // base ones and it reads as double vision
    const shared = css.slice(css.indexOf(".report-libido__loop-curve,"));
    expect(shared.slice(0, shared.indexOf("}"))).toContain("libido-dash-flow");
    expect(shared.slice(0, shared.indexOf("}"))).toContain(".report-libido__loop-glow");

    const win = ruleBody(".report-libido__loop.is-revealed .report-libido__loop-window");
    expect(win).toContain("libido-glow-climb");
    expect(win).toContain("linear");
    // the travel is the viewBox (157.84) plus the window's own height (32), so it
    // starts fully below the curve and ends fully clear of the top
    const kf = css.slice(css.indexOf("@keyframes libido-glow-climb"));
    expect(kf.slice(0, kf.indexOf("\n}\n"))).toContain("translate: 0 -189.84px");

    // the arrowhead takes the landing, on the same period
    const head = ruleBody(".report-libido__loop.is-revealed .report-libido__loop-head");
    expect(head).toContain("libido-head-land");
    expect(head).toContain("2600ms");
    expect(win).toContain("2600ms");
  });

  it("fits the gutter on a phone", () => {
    // 22.6px arrow in a 16px gutter overlapped the chips
    // the indented copy is the one inside the media block
    const at = css.indexOf("  .report-libido__loop-arrow {");
    expect(at).toBeGreaterThan(-1);
    expect(css.lastIndexOf("@media (max-width: 768px)", at)).toBeGreaterThan(-1);
    expect(css.slice(at, css.indexOf("}", at))).toContain("width: 14px");
  });

  it("holds still for readers who ask for less motion", () => {
    // anchored on the block's own selector list, not on a nearby media query
    const at = css.indexOf(".report-libido__loop-curve,\n  .report-libido__loop-glow,");
    expect(at, "libido reduced-motion block").toBeGreaterThan(-1);
    expect(css.lastIndexOf("@media (prefers-reduced-motion: reduce)", at)).toBeGreaterThan(-1);
    const reduce = css.slice(at, css.indexOf("\n}\n", css.indexOf("display: none", at)));
    expect(reduce).toContain("animation: none !important");
    // the bright copy would otherwise sit as a hard-edged patch wherever the window
    // happened to stop
    expect(reduce).toContain("display: none");
  });
});
