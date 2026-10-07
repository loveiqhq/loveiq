import { describe, expect, it, vi } from "vitest";

const mockSupabaseFetch = vi.fn();
vi.mock("@features/admin/server/supabase", () => ({
  supabaseFetch: (...args: unknown[]) => mockSupabaseFetch(...args),
}));

import {
  ASKED_QUESTION_COUNT,
  WATCH_LIST_MAX,
  buildFrictionReport,
  buildFrictionWatchList,
  buildReportSignals,
  buildSurveySignals,
  fetchSessionEnds,
  sessionEnds,
  surveyQuestionNames,
  worstEnds,
  type FrictionQuestion,
  type FrictionSnapshot,
  type QuestionReach,
  type ReportFrictionSnapshot,
} from "@features/admin/server/friction-metrics";
import { surveyQuestions } from "@/data/survey-data";
import { HIDDEN_QIDS, isHidden } from "@features/survey/questionFlags";
import { orderEmailLast } from "@features/survey/ui/questionOrder";

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

/** One question's reach, by its real q_id: ids no longer asked are dropped. */
const reach = (
  q_id: string,
  sessions: number,
  quits: number,
  over: Partial<QuestionReach> = {}
): QuestionReach => ({
  q_id,
  sessions,
  quits,
  went_back: 0,
  median_ms: 9000,
  timed: sessions,
  ...over,
});

/** A question's number in the survey as asked today ("Q56" for the email). */
const ASKED = orderEmailLast(surveyQuestions)
  .filter((x) => !isHidden(x.qId))
  .map((x) => x.qId);
const qn = (qId: string) => `Q${ASKED.indexOf(qId) + 1}`;

describe("buildSurveySignals", () => {
  it("names the worst drop-off question, not just the rate", () => {
    // A number with no subject is not actionable. "21%" is a statistic;
    // "Q58 — What is your email?" is a decision.
    const sigs = buildSurveySignals(
      snap([q({ question_index: 0 })], {
        by_question: [reach("00001", 100, 2), reach("00000", 100, 21)],
      }),
      new Map([["00000", "What is your email?"]])
    );
    const drop = find(sigs, "Where sessions end");
    expect(drop?.value).toBe("21%");
    expect(drop?.where).toBe(`${qn("00000")} — What is your email?`);
    expect(drop?.status).toBe("watch");
  });

  it("ignores questions too thin to carry a rate", () => {
    // 1 of 3 people leaving is 33% and means nothing. Ranking on it would put
    // a near-empty question at the top of the board every quiet week.
    const sigs = buildSurveySignals(
      snap([q({ question_index: 0 })], {
        by_question: [reach("00001", 3, 1), reach("01002", 200, 10)],
      })
    );
    expect(find(sigs, "Where sessions end")?.where).toBe(qn("01002"));
  });

  it("reports hesitation relative to a typical question, not in raw seconds", () => {
    // 26s means nothing on its own; 2.9x the typical question is the finding.
    const sigs = buildSurveySignals(
      snap([q({ question_index: 0 })], {
        median_ms: 9000,
        by_question: [reach("00001", 100, 1), reach(ASKED[47]!, 100, 1, { median_ms: 26000 })],
      })
    );
    const hes = find(sigs, "Answer hesitation");
    expect(hes?.value).toContain("2.9x");
    expect(hes?.status).toBe("watch");
    // Named as the survey asks it today, from the question's own row.
    expect(hes?.where).toBe(qn(ASKED[47]!));
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
    const sigs = buildSurveySignals(
      snap([...early, ...late], { by_question: [reach("00001", 100, 1)] })
    );

    for (const gone of [
      "Skipped questions",
      "Drop-off, late vs early",
      "Back after a long pause",
      "Engagement pace",
    ]) {
      expect(find(sigs, gone), `${gone} was removed`).toBeUndefined();
    }
    // And the rows that earn their place are still there.
    expect(find(sigs, "Where sessions end")).toBeDefined();
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

describe("buildFrictionWatchList", () => {
  /**
   * The daily message names what needs a look, in words, and counts the rest.
   * It used to print the whole scoreboard as an 11-row monospace table, most of
   * it "normal" every day. Mark, 2026-09-21: "Not easy to consume at all."
   */
  const names = new Map([
    ["00000", "What is your email?"],
    [ASKED[47]!, "Which changes would actually help?"],
  ]);
  const signals = () => [
    ...buildSurveySignals(
      snap([q({ question_index: 0 })], {
        median_ms: 9000,
        by_question: [
          reach("00001", 100, 1),
          reach(ASKED[47]!, 100, 1, { median_ms: 40_000, went_back: 30 }),
          reach("00000", 100, 40),
        ],
      }),
      names
    ),
    ...buildReportSignals(reportSnap()),
  ];

  it("lists only the signals that need a look, one plain sentence each", () => {
    const all = signals();
    const watch = all.filter((s) => s.status === "watch");
    // Enough flagged and enough quiet that both halves of the rule are exercised.
    expect(watch.length).toBeGreaterThan(1);
    expect(all.length - watch.length).toBeGreaterThan(1);

    const text = buildFrictionWatchList({ signals: all, rowsRead: 0 }, 30);
    const lines = text.split("\n");
    expect(lines[0]).toBe("*Where people get stuck*");
    const bullets = lines.filter((l) => l.startsWith("• "));
    expect(bullets).toHaveLength(Math.min(watch.length, WATCH_LIST_MAX));
    for (const s of watch.slice(0, WATCH_LIST_MAX)) expect(text).toContain(s.sentence!);
    // The quiet ones are counted, not listed.
    for (const s of all.filter((x) => x.status !== "watch")) {
      expect(text).not.toContain(s.label);
    }
    expect(text).toContain(`_The other ${all.length - watch.length} signals look normal._`);
    // Words, not a table.
    expect(text).not.toContain("```");
    expect(text).not.toContain("—");
  });

  it("names the question in words, not just its number", () => {
    const text = buildFrictionWatchList({ signals: signals(), rowsRead: 0 }, 30);
    // Of the sessions that reach the question, which is what the rate divides by.
    expect(text).toContain(
      `40% of sessions that reach ${qn("00000")} (What is your email?) end there.`
    );
    expect(text).toContain(
      `People take 40.0s on ${qn(ASKED[47]!)} (Which changes would actually help?), 4.4x the usual time.`
    );
  });

  it("says so in one line when nothing stands out", () => {
    const quiet = signals().map((s) => ({ ...s, status: "quiet" as const }));
    expect(buildFrictionWatchList({ signals: quiet, rowsRead: 0 }, 30)).toBe(
      "*Where people get stuck*\nNothing stands out in the last 30 days."
    );
  });

  it("counts what it cannot fit instead of growing into a table again", () => {
    const many = Array.from({ length: WATCH_LIST_MAX + 3 }, (_, i) => ({
      label: `Signal ${i}`,
      group: "Survey" as const,
      value: "1%",
      n: 100,
      status: "watch" as const,
      sentence: `Sentence ${i}.`,
    }));
    const text = buildFrictionWatchList({ signals: many, rowsRead: 0 }, 30);
    expect(text.split("\n").filter((l) => l.startsWith("• "))).toHaveLength(WATCH_LIST_MAX);
    // Flagged but cut are not "normal": they are counted as still needing a look.
    expect(text).toContain("_3 more need a look._");
    expect(text).not.toContain("look normal");
  });
});

describe("worstEnds", () => {
  const e = (label: string, pct: number) => ({ label, pct });
  it("is the top three by share, worst first, ties in survey order, never a zero", () => {
    expect(worstEnds([e("Q1", 5), e("Q2", 9), e("Q3", 5), e("Q4", 2), e("Q5", 9)])).toEqual([
      e("Q2", 9),
      e("Q5", 9),
      e("Q1", 5),
    ]);
    expect(worstEnds([e("Q1", 0), e("Q2", 3)])).toEqual([e("Q2", 3)]);
    expect(worstEnds([])).toEqual([]);
  });
});

describe("sessionEnds", () => {
  it("is in survey order, skips thin questions, and peaks where the sentence points", () => {
    const s = snap([q({ question_index: 0 })], {
      by_question: [
        // 22.5% exactly: any other rate for the sentence rounds to a different
        // whole number, so this cannot pass with the two computed differently.
        reach("00000", 200, 45),
        reach("00001", 100, 2),
        // 3 of 4 is 75%: a bar this tall would out-shout every real question.
        reach("01005", 4, 3),
        reach("16014", 100, 16),
      ],
    });
    const ends = sessionEnds(s);
    expect(ends.map(({ label, pct }) => ({ label, pct }))).toEqual([
      { label: qn("00001"), pct: 2 },
      { label: qn("16014"), pct: 16 },
      { label: qn("00000"), pct: 22.5 },
    ]);
    // Each bar carries its question in today's words, for naming it under the chart.
    const names = surveyQuestionNames();
    expect(ends.map((e) => e.question)).toEqual([
      names.get("00001"),
      names.get("16014"),
      names.get("00000"),
    ]);
    expect(ends.every((e) => typeof e.question === "string" && e.question.length > 0)).toBe(true);
    // The chart's tallest bar is the question the "end there" sentence names.
    const top = [...ends].sort((a, b) => b.pct - a.pct)[0]!;
    const drop = find(buildSurveySignals(s), "Where sessions end")!;
    expect(drop.where).toBe(top.label);
    expect(drop.value).toBe("23%");
    expect(drop.value).toBe(`${Math.round(top.pct)}%`);
  });

  it("numbers questions as the survey asks them today, and drops retired ones", () => {
    // As asked today (62 questions since the 5 Oct additions): the email question,
    // then the opt-in straight after it, then the optional questions that close the
    // survey. Numbers follow the survey's own order, not survey-data.ts's.
    expect(qn("16015")).toBe(`Q${ASKED.indexOf("00000") + 2}`);
    expect(ASKED.indexOf("00000")).toBeLessThan(ASKED.length - 1);
    expect(qn("16020")).toBe(`Q${ASKED.length}`);
    // 03014 was retired on 2026-09-11. People who left on it then are real, but
    // there is no question left to fix, so it is not drawn.
    const ends = sessionEnds(
      snap([q({ question_index: 0 })], {
        by_question: [reach("16015", 100, 0), reach("03014", 100, 50), reach("00001", 100, 5)],
      })
    );
    expect(ends.map((e) => e.label)).toEqual([qn("00001"), qn("16015")]);
  });
});

describe("every survey sentence names a question as it is asked today", () => {
  it("going back and answer time come from the question's own row, not its screen position", () => {
    // Position 47 held a different question for people before 2026-09-11. The
    // per-position rows here say position 47 is slow and much gone-back-from;
    // the question rows say it is the email question. The sentences must
    // follow the question.
    const s = snap([q({ question_index: 47, median_ms: 90_000, backs: 60, visits: 100 })], {
      median_ms: 9000,
      by_question: [
        reach("00001", 200, 2),
        // 45 of 200 is 22.5% exactly: any other denominator rounds differently.
        reach("00000", 200, 2, { went_back: 45, median_ms: 40_000 }),
        // Retired on 2026-09-11: never named, however slow.
        reach("03014", 200, 2, { went_back: 150, median_ms: 120_000 }),
      ],
    });
    const sigs = buildSurveySignals(s);
    expect(find(sigs, "Went back a step")?.where).toBe(qn("00000"));
    expect(find(sigs, "Went back a step")?.value).toBe("23%");
    expect(find(sigs, "Answer hesitation")?.where).toBe(qn("00000"));
    expect(find(sigs, "Time to first action")?.where).toBe(qn("00001"));
  });
});

describe("where people quit counts people who left for good", () => {
  it("never counts a tab switch by someone who came back and finished", () => {
    // 60 'abandon' EVENTS at position 1, every one from people who switched app
    // and came back. They do not feed the rate: nobody left on that question.
    const s = snap(
      [q({ question_index: 0, abandons: 5 }), q({ question_index: 1, abandons: 60 })],
      {
        by_question: [reach("00001", 100, 5), reach("01002", 100, 0)],
      }
    );
    expect(sessionEnds(s).map(({ label, pct }) => ({ label, pct }))).toEqual([
      { label: qn("00001"), pct: 5 },
      { label: qn("01002"), pct: 0 },
    ]);
    expect(find(buildSurveySignals(s), "Where sessions end")?.where).toBe(qn("00001"));
  });

  it("never counts the last screen's finishers as quitting", () => {
    // The last screen: 397 people reached it, all 397 finished. The weekly chart
    // used to read the screen before the end as a 76% drop-off.
    const s = snap([q({ question_index: 0 })], {
      by_question: [reach("00000", 447, 49), reach("16015", 397, 0)],
    });
    expect(sessionEnds(s).map(({ label, pct }) => ({ label, pct }))).toEqual([
      { label: qn("00000"), pct: 11 },
      { label: qn("16015"), pct: 0 },
    ]);
  });
});

describe("buildFrictionReport", () => {
  it("hands the digest the per-question ends from the same read as the sentence", async () => {
    // Without this the chart could be dropped from production with every other
    // test green: the digest tests build their reports by hand.
    mockSupabaseFetch.mockImplementation(async (path: string) =>
      path.includes("get_survey_friction")
        ? new Response(
            JSON.stringify(
              snap([q({ question_index: 0 })], {
                by_question: [
                  reach("01002", 100, 3),
                  reach("00001", 100, 2),
                  reach("00000", 100, 19),
                ],
              })
            ),
            { status: 200 }
          )
        : new Response("{}", { status: 500 })
    );
    const report = await buildFrictionReport("2026-09-04T00:00:00Z", "2026-10-04T00:00:00Z");
    expect(report?.ends?.map(({ label, pct }) => ({ label, pct }))).toEqual([
      { label: qn("00001"), pct: 2 },
      { label: qn("01002"), pct: 3 },
      { label: qn("00000"), pct: 19 },
    ]);
    expect(find(report!.signals, "Where sessions end")?.sentence).toBe(
      `19% of sessions that reach ${qn("00000")} end there.`
    );
  });
});

describe("fetchSessionEnds", () => {
  it("gives the weekly digest the same bars as the daily one", async () => {
    // The weekly digest's tests mock this, so this is the test that sees it.
    const read = snap([q({ question_index: 0 })], {
      by_question: [reach("00001", 100, 2), reach("01002", 100, 9)],
    });
    mockSupabaseFetch.mockResolvedValue(new Response(JSON.stringify(read)));
    const ends = await fetchSessionEnds("2026-09-04T00:00:00Z", "2026-10-04T00:00:00Z");
    expect(ends).toEqual(sessionEnds(read));
    expect(ends).toHaveLength(2);
    expect(mockSupabaseFetch.mock.calls.at(-1)![0]).toContain("get_survey_friction");
  });

  it("is null, not an empty chart, when the read fails", async () => {
    mockSupabaseFetch.mockResolvedValue(new Response("{}", { status: 500 }));
    expect(await fetchSessionEnds("2026-09-04T00:00:00Z", "2026-10-04T00:00:00Z")).toBeNull();
  });
});

describe("ASKED_QUESTION_COUNT", () => {
  it("is the questions the survey asks today, not the questions in the file", () => {
    // 58 in survey-data.ts on 2026-10-04, one of them switched off (15011): 57.
    expect(ASKED_QUESTION_COUNT).toBe(surveyQuestions.length - HIDDEN_QIDS.size);
    expect(ASKED_QUESTION_COUNT).toBe(ASKED.length);
  });
});
