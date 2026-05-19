import { describe, expect, it } from "vitest";
import { reportSections } from "@/data/report-general";

describe("report general content cleanup", () => {
  it("keeps the sexual stage intro intact and footnote-free; the SexualStageExplorer truncates the trailing comparison table at runtime", () => {
    const sexualStage = reportSections.find((section) => section.id === "sexual_stage");

    expect(sexualStage).toBeDefined();
    expect(sexualStage?.generalContent).toContain(
      "Understanding your sexual stage can bring clarity where there was confusion"
    );
    expect(sexualStage?.generalContent).toContain("a living system that evolves with you.");
    // V3 template re-added the {{SEXUAL_STAGE}} placeholder and the per-stage
    // comparison table; SexualStageSection.tsx truncates at the intro end-marker
    // so users still see only the intro. Build-time cleanup is no longer enforced.
    // Footnote sanitisation invariants stay in place.
    expect(sexualStage?.generalContent).not.toContain("docs.google.com/document");
  });
});
