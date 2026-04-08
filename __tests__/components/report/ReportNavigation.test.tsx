// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { reportSections } from "@/data/report-general";
import ReportNavigation from "@/components/report/ReportNavigation";
import { resolveReportSections } from "@/components/report/reportTitles";

describe("ReportNavigation", () => {
  it("renders the chapter rail with branding, utility actions, and resolved chapter labels", () => {
    const sections = resolveReportSections(
      reportSections.filter((section) =>
        [
          "core_motivation",
          "typical_challenges_to_enjoy_sex_for_the_core_archetype",
          "libido_challenges_in_relationships_when_desire_becomes_conditional",
        ].includes(section.id)
      ),
      "Spark Seeker"
    );

    render(
      <ReportNavigation
        activeSectionId="core_motivation"
        primaryArchetype="Spark Seeker"
        reportDate="April 7, 2026"
        sections={sections}
      />
    );

    expect(screen.getAllByText(/spark seeker/i)[0]).toBeInTheDocument();
    expect(screen.getByAltText(/loveiq/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /share report/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /refer a friend/i })).toBeInTheDocument();
    expect(screen.getAllByText(/full report/i).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("navigation")[0]).toBeInTheDocument();
    expect(screen.getAllByText(/challenges to enjoy sex/i)[0]).toBeInTheDocument();
    expect(screen.queryByText(/\{\{CORE_ARCHETYPE\}\}/i)).not.toBeInTheDocument();

    const activeLinks = screen
      .getAllByRole("link")
      .filter((link) => link.getAttribute("aria-current") === "location");
    expect(activeLinks.some((link) => link.getAttribute("href") === "#core_motivation")).toBe(true);
  });
});
