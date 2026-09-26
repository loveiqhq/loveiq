import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Review 26.09 — Mark: "I can read the blurred pieces and the scores … Blur 5 in Figma
 * makes it non readable. If it already is Figma's blurred 5, we need to increase the
 * blur here or think about building a fade on top." The locked surfaces blurred at
 * CSS 2px (the fantasy table and map, the A&B rows; Figma radius 4) and 2.5px (the
 * gated copy; Figma 5), and since this round they carry the real copy
 * (lockedBlurCopy.ts). Rendered at 393 on a 3x screen with the real fonts, the
 * fantasy names, the scores, the A&B labels and 16px prose still read at 2-4px; at
 * 5px (Figma radius 10) none of them does. One variable sets it everywhere, the
 * ramps build to it, and their layers overhang three times as far.
 */

const css = readFileSync(join(__dirname, "..", "ui", "v3", "reportV3.css"), "utf8");
const rule = (selector: string) => {
  const at = css.indexOf(`${selector} {`);
  expect(at, `${selector} missing`).toBeGreaterThan(-1);
  return css.slice(at, css.indexOf("}", at));
};

const VEIL = "blur(var(--rv4-veil, 5px))";

describe("V4 — one blur strength for every locked surface", () => {
  it("sets it once, at 5px, on the V4 page and the preview document", () => {
    expect(rule(".rv3:is(.rv4, .rv4-doc)")).toMatch(/--rv4-veil:\s*5px;/);
  });

  it.each([
    ".rv3 .rv4-fvt__blurred",
    ".rv3 .rv4-fvm__blurred",
    ".rv3 .rv4-fvr__blurred",
    ".rv3 .rv4-trig__row.is-locked.is-blurred",
    ".rv3 .rv4-tb__blurred",
    ".rv3 .rv4-try__blurred",
    ".rv3 .rv4-ab__blurred",
    ".rv3 .rv4-cip__blurred",
    ".rv3 .rv4-cip__closing.is-blurred",
    ".rv3 .rv4-loop.is-locked .rv4-loop__viewport",
  ])("blurs %s by it", (selector) => {
    expect(rule(selector)).toContain(`filter: ${VEIL};`);
  });

  it("blurs Typical Beliefs' locked rows by it", () => {
    expect(
      rule(".rv3 .rv4-turn__row.is-locked.is-blurred,\n.rv3 .rv4-sun__row.is-locked.is-blurred")
    ).toContain(`filter: ${VEIL};`);
  });

  it("leaves no weaker literal blur on a locked surface in V4's rules", () => {
    // Past the frozen V3 region. The decorative glows (14px and up) are not copy.
    const v4 = css.split("\n").slice(1884).join("\n");
    // Declarations only: `@supports (backdrop-filter: blur(1px))` is a feature test.
    const literal = [...v4.matchAll(/^\s*filter: blur\((\d+(?:\.\d+)?)px\)/gm)].map((m) =>
      Number(m[1])
    );
    for (const px of literal) expect(px, `blur(${px}px)`).toBeGreaterThanOrEqual(14);
  });
});

describe("V4 — the ramps build to the same strength", () => {
  // Stacked blurs add in quadrature: 0.32, 0.556 and 0.768 of the veil land on it.
  const LAYERS = [
    ["1", "0.32"],
    ["2", "0.556"],
    ["3", "0.768"],
  ] as const;

  it.each(LAYERS)("scales the paywall ramp's layer %s by %s", (n, k) => {
    expect(rule(`.rv3 .rv4-pblur > span:nth-child(${n})`)).toContain(
      `--rv4-pb: calc(var(--rv4-veil, 5px) * ${k});`
    );
  });

  it.each(LAYERS)("scales the article window's layer %s by %s", (n, k) => {
    expect(rule(`.rv3 .rv4-learn__blur > span:nth-child(${n})`)).toContain(
      `--rv4-blur: calc(var(--rv4-veil, 5px) * ${k});`
    );
  });

  it("adds up to the veil", () => {
    const total = Math.sqrt(0.32 ** 2 + 0.556 ** 2 + 0.768 ** 2);
    expect(total).toBeCloseTo(1, 2);
  });
});

describe("V4 — the stronger blur keeps its edges soft", () => {
  // Seen at 393 on a 3x screen once the veil was 5px: a backdrop filter blurs only
  // what its box covers, so (1) a ramp's layers, flush with its block, cut the last
  // line's halo off in a straight line at the block's foot, and (2) on A&B's card,
  // whose rows leave it 14px, the 15px overhang covered the card's border and smeared
  // it over row 3.
  it("runs every ramp's layers three blurs past the block's foot", () => {
    const layers = rule(".rv3 .rv4-pblur");
    expect(layers).toContain("--rv4-pb-foot: calc(var(--rv4-veil, 5px) * 3);");
    expect(layers).toContain(
      "inset: 0 calc(var(--rv4-veil, 5px) * -3) calc(var(--rv4-pb-foot) * -1);"
    );
  });

  it("still draws the band over the block alone, the foot under the full blur", () => {
    // The gradient is sized to the block, so its percentage bands (64%, 65.6%, 100%…)
    // keep their drawn length; a second, solid layer covers the foot.
    // Whitespace-insensitive: Prettier may break the two layers over lines.
    const span = rule(".rv3 .rv4-pblur > span").replace(/\s+/g, " ");
    for (const prefix of ["", "-webkit-"]) {
      expect(span).toContain(
        `${prefix}mask-image: linear-gradient(180deg, transparent var(--rv4-pf), #000 var(--rv4-pt)), linear-gradient(#000, #000);`
      );
      expect(span).toContain(`${prefix}mask-position: 0 0, 0 100%;`);
      expect(span).toContain(`${prefix}mask-repeat: no-repeat;`);
      expect(span).toContain(
        `${prefix}mask-size: 100% calc(100% - var(--rv4-pb-foot)), 100% var(--rv4-pb-foot);`
      );
    }
  });

  it("fades the article window's foot as wide as its blur runs", () => {
    // (3) The fade spanned the copy's box, so the halo spilling past it was left
    // unfaded: dark stubs at both edges of the last lines, cut off where the window
    // ends. The card's 22.5px padding has room for the 15px.
    const fade = rule(".rv3 .rv4-learn__fade");
    expect(fade).toContain("left: calc(var(--rv4-veil, 5px) * -3);");
    expect(fade).toContain("right: calc(var(--rv4-veil, 5px) * -3);");
  });

  it("lets the article window's layers sample past its foot and draw nothing there", () => {
    // (4) At the window's foot the layers had only the letter tops the window cuts
    // through to sample, and those stayed legible under the full blur (Fantasy vs.
    // Reality's article, whose frame draws no fade there). Run past the foot, they
    // blur the tops against the plain card below, and a hard stop keeps the window
    // ending where 482:6479 ends it.
    const layers = rule(".rv3 .rv4-learn__blur");
    expect(layers).toContain("--rv4-learn-foot: calc(var(--rv4-veil, 5px) * 3);");
    expect(layers).toContain("height: calc(656px + var(--rv4-learn-foot));");
    expect(rule(".rv3 .rv4-learn.has-own-gate .rv4-learn__blur")).toContain(
      "height: calc(var(--rv4-learn-window) + var(--rv4-learn-foot));"
    );
    const span = rule(".rv3 .rv4-learn__blur > span")
      .replace(/\s+/g, " ")
      .replace(/\(\s+/g, "(")
      .replace(/\s+\)/g, ")");
    for (const prefix of ["", "-webkit-"]) {
      expect(span).toContain(
        `${prefix}mask-image: linear-gradient(180deg, transparent var(--rv4-from), #000 var(--rv4-to), #000 calc(100% - var(--rv4-learn-foot)), transparent calc(100% - var(--rv4-learn-foot)));`
      );
    }
  });

  it("keeps the A&B ramp row's layers inside the card's 14px beside the rows", () => {
    const ramp = rule(".rv3 .rv4-trig__ramp");
    expect(ramp).toContain("left: -13px;");
    expect(ramp).toContain("right: -13px;");
  });
});
