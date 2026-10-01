import { describe, expect, it } from "vitest";

import { makeSurveyQuestion } from "@/__tests__/__fixtures__/survey";
import { surveyQuestions } from "@/data/survey-data";
import { optionGroupsFor } from "@features/survey/optionGroups";
import { RANDOMISE_QIDS } from "@features/survey/questionFlags";
import { orderedOptionGroups, orderedOptions } from "@features/survey/ui/questionOrder";

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

  it("keeps the flat shuffle exactly as it was before grouping existed", () => {
    // Characterisation, captured from the implementation before C9 was grouped. A
    // respondent mid-survey when this deploys must see the same order after a reload,
    // and their recorded order must still be the one they saw.
    expect(orderedOptions(randomised(), SESSION)).toEqual([
      "f",
      "h",
      "a",
      "d",
      "c",
      "g",
      "j",
      "e",
      "i",
      "b",
    ]);
    expect(
      orderedOptions(
        surveyQuestions.find((q) => q.qId === "16014")!,
        "session-fixed-1"
      )
    ).toEqual([
      "Nothing major is in the way right now",
      "Useful support feels too expensive or hard to access",
      "The person I'm with isn't on the same page or willing to engage",
      "Something else",
      "I struggle to keep going with things over time",
      "I don't have enough time or energy",
      "Physical pain or body issues",
      "Shame, self-judgment, or inner pressure",
      "It doesn't feel emotionally safe enough yet",
      "I'm not sure what would actually help",
    ]);
  });
});

describe("orderedOptionGroups (C9, 16016)", () => {
  const c9 = surveyQuestions.find((q) => q.qId === "16016")!;
  const authored = optionGroupsFor(c9)!;
  const sessions = Array.from({ length: 25 }, (_, i) => `session-${i}`);

  it("returns nothing for a question without categories", () => {
    expect(orderedOptionGroups(randomised(), SESSION)).toBe(undefined);
  });

  it("keeps categories and topics in authored order without a session id", () => {
    // Shuffled iff recorded: with storage blocked nothing records the order, so nothing
    // may shuffle it either.
    expect(orderedOptionGroups(c9, "")).toEqual(
      authored.map((g) => ({ label: g.label, options: [...g.options] }))
    );
  });

  it("shuffles the category order, and each category's topics, as true permutations", () => {
    const out = orderedOptionGroups(c9, SESSION)!;
    expect(out.map((g) => g.label).sort()).toEqual(authored.map((g) => g.label).sort());
    for (const group of out) {
      const original = authored.find((g) => g.label === group.label)!;
      expect([...group.options].sort(), group.label).toEqual([...original.options].sort());
    }
  });

  it("is stable for the same session", () => {
    const first = orderedOptionGroups(c9, SESSION);
    for (let i = 0; i < 5; i += 1) expect(orderedOptionGroups(c9, SESSION)).toEqual(first);
  });

  it("actually reorders the categories across sessions", () => {
    const labels = authored.map((g) => g.label);
    const differs = sessions.filter(
      (s) =>
        !arraysEqual(
          orderedOptionGroups(c9, s)!.map((g) => g.label),
          labels
        )
    );
    // 13! orders: matching the authored one even once in 25 sessions is vanishingly rare.
    expect(differs.length).toBeGreaterThanOrEqual(24);
  });

  it("shuffles each category's topics with its own stream", () => {
    // Mood & Energy and Trauma & Stress both hold four topics. With one shared seed they
    // would always move in lockstep, a correlated position effect across categories.
    const pattern = (session: string, label: string) => {
      const original = authored.find((g) => g.label === label)!.options;
      return orderedOptionGroups(c9, session)!
        .find((g) => g.label === label)!
        .options.map((option) => original.indexOf(option))
        .join(",");
    };
    const lockstep = sessions.filter(
      (s) => pattern(s, "Mood & Energy") === pattern(s, "Trauma & Stress")
    );
    expect(lockstep.length).toBeLessThan(sessions.length);
  });

  it("records exactly what the categories show: orderedOptions is their flattened order", () => {
    // `buildOptionOrder` recomputes `orderedOptions` at submit and stores it as
    // `survey_submission.option_order`. If the grouped view derived its order any other
    // way, the stored order would stop being the one the respondent saw.
    for (const session of [...sessions, ""]) {
      expect(orderedOptions(c9, session), session).toEqual(
        orderedOptionGroups(c9, session)!.flatMap((g) => g.options)
      );
    }
  });

  it("still records all 53 topics, inside the API's 60-per-question cap", () => {
    const recorded = orderedOptions(c9, SESSION);
    expect(recorded).toHaveLength(53);
    expect(new Set(recorded).size).toBe(53);
  });
});

function arraysEqual(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}
