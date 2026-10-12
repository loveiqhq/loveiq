import { beforeEach, describe, expect, it, vi } from "vitest";

const mockSupabase = vi.fn();
vi.mock("@features/admin/server/supabase", () => ({
  supabaseFetch: (...a: unknown[]) => mockSupabase(...a),
}));

import {
  allTrafficEnds,
  buildDropoffRows,
  buildHeadline,
  EMAIL_QID,
  MAX_WORSE_LINES,
  fetchDropoffRuns,
  isWorseThanUsual,
  peoplePerArm,
  poissonAtLeast,
  readSurveyTests,
  segmentsOf,
  SURVEY_TESTS,
  tallyRuns,
  twoProportionP,
  weekRange,
  type DropoffRun,
  type DropoffRow,
} from "@features/admin/server/dropoff-report";
import { askedQuestions, DROPOFF_FLOOR, dropoffWeeks } from "@features/admin/server/dropoff-weekly";
import { HIDDEN_QIDS } from "@features/survey/questionFlags";
import { orderAskedQuestions } from "@features/survey/ui/questionOrder";
import { assignEmailQuestionArm } from "@shared/experiments/emailQuestionArm";
import { assignQuestionOrderArm } from "@shared/experiments/questionOrderArm";
import { surveyQuestions } from "@/data/survey-data";

const [ORDER_TEST, EMAIL_TEST] = SURVEY_TESTS;
const AFTER_BOTH = Date.parse("2026-10-09T10:00:00Z");
const BEFORE_BOTH = Date.parse("2026-10-01T10:00:00Z");

/** A session id whose two derived arms are the ones asked for. */
function sessionWith(order: "control" | "variant", email: "control" | "anonymous"): string {
  for (let i = 0; i < 10_000; i++) {
    const id = `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`;
    if (assignQuestionOrderArm(id) === order && assignEmailQuestionArm(id) === email) return id;
  }
  throw new Error("no such session id");
}

const run = (over: Partial<DropoffRun>): DropoffRun => ({
  sessionId: sessionWith("control", "control"),
  startedAt: AFTER_BOTH,
  reached: ["00001"],
  leftAt: null,
  source: "google_ads",
  ...over,
});

describe("fetchDropoffRuns", () => {
  beforeEach(() => mockSupabase.mockReset());

  it("reads get_survey_dropoff_runs for exactly the window asked", async () => {
    mockSupabase.mockResolvedValue({
      ok: true,
      json: async () => [
        {
          session_id: "s1",
          started_at: "2026-10-09T10:00:00+00:00",
          reached: ["00001", "01002"],
          left_at: "01002",
          source: "other",
        },
      ],
    });
    const since = new Date("2026-10-04T22:00:00Z");
    const until = new Date("2026-10-11T22:00:00Z");
    const runs = await fetchDropoffRuns(since, until);
    expect(runs).toEqual([
      {
        sessionId: "s1",
        startedAt: Date.parse("2026-10-09T10:00:00Z"),
        reached: ["00001", "01002"],
        leftAt: "01002",
        source: "other",
      },
    ]);
    const [path, init] = mockSupabase.mock.calls[0] as [string, { body: string }];
    expect(path).toBe("/rest/v1/rpc/get_survey_dropoff_runs");
    expect(JSON.parse(init.body)).toEqual({
      since_ts: since.toISOString(),
      until_ts: until.toISOString(),
    });
  });

  it("throws instead of returning a week of nobody", async () => {
    mockSupabase.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
    await expect(fetchDropoffRuns(new Date(), new Date())).rejects.toThrow("500");
    mockSupabase.mockResolvedValue({ ok: true, json: async () => ({ runs: [] }) });
    await expect(fetchDropoffRuns(new Date(), new Date())).rejects.toThrow("not a list");
    mockSupabase.mockResolvedValue({
      ok: true,
      json: async () => [
        { session_id: "s1", started_at: "x", reached: [], left_at: null, source: "other" },
      ],
    });
    await expect(fetchDropoffRuns(new Date(), new Date())).rejects.toThrow("unexpected shape");
    mockSupabase.mockResolvedValue({
      ok: true,
      json: async () => [
        {
          session_id: "s1",
          started_at: "2026-10-09T10:00:00Z",
          reached: [],
          left_at: null,
          source: "paid",
        },
      ],
    });
    await expect(fetchDropoffRuns(new Date(), new Date())).rejects.toThrow("unexpected shape");
  });
});

describe("segmentsOf", () => {
  it("puts everyone in all traffic and their source", () => {
    expect(segmentsOf(run({ source: "google_ads", startedAt: BEFORE_BOTH }))).toEqual([
      "All traffic",
      "Google Ads",
    ]);
    expect(segmentsOf(run({ source: "other", startedAt: BEFORE_BOTH }))).toEqual([
      "All traffic",
      "Other sources",
    ]);
    expect(segmentsOf(run({ source: "unknown", startedAt: BEFORE_BOTH }))).toEqual([
      "All traffic",
      "Unknown source",
    ]);
  });

  it("splits by a test only for runs begun after its launch, by the arm the session id draws", () => {
    const id = sessionWith("variant", "anonymous");
    expect(segmentsOf(run({ sessionId: id }))).toEqual([
      "All traffic",
      "Google Ads",
      "Opening order: new",
      "Email question: anonymous",
    ]);
    // Between the two launches: only the opening order test.
    expect(segmentsOf(run({ sessionId: id, startedAt: EMAIL_TEST!.launch - 1 }))).toEqual([
      "All traffic",
      "Google Ads",
      "Opening order: new",
    ]);
    expect(segmentsOf(run({ sessionId: id, startedAt: ORDER_TEST!.launch }))).toContain(
      "Opening order: new"
    );
    const other = sessionWith("control", "control");
    expect(segmentsOf(run({ sessionId: other }))).toEqual([
      "All traffic",
      "Google Ads",
      "Opening order: current",
      "Email question: current",
    ]);
  });
});

describe("tallyRuns and allTrafficEnds", () => {
  it("counts people, who reached each question and who left there, per segment", () => {
    const t = tallyRuns([
      run({ reached: ["00001", "01002"], leftAt: "01002" }),
      run({ reached: ["00001"], leftAt: "00001", source: "other" }),
      run({ reached: ["00001", "01002"], leftAt: null }),
    ]);
    const all = t.get("All traffic")!;
    expect(all.people).toBe(3);
    expect(all.byQuestion.get("00001")).toEqual({ reached: 3, left: 1 });
    expect(all.byQuestion.get("01002")).toEqual({ reached: 2, left: 1 });
    expect(t.get("Google Ads")!.people).toBe(2);
    expect(t.get("Other sources")!.byQuestion.get("00001")).toEqual({ reached: 1, left: 1 });
    expect(allTrafficEnds(t).get("01002")).toEqual({ sessions: 2, quits: 1 });
  });
});

describe("statistics", () => {
  it("poissonAtLeast", () => {
    expect(poissonAtLeast(0, 3)).toBe(1);
    expect(poissonAtLeast(1, 1)).toBeCloseTo(1 - Math.exp(-1), 10);
    expect(poissonAtLeast(4, 0.8)).toBeCloseTo(0.00908, 4);
  });

  it("twoProportionP", () => {
    expect(twoProportionP(10, 100, 10, 100)).toBeCloseTo(1, 6);
    // 12% against 8% with 880 a side: the size the yardstick asks for, clearly apart.
    expect(twoProportionP(106, 880, 70, 880)).toBeCloseTo(0.0042, 3);
    expect(twoProportionP(5, 40, 4, 40)).toBeGreaterThan(0.5);
    expect(twoProportionP(0, 0, 3, 10)).toBe(1);
  });

  it("peoplePerArm matches the textbook figure for 12% against 8%", () => {
    expect(peoplePerArm(0.12, 0.08)).toBeGreaterThanOrEqual(880);
    expect(peoplePerArm(0.12, 0.08)).toBeLessThanOrEqual(885);
  });
});

describe("isWorseThanUsual", () => {
  it("flags a real jump: double, 3 points up, and not chance", () => {
    // 32 of 277 (11.6%) against a usual 4.8%: the week of 28 Sep at question 1.
    expect(isWorseThanUsual(32, 277, 0.048)).toBe(true);
  });

  it("does not flag small numbers, small rises or what chance explains", () => {
    expect(isWorseThanUsual(5, 211, 0)).toBe(false); // 0% to 2.4%: under 3 points
    expect(isWorseThanUsual(2, 25, 0.01)).toBe(false); // fewer than 3 left
    expect(isWorseThanUsual(5, DROPOFF_FLOOR - 1, 0.01)).toBe(false); // under the floor
    expect(isWorseThanUsual(30, 277, 0.06)).toBe(false); // 10.8% is not double 6%
    expect(isWorseThanUsual(9, 277, null)).toBe(false); // no usual yet
    // Double and 3 points up, but 3 of 40 against 2% is still within chance.
    expect(isWorseThanUsual(3, 40, 0.02)).toBe(false);
  });
});

describe("buildDropoffRows", () => {
  // A Tuesday: three complete weeks, then Monday 12 Oct counted as the week in progress.
  const weeks = dropoffWeeks(new Date("2026-10-13T08:30:00Z"));
  const asked = orderAskedQuestions(surveyQuestions, "control").filter(
    (q) => !HIDDEN_QIDS.has(q.qId)
  );
  const people = (n: number, over: Partial<DropoffRun>) =>
    Array.from({ length: n }, () => run(over));
  const tallies = [
    // 21 Sep and 28 Sep: question 1 reached by 100, 5 left there each week.
    tallyRuns([
      ...people(95, { startedAt: BEFORE_BOTH }),
      ...people(5, { leftAt: "00001", startedAt: BEFORE_BOTH }),
    ]),
    tallyRuns([
      ...people(95, { startedAt: BEFORE_BOTH }),
      ...people(5, { leftAt: "00001", startedAt: BEFORE_BOTH }),
    ]),
    // 5 Oct: 30 of 100 left there, a jump.
    tallyRuns([...people(70, {}), ...people(30, { leftAt: "00001" })]),
    // 12 Oct so far: 10 people.
    tallyRuns(people(10, { reached: ["00001", "00000"] })),
  ];
  const rows = buildDropoffRows(weeks, tallies, "2026-10-13");
  const row = (week: string, segment: string, qId: string) =>
    rows.find((r) => r.week === week && r.segment === segment && r.qId === qId);

  it("has one row per week, segment and question that someone in it reached", () => {
    expect(new Set(rows.map((r) => r.key)).size).toBe(rows.length);
    expect(rows.every((r) => r.reached > 0)).toBe(true);
    expect(row("2026-09-21", "All traffic", "00001")).toBeDefined();
    expect(row("2026-09-21", "All traffic", "01002")).toBeUndefined(); // nobody reached it
    expect(row("2026-09-21", "Opening order: current", "00001")).toBeUndefined(); // before launch
    expect(row("2026-10-05", "Opening order: current", "00001")).toBeDefined();
  });

  it("names and numbers each question as the survey asks it today", () => {
    const r = row("2026-09-21", "All traffic", "00001")!;
    const n = asked.findIndex((q) => q.qId === "00001") + 1;
    expect(r.n).toBe(n);
    expect(r.question).toBe(`${String(n).padStart(2, "0")} · ${r.name}`);
    expect(r.key).toBe("2026-09-21 · All traffic · 00001");
  });

  it("counts a week in progress up to yesterday and complete weeks as 7 days", () => {
    expect(row("2026-10-12", "All traffic", "00001")!.days).toBe(1);
    expect(row("2026-10-05", "All traffic", "00001")!.days).toBe(7);
  });

  it("gives the drop-off, the share of everyone, and the usual of the weeks before", () => {
    const r = row("2026-10-05", "All traffic", "00001")!;
    expect(r.rate).toBe(0.3);
    expect(r.ofEveryone).toBe(0.3);
    expect(r.usual).toBe(0.05); // 10 of 200, the two weeks before pooled
    expect(row("2026-09-21", "All traffic", "00001")!.usual).toBeNull(); // nothing before it
    expect(r.flag).toBe("Worse than usual");
  });

  it("leaves the rate blank under the floor but still counts the people", () => {
    const r = row("2026-10-12", "All traffic", "00000")!;
    expect(r.reached).toBe(10);
    expect(r.rate).toBeNull();
    expect(r.flag).toBe("Normal");
  });

  it("writes only the weeks from showFrom, with the usual still taken from the weeks before", () => {
    const shownOnly = buildDropoffRows(weeks, tallies, "2026-10-13", 2);
    expect(new Set(shownOnly.map((r) => r.week))).toEqual(new Set(["2026-10-05", "2026-10-12"]));
    const r = shownOnly.find(
      (x) => x.week === "2026-10-05" && x.segment === "All traffic" && x.qId === "00001"
    )!;
    expect(r.usual).toBe(0.05); // from 21 and 28 Sep, which are read but not written
  });

  it("marks the three highest drop-offs of each week and segment", () => {
    const qs = askedQuestions(60)
      .slice(0, 5)
      .map((q) => q.qId);
    const week = tallyRuns([
      ...qs.flatMap((qId, i) => [
        ...people(40 - i * 5, { reached: qs }),
        ...people(i + 1, { reached: qs, leftAt: qId }),
      ]),
    ]);
    const top = buildDropoffRows(weeks.slice(0, 1), [week], "2026-10-13").filter(
      (r) => r.segment === "All traffic" && r.flag === "Top 3 of the week"
    );
    expect(top.map((r) => r.qId).sort()).toEqual(qs.slice(2).sort());
  });
});

describe("readSurveyTests", () => {
  const control = sessionWith("control", "control");
  const variant = sessionWith("variant", "anonymous");

  it("reads each test only from runs begun after its launch, per derived arm", () => {
    const opening = (arm: "control" | "variant") =>
      orderAskedQuestions(surveyQuestions, arm).filter((q) => !HIDDEN_QIDS.has(q.qId));
    const lateInVariantOnly = opening("control")
      .slice(0, 8)
      .map((q) => q.qId)
      .find(
        (qId) =>
          !opening("variant")
            .slice(0, 8)
            .some((q) => q.qId === qId)
      )!;
    const runs = [
      run({ sessionId: control, reached: [EMAIL_QID], leftAt: EMAIL_QID }),
      run({ sessionId: control, reached: [EMAIL_QID] }),
      run({ sessionId: variant, reached: [EMAIL_QID] }),
      run({ sessionId: control, leftAt: "00001" }),
      // In the variant this question is not in the opening, so leaving there is not counted.
      run({ sessionId: variant, leftAt: lateInVariantOnly }),
      // Before both launches: in neither test.
      run({ sessionId: variant, startedAt: BEFORE_BOTH, reached: [EMAIL_QID], leftAt: EMAIL_QID }),
    ];
    const [email, order] = readSurveyTests(runs, "2026-10-12");
    expect(email!.arms).toEqual([
      { label: "the current question", people: 2, left: 1 },
      { label: "the anonymous one", people: 1, left: 0 },
    ]);
    expect(order!.arms).toEqual([
      { label: "the current order", people: 3, left: 1 },
      { label: "the new order", people: 2, left: 0 },
    ]);
    expect(email!.since).toBe("8 Oct");
    expect(order!.since).toBe("6 Oct");
    expect(email!.needed).toBeNull(); // too few in control to size it
  });

  it("paces a test from its launch minute, not from the start of that day", () => {
    // The email test launched 8 Oct at 09:12 UTC; to 12 Oct 00:00 Berlin is 3.37 days, not 4.
    const many = (sessionId: string, n: number, left: number) =>
      Array.from({ length: n }, (_, i) =>
        run({ sessionId, reached: [EMAIL_QID], leftAt: i < left ? EMAIL_QID : null })
      );
    const t = readSurveyTests(
      [...many(control, 337, 40), ...many(variant, 337, 30)],
      "2026-10-12"
    )[0]!;
    const elapsed = (Date.parse("2026-10-11T22:00:00Z") - EMAIL_TEST!.launch) / 86_400_000;
    const days =
      (Date.parse(`${t.enoughBy}T12:00:00Z`) - Date.parse("2026-10-12T12:00:00Z")) / 86_400_000;
    expect(days).toBe(Math.ceil((t.needed! - 337) / (337 / elapsed)));
    // Counting the launch day whole would have said later.
    expect(days).toBeLessThan(Math.ceil((t.needed! - 337) / (337 / 4)));
  });

  it("sizes the test and says when it can be called, then calls it", () => {
    const many = (sessionId: string, n: number, left: number) =>
      Array.from({ length: n }, (_, i) =>
        run({ sessionId, reached: [EMAIL_QID], leftAt: i < left ? EMAIL_QID : null })
      );
    const early = readSurveyTests(
      [...many(control, 100, 12), ...many(variant, 100, 6)],
      "2026-10-12"
    )[0]!;
    expect(early.needed).toBeGreaterThan(100);
    expect(early.enoughBy).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(early.clearDifference).toBeNull();
    const done = readSurveyTests(
      [...many(control, 1000, 120), ...many(variant, 1000, 60)],
      "2026-10-12"
    )[0]!;
    expect(done.clearDifference).toBe(true);
    const flat = readSurveyTests(
      [...many(control, 1000, 120), ...many(variant, 1000, 118)],
      "2026-10-12"
    )[0]!;
    expect(flat.clearDifference).toBe(false);
  });
});

describe("buildHeadline", () => {
  const weeks = dropoffWeeks(new Date("2026-10-12T08:30:00Z"));
  const tallies = weeks.map(() =>
    tallyRuns([
      ...Array.from({ length: 80 }, () => run({ startedAt: BEFORE_BOTH })),
      ...Array.from({ length: 20 }, () => run({ leftAt: "00001", startedAt: BEFORE_BOTH })),
    ])
  );
  const rows = buildDropoffRows(weeks, tallies, "2026-10-12");
  const text = (lines: ReturnType<typeof buildHeadline>) =>
    lines.map((l) => l.map((s) => s.text).join("")).join("\n");

  it("leads with last full week, names where people left, and carries the marker", () => {
    const lines = buildHeadline({
      rows,
      weeks,
      tallies,
      tests: [],
      today: "2026-10-12",
      marker: "kpi-dropoff job",
    });
    const t = text(lines);
    expect(t).toContain(
      "Last full week, 5 to 11 Oct: 100 people were in the survey and 20 of them left before the end (20.0%)."
    );
    expect(t).toContain("Q1 What is your name?");
    expect(t).toContain("20.0% (20 of the 100 who reached it)");
    expect(t).toContain("kpi-dropoff job");
    expect(t).not.toContain("Worse than usual");
    expect(t).not.toContain("—");
  });

  it("lists a question that got worse than usual", () => {
    const worse = rows.map((r): DropoffRow =>
      r.week === "2026-10-05" && r.segment === "All traffic" && r.qId === "00001"
        ? { ...r, flag: "Worse than usual", usual: 0.05 }
        : r
    );
    const t = text(
      buildHeadline({ rows: worse, weeks, tallies, tests: [], today: "2026-10-12", marker: "m" })
    );
    expect(t).toContain("Worse than usual:");
    expect(t).toContain("against a usual 5.0% (week of 5 Oct)");
  });

  it("states each test plainly and never calls one early", () => {
    const base = {
      name: "Email question test",
      since: "8 Oct",
      measure: "at the email question",
      arms: [
        { label: "the current question", people: 90, left: 9 },
        { label: "the anonymous one", people: 88, left: 6 },
      ] as [
        { label: string; people: number; left: number },
        { label: string; people: number; left: number },
      ],
    };
    const t = text(
      buildHeadline({
        rows,
        weeks,
        tallies,
        tests: [{ ...base, needed: 880, enoughBy: "2026-11-20", clearDifference: null }],
        today: "2026-10-12",
        marker: "m",
      })
    );
    expect(t).toContain(
      "Email question test, since 8 Oct: 10.0% left at the email question with the current question (9 of 90), 6.8% with the anonymous one (6 of 88)."
    );
    expect(t).toContain("Too early to call");
    expect(t).toContain("about 880 people per version, around 20 Nov at this pace.");
    const called = text(
      buildHeadline({
        rows,
        weeks,
        tallies,
        tests: [{ ...base, needed: 80, enoughBy: null, clearDifference: true }],
        today: "2026-10-12",
        marker: "m",
      })
    );
    expect(called).toContain("A clear difference, not chance.");
  });

  it("names at most a handful of worse-than-usual questions and counts the rest", () => {
    const base = rows.find((r) => r.segment === "All traffic" && r.week === "2026-10-05")!;
    const many = Array.from({ length: MAX_WORSE_LINES + 3 }, (_, i): DropoffRow => ({
      ...base,
      key: `${base.key}-${i}`,
      n: i + 1,
      rate: 0.5 - i / 100,
      flag: "Worse than usual",
      usual: 0.05,
    }));
    const lines = buildHeadline({
      rows: [...rows, ...many],
      weeks,
      tallies,
      tests: [],
      today: "2026-10-12",
      marker: "m",
    });
    expect(text(lines)).toContain("and 3 more, orange in the table below");
    expect(text(lines).split("against a usual").length - 1).toBe(MAX_WORSE_LINES);
    // Notion takes at most 100 pieces of text in one callout, line breaks included.
    expect(lines.flat().length + lines.length - 1).toBeLessThan(100);
  });

  it("formats week ranges across months", () => {
    expect(weekRange("2026-10-05")).toBe("5 to 11 Oct");
    expect(weekRange("2026-09-28")).toBe("28 Sep to 4 Oct");
  });
});
