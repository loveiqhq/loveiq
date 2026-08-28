import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readAppCss } from "@shared/testing/read-app-css";

/**
 * The above-the-fold reveal on both landing arms.
 *
 * Fixed 2026-08-28 after PageSpeed put the landing page's LCP render delay at 2,890 ms
 * with a 40 ms TTFB. Measured at Lighthouse mobile settings, the hero sub-paragraph was
 * invisible from 1.26 s (when the stylesheet applied `opacity: 0`) until 3.73 s, because
 * `.animate-on-scroll` waits for the JS bundle, hydration and an IntersectionObserver
 * before it starts — for content that is already in the viewport and has nothing to
 * scroll into. LCP on the V1 arm was 5,208 ms.
 *
 * Three things have to stay true, and every one of them is the kind that rots quietly:
 * a hero element reverting to the scroll class, the keyframe being "tidied" back to
 * `opacity: 0`, and the two arms drifting apart.
 */
const HEROES = [
  ["V2 (current)", "features/landing/ui/white/WHero.tsx"],
  ["V1 (previous)", "features/landing/ui/white-v1/WHero.tsx"],
] as const;

/**
 * Comments stripped. The first version of this test read `opacity: 0` out of the
 * explanatory comment ON the keyframe — which says "opacity:0 is excluded from LCP" —
 * and failed against correct CSS. Parse the rules, not the prose.
 */
const css = readAppCss().replace(/\/\*[\s\S]*?\*\//g, "");
const read = (f: string) => readFileSync(join(process.cwd(), f), "utf8");

describe("hero above-the-fold reveal", () => {
  it.each(HEROES)("%s reveals without waiting for JavaScript", (_name, file) => {
    const src = read(file);
    expect(src).toContain("animate-on-load");
    // The whole point. `.animate-on-scroll` in a hero means opacity:0 until hydration.
    expect(
      src,
      `${file} is above the fold — animate-on-scroll leaves it blank until hydration`
    ).not.toContain("animate-on-scroll");
  });

  /**
   * Both arms or neither. This is not tidiness: an A/B test where one arm paints two
   * seconds sooner than the other is measuring page speed as well as design, and the
   * landing arms are live and being read for a conversion verdict. Fixing one arm alone
   * would silently confound it.
   */
  it("keeps both landing arms on the same reveal mechanism", () => {
    const counts = HEROES.map(([, f]) => (read(f).match(/animate-on-load/g) ?? []).length);
    expect(
      counts.every((n) => n > 0),
      "an arm has no on-load reveal at all"
    ).toBe(true);
  });

  it("starts the fade from a VISIBLE floor, because opacity:0 is excluded from LCP", () => {
    /**
     * Chrome ignores an element whose computed opacity is exactly 0 as an LCP candidate.
     * The largest element on this page is the hero sub-paragraph (~39,000 px²), so a
     * fade from 0 hid it from the metric and measured LCP got WORSE — 1,416 ms to
     * 2,040 ms on V2 — while the content actually appeared two seconds earlier. From a
     * visible floor: 1,412 ms. Reverting this to 0 undoes the fix while looking neater.
     */
    const frames = /@keyframes w-reveal-up\s*\{([\s\S]*?)\n\}/.exec(css);
    expect(frames, "@keyframes w-reveal-up not found in the shipped CSS").not.toBeNull();
    const from = /from\s*\{([\s\S]*?)\}/.exec(frames![1]);
    expect(from, "w-reveal-up has no `from` frame").not.toBeNull();

    const opacity = /opacity:\s*([\d.]+)/.exec(from![1]);
    expect(opacity, "w-reveal-up `from` sets no opacity").not.toBeNull();
    expect(Number(opacity![1]), "opacity:0 in `from` removes the element from LCP").toBeGreaterThan(
      0
    );
  });

  it("settles fully visible, so nothing is left faded or offset", () => {
    // `both` fill mode is what holds the final frame; without it the element snaps back
    // to its unanimated state and the hero would sit 24px low at 25% opacity forever.
    const rule = /\.animate-on-load\s*\{([^}]*)\}/.exec(css);
    expect(rule).not.toBeNull();
    expect(rule![1]).toContain("both");

    const to = /@keyframes w-reveal-up[\s\S]*?to\s*\{([\s\S]*?)\}/.exec(css);
    expect(to![1]).toMatch(/opacity:\s*1/);
    expect(to![1]).toMatch(/translateY\(0\)/);
  });

  it("gives reduced-motion visitors the hero at once", () => {
    /**
     * 41 `prefers-reduced-motion` blocks exist across the two stylesheets, so this
     * brace-matches every one and asserts that SOME block genuinely covers this class.
     * An earlier version used indexOf and matched an unrelated block.
     */
    const blocks: string[] = [];
    const needle = "@media (prefers-reduced-motion: reduce)";
    for (let from = 0; ; ) {
      const open = css.indexOf(needle, from);
      if (open === -1) break;
      let depth = 0;
      let i = css.indexOf("{", open);
      const start = i;
      for (; i < css.length; i++) {
        if (css[i] === "{") depth++;
        else if (css[i] === "}" && --depth === 0) break;
      }
      blocks.push(css.slice(start, i));
      from = open + needle.length;
    }
    expect(blocks.length).toBeGreaterThan(0);

    const covering = blocks.filter((b) => /\.animate-on-load\b/.test(b));
    expect(covering.length, "no reduced-motion block covers .animate-on-load").toBeGreaterThan(0);
    // Motion off AND no opacity ramp: a reduced-motion visitor gets the hero at once,
    // not a slow fade with the movement stripped out.
    expect(covering.some((b) => /animation:\s*none/.test(b) && /opacity:\s*1/.test(b))).toBe(true);
  });
});
