// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import ReportDesktopSidebar from "@features/report/ui/ReportDesktopSidebar";
import ReportMobileNav from "@features/report/ui/ReportMobileNav";

describe("ReportDesktopSidebar", () => {
  it("renders the chapter rail with branding, utility actions, and the curated part nav", () => {
    render(<ReportDesktopSidebar activeSectionId="core_archetype" onShareClick={() => {}} />);

    expect(screen.getAllByLabelText(/loveiq report/i).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: /share report/i })[0]).toBeInTheDocument();
    expect(screen.getAllByRole("navigation")[0]).toBeInTheDocument();

    // Gradient "Part N" group headers (Figma 8719:9326) replace the old
    // "Chapters" label + per-item tier chips.
    expect(screen.getByText(/part i · your core archetype/i)).toBeInTheDocument();
    expect(screen.getByText(/part iv · your growth edges/i)).toBeInTheDocument();

    // Curated nav items (combined/renamed vs the raw section list).
    expect(screen.getByRole("link", { name: /core archetype/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /reading recommendations/i })).toBeInTheDocument();

    // Tier chips and the {{CORE_ARCHETYPE}} placeholder are gone.
    expect(screen.queryByText(/full report/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/\{\{CORE_ARCHETYPE\}\}/i)).not.toBeInTheDocument();

    const activeLinks = screen
      .getAllByRole("link")
      .filter((link) => link.getAttribute("aria-current") === "location");
    expect(activeLinks.some((link) => link.getAttribute("href") === "#core_archetype")).toBe(true);
  });
});

describe("ReportMobileNav", () => {
  it("renders the mobile topbar with branding and a chapter pill trigger", () => {
    render(<ReportMobileNav activeSectionId="core_archetype" />);

    expect(screen.getAllByLabelText(/loveiq report/i).length).toBeGreaterThan(0);
    const pill = screen.getByRole("button", { name: /chapter:/i });
    expect(pill).toBeInTheDocument();
    expect(pill).toHaveAttribute("aria-haspopup", "dialog");
    expect(pill).toHaveAttribute("aria-expanded", "false");
  });
});
