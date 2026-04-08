import { describe, expect, it } from "vitest";
import { reportSections } from "@/data/report-general";
import {
  resolveReportNavTitle,
  resolveReportSectionTitle,
  resolveReportSections,
} from "@/components/report/reportTitles";

describe("reportTitles", () => {
  it("replaces archetype placeholders in section titles", () => {
    const section = reportSections.find(
      (entry) => entry.id === "typical_challenges_to_enjoy_sex_for_the_core_archetype"
    );

    expect(section).toBeDefined();
    expect(resolveReportSectionTitle(section!, "Spark Seeker")).toBe(
      "Typical Challenges to Enjoy Sex for the Spark Seeker"
    );
  });

  it("uses shorter nav labels for long sections and decodes entities", () => {
    const fantasiesSection = reportSections.find(
      (entry) => entry.id === "about_fantasies_desire_amp_pleasure_per_context"
    );
    const sustainSection = reportSections.find(
      (entry) => entry.id === "typical_challenges_to_sustain_partner_for_the_core_archetype"
    );

    expect(fantasiesSection).toBeDefined();
    expect(sustainSection).toBeDefined();
    expect(resolveReportNavTitle(fantasiesSection!, "Spark Seeker")).toBe("Fantasies by Context");
    expect(resolveReportNavTitle(sustainSection!, "Spark Seeker")).toBe(
      "Challenges in Partnership"
    );
  });

  it("returns report sections with separate display and nav titles", () => {
    const [section] = resolveReportSections(
      reportSections.filter(
        (entry) => entry.id === "about_fantasies_desire_amp_pleasure_per_context"
      ),
      "Spark Seeker"
    );

    expect(section.displayTitle).toBe("About Fantasies, Desire & Pleasure by Context");
    expect(section.navTitle).toBe("Fantasies by Context");
  });
});
