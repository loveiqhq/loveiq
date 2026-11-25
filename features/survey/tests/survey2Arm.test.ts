import { describe, expect, it, vi } from "vitest";

/**
 * Survey 2.0 (Mark's Survey Review, 19 Nov 2026) is a third order arm next to C13's two. A run
 * gets it once, when it starts in the Survey 2.0 test's variant half (half of the runs, by session
 * id) with the `survey_2` switch on, and keeps it; a run that began in a
 * classic order keeps that order whatever the switch says, because a draft resumes at its saved
 * position and a different list under that position skips or repeats questions.
 */
const env = vi.hoisted(() => ({ nonProd: false }));
vi.mock("@shared/env/is-non-prod-deploy", () => ({ isNonProdDeploy: () => env.nonProd }));

import {
  assignQuestionOrderArm,
  assignSurvey2TestArm,
  freshQuestionOrderArm,
  isQuestionOrderArm,
  QUESTION_ORDER_TEST_END,
  QUESTION_ORDER_WINNER,
  questionOrderArmAt,
  questionOrderArmOfSubmission,
  resolveDraftQuestionOrderArm,
  resolveQuestionOrderOverride,
  SURVEY_2_ARM,
  SURVEY_2_ONLY_QIDS,
  survey2TestOrder,
} from "@shared/experiments/questionOrderArm";

const fresh = { currentIndex: 0, answers: {}, prefilled: [] as string[] };
const AFTER_END = Date.parse(QUESTION_ORDER_TEST_END) + 60_000;

describe("the survey2 arm", () => {
  it("is a recognised arm", () => {
    expect(SURVEY_2_ARM).toBe("survey2");
    expect(isQuestionOrderArm("survey2")).toBe(true);
  });

  it("gives a fresh run survey2 when the switch is on", () => {
    expect(resolveDraftQuestionOrderArm(fresh, SURVEY_2_ARM)).toBe("survey2");
  });

  it("still gives a fresh run the C13 winner when the switch is off", () => {
    expect(resolveDraftQuestionOrderArm(fresh)).toBe(QUESTION_ORDER_WINNER);
  });

  it("counts a landing card's answer alone as a fresh run", () => {
    const landingOnly = { currentIndex: 0, answers: { "01002": 5 }, prefilled: ["01002"] };
    expect(resolveDraftQuestionOrderArm(landingOnly, SURVEY_2_ARM)).toBe("survey2");
  });

  it("keeps a recorded classic arm when the switch is on", () => {
    const midway = { currentIndex: 40, answers: { "00001": "Sam" }, prefilled: [] as string[] };
    expect(resolveDraftQuestionOrderArm({ ...midway, orderArm: "variant" }, SURVEY_2_ARM)).toBe(
      "variant"
    );
    expect(resolveDraftQuestionOrderArm({ ...midway, orderArm: "control" }, SURVEY_2_ARM)).toBe(
      "control"
    );
  });

  it("a run with progress and no arm stays control", () => {
    const old = { currentIndex: 12, answers: { "10003": 4 }, prefilled: [] as string[] };
    expect(resolveDraftQuestionOrderArm(old, SURVEY_2_ARM)).toBe("control");
  });

  it("keeps a recorded survey2 run on survey2 after the switch goes off", () => {
    expect(resolveDraftQuestionOrderArm({ ...fresh, currentIndex: 3, orderArm: "survey2" })).toBe(
      "survey2"
    );
  });
});

// Mark, sync of 25 Nov 2026: Survey 2.0 is a new test stacked on the question order test, its
// control that test's winner (the new order) and its variant Survey 2.0.
describe("the Survey 2.0 test, while the switch is on", () => {
  const ids = Array.from({ length: 4000 }, (_, i) => `session-${i}-${(i * 2654435761) >>> 0}`);

  it("deals half of the sessions Survey 2.0 and half the new order", () => {
    const variant = ids.filter((id) => assignSurvey2TestArm(id) === "variant").length;
    expect(variant / ids.length).toBeGreaterThan(0.46);
    expect(variant / ids.length).toBeLessThan(0.54);
    for (const id of ids.slice(0, 200))
      expect(survey2TestOrder(id)).toBe(
        assignSurvey2TestArm(id) === "variant" ? SURVEY_2_ARM : QUESTION_ORDER_WINNER
      );
  });

  it("keeps a session's half: the same id, the same half", () => {
    for (const id of ids.slice(0, 50))
      expect(assignSurvey2TestArm(id)).toBe(assignSurvey2TestArm(id));
  });

  it("splits independently of the question order test's halves", () => {
    const same = ids.filter(
      (id) =>
        (assignSurvey2TestArm(id) === "variant") === (assignQuestionOrderArm(id) === "variant")
    ).length;
    expect(same / ids.length).toBeGreaterThan(0.45);
    expect(same / ids.length).toBeLessThan(0.55);
  });

  it("puts a run with no session id (storage blocked) in the control half", () => {
    expect(assignSurvey2TestArm("")).toBe("control");
    expect(assignSurvey2TestArm(null)).toBe("control");
    expect(survey2TestOrder(undefined)).toBe(QUESTION_ORDER_WINNER);
  });

  it("deals nobody a half with the switch off: every fresh run is asked the new order", () => {
    for (const id of ids.slice(0, 200))
      expect(freshQuestionOrderArm("off", id)).toBe(QUESTION_ORDER_WINNER);
    expect(freshQuestionOrderArm("test", "00000000-0000-4000-8000-000000000001")).toBe(
      SURVEY_2_ARM
    );
    expect(freshQuestionOrderArm("test", "00000000-0000-4000-8000-000000000000")).toBe(
      QUESTION_ORDER_WINNER
    );
  });

  // A `?order=survey2` preview (staging, the e2e server) is always 2.0, whatever the half.
  it("gives a forced preview Survey 2.0 in both halves", () => {
    expect(freshQuestionOrderArm("forced", "00000000-0000-4000-8000-000000000000")).toBe(
      SURVEY_2_ARM
    );
    expect(freshQuestionOrderArm("forced", "")).toBe(SURVEY_2_ARM);
  });

  it("decides only a fresh run: a draft keeps the order it began in", () => {
    const started = { currentIndex: 4, answers: { "10003": 3 }, prefilled: [] as string[] };
    const control = freshQuestionOrderArm("test", "00000000-0000-4000-8000-000000000000");
    expect(resolveDraftQuestionOrderArm({ ...started, orderArm: "survey2" }, control)).toBe(
      "survey2"
    );
    expect(resolveDraftQuestionOrderArm({ ...fresh, orderArm: "variant" }, SURVEY_2_ARM)).toBe(
      "variant"
    );
  });
});

describe("the server's stamp of a submitted run", () => {
  it("stamps survey2 from the answers", () => {
    for (const qId of SURVEY_2_ONLY_QIDS) {
      expect(questionOrderArmOfSubmission("s-1", AFTER_END, ["10003", qId])).toBe("survey2");
    }
  });

  it("stamps a classic run as before", () => {
    expect(questionOrderArmOfSubmission("s-1", AFTER_END, ["00001", "16009", "16015"])).toBe(
      questionOrderArmAt("s-1", AFTER_END)
    );
  });
});

describe("the ?order=survey2 preview", () => {
  it("works on dev, previews and staging", () => {
    env.nonProd = true;
    expect(resolveQuestionOrderOverride("survey2")).toBe("survey2");
  });

  it("is ignored in production", () => {
    env.nonProd = false;
    expect(resolveQuestionOrderOverride("survey2")).toBeNull();
  });
});
