// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const mockUseAdminFetch = vi.fn();

vi.mock("@features/admin/ui/hooks/useAdminFetch", () => ({
  useAdminFetch: (...args: unknown[]) => mockUseAdminFetch(...args),
}));

import ConversionFunnelTab from "@features/admin/ui/funnel-tabs/ConversionFunnelTab";
import CohortAnalysisTab from "@features/admin/ui/funnel-tabs/CohortAnalysisTab";
import ImpactComparisonTab from "@features/admin/ui/funnel-tabs/ImpactComparisonTab";
import LandingVariantTab from "@features/admin/ui/funnel-tabs/LandingVariantTab";

beforeEach(() => {
  mockUseAdminFetch.mockReset();
});

afterEach(cleanup);

describe("Funnels dashboard resilience", () => {
  it("renders conversion funnel fallback when trust metadata is missing", () => {
    mockUseAdminFetch.mockReturnValue({
      data: {
        stages: [{ name: "survey_started", count: 12 }],
      },
      loading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<ConversionFunnelTab days={30} utmFilter="" onUtmFilterChange={vi.fn()} />);

    expect(screen.getByText("Conversion Funnel")).toBeInTheDocument();
    expect(screen.getByText(/No comparison data is available/i)).toBeInTheDocument();
  });

  it("renders cohort analysis fallback when summary metadata is missing", () => {
    mockUseAdminFetch.mockReturnValue({
      data: {
        rows: [
          {
            label: "google",
            total_users: 10,
            survey_started: 8,
            survey_completed: 6,
            scored: 5,
            invite_sent: 2,
          },
        ],
      },
      loading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<CohortAnalysisTab days={30} groupBy="week" onGroupByChange={vi.fn()} />);

    expect(screen.getByText("Strongest Completion")).toBeInTheDocument();
    expect(screen.getAllByText("No data")).toHaveLength(2);
    expect(screen.getByText("google")).toBeInTheDocument();
  });

  it("renders impact comparison fallback when trust and comparison arrays are missing", () => {
    mockUseAdminFetch.mockReturnValue({
      data: {
        generatedAt: "2026-04-01T12:00:00.000Z",
        summary: {
          releaseComparisons: 0,
          versionComparisons: 0,
          experimentComparisons: 0,
          strongestRelease: null,
          strongestVersion: null,
          strongestExperiment: null,
        },
      },
      loading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(
      <ImpactComparisonTab days={30} comparisonMode="release" onComparisonModeChange={vi.fn()} />
    );

    expect(screen.getByText("Impact Comparison")).toBeInTheDocument();
    expect(screen.getByText("Compared Releases")).toBeInTheDocument();
  });

  it("renders the landing A/B comparison and highlights the higher paid rate", () => {
    mockUseAdminFetch.mockReturnValue({
      data: {
        rows: [
          {
            variant: "white",
            visitors: 1240,
            completed: 310,
            paid: 47,
            revenue: 470,
            paidRate: 15.2,
            completionRate: 25,
          },
          {
            variant: "control",
            visitors: 1198,
            completed: 288,
            paid: 31,
            revenue: 310,
            paidRate: 10.8,
            completionRate: 24,
          },
        ],
      },
      loading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<LandingVariantTab days={30} />);

    expect(screen.getByText("Landing A/B — White vs Dark")).toBeInTheDocument();
    expect(screen.getByText("15.2%")).toBeInTheDocument();
    expect(screen.getByText("10.8%")).toBeInTheDocument();
    expect(screen.getByText("€470.00")).toBeInTheDocument();
    expect(screen.getByText("€310.00")).toBeInTheDocument();
    // White's paid rate wins → exactly one winner marker, and no "empty" banner.
    expect(screen.getByText("▲")).toBeInTheDocument();
    expect(screen.queryByText(/No white-cohort activity/i)).not.toBeInTheDocument();
  });

  it("shows the empty-cohort banner when white has no activity yet (real prod state)", () => {
    mockUseAdminFetch.mockReturnValue({
      data: {
        rows: [
          {
            variant: "control",
            visitors: 0,
            completed: 769,
            paid: 60,
            revenue: 777.9,
            paidRate: 7.8,
            completionRate: null,
          },
          {
            variant: "white",
            visitors: 0,
            completed: 0,
            paid: 0,
            revenue: 0,
            paidRate: 0,
            completionRate: null,
          },
        ],
      },
      loading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<LandingVariantTab days={0} />);

    // Control data still renders…
    expect(screen.getByText("769")).toBeInTheDocument();
    expect(screen.getByText("€777.90")).toBeInTheDocument();
    // …and the empty-white banner explains the zeros instead of looking broken.
    expect(screen.getByText(/No white-cohort activity/i)).toBeInTheDocument();
    // With only one arm populated, no winner marker is shown.
    expect(screen.queryByText("▲")).not.toBeInTheDocument();
  });
});
