import { beforeEach, describe, expect, it, vi } from "vitest";

const { runGa4Report, queryGsc, googleAdsSearch } = vi.hoisted(() => ({
  runGa4Report: vi.fn(),
  queryGsc: vi.fn(),
  googleAdsSearch: vi.fn(),
}));
vi.mock("@features/brain/server/ingest/google", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@features/brain/server/ingest/google")>()),
  runGa4Report,
  queryGsc,
}));
vi.mock("@shared/http/google-ads", () => ({ googleAdsSearch }));
vi.mock("@shared/http/google-oauth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@shared/http/google-oauth")>()),
  getGoogleAccessToken: vi.fn(async () => "token"),
}));

import { splitAnswers, type AnswerRow } from "@features/admin/server/ap/answers";
import { buildCatalog } from "@features/admin/server/ap/catalog";
import { dailyRows } from "@features/admin/server/ap/explorer";
import { parseFilters } from "@features/admin/server/ap/filters";
import { clearLiveCache, liveRows, safePath } from "@features/admin/server/ap/google-live";
import { ALL } from "@features/admin/server/ap/metrics";
import { questionSegment } from "@features/admin/server/ap/survey";
import { buildSurveyPage } from "@features/admin/server/ap/survey-page";

import { factsFixture } from "./ap-fixtures";

const all = {
  source: "all",
  device: "all",
  tier: "all",
  assessment: "all",
  visitor: "all",
} as const;

describe("the question funnel's segments", () => {
  it("splits by device only from the day the steps recorded it", () => {
    // The steps' device went live at 13:00 on 12 Oct 2026: the 12th is not whole.
    expect(questionSegment({ ...all, device: "phone" }, "2026-10-12", "2026-10-21")).toEqual({
      segment: "All traffic",
      blocked: "Survey steps record the device from 13 Oct 2026: pick a range from that day on.",
    });
    expect(questionSegment({ ...all, device: "computer" }, "2026-10-13", "2026-10-21")).toEqual({
      segment: "Computer",
      blocked: null,
    });
  });

  it("splits by Google Ads only while unfinished runs still have their drafts", () => {
    // Drafts are cleared after 30 days: an older unfinished run has no source.
    expect(
      questionSegment({ ...all, source: "google_ads" }, "2026-09-20", "2026-10-21").blocked
    ).toMatch(/^An unfinished run keeps its source only while its draft does/);
    expect(questionSegment({ ...all, source: "google_ads" }, "2026-09-21", "2026-10-21")).toEqual({
      segment: "Google Ads",
      blocked: null,
    });
  });
});

describe("an answer split", () => {
  const row = (answer: string, gender: string): AnswerRow => ({
    answer: [answer],
    other: null,
    src: "google",
    med: "cpc",
    ads: true,
    gender,
    relationship: null,
    device: "iOS",
    tier: "tier_1",
    ph: null,
  });
  const rows = (gender: string, n: number) => Array.from({ length: n }, () => row("Yes", gender));

  it("names every group it leaves out: under five people, or past the three largest", () => {
    const split = splitAnswers(
      "01002",
      [
        ...rows("Woman", 9),
        ...rows("Man", 8),
        ...rows("Non-binary", 7),
        ...rows("Other", 6),
        ...rows("Rather not label", 5),
        ...rows("Agender", 2),
      ],
      "gender",
      null,
      ALL,
      40
    );
    expect(split.segments.map((s) => s.name)).toHaveLength(3);
    expect(split.hidden.map((h) => h.n)).toEqual([6, 5, 2]);
  });
});

describe("Google's live tables", () => {
  beforeEach(() => {
    clearLiveCache();
    runGa4Report.mockReset();
    process.env.GA4_PROPERTY_ID = "1";
  });

  it("never shows a report link's token, and adds up the rows it collapses", async () => {
    expect(safePath("/report/rpt_a9LY0Obbla1FVsclJ1nM")).toBe("/report/[token]");
    expect(safePath("/report")).toBe("/report");
    expect(safePath("/survey")).toBe("/survey");
    runGa4Report.mockResolvedValue([
      {
        dimensionValues: [{ value: "20261018" }, { value: "/report/rpt_one" }],
        metricValues: [{ value: "3" }, { value: "1" }, { value: "2" }, { value: "0" }],
      },
      {
        dimensionValues: [{ value: "20261018" }, { value: "/report/rpt_two" }],
        metricValues: [{ value: "4" }, { value: "2" }, { value: "1" }, { value: "1" }],
      },
      {
        dimensionValues: [{ value: "20261018" }, { value: "/" }],
        metricValues: [{ value: "9" }, { value: "5" }, { value: "9" }, { value: "0" }],
      },
    ]);
    const got = await liveRows("landing_pages_daily", "2026-10-18", "2026-10-18");
    expect(got).toEqual([
      {
        date: "2026-10-18",
        landing_page: "/report/[token]",
        sessions: 7,
        engaged_sessions: 3,
        new_users: 3,
        key_events: 1,
      },
      {
        date: "2026-10-18",
        landing_page: "/",
        sessions: 9,
        engaged_sessions: 5,
        new_users: 9,
        key_events: 0,
      },
    ]);
  });

  it("reads only from the property's first day, and is no table for a name it doesn't know", async () => {
    runGa4Report.mockResolvedValue([]);
    await liveRows("site_daily", "2025-01-01", "2026-01-05");
    expect(runGa4Report.mock.calls[0]![2]).toMatchObject({
      dateRanges: [{ startDate: "2025-12-30", endDate: "2026-01-05" }],
    });
    expect(liveRows("sessions_daily", "2026-10-01", "2026-10-07")).toBeNull();
  });

  it("refuses a report Google cut short rather than showing part of it as the whole", async () => {
    runGa4Report.mockImplementation(async (...args: unknown[]) => {
      (args[4] as { truncated: boolean }).truncated = true;
      return [];
    });
    await expect(liveRows("events_daily", "2026-10-01", "2026-10-07")).rejects.toThrow(
      /stopped before the last page/
    );
  });
});

describe("the survey page's start tiles", () => {
  it("are blank, with the reason, where the range's starts are incomplete", () => {
    // From 1 Sep: before 18 Sep and over 30 days back, so unfinished starts are missing.
    const page = buildSurveyPage({
      facts: factsFixture({ from: "2026-09-01", to: "2026-09-30" }),
      previous: null,
      benchmark: factsFixture(),
      benchmarkKind: "all",
      filters: parseFilters(
        { period: "custom", from: "2026-09-01", to: "2026-09-30" },
        "2026-10-21"
      ),
      today: "2026-10-21",
      now: new Date("2026-10-21T10:00:00Z"),
      questions: null,
      questionsError: null,
      introClicks: null,
    });
    const tile = (k: string) => page.tiles.find((t) => t.key === k)!;
    for (const k of ["starts", "completion"])
      expect(tile(k).blocked).toBe(
        "Survey starts before 18 Sep 2026 are incomplete once their drafts are cleared (30 days on)."
      );
    expect(tile("subs").blocked).toBeNull();
  });
});

describe("the explorer on a live Google table", () => {
  beforeEach(() => {
    clearLiveCache();
    runGa4Report.mockReset();
    process.env.GA4_PROPERTY_ID = "1";
  });
  const table = buildCatalog([], []).find((t) => t.name === "site_daily")!;
  const q = (filters: Array<{ column: string; op: string; value: string }>) => ({
    dateField: "date",
    from: "2026-10-18",
    to: "2026-10-18",
    filters: filters as never,
    columns: ["date", "bounce_rate"],
    sort: null,
    dir: "desc" as const,
    page: 1,
    size: 50,
    cursor: null,
  });

  it("compares a number as a number: 0.50 is the 0.5 a row holds", async () => {
    runGa4Report.mockResolvedValue([
      {
        dimensionValues: [{ value: "20261018" }],
        metricValues: Array.from({ length: 10 }, (_, i) => ({ value: i === 5 ? "0.5" : "1" })),
      },
    ]);
    expect(
      (await dailyRows(table, q([{ column: "bounce_rate", op: "eq", value: "0.50" }]))).total
    ).toBe(1);
    expect(
      (await dailyRows(table, q([{ column: "bounce_rate", op: "neq", value: "0.50" }]))).total
    ).toBe(0);
    expect(
      (await dailyRows(table, q([{ column: "bounce_rate", op: "in", value: "0.4, 0.50" }]))).total
    ).toBe(1);
  });

  it("says a range with no rows has none, never that a live table isn't synced", async () => {
    runGa4Report.mockResolvedValue([]);
    expect(await dailyRows(table, q([]))).toMatchObject({ total: 0, synced: true });
  });
});

describe("the live Ads and Search Console tables", () => {
  beforeEach(() => {
    clearLiveCache();
    googleAdsSearch.mockReset();
    queryGsc.mockReset();
    process.env.SEARCH_CONSOLE_SITE = "sc-domain:example.org";
  });

  it("show who changed the account by organization, never a person's address", async () => {
    googleAdsSearch.mockResolvedValue([
      {
        campaign: { name: "Price + Time Test" },
        changeEvent: {
          changeDateTime: "2026-10-16 14:58:44.702847",
          userEmail: "Someone.Person@Agency.example",
          clientType: "GOOGLE_ADS_WEB_CLIENT",
          changeResourceType: "AD_GROUP_CRITERION",
          resourceChangeOperation: "UPDATE",
          changedFields: "negative",
        },
      },
    ]);
    const today = new Date().toISOString().slice(0, 10);
    const rows = await liveRows("change_history", today, today)!;
    expect(rows).toEqual([
      {
        date: "2026-10-16",
        change_id: null,
        time: "14:58:44",
        changed_by: "agency.example",
        client: "google ads web client",
        resource: "ad group criterion",
        operation: "update",
        changed_fields: "negative",
        campaign_name: "Price + Time Test",
      },
    ]);
    expect(JSON.stringify(rows)).not.toMatch(/someone|person@/i);
  });

  it("name age bands and genders as people read them", async () => {
    googleAdsSearch.mockImplementation(async (q: string) =>
      q.includes("age_range_view")
        ? [
            {
              segments: { date: "2026-10-18" },
              adGroupCriterion: { ageRange: { type: "AGE_RANGE_25_34" } },
            },
            {
              segments: { date: "2026-10-18" },
              adGroupCriterion: { ageRange: { type: "AGE_RANGE_65_UP" } },
            },
            {
              segments: { date: "2026-10-18" },
              adGroupCriterion: { ageRange: { type: "AGE_RANGE_UNDETERMINED" } },
            },
          ]
        : [{ segments: { date: "2026-10-18" }, adGroupCriterion: { gender: { type: "MALE" } } }]
    );
    const rows = await liveRows("demographics_daily", "2026-10-18", "2026-10-18")!;
    expect(rows.map((r) => `${r.kind}:${r.value}`)).toEqual([
      "Age:25–34",
      "Age:65+",
      "Age:Unknown",
      "Gender:Male",
    ]);
  });

  it("add up report links' searches, their position weighted by impressions", async () => {
    queryGsc.mockResolvedValue([
      {
        keys: ["2026-10-18", "loveiq", "https://www.loveiq.org/report/rpt_a"],
        clicks: 1,
        impressions: 1,
        position: 2,
      },
      {
        keys: ["2026-10-18", "loveiq", "https://www.loveiq.org/report/rpt_b"],
        clicks: 0,
        impressions: 3,
        position: 6,
      },
      {
        keys: ["2026-10-18", "loveiq", "https://www.loveiq.org/"],
        clicks: 2,
        impressions: 4,
        position: 1.5,
      },
    ]);
    const rows = await liveRows("search_console_daily", "2026-10-18", "2026-10-18")!;
    expect(rows).toEqual([
      {
        date: "2026-10-18",
        query: "loveiq",
        page: "/report/[token]",
        clicks: 1,
        impressions: 4,
        ctr: 0.25,
        position: 5,
      },
      {
        date: "2026-10-18",
        query: "loveiq",
        page: "/",
        clicks: 2,
        impressions: 4,
        ctr: 0.5,
        position: 1.5,
      },
    ]);
  });
});
