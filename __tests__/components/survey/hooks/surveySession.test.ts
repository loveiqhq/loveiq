// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  finalizeReportSession,
  REPORT_SESSION_KEY,
  SURVEY_SESSION_KEY,
  copySurveySessionToReportSession,
  getReportSessionId,
  getSessionId,
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
});
