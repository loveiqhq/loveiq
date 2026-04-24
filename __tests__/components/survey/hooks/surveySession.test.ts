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
} from "@/components/survey/hooks/surveySession";

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
