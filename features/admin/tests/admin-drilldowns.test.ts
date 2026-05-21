import { describe, expect, it } from "vitest";
import {
  buildFunnelsHref,
  buildMetricDrilldownHref,
  buildProductKpiHref,
  buildScorecardHref,
} from "@features/admin/server/drilldowns";

describe("admin drilldown helpers", () => {
  it("builds KPI drilldowns with preserved window and chapter", () => {
    expect(buildProductKpiHref({ days: 30, tab: "Survey Questions", chapter: "5" })).toBe(
      "/admin/product-kpis?days=30&tab=Survey+Questions&chapter=5"
    );
  });

  it("builds funnel drilldowns with preserved UTM and grouping", () => {
    expect(
      buildFunnelsHref({ days: 7, tab: "Cohort Analysis", groupBy: "utm", utm: "google" })
    ).toBe("/admin/funnels?days=7&tab=Cohort+Analysis&utm=google&groupBy=utm");
  });

  it("maps experiment and goal metrics into focused admin surfaces", () => {
    expect(buildMetricDrilldownHref("completion_rate", { days: 30 })).toBe(
      "/admin/product-kpis?days=30&tab=Survey+Chapters"
    );
    expect(buildMetricDrilldownHref("scored_count", { days: 30, question: "01002" })).toBe(
      buildScorecardHref({ days: 30, tab: "Scorecard", question: "01002" })
    );
  });
});
