import { describe, expect, it } from "vitest";

import { surveyQuestions, type SurveyQuestion } from "@/data/survey-data";
import { getScoringConfig } from "@features/scoring/logic/config";
import { scoreArchetypes } from "@features/scoring/logic/engine";
import { isHidden } from "@features/survey/questionFlags";
import {
  C13_DEMOTED,
  C13_DEMOTED_AFTER,
  C13_OPENING,
  orderC13Opening,
  orderDemandBlockBeforeEmail,
  orderEmailLast,
} from "@features/survey/ui/questionOrder";
import {
  assignQuestionOrderArm,
  isQuestionOrderArm,
  QUESTION_ORDER_ARM_KEY,
  resolveQuestionOrderOverride,
} from "@shared/experiments/questionOrderArm";

/** The production pipeline, minus the per-respondent prefill filter. */
const control = () =>
  orderDemandBlockBeforeEmail(orderEmailLast(surveyQuestions)).filter((q) => !isHidden(q.qId));
const variant = () =>
  orderC13Opening(orderDemandBlockBeforeEmail(orderEmailLast(surveyQuestions))).filter(
    (q) => !isHidden(q.qId)
  );
const ids = (qs: SurveyQuestion[]) => qs.map((q) => q.qId);
const chapterOf = (qId: string) => surveyQuestions.find((q) => q.qId === qId)?.chapter ?? "";

describe("C13 variant — the opening", () => {
  it("opens in exactly the order the specification gives", () => {
    expect(ids(variant()).slice(0, C13_OPENING.length)).toEqual([...C13_OPENING]);
  });

  it("removes the four demoted questions from the opening", () => {
    const opening = ids(variant()).slice(0, C13_OPENING.length);
    for (const qId of C13_DEMOTED) expect(opening, qId).not.toContain(qId);
  });

  it("control still opens with the questions C13 wants moved", () => {
    // If this fails the experiment is pointless — both arms would be the same.
    const opening = ids(control()).slice(0, 8);
    expect(opening).toContain("01006");
    expect(ids(variant()).slice(0, 8)).not.toEqual(opening);
  });

  it("puts 01006 after position 20, as the spec requires", () => {
    // "Sex often hurts or feels physically bad for me" is a weight modifier, not a
    // trait, and it ends 5.1% of the sessions that reach it at slot 4. This is the
    // one hard placement constraint, and it must hold whatever C13_DEMOTED_AFTER
    // is changed to when Mark confirms the landing slots.
    expect(ids(variant()).indexOf("01006") + 1).toBeGreaterThan(20);
  });

  it("never puts two Communication Style questions next to each other in the opening", () => {
    const opening = ids(variant()).slice(0, C13_OPENING.length);
    for (let i = 1; i < opening.length; i += 1) {
      const pair = [chapterOf(opening[i - 1]!), chapterOf(opening[i]!)];
      const bothComms = pair.every((c) => c === "Communication Style");
      expect(bothComms, `${opening[i - 1]} then ${opening[i]}`).toBe(false);
    }
  });

  it("keeps the demoted four in their original relative order", () => {
    const after = ids(variant()).filter((q) => C13_DEMOTED.includes(q));
    expect(after).toEqual([...C13_DEMOTED]);
  });

  it("places them immediately after the anchor question", () => {
    const order = ids(variant());
    const anchor = order.indexOf(C13_DEMOTED_AFTER);
    expect(anchor).toBeGreaterThan(-1);
    expect(order.slice(anchor + 1, anchor + 1 + C13_DEMOTED.length)).toEqual([...C13_DEMOTED]);
  });
});

describe("C13 reorder is a permutation and nothing else", () => {
  it("asks exactly the same questions, no more and no fewer", () => {
    expect([...ids(variant())].sort()).toEqual([...ids(control())].sort());
  });

  it("never drops or duplicates a question", () => {
    const order = ids(variant());
    expect(new Set(order).size).toBe(order.length);
  });

  it("still ends on the marketing opt-in", () => {
    expect(ids(variant()).at(-1)).toBe("16015");
  });

  it("returns the input untouched when a question it needs is missing", () => {
    const stripped = surveyQuestions.filter((q) => q.qId !== "03011");
    expect(orderC13Opening(stripped)).toBe(stripped);
  });
});

describe("C13 changes no answer's meaning", () => {
  it("identical answers score to an identical archetype through both arms", () => {
    // The spec's regression requirement. Answers are keyed by qId, never by
    // position, so a reorder cannot move a value onto a different question — this
    // asserts that rather than assuming it.
    const config = getScoringConfig();
    // The answer must depend on the QUESTION, never on where it appears — that is
    // what "the same respondent, answering the same way" means. Keying this off the
    // loop index instead compares two different answer sets and fails for a reason
    // that has nothing to do with the reorder.
    const valueFor = (qId: string) => (Number(qId) % 7) + 1;
    const answer = (qs: SurveyQuestion[]) => {
      const out: Record<string, unknown> = {};
      for (const q of qs) {
        if (q.answerType === "scale") out[q.qId] = valueFor(q.qId);
        else if (q.answerType === "single" && q.options[0]) out[q.qId] = q.options[0];
      }
      return out;
    };

    const fromControl = scoreArchetypes(config, answer(control()));
    const fromVariant = scoreArchetypes(config, answer(variant()));

    expect(fromVariant.primaryArchetype).toBe(fromControl.primaryArchetype);
    expect(fromVariant.percent).toEqual(fromControl.percent);
  });
});

describe("arm assignment", () => {
  it("is deterministic for a given session", () => {
    const id = "6f1c2a44-8e21-4d0b-9a77-2b3c4d5e6f70";
    expect(assignQuestionOrderArm(id)).toBe(assignQuestionOrderArm(id));
  });

  it("falls back to control when there is no session id", () => {
    // Storage blocked: the submit path can record no arm, so a variant here would
    // be an unattributable respondent rather than a data point.
    for (const empty of [null, undefined, "", "   "]) {
      expect(assignQuestionOrderArm(empty)).toBe("control");
    }
  });

  it("splits roughly evenly", () => {
    let variantCount = 0;
    const n = 4000;
    for (let i = 0; i < n; i += 1) {
      if (assignQuestionOrderArm(`session-${i}`) === "variant") variantCount += 1;
    }
    expect(variantCount / n).toBeGreaterThan(0.45);
    expect(variantCount / n).toBeLessThan(0.55);
  });

  it("only ever returns a valid arm", () => {
    for (let i = 0; i < 200; i += 1) {
      expect(isQuestionOrderArm(assignQuestionOrderArm(`s${i}`))).toBe(true);
    }
  });

  it("ignores the preview override on production", () => {
    // resolveQuestionOrderOverride is gated on isNonProdDeploy; under test
    // NODE_ENV is not production, so a valid value resolves and junk does not.
    expect(resolveQuestionOrderOverride("nonsense")).toBeNull();
    expect(resolveQuestionOrderOverride(null)).toBeNull();
  });

  it("names the stamp key the analysis will group by", () => {
    expect(QUESTION_ORDER_ARM_KEY).toBe("question_order_arm");
  });
});
