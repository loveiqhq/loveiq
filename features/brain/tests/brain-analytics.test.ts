import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@features/admin/server/supabase", () => ({
  supabaseFetch: vi.fn(),
}));

import { buildAnalyticsRows, isoWeek } from "@features/brain/server/ingest/analytics";
import { googleScopeHint, GA4_SCOPE } from "@shared/http/google-oauth";

const STAMP = "2026-08-26T00:00:00.000Z";

function day(
  d: string,
  over: Partial<Record<string, number | string>> = {}
): Parameters<typeof buildAnalyticsRows>[0][number] {
  return {
    day: d,
    unique_visitors: 100,
    survey_starts: 10,
    intro_completed: 8,
    submissions: 5,
    reports_created: 5,
    reports_paid: 1,
    revenue: "49",
    report_opens: 7,
    invites_sent: 0,
    top_sources: { direct: 80, google: 20 },
    ...over,
  } as Parameters<typeof buildAnalyticsRows>[0][number];
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.clearAllMocks());

describe("isoWeek", () => {
  it("returns the ISO week key", () => {
    expect(isoWeek("2026-08-19")).toBe("2026-W34");
  });

  it("puts Monday and the following Sunday in the same week", () => {
    // ISO weeks run Monday to Sunday; a naive implementation splits them.
    expect(isoWeek("2026-08-17")).toBe(isoWeek("2026-08-23"));
  });

  it("puts Sunday and the next Monday in different weeks", () => {
    expect(isoWeek("2026-08-23")).not.toBe(isoWeek("2026-08-24"));
  });

  it("assigns a year-boundary date to the year owning its Thursday", () => {
    // 2027-01-01 is a Friday, so it belongs to the last ISO week of 2026.
    expect(isoWeek("2027-01-01")).toBe("2026-W53");
  });
});

describe("buildAnalyticsRows", () => {
  it("emits a daily, a weekly and a monthly chunk", () => {
    const rows = buildAnalyticsRows([day("2026-08-19")], STAMP);
    expect(rows.map((r) => r.source_id).sort()).toEqual([
      "daily:2026-08-19",
      "monthly:2026-08",
      "weekly:2026-W34",
    ]);
    expect(rows.every((r) => r.source === "analytics")).toBe(true);
  });

  it("totals the weekly and monthly grains instead of repeating a day", () => {
    // The whole reason the coarser grains exist: the model should read a total,
    // not add seven numbers up itself.
    const rows = buildAnalyticsRows([day("2026-08-17"), day("2026-08-18")], STAMP);
    const weekly = rows.find((r) => r.source_id === "weekly:2026-W34");
    expect(weekly?.meta.visitors).toBe(200);
    expect(weekly?.meta.revenue).toBe(98);
    expect(weekly?.body).toContain("Website visitors: 200");
  });

  it("skips days with no activity so zero rows cannot crowd retrieval", () => {
    const rows = buildAnalyticsRows(
      [
        day("2026-08-19"),
        day("2026-08-20", {
          unique_visitors: 0,
          submissions: 0,
          reports_created: 0,
          reports_paid: 0,
          revenue: "0",
          survey_starts: 0,
          report_opens: 0,
          top_sources: {},
        }),
      ],
      STAMP
    );
    expect(rows.some((r) => r.source_id === "daily:2026-08-20")).toBe(false);
    expect(rows.some((r) => r.source_id === "daily:2026-08-19")).toBe(true);
  });

  it("renders percentages a reader can act on", () => {
    const rows = buildAnalyticsRows([day("2026-08-19")], STAMP);
    const daily = rows.find((r) => r.source_id === "daily:2026-08-19");
    expect(daily?.body).toContain("Survey starts: 10 (10.0% of visitors)");
    expect(daily?.body).toContain("Signups (completed surveys): 5 (50.0% of starts)");
    expect(daily?.body).toContain("Revenue: EUR 49.00");
  });

  it("carries the words people actually search with", () => {
    // Measured failure: with "Period: 2026-08" and "Survey completions", the
    // question "how many people signed up in August" matched nothing at all.
    const rows = buildAnalyticsRows([day("2026-08-19")], STAMP);
    const monthly = rows.find((r) => r.source_id === "monthly:2026-08");
    expect(monthly?.title).toContain("August 2026");
    expect(`${monthly?.title} ${monthly?.body}`).toContain("Signups");
    expect(monthly?.body).toContain("Paid customers");
    expect(monthly?.body).toContain("Traffic sources");
    // The machine-readable key stays available for an exact-date question.
    expect(monthly?.body).toContain("2026-08");
  });

  it("sums traffic sources across a grain rather than showing one day's", () => {
    const rows = buildAnalyticsRows([day("2026-08-17"), day("2026-08-18")], STAMP);
    const weekly = rows.find((r) => r.source_id === "weekly:2026-W34");
    expect(weekly?.body).toContain("direct 160");
    expect(weekly?.body).toContain("google 40");
  });

  it("labels a week by its date range, not by a week number nobody uses", () => {
    const rows = buildAnalyticsRows([day("2026-08-17"), day("2026-08-19")], STAMP);
    const weekly = rows.find((r) => r.source_id === "weekly:2026-W34");
    expect(weekly?.title).toContain("Monday 17 August 2026");
    expect(weekly?.title).toContain("Wednesday 19 August 2026");
  });

  it("says n/a rather than dividing by zero", () => {
    const rows = buildAnalyticsRows(
      [day("2026-08-19", { unique_visitors: 0, survey_starts: 0 })],
      STAMP
    );
    const daily = rows.find((r) => r.source_id === "daily:2026-08-19");
    expect(daily?.body).toContain("n/a");
    expect(daily?.body).not.toContain("NaN");
    expect(daily?.body).not.toContain("Infinity");
  });

  it("names the weekday, because people ask about weekends", () => {
    const rows = buildAnalyticsRows([day("2026-08-19")], STAMP);
    expect(rows.find((r) => r.source_id === "daily:2026-08-19")?.title).toContain("Wednesday");
  });

  it("stamps every row with the run timestamp so the sweep is correct", () => {
    const rows = buildAnalyticsRows([day("2026-08-19")], STAMP);
    expect(rows.every((r) => r.updated_at === STAMP)).toBe(true);
  });
});

describe("googleScopeHint", () => {
  it("turns Google's scope refusal into the command that fixes it", () => {
    // Verified against the live API: both GA4 and Search Console answer exactly
    // this shape when the credential lacks the scope.
    const body = JSON.stringify({
      error: { code: 403, status: "PERMISSION_DENIED" },
      details: [{ reason: "ACCESS_TOKEN_SCOPE_INSUFFICIENT" }],
    });
    const hint = googleScopeHint(403, body, GA4_SCOPE);
    expect(hint).toContain("gcloud auth application-default login");
    expect(hint).toContain(GA4_SCOPE);
  });

  it("stays silent on unrelated failures, so a real error is not mislabelled", () => {
    expect(googleScopeHint(500, "internal error", GA4_SCOPE)).toBeNull();
    expect(googleScopeHint(404, "not found", GA4_SCOPE)).toBeNull();
    // A 403 for a genuinely different reason (no access to the property) must
    // not be reported as a scope problem.
    expect(googleScopeHint(403, '{"reason":"USER_PROJECT_DENIED"}', GA4_SCOPE)).toBeNull();
  });
});
