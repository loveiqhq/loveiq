import { describe, expect, it } from "vitest";
import {
  buildReportSignals,
  buildSurveySignals,
  type FrictionQuestion,
  type FrictionSnapshot,
  type ReportFrictionSnapshot,
} from "@features/admin/server/friction-metrics";

function q(over: Partial<FrictionQuestion> & { question_index: number }): FrictionQuestion {
  return {
    q_id: `q${over.question_index}`,
    visits: 100,
    abandons: 1,
    backs: 1,
    skipped: 0,
    median_ms: 9000,
    timed: 100,
    ...over,
  };
}

const snap = (
  questions: FrictionQuestion[],
  over: Partial<FrictionSnapshot> = {}
): FrictionSnapshot => ({
  questions,
  total_rows: questions.reduce((n, x) => n + x.visits, 0),
  total_timed: questions.reduce((n, x) => n + x.timed, 0),
  median_ms: 9000,
  ...over,
});

const find = (sigs: ReturnType<typeof buildSurveySignals>, label: string) =>
  sigs.find((s) => s.label === label);

describe("buildSurveySignals", () => {
  it("names the worst drop-off question, not just the rate", () => {
    // A number with no subject is not actionable. "21%" is a statistic;
    // "Q58 — What is your email?" is a decision.
    const sigs = buildSurveySignals(
      snap([q({ question_index: 0, abandons: 2 }), q({ question_index: 57, abandons: 21 })]),
      new Map([["q57", "What is your email?"]])
    );
    const drop = find(sigs, "Drop-off point");
    expect(drop?.value).toBe("21%");
    expect(drop?.where).toBe("Q58 — What is your email?");
    expect(drop?.status).toBe("watch");
  });

  it("ignores questions too thin to carry a rate", () => {
    // 1 of 3 people leaving is 33% and means nothing. Ranking on it would put
    // a near-empty question at the top of the board every quiet week.
    const sigs = buildSurveySignals(
      snap([
        q({ question_index: 0, visits: 3, abandons: 1, timed: 3 }),
        q({ question_index: 1, visits: 200, abandons: 10, timed: 200 }),
      ])
    );
    expect(find(sigs, "Drop-off point")?.where).toBe("Q2");
  });

  it("reports hesitation relative to a typical question, not in raw seconds", () => {
    // 26s means nothing on its own; 2.9x the typical question is the finding.
    const sigs = buildSurveySignals(
      snap([q({ question_index: 0 }), q({ question_index: 47, median_ms: 26000 })], {
        median_ms: 9000,
      })
    );
    const hes = find(sigs, "Answer hesitation");
    expect(hes?.value).toContain("2.9x typical");
    expect(hes?.status).toBe("watch");
  });

  it("calls a normal question quiet rather than inventing a trend", () => {
    // Most of these will be unremarkable most weeks. A board that flags
    // everything is a board nobody reads.
    const sigs = buildSurveySignals(snap([q({ question_index: 0 }), q({ question_index: 1 })]));
    expect(sigs.every((s) => s.status !== "watch")).toBe(true);
  });

  it("returns nothing at all rather than zeroes when there is no data", () => {
    expect(buildSurveySignals(snap([]))).toEqual([]);
    expect(buildSurveySignals(snap([q({ question_index: 0 })], { total_rows: 0 }))).toEqual([]);
  });

  it("measures progress sensitivity across thirds, not one question", () => {
    const early = [0, 1, 2].map((i) => q({ question_index: i, abandons: 1 }));
    const mid = [3, 4, 5].map((i) => q({ question_index: i, abandons: 1 }));
    const late = [6, 7, 8].map((i) => q({ question_index: i, abandons: 10 }));
    const sigs = buildSurveySignals(snap([...early, ...mid, ...late]));
    const ps = find(sigs, "Progress sensitivity");
    expect(ps?.value).toContain("+9.0pp");
    expect(ps?.status).toBe("watch");
  });
});

function reportSnap(over: Partial<ReportFrictionSnapshot> = {}): ReportFrictionSnapshot {
  return {
    viewers: 290,
    tried_locked: 32,
    read_to_end: 64,
    paywall_opened: 35,
    paywall_closed: 121,
    checkout: 15,
    dwell_median_ms: 2456,
    dwell_n: 153,
    escape_routes: [
      { source: "close_button", n: 151 },
      { source: "escape", n: 2 },
    ],
    top_locked_section: "map",
    scrolled_before_paywall: 7,
    reopened_pricing: 14,
    saw_a_price: 135,
    total_rows: 3784,
    ...over,
  };
}

const findR = (sigs: ReturnType<typeof buildReportSignals>, label: string) =>
  sigs.find((s) => s.label === label);

describe("buildReportSignals", () => {
  it("never divides dismissals by opens", () => {
    // The scroll paywall opens ITSELF without emitting paywall_initiated, so
    // there are 121 dismissals against 35 opens. An "escape rate" would print
    // 346% and be nonsense. How people leave is answerable; how many is not.
    const sigs = buildReportSignals(reportSnap());
    const escape = findR(sigs, "Paywall escape");
    expect(escape?.value).toBe("99% via close button");
    expect(JSON.stringify(sigs)).not.toMatch(/[1-9]\d\d+%/);
  });

  it("calls a 2.5s median what it is", () => {
    // Marcus's own framing: immediate rejection vs genuine consideration.
    expect(findR(buildReportSignals(reportSnap()), "Paywall dwell time")?.where).toBe(
      "immediate rejection"
    );
    expect(
      findR(buildReportSignals(reportSnap({ dwell_median_ms: 20_000 })), "Paywall dwell time")
        ?.where
    ).toBe("genuine consideration");
  });

  it("flags that most people meet the paywall before seeing the report", () => {
    const v = findR(buildReportSignals(reportSnap()), "Value discovery before paywall");
    expect(v?.value).toBe("20% got halfway first");
    expect(v?.status).toBe("watch");
  });

  it("names the section people actually try to open", () => {
    // Excluding staff changed this answer from typical_beliefs to map, which is
    // why it is worth printing rather than just the rate.
    expect(findR(buildReportSignals(reportSnap()), "Report curiosity")?.where).toBe(
      "most tried: map"
    );
  });

  it("says nothing at all when nobody viewed a report", () => {
    expect(buildReportSignals(reportSnap({ viewers: 0 }))).toEqual([]);
  });

  it("omits the paywall rows rather than printing zeroes for them", () => {
    const sigs = buildReportSignals(
      reportSnap({ paywall_opened: 0, dwell_n: 0, escape_routes: [], saw_a_price: 0 })
    );
    expect(findR(sigs, "Paywall dwell time")).toBeUndefined();
    expect(findR(sigs, "Value discovery before paywall")).toBeUndefined();
    expect(findR(sigs, "Price interaction")).toBeUndefined();
    // The report-side rows still stand on their own.
    expect(findR(sigs, "Scroll behaviour")).toBeDefined();
  });
});
