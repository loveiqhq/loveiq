import { describe, expect, it } from "vitest";
import {
  buildSurveySignals,
  type FrictionQuestion,
  type FrictionSnapshot,
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
