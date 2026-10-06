import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Review 27.09 — Mark (WhatsApp, Extra divider.jpeg): "Two divider lines here same
 * before part 6." Where a part opens after a closed chapter — Power Orientation before
 * Part IV, Energy & Risk before Part V, Curiosity & Relationship Form before Part VI —
 * the chapter's own closing hairline (634:230) sat 44 above the part's rule (1:983,
 * 38:1508, 1:1138): two identical fading lines. Figma never draws that junction: every
 * part page opens on its rule and every collapsed chapter frame ends on its hairline, so
 * the two only meet where the pages are stacked. The part keeps its rule, the chapter
 * gives up its line and keeps its 44px, so Parts IV-VI open exactly as II and III do.
 */

const V3_CSS = readFileSync(join(process.cwd(), "features/report/ui/v3/reportV3.css"), "utf8");

const rule = (selector: string) => {
  const at = V3_CSS.indexOf(`${selector} {`);
  if (at < 0) throw new Error(`no rule for ${selector}`);
  return V3_CSS.slice(at, V3_CSS.indexOf("}", at));
};

/** The frozen region V3 and V2 share must not move (lines 1-1884). */
const lineOf = (selector: string) =>
  V3_CSS.slice(0, V3_CSS.indexOf(`${selector} {`)).split("\n").length;

const JUNCTION = ".rv3.rv4 .rv4-chapter:not(.is-open):not(.is-static):has(+ .rv4-rule)::after";

describe("V4 part junctions — one line where a part opens after a closed chapter", () => {
  it("hides the closed chapter's hairline when the part's rule follows it", () => {
    expect(rule(JUNCTION)).toMatch(/display:\s*none;/);
    expect(lineOf(JUNCTION)).toBeGreaterThan(1884);
  });

  it("keeps the chapter's 44px, so the rule still sits one separator under it", () => {
    expect(rule(JUNCTION)).not.toMatch(/margin/);
    expect(rule(".rv3.rv4 .rv4-chapter:not(.is-open):not(.is-static)")).toMatch(
      /margin-bottom:\s*44px;/
    );
  });

  it("leaves every other closed chapter's hairline alone", () => {
    expect(rule(".rv3.rv4 .rv4-chapter:not(.is-open):not(.is-static)::after")).toMatch(
      /height:\s*1px;/
    );
  });
});

describe("V4 part rule — the line sits at the frame's foot (1:484, 1:850, 1:983, 38:1508, 1:1138)", () => {
  // Every "Seperator - Horizontal Line" is 19.078 tall with an 18.078 padding-top: its
  // 1px line is the frame's last pixel, 1px above the part heading. Centred, it sat 9px
  // higher than drawn, 57 above the eyebrow instead of 48.
  it("puts the 1px line at the bottom of the 19px rule", () => {
    const css = rule(".rv3 .rv4-rule");
    expect(css).toMatch(/align-items:\s*flex-end;/);
    expect(css).toMatch(/height:\s*19px;/);
  });
});
