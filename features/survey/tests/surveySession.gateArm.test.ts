// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import {
  forgetCompletedReport,
  GATE_ARM_KEY,
  gateArmRemembered,
  rememberGateArm,
} from "@features/survey/ui/hooks/surveySession";

/**
 * Mark's 50/50 of his new EUR 1.99 page (16 Nov): the survey's reply names the half a finished
 * run's gate is in, and the pre-report wizard's map tells that half's offer, the Core Archetype
 * free or in the EUR 1.99, also after a reload during the wizard.
 */
describe("the half of Mark's 50/50 a finished run's gate is in", () => {
  afterEach(() => {
    forgetCompletedReport();
    sessionStorage.clear();
  });

  it("is kept for the tab, whichever half it is", () => {
    rememberGateArm("control");
    expect(gateArmRemembered()).toBe("control");
    expect(sessionStorage.getItem(GATE_ARM_KEY)).toBe("control");
    rememberGateArm("reveal");
    expect(gateArmRemembered()).toBe("reveal");
  });

  it("is none until the reply names one", () => {
    expect(gateArmRemembered()).toBeNull();
  });

  it("reads nothing but a half from storage", () => {
    sessionStorage.setItem(GATE_ARM_KEY, "1");
    expect(gateArmRemembered()).toBeNull();
  });

  it("goes with the finished run", () => {
    rememberGateArm("control");
    forgetCompletedReport();
    expect(gateArmRemembered()).toBeNull();
    expect(sessionStorage.getItem(GATE_ARM_KEY)).toBeNull();
  });
});
