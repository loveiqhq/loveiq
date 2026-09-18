// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  finalizeReportSession,
  getReportPricingSessionId,
  REPORT_SESSION_KEY,
  REPORT_PRICING_SESSION_PREFIX,
  SURVEY_SESSION_KEY,
  copySurveySessionToReportSession,
  getReportSessionId,
  getSessionId,
  setReportPricingSessionId,
  setReportSessionId,
} from "@features/survey/ui/hooks/surveySession";

describe("surveySession", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates and stores a session id when one does not exist", () => {
    const randomUuid = vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue("session-123");

    expect(getSessionId()).toBe("session-123");
    expect(sessionStorage.getItem(SURVEY_SESSION_KEY)).toBe("session-123");
    expect(randomUuid).toHaveBeenCalledTimes(1);
  });

  it("reuses the existing session id from session storage", () => {
    sessionStorage.setItem(SURVEY_SESSION_KEY, "existing-session");
    const randomUuid = vi.spyOn(globalThis.crypto, "randomUUID");

    expect(getSessionId()).toBe("existing-session");
    expect(randomUuid).not.toHaveBeenCalled();
  });

  /**
   * sessionStorage dies with the tab; the draft in localStorage does not. Before the
   * mirror, a respondent who closed the tab and came back resumed their answers under a
   * new id — 6.3% of production sessions (191 of 3,014) show that footprint. Under C13
   * half of them had the question order change mid-survey and were recorded under the
   * wrong arm, and their `optionOrder` recorded an order they were never shown.
   */
  describe("the localStorage mirror", () => {
    it("resumes the id from localStorage when the tab closed and sessionStorage is gone", () => {
      const randomUuid = vi.spyOn(globalThis.crypto, "randomUUID");
      localStorage.setItem(SURVEY_SESSION_KEY, "survived-the-tab");

      expect(getSessionId()).toBe("survived-the-tab");
      expect(randomUuid, "a mirrored id must be resumed, never re-minted").not.toHaveBeenCalled();
      expect(sessionStorage.getItem(SURVEY_SESSION_KEY)).toBe("survived-the-tab");
    });

    it("mirrors a freshly minted id so the next tab can resume it", () => {
      vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue("fresh-id");

      expect(getSessionId()).toBe("fresh-id");
      expect(localStorage.getItem(SURVEY_SESSION_KEY)).toBe("fresh-id");
    });

    it("backfills the mirror for a respondent already mid-survey when this ships", () => {
      sessionStorage.setItem(SURVEY_SESSION_KEY, "in-flight");

      expect(getSessionId()).toBe("in-flight");
      expect(localStorage.getItem(SURVEY_SESSION_KEY)).toBe("in-flight");
    });

    it("finalizeReportSession clears the mirror, so the NEXT survey starts fresh", () => {
      // Without this the next respondent on this browser resumes a finished submission's
      // id, and their behaviour events land against someone else's session.
      sessionStorage.setItem(SURVEY_SESSION_KEY, "done-with-this");
      localStorage.setItem(SURVEY_SESSION_KEY, "done-with-this");

      finalizeReportSession("done-with-this");

      expect(sessionStorage.getItem(SURVEY_SESSION_KEY)).toBeNull();
      expect(localStorage.getItem(SURVEY_SESSION_KEY)).toBeNull();
    });

    it("finalizeReportSession leaves a DIFFERENT session's mirror alone", () => {
      localStorage.setItem(SURVEY_SESSION_KEY, "someone-elses");

      finalizeReportSession("not-that-one");

      expect(localStorage.getItem(SURVEY_SESSION_KEY)).toBe("someone-elses");
    });
  });

  it("copies the survey session into report storage", () => {
    sessionStorage.setItem(SURVEY_SESSION_KEY, "existing-session");

    expect(copySurveySessionToReportSession()).toBe("existing-session");
    expect(localStorage.getItem(REPORT_SESSION_KEY)).toBe("existing-session");
  });

  it("prefers the active survey session when loading the report", () => {
    setReportSessionId("report-session");
    sessionStorage.setItem(SURVEY_SESSION_KEY, "survey-session");

    expect(getReportSessionId()).toBe("survey-session");
    expect(localStorage.getItem(REPORT_SESSION_KEY)).toBe("survey-session");
  });

  it("falls back to the saved report session when no active survey session exists", () => {
    setReportSessionId("report-session");

    expect(getReportSessionId()).toBe("report-session");
  });

  it("falls back to the survey session and promotes it when no report session exists", () => {
    sessionStorage.setItem(SURVEY_SESSION_KEY, "survey-session");

    expect(getReportSessionId()).toBe("survey-session");
    expect(localStorage.getItem(REPORT_SESSION_KEY)).toBe("survey-session");
  });

  it("finalizes the report session and clears the matching survey session", () => {
    sessionStorage.setItem(SURVEY_SESSION_KEY, "survey-session");
    localStorage.setItem(REPORT_SESSION_KEY, "stale-report-session");

    finalizeReportSession("survey-session");

    expect(localStorage.getItem(REPORT_SESSION_KEY)).toBe("survey-session");
    expect(sessionStorage.getItem(SURVEY_SESSION_KEY)).toBeNull();
  });

  it("creates and reuses a pricing session id per report session context", () => {
    const randomUuid = vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue("pricing-123");

    expect(getReportPricingSessionId({ sessionId: "02d88f31-eceb-4402-940d-c8cd98d01848" })).toBe(
      "pricing-123"
    );
    expect(
      sessionStorage.getItem(
        `${REPORT_PRICING_SESSION_PREFIX}:session:02d88f31-eceb-4402-940d-c8cd98d01848`
      )
    ).toBe("pricing-123");
    expect(getReportPricingSessionId({ sessionId: "02d88f31-eceb-4402-940d-c8cd98d01848" })).toBe(
      "pricing-123"
    );
    expect(randomUuid).toHaveBeenCalledTimes(1);
  });

  it("isolates pricing session ids for token-based report access", () => {
    const randomUuid = vi
      .spyOn(globalThis.crypto, "randomUUID")
      .mockReturnValueOnce("pricing-token")
      .mockReturnValueOnce("pricing-session");

    expect(getReportPricingSessionId({ token: "rpt_ABCDEFGHIJKLMNOPQRST" })).toBe("pricing-token");
    expect(getReportPricingSessionId({ sessionId: "02d88f31-eceb-4402-940d-c8cd98d01848" })).toBe(
      "pricing-session"
    );
    expect(randomUuid).toHaveBeenCalledTimes(2);
  });

  it("setReportPricingSessionId overwrites the stored id for a token context", () => {
    sessionStorage.setItem(
      `${REPORT_PRICING_SESSION_PREFIX}:token:rpt_ABCDEFGHIJKLMNOPQRST`,
      "old-id"
    );

    setReportPricingSessionId({
      token: "rpt_ABCDEFGHIJKLMNOPQRST",
      pricingSessionId: "url-supplied-id",
    });

    expect(
      sessionStorage.getItem(`${REPORT_PRICING_SESSION_PREFIX}:token:rpt_ABCDEFGHIJKLMNOPQRST`)
    ).toBe("url-supplied-id");
    expect(getReportPricingSessionId({ token: "rpt_ABCDEFGHIJKLMNOPQRST" })).toBe(
      "url-supplied-id"
    );
  });

  it("setReportPricingSessionId stores against the session-id context when no token present", () => {
    setReportPricingSessionId({
      sessionId: "02d88f31-eceb-4402-940d-c8cd98d01848",
      pricingSessionId: "from-email",
    });

    expect(
      sessionStorage.getItem(
        `${REPORT_PRICING_SESSION_PREFIX}:session:02d88f31-eceb-4402-940d-c8cd98d01848`
      )
    ).toBe("from-email");
  });

  it("setReportPricingSessionId silently no-ops when neither token nor session id is supplied", () => {
    setReportPricingSessionId({ pricingSessionId: "orphan" });
    // No storage key can be formed; nothing should be written.
    expect(sessionStorage.length).toBe(0);
  });
});
