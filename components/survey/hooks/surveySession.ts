export const SURVEY_SESSION_KEY = "loveiq-survey-session";
export const REPORT_SESSION_KEY = "loveiq-report-session";

function canUseStorage() {
  return typeof window !== "undefined";
}

export function getSessionId(): string {
  if (!canUseStorage()) return "";
  let id = sessionStorage.getItem(SURVEY_SESSION_KEY);
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem(SURVEY_SESSION_KEY, id);
  }
  return id;
}

export function setReportSessionId(sessionId: string): void {
  if (!canUseStorage()) return;
  try {
    localStorage.setItem(REPORT_SESSION_KEY, sessionId);
  } catch {
    /* storage unavailable */
  }
}

export function copySurveySessionToReportSession(): string | null {
  if (!canUseStorage()) return null;

  try {
    const sessionId = sessionStorage.getItem(SURVEY_SESSION_KEY);
    if (!sessionId) return null;
    setReportSessionId(sessionId);
    return sessionId;
  } catch {
    return null;
  }
}

export function getReportSessionId(): string | null {
  if (!canUseStorage()) return null;

  try {
    const reportSessionId = localStorage.getItem(REPORT_SESSION_KEY);
    if (reportSessionId) return reportSessionId;

    const surveySessionId = sessionStorage.getItem(SURVEY_SESSION_KEY);
    if (!surveySessionId) return null;

    setReportSessionId(surveySessionId);
    return surveySessionId;
  } catch {
    return null;
  }
}
