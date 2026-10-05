// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import {
  assignSurveyVariant,
  isSurveyVariant,
  SURVEY_VARIANT_COOKIE,
} from "@shared/experiments/surveyVariant";

function clearSurveyCookie() {
  document.cookie = `${SURVEY_VARIANT_COOKIE}=; Path=/; Max-Age=0`;
}

afterEach(() => {
  clearSurveyCookie();
});

describe("isSurveyVariant", () => {
  it("recognizes only white|dark", () => {
    expect(isSurveyVariant("white")).toBe(true);
    expect(isSurveyVariant("dark")).toBe(true);
    expect(isSurveyVariant("control")).toBe(false);
    expect(isSurveyVariant(null)).toBe(false);
  });
});

describe("assignSurveyVariant", () => {
  it("ignores a stale dark cookie AND expires it", () => {
    // The whole reason concluding this test was not a one-line change. The arm
    // used to be sticky for a year and was read BEFORE the randomiser, so
    // deleting the coin flip alone would have kept serving dark to every browser
    // that already held it — looking concluded in the code and in the reporting
    // while real people got the losing variant.
    document.cookie = `${SURVEY_VARIANT_COOKIE}=dark; Path=/`;
    expect(assignSurveyVariant()).toBe("white");
    expect(document.cookie).not.toContain(`${SURVEY_VARIANT_COOKIE}=dark`);
  });

  it("returns white every time — no randomisation left", () => {
    // Was a ≈50/50 distribution assertion. The test concluded on 2026-08-25, so
    // any variance here would now be a bug, not a coin flip.
    const arms = new Set<string>();
    for (let i = 0; i < 200; i++) {
      clearSurveyCookie();
      arms.add(assignSurveyVariant());
    }
    expect([...arms]).toEqual(["white"]);
  });

  it("writes no arm cookie of its own", () => {
    // Nothing to stick any more. A cookie written here would be a value no code
    // reads, sitting in a browser for a year.
    clearSurveyCookie();
    assignSurveyVariant();
    expect(document.cookie).not.toContain(SURVEY_VARIANT_COOKIE);
  });
});
