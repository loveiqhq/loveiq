import { describe, expect, it } from "vitest";
import {
  orderAskedQuestions,
  orderDemandBlockBeforeEmail,
  orderEmailLast,
  EMAIL_QID,
  OPT_IN_QID,
} from "@features/survey/ui/questionOrder";
import { surveyQuestions, type SurveyQuestion } from "@/data/survey-data";

/** Minimal SurveyQuestion stub — orderEmailLast only reads `qId`. */
function q(qId: string): SurveyQuestion {
  return { qId } as unknown as SurveyQuestion;
}

describe("orderEmailLast", () => {
  it("the generated data still asks email FIRST (the thing this function fixes)", () => {
    expect(surveyQuestions[0]!.qId).toBe(EMAIL_QID);
  });

  it("moves the email question to immediately before the opt-in", () => {
    const ordered = orderEmailLast(surveyQuestions);
    const optInIdx = ordered.findIndex((entry) => entry.qId === OPT_IN_QID);
    expect(optInIdx).toBeGreaterThan(0);
    expect(ordered[optInIdx - 1]!.qId).toBe(EMAIL_QID);
  });

  it("keeps email before the opt-in, and the full pipeline still ends on the opt-in", () => {
    // `orderEmailLast` ALONE no longer ends on the opt-in. The demand block
    // (16016-16018) was allocated qIds above 16015 because every id below it is either
    // live or retired-but-still-holding-answers, and `data/survey-data.ts` is generated
    // in qId order — so the block sorts after the opt-in. `orderDemandBlockBeforeEmail`
    // is what restores "opt-in last", and SurveyEngine composes the two. Asserting the
    // composition here keeps the guarantee this test was written to protect.
    const ordered = orderEmailLast(surveyQuestions);
    const optInIdx = ordered.findIndex((entry) => entry.qId === OPT_IN_QID);
    expect(ordered[optInIdx - 1]!.qId).toBe(EMAIL_QID);

    const full = orderDemandBlockBeforeEmail(ordered);
    expect(full[full.length - 1]!.qId).toBe(OPT_IN_QID);
  });

  it("preserves length, keeps email exactly once, and never leaves it first", () => {
    const ordered = orderEmailLast(surveyQuestions);
    expect(ordered.length).toBe(surveyQuestions.length);
    expect(ordered.filter((entry) => entry.qId === EMAIL_QID)).toHaveLength(1);
    expect(ordered[0]!.qId).not.toBe(EMAIL_QID);
  });

  it("preserves the relative order of every non-email question", () => {
    const withoutEmail = (qs: SurveyQuestion[]) =>
      qs.filter((entry) => entry.qId !== EMAIL_QID).map((entry) => entry.qId);
    expect(withoutEmail(orderEmailLast(surveyQuestions))).toEqual(withoutEmail(surveyQuestions));
  });

  it("never drops or duplicates a question", () => {
    expect(
      orderEmailLast(surveyQuestions)
        .map((entry) => entry.qId)
        .sort()
    ).toEqual([...surveyQuestions].map((entry) => entry.qId).sort());
  });

  it("falls back to appending email at the end when the opt-in is absent", () => {
    const input = [q(EMAIL_QID), q("00001"), q("00002")];
    expect(orderEmailLast(input).map((entry) => entry.qId)).toEqual(["00001", "00002", EMAIL_QID]);
  });

  it("returns the input unchanged when there is no email question to move", () => {
    const input = [q("00001"), q(OPT_IN_QID)];
    expect(orderEmailLast(input)).toBe(input);
  });
});

/**
 * The composer SurveyEngine and the end-to-end walks both call. Asserted on the exported
 * function rather than on a hand-written composition, because hand-written compositions
 * are the defect: two E2E specs rebuilt the asked order from `orderEmailLast` alone and
 * silently stopped matching what the engine renders when the demand block landed. E2E is
 * not a CI gate, so nothing caught it — these run in CI and do.
 */
describe("orderAskedQuestions", () => {
  const asked = orderAskedQuestions(surveyQuestions);

  it("ends on the marketing opt-in, with email immediately before it", () => {
    expect(asked[asked.length - 1]!.qId).toBe(OPT_IN_QID);
    expect(asked[asked.length - 2]!.qId).toBe(EMAIL_QID);
  });

  it("asks the demand block immediately before email, in its authored order", () => {
    // Written out rather than read from DEMAND_BLOCK_QIDS. Reading the constant makes the
    // assertion a tautology — reorder it and both sides move together and this still
    // passes (verified: that mutation survived until these ids were inlined). The
    // authored order IS the requirement, because C10 ("what you just picked") refers back
    // to C9, so it belongs in the test.
    const emailIdx = asked.findIndex((entry) => entry.qId === EMAIL_QID);
    expect(asked.slice(emailIdx - 3, emailIdx).map((e) => e.qId)).toEqual([
      "16016",
      "16017",
      "16018",
    ]);
  });

  it("applies EVERY stage — not a subset", () => {
    // The failure mode is a caller (or a future edit) applying only some of the pipeline.
    // Each stage below moves at least one question, so a composer missing any one of them
    // produces a different array than the full composition.
    expect(asked.map((e) => e.qId)).toEqual(
      orderDemandBlockBeforeEmail(orderEmailLast(surveyQuestions)).map((e) => e.qId)
    );
    expect(asked.map((e) => e.qId)).not.toEqual(orderEmailLast(surveyQuestions).map((e) => e.qId));
    expect(asked.map((e) => e.qId)).not.toEqual(surveyQuestions.map((e) => e.qId));
  });

  it("is a strict permutation of the generated set", () => {
    expect([...asked.map((e) => e.qId)].sort()).toEqual(
      [...surveyQuestions.map((e) => e.qId)].sort()
    );
    expect(new Set(asked.map((e) => e.qId)).size).toBe(surveyQuestions.length);
  });
});
