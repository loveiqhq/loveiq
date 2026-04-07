// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { reportSections } from "@/data/report-general";
import ReportNavigation from "@/components/report/ReportNavigation";

describe("ReportNavigation", () => {
  it("renders the chapter rail with premium badges and lock affordances", () => {
    render(
      <ReportNavigation
        activeSectionId="core_motivation"
        primaryArchetype="Spark Seeker"
        reportDate="April 7, 2026"
        sections={reportSections.slice(0, 5)}
      />
    );

    expect(screen.getAllByText(/spark seeker/i)[0]).toBeInTheDocument();
    expect(screen.getAllByText(/full report/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/free/i).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("navigation")[0]).toBeInTheDocument();

    const activeLinks = screen
      .getAllByRole("link")
      .filter((link) => link.getAttribute("aria-current") === "location");
    expect(activeLinks.some((link) => link.getAttribute("href") === "#core_motivation")).toBe(true);
  });
});
