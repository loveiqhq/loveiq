// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import V3TopThree from "@features/report/ui/v3/V3TopThree";
import V4TopThreeSection from "@features/report/ui/v3/V4TopThreeSection";
import { reportThemes } from "@features/report/ui/reportTheme";
import { report3ArchetypeBlurbs, report4ArchetypeBlurbs } from "@/data/report3-archetype-blurbs";

/**
 * "3 Highest Scoring Archetypes" (Figma 1:493), review round 25.09, slimmed 16.10.
 *
 * Sanjin wrote a description for every archetype (Google Doc
 * "Archetype_Descriptions_Constellations", 1fZDo_fH…, 25.09) and Mark put them in the
 * frame: "Updated text and had to increase the size of some elements to have more
 * space for text" (1941922555, Fatih tagged 1941968008). The slimmed report cut each
 * to one line (Sanjin's "Slimmed_Archetype_Descriptions_Constellations", 1ON0pxZ1…,
 * 16.10; frame 1665:3553): the lead row is 141 tall, the description at 12/19.2 in a
 * 50px track (two lines), rows 10 apart.
 */

const V3_CSS = readFileSync(join(process.cwd(), "features/report/ui/v3/reportV3.css"), "utf8");

afterEach(cleanup);

/** The slimmed doc, word for word: each line is the first sentence of the 25.09
 * description it replaces. Emotional Voyeur follows the doc, not the shorter line in
 * the slimmed frame (1665:3553) or the older draft in 1:553 (ruling 1). */
const DOC: Record<string, string> = {
  "Sensual Connector": "Closeness, trust, and slow, attentive touch make sex feel most satisfying.",
  "Spark Seeker": "Sex comes alive through play, tension, and novelty.",
  "Relational Nurturer": "Sex feels most fulfilling when care, warmth, and pleasure go both ways.",
  "Radiant Performer": "Feeling seen, desired, and admired is central to satisfying sex.",
  "Explorer of Edges":
    "Intensity, exploration, and experiences a little outside the ordinary are where sex feels most exciting.",
  "Curious Apprentice": "Curiosity, openness, and room to learn make sex feel most rewarding.",
  "Spiritual Lover": "Sex feels most meaningful when it carries emotional depth and significance.",
  "Minimalist Companion": "Simple, calm, pressure-free sex feels most natural.",
  "Emotional Voyeur":
    "Anticipation, fantasy, and room to observe are at the heart of what makes sex compelling.",
  "Authority Conductor":
    "Clear structure and defined power dynamics make sex feel most satisfying.",
  "Loyal Ritualist":
    "Familiarity, stability, and a trusted rhythm create the conditions where sex feels best.",
  "Tender Devotee": "Feeling wanted, reassured, and appreciated makes sex feel deeply satisfying.",
  "Analytical Sexualist":
    "Sex is most satisfying when there is space to understand what works and improve it together.",
  "Quiet Withdrawer":
    "Patience, gentleness, and freedom from pressure create the conditions where sex feels best.",
};

describe("report4ArchetypeBlurbs — Sanjin's descriptions, all fourteen", () => {
  it("has one for every archetype the report can rank", () => {
    expect(Object.keys(report4ArchetypeBlurbs).sort()).toEqual(Object.keys(reportThemes).sort());
  });

  it("reads each word for word as the doc", () => {
    expect(report4ArchetypeBlurbs).toEqual(DOC);
  });
});

describe("V4TopThreeSection — Part 2's first nav row lands on it (01.10)", () => {
  it("carries the nav's anchor, the id of the row '3 Highest Scoring Archetypes'", async () => {
    const { REPORT_V4_NAV_PARTS } = await import("@features/report/ui/v3/reportV3Nav");
    const { container } = render(<V4TopThreeSection />);
    const section = container.querySelector("section.rv4-top3")!;
    expect(section.id).toBe("top_archetypes");
    expect(REPORT_V4_NAV_PARTS[1]!.items[0]!.id).toBe(section.id);
  });
});

describe("V4TopThreeSection — the new descriptions on the page", () => {
  it("shows the reader's top three with the doc's descriptions", () => {
    const { container } = render(<V4TopThreeSection />);
    const blurbs = [...container.querySelectorAll(".rv3-top3__blurb")].map((p) => p.textContent);
    expect(blurbs).toEqual([
      DOC["Spark Seeker"],
      DOC["Explorer of Edges"],
      DOC["Emotional Voyeur"],
    ]);
  });

  it("describes any archetype that ranks, not only the three the frame demos", () => {
    const { container } = render(
      <V4TopThreeSection
        percentages={{ "Quiet Withdrawer": 41, "Loyal Ritualist": 38, "Tender Devotee": 35 }}
      />
    );
    const blurbs = [...container.querySelectorAll(".rv3-top3__blurb")].map((p) => p.textContent);
    expect(blurbs).toEqual([
      DOC["Quiet Withdrawer"],
      DOC["Loyal Ritualist"],
      DOC["Tender Devotee"],
    ]);
  });

  it("leaves V3's card on its own three one-liners (?v3=1)", () => {
    const { container } = render(
      <V3TopThree
        percentages={{ "Spark Seeker": 43.4, "Explorer of Edges": 39.5, "Emotional Voyeur": 36.2 }}
      />
    );
    const blurbs = [...container.querySelectorAll(".rv3-top3__blurb")].map((p) => p.textContent);
    expect(blurbs).toEqual([
      report3ArchetypeBlurbs["Spark Seeker"],
      report3ArchetypeBlurbs["Explorer of Edges"],
      report3ArchetypeBlurbs["Emotional Voyeur"],
    ]);
  });
});

describe("reportV3.css — the rows Mark enlarged (1:498)", () => {
  const last = (selector: string) => {
    const at = V3_CSS.lastIndexOf(selector);
    expect(at, selector).toBeGreaterThan(-1);
    // Appended below the frozen block (lines 1-1884), never edited into it.
    expect(V3_CSS.slice(0, at).split("\n").length, selector).toBeGreaterThan(1884);
    return V3_CSS.slice(at, V3_CSS.indexOf("}", at));
  };

  it("sets the description at 12/19.2 (1:511)", () => {
    const blurb = last(".rv3 .rv4-top3 .rv3-top3__blurb {");
    expect(blurb).toMatch(/font-size:\s*12px/);
    expect(blurb).toMatch(/line-height:\s*19\.2px/);
  });

  it("gives every row the slimmed frame's tracks: 26, at least 50 for two lines, 17.08", () => {
    expect(last(".rv3 .rv4-top3 .rv3-top3__row {")).toMatch(
      /grid-template-rows:\s*26px minmax\(50px, auto\) 17\.08px/
    );
  });

  it("pads the rows as drawn and keeps them 10 apart", () => {
    expect(last(".rv3 .rv4-top3 .rv3-top3__row {")).toMatch(/padding:\s*14px 12px 15px/);
    // The lead row is fixed at 141 in the slimmed frame: 14 + 1px ring on top, the rest below.
    expect(last(".rv3 .rv4-top3 .rv3-top3__row.is-lead {")).toMatch(
      /padding:\s*14px 12px 19\.92px/
    );
    expect(last(".rv3 .rv4-top3 .rv3-top3__row + .rv3-top3__row {")).toMatch(/margin-top:\s*10px/);
  });
});
