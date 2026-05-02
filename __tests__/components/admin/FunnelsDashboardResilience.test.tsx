// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const mockUseAdminFetch = vi.fn();

vi.mock("@/components/admin/hooks/useAdminFetch", () => ({
  useAdminFetch: (...args: unknown[]) => mockUseAdminFetch(...args),
}));

import ConversionFunnelTab from "@/components/admin/funnel-tabs/ConversionFunnelTab";
import CohortAnalysisTab from "@/components/admin/funnel-tabs/CohortAnalysisTab";
import ImpactComparisonTab from "@/components/admin/funnel-tabs/ImpactComparisonTab";

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
});
