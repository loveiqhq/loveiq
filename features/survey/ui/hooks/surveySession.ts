export const SURVEY_SESSION_KEY = "loveiq-survey-session";
export const REPORT_SESSION_KEY = "loveiq-report-session";
export const REPORT_PRICING_SESSION_PREFIX = "loveiq-report-pricing-session";

function canUseStorage() {
  return typeof window !== "undefined";
}

function getReportPricingSessionStorageKey({
  sessionId,
  token,
}: {
  sessionId?: string | null;
  token?: string | null;
}) {
  if (token) {
    return `${REPORT_PRICING_SESSION_PREFIX}:token:${token}`;
  }

  if (sessionId) {
    return `${REPORT_PRICING_SESSION_PREFIX}:session:${sessionId}`;
  }

  return null;
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

export function finalizeReportSession(sessionId: string): void {
  if (!canUseStorage()) return;

  try {
    setReportSessionId(sessionId);

    if (sessionStorage.getItem(SURVEY_SESSION_KEY) === sessionId) {
      sessionStorage.removeItem(SURVEY_SESSION_KEY);
    }
  } catch {
    /* storage unavailable */
  }
}

export function getReportSessionId(): string | null {
  if (!canUseStorage()) return null;

  try {
    const surveySessionId = sessionStorage.getItem(SURVEY_SESSION_KEY);
    if (surveySessionId) {
      setReportSessionId(surveySessionId);
      return surveySessionId;
    }

    return localStorage.getItem(REPORT_SESSION_KEY);
  } catch {
    return null;
  }
}

export function getReportPricingSessionId({
  sessionId,
  token,
}: {
  sessionId?: string | null;
  token?: string | null;
}): string | null {
  if (!canUseStorage()) return null;

  const storageKey = getReportPricingSessionStorageKey({ sessionId, token });
  if (!storageKey) {
    return null;
  }

  try {
    let pricingSessionId = sessionStorage.getItem(storageKey);
    if (!pricingSessionId) {
      pricingSessionId = crypto.randomUUID();
      sessionStorage.setItem(storageKey, pricingSessionId);
    }

    return pricingSessionId;
  } catch {
    return null;
  }
}

/**
 * Persist a pricing-session id threaded from an external URL (e.g. the
 * discount email CTA ?pricingSessionId=...). Downstream surfaces — the report
 * page, the checkout page, the Stripe session endpoint — all read via
 * `getReportPricingSessionId`, so writing into the same storage key makes the
 * offer's locked quote transparently win through the whole flow.
 */
export function setReportPricingSessionId({
  pricingSessionId,
  sessionId,
  token,
}: {
  pricingSessionId: string;
  sessionId?: string | null;
  token?: string | null;
}): void {
  if (!canUseStorage()) return;

  const storageKey = getReportPricingSessionStorageKey({ sessionId, token });
  if (!storageKey) return;

  try {
    sessionStorage.setItem(storageKey, pricingSessionId);
  } catch {
    /* storage unavailable */
  }
}
