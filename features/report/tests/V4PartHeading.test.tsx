import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The V4 part heading (Figma 1:169 / 1:852 / 1:985) is drawn in a 361px column,
 * and its glow and two lines of type were placed at fixed lefts from that frame
 * (14 / 178.66 / 180.45). On a phone narrower than 393 the column shrinks — 288px
 * at 320 — and fixed lefts pushed the whole composition 36px right of centre.
 * Each is kept as the same offset from the centre instead: identical at 361,
 * centred on every phone.
 */

const V3_CSS = readFileSync(join(__dirname, "..", "ui", "v3", "reportV3.css"), "utf8");

const rule = (selector: string) => {
  const at = V3_CSS.indexOf(selector);
  expect(at, `${selector} missing from reportV3.css`).toBeGreaterThan(-1);
  return V3_CSS.slice(at, V3_CSS.indexOf("}", at));
};

describe("reportV3.css — the part heading stays centred on every phone", () => {
  it("places the glow from the centre, not the left edge (1:172: left 14 of 361)", () => {
    const css = rule(".rv3 .rv4-part__glow {");
    expect(css).toContain("left: calc(50% - 166.5px)");
    expect(css).not.toContain("left: 14px");
  });

  it("places the eyebrow and the title from the centre (1:173 / 1:174)", () => {
    expect(rule(".rv3 .rv4-part__eyebrow {")).toContain("left: calc(50% - 1.84px)");
    expect(rule(".rv3 .rv4-part__title {")).toContain("left: calc(50% - 0.05px)");
  });
});
