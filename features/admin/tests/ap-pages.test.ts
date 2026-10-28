import { describe, expect, it } from "vitest";

import { buildDashboard, revenueByGroup } from "@features/admin/server/ap/assessment";
import { parseFilters } from "@features/admin/server/ap/filters";
import { ALL, comparableStarts, totals } from "@features/admin/server/ap/metrics";
import { SOURCE_ROWS } from "@features/admin/server/ap/common";
import { buildFocus } from "@features/admin/server/ap/focus";
import type { SessionTags } from "@features/admin/server/ap/posthog";
import { buildReportPage, type ReportExtras } from "@features/admin/server/ap/report-page";
import { buildSurveyQuestions } from "@features/admin/server/ap/survey";
import { buildSurveyPage, demoCard } from "@features/admin/server/ap/survey-page";
import type { DropoffRun } from "@features/admin/server/dropoff-report";
import { askedQuestions } from "@features/admin/server/dropoff-weekly";
import { C13_OPENING } from "@features/survey/ui/questionOrder";

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
  const run = (sessionId: string, startedAt: string, reached: string[]): DropoffRun => ({
    sessionId,
    startedAt: Date.parse(startedAt),
    reached,
    leftAt: null,
    source: "other",
    device: null,
  });
  /** Every question today, in today's order: what a run through to the end reaches. */
  const EVERY = askedQuestions(400).map((q) => q.qId);
  const without = (id: string) => EVERY.filter((x) => x !== id);
  // 16016 first asked at noon on 2 Oct: after "a" began, before "b".
  const FIRST_ASKED = { "16016": "2026-10-02T12:00:00Z" };
  const questions = (runs: DropoffRun[], firstAsked: Record<string, string> = FIRST_ASKED) =>
    buildSurveyQuestions(
      runs,
      { steps: [], exits: [], first_asked: firstAsked },
      "2026-10-01",
      "2026-10-07",
      "All traffic",
      null
    );

  it("counts each run at every question up to the furthest it reached: none has more than the one before", () => {
    const q = questions([
      // 21:00 UTC on 30 Sep is 23:00 in Berlin: begun before the range and carried on in it, an
      // earlier period's start, so in none of it.
      run("before", "2026-09-30T21:00:00Z", ["16014", "16019", "16020"]),
      // Question 4's step lost while the tab was in the background; question 2 answered on the
      // landing page's card. It got to question 5.
      run("lost", "2026-10-02T09:00:00Z", [EVERY[0]!, EVERY[2]!, EVERY[4]!]),
      // Begun in the range with its first two steps lost: it passed questions 1 and 2.
      run("late", "2026-10-02T09:30:00Z", EVERY.slice(2, 4)),
      // To the end before 16016 was asked; the next runs had it.
      run("a", "2026-10-02T10:00:00Z", without("16016")),
      run("b", "2026-10-03T09:00:00Z", EVERY),
      run("c", "2026-10-04T09:00:00Z", EVERY),
    ]);
    const asked = q.rows.filter((r) => r.n > 0);
    for (let i = 1; i < asked.length; i++)
      expect(asked[i]!.reached).toBeLessThanOrEqual(asked[i - 1]!.reached);
    expect(q.people).toBe(5);
    const row = (id: string) => q.rows.find((r) => r.id === id)!;
    // "late" got past questions 1 and 2 though no step of it is recorded there.
    expect(row(EVERY[0]!)).toMatchObject({ reached: 5, shown: 4 });
    // Between its steps: put to it, as far as the records tell.
    expect(row(EVERY[1]!)).toMatchObject({ reached: 5, shown: 4 });
    expect(row(EVERY[3]!)).toMatchObject({ reached: 5, shown: 5 });
    expect(row(EVERY[5]!)).toMatchObject({ reached: 3, shown: 3 });
    // Passed by a, which began before it was asked, so not put to a: new in the range.
    expect(row("16016")).toMatchObject({ reached: 3, shown: 2, newInRange: true });
    expect(row("16019")).toMatchObject({ reached: 3, newInRange: false });
    expect(q.rows.filter((r) => r.newInRange).map((r) => r.id)).toEqual(["16016"]);

    // New in the range by when it was first asked, not by who reached it.
    const early = questions([run("x", "2026-10-02T09:00:00Z", EVERY.slice(0, 5))], {});
    expect(early.rows.filter((r) => r.newInRange)).toEqual([]);
    const passed = questions([run("x", "2026-10-02T09:00:00Z", without("16017"))], {
      "16017": "2026-10-03T00:00:00Z",
    });
    expect(passed.rows.find((r) => r.id === "16017")).toMatchObject({
      reached: 1,
      shown: 0,
      newInRange: true,
    });
    // A drop-out rate is over the runs the question was put to.
    const left = questions([
      run("a", "2026-10-02T09:00:00Z", without("16016")),
      {
        ...run("b", "2026-10-03T09:00:00Z", EVERY.slice(0, EVERY.indexOf("16016") + 1)),
        leftAt: "16016",
      },
    ]);
    expect(left.rows.find((r) => r.id === "16016")).toMatchObject({
      reached: 2,
      shown: 1,
      exits: 1,
      dropRate: 1,
    });
  });

  it("leaves out a run begun before the range: by its first step, or as listed (a draft picked up again)", () => {
    const q = buildSurveyQuestions(
      [
        run("draft", "2026-10-02T09:00:00Z", ["16011", "16012"]),
        run("x", "2026-10-02T09:00:00Z", EVERY.slice(0, 3)),
      ],
      { steps: [], exits: [], earlier: ["draft"] },
      "2026-10-01",
      "2026-10-07",
      "All traffic",
      null
    );
    expect(q.people).toBe(1);
    expect(q.rows.find((r) => r.id === "16011")!.reached).toBe(0);
    expect(q.rows[0]!.reached).toBe(1);

    // Our own finished test runs are left out of reach, exits and the people count.
    const to16015 = EVERY.slice(0, EVERY.indexOf("16015") + 1);
    const mine = buildSurveyQuestions(
      [
        run("a", "2026-10-02T09:00:00Z", to16015),
        { ...run("staff", "2026-10-02T09:00:00Z", to16015), leftAt: "16015" },
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

describe("buildSurveyQuestions, along each run's own way", () => {
  const run = (
    sessionId: string,
    startedAt: string,
    reached: string[],
    leftAt: string | null = null
  ): DropoffRun => ({
    sessionId,
    startedAt: Date.parse(startedAt),
    reached,
    leftAt,
    lastAt: Date.parse(startedAt) + 60_000,
    source: "other",
    device: null,
  });
  const EVERY = askedQuestions(400).map((q) => q.qId);
  const n = (q: ReturnType<typeof buildSurveyQuestions>, k: number) =>
    q.rows.find((r) => r.n === k)!;
  const build = (
    runs: DropoffRun[],
    from: string,
    to: string,
    steps: Partial<Parameters<typeof buildSurveyQuestions>[1]> = {},
    now?: number
  ) =>
    buildSurveyQuestions(
      runs,
      { steps: [], exits: [], ...steps },
      from,
      to,
      "All traffic",
      null,
      now
    );

  it("never counts a run as far as a question it was asked out of today's order (email first, until 16 Aug 2026)", () => {
    // Asked the email question first, then questions 1 and 2, and left at 2.
    const q = build(
      [run("emailFirst", "2026-08-05T10:00:00Z", ["00000", "00001", "01002"], "01002")],
      "2026-08-01",
      "2026-08-14"
    );
    expect(n(q, 1).reached).toBe(1);
    expect(n(q, 2)).toMatchObject({ reached: 1, exits: 1 });
    expect(n(q, 30).reached).toBe(0);
    expect(q.rows.find((r) => r.id === "00000")!.reached).toBe(0);
    // One that answered it first and went on to the end passed it on the way: counted there.
    const done = build(
      [run("done", "2026-08-05T10:00:00Z", ["00000", ...EVERY.filter((x) => x !== "00000")])],
      "2026-08-01",
      "2026-08-14"
    );
    expect(done.rows.find((r) => r.id === "00000")!.reached).toBe(1);
    expect(done.rows.at(-1)!.reached).toBe(1);
  });

  it("puts a run that answered only the email question, asked first, in no row, and says so", () => {
    const q = build(
      [
        run("emailOnly", "2026-08-05T10:00:00Z", ["00000"], "00000"),
        run("x", "2026-08-05T11:00:00Z", EVERY.slice(0, 3), EVERY[2]!),
      ],
      "2026-08-01",
      "2026-08-14"
    );
    expect(q.people).toBe(2);
    expect(n(q, 1).reached).toBe(1);
    expect(q.rows.find((r) => r.id === "00000")).toMatchObject({ reached: 0, exits: 0 });
    expect(q.notes.some((t) => t.startsWith("1 run answered only the email question"))).toBe(true);
  });

  it("reads a later run whose first step is the email question as recorded from part-way, not asked it first", () => {
    // From 17 Aug 2026 the email question comes near the end: a run first recorded on it (steps
    // were consent-gated until 18 Sep) got there along the order, and left there.
    const q = build(
      [
        run("lateEmail", "2026-09-22T10:00:00Z", ["00000"], "00000"),
        run("x", "2026-09-22T11:00:00Z", EVERY.slice(0, 3), EVERY[2]!),
      ],
      "2026-09-14",
      "2026-09-27"
    );
    expect(n(q, 1).reached).toBe(2);
    expect(q.rows.find((r) => r.id === "00000")).toMatchObject({ reached: 1, shown: 1, exits: 1 });
    expect(q.notes.some((t) => t.includes("answered only the email question"))).toBe(false);
  });

  it("counts a run recorded only from part-way (cookies accepted mid-survey, before 18 Sep 2026) from the start", () => {
    const q = build(
      [run("midway", "2026-08-05T10:00:00Z", EVERY.slice(10, 20), EVERY[19]!)],
      "2026-08-01",
      "2026-08-14"
    );
    expect(n(q, 1)).toMatchObject({ reached: 1, shown: 0 });
    expect(n(q, 20)).toMatchObject({ reached: 1, shown: 1, exits: 1 });
    expect(n(q, 21).reached).toBe(0);
  });

  it("lists no question first asked after the range, and marks one first asked during it", () => {
    const q = build(
      [
        run(
          "x",
          "2026-08-05T10:00:00Z",
          EVERY.filter((x) => !["16016", "16019"].includes(x))
        ),
      ],
      "2026-08-01",
      "2026-08-14",
      {
        first_asked: {
          "16016": "2026-09-18T08:00:00Z",
          "16019": "2026-08-10T08:00:00Z",
          "01002": "2026-03-01T08:00:00Z",
        },
      }
    );
    expect(q.rows.find((r) => r.id === "16016")).toBeUndefined();
    expect(q.rows.find((r) => r.id === "16019")).toMatchObject({
      newInRange: true,
      reached: 1,
      shown: 0,
    });
    // Answered on the landing page's card (no step): long asked, not new, and put to the run.
    const card = build(
      [
        run(
          "card",
          "2026-10-12T00:27:00Z",
          EVERY.filter((x) => x !== "01002")
        ),
      ],
      "2026-10-12",
      "2026-10-12",
      {
        first_asked: { "01002": "2026-03-01T08:00:00Z" },
      }
    );
    expect(card.rows.find((r) => r.id === "01002")).toMatchObject({
      newInRange: false,
      reached: 1,
      shown: 1,
    });
  });

  it("doesn't count a run still on a question today as leaving it", () => {
    const now = Date.parse("2026-10-24T15:00:00Z");
    const busy = {
      ...run("busy", "2026-10-24T14:40:00Z", EVERY.slice(0, 5), EVERY[4]!),
      lastAt: now - 5 * 60_000,
    };
    const gone = {
      ...run("gone", "2026-10-24T13:00:00Z", EVERY.slice(0, 5), EVERY[4]!),
      lastAt: now - 90 * 60_000,
    };
    const q = build([busy, gone], "2026-10-24", "2026-10-24", {}, now);
    expect(n(q, 5)).toMatchObject({ reached: 2, exits: 1 });
  });

  it("adds a question's exits per day up to its exits, in its own order", () => {
    const q = build(
      [
        run("a", "2026-10-02T10:00:00Z", EVERY.slice(0, 4), EVERY[3]!),
        run("b", "2026-10-03T10:00:00Z", EVERY.slice(0, 4), EVERY[3]!),
        run("c", "2026-10-03T11:00:00Z", EVERY.slice(0, 2), EVERY[1]!),
      ],
      "2026-10-01",
      "2026-10-07"
    );
    for (const r of q.rows) expect(r.exitsTrend.reduce((x, y) => x + y, 0)).toBe(r.exits);
    expect(n(q, 4).exits).toBe(2);
  });

  it("says the steps were consent-gated before 18 Sep 2026", () => {
    expect(build([], "2026-09-01", "2026-09-30").notes.join(" ")).toMatch(/accepted cookies/);
    expect(build([], "2026-09-18", "2026-09-30").notes).toEqual([]);
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
    // The headline tiles say so in grey where the change would stand.
    const note = (p: ReturnType<typeof surveyPage>, key: string) =>
      p.tiles.find((t) => t.key === key)!.note;
    expect(note(gap, "starts")).toBe("No comparison: earlier starts incomplete");
    expect(note(gap, "completion")).toBe("No comparison: earlier starts incomplete");
    expect(note(gap, "subs")).toBeUndefined();
    expect(foot(gap, "subs")).toBe("vs 1");
    // 24 to 30 Sep holds every start: compared as usual.
    const week = surveyPage({ previous: lastWeek });
    expect(foot(week, "starts")).toBe("vs 0");
    expect(note(week, "starts")).toBeUndefined();
    expect(foot(week, "completion")).toBe("submissions per start");
    // No comparison at all is not a gap.
    expect(foot(surveyPage({ previous: null }), "starts")).toBe(
      "answered at least the first question"
    );
  });

  it("survey: the intro tiles from PostHog, compared only with a period PostHog saw whole", () => {
    // reachedQ1: the question engine started or a question was answered, so at least answered.
    const clicks = (
      opened: number,
      skipped: number,
      agreed: number,
      answered: number,
      reachedQ1: number
    ) => ({
      ok: true as const,
      value: {
        opened,
        skipped,
        agreed,
        answered,
        reachedQ1,
        returned: 0,
        trust: 0,
        terms: 0,
        silhouette: 0,
      },
    });
    const page = (from: string, to: string, prevFrom: string | null) =>
      buildSurveyPage({
        facts: factsFixture({ from, to }),
        previous: prevFrom ? factsFixture({ from: prevFrom, to: prevFrom }) : null,
        benchmark: facts,
        benchmarkKind: "all",
        filters: parseFilters({ period: "custom", from, to }, "2026-10-13"),
        today: "2026-10-13",
        now: new Date("2026-10-13T10:00:00Z"),
        questions: null,
        questionsError: null,
        introClicks: clicks(100, 20, 60, 55, 70),
        prevIntroClicks: clicks(80, 8, 40, 40, 48),
      });
    const tiles = (p: ReturnType<typeof page>) =>
      p.intro.tiles.map((t) => [t.label, t.value, t.prev, t.blocked]);
    // Both weeks inside PostHog's days: each figure against the week before.
    expect(tiles(page("2026-09-08", "2026-09-14", "2026-09-01"))).toEqual([
      ["Saw the intro", 100, 80, null],
      ["Agreed to consent", 0.6, 0.5, null],
      ["Skipped slides", 0.2, 0.1, null],
      // Left before question 1: never reached the questions, not merely answered nothing.
      ["Left before Q1", 1 - 70 / 100, 1 - 48 / 80, null],
    ]);
    // A week before begins ahead of PostHog's first day: partial, so not compared.
    expect(page("2026-08-25", "2026-08-31", "2026-08-18").intro.tiles.map((t) => t.prev)).toEqual([
      null,
      null,
      null,
      null,
    ]);
    // A range that begins ahead of it says why it is blank.
    expect(page("2026-08-20", "2026-08-31", null).intro.tiles.map((t) => t.blocked)).toEqual(
      Array(4).fill("From PostHog, which starts on 23 Aug 2026: pick a range from that day on.")
    );
  });

  it("survey: each slide's median time over the whole range", () => {
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
    expect(p.intro.recordedFrom).toBe("17 Oct 2026");
    // The tiles draw no trend line either: the note under them names that too.
    expect(p.intro.tiles.every((t) => t.spark.length === 0)).toBe(true);
    // Skip, Back and Exit say when they start rather than read zero.
    expect(p.intro.cards.every((c) => c.skip === null && c.back === null && c.exit === null)).toBe(
      true
    );
    // Before the tracking day the boxes stay PostHog's: none read here, so they say why.
    expect(p.intro.tiles.map((t) => t.blocked)).toEqual(
      Array(4).fill("PostHog could not be read just now.")
    );
  });

  it("survey: completion names the earlier rate; demographics as drawn", () => {
    const start = (finished: boolean, n: number) => ({
      day: "2026-09-25",
      known: true,
      src: "google",
      med: "cpc",
      ads: true,
      arm: "white",
      device: null,
      finished,
      n,
    });
    const week = factsFixture({
      ...lastWeek,
      starts: [start(true, 4), start(false, 4)],
    });
    const completion = surveyPage({ previous: week }).tiles.find((t) => t.key === "completion")!;
    // The design's Completion: the earlier week's 2 submissions over its 8 starts.
    expect(completion).toMatchObject({
      prev: 0.25,
      foot: "submissions per start · vs 25.0%",
    });

    const people = factsFixture({
      subs: ["US", "US", "GB", "CA", "AU", "DE", "FR"].map((country, i) =>
        sub({ id: i + 1, country, age: ["55–64", "65+", "25–34"][i % 3] })
      ),
    });
    const d = surveyPage({ facts: people }).demographics;
    const card = (title: string) => d.cards.find((c) => c.title === title)!;
    // The design's four countries by name, then the rest as Other.
    expect(card("Country").rows.map((r) => r.label)).toEqual(["US", "GB", "CA", "AU", "Other"]);
    expect(card("Country").rows.at(-1)!.share).toBeCloseTo(2 / 7);
    // 55–64 and 65+ read as 55+ (the benchmark's finishers stated no age).
    expect(card("Age").rows.map((r) => [r.label, r.share])).toEqual([
      ["25–34", 2 / 7],
      ["55+", 5 / 7],
      ["Not stated", 0],
    ]);
    expect(d.note).toMatch(/^This range: 7 completed surveys\. Benchmark: all completed surveys/);
  });

  it("survey: from the tracking day, every card's continue, skip, back and exit", () => {
    const row = (
      step: string,
      n: number,
      wentOn: number | null = 0,
      left: number | null = 0,
      direct = 0
    ) => ({
      day: "2026-10-17",
      step,
      n,
      ms: [],
      skipped: 0,
      wentOn,
      left,
      direct,
    });
    const page = (intro: Array<ReturnType<typeof row>>) =>
      buildSurveyPage({
        facts: factsFixture({ from: "2026-10-17", to: "2026-10-18", intro }),
        previous: null,
        benchmark: facts,
        benchmarkKind: "all",
        filters: parseFilters(
          { period: "custom", from: "2026-10-17", to: "2026-10-18" },
          "2026-10-19"
        ),
        today: "2026-10-19",
        now: new Date("2026-10-19T10:00:00Z"),
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
      // One of the five came from the landing page's question card, with no intro.
      row("consent_view", 5, 3, 2, 1),
      row("consent_back", 1),
      row("survey_engine_mount", 3, 0, 3),
    ]);
    const card = (step: string) => p.intro.cards.find((c) => c.step === step)!;
    expect(p.intro.recordedFrom).toBeNull();
    expect(p.intro.tiles.every((t) => t.spark.length > 0)).toBe(true);
    // Their consent's share leaves that visitor out: 4 of the intro's 10, never over 100%.
    expect(card("consent_view")).toMatchObject({ reached: 5, reachedShare: 0.4 });
    // The four boxes from our own records: 3 agreed and went on, of the 11 who began; one
    // skip of the intro's 10; 2 + 1 + 1 + 2 left on a card, of the 11.
    expect(p.intro.tiles.map((t) => [t.label, t.value, t.blocked])).toEqual([
      ["Saw the intro", 10, null],
      ["Agreed to consent", 3 / 11, null],
      ["Skipped slides", 0.1, null],
      ["Left before Q1", 6 / 11, null],
    ]);
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
    expect(before.rows[2]).toMatchObject({ bench: null, pending: "Recorded from 17 Oct 2026" });
    // The iPhone and Android split of Mobile stays in the note.
    expect(before.note).toContain("here 100% iPhone, 0% Android");
    const after = factsFixture({
      from: "2026-10-17",
      to: "2026-10-18",
      subs: [
        sub({ id: 1, day: "2026-10-17", device: "Tablet" }),
        sub({ id: 2, day: "2026-10-17", device: "Android" }),
        sub({ id: 3, day: "2026-10-17", device: "Desktop" }),
        sub({ id: 4, day: "2026-10-17", device: null }),
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
    // Its line is not CAC: the read-out names what it draws.
    expect(cac.line).toBe("Ad spend per submission");
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
    expect(cac.foot).toMatch(/^Google Ads spend ÷ paying customers \(spend recorded/);
    const row = (label: string) => p.scorecard.find((r) => r.label === label)!;
    expect(row("CAC").note).toContain("spend recorded");
    expect(row("ROAS").note).toContain("spend recorded");
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
    // The fixture's one sale is on 2 Oct: the line is that one point, and the caption names the day.
    expect(aov.spark.filter((v) => v !== null)).toEqual([6.99]);
    expect(aov.trend).toMatch(/only 2 Oct had a sale$/);
    expect(p.questions).toBeGreaterThan(40);
  });

  it("survey: an empty benchmark draws no tick and no difference, not a false 100% Other", () => {
    const card = demoCard("Country", ["DE", "DE", "US", "FR", "IT", "ES", "PL", "NL"], [], "");
    expect(card.rows.every((r) => r.bench === null)).toBe(true);
    expect(card.rows.at(-1)?.label).toBe("Other");
  });
});

describe("visitors per source: a sample split, the totals live", () => {
  const tags = (
    src: string | null,
    med: string | null,
    sessions: number,
    more: Partial<SessionTags> = {}
  ): SessionTags => ({ src, med, ads: false, fb: false, ref: null, sessions, ...more });
  // PostHog's 100 visits besides our probes: Google Ads 30, organic 10, direct 50, Meta 10.
  const sessions = {
    ok: true as const,
    value: [
      tags("google", "cpc", 30, { ads: true }),
      tags(null, null, 10, { ref: "www.google.com" }),
      tags(null, null, 50),
      tags("ig", "paid", 10),
      tags("prod-verification", null, 100),
    ],
  };
  it("dashboard: Sources and Performance over the counted and split visitors, as drawn", () => {
    // The visit log: 66 Google Ads visits (its links tag every click), 110 untagged, a probe.
    const tagged = factsFixture({
      visits: [
        { day: "2026-10-01", arm: "white_card", src: "google", n: 66 },
        { day: "2026-10-01", arm: "white_card", src: null, n: 110 },
        { day: "2026-10-02", arm: "white_card", src: "prod-verification", n: 5 },
      ],
    });
    const dash = (s: typeof sessions | null) =>
      buildDashboard({
        facts: tagged,
        previous: null,
        ad,
        filters,
        today: TODAY,
        now,
        newReturning: null,
        sessions: s,
      });
    const p = dash(sessions);
    expect(p.sources.columns.map((c) => c.label)).toEqual([
      "Source",
      "Visitors",
      "Share",
      "Submissions",
      "Survey CVR",
      "€ / visit",
    ]);
    expect(p.sources).toMatchObject({ sample: true, barLabel: "Share of visits" });
    expect(p.sources.columns.map((c) => c.digits)).toEqual([
      undefined,
      undefined,
      1,
      undefined,
      2,
      undefined,
    ]);
    // Google Ads' 66 are counted, never PostHog's share of all its visits (30%, mostly Google
    // Ads, as PostHog sees it nearly whole); the 110 untagged are split by PostHog's untagged
    // visits: organic 10, direct 50.
    const google = p.sources.rows.find((r) => r.label === "Google Ads")!;
    expect(google.values).toEqual([66, 66 / 176, 2, 2 / 66, 6.99 / 66]);
    const direct = p.sources.rows.find((r) => r.label === "Direct / untagged")!;
    expect(direct.values[0]).toBe(92);
    expect(p.sources.rows.find((r) => r.label === "Organic search")!.values[0]).toBe(18);
    expect(google.bar).toBeCloseTo(66 / 92);
    expect(p.sources.rows).toHaveLength(SOURCE_ROWS.length);
    expect(p.performance.find((r) => r.label === "Google Ads")).toEqual({
      label: "Google Ads",
      surveyCvr: 2 / 66,
      perVisit: 6.99 / 66,
    });
    // PostHog unread: Google Ads' visits are still a count, the others blank (dashes and no
    // bars, which would read as no visits).
    const none = dash(null);
    expect(none.sources.sample).toBe(false);
    expect(none.sources.rows.every((r) => r.bar === undefined)).toBe(true);
    expect(none.sources.rows.find((r) => r.label === "Google Ads")!.values).toEqual([
      66,
      66 / 176,
      2,
      2 / 66,
      6.99 / 66,
    ]);
    expect(
      none.sources.rows.filter((r) => r.label !== "Google Ads").every((r) => r.values[0] === null)
    ).toBe(true);
    expect(
      none.performance
        .filter((r) => r.label !== "Google Ads")
        .every((r) => r.surveyCvr === null && r.perVisit === null)
    ).toBe(true);
  });

  it("dashboard: € per visit for new and returning, each payment with its payer's group", () => {
    const A = "0192f0aa-1111-7000-8000-000000000001";
    const B = "0192f0aa-2222-7000-8000-000000000002";
    const [paid, gift] = facts.money;
    const withVisits = factsFixture({
      money: [
        { ...paid!, ph: A.toUpperCase() },
        { ...paid!, sid: 5, amount: 4.99, ph: B },
        // PostHog never saw this visit, a gift brings no money, a probe is never counted.
        { ...paid!, sid: 6, amount: 9.99, ph: "0192f0aa-3333-7000-8000-000000000003" },
        { ...gift!, ph: A },
        // Only money in counts, as in the revenue totals.
        { ...paid!, sid: 9, amount: -6.99, ph: A },
        { ...paid!, sid: 7, amount: 3, ph: B, src: "prod-verification", med: null, ads: false },
        // Outside the range.
        { ...paid!, sid: 8, day: "2026-10-09", ph: A },
      ],
    });
    const groups = new Map<string, "new" | "returning">([
      [A, "new"],
      [B, "returning"],
    ]);
    expect(revenueByGroup(withVisits, groups)).toEqual({ new: 6.99, returning: 4.99 });
    const dash = (visitorGroups: Parameters<typeof buildDashboard>[0]["visitorGroups"]) =>
      buildDashboard({
        facts: withVisits,
        previous: null,
        ad,
        filters,
        today: TODAY,
        now,
        newReturning: null,
        visitorGroups,
      }).newReturningRevenue;
    expect(dash({ ok: true, value: groups })).toEqual({
      ok: true,
      value: { new: 6.99, returning: 4.99 },
    });
    expect(dash({ ok: false, error: "down" })).toEqual({ ok: false, error: "down" });
    expect(dash(null)).toBeNull();
  });

  it("dashboard: the plans are named as drawn, the retired ones kept", () => {
    const quote = (plan: string, price: number) => ({
      src: "google",
      med: "cpc",
      ads: true,
      plan,
      priceArm: null,
      price,
      device: "iOS",
      tier: "tier_1",
      quoted: 4,
      checkouts: 1,
      sales: 1,
      revenue: price,
    });
    const p = buildDashboard({
      facts: factsFixture({
        quotes: [
          quote("full_report", 6.99),
          quote("all_reports", 9.99),
          quote("essentials", 4.99),
          quote("core", 2.99),
        ],
      }),
      previous: null,
      ad,
      filters,
      today: TODAY,
      now,
      newReturning: null,
    });
    // By the plan's name, then price, as the design lists them.
    expect(p.prices.map((r) => r.planLabel)).toEqual([
      "Core (retired)",
      "Essentials (retired)",
      "Full",
      "Full All",
    ]);
    const full = buildDashboard({
      facts: factsFixture({
        quotes: [
          quote("all_reports", 49),
          quote("full_report", 14.99),
          quote("all_reports", 6.99),
          quote("full_report", 4.99),
        ],
      }),
      previous: null,
      ad,
      filters,
      today: TODAY,
      now,
      newReturning: null,
    });
    expect(full.prices.map((r) => `${r.planLabel} ${r.price}`)).toEqual([
      "Full 4.99",
      "Full 14.99",
      "Full All 6.99",
      "Full All 49",
    ]);
  });
});

describe("blanks say why, and notes say what the numbers are", () => {
  it("Dashboard: a long range keeps the start-rate chart's later points and says why earlier ones are out", () => {
    const long = parseFilters({ period: "custom", from: "2026-07-01", to: "2026-10-07" }, TODAY);
    const f = buildFocus({
      facts: factsFixture({ from: "2026-07-01", to: "2026-10-07" }),
      previous: null,
      ad,
      filters: long,
      today: TODAY,
      now,
      ratings: null,
    });
    const chart = (k: string) => f.charts.find((c) => c.key === k)!;
    for (const k of ["start-cvr", "completion"]) {
      expect(chart(k).blocked).toBeNull();
      // From the earlier of 18 Sep 2026 and the drafts' 30 days (13 Sep, 30 days before 13 Oct).
      expect(chart(k).note).toBe(
        "Survey starts before 13 Sep are left out: until 18 Sep 2026 a start was kept only with its draft, and drafts are cleared after 30 days."
      );
    }
    // Months before 18 Sep have no point; October's has one.
    const months = chart("start-cvr").views.month;
    expect(months.series[0]!.values.slice(0, 2)).toEqual([null, null]);
    // Assessments per user reads per month only, as drawn.
    expect(chart("per-user")).toMatchObject({ grains: ["month"], leftMin: 1.5 });
  });

  const focus = (over: Partial<Parameters<typeof buildFocus>[0]> = {}) =>
    buildFocus({ facts, previous: null, ad, filters, today: TODAY, now, ratings: null, ...over });
  const dashboard = (over: Partial<Parameters<typeof buildDashboard>[0]> = {}) =>
    buildDashboard({
      facts,
      previous: null,
      ad,
      filters,
      today: TODAY,
      now,
      newReturning: null,
      ...over,
    });
  const tile = (p: { tiles: Array<{ key: string }> }, key: string) =>
    p.tiles.find((t) => t.key === key) as ReturnType<typeof focus>["tiles"][number];

  it("dashboard: the journey leaves a share blank where its base is incomplete, and says why", () => {
    // 1 to 7 Aug: survey starts were kept only with their drafts (cleared after 30 days), and
    // the paywall's seen stamp starts on 6 Sep 2026.
    const aug = parseFilters({ period: "custom", from: "2026-08-01", to: "2026-08-07" }, TODAY);
    const d = dashboard({
      facts: factsFixture({ from: "2026-08-01", to: "2026-08-07" }),
      filters: aug,
    });
    const step = (n: number) => d.journey.find((j) => j.n === n)!;
    expect(step(3)).toMatchObject({ value: null, step: "— of visits" });
    expect(step(4).step).toBe("— of starts");
    expect(step(6)).toMatchObject({ value: null, step: "recorded from 6 Sep 2026" });
    expect(step(7).step).toBe("— of paywall");
    // The incomplete starts themselves are blank too, as the Start CVR tile and the Survey page.
    expect(d.journeyNote).toMatch(/^Step 3 is blank and steps 3 and 4 have no share: /);
    expect(d.journeyNote).toMatch(/Step 6 is blank: /);
    expect(d.scorecard.find((r) => r.label === "Start CVR")!.value).toBeNull();
    // A range the records hold whole: every share, and no note.
    expect(dashboard().journeyNote).toBeNull();
  });

  it("dashboard: finishers whose source was never recorded have a row of their own, not Direct", () => {
    const unknown = factsFixture({
      subs: [
        ...facts.subs,
        sub({ id: 41, src: null, med: null, ads: false, srcKnown: false }),
        sub({ id: 42, src: null, med: null, ads: false, srcKnown: false }),
      ],
    });
    const rows = dashboard({ facts: unknown }).sources.rows;
    expect(rows.at(-1)).toMatchObject({
      label: "Not recorded",
      values: [null, null, 2, null, null],
    });
    expect(rows.find((r) => r.label === "Direct / untagged")!.values[2]).toBe(0);
  });

  it("Dashboard: chapter ratings say they are all traffic's under a filter, and the A boxes say why they are empty", () => {
    const ratings = { up: 15, down: 2 };
    expect(focus({ ratings }).assessments.nps.sub).toBe(
      "Not asked yet. 88% of 17 chapter ratings say helpful."
    );
    expect(focus({ ratings, filters: { ...filters, source: "direct" } }).assessments.nps.sub).toBe(
      "Not asked yet. 88% of 17 chapter ratings say helpful (all traffic)."
    );
    const b = focus({ filters: { ...filters, assessment: "b" } }).assessments;
    expect(b.survey).toEqual({
      valueMs: null,
      sub: "Assessment B has not launched: these boxes are Assessment A's.",
    });
    expect(b.report.valueMs).toBeNull();
  });

  it("Dashboard: the full-unlock rate is the range's own finishers who bought, not sales paid in it", () => {
    const chart = (f: ReturnType<typeof focus>) =>
      f.charts.find((c) => c.key === "full-unlock")!.views.day.series[0]!.total;
    // The fixture's first finisher bought a full unlock; a June finisher's sale in the range
    // is revenue here, but not one of these people.
    const own = factsFixture({
      subs: [
        sub({ ...facts.subs[0]!, full: true, fullSales: 1, fullRevenue: 6.99 }),
        facts.subs[1]!,
      ],
      money: [...facts.money, { ...facts.money[0]!, sid: 999, day: "2026-10-03" }],
    });
    expect(chart(focus({ facts: own }))).toBeCloseTo(1 / 2);
  });

  it("dashboard: CLV equals the average order only while nobody bought twice", () => {
    const clv = (money: typeof facts.money) =>
      dashboard({ facts: factsFixture({ money }) }).scorecard.find((r) => r.label === "CLV")!.note;
    const [paid] = facts.money;
    expect(clv([paid!])).toBe(
      "revenue per paying customer; one purchase each so far, so it equals the average order"
    );
    expect(clv([paid!, { ...paid!, day: "2026-10-03", amount: 4.99 }])).toBe(
      "revenue per paying customer; 2 purchases by 1 customer so far"
    );
    expect(clv([])).toBe("revenue per paying customer");
  });

  it("dashboard: the journey's submit step is a share of the starts, as drawn", () => {
    // "% = of the previous step": the range's 2 submissions over its 14 starts.
    expect(dashboard().journey[3]).toMatchObject({ label: "Submitted", step: "14.3% of starts" });
  });

  it("dashboard: an earlier € per survey complete from €1 is written in cents, as the value is", () => {
    const prev = factsFixture({
      from: "2026-09-24",
      to: "2026-09-30",
      subs: [sub({ id: 31, day: "2026-09-25", at: "2026-09-25T10:00:00Z" })],
      money: [{ ...facts.money[0]!, sid: 31, day: "2026-09-25", amount: 25 }],
    });
    // €25 over one finisher: "€25.00", not "€25.000".
    expect(tile(dashboard({ previous: prev }), "rev-sub").foot).toBe("vs €25.00 · 2 submissions");
  });

  it("ad spend with no figure for the range says why on every page that shows it", () => {
    // Spend is recorded from 10 Oct: none for 1 to 7 Oct.
    const later = { byDay: new Map([["2026-10-10", 30]]), from: "2026-10-10", to: "2026-10-12" };
    const why = "No ad spend recorded for these days.";
    const o = focus({ ad: later });
    expect(tile(o, "spend")).toMatchObject({ value: null, blocked: why });
    // Cost per submission is blank too, never €0.
    expect(o.charts[0]!.views.day.series[1]!.total).toBeNull();
    const d = dashboard({ ad: later });
    expect(tile(d, "cac").blocked).toBe(why);
    expect(d.scorecard.find((r) => r.label === "CAC")!.note).toBe(why);
    // No window at all: the read failed.
    const failed = { byDay: new Map<string, number>(), from: null, to: null };
    expect(tile(focus({ ad: failed }), "spend").blocked).toBe(
      "Ad spend could not be read just now."
    );
    // With its figure: no reason.
    expect(tile(focus(), "spend").blocked).toBeNull();
  });

  it("the tablet filter before tablets were told apart: figures about people blank, with why", () => {
    const reason = "Tablets are told apart from 17 Oct 2026: pick a range from that day on.";
    const tablets = { ...filters, device: "tablet" as const };
    const o = focus({ filters: tablets });
    for (const key of ["revenue", "new-users"]) expect(tile(o, key).blocked).toBe(reason);
    // Start CVR needs visits, which never record the device: that reason comes first.
    expect(o.charts.map((c) => c.blocked)).toEqual([
      reason,
      "Visits don't record the device.",
      reason,
      o.charts[3]!.blocked,
      reason,
      reason,
    ]);
    expect(o.assessments.rows[0]).toMatchObject({ submissions: null, paidCvr: null, trend: null });
    const d = dashboard({ filters: tablets });
    for (const key of ["pay-cvr", "rev-sub", "revenue", "aov", "open-rate"])
      expect(tile(d, key).blocked).toBe(reason);
    expect(d.journey.slice(3).map((j) => j.value)).toEqual([null, null, null, null]);
    expect(d.sources.rows.every((r) => r.values[2] === null)).toBe(true);
    expect(d.pricesBlocked).toBe(reason);
    // Phones are told apart all along: counted as before.
    expect(focus({ filters: { ...filters, device: "phone" } }).assessments.rows[0]).toMatchObject({
      submissions: 2,
    });
  });

  it("the tablet filter from the day tablets are told apart: counted, but not compared with before", () => {
    const today = "2026-10-25";
    const late = parseFilters(
      { period: "custom", from: "2026-10-17", to: "2026-10-23", device: "tablet" },
      today
    );
    const at = new Date("2026-10-25T10:00:00Z");
    const tablet = (id: number, day: string) =>
      sub({ id, day, at: `${day}T10:00:00Z`, device: "Tablet" });
    const facts15 = factsFixture({
      from: late.from,
      to: late.to,
      asOf: today,
      subs: [tablet(1, "2026-10-18")],
      money: [],
    });
    // The week before holds days before tablets were told apart: nothing to compare with.
    const before = factsFixture({
      from: "2026-10-10",
      to: "2026-10-16",
      asOf: today,
      subs: [sub({ id: 2, day: "2026-10-11", at: "2026-10-11T10:00:00Z" })],
      money: [],
    });
    const args = { facts: facts15, previous: before, ad, filters: late, today, now: at };
    const o = buildFocus({ ...args, ratings: null });
    expect(tile(o, "new-users")).toMatchObject({ value: 1, prev: null, blocked: null });
    const d = buildDashboard({ ...args, newReturning: null });
    expect(tile(d, "open-rate")).toMatchObject({ value: 1, prev: null, blocked: null });
    // Compared, the week before would read a false €0.
    expect(tile(d, "revenue")).toMatchObject({ value: 0, prev: null, blocked: null });
    expect(d.pricesBlocked).toBeNull();
  });
});

describe("the tablet filter before tablets were told apart: survey and report", () => {
  // Tablets are told apart from SURVEY_TRACKING_FROM: before, nobody counts as one.
  const tablet = { ...filters, device: "tablet" as const };
  const reason = /^Tablets are told apart from .*: pick a range from that day on\.$/;

  it("survey: submissions blank with the reason, no comparison with such a period", () => {
    const s = buildSurveyPage({
      facts,
      previous: lastWeek,
      benchmark: facts,
      benchmarkKind: "all",
      filters: tablet,
      today: TODAY,
      now,
      questions: null,
      questionsError: null,
      introClicks: null,
    });
    for (const key of ["starts", "subs", "completion"])
      expect(s.tiles.find((t) => t.key === key)?.blocked).toMatch(reason);
    expect(s.tiles.find((t) => t.key === "subs")?.prev).toBeNull();
  });

  it("report: every tile blank with the reason, and no earlier period compared", () => {
    const r = buildReportPage({
      facts,
      previous: lastWeek,
      benchmark: facts,
      extras,
      returns: null,
      filters: tablet,
      today: TODAY,
      now,
    });
    // Blank, each with a reason: the tablet one unless a tile has its own (no Initial plan sold).
    for (const t of [...r.tiles, ...r.wizard.tiles]) expect(t.blocked).toBeTruthy();
    expect(r.tiles.find((t) => t.key === "opened")?.blocked).toMatch(reason);
    expect(r.wizard.tiles.find((t) => t.key === "skipped")?.blocked).toMatch(reason);
    expect(r.tiles.every((t) => t.prev === null)).toBe(true);
    // Every device: no reason, and the earlier week compared.
    const all = buildReportPage({
      facts,
      previous: lastWeek,
      benchmark: facts,
      extras,
      returns: null,
      filters,
      today: TODAY,
      now,
    });
    expect(all.tiles.find((t) => t.key === "opened")?.blocked ?? null).toBeNull();
    expect(all.tiles.some((t) => t.prev !== null)).toBe(true);
  });
});
