import { describe, expect, it, vi } from "vitest";

/**
 * Survey 2.0 (Mark's Survey Review, 19 Nov 2026) is a third order arm next to C13's two. A run
 * gets it once, when it starts with the `survey_2` switch on, and keeps it; a run that began in a
 * classic order keeps that order whatever the switch says, because a draft resumes at its saved
 * position and a different list under that position skips or repeats questions.
 */
const env = vi.hoisted(() => ({ nonProd: false }));
vi.mock("@shared/env/is-non-prod-deploy", () => ({ isNonProdDeploy: () => env.nonProd }));

import {
  isQuestionOrderArm,
  QUESTION_ORDER_TEST_END,
  QUESTION_ORDER_WINNER,
  questionOrderArmAt,
  questionOrderArmOfSubmission,
  resolveDraftQuestionOrderArm,
  resolveQuestionOrderOverride,
  SURVEY_2_ARM,
  SURVEY_2_ONLY_QIDS,
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
