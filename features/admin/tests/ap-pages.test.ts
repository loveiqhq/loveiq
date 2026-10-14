import { describe, expect, it } from "vitest";

import { buildDashboard } from "@features/admin/server/ap/assessment";
import { parseFilters } from "@features/admin/server/ap/filters";
import { ALL, comparableStarts, totals } from "@features/admin/server/ap/metrics";
import { buildOverview } from "@features/admin/server/ap/overview";
import { buildReportPage, type ReportExtras } from "@features/admin/server/ap/report-page";
import { buildSurveyQuestions } from "@features/admin/server/ap/survey";
import { buildSurveyPage, demoCard } from "@features/admin/server/ap/survey-page";
import type { DropoffRun } from "@features/admin/server/dropoff-report";

import { factsFixture, sub } from "./ap-fixtures";

const TODAY = "2026-10-13";
const now = new Date("2026-10-13T10:00:00Z");
const filters = parseFilters({ period: "custom", from: "2026-10-01", to: "2026-10-07" }, TODAY);
const facts = factsFixture();
/** The week before: early enough that its unfinished starts are only partly kept. */
const previous = factsFixture({
  from: "2026-09-10",
  to: "2026-09-16",
  visits: [{ day: "2026-09-11", arm: "white", src: null, n: 150 }],
  starts: [
    {
      day: "2026-09-11",
      known: true,
      src: "google",
      med: "cpc",
      ads: true,
      arm: "white",
      device: null,
      finished: true,
      n: 8,
    },
  ],
  subs: [
    sub({
      id: 21,
      day: "2026-09-11",
      at: "2026-09-11T10:00:00Z",
      openedAt: "2026-09-11T10:05:00Z",
    }),
  ],
  money: [],
});
/** The week before the range, from 18 Sep on: comparable, with finishers of its own. */
const lastWeek = factsFixture({
  from: "2026-09-24",
  to: "2026-09-30",
  visits: [],
  starts: [],
  money: [],
  subs: [
    sub({
      id: 11,
      day: "2026-09-24",
      at: "2026-09-24T10:00:00Z",
      openedAt: "2026-09-24T10:05:00Z",
      returnedAt: "2026-09-25T09:00:00Z",
      visits: 2,
    }),
    // Came back on 12 Oct: later than this week's readers have had, so not counted.
    sub({
      id: 12,
      day: "2026-09-25",
      at: "2026-09-25T10:00:00Z",
      openedAt: "2026-09-25T10:05:00Z",
      returnedAt: "2026-10-12T09:00:00Z",
      visits: 2,
    }),
  ],
});
const extras: ReportExtras = {
  wizard: [],
  map_steppers: null,
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
const ad = {
  byDay: new Map([
    ["2026-10-02", 40],
    ["2026-10-03", 60],
  ]),
  from: "2026-04-24",
  to: TODAY,
};

/** Every number in a payload is finite: no NaN or Infinity reaches the page. */
function nonFinite(o: unknown, path = ""): string[] {
  if (typeof o === "number") return Number.isFinite(o) ? [] : [path];
  if (o && typeof o === "object")
    return Object.entries(o).flatMap(([k, v]) => nonFinite(v, `${path}.${k}`));
  return [];
}

describe("buildSurveyQuestions", () => {
  it("marks a question first reached after the range's first day as new in the range", () => {
    const run = (sessionId: string, startedAt: string, reached: string[]): DropoffRun => ({
      sessionId,
      startedAt: Date.parse(startedAt),
      reached,
      leftAt: null,
      source: "other",
      device: null,
    });
    const q = buildSurveyQuestions(
      [
        // 23:30 UTC on 30 Sep is already 1 Oct in Berlin: the range's first day.
        run("a", "2026-09-30T23:30:00Z", ["16015"]),
        run("b", "2026-10-03T09:00:00Z", ["16015", "16016"]),
        run("c", "2026-10-04T09:00:00Z", ["16016"]),
      ],
      { steps: [], exits: [] },
      "2026-10-01",
      "2026-10-07",
      "All traffic",
      null
    );
    const row = (id: string) => q.rows.find((r) => r.id === id)!;
    expect(row("16016")).toMatchObject({ reached: 2, newInRange: true });
    expect(row("16015")).toMatchObject({ reached: 2, newInRange: false });
    // Reached by no one: nothing says it is new.
    expect(row("16017")).toMatchObject({ reached: 0, newInRange: false });

    // Our own finished test runs are left out of reach, exits and the people count.
    const mine = buildSurveyQuestions(
      [
        run("a", "2026-10-02T09:00:00Z", ["16015"]),
        { ...run("staff", "2026-10-02T09:00:00Z", ["16015"]), leftAt: "16015" },
      ],
      { steps: [], exits: [], staff: ["staff"] },
      "2026-10-01",
      "2026-10-07",
      "All traffic",
      null
    );
    expect(mine.people).toBe(1);
    expect(mine.rows.find((r) => r.id === "16015")).toMatchObject({ reached: 1, exits: 0 });
  });
});

describe("comparableStarts", () => {
  it("blanks the previous period's starts unless both periods hold every start", () => {
    const prev = totals(previous, ALL);
    expect(comparableStarts(prev, "2026-10-01", "2026-09-10", TODAY)?.starts).toBeNull();
    expect(comparableStarts(prev, "2026-09-13", "2026-08-14", TODAY)?.starts).toBeNull();
    expect(comparableStarts(prev, "2026-10-01", "2026-09-24", TODAY)?.starts).toBe(prev.starts);
    expect(comparableStarts(null, "2026-10-01", null, TODAY)).toBeNull();
  });
});

describe("page builders", () => {
  it("overview: the fixture's totals, and no comparison across the starts gap", () => {
    const p = buildOverview({ facts, previous, ad, filters, today: TODAY, now });
    const tile = (key: string) => p.tiles.find((t) => t.key === key)!;
    expect(tile("visits").value).toBe(220);
    expect(tile("starts")).toMatchObject({ value: 14, prev: null });
    expect(tile("starts").foot).toContain("previous period not comparable");
    expect(tile("revenue").value).toBe(6.99);
    expect(nonFinite(p)).toEqual([]);
  });

  it("dashboard: ten tiles, cost per paying customer from the ad spend", () => {
    const p = buildDashboard({
      facts,
      previous,
      ad,
      filters,
      today: TODAY,
      now,
      newReturning: null,
    });
    expect(p.tiles).toHaveLength(10);
    expect(p.tiles.find((t) => t.key === "cac")?.value).toBe(100);
    expect(nonFinite(p)).toEqual([]);
  });

  it("dashboard: a filter that cannot split visits blanks them rather than ignoring itself", () => {
    const p = buildDashboard({
      facts,
      previous,
      ad,
      filters: { ...filters, device: "phone" },
      today: TODAY,
      now,
      newReturning: null,
    });
    expect(p.tiles.find((t) => t.key === "visits")?.blocked).toMatch(/device/);
  });

  it("survey and report pages build with nothing from PostHog or the extra queries", () => {
    const s = buildSurveyPage({
      facts,
      previous,
      benchmark: facts,
      benchmarkKind: "all",
      filters,
      today: TODAY,
      now,
      questions: null,
      questionsError: "down",
      introClicks: null,
    });
    expect(nonFinite(s)).toEqual([]);
    const r = buildReportPage({
      facts,
      previous,
      benchmark: facts,
      extras,
      returns: null,
      filters,
      today: TODAY,
      now,
    });
    expect(nonFinite(r)).toEqual([]);
    expect(r.tiles.length).toBeGreaterThan(0);
  });

  const surveyPage = (over: { facts?: typeof facts; previous?: typeof facts | null }) =>
    buildSurveyPage({
      facts: over.facts ?? facts,
      previous: over.previous === undefined ? previous : over.previous,
      benchmark: facts,
      benchmarkKind: "all",
      filters,
      today: TODAY,
      now,
      questions: null,
      questionsError: null,
      introClicks: null,
    });

  it("survey: starts and completion say why an earlier period is not compared", () => {
    const foot = (p: ReturnType<typeof surveyPage>, key: string) =>
      p.tiles.find((t) => t.key === key)!.foot;
    // 10 to 16 Sep: before every start was recorded, so no comparison.
    const gap = surveyPage({ previous });
    expect(foot(gap, "starts")).toBe("no comparison: earlier starts incomplete");
    expect(foot(gap, "completion")).toBe("no comparison: earlier starts incomplete");
    expect(foot(gap, "subs")).toBe("vs 1");
    // 24 to 30 Sep holds every start: compared as usual.
    const week = surveyPage({ previous: lastWeek });
    expect(foot(week, "starts")).toBe("vs 0");
    expect(foot(week, "completion")).toBe("of the starts, finished (so far)");
    // No comparison at all is not a gap.
    expect(foot(surveyPage({ previous: null }), "starts")).toBe(
      "answered at least the first question"
    );
  });

  it("survey: each slide's median time over the whole range, and the slide most skipped", () => {
    const intro = (day: string, step: string, ms: number[], skipped = 0) => ({
      day,
      step,
      n: ms.length + skipped,
      ms,
      skipped,
    });
    const p = surveyPage({
      facts: factsFixture({
        intro: [
          intro("2026-10-01", "intro_slide_1", [4000, 9000], 1),
          intro("2026-10-02", "intro_slide_1", [5000]),
          intro("2026-10-01", "intro_slide_2", [], 1),
          intro("2026-10-02", "intro_slide_2", [8000], 2),
          intro("2026-10-01", "intro_slide_4", [30_000, 50_000]),
          intro("2026-10-01", "survey_engine_mount", []),
        ],
      }),
    });
    // One day's median would be 6.5 s; over the range it is 5 s. The intro and the consent
    // record themselves only from SURVEY_TRACKING_FROM, after this range.
    expect(p.intro.cards.map((s) => s.medianMs)).toEqual([null, 5000, 8000, null, 40_000, null]);
    expect(p.intro.cards.map((s) => s.reached)).toEqual([null, 4, 4, 0, 2, null]);
    expect(p.intro.mostSkipped).toBe(2);
    expect(p.intro.recordedFrom).toBe("15 Oct 2026");
    // Skip, Back and Exit say when they start rather than read zero.
    expect(p.intro.cards.every((c) => c.skip === null && c.back === null && c.exit === null)).toBe(
      true
    );
    expect(surveyPage({}).intro.mostSkipped).toBeNull();
  });

  it("survey: from the tracking day, every card's continue, skip, back and exit", () => {
    const row = (step: string, n: number, wentOn: number | null = 0, left: number | null = 0) => ({
      day: "2026-10-15",
      step,
      n,
      ms: [],
      skipped: 0,
      wentOn,
      left,
    });
    const page = (intro: Array<ReturnType<typeof row>>) =>
      buildSurveyPage({
        facts: factsFixture({ from: "2026-10-15", to: "2026-10-16", intro }),
        previous: null,
        benchmark: facts,
        benchmarkKind: "all",
        filters: parseFilters(
          { period: "custom", from: "2026-10-15", to: "2026-10-16" },
          "2026-10-17"
        ),
        today: "2026-10-17",
        now: new Date("2026-10-17T10:00:00Z"),
        questions: null,
        questionsError: null,
        introClicks: null,
      });
    const p = page([
      row("intro_view", 10, 8, 2),
      row("intro_slide_1", 8, 6, 1),
      row("intro_skip_1", 1),
      row("intro_slide_2", 6, 5, 0),
      row("intro_back_2", 1),
      row("intro_slide_3", 5, 5, 0),
      row("intro_slide_4", 5, 4, 1),
      row("consent_view", 5, 3, 2),
      row("consent_back", 1),
      row("survey_engine_mount", 3, 0, 3),
    ]);
    const card = (step: string) => p.intro.cards.find((c) => c.step === step)!;
    expect(p.intro.recordedFrom).toBeNull();
    expect(card("intro_view")).toMatchObject({
      reached: 10,
      reachedShare: 1,
      cont: 0.8,
      skip: null,
      back: null,
      exit: 0.2,
    });
    expect(card("intro_slide_1")).toMatchObject({ reachedShare: 0.8, cont: 0.75, skip: 0.125 });
    expect(card("intro_slide_2")).toMatchObject({ back: 1 / 6, skip: 0 });
    expect(card("consent_view")).toMatchObject({ cont: 0.6, back: 0.2, exit: 0.4, skip: null });
    // A reader without the new figures leaves them unknown, never 0%.
    expect(page([row("intro_view", 4, null, null)]).intro.cards[0]).toMatchObject({
      reached: 4,
      cont: null,
      exit: null,
    });
  });

  it("survey: the device card shows Mobile, Desktop and Tablet, and when tablets start", () => {
    const device = (f: typeof facts, benchmark = f) =>
      buildSurveyPage({
        facts: f,
        previous: null,
        benchmark,
        benchmarkKind: "same",
        filters,
        today: TODAY,
        now,
        questions: null,
        questionsError: null,
        introClicks: null,
      }).demographics.cards.find((c) => c.title === "Device")!;
    // Before the tracking day: no tablet figure, the row says when it starts.
    const before = device(facts);
    expect(before.rows.map((r) => r.label)).toEqual(["Mobile", "Desktop", "Tablet"]);
    expect(before.rows[0]).toMatchObject({ share: 1, bench: 1 });
    expect(before.rows[2]).toMatchObject({ bench: null, pending: "Recorded from 15 Oct 2026" });
    // The iPhone and Android split of Mobile stays in the note.
    expect(before.note).toContain("here 100% iPhone, 0% Android");
    const after = factsFixture({
      from: "2026-10-15",
      to: "2026-10-16",
      subs: [
        sub({ id: 1, day: "2026-10-15", device: "Tablet" }),
        sub({ id: 2, day: "2026-10-15", device: "Android" }),
        sub({ id: 3, day: "2026-10-15", device: "Desktop" }),
        sub({ id: 4, day: "2026-10-15", device: null }),
      ],
    });
    const now15 = device(after, facts);
    expect(now15.rows.map((r) => [r.label, r.share, r.bench])).toEqual([
      ["Mobile", 0.25, 1],
      ["Desktop", 0.25, 0],
      // The benchmark starts before tablets were recorded: no tablet figure to compare with.
      ["Tablet", 0.25, null],
      ["Unknown", 0.25, 0],
    ]);
    expect(now15.rows[2]?.pending).toBeUndefined();
  });

  it("report: compares returns at the same age, and not with a period before 18 Sep", () => {
    const page = (prev: typeof facts) =>
      buildReportPage({
        facts,
        previous: prev,
        benchmark: facts,
        extras,
        returns: null,
        filters,
        today: TODAY,
        now,
      }).tiles.find((t) => t.key === "returned")!;
    expect(page(lastWeek)).toMatchObject({ value: 0, prev: 0.5 });
    // The same readers two weeks earlier, before visit ends were recorded for everyone.
    const early = page({
      ...lastWeek,
      from: "2026-09-10",
      to: "2026-09-16",
      subs: lastWeek.subs.map((x) => ({
        ...x,
        day: "2026-09-11",
        at: "2026-09-11T10:00:00Z",
        openedAt: "2026-09-11T10:05:00Z",
        returnedAt: "2026-09-12T09:00:00Z",
      })),
    });
    expect(early.prev).toBeNull();
    expect(early.foot).toBe("opened again later · not compared: before 18 Sep");
  });

  it("report: the wizard's reach follows the filters", () => {
    const withSlides = factsFixture({
      subs: [
        sub({ id: 1, wizardSlide: 5 }),
        sub({ id: 2, src: "ig", med: null, ads: false, wizardSlide: 2 }),
      ],
    });
    const reach = (source: "all" | "google_ads") =>
      buildReportPage({
        facts: withSlides,
        previous: null,
        benchmark: withSlides,
        extras: { ...extras, wizard: [{ slide: 0, went_back: 0, median_ms: null, timed: 0 }] },
        returns: null,
        filters: { ...filters, source },
        today: TODAY,
        now,
      }).wizard.slides.map((x) => x.reached);
    expect(reach("all")).toEqual([2, 2, 2, 1, 1, 1]);
    expect(reach("google_ads")).toEqual([1, 1, 1, 1, 1, 1]);
  });

  it("overview: compares spend only when both periods have every day of it", () => {
    const full = {
      byDay: new Map([
        ["2026-09-25", 30],
        ["2026-10-02", 40],
      ]),
      from: "2026-04-24",
      to: "2026-10-12",
    };
    const spendTile = (a: typeof full) =>
      buildOverview({ facts, previous: lastWeek, ad: a, filters, today: TODAY, now }).tiles.find(
        (t) => t.key === "spend"
      )!;
    expect(spendTile(full)).toMatchObject({ value: 40, prev: 30 });
    const partial = spendTile({ ...full, to: "2026-10-05" });
    expect(partial.prev).toBeNull();
    expect(partial.foot).toContain("spend recorded");
  });

  it("dashboard: the cost tile's line is spend per submission, and says so", () => {
    const p = buildDashboard({
      facts,
      previous: null,
      ad,
      filters,
      today: TODAY,
      now,
      newReturning: null,
    });
    const cac = p.tiles.find((t) => t.key === "cac")!;
    // A sale is too rare to draw: 1 Oct, no spend for one finisher; 2 Oct, €40 for one.
    expect(cac.spark.slice(0, 2)).toEqual([0, 40]);
    expect(cac.trend).toContain("line: € per submission");
  });

  it("dashboard: partial spend is flagged and never compared", () => {
    const withSpend = {
      byDay: new Map([
        ["2026-09-25", 30],
        ["2026-10-02", 40],
      ]),
      from: "2026-04-24",
      to: "2026-10-05",
    };
    const p = buildDashboard({
      facts,
      previous: lastWeek,
      ad: withSpend,
      filters,
      today: TODAY,
      now,
      newReturning: null,
    });
    const cac = p.tiles.find((t) => t.key === "cac")!;
    expect(cac.prev).toBeNull();
    expect(cac.foot).toMatch(/^spend €40 \(spend recorded/);
    const row = (label: string) => p.scorecard.find((r) => r.label === label)!;
    expect(row("CAC").note).toContain("spend recorded");
    expect(row("ROAS").note).toContain("spend recorded");
  });

  it("overview: no 'Unknown source' row where starts cannot be split by source", () => {
    const f90 = parseFilters({ period: "90d" }, TODAY);
    const long = factsFixture({ from: f90.from, to: f90.to });
    const p = buildOverview({ facts: long, previous: null, ad, filters: f90, today: TODAY, now });
    expect(p.traffic.bySource.rows.map((r) => r.label)).not.toContain("Unknown source");
    expect(p.traffic.bySource.note).toContain("older starts can't be split by source");
    // Within the drafts' 30 days the starts no draft names stay visible as Unknown.
    const recent = buildOverview({ facts, previous: null, ad, filters, today: TODAY, now });
    expect(recent.traffic.bySource.rows.map((r) => r.label)).toContain("Unknown source");
  });

  it("overview: counts the invites sent in the range, as the design's Report card does", () => {
    const withInvites = factsFixture({
      invites: [
        { day: "2026-09-30", n: 9 },
        { day: "2026-10-02", n: 2 },
        { day: "2026-10-05", n: 1 },
      ],
    });
    const card = (filtersX: typeof filters) =>
      buildOverview({
        facts: withInvites,
        previous: null,
        ad,
        filters: filtersX,
        today: TODAY,
        now,
      }).engagement.report.find((x) => x.label === "Invites sent")!;
    expect(card(filters)).toMatchObject({ value: 3 });
    expect(card({ ...filters, source: "google_ads" }).note).toBe("all traffic");
  });

  it("dashboard: prices change in euros, and a lone sale draws a flat line that says when", () => {
    const p = buildDashboard({
      facts,
      previous: null,
      ad,
      filters,
      today: TODAY,
      now,
      newReturning: null,
    });
    const aov = p.tiles.find((t) => t.key === "aov")!;
    expect(aov.deltaAs).toBe("abs");
    expect(p.tiles.find((t) => t.key === "cac")?.deltaAs).toBe("abs");
    expect(p.tiles.find((t) => t.key === "revenue")?.deltaAs).toBeUndefined();
    // The fixture's one sale is on 2 Oct: every point carries it, and the caption names the day.
    expect(new Set(aov.spark)).toEqual(new Set([6.99]));
    expect(aov.trend).toMatch(/only 2 Oct had a sale$/);
    expect(p.questions).toBeGreaterThan(40);
  });

  it("survey: an empty benchmark draws no tick and no difference, not a false 100% Other", () => {
    const card = demoCard("Country", ["DE", "DE", "US", "FR", "IT", "ES", "PL", "NL"], [], "");
    expect(card.rows.every((r) => r.bench === null)).toBe(true);
    expect(card.rows.at(-1)?.label).toBe("Other");
  });

  it("every page notes that tier, and device before 12 Oct, cover readers only", () => {
    const notes = (f: typeof filters) =>
      buildOverview({ facts, previous: null, ad, filters: f, today: TODAY, now }).notes.join(" ");
    expect(notes({ ...filters, tier: "tier_1" })).toContain("country tier is known only");
    expect(notes({ ...filters, device: "phone" })).toContain("Before 12 Oct 2026 the device");
    const fromOct12 = parseFilters(
      { period: "custom", from: "2026-10-12", to: "2026-10-12", device: "phone" },
      TODAY
    );
    expect(notes(fromOct12)).not.toContain("the device is known only");
    expect(notes(filters)).not.toContain("known only for people");
    // Tablets: told apart only from the tracking day.
    expect(notes({ ...filters, device: "tablet" })).toContain(
      "Tablets are told apart from 15 Oct 2026"
    );
    expect(notes(filters)).not.toContain("Tablets are told apart");
  });
});
