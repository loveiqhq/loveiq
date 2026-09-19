import { describe, expect, it } from "vitest";

import { makeSurveyQuestion } from "@/__tests__/__fixtures__/survey";
import { surveyQuestions } from "@/data/survey-data";
import { RANDOMISE_QIDS } from "@features/survey/questionFlags";
import { orderedOptions } from "@features/survey/ui/questionOrder";

const SESSION = "3f2b1c7a-9d4e-4f10-8b52-1a2c3d4e5f60";
const TEN = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"];

/** A question that opts into randomisation, with `count` distinct options. */
function randomised(count = TEN.length, qId = "16001") {
  return makeSurveyQuestion({ qId, answerType: "multiple", options: TEN.slice(0, count) });
}

describe("orderedOptions", () => {
  it("every randomised qId actually exists in the survey", () => {
    // Guards the flag list against drift: a typo'd or deleted qId would silently
    // randomise nothing, and nothing else would fail.
    const known = new Set(surveyQuestions.map((q) => q.qId));
    for (const qId of RANDOMISE_QIDS) expect(known).toContain(qId);
  });

  it("leaves a non-randomised question in authored order", () => {
    const q = makeSurveyQuestion({ qId: "00000", options: TEN });
    expect(orderedOptions(q, SESSION)).toEqual(TEN);
  });

  it("returns a true permutation — same members, same length, no duplicates", () => {
    const out = orderedOptions(randomised(), SESSION);
    expect(out).toHaveLength(TEN.length);
    expect([...out].sort()).toEqual([...TEN].sort());
    expect(new Set(out).size).toBe(TEN.length);
  });

  it("is stable for the same session and question", () => {
    // The property that matters in the browser: re-render, going back, and reload must
    // not reshuffle, or the recorded order would not be what the user saw.
    const first = orderedOptions(randomised(), SESSION);
    for (let i = 0; i < 5; i += 1) {
      expect(orderedOptions(randomised(), SESSION)).toEqual(first);
    }
  });

  it("actually reorders — it is not an expensive identity function", () => {
    const sessions = Array.from({ length: 25 }, (_, i) => `session-${i}`);
    const differs = sessions.filter((s) => !arraysEqual(orderedOptions(randomised(), s), TEN));
    // With 10 options a permutation matches authored order 1 in 3.6M times, so across
    // 25 sessions "most differ" is a safe assertion rather than a flaky one.
    expect(differs.length).toBeGreaterThanOrEqual(24);
  });

  it("gives different sessions different orders", () => {
    const a = orderedOptions(randomised(), "session-a");
    const b = orderedOptions(randomised(), "session-b");
    expect(a).not.toEqual(b);
  });

  it("gives different questions different orders within one session", () => {
    // Without mixing the qId into the seed, every equal-length question in a session
    // would share one permutation — a correlated position effect across questions.
    const a = orderedOptions(randomised(TEN.length, "16001"), SESSION);
    const b = orderedOptions(randomised(TEN.length, "16011"), SESSION);
    expect(a).not.toEqual(b);
  });

  it("does NOT shuffle without a session id — shuffled iff recorded", () => {
    // Storage blocked (Safari private mode, some in-app WebViews): getSessionId returns
    // "" and the submit path records no order, so showing a shuffled one would produce
    // an answer that looks comparable to authored-order answers and is not.
    expect(orderedOptions(randomised(), "")).toEqual(TEN);
  });

  it("handles degenerate option lists without throwing", () => {
    expect(orderedOptions(makeSurveyQuestion({ qId: "16001", options: [] }), SESSION)).toEqual([]);
    expect(
      orderedOptions(makeSurveyQuestion({ qId: "16001", options: ["only"] }), SESSION)
    ).toEqual(["only"]);
  });

  it("does not mutate the question's own options array", () => {
    const q = randomised();
    const before = [...q.options];
    orderedOptions(q, SESSION);
    expect(q.options).toEqual(before);
  });
});

function arraysEqual(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}
