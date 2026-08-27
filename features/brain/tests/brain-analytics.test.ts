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
    expect(weekly?.body).toContain("Website visits: 200");
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
    expect(daily?.body).toContain("Survey starts: 10 (10.0% of visits)");
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

  it("never states a zero visit count as a fact, and never divides by zero", () => {
    // `funnel_event.unique_visitor` only starts 2026-05-23, so zero means NOT
    // MEASURED. "How many visitors did we have in April?" was answered "0".
    const rows = buildAnalyticsRows(
      [day("2026-08-19", { unique_visitors: 0, survey_starts: 0 })],
      STAMP
    );
    const daily = rows.find((r) => r.source_id === "daily:2026-08-19");
    expect(daily?.body).not.toContain("Website visits: 0");
    expect(daily?.body).not.toContain("Website visits");
    expect(daily?.body).not.toContain("NaN");
    expect(daily?.body).not.toContain("Infinity");
    expect(daily?.body).not.toContain("n/a");
  });

  it("drops a funnel percentage that exceeds 100%, keeping both counts", () => {
    // More signups than starts is impossible as a rate — it means the two
    // metrics started tracking on different dates. May 2026 published
    // "Signups: 453 (115.9% of starts)" as if it were a conversion rate.
    const rows = buildAnalyticsRows(
      [day("2026-08-19", { survey_starts: 4, submissions: 9 })],
      STAMP
    );
    const daily = rows.find((r) => r.source_id === "daily:2026-08-19");
    expect(daily?.body).toContain("Signups (completed surveys): 9");
    expect(daily?.body).not.toMatch(/Signups[^\n]*% of starts/);
  });

  it("reports first-opens, not a per-day distinct count that cannot be summed", () => {
    const rows = buildAnalyticsRows([day("2026-08-17"), day("2026-08-18")], STAMP);
    const weekly = rows.find((r) => r.source_id === "weekly:2026-W34");
    expect(weekly?.body).toContain("Reports first opened: 14");
  });

  /**
   * THE INVARIANT THAT REPLACED THREE THRESHOLDS.
   *
   * Net over a partial period is computed from the revenue of the SAME days the
   * ad spend covers, so it is a true statement about a shorter span rather than a
   * false one about this span. Three different thresholds (90% of the period, a
   * day count, 80% plus a sign test) were each wrong in a different direction
   * because they all tried to decide when subtracting mismatched spans was
   * "close enough". It never is.
   */
  it.each([
    [2, 1],
    [6, 3],
    [7, 4],
    [7, 6],
    [28, 26],
  ])("nets exactly over the covered days: %i-day period, %i covered", (len, cov) => {
    const days = Array.from({ length: len }, (_, i) =>
      new Date(Date.parse("2026-06-01T00:00:00Z") + i * 864e5).toISOString().slice(0, 10)
    );
    const rows = buildAnalyticsRows(
      days.map((d) => day(d, { revenue: "10", reports_paid: 1 })),
      STAMP,
      {
        byDay: new Map(days.slice(0, cov).map((d) => [d, 100])),
        from: days[0],
        to: days[cov - 1],
      }
    );
    const body = String(rows.find((r) => r.source_id === "monthly:2026-06")?.body ?? "");

    // revenue 10/day and spend 100/day over `cov` days.
    expect(body).toContain(`Net over the ${cov} day(s) ad data covers`);
    expect(body).toContain(`EUR ${(cov * 10 - cov * 100).toFixed(2)}`);
    // and it says why there is no whole-period figure
    expect(body).toContain("no net figure for the WHOLE period on purpose");
  });

  it("gives a plain, unscoped net when ad spend covers the whole period", () => {
    const days = ["2026-06-01", "2026-06-02"];
    const rows = buildAnalyticsRows(
      days.map((d) => day(d, { revenue: "10", reports_paid: 1 })),
      STAMP,
      { byDay: new Map(days.map((d) => [d, 100])), from: "2026-05-01", to: "2026-07-01" }
    );
    const body = String(rows.find((r) => r.source_id === "monthly:2026-06")?.body ?? "");
    expect(body).toContain("Net: EUR -180.00");
    expect(body).not.toContain("day(s) ad data covers");
    expect(body).not.toContain("covers only");
  });

  it("makes the daily and monthly grains agree about the same covered days", () => {
    // Restricting REVENUE to the covered days while leaving SPEND as the whole
    // period's total just mirrored the original defect: a day of spend outside the
    // window put EUR 900 into a "net over the 2 days ad data covers", and the two
    // grains then disagreed by that amount about the very same two named days.
    const days = ["2026-06-01", "2026-06-02", "2026-06-03"];
    const rows = buildAnalyticsRows(
      days.map((d) => day(d, { revenue: "10", reports_paid: 1, submissions: 5 })),
      STAMP,
      {
        byDay: new Map([
          ["2026-06-01", 900],
          ["2026-06-02", 50],
          ["2026-06-03", 50],
        ]),
        from: "2026-06-02",
        to: "2026-06-03",
      }
    );
    const net = (id: string) =>
      /Net[^:]*: EUR (-?[\d.]+)/.exec(
        String(rows.find((r) => r.source_id === id)?.body ?? "")
      )?.[1];

    expect(net("daily:2026-06-02")).toBe("-40.00");
    expect(net("daily:2026-06-03")).toBe("-40.00");
    // The month must equal the sum of its covered days, not carry Jun 1's spend.
    expect(net("monthly:2026-06")).toBe("-80.00");

    // Every derived ratio divides covered spend by covered denominators.
    const monthly = String(rows.find((r) => r.source_id === "monthly:2026-06")?.body ?? "");
    expect(monthly).toContain("Cost per signup, over the 2 day(s) ad data covers: EUR 10.00");
    expect(monthly).toContain(
      "Cost per paying customer, over the 2 day(s) ad data covers: EUR 50.00"
    );
  });

  it("never prints an inverted date range when the ranges do not overlap", () => {
    // Clamping the two ends independently produced "covers only 2026-08-27 to
    // 2026-08-26".
    const rows = buildAnalyticsRows([day("2026-08-27")], STAMP, {
      byDay: new Map([["2026-08-27", 50]]),
      from: "2026-05-01",
      to: "2026-08-26", // ends BEFORE the single-day period starts
    });
    const daily = rows.find((r) => r.source_id === "daily:2026-08-27");
    expect(daily?.body).toContain("NONE of this period");
    expect(daily?.body).not.toMatch(/covers .*2026-08-27 to 2026-08-26/);
    expect(daily?.body).not.toContain("Net:");
  });

  it("states day counts, not a rounded percentage that can contradict itself", () => {
    // 26/29 and 27/30 both rendered as "90%" while behaving oppositely.
    const rows = buildAnalyticsRows([day("2026-08-01"), day("2026-08-27")], STAMP, {
      byDay: new Map([["2026-08-01", 100]]),
      from: "2026-08-01",
      to: "2026-08-25",
    });
    const monthly = rows.find((r) => r.source_id === "monthly:2026-08");
    expect(monthly?.body).toContain("25 of the period's 27 days");
    expect(monthly?.body).not.toMatch(/\d+% of the period/);
  });

  it("omits a zero funnel step that has a non-zero step below it", () => {
    // You cannot complete a survey you never started — March 2026 published
    // "Survey starts: 0" alongside "Signups: 4".
    const rows = buildAnalyticsRows(
      [day("2026-08-19", { unique_visitors: 0, survey_starts: 0, submissions: 4 })],
      STAMP
    );
    const daily = rows.find((r) => r.source_id === "daily:2026-08-19");
    expect(daily?.body).not.toContain("Survey starts");
    expect(daily?.body).toContain("Signups (completed surveys): 4");
  });

  it("does not call a part-month a whole month", () => {
    const rows = buildAnalyticsRows([day("2026-08-01"), day("2026-08-19")], STAMP);
    const monthly = rows.find((r) => r.source_id === "monthly:2026-08");
    expect(monthly?.body).not.toContain("whole month");
    expect(monthly?.body).toContain("month so far");
    expect(monthly?.body).toContain("Wednesday 19 August 2026");
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
