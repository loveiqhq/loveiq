import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("@shared/http/google-oauth", () => ({
  getGoogleAccessToken: vi.fn(async () => "test-access-token"),
  isGoogleConfigured: () => true,
  googleCredentialShape: () => "test",
  googleScopeHint: () => null,
  GA4_SCOPE: "ga4",
  SEARCH_CONSOLE_SCOPE: "gsc",
}));

vi.mock("@features/admin/server/supabase", () => ({
  // Never swept, so the real shouldSweep says a sweep is due.
  supabaseFetch: vi.fn(async () => ({ ok: true, status: 200, json: async () => [] })),
}));

type Row = {
  source: string;
  source_id: string;
  title: string;
  body: string;
  meta: Record<string, unknown>;
};
let written: Row[] = [];
const sweepStale = vi.fn(async () => 0);
vi.mock("@features/brain/server/ingest/upsert", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  upsertChunks: vi.fn(async (rows: Row[]) => {
    written = rows;
    return rows.length;
  }),
  recordSweep: vi.fn(async () => undefined),
  sweepStale: (...a: unknown[]) => sweepStale(...(a as [])),
}));

/** One GA4 row: dimension values, then metric values. */
const r = (dims: string[], metrics: number[]) => ({
  dimensionValues: dims.map((value) => ({ value })),
  metricValues: metrics.map((n) => ({ value: String(n) })),
});

let failSearch = false;
let failLinkClicks = false;
let truncateDays = false;

/** Answers each report by the dimensions it asks for, like GA4 and Search Console do. */
vi.mock("@shared/http/fetch-with-timeout", () => ({
  fetchWithTimeout: vi.fn(async (url: string, init: { body: string }) => {
    const body = JSON.parse(init.body) as { dimensions: Array<{ name: string } | string> };
    const dims = body.dimensions.map((d) => (typeof d === "string" ? d : d.name)).join(",");
    const ok = (json: unknown) => ({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => json,
      text: async () => "",
    });
    const bad = {
      ok: false,
      status: 500,
      headers: new Headers(),
      json: async () => ({}),
      text: async () => "boom",
    };
    if (String(url).includes("searchconsole")) {
      if (failSearch) return bad;
      return ok({
        rows:
          dims === "date"
            ? [
                { keys: ["2026-09-29"], clicks: 0, impressions: 0, position: 0 },
                { keys: ["2026-10-02"], clicks: 1, impressions: 20, position: 4 },
              ]
            : [
                { keys: ["2026-10-02", "applied psychometrics"], clicks: 1, impressions: 15 },
                { keys: ["2026-10-02", "psychometric screening"], clicks: 0, impressions: 5 },
              ],
      });
    }
    const rows: Record<string, unknown[]> = {
      date: [r(["20261001"], [9, 5, 5, 11, 4]), r(["20261002"], [7, 4, 2, 6, 3])],
      isoYearIsoWeek: [r(["202640"], [16, 7, 7, 17, 7])],
      yearMonth: [r(["202610"], [16, 7, 7, 17, 7])],
      "date,sessionDefaultChannelGroup": [
        r(["20261001", "Direct"], [6]),
        r(["20261001", "Referral"], [3]),
        r(["20261002", "Direct"], [7]),
      ],
      "yearMonth,pagePath": [r(["202610", "/"], [14]), r(["202610", "/imprint"], [3])],
      "yearMonth,linkDomain": [r(["202610", "loveiq.org"], [2])],
    };
    if (dims === "yearMonth,linkDomain" && failLinkClicks) return bad;
    // More rows than any page returns, so the report pages until its ceiling and stops short.
    if (dims === "date" && truncateDays) return ok({ rows: [rows.date![0]], rowCount: 1000 });
    const found = rows[dims] ?? [];
    return ok({ rows: found, rowCount: found.length });
  }),
}));

import { ingestCorporateSite } from "@features/brain/server/ingest/corporate";

const STAMP = "2026-10-04T03:00:00.000Z";
const byId = (id: string) => written.find((w) => w.source_id === id);

describe("the corporate website's traffic and searches", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    written = [];
    failSearch = false;
    failLinkClicks = false;
    truncateDays = false;
  });

  it("writes everything under `corporate`, never ga4 or gsc, so neither sweep deletes the other", async () => {
    const result = await ingestCorporateSite(STAMP);
    expect(result).toMatchObject({ source: "corporate", rows: written.length });
    expect(new Set(written.map((w) => w.source))).toEqual(new Set(["corporate"]));
    expect(written.every((w) => w.meta.site === "appliedpsychometrics.org")).toBe(true);
    expect(sweepStale).toHaveBeenCalledWith("corporate", STAMP, written.length);
  });

  it("says whose site it is and that only consenting visitors are counted", async () => {
    await ingestCorporateSite(STAMP);
    const day = byId("ga4-day:2026-10-01");
    expect(day?.title).toBe("appliedpsychometrics.org website traffic — Thursday 1 October 2026");
    expect(day?.body).toContain("not LoveIQ");
    expect(day?.body).toContain("accepted analytics cookies");
    expect(day?.body).toContain("Sessions: 9 · Users: 5");
    expect(day?.body).toContain("Sessions by channel: Direct 6, Referral 3");
  });

  it("takes weekly and monthly users from GA4's own counts, not a sum of daily users", async () => {
    await ingestCorporateSite(STAMP);
    // Daily users are 5 + 4 = 9; the week's unique users are 7.
    expect(byId("ga4-week:2026-W40")?.body).toContain("Sessions: 16 · Users: 7");
    expect(byId("ga4-week:2026-W40")?.body).toContain("Direct 13, Referral 3");
    const month = byId("ga4-month:2026-10");
    expect(month?.body).toContain("Users: 7");
    expect(month?.body).toContain("October 2026 (2026-10), so far");
    expect(month?.body).toContain("Most-viewed pages: / 14 views, /imprint 3 views");
    expect(month?.body).toContain("Clicks out to other websites: loveiq.org 2");
  });

  it("writes Search Console rows with their queries, and skips days with no impressions", async () => {
    await ingestCorporateSite(STAMP);
    expect(byId("gsc-day:2026-09-29")).toBeUndefined();
    const day = byId("gsc-day:2026-10-02");
    expect(day?.body).toContain("Google search clicks: 1 · Impressions: 20");
    expect(day?.body).toContain("Average position: 4.0");
    expect(day?.body).toContain("applied psychometrics 15, psychometric screening 5");
    expect(byId("gsc-month:2026-10")?.title).toBe(
      "appliedpsychometrics.org Google searches — October 2026"
    );
  });

  it("keeps the traffic and skips the sweep when Search Console fails, then reports it", async () => {
    failSearch = true;
    await expect(ingestCorporateSite(STAMP)).rejects.toThrow();
    expect(byId("ga4-day:2026-10-01")).toBeDefined();
    expect(written.some((w) => w.source_id.startsWith("gsc-"))).toBe(false);
    expect(sweepStale).not.toHaveBeenCalled();
  });

  it("does not sweep when a report stopped before its last page", async () => {
    truncateDays = true;
    const result = await ingestCorporateSite(STAMP);
    expect(result).toMatchObject({
      source: "corporate",
      complete: false,
      sweepBlocked: true,
      swept: 0,
    });
    expect(sweepStale).not.toHaveBeenCalled();
    expect(byId("ga4-day:2026-10-01")).toBeDefined();
  });

  it("does not report zero clicks when the click report could not be read", async () => {
    failLinkClicks = true;
    await ingestCorporateSite(STAMP);
    const month = byId("ga4-month:2026-10")?.body ?? "";
    expect(month).toContain("Sessions: 16");
    expect(month).not.toContain("Clicks out");
  });
});
