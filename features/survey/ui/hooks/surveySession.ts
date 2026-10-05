export const SURVEY_SESSION_KEY = "loveiq-survey-session";
export const REPORT_SESSION_KEY = "loveiq-report-session";
export const REPORT_PRICING_SESSION_PREFIX = "loveiq-report-pricing-session";
/**
 * The report a reader in THIS tab has already finished.
 *
 * Written when the submit response returns the token. `loadInitialStep()` reads
 * only the step key and the answers, and submission deliberately clears both —
 * so a reader who finished and then pressed Back landed on the intro screen
 * with their progress apparently gone, as if they had never taken it. Four
 * scanners reported that 24 times in 30 days, and `verify-survey-loop.mjs`
 * reproduces it on every device.
 *
 * sessionStorage, not localStorage: the loop is a same-tab back-navigation, and
 * a report token is an access credential that should not outlive the tab.
 */
export const COMPLETED_REPORT_KEY = "loveiq-completed-report";
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
  // A version-4 UUID either way: the routes and the session_id column take only that,
  // and the old "s-<time>-<random>" fallback was refused at the final submit.
  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
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

/** The finished report, for a browser that refuses storage: remembered for this page load. */
let inMemoryCompleted: string | null = null;

/** Reset the in-memory fallbacks — for tests only. */
export function __resetInMemorySessionIdForTests(): void {
  inMemorySessionId = null;
  inMemoryCompleted = null;
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

/** Remember that this tab finished the survey, and which report it produced. */
export function rememberCompletedReport(token: string): void {
  if (!canUseStorage() || !token) return;
  try {
    sessionStorage.setItem(COMPLETED_REPORT_KEY, token);
  } catch {
    // Storage THROWS in Safari private mode and several in-app WebViews. Kept for this
    // page load, so starting again after finishing still gets a new session id there too.
    inMemoryCompleted = token;
  }
}

/** The report this tab already finished, or null. */
export function completedReportToken(): string | null {
  if (!canUseStorage()) return null;
  try {
    return sessionStorage.getItem(COMPLETED_REPORT_KEY) ?? inMemoryCompleted;
  } catch {
    return inMemoryCompleted;
  }
}

/**
 * Forget it, so "start a new one" really does start a new one.
 *
 * The session id goes too. Submitting keeps it, and a report opened by token
 * never finalizes it, so a retake submitted under the finished run's id, and
 * `submitSurveyOnce()` answers a known id with the existing submission. One
 * reader spent 23 minutes answering again and got submission 2263 back (#375).
 */
export function forgetCompletedReport(): void {
  inMemoryCompleted = null;
  inMemorySessionId = null;
  if (!canUseStorage()) return;
  try {
    sessionStorage.removeItem(COMPLETED_REPORT_KEY);
    sessionStorage.removeItem(SURVEY_SESSION_KEY);
  } catch {
    /* ignore */
  }
}
