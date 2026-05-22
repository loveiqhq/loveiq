// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { reportSections } from "@/data/report-general";
import ReportDesktopSidebar from "@features/report/ui/ReportDesktopSidebar";
import ReportMobileNav from "@features/report/ui/ReportMobileNav";
import { resolveReportSections } from "@features/report/ui/reportTitles";

describe("ReportDesktopSidebar", () => {
  it("renders the chapter rail with branding, utility actions, and resolved chapter labels", () => {
    const sections = resolveReportSections(
      reportSections.filter((section) =>
        [
          "core_motivation",
          "typical_challenges_to_enjoy_sex_for_the_core_archetype",
          "libido_challenges_in_relationships",
        ].includes(section.id)
      ),
      "Spark Seeker"
    );

    render(
      <ReportDesktopSidebar
        activeSectionId="core_motivation"
        sections={sections}
        onShareClick={() => {}}
      />
    );

    expect(screen.getAllByLabelText(/loveiq report/i).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: /share report/i })[0]).toBeInTheDocument();
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

describe("ReportMobileNav", () => {
  it("renders the mobile topbar with branding and a menu button", () => {
    const sections = resolveReportSections(
      reportSections.filter((section) => section.id === "core_motivation"),
      "Spark Seeker"
    );

    render(<ReportMobileNav activeSectionId="core_motivation" sections={sections} />);

    expect(screen.getAllByLabelText(/loveiq report/i).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /open chapters menu/i })).toBeInTheDocument();
  });
});
