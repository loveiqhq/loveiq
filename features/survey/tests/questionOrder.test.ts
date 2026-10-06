import { describe, expect, it } from "vitest";
import {
  orderAskedQuestions,
  orderC13Opening,
  orderContentAsksBeforeDemandBlock,
  orderDemandBlockBeforeEmail,
  orderEmailLast,
  C13_OPENING,
  CONTENT_ASK_QIDS,
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

    // The content asks (16019, 16020) sort after the opt-in too, so only the whole
    // composer restores "opt-in last". Asserted on the composer, not rebuilt by hand.
    const full = orderAskedQuestions(surveyQuestions, "control");
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

describe("orderContentAsksBeforeDemandBlock", () => {
  const ids = (qs: SurveyQuestion[]) => qs.map((entry) => entry.qId);

  it("asks Mark's two content questions, in order, immediately before C9", () => {
    const input = [
      q("16014"),
      q("16016"),
      q("16017"),
      q("16018"),
      q(EMAIL_QID),
      q(OPT_IN_QID),
      q("16019"),
      q("16020"),
    ];
    expect(ids(orderContentAsksBeforeDemandBlock(input))).toEqual([
      "16014",
      "16019",
      "16020",
      "16016",
      "16017",
      "16018",
      EMAIL_QID,
      OPT_IN_QID,
    ]);
  });

  it("the two ids are the ones the survey data allocates", () => {
    // Written out, not read back from the constant: reordering the constant must fail here.
    expect([...CONTENT_ASK_QIDS]).toEqual(["16019", "16020"]);
  });

  it("falls back to sitting before email when the demand block is absent", () => {
    const input = [q("16014"), q(EMAIL_QID), q(OPT_IN_QID), q("16019"), q("16020")];
    expect(ids(orderContentAsksBeforeDemandBlock(input))).toEqual([
      "16014",
      "16019",
      "16020",
      EMAIL_QID,
      OPT_IN_QID,
    ]);
  });

  it("falls back to sitting before the opt-in when email was prefilled away too", () => {
    const input = [q("16014"), q(OPT_IN_QID), q("16019"), q("16020")];
    expect(ids(orderContentAsksBeforeDemandBlock(input))).toEqual([
      "16014",
      "16019",
      "16020",
      OPT_IN_QID,
    ]);
  });

  it("returns the input untouched when neither question is present", () => {
    const input = [q("16014"), q("16016"), q(EMAIL_QID), q(OPT_IN_QID)];
    expect(orderContentAsksBeforeDemandBlock(input)).toBe(input);
  });

  it("is a permutation that keeps every other question's relative order", () => {
    const asked = orderContentAsksBeforeDemandBlock(
      orderDemandBlockBeforeEmail(orderEmailLast(surveyQuestions))
    );
    expect([...ids(asked)].sort()).toEqual([...ids(surveyQuestions)].sort());
    const others = (qs: SurveyQuestion[]) =>
      ids(qs).filter((qId) => !CONTENT_ASK_QIDS.includes(qId));
    expect(others(asked)).toEqual(
      others(orderDemandBlockBeforeEmail(orderEmailLast(surveyQuestions)))
    );
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
  const asked = orderAskedQuestions(surveyQuestions, "control");

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

  it("asks Mark's two content questions immediately before C9, in both arms", () => {
    // Written out for the same reason as the block above: the placement is the
    // requirement (Fatih, 29.09: just before C9, so the sexuality questions stay together
    // and the "Beyond sex" block follows them).
    for (const arm of ["control", "variant"] as const) {
      const ids = orderAskedQuestions(surveyQuestions, arm).map((e) => e.qId);
      const c9 = ids.indexOf("16016");
      expect(ids.slice(c9 - 2, c9), arm).toEqual(["16019", "16020"]);
    }
  });

  it("applies EVERY stage — not a subset", () => {
    // The failure mode is a caller (or a future edit) applying only some of the pipeline.
    // Each stage below moves at least one question, so a composer missing any one of them
    // produces a different array than the full composition.
    const withoutContentAsks = orderDemandBlockBeforeEmail(orderEmailLast(surveyQuestions));
    expect(asked.map((e) => e.qId)).toEqual(
      orderContentAsksBeforeDemandBlock(withoutContentAsks).map((e) => e.qId)
    );
    expect(asked.map((e) => e.qId)).not.toEqual(withoutContentAsks.map((e) => e.qId));
    expect(asked.map((e) => e.qId)).not.toEqual(orderEmailLast(surveyQuestions).map((e) => e.qId));
    expect(asked.map((e) => e.qId)).not.toEqual(surveyQuestions.map((e) => e.qId));
  });

  it("applies the C13 reorder in the variant arm, and only there", () => {
    const variant = orderAskedQuestions(surveyQuestions, "variant");
    expect(variant.map((e) => e.qId)).toEqual(
      orderC13Opening(
        orderContentAsksBeforeDemandBlock(
          orderDemandBlockBeforeEmail(orderEmailLast(surveyQuestions))
        )
      ).map((e) => e.qId)
    );
    // The arms must actually differ. If they ever stop differing the experiment is a
    // no-op that still reports two arms, which is worse than no experiment.
    expect(variant.map((e) => e.qId)).not.toEqual(asked.map((e) => e.qId));
    expect(variant.slice(0, C13_OPENING.length).map((e) => e.qId)).toEqual([...C13_OPENING]);
  });

  it("keeps the demand block and the tail identical in BOTH arms", () => {
    // C13 reorders the opening only. If it ever disturbed the tail, the "last question"
    // guard in e2e/survey-last-answer.spec.ts would be testing a different question in
    // half of all sessions.
    const variant = orderAskedQuestions(surveyQuestions, "variant");
    expect(variant.slice(-5).map((e) => e.qId)).toEqual(asked.slice(-5).map((e) => e.qId));
    expect(variant[variant.length - 1]!.qId).toBe(OPT_IN_QID);
  });

  it("is a strict permutation of the generated set", () => {
    expect([...asked.map((e) => e.qId)].sort()).toEqual(
      [...surveyQuestions.map((e) => e.qId)].sort()
    );
    expect(new Set(asked.map((e) => e.qId)).size).toBe(surveyQuestions.length);
  });
});
