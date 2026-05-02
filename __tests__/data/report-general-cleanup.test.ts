import { describe, expect, it } from "vitest";
import { reportSections } from "@/data/report-general";

describe("report general content cleanup", () => {
  it("keeps the sexual stage intro free of footnotes and stops at the closing intro paragraph", () => {
    const sexualStage = reportSections.find((section) => section.id === "sexual_stage");

    expect(sexualStage).toBeDefined();
    // Intro paragraphs still ship as HTML and end with the closing line —
    // the interactive explorer (SexualStageExplorer) owns everything that
    // used to follow.
    expect(sexualStage?.generalContent).toContain(
      "Understanding your sexual stage can bring clarity where there was confusion"
    );
    expect(sexualStage?.generalContent).toContain("a living system that evolves with you.");
    // Removed: per-stage descriptions, the comparison table, the placeholder line.
    expect(sexualStage?.generalContent).not.toContain('"What do I actually like?"');
    expect(sexualStage?.generalContent).not.toContain("{{SEXUAL_STAGE}}");
    expect(sexualStage?.generalContent).not.toContain("<table");
    // Footnote sanitisation invariants.
    expect(sexualStage?.generalContent).not.toContain("docs.google.com/document");
  });
});
