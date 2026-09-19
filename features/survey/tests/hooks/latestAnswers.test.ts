// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { useSurveyState } from "@features/survey/ui/hooks/useSurveyState";

/**
 * The last question's answer must reach the submit payload.
 *
 * `goNext` in SurveyEngine closes over `answers`. On the final question the respondent
 * picks an option and clicks Next a fraction of a second later — two separate clicks, but
 * if the second lands before React commits the state update from the first, the submit
 * sends the answer map WITHOUT that answer. No error, no retry: the answer is simply
 * absent from the payload, and `submit_survey` stores 56 rows instead of 57.
 *
 * This is not hypothetical. Production, 2026-09-11: 202 of 1,764 completed submissions
 * over 120 days (11.5%) had no row at all for 16015, the marketing opt-in and the last
 * question asked. Of the 20 whose draft happened to outlive the submission, ALL 20 held
 * the answer client-side and 11 said "Yes" — marketing consent given, never recorded.
 */
describe("getLatestAnswers", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it("reflects an answer before React has committed the render", () => {
    const { result } = renderHook(() => useSurveyState());

    act(() => {
      result.current.setAnswer("16015", "Yes, I want to keep learning about myself.");

      // Still inside the same act(): React has NOT committed yet. This is the exact
      // window the submit used to fall into.
      expect(
        result.current.getLatestAnswers()["16015"],
        "the submit path must see the answer immediately"
      ).toBe("Yes, I want to keep learning about myself.");
    });

    // After commit both agree.
    expect(result.current.answers["16015"]).toBe("Yes, I want to keep learning about myself.");
    expect(result.current.getLatestAnswers()["16015"]).toBe(
      "Yes, I want to keep learning about myself."
    );
  });

  it("keeps every earlier answer, not just the newest", () => {
    const { result } = renderHook(() => useSurveyState());
    act(() => {
      result.current.setAnswer("00001", "Ada");
      result.current.setAnswer("16002", 6);
      result.current.setAnswer("16015", "No, I am not interested in this growth opportunity.");
      expect(Object.keys(result.current.getLatestAnswers()).sort()).toEqual([
        "00001",
        "16002",
        "16015",
      ]);
    });
  });

  it("is emptied by clearState synchronously, so a restart cannot submit the old run", () => {
    const { result } = renderHook(() => useSurveyState());
    act(() => {
      result.current.setAnswer("00001", "Ada");
    });
    act(() => {
      result.current.clearState();
      expect(result.current.getLatestAnswers()).toEqual({});
    });
  });

  it("is a stable function identity, so it never re-triggers a memo", () => {
    const { result, rerender } = renderHook(() => useSurveyState());
    const first = result.current.getLatestAnswers;
    act(() => {
      result.current.setAnswer("00001", "Ada");
    });
    rerender();
    expect(result.current.getLatestAnswers).toBe(first);
  });
});
