import { describe, expect, it } from "vitest";
import { archetypeContent } from "@/data/report-archetypes";
import { hasMeaningfulReportHtml } from "@/components/report/reportContent";

describe("report recommendations data", () => {
  it("contains meaningful recommendations html for every archetype", () => {
    const entries = Object.entries(archetypeContent.recommendations ?? {});

    expect(entries).toHaveLength(14);

    for (const [archetype, html] of entries) {
      expect(hasMeaningfulReportHtml(html)).toBe(true);
      expect(html).toContain("<h3");
      expect(html).toContain("What you");
      expect(archetype).not.toBe("");
    }
  });

  it("restores the Explorer of Edges recommendation set from source data", () => {
    expect(archetypeContent.recommendations["Explorer of Edges"]).toContain(
      "The Deep Psychology of BDSM and Kink"
    );
    expect(archetypeContent.recommendations["Explorer of Edges"]).toContain("The Ethical Slut");
  });
});
