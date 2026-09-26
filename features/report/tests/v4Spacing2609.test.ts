import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Review round 26.09 — Mark: "Can we standardise the space between things/sections?
 * I know I haven't done a great job at it in Figma. I tried to do better now. This
 * space seems to big" (space1.png: Summary's "Does this resonate?" to the Snapshot
 * heading), and "Lets also standardise the space after elements, the 'Does this
 * resonate' and the next element … too much space between the Snapshot and the 'Does
 * this resonate' (ideally it sits just when the shadow visually stops) and then not
 * enough space between that and the Part III" (Does this resonate.png).
 *
 * Figma's grammar, read from today's frames: every "Does this resonate?" is the
 * component "Rating with buttom space", a 26px row over a 44px tail (1:747, 1:833,
 * 1:560); blocks are 44px "Seperator"s apart (1:734, 1:848, 1:858 …); every part
 * opens on the fading hairline "Seperator - Horizontal Line" (1:484, 1:850, 1:983,
 * 38:1508, 1:1138), its heading, and a 44px "Seperator" (1:491, 1:858, 1:991,
 * 38:1516, 1:1146). Measured at 393 on staging's tree: Summary's rating to the
 * Snapshot heading 112 (Figma 44), the Snapshot panel to its rating 64 (44), the
 * rating to Part III flush, the top three's rating 9px above "Core Archetype", the
 * card to the Summary ~75 (44), and the locked Challenges closing copy to "Try this"
 * 80 (305:358: 16 + the 44 separator, then the card flush — Headline change.png).
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

describe("V4 spacing — the Snapshot sits 44 under Summary's rating and 44 above its own", () => {
  it("drops the section margin and padding V2 gives #snapshot, so Summary's 44px tail is the gap", () => {
    const css = rule(".rv3.rv4 #snapshot");
    expect(css).toMatch(/margin-top:\s*0;/);
    expect(css).toMatch(/padding-top:\s*0;/);
    expect(lineOf(".rv3.rv4 #snapshot")).toBeGreaterThan(1884);
  });

  it("sets the Snapshot's rating 44 under the panel (1:848) with its own 44px tail (1:833)", () => {
    const css = rule(".rv3.rv4 #snapshot .rv3-chapter__feedback");
    expect(css).toMatch(/padding:\s*0 0 44px;/);
  });
});

describe("V4 spacing — 44 after every 'Does this resonate?'", () => {
  it("gives the top three's rating its full 44px tail before 'Core Archetype'", () => {
    // The 9px override matched a frame where 1:493 ended 9px under its rating; today
    // 1:560 is the component with its 44px tail, running into 1:576 (Figma overflow).
    expect(V3_CSS).not.toMatch(/\.rv4-top3 \.rv4-rating__tail\s*\{\s*height:\s*9px;/);
  });
});

describe("V4 spacing — the card to the Summary is one 44px separator (1:734)", () => {
  it("replaces V2's 48px section margin and hides the Summary's empty V2 header", () => {
    expect(rule(".rv3.rv4 #summary")).toMatch(/margin-top:\s*44px;/);
    expect(rule(".rv3.rv4 #summary .report-section__header")).toMatch(/display:\s*none;/);
  });
});

describe("V4 spacing — Challenges' closing copy meets 'Try this' after 16 + 44 (305:358, 38:1679)", () => {
  it("drops the body's bottom padding: the frames' fixed-height bodies end on the separator", () => {
    expect(rule(".rv3 .rv4-cip")).toMatch(/padding:\s*20px 0 0;/);
  });
});

describe("V4 spacing — the part rule fades out like Figma's hairline (1:485, 1:851, 1:1139)", () => {
  it("draws a 1px line from 10% ink to nothing, as the closed chapters' divider does", () => {
    expect(rule(".rv3 .rv4-rule::before")).toMatch(
      /background:\s*linear-gradient\(90deg, rgba\(22, 16, 33, 0\.1\), rgba\(22, 16, 33, 0\)\);/
    );
  });
});
