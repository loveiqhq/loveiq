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

/**
 * The mirror is read and written through these two, each with its OWN try/catch, so a
 * browser that allows sessionStorage but throws on localStorage cannot take the primary
 * path down with it.
 *
 * That is not hypothetical bookkeeping: `getSessionId` already had to catch, because
 * storage THROWS rather than going missing in Safari private mode and several in-app
 * WebViews. Putting the mirror inside that same try meant one localStorage failure fell
 * through to the in-memory fallback and discarded a perfectly good, reload-surviving
 * sessionStorage id — degrading precisely the visitors the catch was written for.
 *
 * The mirror is an enhancement. It must never cost more than it adds.
 */
function readSessionMirror(): string | null {
  try {
    return localStorage.getItem(SURVEY_SESSION_KEY);
  } catch {
    return null;
  }
}

function writeSessionMirror(id: string): void {
  try {
    // Written only when it differs, so reading an established id stays a pure read — and
    // so a respondent already mid-survey when this deploys gets the mirror backfilled
    // rather than being handed a new id.
    if (localStorage.getItem(SURVEY_SESSION_KEY) !== id) {
      localStorage.setItem(SURVEY_SESSION_KEY, id);
    }
  } catch {
    /* localStorage refused — the survey still works, it just will not survive the tab */
  }
}

export function getSessionId(): string {
  if (!canUseStorage()) return "";
  try {
    let id = sessionStorage.getItem(SURVEY_SESSION_KEY);
    /**
     * THE MIRROR EXISTS BECAUSE THE DRAFT OUTLIVES THE TAB.
     *
     * The in-progress survey lives in localStorage (`SURVEY_STATE_KEY`) and survives the
     * browser closing. This id lived only in sessionStorage, which does not. A respondent
     * who closed the tab and came back therefore resumed their answers under a BRAND NEW
     * id — measured: 191 of 3,014 sessions (6.3%) have their first behaviour event partway
     * through the survey, which is exactly that population.
     *
     * Three things were wrong for them, all silent:
     *
     *  - C13's arm is a hash of this id, so half of them had the QUESTION ORDER change
     *    under them mid-survey, and were recorded under the arm they finished in rather
     *    than the one they mostly saw. That is unrecoverable after the fact and biases the
     *    experiment toward "no difference".
     *  - `optionOrder` is recomputed from this id at submit, so the recorded option order
     *    was not the order they were shown — the recorded order becomes a fiction, which
     *    is the one thing that feature exists to prevent.
     *  - Their server-side partial save is keyed by the old id and is simply orphaned.
     *
     * Mirroring into localStorage ties the id's lifetime to the draft's, which is what it
     * always should have been. `clearPersistedSurveyState` and `finalizeReportSession`
     * clear the mirror wherever they clear the session, so a finished or reset survey
     * still starts the next one fresh. Precedent is one function down: `getReportSessionId`
     * already falls back to localStorage for exactly this reason.
     */
    if (!id) {
      id = readSessionMirror() ?? newId();
      sessionStorage.setItem(SURVEY_SESSION_KEY, id);
    }
    writeSessionMirror(id);
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
    // The localStorage mirror has to go with it, or the NEXT survey from this browser
    // resumes a finished submission's id — see the note on `getSessionId`.
    if (localStorage.getItem(SURVEY_SESSION_KEY) === sessionId) {
      localStorage.removeItem(SURVEY_SESSION_KEY);
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
