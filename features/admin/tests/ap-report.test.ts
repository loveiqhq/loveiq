// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mockSupabaseFetch = vi.fn();
vi.mock("@features/admin/server/supabase", () => ({
  supabaseFetch: (...args: unknown[]) => mockSupabaseFetch(...args),
}));
// The screen test draws a payload the builder made, without the network or the URL.
const screenData = vi.hoisted(() => ({ payload: null as unknown }));
vi.mock("@features/admin/ui/hooks/useAdminFetch", () => ({
  useAdminFetch: () => ({
    data: screenData.payload,
    loading: false,
    error: null,
    refetch: () => {},
  }),
}));
vi.mock("@features/admin/ui/ap/useApFilters", () => ({ useApFilters: () => ({ params: {} }) }));
vi.mock("@features/admin/ui/ap/ApFilterBar", () => ({ default: () => null }));

import { parseFilters } from "@features/admin/server/ap/filters";
import {
  buildReportPage,
  fetchReportExtras,
  type ReportExtras,
} from "@features/admin/server/ap/report-page";
import ApReport from "@features/admin/ui/ap/ApReport";

import { factsFixture, sub } from "./ap-fixtures";

const TODAY = "2026-10-13";
const now = new Date("2026-10-13T10:00:00Z");
const filters = parseFilters({ period: "custom", from: "2026-10-01", to: "2026-10-07" }, TODAY);
const facts = factsFixture();
const extras: ReportExtras = {
  wizard: [],
  map_steppers: [],
  chapters: [],
  paywall_clicks: [],
  chapter_stats: [],
  chapter_readers: 0,
  chapter_stats_from: null,
  wizard_skips: [],
  wizard_skips_from: null,
  issues: [],
  feedback: [],
  votes_total: 0,
  emails: [],
  email_events_from: null,
  email_opens_from: null,
};
const day = (d: string) => ({ day: d, at: `${d}T10:00:00Z`, openedAt: `${d}T10:05:00Z` });
/** Readers from before 18 Sep 2026, when the report's events still needed cookie consent. */
const early = factsFixture({
  from: "2026-09-10",
  to: "2026-09-16",
  visits: [],
  starts: [],
  money: [],
  subs: [sub({ id: 21, ...day("2026-09-11") })],
});
const posthog = (over: { sources?: Array<{ source: string; sessions: number }> } = {}) => ({
  ok: true as const,
  value: { sources: [], campaigns: [], wizardSkips: 7, ...over },
});

/** The page for the fixture's week; anything else as given. */
const page = (over: Partial<Parameters<typeof buildReportPage>[0]> = {}) =>
  buildReportPage({
    facts,
    previous: null,
    benchmark: facts,
    extras,
    returns: null,
    filters,
    today: TODAY,
    now,
    ...over,
  });

describe("report page", () => {
  it("tile feet leave the 18 Sep gap to the banner and say only why a comparison is withheld", () => {
    const p = page({ previous: early });
    const foot = (k: string) => p.tiles.find((t) => t.key === k)!.foot;
    expect(foot("returned")).toBe("opened again later · not compared: before 18 Sep");
    expect(foot("initiated")).toBe(
      "of report openers actively clicked a paywall button · not compared: before 18 Sep"
    );
    expect(foot("invite")).toMatch(/\(0 of 2\) · not compared: before 18 Sep$/);
    expect(foot("read")).toMatch(
      /^per reader, all visits, each up to 30 min( · median \d+:\d\d)? · recorded for \d+ of \d+ · not compared: earlier readers' later visits count too$/
    );
    expect(p.wizard.tiles.find((t) => t.key === "completed")).toMatchObject({
      prev: null,
      foot: "reached the last slide · not compared: before 18 Sep",
    });

    // A range before 18 Sep: the banner says what is missing, the feet do not repeat it.
    const q = page({
      facts: early,
      benchmark: early,
      filters: parseFilters({ period: "custom", from: "2026-09-10", to: "2026-09-16" }, TODAY),
    });
    expect(q.notes.join(" ")).toContain("Before 18 Sep 2026");
    for (const t of [...q.tiles, ...q.wizard.tiles]) expect(t.foot).not.toMatch(/18 Sep|cookies/);
    expect(q.tiles.find((t) => t.key === "read")!.foot).toMatch(
      /^per reader, all visits, each up to 30 min( · median \d+:\d\d)? · recorded for \d+ of \d+$/
    );
  });

  it("the wizard's four tiles compare like the others, and fewer leaving reads as better", () => {
    const cur = factsFixture({
      subs: [sub({ id: 1, wizardSlide: 5 }), sub({ id: 2, wizardSlide: 2, openedAt: null })],
    });
    const prev = factsFixture({
      from: "2026-09-24",
      to: "2026-09-30",
      visits: [],
      starts: [],
      money: [],
      subs: [
        sub({ id: 11, ...day("2026-09-24"), wizardSlide: 5 }),
        sub({ id: 12, ...day("2026-09-25"), openedAt: null, wizardSlide: 1 }),
        sub({ id: 13, ...day("2026-09-25"), openedAt: null }),
      ],
    });
    const p = page({ facts: cur, previous: prev, benchmark: cur, returns: posthog() });
    const tile = (k: string) => p.wizard.tiles.find((t) => t.key === k)!;
    expect(p.wizard.tiles.map((t) => t.label)).toEqual([
      "Intro started",
      "Completed all 6",
      "Skipped intro",
      "Left the report",
    ]);
    expect(tile("intro")).toMatchObject({
      value: 2,
      prev: 3,
      foot: "vs 3 · everyone who finished the survey",
    });
    expect(tile("completed")).toMatchObject({ value: 0.5, prev: 1 / 3 });
    expect(tile("skipped")).toMatchObject({ value: 7, prev: null, spark: [] });
    expect(tile("left")).toMatchObject({
      value: 0.5,
      prev: 2 / 3,
      goodWhen: "down",
      foot: "closed during the intro",
    });
    expect(tile("left").spark.length).toBeGreaterThan(0);
  });

  it("Skipped intro says when PostHog failed, and that it ignores a filter", () => {
    const failed = page({ returns: { ok: false, error: "PostHog could not be read just now." } });
    expect(failed.wizard.tiles.find((t) => t.key === "skipped")).toMatchObject({
      value: null,
      blocked: "PostHog could not be read just now.",
    });
    const narrowed = page({ returns: posthog(), filters: { ...filters, device: "phone" } });
    expect(narrowed.wizard.tiles.find((t) => t.key === "skipped")!.foot).toBe(
      "clicked Skip Intro, as PostHog saw it · all traffic"
    );
  });

  it("slide 2's engagement: its readers since 6 Oct who stepped through the map, by the filters", () => {
    const mapFacts = factsFixture({
      subs: [
        sub({ id: 1, ...day("2026-10-06"), wizardSlide: 3 }),
        sub({ id: 2, ...day("2026-10-06"), wizardSlide: 1 }),
        sub({ id: 3, ...day("2026-10-07") }),
        sub({ id: 4, ...day("2026-10-07"), wizardSlide: 2, src: "ig", med: null, ads: false }),
        // Before the map's steps were recorded: not a reader of it here.
        sub({ id: 5, ...day("2026-10-05"), wizardSlide: 4 }),
      ],
    });
    const engaged = (source: "all" | "google_ads", steppers: number[] | null) =>
      page({
        facts: mapFacts,
        benchmark: mapFacts,
        extras: { ...extras, map_steppers: steppers },
        filters: { ...filters, source },
      }).wizard.slides.map((s) => s.engaged);
    expect(engaged("all", [1, 4, 5])).toEqual([null, 2 / 3, null, null, null, null]);
    expect(engaged("google_ads", [1, 4, 5])).toEqual([null, 1 / 2, null, null, null, null]);
    expect(engaged("all", null)).toEqual(Array(6).fill(null));
    // Readers of the map only before 6 Oct: blank, not 0%.
    const before = factsFixture({ subs: [sub({ id: 1, wizardSlide: 2 })] });
    expect(page({ facts: before, benchmark: before }).wizard.slides[1]!.engaged).toBeNull();
  });

  it("Back is a share of the slide's readers, and a count once a filter is on", () => {
    const backFacts = factsFixture({
      subs: [
        sub({ id: 1, wizardSlide: 5 }),
        sub({ id: 2, wizardSlide: 3 }),
        sub({ id: 3, wizardSlide: 1 }),
        sub({ id: 4, wizardSlide: 1, src: "ig", med: null, ads: false }),
      ],
    });
    const wizard = [{ slide: 1, went_on: 2, went_back: 1, median_ms: null, timed: 0 }];
    const slide2 = (source: "all" | "google_ads") =>
      page({
        facts: backFacts,
        benchmark: backFacts,
        extras: { ...extras, wizard },
        filters: { ...filters, source },
      }).wizard.slides[1]!;
    expect(slide2("all")).toMatchObject({ reached: 4, back: 1, backShare: 0.25 });
    expect(slide2("google_ads")).toMatchObject({ reached: 3, back: 1, backShare: null });
    // Slide 1 has no Back button: no share, as the design draws it.
    const slide1 = page({ facts: backFacts, benchmark: backFacts, extras, filters }).wizard
      .slides[0]!;
    expect(slide1.backShare).toBeNull();
  });

  it("Skip intro: of the slide's readers since it was recorded; a skip is no exit, by the filters", () => {
    const skipFacts = factsFixture({
      subs: [
        // Before Skip Intro was recorded (5 Oct): a skip there still reads as an exit.
        sub({ id: 1, ...day("2026-10-03"), wizardSlide: 1 }),
        sub({ id: 2, ...day("2026-10-05"), wizardSlide: 1 }),
        sub({ id: 3, ...day("2026-10-05"), wizardSlide: 1 }),
        sub({ id: 4, ...day("2026-10-05"), wizardSlide: 2 }),
        sub({ id: 5, ...day("2026-10-06"), wizardSlide: 5 }),
        // Skipped on the last slide and opened the report: went on, counted once.
        sub({ id: 6, ...day("2026-10-06"), wizardSlide: 5, src: "ig", med: null, ads: false }),
        // Went back from slide 4 and skipped on slide 2: no exit on slide 4.
        sub({ id: 7, ...day("2026-10-06"), wizardSlide: 3 }),
      ],
    });
    const wizard = (
      source: "all" | "google_ads",
      skips: ReportExtras["wizard_skips"],
      from: string | null
    ) =>
      page({
        facts: skipFacts,
        benchmark: skipFacts,
        extras: { ...extras, wizard_skips: skips, wizard_skips_from: from },
        filters: { ...filters, source },
      }).wizard.slides;
    const skips = [
      { slide: 1, n: 2, sids: [2, 7] },
      { slide: 5, n: 1, sids: [6] },
    ];
    const all = wizard("all", skips, "2026-10-05");
    expect(all[1]).toMatchObject({ reached: 7, cont: 4 / 7, skip: 2 / 6, exit: 2 / 7 });
    expect(all[3]).toMatchObject({ reached: 3, skip: 0, exit: 0 });
    expect(all[5]).toMatchObject({ reached: 2, cont: 1, skip: 0.5, exit: 0 });
    expect(all[0]!.skip).toBe(0);
    const ads = wizard("google_ads", skips, "2026-10-05");
    expect(ads[1]).toMatchObject({ reached: 6, skip: 0.4, exit: 2 / 6 });
    expect(ads[5]).toMatchObject({ reached: 1, skip: 0, exit: 0 });
    // Not recorded yet: no Skip intro, and Exit as it always was.
    const none = wizard("all", [], null);
    expect(none.map((s) => s.skip)).toEqual(Array(6).fill(null));
    expect(none[1]!.exit).toBe(3 / 7);
    expect(none[3]!.exit).toBe(1 / 3);
  });

  it("Skipped intro counts our own records once the whole range has them, PostHog's before", () => {
    const skipFacts = factsFixture({
      subs: [
        sub({ id: 1, wizardSlide: 1 }),
        sub({ id: 2, wizardSlide: 3, src: "ig", med: null, ads: false }),
        sub({ id: 3, wizardSlide: 5 }),
      ],
    });
    const tile = (from: string | null, over: Partial<Parameters<typeof buildReportPage>[0]> = {}) =>
      page({
        facts: skipFacts,
        benchmark: skipFacts,
        extras: {
          ...extras,
          wizard_skips: [
            { slide: 1, n: 1, sids: [1] },
            { slide: 3, n: 1, sids: [2] },
          ],
          wizard_skips_from: from,
        },
        returns: posthog(),
        ...over,
      }).wizard.tiles.find((t) => t.key === "skipped")!;
    expect(tile("2026-10-01")).toMatchObject({ value: 2, foot: "pressed Skip Intro" });
    // Ours follow the filters, and need no PostHog.
    expect(
      tile("2026-10-01", {
        filters: { ...filters, source: "google_ads" },
        returns: { ok: false, error: "PostHog could not be read just now." },
      })
    ).toMatchObject({ value: 1, blocked: null });
    expect(tile("2026-10-04")).toMatchObject({
      value: 7,
      foot: "clicked Skip Intro, as PostHog saw it · our own count from 4 Oct 2026",
    });
  });

  it("chapters: reach, time and click rates from the reading per chapter, on the days recorded", () => {
    const stat = (section: string, over: Partial<ReportExtras["chapter_stats"][number]> = {}) => ({
      section,
      reached: 8,
      ms_avg: 95_000,
      opened: 6,
      show_all: 0,
      learn_more: 2,
      try_this: 4,
      pw_seen: 5,
      pw_click: 1,
      ...over,
    });
    const reading = (from: string | null) =>
      page({
        extras: {
          ...extras,
          // The Summary's votes list it among earlier versions; its reading counts elsewhere.
          chapters: [{ section: "summary", up: 1, down: 0 }],
          chapter_stats: [
            stat("typical_beliefs"),
            stat("core_archetype", { reached: 10, ms_avg: 30_000, show_all: 3, pw_seen: 0 }),
            stat("summary"),
          ],
          chapter_readers: 10,
          chapter_stats_from: from,
        },
      });
    const p = reading("2026-10-03");
    const row = (id: string) => p.chapters.find((c) => c.id === id)!;
    expect(row("typical_beliefs")).toMatchObject({
      reach: 0.8,
      avgMs: 95_000,
      showMore: null,
      learnMore: 0.25,
      exercise: 0.5,
      paywall: 0.2,
      paywallSeen: 5,
      paywallClicked: 1,
    });
    expect(row("core_archetype")).toMatchObject({ reach: 1, showMore: 0.3, paywall: null });
    // A live chapter nobody reached is 0%; an earlier version's has no reading at all.
    expect(row("love_language")).toMatchObject({ reach: 0, avgMs: null, learnMore: null });
    expect(row("summary")).toMatchObject({ reach: null, avgMs: null, paywall: null });
    expect(p.chapterReading).toEqual({ from: "2026-10-03", readers: 10, recorded: true });
    // A range before the first recorded day, or none yet: blank, never 0.
    for (const from of ["2026-10-08", null]) {
      const q = reading(from);
      expect(q.chapters.find((c) => c.id === "typical_beliefs")).toMatchObject({
        reach: null,
        avgMs: null,
        learnMore: null,
        paywall: null,
      });
      expect(q.chapterReading.recorded).toBe(false);
    }
  });

  it("average reading time has the benchmark readers' average beside it", () => {
    const bench = factsFixture({
      from: "2026-08-01",
      to: "2026-10-12",
      subs: [
        sub({ id: 31, day: "2026-09-20", readMs: 300_000, closed: 1 }),
        sub({ id: 32, day: "2026-09-21", readMs: 500_000, closed: 2, src: "ig", ads: false }),
        // Before 18 Sep, and a reader whose reading was not recorded: neither counts.
        sub({ id: 33, day: "2026-09-10", readMs: 900_000, closed: 1 }),
        sub({ id: 34, day: "2026-09-22" }),
      ],
    });
    expect(page({ benchmark: bench }).time.benchAvgMs).toBe(400_000);
    // The benchmark is every reader, whatever the filters.
    const narrowed = page({ benchmark: bench, filters: { ...filters, source: "google_ads" } });
    expect(narrowed.time.benchAvgMs).toBe(400_000);
  });

  it("what brought readers back: PostHog's four ways in a fixed order, empty ones at 0%", () => {
    const p = page({
      returns: posthog({
        sources: [
          { source: "Email link", sessions: 3 },
          { source: "Bookmark or direct", sessions: 1 },
        ],
      }),
    });
    expect(p.returns.sources).toEqual({
      ok: true,
      value: [
        { source: "Bookmark or direct", sessions: 1, share: 0.25 },
        { source: "Email link", sessions: 3, share: 0.75 },
        { source: "Share link from a friend", sessions: 0, share: 0 },
        { source: "Another tagged link", sessions: 0, share: 0 },
      ],
    });
    expect(p.returns.viaEmail).toBe(0.75);
  });

  it("an email's return rate is its returners over its sends, from our own records", () => {
    const campaigns = (emails: ReportExtras["emails"]) =>
      page({
        extras: { ...extras, emails },
        // PostHog's own count of people from the link no longer feeds the table.
        returns: {
          ok: true,
          value: {
            sources: [],
            campaigns: [{ campaign: "72h_no_unlock", people: 99 }],
            wizardSkips: 0,
          },
        },
      }).returns.campaigns;
    const c = campaigns([
      {
        stage: "72h_no_unlock",
        sent: 40,
        opened: null,
        clicked: null,
        returned: 10,
        bought: 2,
        revenue: 7,
      },
    ]);
    expect(c.map((x) => x.stage)).toEqual(["72h_no_unlock", "54h_no_unlock", "30h_no_unlock"]);
    expect(c[0]).toMatchObject({ sent: 40, returned: 10, returnRate: 0.25, purchased: 2 });
    expect(c[1]).toMatchObject({ sent: 0, returned: 0, returnRate: null });
    // An older database function has no returns: blank, not zero.
    expect(
      campaigns([
        {
          stage: "72h_no_unlock",
          sent: 40,
          opened: null,
          clicked: null,
          returned: null,
          bought: 2,
          revenue: 7,
        },
      ])[0]
    ).toMatchObject({ returned: null, returnRate: null });
  });

  it("opens and clicks count, with their share of sent, from the first whole day each was kept", () => {
    const row = {
      stage: "72h_no_unlock",
      sent: 40,
      opened: 20,
      clicked: 5,
      returned: 10,
      bought: 2,
      revenue: 7,
    };
    // The fixture's range starts on 1 Oct.
    const returns = (events: string | null, opens: string | null) =>
      page({
        extras: { ...extras, emails: [row], email_events_from: events, email_opens_from: opens },
      }).returns;

    const both = returns("2026-09-29", "2026-09-29");
    expect(both.campaigns[0]).toMatchObject({
      opened: 20,
      openRate: 0.5,
      clicked: 5,
      clickRate: 0.125,
    });
    // A retired stage sent nothing: none opened, and no share of nothing.
    expect(both.campaigns[1]).toMatchObject({ opened: 0, openRate: null, clicked: 0 });
    expect(both.emailEvents).toBe(
      "Opens and clicks count from 30 Sep 2026, the first whole day recorded; a range that starts earlier shows —."
    );

    // Opens are switched on later than the rest: until one is kept, opens stay blank.
    const clicksOnly = returns("2026-09-30", null);
    expect(clicksOnly.campaigns[0]).toMatchObject({ opened: null, openRate: null, clicked: 5 });
    expect(clicksOnly.emailEvents).toBe(
      "Clicks count from 1 Oct 2026, the first whole day recorded (a range that starts earlier shows —); opens are not recorded yet."
    );
    expect(returns("2026-09-20", "2026-09-27").emailEvents).toBe(
      "Clicks count from 21 Sep 2026 and opens from 28 Sep 2026, the first whole days recorded; a range that starts earlier shows —."
    );

    // The first day kept is partial (sends before the deploy carried no tags): a range
    // starting on it is not counted, nor one before anything was kept.
    expect(returns("2026-10-01", "2026-10-01").campaigns[0]).toMatchObject({
      opened: null,
      clicked: null,
    });
    const none = returns(null, null);
    expect(none.campaigns[0]).toMatchObject({ opened: null, clicked: null });
    expect(none.emailEvents).toBe("Opens and clicks are not recorded yet.");
  });
});

describe("fetchReportExtras", () => {
  const answer = (body: unknown) =>
    mockSupabaseFetch.mockResolvedValue({ ok: true, status: 200, json: async () => body });

  it("reads the parts an older function lacks as blank, never as zero", async () => {
    answer({
      wizard: [],
      chapters: [],
      feedback: [],
      emails: [{ stage: "72h_no_unlock", sent: 4, bought: 0, revenue: 0 }],
    });
    const old = await fetchReportExtras("2026-10-01", "2026-10-07");
    expect(old.map_steppers).toBeNull();
    expect(old.emails[0]).toMatchObject({ sent: 4, returned: null, opened: null, clicked: null });
    expect(old.email_events_from).toBeNull();
    expect(old.email_opens_from).toBeNull();
    // No reading per chapter or Skip Intro yet: not recorded, which the page says.
    expect(old).toMatchObject({
      chapter_stats: [],
      chapter_readers: 0,
      chapter_stats_from: null,
      wizard_skips: [],
      wizard_skips_from: null,
    });

    answer({
      wizard: [],
      map_steppers: [3, "4"],
      chapters: [],
      feedback: [],
      emails: [
        {
          stage: "72h_no_unlock",
          sent: 4,
          returned: 1,
          delivered: 4,
          opened: 3,
          clicked: 1,
          bought: 0,
          revenue: 0,
        },
      ],
      email_events_from: "2026-10-15",
      email_opens_from: null,
    });
    const latest = await fetchReportExtras("2026-10-01", "2026-10-07");
    expect(latest.map_steppers).toEqual([3, 4]);
    expect(latest.emails[0]).toMatchObject({ returned: 1, opened: 3, clicked: 1 });
    expect(latest.email_events_from).toBe("2026-10-15");
    expect(latest.email_opens_from).toBeNull();

    answer({
      wizard: [],
      chapters: [],
      feedback: [],
      emails: [],
      chapter_stats: [{ section: "typical_beliefs", reached: 2, ms_avg: 61000 }],
      chapter_readers: 3,
      chapter_stats_from: "2026-10-15",
      wizard_skips: [{ slide: 1, n: 2, sids: [7, "8"] }],
      wizard_skips_from: "2026-10-15",
    });
    const tracked = await fetchReportExtras("2026-10-15", "2026-10-21");
    expect(tracked).toMatchObject({
      chapter_stats: [{ section: "typical_beliefs", reached: 2, ms_avg: 61000 }],
      chapter_readers: 3,
      chapter_stats_from: "2026-10-15",
      wizard_skips: [{ slide: 1, n: 2, sids: [7, 8] }],
      wizard_skips_from: "2026-10-15",
    });
  });
});

describe("report page, on screen", () => {
  const screenFacts = factsFixture({
    subs: [
      sub({ id: 1, ...day("2026-10-06"), wizardSlide: 5 }),
      sub({ id: 2, ...day("2026-10-06"), wizardSlide: 3 }),
      sub({ id: 3, ...day("2026-10-07"), wizardSlide: 1, openedAt: null }),
    ],
  });
  const payload = page({
    facts: screenFacts,
    benchmark: screenFacts,
    extras: {
      ...extras,
      wizard: [
        { slide: 1, went_on: 2, went_back: 1, median_ms: 19_000, timed: 2 },
        { slide: 2, went_on: 1, went_back: 2, median_ms: 8_000, timed: 1 },
      ],
      map_steppers: [1],
      chapters: [
        { section: "core_archetype", up: 3, down: 1 },
        { section: "summary", up: 1, down: 0 },
      ],
      feedback: [
        {
          at: "2026-10-07T21:15:00Z",
          submission: 2,
          section: "core_archetype",
          vote: "down",
          issue: "unclear",
          commented: true,
        },
        {
          at: "2026-10-06T12:00:00Z",
          submission: 1,
          section: "summary",
          vote: "up",
          issue: null,
          commented: false,
        },
      ],
      votes_total: 2,
      emails: [
        {
          stage: "72h_no_unlock",
          sent: 8,
          opened: 4,
          clicked: 1,
          returned: 2,
          bought: 1,
          revenue: 3.49,
        },
      ],
      email_events_from: "2026-09-20",
      email_opens_from: "2026-09-25",
    },
  });
  /** The data rows of a table, top to bottom, by their first column's text. */
  const rowNames = (table: string) =>
    within(screen.getByRole("table", { name: table }))
      .getAllByRole("rowheader")
      .map((h) => h.textContent ?? "");

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("draws the wizard's tiles, its Back and map columns, and sorts by a header", () => {
    screenData.payload = payload;
    render(createElement(ApReport));
    expect(screen.getByText("Left the report")).toBeInTheDocument();
    expect(screen.getByText("33% stepped through the deep dives")).toBeInTheDocument();
    expect(rowNames("Intro wizard slides")[0]).toContain("A note before you explore");
    // Back: slide 2 lost 1 of its 3 readers, slide 3 both of its 2.
    fireEvent.click(screen.getByRole("button", { name: "Sort by Back" }));
    expect(rowNames("Intro wizard slides").slice(0, 2)).toEqual([
      expect.stringContaining("Unlocking your report is fully risk free"),
      expect.stringContaining("Report parts & chapters"),
    ]);
    const campaigns = within(screen.getByRole("table", { name: "Email campaigns" }));
    expect(campaigns.getByText("25.0%")).toBeInTheDocument();
    // Opened and Clicked: the count, its share of sent under it.
    expect(campaigns.getByText("50.0%")).toBeInTheDocument();
    expect(campaigns.getByText("12.5%")).toBeInTheDocument();
    expect(
      screen.getByText(/Clicks count from 21 Sep 2026 and opens from 26 Sep 2026/)
    ).toBeInTheDocument();
    expect(screen.getByText(/Opens are inflated by Apple Mail/)).toBeInTheDocument();
    // Both sort: the second press turns low to high, so the one opened email goes last.
    const live = expect.stringContaining("72 hours on, not unlocked");
    fireEvent.click(campaigns.getByRole("button", { name: "Sort by Opened" }));
    expect(rowNames("Email campaigns")[0]).toEqual(live);
    fireEvent.click(campaigns.getByRole("button", { name: "Sort by Opened" }));
    expect(rowNames("Email campaigns")[2]).toEqual(live);
    fireEvent.click(campaigns.getByRole("button", { name: "Sort by Clicked" }));
    expect(rowNames("Email campaigns")[0]).toEqual(live);
  });

  it("shows — for opens and clicks in a range that starts before they were counted", () => {
    screenData.payload = page({
      extras: {
        ...extras,
        emails: [
          {
            stage: "72h_no_unlock",
            sent: 8,
            opened: 4,
            clicked: 1,
            returned: 2,
            bought: 1,
            revenue: 3.49,
          },
        ],
      },
    });
    render(createElement(ApReport));
    const campaigns = within(screen.getByRole("table", { name: "Email campaigns" }));
    const rows = campaigns.getAllByRole("row").slice(1);
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      // Status and Sent, then Opened and Clicked.
      const cells = within(row)
        .getAllByRole("cell")
        .map((c) => c.textContent);
      expect(cells.slice(2, 4)).toEqual(["—", "—"]);
    }
    expect(screen.getByText(/Opens and clicks are not recorded yet\./)).toBeInTheDocument();
  });

  it("filters the feedback log from its headers' funnels", () => {
    screenData.payload = payload;
    render(createElement(ApReport));
    expect(screen.getByText("Feedback log · 2 of 2")).toBeInTheDocument();
    // The chapters table has a Chapter funnel too: these are the log's own.
    const log = within(document.getElementById("feedback")!);
    fireEvent.click(log.getByRole("button", { name: "Filter Vote" }));
    fireEvent.change(log.getByRole("combobox", { name: "Filter vote" }), {
      target: { value: "Bad" },
    });
    expect(screen.getByText("Feedback log · 1 of 1")).toBeInTheDocument();
    expect(screen.getByText("left a comment").className).toContain("font-serif italic");
    // The filters add up: the bad vote's reason, then the chapter that had only a good vote.
    fireEvent.click(log.getByRole("button", { name: "Filter Issue" }));
    fireEvent.change(log.getByRole("combobox", { name: "Filter issue" }), {
      target: { value: "Unclear" },
    });
    expect(screen.getByText("Feedback log · 1 of 1")).toBeInTheDocument();
    fireEvent.click(log.getByRole("button", { name: "Filter Chapter" }));
    fireEvent.change(log.getByRole("combobox", { name: "Filter chapter" }), {
      target: { value: payload.feedback.log[1]!.chapter },
    });
    expect(screen.getByText("No votes match the filters.")).toBeInTheDocument();
  });

  it("filters the log by submission, and the campaigns and chapters by their funnels", () => {
    screenData.payload = payload;
    render(createElement(ApReport));
    const log = within(document.getElementById("feedback")!);
    const sub = payload.feedback.log.find((r) => r.submission !== null)!;
    fireEvent.click(log.getByRole("button", { name: "Filter Submission" }));
    const subs = log.getByRole("combobox", { name: "Filter submission" });
    fireEvent.change(subs, { target: { value: `#${sub.submission}` } });
    const want = payload.feedback.log.filter((r) => r.submission === sub.submission).length;
    expect(screen.getByText(`Feedback log · ${want} of ${want}`)).toBeInTheDocument();

    const campaigns = within(screen.getByRole("table", { name: "Email campaigns" }));
    const before = campaigns.getAllByRole("row").length;
    fireEvent.click(campaigns.getByRole("button", { name: "Filter Status" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Filter status" }), {
      target: { value: "Retired" },
    });
    const retired = payload.returns.campaigns.filter((c) => c.status === "Retired").length;
    expect(campaigns.getAllByRole("row")).toHaveLength(1 + retired);
    expect(before).toBe(1 + payload.returns.campaigns.length);

    const chapters = within(screen.getByRole("table", { name: "Chapters" }));
    fireEvent.click(chapters.getByRole("button", { name: "Filter Chapter" }));
    fireEvent.change(
      within(document.getElementById("chapters")!).getByRole("combobox", {
        name: "Filter chapter",
      }),
      { target: { value: payload.chapters[0]!.name } }
    );
    expect(chapters.getAllByRole("row")).toHaveLength(2);
  });

  it("draws Skip intro between Continue and Back, sorts by it, and says what Exit leaves out", () => {
    screenData.payload = page({
      facts: screenFacts,
      benchmark: screenFacts,
      extras: {
        ...extras,
        wizard_skips: [{ slide: 1, n: 1, sids: [3] }],
        wizard_skips_from: "2026-10-06",
      },
    });
    render(createElement(ApReport));
    const table = within(screen.getByRole("table", { name: "Intro wizard slides" }));
    expect(table.getAllByRole("columnheader").map((h) => h.textContent)).toEqual([
      "#",
      "Slide",
      "Time",
      "Reached",
      "Continue",
      "Skip intro",
      "Back",
      "Exit",
      "Engagement on slide",
    ]);
    fireEvent.click(table.getByRole("button", { name: "Sort by Skip intro" }));
    expect(rowNames("Intro wizard slides")[0]).toContain("Report parts & chapters");
    expect(table.getByText("33.3%")).toBeInTheDocument();
    expect(
      screen.getByText(/before 6 Oct 2026 a skip counts as an exit/, { exact: false })
    ).toBeInTheDocument();
  });

  it("draws each chapter's reading, sorts by the design's eight pills, and says from when", () => {
    const stat = (
      section: string,
      over: Partial<ReportExtras["chapter_stats"][number]>
    ): ReportExtras["chapter_stats"][number] => ({
      section,
      reached: 0,
      ms_avg: null,
      opened: 0,
      show_all: 0,
      learn_more: 0,
      try_this: 0,
      pw_seen: 0,
      pw_click: 0,
      ...over,
    });
    screenData.payload = page({
      facts: screenFacts,
      benchmark: screenFacts,
      extras: {
        ...extras,
        chapter_stats: [
          stat("typical_beliefs", {
            reached: 3,
            ms_avg: 125_000,
            learn_more: 1,
            try_this: 2,
            pw_seen: 2,
            pw_click: 1,
          }),
          stat("core_archetype", { reached: 4, ms_avg: 40_000, show_all: 2 }),
          stat("love_language", { reached: 1, ms_avg: 8_000, pw_seen: 1, pw_click: 1 }),
        ],
        chapter_readers: 4,
        chapter_stats_from: "2026-10-05",
      },
    });
    render(createElement(ApReport));
    const section = within(document.getElementById("chapters")!);
    expect(section.getByText("Recorded from 5 Oct 2026")).toBeInTheDocument();
    const pills = within(section.getByRole("group", { name: "Sort chapters by" }));
    expect(pills.getAllByRole("button").map((b) => b.textContent)).toEqual([
      "Report order",
      "Reach",
      "Time",
      "Feedback",
      "Show more",
      "Paywall",
      "Learn more",
      "Exercise",
    ]);
    const table = within(screen.getByRole("table", { name: "Chapters" }));
    for (const column of ["Reach", "Avg. time", "Show more CTR", "Paywall CTR"]) {
      expect(table.getByRole("button", { name: `Sort by ${column}` })).toBeInTheDocument();
    }
    expect(table.getByText("2:05")).toBeInTheDocument();
    // The paywall rate, with how many clicked of how many saw it under it.
    expect(table.getByText("1 of 2")).toBeInTheDocument();
    fireEvent.click(pills.getByRole("button", { name: "Paywall" }));
    expect(rowNames("Chapters").slice(0, 2)).toEqual([
      expect.stringContaining("Love Language"),
      expect.stringContaining("Typical Beliefs"),
    ]);
    fireEvent.click(table.getByRole("button", { name: "Sort by Reach" }));
    expect(rowNames("Chapters").slice(0, 3)).toEqual([
      expect.stringContaining("Core Archetype"),
      expect.stringContaining("Typical Beliefs"),
      expect.stringContaining("Love Language"),
    ]);
    fireEvent.click(pills.getByRole("button", { name: "Exercise" }));
    expect(rowNames("Chapters")[0]).toContain("Typical Beliefs");
    fireEvent.click(pills.getByRole("button", { name: "Report order" }));
    expect(rowNames("Chapters")[0]).toContain("Introduction");
  });

  it("before any reading per chapter, says so and keeps the paywall clicks as counts", () => {
    screenData.payload = page({
      facts: screenFacts,
      benchmark: screenFacts,
      extras: { ...extras, paywall_clicks: [{ section: "typical_beliefs", readers: 2 }] },
    });
    render(createElement(ApReport));
    const section = within(document.getElementById("chapters")!);
    expect(section.getByText("Not recorded yet")).toBeInTheDocument();
    expect(section.getByText("2 clicked")).toBeInTheDocument();
    expect(section.getByText(/Paywall shows the readers who clicked/)).toBeInTheDocument();
  });

  it("marks the section in view in the section nav", () => {
    let seen: IntersectionObserverCallback = () => {};
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(cb: IntersectionObserverCallback) {
          seen = cb;
        }
        observe() {}
        disconnect() {}
      }
    );
    screenData.payload = payload;
    render(createElement(ApReport));
    const nav = within(screen.getByRole("navigation", { name: "Report sections" }));
    expect(nav.getByRole("link", { name: "Wizard" })).toHaveAttribute("aria-current", "true");
    act(() =>
      seen(
        [
          {
            isIntersecting: true,
            target: document.getElementById("chapters")!,
          } as unknown as IntersectionObserverEntry,
        ],
        {} as IntersectionObserver
      )
    );
    expect(nav.getByRole("link", { name: "Chapters" })).toHaveAttribute("aria-current", "true");
    expect(nav.getByRole("link", { name: "Wizard" })).not.toHaveAttribute("aria-current");
  });
});
