import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Review 25.09, item 13 — Sanjin: the blurred text is "sometimes cut off, then looks
 * fine afterwards". A backdrop filter samples only its own box, and every ramp's
 * layers (and the article window's) were exactly as wide as the text, so each blurred
 * line began on a hard vertical cut; WebKit also repeats the box's edge pixels, which
 * drew a darker seam. The copy blurred with `filter` below the ramp spills softly past
 * its edge, which is the "then looks fine". The layers overhang the text by three times
 * the blur they build to, and stay inside the cards' padding: 8px while that was 2.5px,
 * 15px since review 26.09 raised it to 5px (v4Veil2609.test.ts).
 */
const css = readFileSync(join(__dirname, "..", "ui", "v3", "reportV3.css"), "utf8");
const first = (selector: string) => {
  const at = css.indexOf(selector);
  expect(at, `${selector} missing`).toBeGreaterThan(-1);
  return css.slice(at, css.indexOf("}", at));
};

describe("V4 — progressive blur layers overhang the text they blur", () => {
  it("lets every ramp's layers run three blurs past the text on both sides", () => {
    // …and past the block's foot since review 26.09 (v4Veil2609.test.ts).
    expect(first(".rv3 .rv4-pblur {")).toContain(
      "inset: 0 calc(var(--rv4-veil, 5px) * -3) calc(var(--rv4-pb-foot) * -1);"
    );
  });

  it("lets the article window's layers run three blurs past the text on both sides", () => {
    const blur = first(".rv3 .rv4-learn__blur {");
    expect(blur).toContain("left: calc(var(--rv4-veil, 5px) * -3);");
    expect(blur).toContain("right: calc(var(--rv4-veil, 5px) * -3);");
  });
});
