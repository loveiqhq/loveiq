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

  /**
   * One row per arm, named from the shared vocabulary. Until 2026-08-27 this was
   * two fixed columns and the second one, rendered "Dark / Control", was a bin
   * holding the retired dark arm, the live V1 arm and every arm-less submission at
   * once — on production it credited the dark landing page with 61 purchases and
   * €807.89 against an arm that sold nothing. These assert the RENDERED TEXT: the
   * bug was a screen that looked fine and read false.
   */
  const landingRows = [
    {
      variant: "white",
      label: "Landing Page V2 (Survey in Hero)",
      retired: false,
      completed: 310,
      paid: 47,
      revenue: 470,
      paidRate: 15.2,
    },
    {
      variant: "white_prev",
      label: "Landing Page V1 (First Design)",
      retired: false,
      completed: 288,
      paid: 31,
      revenue: 310,
      paidRate: 10.8,
    },
    {
      variant: "control",
      label: "Dark landing page (before V1)",
      retired: true,
      completed: 53,
      paid: 0,
      revenue: 0,
      paidRate: 0,
    },
    {
      variant: "unknown",
      label: "Not recorded",
      retired: false,
      completed: 805,
      paid: 61,
      revenue: 807.89,
      paidRate: 7.6,
    },
  ];

  const mockLanding = (rows: unknown[]) =>
    mockUseAdminFetch.mockReturnValue({
      data: { rows },
      loading: false,
      error: null,
      refetch: vi.fn(),
    });

  it("gives every landing arm its own row, named from the shared vocabulary", () => {
    mockLanding(landingRows);
    render(<LandingVariantTab days={30} />);

    expect(screen.getByText("Landing Page V2 (Survey in Hero)")).toBeInTheDocument();
    expect(screen.getByText("Landing Page V1 (First Design)")).toBeInTheDocument();
    expect(screen.getByText("Dark landing page (before V1)")).toBeInTheDocument();
    expect(screen.getByText("Not recorded")).toBeInTheDocument();

    // The old two-column framing must be gone: it is the thing that made three
    // different arms read as one.
    expect(screen.queryByText(/White vs Dark/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Dark \/ Control/i)).not.toBeInTheDocument();

    // Each arm keeps its OWN revenue — the €807.89 belongs to the unattributed
    // bucket, not to the dark landing page.
    expect(screen.getByText("€807.89")).toBeInTheDocument();
    expect(screen.getByText("€470.00")).toBeInTheDocument();
  });

  it("marks the retired arm and the unattributed bucket as not part of the test", () => {
    mockLanding(landingRows);
    render(<LandingVariantTab days={0} />);

    expect(screen.getByText(/no longer assigned/i)).toBeInTheDocument();
    expect(screen.getByText(/no arm was stamped/i)).toBeInTheDocument();
  });

  it("highlights the leading LIVE arm only", () => {
    mockLanding(landingRows);
    render(<LandingVariantTab days={30} />);

    // V2's 15.2% wins against V1's 10.8% — exactly one marker.
    expect(screen.getAllByText("▲")).toHaveLength(1);
    const winner = screen.getByText("15.2%");
    expect(winner.className).toContain("text-emerald-400");
  });

  it("never crowns the retired arm or the unattributed bucket, however high its rate", () => {
    // The regression this blocks: the unattributed bucket has the most rows by far,
    // so a naive "best rate wins" would routinely declare a winner that is not an
    // arm at all — and a retired arm cannot win a test that is not running.
    mockLanding([
      { ...landingRows[0], paidRate: 1.0 },
      { ...landingRows[2], paidRate: 99.0 },
      { ...landingRows[3], paidRate: 98.0 },
    ]);
    render(<LandingVariantTab days={30} />);

    // Only one live arm has data → no comparison → no marker at all.
    expect(screen.queryByText("▲")).not.toBeInTheDocument();
  });

  it("shows an empty state rather than a bare table when nothing is in the window", () => {
    mockLanding([]);
    render(<LandingVariantTab days={7} />);
    expect(screen.getByText(/No submissions in this window/i)).toBeInTheDocument();
  });
});
