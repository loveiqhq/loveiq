// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import ReportDesktopSidebar from "@features/report/ui/ReportDesktopSidebar";
import ReportMobileNav from "@features/report/ui/ReportMobileNav";
import { REPORT_NAV_IDS, REPORT_NAV_PARTS } from "@features/report/ui/reportNav";

// Without this the file's renders accumulate, and "which link is aria-current"
// then answers for every navigation rendered so far rather than this one.
afterEach(cleanup);

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

/**
 * Which list the scroll-spy walks.
 *
 * It walked the SECTION list from `data/report-general.ts`, which has no row for
 * any of the Report 2.0 anchors the nav lists — `snapshot`, `map`,
 * `constellation` — nor for the inline `means_for_you` / `findings` /
 * `challenges_in_partnership`. Through the whole of Part I the highlight was a
 * chapter behind: "Core Archetype" stayed lit from the top of the report to the
 * Insight Map, and "Importance of Sexuality" stayed lit through Other Archetypes.
 */
describe("scroll-spy source", () => {
  it("flattens every nav item, in nav order", () => {
    expect(REPORT_NAV_IDS).toEqual(REPORT_NAV_PARTS.flatMap((part) => part.items.map((i) => i.id)));
    // The anchors whose absence caused the lag.
    expect(REPORT_NAV_IDS).toContain("snapshot");
    expect(REPORT_NAV_IDS).toContain("map");
    expect(REPORT_NAV_IDS).toContain("constellation");
  });

  it("is what ReportPage measures, not the report-general section list", () => {
    const source = readFileSync(join(process.cwd(), "features/report/ui/ReportPage.tsx"), "utf8");
    const spy = source.slice(source.indexOf("function buildSectionTops()"));
    expect(spy).toMatch(/REPORT_NAV_IDS\.map\(\(id\) =>/);
    // The list is also sorted by position, so the loop's early `break` cannot be
    // truncated by a future reorder of either the nav or the body.
    expect(spy).toMatch(/\.sort\(\(a, b\) => a\.top - b\.top\)/);
  });

  it("marks a Report 2.0 anchor as current, in both navs", () => {
    // Nothing could ever set these active before, so nothing rendered them lit.
    const { unmount } = render(<ReportDesktopSidebar activeSectionId="snapshot" />);
    const lit = screen
      .getAllByRole("link")
      .filter((link) => link.getAttribute("aria-current") === "location");
    expect(lit.map((l) => l.getAttribute("href"))).toEqual(["#snapshot"]);
    unmount();

    render(<ReportMobileNav activeSectionId="map" />);
    expect(screen.getByRole("button", { name: /chapter:/i }).textContent).toMatch(
      /your insight map/i
    );
  });
});
