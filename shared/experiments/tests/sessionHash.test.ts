import { describe, expect, it } from "vitest";
import { sessionArmHash } from "@shared/experiments/sessionHash";
import { assignQuestionOrderArm } from "@shared/experiments/questionOrderArm";

/**
 * The hash every session-derived arm is drawn from. C13 has been live on it since
 * 2026-10-06, its SQL twin `c13_arm()` reads stored sessions back, and the e2e
 * fixtures in `e2e/surveyArm.ts` rely on its buckets: these values may never change.
 * Recorded 2026-10-07 from the implementation as it stood in questionOrderArm.ts.
 */
describe("sessionArmHash", () => {
  it("returns the recorded values", () => {
    expect(sessionArmHash("")).toBe(2872998923);
    expect(sessionArmHash("a")).toBe(444641715);
    expect(sessionArmHash("c13-opening-order:00000000-0000-4000-8000-000000000007")).toBe(601758);
    expect(sessionArmHash("survey-email-anonymous:x")).toBe(1144649962);
  });

  it("is an unsigned 32-bit integer", () => {
    for (const seed of ["", "x", "c13-opening-order:abc", "z".repeat(500)]) {
      const h = sessionArmHash(seed);
      expect(Number.isInteger(h)).toBe(true);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(2 ** 32);
    }
  });
});

describe("C13 keeps its buckets", () => {
  // Arm by the last two digits of 00000000-0000-4000-8000-0000000000NN, recorded 2026-10-07.
  const RECORDED: Record<string, "control" | "variant"> = {
    "00": "control",
    "01": "variant",
    "02": "variant",
    "03": "variant",
    "04": "variant",
    "05": "variant",
    "06": "variant",
    "07": "control",
    "08": "control",
    "09": "control",
    "10": "variant",
    "11": "control",
    "12": "variant",
    "13": "variant",
    "14": "control",
    "15": "control",
    "16": "variant",
    "17": "control",
    "18": "control",
    "19": "variant",
    "20": "control",
    "21": "variant",
    "22": "control",
    "23": "variant",
    "24": "variant",
    "25": "control",
    "26": "control",
    "27": "variant",
    "28": "variant",
    "29": "control",
    "30": "variant",
    "31": "control",
    "32": "control",
    "33": "variant",
    "34": "variant",
    "35": "variant",
    "36": "control",
    "37": "variant",
    "38": "variant",
    "39": "control",
  };

  it("assigns every recorded session the arm it had", () => {
    for (const [suffix, arm] of Object.entries(RECORDED)) {
      expect(assignQuestionOrderArm(`00000000-0000-4000-8000-0000000000${suffix}`)).toBe(arm);
    }
  });
});
