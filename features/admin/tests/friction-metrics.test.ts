import { describe, expect, it } from "vitest";
import {
  TABLE_W,
  buildFrictionSection,
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
    expect(hes?.value).toContain("2.9x");
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

  it("no longer emits the rows removed on 2026-09-19", () => {
    /**
     * Four survey rows were removed because each was wrong, duplicated or
     * un-actionable. This is the guard that they stay removed — asserted on a
     * fixture built to TRIGGER every one of them, so it cannot pass by having
     * nothing to find:
     *
     *   Skipped questions        printed 0.0% every day while the behaviour
     *                            table carried 3.85% unanswered rows — the
     *                            column is not counting what the label said.
     *   Drop-off, late vs early  a pp difference whose sign flips on noise.
     *   Back after a long pause  ranked on the same `backs` column as "Went
     *                            back a step", so both named the same question
     *                            with the same percentage.
     *   Engagement pace          people answer later questions faster in every
     *                            survey ever run.
     */
    const early = [0, 1, 2].map((i) => q({ question_index: i, abandons: 1 }));
    const late = [6, 7, 8].map((i) =>
      // Slow AND with people going back: what the surprise proxy ranked on.
      q({ question_index: i, abandons: 10, median_ms: 90_000, backs: 30, skipped: 5 })
    );
    const sigs = buildSurveySignals(snap([...early, ...late]));

    for (const gone of [
      "Skipped questions",
      "Drop-off, late vs early",
      "Back after a long pause",
      "Engagement pace",
    ]) {
      expect(find(sigs, gone), `${gone} was removed`).toBeUndefined();
    }
    // And the rows that earn their place are still there.
    expect(find(sigs, "Drop-off point")).toBeDefined();
    expect(find(sigs, "Went back a step")).toBeDefined();
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
    expect(escape?.value).toBe("99%");
    expect(escape?.where).toBe("via close button");
    expect(JSON.stringify(sigs)).not.toMatch(/[1-9]\d\d+%/);
  });

  it("calls a 2.5s median what it is", () => {
    // Marcus's own framing: immediate rejection vs genuine consideration.
    expect(findR(buildReportSignals(reportSnap()), "Paywall dwell (median)")?.where).toBe(
      "immediate rejection"
    );
    expect(
      findR(buildReportSignals(reportSnap({ dwell_median_ms: 20_000 })), "Paywall dwell (median)")
        ?.where
    ).toBe("genuine consideration");
  });

  it("flags that most people meet the paywall before seeing the report", () => {
    const v = findR(buildReportSignals(reportSnap()), "Saw half before paywall");
    expect(v?.value).toBe("20%");
    expect(v?.status).toBe("watch");
  });

  it("names the section people actually try to open", () => {
    // Excluding staff changed this answer from typical_beliefs to map, which is
    // why it is worth printing rather than just the rate.
    expect(findR(buildReportSignals(reportSnap()), "Tried a locked section")?.where).toBe(
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
    expect(findR(sigs, "Paywall dwell (median)")).toBeUndefined();
    expect(findR(sigs, "Saw half before paywall")).toBeUndefined();
    expect(findR(sigs, "Reopened pricing")).toBeUndefined();
    // The report-side rows still stand on their own.
    expect(findR(sigs, "Reached the report end")).toBeDefined();
  });
});

describe("buildFrictionSection", () => {
  /**
   * Slack does not scroll a fenced block sideways on a phone — it folds it, and
   * a folded fixed-width table is unreadable in a way the desktop preview never
   * shows you. The first version of this board ran to 102 columns because all
   * three widths were taken from the data with no ceiling on the total.
   */
  it("never emits a row wider than a phone can show", () => {
    const section = buildFrictionSection(
      {
        signals: [
          ...buildSurveySignals(
            snap(
              [
                q({ question_index: 0 }),
                q({ question_index: 47, median_ms: 40_000, backs: 30 }),
                q({ question_index: 57, abandons: 40 }),
              ],
              { median_ms: 9000 }
            )
          ),
          ...buildReportSignals(reportSnap()),
        ],
        blind: [],
      },
      30
    );
    const rows = section.split("\n").filter((l) => l.startsWith("●") || l.startsWith("·"));
    expect(rows.length).toBeGreaterThan(8);
    for (const row of rows) {
      expect(row.length, `too wide for Slack on a phone:\n${row}`).toBeLessThanOrEqual(TABLE_W);
    }
  });

  it("shortens the free-text column rather than dropping a number", () => {
    // Whatever has to give, it is never the measurement.
    const section = buildFrictionSection(
      {
        signals: [
          {
            label: "A label",
            group: "Survey",
            // Deliberately longer than a bare percentage: a value short enough to
            // survive being sliced cannot prove the value is never sliced.
            value: "25.8s (2.8x)",
            n: 100,
            status: "watch",
            where: "Q58 — a question long enough that it cannot possibly fit in the row",
          },
        ],
        blind: [],
      },
      30
    );
    const row = section.split("\n").find((l) => l.startsWith("●"))!;
    expect(row.length).toBeLessThanOrEqual(TABLE_W);
    expect(row).toContain("25.8s (2.8x)");
    expect(row).toContain("…");
  });
});
