import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("@shared/http/google-oauth", () => ({
  getGoogleAccessToken: vi.fn(async () => "test-access-token"),
  getDelegatedToken: vi.fn(async () => "ads-token"),
  isGoogleConfigured: () => true,
  googleScopeHint: () => null,
  GA4_SCOPE: "ga4",
  SEARCH_CONSOLE_SCOPE: "gsc",
}));

/** Existing chunk ids the DB should report, and every list call made. */
let existingIds: string[] = [];
let listOk = true;
const listCalls: string[] = [];

vi.mock("@features/admin/server/supabase", () => ({
  supabaseFetch: vi.fn(async (path: string) => {
    listCalls.push(path);
    if (!listOk) return { ok: false, status: 500, json: async () => ({}) };
    // Never-swept => due. Keeps the real shouldSweep in the path under test.
    if (path.includes("brain_sweep_state")) {
      return { ok: true, status: 200, json: async () => [] };
    }
    const offset = Number(/offset=(\d+)/.exec(path)?.[1] ?? 0);
    const page = existingIds.slice(offset, offset + 1000).map((id) => ({ source_id: id }));
    return { ok: true, status: 200, json: async () => page };
  }),
}));

const upsertChunks = vi.fn(async (rows: Array<{ source_id: string }>) => rows.length);
const touchChunks = vi.fn(async (_s: string, ids: string[]) => ids.length);
const sweepStale = vi.fn(async () => 0);
vi.mock("@features/brain/server/ingest/upsert", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  upsertChunks: (...a: unknown[]) => upsertChunks(...(a as [never])),
  touchChunks: (...a: unknown[]) => touchChunks(...(a as [never, never])),
  sweepStale: (...a: unknown[]) => sweepStale(...(a as [])),
}));

/** A GA4 runReport response for `days` recent days. */
function ga4Days(days: number) {
  const rows = Array.from({ length: days }, (_, i) => {
    const d = new Date(Date.UTC(2026, 7, 27 - i));
    return {
      dimensionValues: [{ value: d.toISOString().slice(0, 10).replace(/-/g, "") }],
      metricValues: [{ value: "10" }, { value: "5" }, { value: "1" }, { value: "0" }],
    };
  });
  return { rows, rowCount: rows.length };
}

vi.mock("@shared/http/fetch-with-timeout", () => ({
  fetchWithTimeout: vi.fn(async (url: string) => ({
    ok: true,
    status: 200,
    headers: new Headers(),
    json: async () =>
      String(url).includes("searchconsole")
        ? { rows: [{ keys: ["2026-08-25"], clicks: 1, impressions: 10, position: 3 }] }
        : ga4Days(10),
    text: async () => "",
  })),
}));

import { ingestGa4 } from "@features/brain/server/ingest/google";

const STAMP = "2026-08-28T04:47:00.000Z";
/** `isoDaysAgo` counts back from the real clock, so the span is measured from today. */
const TODAY = new Date().toISOString().slice(0, 10);

describe("the nightly window must not delete the history", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listCalls.length = 0;
    listOk = true;
    process.env.GA4_PROPERTY_ID = "123456";
    process.env.SEARCH_CONSOLE_SITE = "sc-domain:loveiq.org";
  });

  it("touches every chunk the 10-day window did not rewrite", async () => {
    // THE failure this guards: the corpus is 16 months deep but a run only
    // rewrites 10 days, and the sweep deletes anything it does not see. Without
    // touching, every night would delete the history and the corpus would sit
    // permanently 10 days deep.
    existingIds = [
      "daily:2026-01-15",
      "daily:2026-02-20",
      "monthly:2026-01",
      "weekly:2026-W03",
      "daily:2026-08-27", // inside the window — will be rewritten
    ];
    await ingestGa4(STAMP);

    expect(touchChunks).toHaveBeenCalledTimes(1);
    const [source, ids] = touchChunks.mock.calls[0] as unknown as [string, string[]];
    expect(source).toBe("ga4");
    expect(ids).toContain("daily:2026-01-15");
    expect(ids).toContain("monthly:2026-01");
    expect(ids).not.toContain("daily:2026-08-27");
  });

  it("counts touched rows toward the sweep, or the guard refuses a healthy run", async () => {
    existingIds = Array.from(
      { length: 500 },
      (_, i) =>
        `daily:2025-${String((i % 12) + 1).padStart(2, "0")}-${String((i % 28) + 1).padStart(2, "0")}`
    );
    await ingestGa4(STAMP);
    const [, , total] = sweepStale.mock.calls[0] as unknown as [string, string, number];
    const written = await upsertChunks.mock.results[0].value;
    expect(total).toBeGreaterThan(written);
  });

  it("pages the existing-id read, because PostgREST caps a response at 1000 rows", async () => {
    // A 16-month corpus passes 1,000 rows as history accumulates. An unpaginated
    // read would stop confirming the oldest chunks and the sweep would eat them.
    existingIds = Array.from({ length: 1500 }, (_, i) => `daily:old-${i}`);
    await ingestGa4(STAMP);
    const offsets = listCalls.map((p) => Number(/offset=(\d+)/.exec(p)?.[1] ?? -1));
    expect(offsets).toContain(0);
    expect(offsets).toContain(1000);
    const [, ids] = touchChunks.mock.calls[0] as unknown as [string, string[]];
    expect(ids.length).toBe(1500);
  });

  it("fails CLOSED when the existing-id read errors", async () => {
    // Returning an inflated count would let the sweep run against a source it
    // could not see. Returning 0 makes sweepStale see a small run against a
    // large source, and it refuses a majority deletion — the history survives.
    existingIds = ["daily:2026-01-15"];
    listOk = false;
    await ingestGa4(STAMP);
    expect(touchChunks).not.toHaveBeenCalled();
    /**
     * STRONGER than it used to be. Previously the sweep still ran, and safety rested
     * on `sweepStale` refusing a majority deletion once the touch count came back 0.
     * Now an unreadable database also makes `shouldSweep` fail closed, so the sweep
     * never starts. Both keep the history; not deleting at all is the better of the
     * two, and it no longer depends on the majority guard being the last line.
     */
    expect(sweepStale).not.toHaveBeenCalled();
  });

  it("asks GA4 for the nightly window by default and the backfill window on request", async () => {
    existingIds = [];
    const { fetchWithTimeout } = await import("@shared/http/fetch-with-timeout");
    await ingestGa4(STAMP);
    const nightly = vi
      .mocked(fetchWithTimeout)
      .mock.calls.map(([, init]) => String((init as { body?: string })?.body ?? ""));
    // The window is deliberately WIDER than DAYS: it is expanded back to the first
    // day of the ISO week and month it touches, because weekly/monthly chunks are
    // totalled from the fetched rows and a mid-period start produced a mid-period
    // "month". Measured in production 2026-08-28: August read 23 clicks against a
    // true 70. So assert the floor and the period boundary, not an exact number.
    /**
     * ABSOLUTE START DATES, NOT `NdaysAgo`. GA4 resolves a relative date in the
     * property's timezone, which is ahead of UTC, while every day count here is UTC —
     * so between the property rolling over and UTC doing the same, `NdaysAgo` landed a
     * day late and cut the 1st off the month. Measured in production 2026-09-20:
     * `monthly:2026-09` read 6,404 sessions against 6,508 in September's own daily
     * chunks, exactly the 104 of 1 September.
     */
    const spanDays = (bodies: string[]) =>
      bodies
        .flatMap((b) => [...b.matchAll(/"startDate":"(\d{4}-\d{2}-\d{2})"/g)].map((m) => m[1]!))
        .map((d) =>
          Math.round((Date.parse(`${TODAY}T00:00:00Z`) - Date.parse(`${d}T00:00:00Z`)) / 86_400_000)
        );

    expect(nightly.some((b) => /daysAgo/.test(b))).toBe(false);
    const nightlyDays = spanDays(nightly);
    expect(nightlyDays.length).toBeGreaterThan(0);
    expect(Math.max(...nightlyDays)).toBeGreaterThanOrEqual(10);
    // …and never so wide that the nightly run turns into a backfill.
    expect(Math.max(...nightlyDays)).toBeLessThan(10 + 32);

    vi.mocked(fetchWithTimeout).mockClear();
    await ingestGa4(STAMP, () => false, 480);
    const back = vi
      .mocked(fetchWithTimeout)
      .mock.calls.map(([, init]) => String((init as { body?: string })?.body ?? ""));
    expect(back.some((b) => /daysAgo/.test(b))).toBe(false);
    const backDays = spanDays(back);
    expect(Math.max(...backDays)).toBeGreaterThanOrEqual(480);
  });

  /**
   * THE BUG THIS WHOLE ARRANGEMENT EXISTS FOR.
   *
   * A monthly chunk is totalled from the rows the run fetched, so a window that starts
   * on the 2nd produces a "September total" missing 1 September — and it did, nightly:
   * `monthly:2026-09` read 6,404 against 6,508 in September's own daily chunks. The
   * start date has to reach the 1st of the current month, whatever the hour.
   */
  it("always reaches the first of the current month", async () => {
    const { fetchWithTimeout } = await import("@shared/http/fetch-with-timeout");
    vi.mocked(fetchWithTimeout).mockClear();
    await ingestGa4(STAMP, () => false);
    const starts = vi
      .mocked(fetchWithTimeout)
      .mock.calls.map(([, init]) => String((init as { body?: string })?.body ?? ""))
      .flatMap((b) => [...b.matchAll(/"startDate":"(\d{4}-\d{2}-\d{2})"/g)].map((m) => m[1]!));
    expect(starts.length).toBeGreaterThan(0);
    const monthStart = `${TODAY.slice(0, 7)}-01`;
    for (const start of starts) expect(start <= monthStart).toBe(true);
  });
});

/** A runReport answer: rows of [dimension values] and [metric values]. */
const report = (rows: Array<[string[], number[]]>) => ({
  rows: rows.map(([d, m]) => ({
    dimensionValues: d.map((value) => ({ value })),
    metricValues: m.map((v) => ({ value: String(v) })),
  })),
  rowCount: rows.length,
});

/** date: sessions, totalUsers, newUsers, screenPageViews, engagedSessions. */
const CORE = report([
  [["20260825"], [120, 100, 80, 300, 70]],
  [["20260826"], [90, 85, 60, 200, 50]],
  [["20260827"], [30, 28, 20, 60, 15]],
]);
/** The body's channel report: sessions only. */
const CHANNEL_SESSIONS = report([
  [["20260825", "Direct"], [50]],
  [["20260825", "Organic Search"], [30]],
  [["20260825", "Paid Search"], [40]],
  [["20260826", "Direct"], [45]],
  [["20260826", "Paid Search"], [45]],
  [["20260827", "Direct"], [10]],
  [["20260827", "Paid Search"], [20]],
]);
/** The table's: sessions, activeUsers, newUsers, engagedSessions, userEngagementDuration. */
const CHANNEL_FULL = report([
  [
    ["20260825", "Direct"],
    [50, 45, 30, 25, 1500],
  ],
  [
    ["20260825", "Organic Search"],
    [30, 25, 20, 25, 900],
  ],
  [
    ["20260825", "Paid Search"],
    [40, 38, 35, 20, 2000],
  ],
  [
    ["20260826", "Direct"],
    [45, 40, 30, 25, 1350],
  ],
  [
    ["20260826", "Paid Search"],
    [45, 44, 40, 25, 1800],
  ],
  [
    ["20260827", "Direct"],
    [10, 9, 5, 5, 300],
  ],
  [
    ["20260827", "Paid Search"],
    [20, 19, 15, 10, 600],
  ],
]);
/** date x sessionCampaignName: advertiserAdCost, advertiserAdClicks, advertiserAdImpressions. */
const GA4_ADS = report([
  [
    ["20260824", "Brand"],
    [5.5, 2, 40],
  ],
  [
    ["20260825", "(not set)"],
    [0.5, 0, 5],
  ],
  [
    ["20260825", "Brand"],
    [10, 3, 100],
  ],
  [
    ["20260825", "Generic"],
    [2.345, 1, 50],
  ],
  [
    ["20260826", "Brand"],
    [8, 2, 80],
  ],
]);
/** The Google Ads API's answer, shaped as REST v25 sends it (int64 as strings, zeros left out). */
const ADS_ROW = (date: string, id: string, name: string, m: Record<string, unknown>) => ({
  customer: { currencyCode: "EUR" },
  segments: { date },
  campaign: { resourceName: `customers/3087717405/campaigns/${id}`, id, name },
  metrics: m,
});
const ADS = {
  results: [
    // No GA4 day of its own: it must not create one.
    ADS_ROW("2026-08-23", "111", "Brand", { impressions: "12", clicks: "1", costMicros: "900000" }),
    ADS_ROW("2026-08-24", "111", "Brand", {
      impressions: "40",
      clicks: "2",
      costMicros: "5500000",
    }),
    ADS_ROW("2026-08-25", "111", "Brand", {
      impressions: "100",
      clicks: "3",
      costMicros: "10000000",
      conversions: 1.5,
    }),
    ADS_ROW("2026-08-25", "222", "Generic", {
      impressions: "50",
      clicks: "1",
      costMicros: "1005000",
    }),
    // Nothing shown, clicked or spent: not a row of the table.
    ADS_ROW("2026-08-25", "333", "Paused", {}),
    ADS_ROW("2026-08-26", "111", "Brand", {
      impressions: "80",
      clicks: "2",
      costMicros: "8000000",
      conversions: 2,
    }),
  ],
};

type Answer = { ok: boolean; status: number; headers: Headers; json: () => Promise<unknown> };
const answer = (json: unknown, status = 200): Answer => ({
  ok: status < 400,
  status,
  headers: new Headers(),
  json: async () => json,
  text: async () => (status < 400 ? "" : "refused"),
});

/** Each GA4 report answered by what it asks for, and the Google Ads API by its address. */
function perReport(
  fail: { channels?: boolean | "cut"; ads?: boolean | "usd"; onChannels?: () => void } = {}
) {
  return async (url: string, init?: { body?: string }) => {
    if (String(url).includes("googleads.googleapis.com")) {
      if (fail.ads === "usd")
        return answer({
          results: ADS.results.map((r) => ({ ...r, customer: { currencyCode: "USD" } })),
        });
      return fail.ads ? answer({}, 500) : answer(ADS);
    }
    const body = JSON.parse(init?.body ?? "{}") as {
      dimensions?: Array<{ name: string }>;
      metrics?: Array<{ name: string }>;
    };
    const dims = (body.dimensions ?? []).map((d) => d.name).join(",");
    const metrics = (body.metrics ?? []).map((m) => m.name).join(",");
    if (dims === "date") return answer(CORE);
    if (dims === "date,sessionDefaultChannelGroup") {
      if (metrics === "sessions") return answer(CHANNEL_SESSIONS);
      fail.onChannels?.();
      // "cut": more rows exist than this page holds, so the report has to ask again.
      if (fail.channels === "cut") return answer({ ...CHANNEL_FULL, rowCount: 999 });
      return fail.channels ? answer({}, 500) : answer(CHANNEL_FULL);
    }
    if (dims === "date,sessionCampaignName") return answer(GA4_ADS);
    return answer({}, 400);
  };
}

type Written = { source_id: string; title: string; body: string; meta: Record<string, unknown> };
const writtenRows = () => upsertChunks.mock.calls.flatMap(([rows]) => rows as unknown as Written[]);

describe("the day chunk's breakdowns for the admin's Google tables", () => {
  /** The file's own answers, put back after each test here so none leaks into the next. */
  let restore: () => void = () => {};
  beforeEach(async () => {
    vi.clearAllMocks();
    listCalls.length = 0;
    listOk = true;
    existingIds = [];
    process.env.GA4_PROPERTY_ID = "123456";
    // The 27th is "today", so its row is the partial one.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-08-27T10:00:00Z"));
    const fetch = vi.mocked((await import("@shared/http/fetch-with-timeout")).fetchWithTimeout);
    const db = vi.mocked((await import("@features/admin/server/supabase")).supabaseFetch);
    const [fetchAnswers, dbAnswers] = [fetch.getMockImplementation()!, db.getMockImplementation()!];
    restore = () => {
      fetch.mockImplementation(fetchAnswers);
      db.mockImplementation(dbAnswers);
    };
    fetch.mockImplementation(perReport() as never);
  });
  afterEach(() => {
    vi.useRealTimers();
    restore();
  });
  const day = (id: string) => writtenRows().find((r) => r.source_id === `daily:${id}`)!;
  const bodies = () => writtenRows().map((r) => `${r.source_id}\n${r.title}\n${r.body}`);

  /**
   * Search and the embeddings read the title and body only, so a body that changes by a byte
   * re-embeds every day and moves search. Captured from the ingester BEFORE the breakdowns
   * were added; the weekly and monthly rows are pinned whole.
   */
  it("writes every title and body exactly as before", async () => {
    await ingestGa4(STAMP);
    const shown = writtenRows()
      .map((r) =>
        [
          r.source_id,
          r.title,
          r.body,
          r.source_id.startsWith("daily:") ? "" : JSON.stringify(r.meta),
        ]
          .filter(Boolean)
          .join("\n")
      )
      .join("\n\n");
    expect(shown).toMatchInlineSnapshot(`
      "daily:2026-08-24
      Google Analytics — Monday 24 August 2026
      Period: Monday 24 August 2026 (2026-08-24)
      Sessions: 0 · Users: 0 · New users: 0
      Page views: 0 · Engaged sessions: 0
      Google Ads spend: EUR 5.50 · 2 ad clicks · 40 ad impressions
      Ad campaigns: Brand EUR 5.50

      daily:2026-08-25
      Google Analytics — Tuesday 25 August 2026
      Period: Tuesday 25 August 2026 (2026-08-25)
      Sessions: 120 · Users: 100 · New users: 80
      Page views: 300 · Engaged sessions: 70
      Channels: Direct 50, Paid Search 40, Organic Search 30
      Google Ads spend: EUR 12.85 · 4 ad clicks · 155 ad impressions
      Ad campaigns: Brand EUR 10.00, Generic EUR 2.35

      daily:2026-08-26
      Google Analytics — Wednesday 26 August 2026
      Period: Wednesday 26 August 2026 (2026-08-26)
      Sessions: 90 · Users: 85 · New users: 60
      Page views: 200 · Engaged sessions: 50
      Channels: Direct 45, Paid Search 45
      Google Ads spend: EUR 8.00 · 2 ad clicks · 80 ad impressions
      Ad campaigns: Brand EUR 8.00

      daily:2026-08-27
      Google Analytics — Thursday 27 August 2026
      Period: Thursday 27 August 2026 (2026-08-27) — TODAY SO FAR, still accruing
      Sessions: 30 · Users: 28 · New users: 20
      Page views: 60 · Engaged sessions: 15
      Channels: Paid Search 20, Direct 10

      weekly:2026-W35
      Google Analytics — week of Monday 24 August 2026 to Thursday 27 August 2026
      Period: week of Monday 24 August 2026 to Thursday 27 August 2026 (2026-W35)
      Sessions: 240 · Users: 213 · New users: 160
      Page views: 560 · Engaged sessions: 135
      Channels: Direct 105, Paid Search 105, Organic Search 30
      Google Ads spend: EUR 26.34 · 8 ad clicks · 275 ad impressions
      Ad campaigns: Brand EUR 23.50, Generic EUR 2.35
      {"grain":"week","week":"2026-W35","sessions":240,"ad_cost":26.345}

      monthly:2026-08
      Google Analytics — August 2026 (monthly total)
      Period: August 2026 — month so far, Monday 24 August 2026 to Thursday 27 August 2026 (2026-08)
      Sessions: 240 · Users: 213 · New users: 160
      Page views: 560 · Engaged sessions: 135
      Channels: Direct 105, Paid Search 105, Organic Search 30
      Google Ads spend: EUR 26.34 · 8 ad clicks · 275 ad impressions
      Ad campaigns: Brand EUR 23.50, Generic EUR 2.35
      {"grain":"month","month":"2026-08","sessions":240,"ad_cost":26.345}"
    `);
  });

  it("adds each channel's and each campaign's day, and the core's new and engaged counts", async () => {
    await ingestGa4(STAMP);
    expect(day("2026-08-25").meta).toMatchObject({
      sessions: 120,
      users: 100,
      new_users: 80,
      engaged_sessions: 70,
      // GA4's link still owns the spend.
      ad_cost: 12.845,
      ad_clicks: 4,
      ad_impressions: 155,
      channels: {
        Direct: {
          sessions: 50,
          users: 45,
          new_users: 30,
          engaged_sessions: 25,
          engagement_s: 1500,
        },
        "Organic Search": {
          sessions: 30,
          users: 25,
          new_users: 20,
          engaged_sessions: 25,
          engagement_s: 900,
        },
        "Paid Search": {
          sessions: 40,
          users: 38,
          new_users: 35,
          engaged_sessions: 20,
          engagement_s: 2000,
        },
      },
      ads_campaigns: {
        "111": { name: "Brand", impressions: 100, clicks: 3, cost: 10, conversions: 1.5 },
        // Rounded from micros: 1,005,000 is 1.01, where 1.005 as a float rounds to 1.
        "222": { name: "Generic", impressions: 50, clicks: 1, cost: 1.01, conversions: 0 },
      },
    });
    // Shown, clicked and spent nothing: no row.
    expect(Object.keys(day("2026-08-25").meta.ads_campaigns as object)).toEqual(["111", "222"]);
    // A day with spend and no visits has its campaigns and no channels, never an empty {}.
    expect(day("2026-08-24").meta.ads_campaigns).toEqual({
      "111": { name: "Brand", impressions: 40, clicks: 2, cost: 5.5, conversions: 0 },
    });
    expect(day("2026-08-24").meta).not.toHaveProperty("channels");
    // Today so far: visits, and no campaign activity yet.
    expect(day("2026-08-27").meta.channels).toHaveProperty("Paid Search");
    expect(day("2026-08-27").meta).not.toHaveProperty("ads_campaigns");
    // An Ads day without a GA4 day is not made into a chunk.
    expect(writtenRows().some((r) => r.source_id === "daily:2026-08-23")).toBe(false);
    // Both breakdowns read: nothing stored is read back to keep.
    const { supabaseFetch } = await import("@features/admin/server/supabase");
    expect(
      vi.mocked(supabaseFetch).mock.calls.some(([p]) => String(p).includes("meta->channels"))
    ).toBe(false);
    // Weekly and monthly rows gain nothing.
    for (const r of writtenRows().filter((w) => !w.source_id.startsWith("daily:")))
      expect(Object.keys(r.meta).sort()).toEqual(
        ["ad_cost", "grain", "sessions", r.meta.grain === "week" ? "week" : "month"].sort()
      );
  });

  it("asks Google Ads for the run's own window, through to Berlin's today", async () => {
    const { fetchWithTimeout } = await import("@shared/http/fetch-with-timeout");
    // 23:30 UTC on the 27th is already the 28th in Berlin.
    vi.setSystemTime(new Date("2026-08-27T23:30:00Z"));
    await ingestGa4(STAMP);
    const asked = vi
      .mocked(fetchWithTimeout)
      .mock.calls.filter(([url]) => String(url).includes("googleads.googleapis.com"))
      .map(([, init]) => JSON.parse(String((init as { body?: string }).body)) as { query: string });
    expect(asked).toHaveLength(1);
    expect(asked[0]!.query).toContain(
      "segments.date, campaign.id, campaign.name, metrics.impressions, metrics.clicks, " +
        "metrics.cost_micros, metrics.conversions FROM campaign"
    );
    expect(asked[0]!.query).toContain("BETWEEN '2026-08-01' AND '2026-08-28'");
  });

  it("a failed channel table leaves the day without one, and its body as it was", async () => {
    await ingestGa4(STAMP);
    const before = bodies();
    vi.clearAllMocks();
    const { fetchWithTimeout } = await import("@shared/http/fetch-with-timeout");
    vi.mocked(fetchWithTimeout).mockImplementation(perReport({ channels: true }) as never);
    await ingestGa4(STAMP);
    for (const r of writtenRows().filter((w) => w.source_id.startsWith("daily:")))
      expect(r.meta).not.toHaveProperty("channels");
    expect(day("2026-08-25").meta).toMatchObject({ ads_campaigns: { "111": { cost: 10 } } });
    expect(bodies()).toEqual(before);
  });

  it("a channel table cut short by the clock is not written as if it were whole", async () => {
    await ingestGa4(STAMP);
    const before = bodies();
    vi.clearAllMocks();
    let late = false;
    const { fetchWithTimeout } = await import("@shared/http/fetch-with-timeout");
    vi.mocked(fetchWithTimeout).mockImplementation(
      perReport({ channels: "cut", onChannels: () => (late = true) }) as never
    );
    // The clock runs out while the channel table is still paging.
    await ingestGa4(STAMP, () => late);
    for (const r of writtenRows().filter((w) => w.source_id.startsWith("daily:")))
      expect(r.meta).not.toHaveProperty("channels");
    expect(bodies()).toEqual(before);
  });

  it("keeps the breakdowns a day already holds when this run cannot read them", async () => {
    const channels = {
      Direct: { sessions: 7, users: 7, new_users: 1, engaged_sessions: 2, engagement_s: 70 },
    };
    const campaigns = {
      "111": { name: "Brand", impressions: 9, clicks: 1, cost: 0.5, conversions: 0 },
    };
    const { supabaseFetch } = await import("@features/admin/server/supabase");
    vi.mocked(supabaseFetch).mockImplementation((async (path: string) =>
      path.includes("channels:meta->channels")
        ? answer([{ day: "2026-08-25", channels, ads_campaigns: campaigns }])
        : answer([])) as never);
    const { fetchWithTimeout } = await import("@shared/http/fetch-with-timeout");
    vi.mocked(fetchWithTimeout).mockImplementation(
      perReport({ channels: true, ads: true }) as never
    );
    await ingestGa4(STAMP);
    expect(day("2026-08-25").meta).toMatchObject({ channels, ads_campaigns: campaigns });
    // A day that held none still has none: nothing is made up.
    expect(day("2026-08-26").meta).not.toHaveProperty("channels");
    expect(day("2026-08-26").meta).not.toHaveProperty("ads_campaigns");
    // Read once, from the run's first day on.
    const reads = vi
      .mocked(supabaseFetch)
      .mock.calls.map(([p]) => String(p))
      .filter((p) => p.includes("channels:meta->channels"));
    expect(reads).toHaveLength(1);
    expect(reads[0]).toContain("period_end=gte.2026-08-24");
  });

  it("Google Ads failing or not set up costs the campaigns only: ad_cost and the body stay", async () => {
    await ingestGa4(STAMP);
    const before = bodies();
    const adCost = day("2026-08-25").meta.ad_cost;
    const { fetchWithTimeout } = await import("@shared/http/fetch-with-timeout");
    const { getDelegatedToken } = await import("@shared/http/google-oauth");
    for (const broken of ["refused", "no token", "not in euros"]) {
      vi.clearAllMocks();
      vi.mocked(fetchWithTimeout).mockImplementation(
        perReport({ ads: broken === "not in euros" ? "usd" : broken === "refused" }) as never
      );
      if (broken === "no token") vi.mocked(getDelegatedToken).mockResolvedValueOnce(null);
      await ingestGa4(STAMP);
      for (const r of writtenRows().filter((w) => w.source_id.startsWith("daily:")))
        expect(r.meta, broken).not.toHaveProperty("ads_campaigns");
      expect(day("2026-08-25").meta, broken).toMatchObject({
        ad_cost: adCost,
        ad_clicks: 4,
        ad_impressions: 155,
        ad_window_to: "2026-08-27",
        channels: { Direct: { sessions: 50 } },
      });
      expect(bodies(), broken).toEqual(before);
    }
  });
});
