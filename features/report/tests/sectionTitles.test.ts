import { describe, expect, it } from "vitest";
import { reportSections } from "@/data/report-general";
import { resolveReportNavTitle, resolveReportSectionTitle } from "@features/report/sectionTitles";

describe("sectionTitles (server-safe entry point)", () => {
  it("injects the archetype placeholder into display titles", () => {
    const section = reportSections.find(
      (entry) => entry.id === "typical_growth_potentials_for_the_core_archetype"
    );
    expect(section).toBeDefined();
    expect(resolveReportSectionTitle(section!, "Tender Devotee")).toContain("Tender Devotee");
  });

  it("uses the short nav label for long section ids", () => {
    const section = reportSections.find(
      (entry) => entry.id === "attachment_style_how_safety_closeness_and_distance_shape_desire"
    );
    expect(section).toBeDefined();
    expect(resolveReportNavTitle(section!, "Tender Devotee")).toBe("Attachment Style");
  });

  it("decodes HTML entities in titles (e.g. & instead of &amp;)", () => {
    const section = reportSections.find(
      (entry) => entry.id === "about_fantasies_desire_amp_pleasure_per_context"
    );
    expect(section).toBeDefined();
    expect(resolveReportSectionTitle(section!, "Tender Devotee")).toBe(
      "About Fantasies, Desire & Pleasure by Context"
    );
  });
});
