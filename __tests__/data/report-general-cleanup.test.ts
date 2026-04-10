import { describe, expect, it } from "vitest";
import { reportSections } from "@/data/report-general";

describe("report general content cleanup", () => {
  it("removes stray footnote references from the sexual stage section source", () => {
    const sexualStage = reportSections.find((section) => section.id === "sexual_stage");

    expect(sexualStage).toBeDefined();
    expect(sexualStage?.generalContent).toContain('"What do I actually like?"');
    expect(sexualStage?.generalContent).not.toContain("docs.google.com/document");
    expect(sexualStage?.generalContent).not.toContain('"What do I actually like?"1');
  });
});
