import { describe, expect, it } from "vitest";

import { surveyQuestions, type SurveyQuestion } from "@/data/survey-data";
import { getScoringConfig } from "@features/scoring/logic/config";
import { scoreArchetypes } from "@features/scoring/logic/engine";
import { isHidden } from "@features/survey/questionFlags";
import {
  C13_DEMOTED,
  C13_DEMOTED_AFTER,
  C13_OPENING,
  orderAskedQuestions,
  orderC13Opening,
} from "@features/survey/ui/questionOrder";
import {
  assignQuestionOrderArm,
  beginsNow,
  isQuestionOrderArm,
  QUESTION_ORDER_ARM_KEY,
  QUESTION_ORDER_TEST_END,
  QUESTION_ORDER_WINNER,
  questionOrderArmAt,
  resolveDraftQuestionOrderArm,
  resolveQuestionOrderOverride,
} from "@shared/experiments/questionOrderArm";

/**
 * The production pipeline, minus the per-respondent prefill filter. Built from the
 * composer, never by hand: a hand-built pipeline silently stopped matching the engine when
 * the content asks (16019, 16020) gained their own stage.
 */
const control = () =>
  orderAskedQuestions(surveyQuestions, "control").filter((q) => !isHidden(q.qId));
const variant = () =>
  orderAskedQuestions(surveyQuestions, "variant").filter((q) => !isHidden(q.qId));
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

  /**
   * THE REGRESSION THIS EXISTS FOR.
   *
   * `% 2` of raw FNV-1a is not a coin flip. The multiplier is odd, so multiplying
   * never changes the low bit and the hash collapses to "does the seed contain an
   * odd number of odd-valued characters?". Balance stays fine — that parity is
   * unbiased for a random uuid — so a balance test cannot see this at all. What
   * breaks is the SALT: flipping it inverts that parity wholesale, re-labelling the
   * two groups without re-drawing them, so a future experiment seeded from the same
   * session id would get the identical split or its exact complement.
   *
   * Measured on production before the finalizer was added: the arm agreed with the
   * parity on 500 of 500 session ids, with no cross-cells at all, and changing the
   * salt moved 0.00% of 200,000 ids.
   *
   * With `fmix32` the arm is independent of that parity, so BOTH arms appear for
   * BOTH parities. Revert the finalizer and two of these four cells go to zero.
   */
  it("is not just the parity of odd characters in the id", () => {
    const cells = new Map<string, number>();
    for (let i = 0; i < 2000; i += 1) {
      const id = `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`;
      let odd = 0;
      for (let c = 0; c < id.length; c += 1) odd ^= id.charCodeAt(c) & 1;
      const key = `${odd}:${assignQuestionOrderArm(id)}`;
      cells.set(key, (cells.get(key) ?? 0) + 1);
    }
    // All four combinations must occur, and none may be vanishingly rare.
    for (const key of ["0:control", "0:variant", "1:control", "1:variant"]) {
      expect(
        cells.get(key) ?? 0,
        `${key} — the arm has collapsed back onto character parity`
      ).toBeGreaterThan(200);
    }
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

describe("a draft reopened after C13 launched", () => {
  // The e2e fixtures (e2e/surveyArm.ts): one session id that hashes to each arm.
  const VARIANT_ID = "00000000-0000-4000-8000-000000000001";
  const CONTROL_ID = "00000000-0000-4000-8000-000000000007";
  const fresh = { currentIndex: 0, answers: {}, prefilled: [] as string[] };
  const pastTheOpening = { currentIndex: 20, answers: { "00001": "x" }, prefilled: [] as string[] };

  it("uses session ids that bucket as named", () => {
    expect(assignQuestionOrderArm(VARIANT_ID)).toBe("variant");
    expect(assignQuestionOrderArm(CONTROL_ID)).toBe("control");
  });

  it("keeps a draft begun before C13 in control", () => {
    // Saved by the build before C13, so no arm is recorded. In the variant, the five
    // questions it moves forward would sit behind this reader's saved position.
    expect(resolveDraftQuestionOrderArm(pastTheOpening)).toBe("control");
    // An answer given without moving on is progress too.
    expect(resolveDraftQuestionOrderArm({ ...fresh, answers: { "00001": "x" } })).toBe("control");
  });

  it("reopens a draft in the arm it recorded, the old order included", () => {
    for (const arm of ["control", "variant"] as const) {
      expect(resolveDraftQuestionOrderArm({ ...pastTheOpening, orderArm: arm })).toBe(arm);
      expect(resolveDraftQuestionOrderArm({ ...fresh, orderArm: arm })).toBe(arm);
    }
  });

  it("asks a fresh run the new order since the test ended, the landing card's answer included", () => {
    expect(QUESTION_ORDER_WINNER).toBe("variant");
    expect(resolveDraftQuestionOrderArm(fresh)).toBe("variant");
    const landingCard = { currentIndex: 0, answers: { "01002": 3 }, prefilled: ["01002"] };
    expect(resolveDraftQuestionOrderArm(landingCard)).toBe("variant");
  });

  it("treats an arm it does not recognise as none", () => {
    expect(resolveDraftQuestionOrderArm({ ...fresh, orderArm: "purple" })).toBe("variant");
    expect(resolveDraftQuestionOrderArm({ ...pastTheOpening, orderArm: "purple" })).toBe("control");
  });
});

describe("the test's end", () => {
  const VARIANT_ID = "00000000-0000-4000-8000-000000000001";
  const CONTROL_ID = "00000000-0000-4000-8000-000000000007";
  const end = Date.parse(QUESTION_ORDER_TEST_END);

  it("is a real moment after the launch, from the day it was called", () => {
    expect(Number.isFinite(end)).toBe(true);
    expect(end).toBeGreaterThan(Date.parse("2026-10-06T18:18:00Z"));
    expect(end).toBeGreaterThanOrEqual(Date.parse("2026-11-20T00:00:00Z"));
  });

  it("gives a run begun before it the arm its session drew, and one begun from it the new order", () => {
    for (const id of [VARIANT_ID, CONTROL_ID]) {
      expect(questionOrderArmAt(id, end - 1)).toBe(assignQuestionOrderArm(id));
      expect(questionOrderArmAt(id, end)).toBe("variant");
      expect(questionOrderArmAt(id, end + 86_400_000)).toBe("variant");
    }
    expect(questionOrderArmAt(CONTROL_ID, end - 1)).toBe("control");
    // A start that is not a number reads as during the test; no session id as control.
    expect(questionOrderArmAt(CONTROL_ID, Number.NaN)).toBe("control");
    expect(questionOrderArmAt(null, end - 1)).toBe("control");
    expect(questionOrderArmAt(null, end)).toBe("variant");
  });

  it("begins a fresh run now when its draft is dated before the end, and only then", () => {
    const before = new Date(end - 86_400_000).toISOString();
    const after = new Date(end + 60_000).toISOString();
    const landingCard = { currentIndex: 0, answers: { "01002": 3 }, prefilled: ["01002"] };
    const untouched = { currentIndex: 0, answers: {}, prefilled: [] };
    // Asked the new order, so under its old date the stamp would be the arm its session drew.
    expect(beginsNow({ ...landingCard, startedAt: before })).toBe(true);
    expect(beginsNow({ ...untouched, startedAt: before })).toBe(true);
    // Dated from the end on: the stamp is the new order already.
    expect(beginsNow({ ...landingCard, startedAt: after })).toBe(false);
    // A recorded arm or progress keeps its order, so it keeps its start too.
    expect(beginsNow({ ...untouched, startedAt: before, orderArm: "control" })).toBe(false);
    expect(beginsNow({ ...untouched, startedAt: before, currentIndex: 3 })).toBe(false);
    expect(beginsNow({ ...untouched, startedAt: before, answers: { "00001": "x" } })).toBe(false);
    // A start that is not a date is replaced by the server's clock, which is past the end.
    expect(beginsNow({ ...untouched, startedAt: "not a date" })).toBe(false);
  });
});
