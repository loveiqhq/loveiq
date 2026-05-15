import { beforeEach, describe, expect, it, vi } from "vitest";

const mockSupabaseFetch = vi.fn();
vi.mock("@features/admin/server/supabase", () => ({
  supabaseFetch: (...args: unknown[]) => mockSupabaseFetch(...args),
}));

const mockFetchMetricValue = vi.fn();
const mockLoadBenchmarkDefinitions = vi.fn();
vi.mock("@features/admin/server/metric-library", () => ({
  fetchMetricValue: (...args: unknown[]) => mockFetchMetricValue(...args),
  loadBenchmarkDefinitions: (...args: unknown[]) => mockLoadBenchmarkDefinitions(...args),
}));

const mockBuildForecastSnapshot = vi.fn();
vi.mock("@features/admin/server/forecasting", () => ({
  buildForecastSnapshot: (...args: unknown[]) => mockBuildForecastSnapshot(...args),
}));

vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { buildStrategySnapshot } from "@features/admin/server/strategy";

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("buildStrategySnapshot", () => {
  beforeEach(() => {
    vi.resetAllMocks();

    mockFetchMetricValue.mockResolvedValue(64);
    mockLoadBenchmarkDefinitions.mockResolvedValue([]);
    mockBuildForecastSnapshot.mockResolvedValue({
      generatedAt: "2026-03-31T12:00:00.000Z",
      modules: [
        {
          key: "completion_rate",
          label: "Completion",
          forecastValue: 61,
          href: "/admin/product-kpis",
        },
        { key: "submissions", label: "Starts", forecastValue: 12, href: "/admin/funnels" },
        { key: "report_views", label: "Report Views", forecastValue: 8, href: "/admin/reports" },
        { key: "revenue", label: "Revenue", forecastValue: 320, href: "/admin/revenue" },
      ],
    });

    mockSupabaseFetch.mockImplementation(async (path: string) => {
      if (path.includes("/rest/v1/admin_goals")) {
        return jsonResponse([
          {
            id: 1,
            label: "Improve completion",
            metric_key: "completion_rate",
            target_value: 70,
            deadline: "2026-04-15",
          },
        ]);
      }

      if (path.includes("/rest/v1/survey_submission") && path.includes("status=eq.flagged")) {
        return jsonResponse([]);
      }

      if (path.includes("/rest/v1/survey_submission") && path.includes("created_date_time=lt.")) {
        return jsonResponse([
          {
            id: 10,
            status: "completed",
            created_date_time: "2026-03-01T10:00:00.000Z",
            duration_ms: 600000,
            utm_tracker: '{"utm_source":"Instagram"}',
          },
        ]);
      }

      if (path.includes("/rest/v1/survey_submission")) {
        return jsonResponse([
          {
            id: 21,
            status: "completed",
            created_date_time: "2026-03-25T10:00:00.000Z",
            duration_ms: 660000,
            utm_tracker: '{"utm_source":"Instagram"}',
          },
          {
            id: 22,
            status: "started",
            created_date_time: "2026-03-26T12:00:00.000Z",
            duration_ms: 120000,
            utm_tracker: '{"utm_source":"Instagram"}',
          },
        ]);
      }

      if (path.includes("/rest/v1/waitlist_user") && path.includes("created_date_time=lt.")) {
        return jsonResponse([
          {
            id: 101,
            created_date_time: "2026-03-01T08:00:00.000Z",
            utm_tracker: '{"utm_source":"Instagram"}',
          },
        ]);
      }

      if (path.includes("/rest/v1/waitlist_user")) {
        return jsonResponse([
          {
            id: 201,
            created_date_time: "2026-03-24T08:00:00.000Z",
            utm_tracker: '{"utm_source":"Instagram"}',
          },
          {
            id: 202,
            created_date_time: "2026-03-25T09:00:00.000Z",
            utm_tracker: '{"utm_source":"Instagram"}',
          },
          {
            id: 203,
            created_date_time: "2026-03-26T10:00:00.000Z",
            utm_tracker: '{"utm_source":"Instagram"}',
          },
        ]);
      }

      if (path.includes("/rest/v1/scoring_result") && path.includes("created_date_time=lt.")) {
        return jsonResponse([
          {
            survey_submission_id: 10,
            primary_archetype: "Builder",
            v5_primary_archetype: "Builder",
            percentages: { Builder: 52, Explorer: 48 },
            v5_percentages: { Builder: 55, Explorer: 45 },
            survey_submission: {
              id: 10,
              created_date_time: "2026-03-01T10:00:00.000Z",
              status: "completed",
              utm_tracker: '{"utm_source":"Instagram"}',
            },
          },
        ]);
      }

      if (path.includes("/rest/v1/scoring_result")) {
        return jsonResponse([
          {
            survey_submission_id: 21,
            primary_archetype: "Builder",
            v5_primary_archetype: "Builder",
            percentages: { Builder: 52, Explorer: 48 },
            v5_percentages: { Builder: 56, Explorer: 44 },
            survey_submission: {
              id: 21,
              created_date_time: "2026-03-25T10:00:00.000Z",
              status: "completed",
              utm_tracker: '{"utm_source":"Instagram"}',
            },
          },
        ]);
      }

      if (
        path.includes("/rest/v1/admin_investigation_case") ||
        path.includes("/rest/v1/product_changelog") ||
        path.includes("/rest/v1/admin_chart_annotation") ||
        path.includes("/rest/v1/submission_tag?") ||
        path.includes("/rest/v1/submission_tag_assignment") ||
        path.includes("/rest/v1/admin_note") ||
        path.includes("/rest/v1/admin_experiment") ||
        path.includes("/rest/v1/admin_decision_entry") ||
        path.includes("/rest/v1/admin_review_request")
      ) {
        return jsonResponse([]);
      }

      if (path.includes("/rest/v1/rpc/get_predictive_insights")) {
        return jsonResponse([]);
      }

      if (path.includes("/rest/v1/rpc/get_conversion_pipeline")) {
        return jsonResponse({
          stages: {
            waitlist_signups: 5,
            survey_started: 4,
            survey_completed: 2,
            scored: 2,
            report_generated: 1,
            report_viewed: 1,
            payment_completed: 0,
          },
          by_utm: [
            {
              source: "Instagram",
              total: 4,
              completed: 2,
              conversion_rate: 50,
            },
          ],
          daily_funnel: [],
          time_to_complete: { avg_hours: 0.2, median_hours: 0.2 },
        });
      }

      throw new Error(`Unhandled Supabase path in test: ${path}`);
    });
  });

  it("normalizes the live conversion pipeline RPC shape for strategy surfaces", async () => {
    const snapshot = await buildStrategySnapshot(30);

    expect(snapshot.opportunities.leaderboards.channels[0]).toMatchObject({
      source: "Instagram",
      conversionRate: 50,
    });
    expect(snapshot.opportunities.funnelLeakage[0]).toMatchObject({
      from: "Survey Started",
      to: "Survey Completed",
      lossCount: 2,
      lossRate: 50,
    });
    expect(snapshot.northStar[0]?.drilldowns[0]).toMatchObject({
      label: "Best source",
      value: "Instagram 50%",
    });
  });
});
