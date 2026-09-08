export const SURVEY_SESSION_KEY = "loveiq-survey-session";
export const REPORT_SESSION_KEY = "loveiq-report-session";
export const REPORT_PRICING_SESSION_PREFIX = "loveiq-report-pricing-session";
export const REPORT_NURTURE_PROMO_PREFIX = "loveiq-report-nurture-promo";

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

/**
 * Fallback id for a browser that refuses storage. Module-level so every caller
 * in the page agrees on one id.
 */
let inMemorySessionId: string | null = null;

function newId(): string {
  // `crypto.randomUUID` needs a secure context and is missing in some in-app
  // WebViews — the same environments that refuse storage, so it cannot be
  // assumed here of all places.
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function getSessionId(): string {
  if (!canUseStorage()) return "";
  try {
    let id = sessionStorage.getItem(SURVEY_SESSION_KEY);
    if (!id) {
      id = newId();
      sessionStorage.setItem(SURVEY_SESSION_KEY, id);
    }
    return id;
  } catch {
    /**
     * Storage does not merely go missing — it THROWS. Safari private mode and
     * several in-app WebViews raise SecurityError on every access, and we see
     * those users: one production session logged 28 `SecurityError: The
     * operation is insecure.` events.
     *
     * Every other accessor in this file already caught that. This one did not,
     * and it is called during render (`useRef(getSessionId())` in
     * `usePartialSave`), so for those visitors it threw inside a React render.
     *
     * Scope of the claim, honestly: the THROW is proven (removing this catch
     * fails three unit tests). The user-visible symptom is NOT — a browser
     * probe with storage disabled could not get past the survey intro, which
     * renders identically either way, so what a real visitor saw once the
     * engine mounted was never demonstrated. Treat this as a certain code
     * defect with unmeasured field impact, not as a diagnosed outage.
     *
     * A per-page-load id keeps the survey and its partial saves working for the
     * visit. It does not survive a reload, which is the correct trade: a
     * forgotten draft beats a survey that will not open.
     */
    inMemorySessionId ??= newId();
    return inMemorySessionId;
  }
}

/** Reset the in-memory fallback — for tests only. */
export function __resetInMemorySessionIdForTests(): void {
  inMemorySessionId = null;
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

function getNurturePromoStorageKey({
  sessionId,
  token,
}: {
  sessionId?: string | null;
  token?: string | null;
}): string | null {
  if (token) return `${REPORT_NURTURE_PROMO_PREFIX}:token:${token}`;
  if (sessionId) return `${REPORT_NURTURE_PROMO_PREFIX}:session:${sessionId}`;
  return null;
}

/**
 * Stash a nurture promo code (e.g. "LIQ-50-Ab7K9xQ2") so the downstream
 * checkout-session POST can pick it up. The code lives in sessionStorage
 * because it's per-tab and shouldn't survive the user closing the browser —
 * the email link is the canonical entry point.
 */
export function setReportNurturePromo({
  promoCode,
  sessionId,
  token,
}: {
  promoCode: string;
  sessionId?: string | null;
  token?: string | null;
}): void {
  if (!canUseStorage()) return;
  const storageKey = getNurturePromoStorageKey({ sessionId, token });
  if (!storageKey) return;
  try {
    sessionStorage.setItem(storageKey, promoCode);
  } catch {
    /* storage unavailable */
  }
}

export function getReportNurturePromo({
  sessionId,
  token,
}: {
  sessionId?: string | null;
  token?: string | null;
}): string | null {
  if (!canUseStorage()) return null;
  const storageKey = getNurturePromoStorageKey({ sessionId, token });
  if (!storageKey) return null;
  try {
    return sessionStorage.getItem(storageKey);
  } catch {
    return null;
  }
}
