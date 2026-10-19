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
  fetchReportTour,
  twoFigures,
  wholeShares,
  type ReportExtras,
  type ReportTour,
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
  chapter_depth: [],
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
      "of report openers actively clicked a paywall CTA · not compared: before 18 Sep"
    );
    expect(foot("invite")).toBe(
      "of report openers invited a friend to the test (0 of 2) · not compared: before 18 Sep"
    );
    expect(foot("read")).toMatch(
      /^per reader, all visits, each up to 30 min( · median \d+:\d\d)? · recorded for \d+ of \d+ · not compared: before 18 Sep$/
    );
    // The tiles say it in grey where the change would stand, and carry no earlier figure.
    for (const k of ["read", "median", "returned", "initiated", "invite"]) {
      expect(p.tiles.find((t) => t.key === k)).toMatchObject({
        prev: null,
        note: "No comparison before 18\u00a0Sep",
      });
    }
    // Opens were recorded for everyone all along: compared.
    expect(p.tiles.find((t) => t.key === "opened")).toMatchObject({ prev: 1 });
    expect(p.tiles.find((t) => t.key === "opened")!.note).toBeUndefined();
    expect(p.wizard.tiles.find((t) => t.key === "completed")).toMatchObject({
      prev: null,
      foot: "continued through slide 6 · not compared: before 18 Sep",
      note: "No comparison before 18\u00a0Sep",
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
      "Completed",
      "Skipped intro",
      "Left the wizard / bounced",
    ]);
    expect(tile("intro")).toMatchObject({
      value: 2,
      prev: 3,
      foot: "vs 3 · everyone who finished the survey",
    });
    expect(tile("completed")).toMatchObject({ value: 0.5, prev: 1 / 3 });
    // PostHog's count of sessions, not a share of our readers: said so, never compared.
    expect(tile("skipped")).toMatchObject({
      value: 7,
      prev: null,
      spark: [],
      note: "sessions PostHog saw",
    });
    expect(tile("left")).toMatchObject({
      value: 0.5,
      prev: 2 / 3,
      goodWhen: "down",
      foot: "closed during the intro",
    });
    expect(tile("left").spark.length).toBeGreaterThan(0);
  });

  it("share, rating and invite compare as rates with the period before; their feet count people", () => {
    const cur = factsFixture({
      subs: [
        sub({ id: 1, shared: true, votes: 1, invited: true }),
        sub({ id: 2, votes: 2, invited: true }),
        sub({ id: 3 }),
      ],
    });
    const before = factsFixture({
      from: "2026-09-24",
      to: "2026-09-30",
      visits: [],
      starts: [],
      money: [],
      subs: [
        sub({ id: 11, ...day("2026-09-24"), invited: true, invitedAt: "2026-09-24T11:00:00Z" }),
      ],
    });
    const p = page({ facts: cur, benchmark: cur, previous: before });
    const tile = (k: string) => p.tiles.find((t) => t.key === k)!;
    // The page draws each change as a percentage of the earlier rate (KpiTileV2).
    expect(tile("share")).toMatchObject({
      value: 1 / 3,
      prev: 0,
      foot: "of report openers shared their report (1 of 3)",
    });
    expect(tile("rating")).toMatchObject({
      value: 2 / 3,
      prev: 0,
      foot: "of report openers rated at least one chapter (2 of 3 · 3 votes)",
    });
    expect(tile("invite")).toMatchObject({
      value: 2 / 3,
      prev: 1,
      foot: "of report openers invited a friend to the test (2 of 3 · prev. 1)",
    });
    const one = factsFixture({ subs: [sub({ id: 1, shared: true, votes: 1 })] });
    const q = page({ facts: one, benchmark: one });
    expect(q.tiles.find((t) => t.key === "rating")).toMatchObject({
      prev: null,
      foot: "of report openers rated at least one chapter (1 of 1 · 1 vote)",
    });
    // No earlier period: nothing compared, and no grey note either.
    for (const t of q.tiles) expect(t.note).toBeUndefined();
    // The Initial plan is on sale (19.10); the fixture's reader bought none.
    expect(q.tiles.find((t) => t.key === "pre")).toMatchObject({
      label: "Pre unlock rate",
      value: 0,
    });
  });

  // The Initial plan (EUR 1.99, the initial report since 19.10): a reader whose first paid
  // plan is `initial` is a pre-unlock, and an upgrade after it is a full unlock too.
  it("counts the initial report's buyers as pre-unlocks", () => {
    const cur = factsFixture({
      subs: [
        sub({ id: 1, ...day("2026-10-02"), paidAt: "2026-10-02T10:10:00Z", plan: "initial" }),
        sub({
          id: 2,
          ...day("2026-10-03"),
          paidAt: "2026-10-03T10:10:00Z",
          plan: "initial",
          full: true,
        }),
        sub({ id: 3, ...day("2026-10-03") }),
        sub({ id: 4, ...day("2026-10-04") }),
      ],
    });
    const tiles = page({ facts: cur, benchmark: cur }).tiles;
    expect(tiles.find((t) => t.key === "pre")).toMatchObject({
      value: 2 / 4,
      foot: "Initial plan purchases ÷ report openers",
    });
    expect(tiles.find((t) => t.key === "full")?.value).toBe(1 / 4);
  });

  it("gives the headline rates two figures and the wizard's none, as the design writes them", () => {
    // "34%", "14%", "2.1%", "0.21%"; 9.96% rounds to "10%", not "10.0%"; none at all is "0%".
    expect([0.34, 0.14, 0.0996, 0.021, 0.00996, 0.0021, 0, null].map(twoFigures)).toEqual([
      0,
      0,
      0,
      1,
      1,
      2,
      0,
      undefined,
    ]);
    const f = factsFixture({
      subs: [
        sub({ id: 1, returnedAt: "2026-10-03T10:00:00Z", visits: 2, wizardSlide: 5 }),
        sub({ id: 2 }),
        sub({ id: 3, votes: 1 }),
      ],
    });
    const p = page({ facts: f, benchmark: f });
    const digits = (k: string) => p.tiles.find((t) => t.key === k)!.digits;
    expect(digits("returned")).toBe(0);
    expect(digits("rating")).toBe(0);
    // A count and a time keep their own writing.
    expect(digits("opened")).toBeUndefined();
    expect(digits("read")).toBeUndefined();
    expect(p.wizard.tiles.map((t) => t.digits)).toEqual([0, 0, 0, 0]);
  });

  it("Full unlock rate counts the full plans only; Completed needs the report opened", () => {
    const paid = "2026-10-02T10:00:00Z";
    const f = factsFixture({
      subs: [
        sub({ id: 1, paidAt: paid, plan: "full_report", full: true, wizardSlide: 5 }),
        sub({
          id: 2,
          paidAt: paid,
          plan: "all_reports",
          full: true,
          wizardSlide: 5,
          openedAt: null,
        }),
        sub({ id: 3, paidAt: paid, plan: "essentials" }),
        sub({ id: 4 }),
        // Essentials first, Full later: the first plan says Essentials, the purchase was Full.
        sub({ id: 5, paidAt: paid, plan: "essentials", full: true }),
      ],
    });
    const p = page({ facts: f, benchmark: f });
    // Of the four who opened their report, two bought Full (the Full All buyer never opened it).
    expect(p.tiles.find((t) => t.key === "full")).toMatchObject({
      value: 2 / 4,
      foot: "Full, Full All and Core purchases ÷ report openers",
    });
    // Both reached slide 6; only the one who then opened the report continued through it.
    expect(p.wizard.tiles.find((t) => t.key === "completed")).toMatchObject({
      value: 1 / 5,
      foot: "continued through slide 6",
    });
  });

  it("reading time by gender and age: every group, 55+ as one band, Not stated included", () => {
    const f = factsFixture({
      subs: [
        sub({ id: 1, readMs: 100_000, closed: 1, age: "55–64", gender: "Woman" }),
        sub({ id: 2, readMs: 300_000, closed: 1, age: "65+" }),
        sub({ id: 3, readMs: 200_000, closed: 1 }),
      ],
    });
    const t = page({ facts: f, benchmark: f }).time;
    expect(t.byAge.map((r) => [r.label, r.ms])).toEqual([
      ["18–24", null],
      ["25–34", null],
      ["35–44", null],
      ["45–54", null],
      ["55+", 200_000],
      ["Not stated", 200_000],
    ]);
    expect(t.byGender.map((r) => [r.label, r.ms])).toEqual([
      ["Women", 100_000],
      ["Men", null],
      ["Non-binary", null],
      ["Other", null],
      ["Prefer not to say", null],
      ["Not stated", 250_000],
    ]);
    // The medians beside the means, for the design's Median / Average switch.
    expect(t.byAge.find((r) => r.label === "55+")).toMatchObject({
      medianMs: 200_000,
      benchMedianMs: 200_000,
    });
  });

  it("Skipped intro says when PostHog failed, and that it ignores a filter", () => {
    const failed = page({ returns: { ok: false, error: "PostHog could not be read just now." } });
    expect(failed.wizard.tiles.find((t) => t.key === "skipped")).toMatchObject({
      value: null,
      blocked: "PostHog could not be read just now.",
    });
    const narrowed = page({ returns: posthog(), filters: { ...filters, device: "phone" } });
    expect(narrowed.wizard.tiles.find((t) => t.key === "skipped")).toMatchObject({
      unit: "count",
      foot: "sessions PostHog saw press Skip Intro · all traffic",
    });
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

  it("Skipped intro: a share of the intro's starters once the whole range has our records, PostHog's count before", () => {
    const skipFacts = factsFixture({
      subs: [
        sub({ id: 1, wizardSlide: 1 }),
        sub({ id: 2, wizardSlide: 3, src: "ig", med: null, ads: false }),
        sub({ id: 3, wizardSlide: 5 }),
        sub({ id: 4, wizardSlide: 5 }),
      ],
    });
    const skips = [
      { slide: 1, n: 1, sids: [1] },
      { slide: 3, n: 2, sids: [2, 3] },
    ];
    const tile = (from: string | null, over: Partial<Parameters<typeof buildReportPage>[0]> = {}) =>
      page({
        facts: skipFacts,
        benchmark: skipFacts,
        extras: { ...extras, wizard_skips: skips, wizard_skips_from: from },
        returns: posthog(),
        ...over,
      }).wizard.tiles.find((t) => t.key === "skipped")!;
    // 3 of the 4 who started the intro; most on the fourth slide (index 3).
    const own = tile("2026-10-01");
    expect(own).toMatchObject({
      unit: "pct",
      value: 0.75,
      prev: null,
      goodWhen: "down",
      foot: "most skips on slide 4",
    });
    // Its line, from our own records: everyone started on 1 Oct.
    expect(own.spark[0]).toBe(0.75);
    // Ours follow the filters and need no PostHog. Google Ads leaves 1, 3 and 4, of whom 1 and 3
    // pressed it, once on each slide: a tie goes to the earlier slide.
    expect(
      tile("2026-10-01", {
        filters: { ...filters, source: "google_ads" },
        returns: { ok: false, error: "PostHog could not be read just now." },
      })
    ).toMatchObject({ value: 2 / 3, foot: "most skips on slide 2", blocked: null });
    // Compared with an earlier period recorded all through, by that period's own presses.
    const before = factsFixture({
      from: "2026-09-24",
      to: "2026-09-30",
      visits: [],
      starts: [],
      money: [],
      subs: [sub({ id: 11, ...day("2026-09-24") }), sub({ id: 12, ...day("2026-09-25") })],
    });
    const previousExtras = { wizard_skips: [{ slide: 0, n: 1, sids: [11] }] };
    expect(tile("2026-09-20", { previous: before, previousExtras })).toMatchObject({
      value: 0.75,
      prev: 0.5,
    });
    // Not when the earlier period starts before the first press, or its presses are missing.
    expect(tile("2026-09-25", { previous: before, previousExtras }).prev).toBeNull();
    expect(tile("2026-09-20", { previous: before }).prev).toBeNull();
    expect(
      tile("2026-10-01", { extras: { ...extras, wizard_skips_from: "2026-10-01" } })
    ).toMatchObject({
      value: 0,
      foot: "nobody pressed Skip Intro",
    });
    // A range from before the first press: PostHog's count, and it says so.
    expect(tile("2026-10-04")).toMatchObject({
      unit: "count",
      value: 7,
      prev: null,
      spark: [],
      trend: "",
      foot: "sessions PostHog saw press Skip Intro · our own share from 4 Oct 2026",
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

  it("the boxes under Time and Returns compare with the period before, cut at the same age", () => {
    const at = (iso: string) => Date.parse(iso) / 1000;
    const cur = factsFixture({
      subs: [sub({ id: 1, ...day("2026-10-02"), readMs: 200_000, closed: 1, visits: 1 })],
    });
    // A week earlier, read on 13 Oct as it stood on 6 Oct: their visit on the 8th is left out.
    const before = factsFixture({
      from: "2026-09-24",
      to: "2026-09-30",
      visits: [],
      starts: [],
      money: [],
      subs: [
        sub({
          id: 11,
          ...day("2026-09-24"),
          returnedAt: "2026-09-27T10:00:00Z",
          visits: 3,
          readMs: 1_000_000,
          closed: 3,
          sessions: [
            [at("2026-09-24T10:05:00Z"), 300_000, 1, 1],
            [at("2026-09-27T10:00:00Z"), 100_000, 1, 1],
            [at("2026-10-08T10:00:00Z"), 600_000, 1, 1],
          ],
        }),
      ],
    });
    const p = page({ facts: cur, benchmark: cur, previous: before });
    const box = (list: typeof p.time.boxes, k: string) => list.find((b) => b.key === k)!;
    expect(box(p.time.boxes, "avg")).toMatchObject({ value: 200_000, prev: 400_000 });
    expect(box(p.time.boxes, "median")).toMatchObject({ value: 200_000, prev: 400_000 });
    expect(box(p.time.boxes, "session")).toMatchObject({ value: 200_000, prev: 200_000 });
    expect(box(p.time.boxes, "readers")).toMatchObject({ value: 1, prev: 1 });
    expect(box(p.returns.boxes, "back")).toMatchObject({ value: 0, prev: 1, digits: 0 });
    expect(box(p.returns.boxes, "days")).toMatchObject({ value: null, prev: 3, goodWhen: "down" });
    expect(box(p.returns.boxes, "visits")).toMatchObject({ value: 1, prev: 2 });
    for (const b of [...p.time.boxes, ...p.returns.boxes]) expect(b.note).toBeUndefined();
    // No PostHog read of the period before: email's share is not compared.
    expect(box(p.returns.boxes, "email")).toMatchObject({ prev: null });

    // A period before 18 Sep: reading and returns say so; readers still compare.
    const q = page({ facts: cur, benchmark: cur, previous: early });
    expect(box(q.time.boxes, "avg")).toMatchObject({
      prev: null,
      note: "No comparison before 18\u00a0Sep",
    });
    expect(box(q.returns.boxes, "back")).toMatchObject({
      note: "No comparison before 18\u00a0Sep",
    });
    expect(box(q.time.boxes, "readers")).toMatchObject({ prev: 1 });
    expect(box(q.time.boxes, "readers").note).toBeUndefined();
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

  it("what brought readers back: PostHog's four ways in a fixed order, by the design's names", () => {
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
        { source: "Email campaign", sessions: 3, share: 0.75 },
        { source: "Share link from a friend", sessions: 0, share: 0 },
        { source: "Other", sessions: 0, share: 0 },
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
    // A retired stage that sent and sold nothing: every figure blank, not 0.
    expect(c[1]).toMatchObject({
      status: "Retired",
      sent: null,
      opened: null,
      clicked: null,
      returned: null,
      returnRate: null,
      purchased: null,
    });
    // The live one in a range it sent nothing in: real zeros.
    expect(campaigns([])[0]).toMatchObject({ sent: 0, returned: 0, purchased: 0 });
    // A retired stage that still sold in the range keeps its figures.
    expect(
      campaigns([
        {
          stage: "54h_no_unlock",
          sent: 0,
          opened: null,
          clicked: null,
          returned: 0,
          bought: 1,
          revenue: 3,
        },
      ])[1]
    ).toMatchObject({ sent: 0, returned: 0, purchased: 1 });
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

  it("opens and clicks count from the day each was kept, out of the emails delivered since", () => {
    // 40 sent in the range, 16 of them reported delivered (tracking began part way), 12 of
    // those after open tracking was switched on.
    const row = {
      stage: "72h_no_unlock",
      sent: 40,
      delivered: 16,
      delivered_opens: 12,
      opened: 6,
      clicked: 4,
      returned: 10,
      bought: 2,
      revenue: 7,
    };
    const returns = (events: string | null, opens: string | null) =>
      page({
        extras: { ...extras, emails: [row], email_events_from: events, email_opens_from: opens },
      }).returns;

    // Recording began after the range's first day: the range still counts, out of what was seen.
    const both = returns("2026-10-03", "2026-10-04");
    expect(both.campaigns[0]).toMatchObject({
      sent: 40,
      opened: 6,
      openRate: 0.5,
      clicked: 4,
      clickRate: 0.25,
    });
    // A retired stage sent nothing: no figures, and no share of nothing.
    expect(both.campaigns[1]).toMatchObject({ opened: null, openRate: null, clicked: null });
    expect(both.emailEvents).toBe(
      "Clicks are of the emails delivered since 3 Oct 2026, and opens of those delivered since 4 Oct 2026, when open tracking began."
    );
    expect(returns("2026-10-03", "2026-10-03").emailEvents).toBe(
      "Opens and clicks are of the emails delivered since 3 Oct 2026, when recording began."
    );

    // Opens are switched on later than the rest: until one is kept, opens stay blank.
    const clicksOnly = returns("2026-10-03", null);
    expect(clicksOnly.campaigns[0]).toMatchObject({ opened: null, openRate: null, clicked: 4 });
    expect(clicksOnly.emailEvents).toBe(
      "Clicks are of the emails delivered since 3 Oct 2026, when recording began; opens are not recorded yet."
    );

    const none = returns(null, null);
    expect(none.campaigns[0]).toMatchObject({ opened: null, clicked: null });
    expect(none.emailEvents).toBe("Opens and clicks are not recorded yet.");

    // A range (1 to 7 Oct) that ends before recording began: those emails carried no tracking,
    // so blank, not 0, and the note says since when they are counted.
    const before = returns("2026-10-14", "2026-10-14");
    expect(before.campaigns[0]).toMatchObject({
      sent: 40,
      opened: null,
      openRate: null,
      clicked: null,
      clickRate: null,
    });
    expect(before.emailEvents).toBe(
      "Opens and clicks are of the emails delivered since 14 Oct 2026, when recording began."
    );
    // Clicks counted from within the range, opens only from after it.
    expect(returns("2026-10-07", "2026-10-08").campaigns[0]).toMatchObject({
      opened: null,
      openRate: null,
      clicked: 4,
      clickRate: 0.25,
    });
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
          delivered: 8,
          delivered_opens: 8,
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
    expect(screen.getByText("Left the wizard / bounced")).toBeInTheDocument();
    // The engagement column is gone from the table, as redrawn (the CSV keeps the map's figure).
    expect(screen.queryByText(/stepped through the deep dives$/)).toBeNull();
    expect(rowNames("Intro wizard slides")[0]).toContain("A note before you explore");
    // Back: slide 2 lost 1 of its 3 readers, slide 3 both of its 2.
    fireEvent.click(screen.getByRole("button", { name: "Sort by Back" }));
    expect(rowNames("Intro wizard slides").slice(0, 2)).toEqual([
      expect.stringContaining("Unlocking your report is fully risk free"),
      expect.stringContaining("Report parts & chapters"),
    ]);
    const campaigns = within(screen.getByRole("table", { name: "Email campaigns" }));
    expect(campaigns.getByText("25.0%")).toBeInTheDocument();
    // Opened and Clicked: the count, its share of the delivered emails under it.
    expect(campaigns.getByText("50.0%")).toBeInTheDocument();
    expect(campaigns.getByText("12.5%")).toBeInTheDocument();
    expect(
      screen.getByText(
        /Clicks are of the emails delivered since 20 Sep 2026, and opens of those delivered since 25 Sep 2026/
      )
    ).toBeInTheDocument();
    expect(screen.getByText(/Opens are inflated by Apple Mail/)).toBeInTheDocument();
    // The design's names; a retired campaign with nothing in the range reads "—" throughout.
    expect(rowNames("Email campaigns")).toEqual([
      expect.stringContaining("72h no unlock"),
      expect.stringContaining("54h no unlock"),
      expect.stringContaining("30h no unlock"),
    ]);
    const retired = campaigns.getAllByRole("row")[2]!;
    expect(
      within(retired)
        .getAllByRole("cell")
        .slice(1)
        .map((c) => c.textContent)
    ).toEqual(["—", "—", "—", "—", "—", "—"]);
    // Both sort, blanks last whichever way: the retired campaigns' "—" stay under the live one.
    const live = expect.stringContaining("72h no unlock");
    const byOpened = campaigns.getByRole("button", { name: "Sort by Opened" });
    fireEvent.click(byOpened);
    expect(rowNames("Email campaigns")[0]).toEqual(live);
    fireEvent.click(byOpened);
    expect(byOpened.parentElement).toHaveAttribute("aria-sort", "ascending");
    expect(rowNames("Email campaigns")[0]).toEqual(live);
    fireEvent.click(campaigns.getByRole("button", { name: "Sort by Clicked" }));
    expect(rowNames("Email campaigns")[0]).toEqual(live);
  });

  it("draws the tiles' changes as percentages, searches the feedback, and the design's highlights", () => {
    const f = factsFixture({
      subs: [sub({ id: 1, shared: true, votes: 1, invited: true }), sub({ id: 2 })],
    });
    const stat = (section: string, over: Partial<ReportExtras["chapter_stats"][number]>) => ({
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
      facts: f,
      benchmark: f,
      previous: factsFixture({
        from: "2026-09-24",
        to: "2026-09-30",
        visits: [],
        starts: [],
        money: [],
        // One reader then, who invited and did not share.
        subs: [
          sub({ id: 11, ...day("2026-09-24"), invited: true, invitedAt: "2026-09-24T11:00:00Z" }),
        ],
      }),
      extras: {
        ...extras,
        chapter_stats: [
          stat("core_archetype", { reached: 10, show_all: 2 }),
          stat("typical_beliefs", { reached: 30, show_all: 1, pw_seen: 10, pw_click: 1 }),
        ],
        chapter_readers: 30,
        chapter_stats_from: "2026-10-01",
        // The log holds only the latest votes; the totals count every one in the range.
        chapters: [{ section: "core_archetype", up: 250, down: 50 }],
        votes_total: 300,
        feedback: [
          {
            at: "2026-10-07T21:15:00Z",
            submission: 1,
            section: "core_archetype",
            vote: "up",
            issue: null,
            commented: false,
          },
          {
            at: "2026-10-06T21:15:00Z",
            submission: 2,
            section: "core_archetype",
            vote: "down",
            issue: null,
            commented: false,
          },
        ],
      },
    });
    render(createElement(ApReport));
    // The change against the period before, as a percentage: a rate from none is New, in green;
    // one that fell, red. With no comparable earlier figure, a grey dash.
    const change = (label: string) =>
      screen
        .getAllByText(label)
        .find((e) => e.nextElementSibling?.className.includes("font-serif"))!.nextElementSibling!
        .nextElementSibling!;
    expect(change("Share rate").textContent).toBe("New");
    expect(change("Share rate")).toHaveClass("text-ap-good");
    expect(change("Invite rate").textContent).toBe("−50.0%");
    expect(change("Invite rate")).toHaveClass("text-ap-bad");
    // On sale since 19.10: a figure like the others (none sold, in either period).
    expect(change("Pre unlock rate").textContent).toBe("±0%");

    const fb = within(document.getElementById("feedback")!);
    expect(fb.queryByRole("group", { name: "Filter feedback" })).toBeNull();
    expect(fb.queryByText(/All comments in the explorer/)).toBeNull();
    expect(
      fb.getByText(/^The log holds the latest 2 of the range’s 300 votes\.$/)
    ).toBeInTheDocument();
    expect(fb.getByText(/good · 250 good \/ 50 bad · 300 votes/)).toBeInTheDocument();
    // The design's search: by vote, chapter, issue, date or submission.
    const search = fb.getByRole("searchbox", { name: "Search feedback" });
    fireEvent.change(search, { target: { value: "bad" } });
    expect(fb.getByText("Feedback log · 1 of 1")).toBeInTheDocument();
    fireEvent.change(search, { target: { value: "#1" } });
    expect(fb.getByText("Feedback log · 1 of 1")).toBeInTheDocument();
    fireEvent.change(search, { target: { value: "7 Oct 2026" } });
    expect(fb.getByText("Feedback log · 1 of 1")).toBeInTheDocument();
    fireEvent.change(search, { target: { value: "nothing like it" } });
    expect(fb.getByText("No votes match the filters.")).toBeInTheDocument();
    fireEvent.change(search, { target: { value: "" } });
    expect(fb.getByText("Feedback log · 2 of 2")).toBeInTheDocument();

    const chapters = within(screen.getByRole("table", { name: "Chapters" }));
    // Show more whole, as drawn (2 of 10, 1 of 30); the paywall to a tenth.
    expect(chapters.getByText("20%").className).toContain("font-bold text-ap-good-ink");
    expect(chapters.getByText("3%").className).toContain("text-ap-bad-ink");
    expect(chapters.getByText("10.0%").className).toContain("font-bold text-ap-good-ink");
  });

  it("the wizard's whole percentages: a share too small for 1% reads <1%, not 0%", () => {
    const many = factsFixture({
      subs: Array.from({ length: 300 }, (_, i) => sub({ id: i + 1, wizardSlide: 1 })),
    });
    screenData.payload = page({
      facts: many,
      benchmark: many,
      extras: {
        ...extras,
        wizard: [{ slide: 1, went_on: 0, went_back: 1, median_ms: null, timed: 0 }],
      },
    });
    render(createElement(ApReport));
    const table = within(screen.getByRole("table", { name: "Intro wizard slides" }));
    // Slide 2: one of its 300 readers went back; none went on.
    const cells = within(table.getAllByRole("row")[2]!).getAllByRole("cell");
    expect(cells[5]!.textContent).toBe("<1%");
    expect(cells[3]!.textContent).toBe("0%");
  });

  it("reading time: the design's legend, every group's row, and the median or the average", () => {
    const f = factsFixture({
      subs: [
        sub({ id: 1, readMs: 100_000, closed: 1, age: "65+" }),
        sub({ id: 2, readMs: 400_000, closed: 1, age: "65+" }),
        sub({ id: 3, readMs: 130_000, closed: 1, age: "65+" }),
      ],
    });
    screenData.payload = page({ facts: f, benchmark: f });
    render(createElement(ApReport));
    expect(screen.getByText("This report")).toBeInTheDocument();
    expect(screen.getByText("Benchmark · all reports")).toBeInTheDocument();
    // The median first, as drawn; the same as all reports: no difference, grey.
    const age = () => within(screen.getByText(/total time by age$/).parentElement!);
    expect(screen.getByText("Median total time by age")).toBeInTheDocument();
    const same = age().getByText("55+").parentElement!;
    // The all-reports figure the tick draws is read to a screen reader in the row's name.
    expect(same.textContent).toBe("55+, all reports 2:102:10±0:00.0");
    expect(same.lastElementChild).toHaveClass("text-ap-muted");
    expect(age().getByText("18–24").parentElement!.textContent).toBe("18–24——");
    expect(age().getByText("Not stated")).toBeInTheDocument();
    const group = within(screen.getByRole("group", { name: "Statistic" }));
    expect(group.getByRole("button", { name: "Median" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(group.getByRole("button", { name: "Average" }));
    expect(group.getByRole("button", { name: "Average" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Avg. total time by age")).toBeInTheDocument();
    // (1:40 + 6:40 + 2:10) / 3 = 3:30.
    expect(age().getByText("55+").parentElement!.textContent).toBe(
      "55+, all reports 3:303:30±0:00.0"
    );
    // The boxes: no period before, so a grey dash where the change would stand.
    const box = screen.getByText("Avg. total time").parentElement!;
    expect(box.textContent).toBe("Avg. total time3:30—");
  });

  it("how far into the report readers got: by the deepest chapter, split by reading time", () => {
    // The live report's chapters, in its order; a reader is placed by the latest they reached.
    const order = payload.chapters.filter((c) => c.part !== "Earlier report versions");
    const n = order.length;
    const at = (place: number) => order[place - 1]!.id;
    const f = factsFixture({
      subs: [
        sub({ id: 1, readMs: 30_000, closed: 1 }),
        sub({ id: 2, readMs: 200_000, closed: 1 }),
        sub({ id: 3, readMs: 700_000, closed: 2 }),
        // Their reading time was not recorded: a group of its own, never "< 1 min".
        sub({ id: 4, readMs: 0, closed: 0 }),
        // Filtered out (an Instagram reader under the Google Ads filter): not counted.
        sub({ id: 5, readMs: 700_000, closed: 1, src: "ig", ads: false }),
      ],
    });
    const p = page({
      facts: f,
      benchmark: f,
      filters: { ...filters, source: "google_ads" },
      extras: {
        ...extras,
        chapter_stats_from: "2026-10-01",
        chapter_depth: [
          { sid: 1, chapters: [at(1)] },
          // About 15% of the way in: the 10–24 band whatever the report's length.
          { sid: 2, chapters: [at(Math.ceil(n * 0.15)), at(1)] },
          { sid: 3, chapters: [at(1), at(n)] },
          { sid: 4, chapters: [at(n)] },
          { sid: 5, chapters: [at(n)] },
          // An earlier version's chapter only: no place in today's report, not counted.
          { sid: 6, chapters: ["summary"] },
        ],
      },
    });
    const d = p.time.depth;
    expect(d).toMatchObject({ readers: 4, chapters: n, from: "2026-10-01" });
    expect(d.groups).toEqual(["< 1 min", "1–5 min", "5–10 min", "10 min+", "Time not recorded"]);
    const band = (label: string) => d.bands.find((b) => b.label === label)!.counts;
    // Chapter 1 of n is under 10% of the report, the last is all of it.
    expect(band("0–9%")).toEqual([1, 0, 0, 0, 0]);
    expect(band("95–100")).toEqual([0, 0, 0, 1, 1]);
    expect(d.bands.reduce((a, b) => a + b.counts.reduce((x, y) => x + y, 0), 0)).toBe(4);
    expect(band("10–24")).toEqual([0, 1, 0, 0, 0]);

    screenData.payload = p;
    render(createElement(ApReport));
    expect(screen.getByText("How far into the report readers got")).toBeInTheDocument();
    expect(screen.getByText("Time not recorded")).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: /^Readers by how far they got: 0–9% \d, / })
    ).toBeInTheDocument();

    // Hovering a column reads its groups: the last band's two readers, one per group.
    if (!("PointerEvent" in window)) {
      class PE extends MouseEvent {
        pointerType: string;
        constructor(type: string, init: PointerEventInit = {}) {
          super(type, init);
          this.pointerType = init.pointerType ?? "mouse";
        }
      }
      vi.stubGlobal("PointerEvent", PE);
    }
    const box = screen.getByRole("group", { name: /^How far into the report readers got\./ });
    vi.spyOn(box, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      right: 600,
      bottom: 260,
      width: 600,
      height: 260,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);
    fireEvent.pointerMove(box, { clientX: 560, clientY: 100, pointerType: "mouse" });
    const card = document.querySelector("[data-ap-tip]")!;
    expect(card).toHaveTextContent("95–100% of the report");
    expect(card).toHaveTextContent("10 min+1 · 50.0%");
    expect(card).toHaveTextContent("Time not recorded1 · 50.0%");
    expect(card).toHaveTextContent("< 1 min0 · 0.0%");
    // Top first, as the column stacks them.
    const text = card!.textContent!;
    expect(text.indexOf("Time not recorded")).toBeLessThan(text.indexOf("< 1 min"));
    expect(card).toHaveTextContent("Readers2");
    vi.unstubAllGlobals();
  });

  it("how far readers got: says so before any reading per chapter was recorded", () => {
    screenData.payload = page();
    render(createElement(ApReport));
    expect(screen.getByText("Reading per chapter is not recorded yet")).toBeInTheDocument();
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
    ]);
    fireEvent.click(table.getByRole("button", { name: "Sort by Skip intro" }));
    expect(rowNames("Intro wizard slides")[0]).toContain("Report parts & chapters");
    // Whole percentages, as drawn; a skip of 11% or more in the design's red.
    const skip = within(table.getAllByRole("row")[1]!).getAllByRole("cell")[4]!;
    expect(skip.textContent).toBe("33%");
    expect(skip.className).toContain("font-bold text-ap-bad");
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
    // Learn more and Exercise whole, as drawn: 1 and 2 of the chapter's 3 readers.
    const beliefs = table.getByText("Typical Beliefs").closest<HTMLElement>("[role=row]")!;
    expect(
      within(beliefs)
        .getAllByRole("cell")
        .slice(-2)
        .map((c) => c.textContent)
    ).toEqual(["33%", "67%"]);
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

  it("keeps the section nav and the chapter sort in one row that scrolls, the current pill bold", () => {
    screenData.payload = payload;
    render(createElement(ApReport));
    const nav = screen.getByRole("navigation", { name: "Report sections" });
    expect(nav).toHaveClass("w-max");
    expect(nav).not.toHaveClass("flex-wrap");
    expect(nav.parentElement).toHaveClass("overflow-x-auto", "max-w-full");
    // The design's 700 for the section in view, 600 for the rest.
    expect(within(nav).getByRole("link", { name: "Wizard" })).toHaveClass("font-bold");
    expect(within(nav).getByRole("link", { name: "Chapters" })).toHaveClass("font-semibold");
    expect(within(nav).getByRole("link", { name: "Chapters" })).not.toHaveClass("font-bold");
    const pills = screen.getByRole("group", { name: "Sort chapters by" });
    expect(pills.parentElement).toHaveClass("w-max");
    expect(pills.parentElement!.parentElement).toHaveClass("overflow-x-auto");
  });

  it("writes the tiles' and the returns' percentages as the design does", () => {
    // 200 readers: 68 came back, 4 rated, 1 shared; 68 went through the intro and opened it.
    const many = factsFixture({
      subs: Array.from({ length: 200 }, (_, i) =>
        sub({
          id: i + 1,
          ...day("2026-10-02"),
          returnedAt: i < 68 ? "2026-10-03T10:00:00Z" : null,
          visits: i < 68 ? 2 : 1,
          votes: i < 4 ? 1 : 0,
          shared: i === 0,
          wizardSlide: i < 68 ? 5 : 1,
        })
      ),
    });
    screenData.payload = page({
      facts: many,
      benchmark: many,
      returns: posthog({
        sources: [
          { source: "Email link", sessions: 3 },
          { source: "Bookmark or direct", sessions: 1 },
        ],
      }),
    });
    render(createElement(ApReport));
    /** A tile's or a box's value, by its label. */
    const value = (label: string) =>
      screen
        .getAllByText(label)
        .map((e) => e.nextElementSibling)
        .find((v) => v?.className.includes("font-serif"))!.textContent;
    // Headline rates to two figures: "34%", "2.0%", "0.50%".
    expect(value("Returned")).toBe("34%");
    expect(value("Rating rate")).toBe("2.0%");
    expect(value("Share rate")).toBe("0.50%");
    // The wizard's whole: 68 of 200 continued through slide 6.
    expect(value("Completed")).toBe("34%");
    // The returns whole.
    expect(value("Came back")).toBe("34%");
    expect(value("Returned via email")).toBe("75%");
    const band = screen.getByText("1 day").parentElement!;
    expect([...band.children].slice(2).map((c) => c.textContent)).toEqual(["34%", "34%"]);
    // What brought readers back: each bar against the largest, email's 75% full width.
    const bar = (source: string) =>
      parseFloat(
        (screen.getByText(source).nextElementSibling!.firstElementChild as HTMLElement).style.width
      );
    expect(bar("Email campaign")).toBe(100);
    expect(bar("Bookmark or direct")).toBeCloseTo(33.33);
  });

  it("gives the feedback log's comment the room left, and names each chapter alone", () => {
    screenData.payload = payload;
    render(createElement(ApReport));
    const log = screen.getByRole("table", { name: "Feedback log" });
    expect(within(log).getAllByRole("row")[0]!.style.gridTemplateColumns).toBe(
      "170px 100px minmax(220px,2fr) 90px 140px minmax(160px,1.6fr)"
    );
    expect(log.style.minWidth).toBe("880px");
    // The name alone, as redrawn on 16 Oct: no part or id under it.
    const head = within(screen.getByRole("table", { name: "Chapters" })).getAllByRole(
      "rowheader"
    )[0]!;
    expect(head.textContent).toBe(payload.chapters[0]!.name);
    expect(head).toHaveClass("min-w-0");
  });
});

describe("the guided tour", () => {
  const TOUR_TODAY = "2026-10-27";
  const tourNow = new Date("2026-10-27T10:00:00Z");
  const week = parseFilters({ period: "custom", from: "2026-10-20", to: "2026-10-26" }, TOUR_TODAY);
  const on = (d: string) => ({ day: d, at: `${d}T10:00:00Z`, openedAt: `${d}T10:05:00Z` });
  /** The week's five finishers: four opened their report. */
  const tourFacts = factsFixture({
    from: "2026-10-20",
    to: "2026-10-26",
    visits: [],
    starts: [],
    money: [],
    subs: [
      sub({ id: 1, ...on("2026-10-20") }),
      sub({ id: 2, ...on("2026-10-21") }),
      sub({ id: 3, ...on("2026-10-22") }),
      sub({ id: 4, ...on("2026-10-26") }),
      sub({ id: 5, ...on("2026-10-26"), openedAt: null }),
    ],
  });
  type Day = ReportTour["days"][number];
  type Stop = ReportTour["stops"][number];
  const runDay = (day: string, audience: Day["audience"], over: Partial<Day>): Day => ({
    day,
    audience,
    readers: 1,
    runs: 1,
    completed: 0,
    skipped: 0,
    left: 0,
    unended: 0,
    ...over,
  });
  const at = (audience: Stop["audience"], id: Stop["id"], over: Partial<Stop>): Stop => ({
    audience,
    id,
    reached: 0,
    next: 0,
    back: 0,
    skip: 0,
    exit: 0,
    median_ms: null,
    timed: 0,
    ...over,
  });
  /**
   * Free readers: one finished, one skipped on Show all (after going back from it once), one
   * left the page on the chapter arrow, and one run (a second browser) with no end stored. A
   * paid reader finished their four stops.
   */
  const tourData: ReportTour = {
    days: [
      runDay("2026-10-20", "free", { completed: 1 }),
      runDay("2026-10-21", "free", { skipped: 1 }),
      runDay("2026-10-22", "free", { runs: 2, left: 1, unended: 1 }),
      runDay("2026-10-26", "paid", { completed: 1 }),
    ],
    stops: [
      at("free", "chapter_menu", { reached: 3, next: 3, median_ms: 5_200, timed: 3 }),
      at("free", "show_all", { reached: 3, next: 2, skip: 1, back: 1, median_ms: 4_100, timed: 3 }),
      at("free", "chapter_toggle", { reached: 2, next: 1, exit: 1, median_ms: 3_000, timed: 2 }),
      at("free", "try_this", { reached: 1, next: 1, median_ms: 6_000, timed: 1 }),
      at("free", "unlock", { reached: 1, next: 1, median_ms: 7_000, timed: 1 }),
      at("paid", "chapter_menu", { reached: 1, next: 1, median_ms: 2_000, timed: 1 }),
      at("paid", "show_all", { reached: 1, next: 1, median_ms: 2_000, timed: 1 }),
      at("paid", "chapter_toggle", { reached: 1, next: 1, median_ms: 2_000, timed: 1 }),
      at("paid", "try_this", { reached: 1, next: 1, median_ms: 2_000, timed: 1 }),
    ],
    placed: [
      { audience: "free", runs: 3 },
      { audience: "paid", runs: 1 },
    ],
  };
  const tourPage = (over: Partial<Parameters<typeof buildReportPage>[0]> = {}) =>
    page({
      facts: tourFacts,
      benchmark: tourFacts,
      filters: week,
      today: TOUR_TODAY,
      now: tourNow,
      tour: tourData,
      ...over,
    });
  const audience = (p: ReturnType<typeof page>, key: "free" | "paid") =>
    p.tour.audiences.find((a) => a.key === key)!;
  const tileOf = (p: ReturnType<typeof page>, key: "free" | "paid", k: string) =>
    audience(p, key).tiles.find((t) => t.key === k)!;

  it("whole shares add up to 100, and a share that is not nothing never reads 0%", () => {
    expect(wholeShares([0, 0, 0])).toBeNull();
    expect(wholeShares([1, 1, 1])).toEqual([0.34, 0.33, 0.33]);
    expect(wholeShares([2, 1, 0])).toEqual([0.67, 0.33, 0]);
    // One skip in 400: 1%, taken from going on, not 0%.
    expect(wholeShares([399, 1, 0])).toEqual([0.99, 0.01, 0]);
    expect(wholeShares([998, 1, 1])).toEqual([0.98, 0.01, 0.01]);
    for (let a = 0; a <= 25; a += 1)
      for (let b = 0; b <= 25; b += 1)
        for (let c = 0; c <= 25; c += 1) {
          const shares = wholeShares([a, b, c]);
          if (a + b + c === 0) continue;
          const points = shares!.map((x) => Math.round(x * 100));
          expect(
            points.reduce((x, y) => x + y, 0),
            `${a}/${b}/${c}`
          ).toBe(100);
          [a, b, c].forEach((n, i) => expect(points[i]! > 0, `${a}/${b}/${c}`).toBe(n > 0));
        }
  });

  it("free readers' five stops and paid readers' four, in the tour's own words", () => {
    const p = tourPage();
    expect(p.tour.audiences.map((a) => a.label)).toEqual([
      "Free readers · 5 stops",
      "Paid readers · 4 stops",
    ]);
    expect(audience(p, "free").stops.map((s) => [s.n, s.name])).toEqual([
      [1, "Easily Navigate Your Report"],
      [2, "Read the Full Text"],
      [3, "Show or Hide Chapters"],
      [4, "Put Your Insights Into Practice"],
      [5, "Discover the Full Report"],
    ]);
    expect(audience(p, "free").stops[0]).toMatchObject({
      purpose: "You can read the report in order, or jump to any chapter from the menu above.",
      target: "Chapter menu: the pill at the top, the sidebar from 1280px",
    });
    const paid = audience(p, "paid").stops;
    expect(paid.map((s) => s.id)).toEqual([
      "chapter_menu",
      "show_all",
      "chapter_toggle",
      "try_this",
    ]);
    // The paid tab's last stop is Try This: its Next is the Finish.
    expect(paid[3]).toMatchObject({ reached: 1, reachedShare: 1, next: 1, skip: 0, exit: 0 });
    expect(p.tour).toMatchObject({ from: "20 Oct 2026", before: false, openers: 4 });
  });

  it("per stop: reached of the runs placed, Next + Skip + Exit making 100%, Back on its own", () => {
    const free = audience(tourPage(), "free");
    expect(free).toMatchObject({ placed: 3, unended: 1 });
    expect(
      free.stops.map((s) => [s.id, s.reachedShare, s.next, s.skip, s.exit, s.back, s.medianMs])
    ).toEqual([
      // The first stop has no Back.
      ["chapter_menu", 1, 1, 0, 0, null, 5_200],
      ["show_all", 1, 0.67, 0.33, 0, 1 / 3, 4_100],
      ["chapter_toggle", 2 / 3, 0.5, 0, 0.5, 0, 3_000],
      ["try_this", 1 / 3, 1, 0, 0, 0, 6_000],
      ["unlock", 1 / 3, 1, 0, 0, 0, 7_000],
    ]);
    // Three ways out of a stop, a third each: still 100 in whole percentages.
    const thirds = tourPage({
      tour: {
        ...tourData,
        stops: [at("free", "chapter_menu", { reached: 3, next: 1, skip: 1, exit: 1 })],
      },
    });
    const first = audience(thirds, "free").stops[0]!;
    expect([first.next, first.skip, first.exit]).toEqual([0.34, 0.33, 0.33]);
  });

  it("tiles: readers who got it of those who opened, and how the runs ended", () => {
    const p = tourPage();
    expect(audience(p, "free").tiles.map((t) => t.label)).toEqual([
      "Tour started",
      "Completed",
      "Skipped tour",
      "Left the tour / bounced",
    ]);
    expect(tileOf(p, "free", "tour-started")).toMatchObject({
      unit: "count",
      value: 3,
      share: "75% of the 4 readers who opened their report",
      blocked: null,
    });
    // Four runs: one completed, one skipped, one left the page, one with no end at all.
    expect(tileOf(p, "free", "tour-completed")).toMatchObject({ value: 0.25, goodWhen: "up" });
    expect(tileOf(p, "free", "tour-skipped")).toMatchObject({ value: 0.25, goodWhen: "down" });
    expect(tileOf(p, "free", "tour-left")).toMatchObject({ value: 0.5, goodWhen: "down" });
    expect(tileOf(p, "paid", "tour-started")).toMatchObject({
      value: 1,
      share: "25% of the 4 readers who opened their report",
    });
    expect(tileOf(p, "paid", "tour-completed").value).toBe(1);
    // A line per day of the week, each day's own runs.
    expect(tileOf(p, "free", "tour-started").spark).toEqual([1, 1, 1, 0, 0, 0, 0]);
    expect(tileOf(p, "free", "tour-completed").spark).toEqual([1, 0, 0, null, null, null, null]);
  });

  it("an empty week reads zero readers and blank shares, not a failure", () => {
    const p = tourPage({ tour: { days: [], stops: [], placed: [] } });
    expect(tileOf(p, "free", "tour-started")).toMatchObject({ value: 0, blocked: null });
    expect(tileOf(p, "free", "tour-started").share).toBe(
      "0% of the 4 readers who opened their report"
    );
    expect(tileOf(p, "free", "tour-completed").value).toBeNull();
    for (const s of audience(p, "free").stops) {
      expect([s.reached, s.reachedShare, s.next, s.skip, s.exit, s.medianMs]).toEqual([
        0,
        null,
        null,
        null,
        null,
        null,
      ]);
    }
  });

  it("before it was recorded, or unread, the tour is blank and says why", () => {
    // The fixture's week of 1 to 7 Oct: before 20 Oct, whatever the function says.
    const early = page({ tour: tourData });
    expect(early.tour.before).toBe(true);
    for (const a of early.tour.audiences) {
      for (const t of a.tiles) {
        expect(t.blocked).toBe("Recorded from 20 Oct 2026: pick a range from that day on.");
        expect(t.share).toBeUndefined();
      }
      for (const s of a.stops)
        expect([s.reachedShare, s.next, s.medianMs]).toEqual([null, null, null]);
    }
    const unread = tourPage({ tour: null });
    expect(unread.tour.before).toBe(false);
    expect(tileOf(unread, "free", "tour-started").blocked).toBe(
      "The guided tour could not be read just now. Try again in a minute."
    );
  });

  it("compares with a period recorded all through, and says so for one that is not", () => {
    // The week before 20 Oct: not recorded, so not compared.
    const before = factsFixture({
      from: "2026-10-13",
      to: "2026-10-19",
      visits: [],
      starts: [],
      money: [],
      subs: [sub({ id: 9, ...on("2026-10-14") })],
    });
    const p = tourPage({ previous: before, previousTour: tourData });
    for (const t of audience(p, "free").tiles) {
      expect(t).toMatchObject({ prev: null, note: "No comparison before 20 Oct 2026" });
    }
    // The week after, against this one.
    const next = factsFixture({
      from: "2026-10-27",
      to: "2026-11-02",
      visits: [],
      starts: [],
      money: [],
      subs: [sub({ id: 21, ...on("2026-10-27") }), sub({ id: 22, ...on("2026-10-28") })],
    });
    const q = page({
      facts: next,
      benchmark: next,
      previous: tourFacts,
      filters: parseFilters(
        { period: "custom", from: "2026-10-27", to: "2026-11-02" },
        "2026-11-03"
      ),
      today: "2026-11-03",
      now: new Date("2026-11-03T10:00:00Z"),
      tour: { days: [runDay("2026-10-27", "free", { completed: 1 })], stops: [], placed: [] },
      previousTour: tourData,
    });
    expect(tileOf(q, "free", "tour-started")).toMatchObject({ value: 1, prev: 3 });
    expect(tileOf(q, "free", "tour-completed")).toMatchObject({ value: 1, prev: 0.25 });
    expect(tileOf(q, "free", "tour-left")).toMatchObject({ value: 0, prev: 0.5 });
    expect(tileOf(q, "free", "tour-left").note).toBeUndefined();
  });

  it("reads the function's numbers, and leaves out a row for no known audience", async () => {
    mockSupabaseFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        days: [
          {
            day: "2026-10-20",
            audience: "free",
            readers: "2",
            runs: "3",
            completed: 1,
            skipped: 1,
            left: 0,
            unended: 1,
          },
          { day: "2026-10-20", audience: "staff", readers: 9, runs: 9 },
        ],
        stops: [
          {
            audience: "free",
            id: "show_all",
            reached: "3",
            next: 2,
            back: 1,
            skip: 1,
            exit: 0,
            median_ms: 4100.0,
            timed: 3,
          },
        ],
        placed: [{ audience: "paid", runs: "1" }],
      }),
    });
    const t = await fetchReportTour("2026-10-20", "2026-10-26");
    expect(mockSupabaseFetch).toHaveBeenCalledWith(
      "/rest/v1/rpc/ap_report_tour",
      expect.objectContaining({
        body: JSON.stringify({ p_from: "2026-10-20", p_to: "2026-10-26" }),
      })
    );
    expect(t.days).toEqual([
      runDay("2026-10-20", "free", { readers: 2, runs: 3, completed: 1, skipped: 1, unended: 1 }),
    ]);
    expect(t.stops[0]).toMatchObject({ reached: 3, median_ms: 4_100 });
    expect(t.placed).toEqual([{ audience: "paid", runs: 1 }]);
    mockSupabaseFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ days: [] }),
    });
    await expect(fetchReportTour("2026-10-20", "2026-10-26")).rejects.toThrow(/unexpected shape/);
  });

  describe("on screen", () => {
    afterEach(() => cleanup());

    it("sits after the wizard in the section nav, with the share under Tour started", () => {
      screenData.payload = tourPage();
      render(createElement(ApReport));
      const nav = within(screen.getByRole("navigation", { name: "Report sections" }));
      expect(nav.getAllByRole("link").map((l) => l.textContent)).toEqual([
        "Wizard",
        "Guided tour",
        "Time & returns",
        "Chapters",
        "Feedback",
      ]);
      const section = within(document.getElementById("tour")!);
      expect(section.getByRole("heading", { name: "Guided tour" })).toBeInTheDocument();
      expect(section.getByText("75% of the 4 readers who opened their report")).toBeInTheDocument();
      expect(document.getElementById("wizard")!.nextElementSibling).toBe(
        document.getElementById("tour")
      );
    });

    it("draws the stops: Spotlight, Back from the second, Finish on the last, the design's reds", () => {
      screenData.payload = tourPage();
      render(createElement(ApReport));
      const table = within(screen.getByRole("table", { name: "Guided tour stops" }));
      const rows = table.getAllByRole("row").slice(1);
      expect(rows).toHaveLength(5);
      const cells = (r: HTMLElement) =>
        within(r)
          .getAllByRole("cell")
          .map((c) => c.textContent);
      // # · Time · Reached · Next · Back · Skip tour · Exit
      expect(cells(rows[0]!)).toEqual(["1", "0:05.2", "100%", "100%", "—", "—", "0%"]);
      expect(cells(rows[1]!)).toEqual(["2", "0:04.1", "100%", "67%", "33%", "33%", "0%"]);
      expect(cells(rows[4]!)).toEqual(["5", "0:07.0", "33%", "Finish 100%", "0%", "—", "0%"]);
      expect(within(rows[0]!).getByText(/^Spotlight: Chapter menu/)).toBeInTheDocument();
      // Skip tour from 8%, Exit from 4%: bold red.
      expect(within(rows[1]!).getAllByRole("cell")[5]).toHaveClass("font-bold", "text-ap-bad");
      expect(within(rows[2]!).getAllByRole("cell")[6]).toHaveClass("font-bold", "text-ap-bad");
      expect(within(rows[0]!).getAllByRole("cell")[6]).not.toHaveClass("text-ap-bad");
      expect(
        screen.getByText(/also holds the 1 run whose end was never recorded/)
      ).toBeInTheDocument();
    });

    it("switches to paid readers' four stops", () => {
      screenData.payload = tourPage();
      render(createElement(ApReport));
      fireEvent.click(screen.getByRole("button", { name: "Paid readers · 4 stops" }));
      expect(screen.getByRole("button", { name: "Paid readers · 4 stops" })).toHaveAttribute(
        "aria-pressed",
        "true"
      );
      const rows = within(screen.getByRole("table", { name: "Guided tour stops" }))
        .getAllByRole("rowheader")
        .map((h) => h.querySelector(".font-bold")?.textContent);
      expect(rows).toEqual([
        "Easily Navigate Your Report",
        "Read the Full Text",
        "Show or Hide Chapters",
        "Put Your Insights Into Practice",
      ]);
    });

    it("before it was recorded, says from when", () => {
      screenData.payload = page();
      render(createElement(ApReport));
      const section = within(document.getElementById("tour")!);
      expect(
        section.getByText("Recorded from 20 Oct 2026: pick a range from that day on")
      ).toBeInTheDocument();
    });
  });
});
