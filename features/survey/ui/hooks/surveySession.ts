export const SURVEY_SESSION_KEY = "loveiq-survey-session";
export const REPORT_SESSION_KEY = "loveiq-report-session";
export const REPORT_PRICING_SESSION_PREFIX = "loveiq-report-pricing-session";
export const REPORT_NURTURE_PROMO_PREFIX = "loveiq-report-nurture-promo";
export const REPORT_PAYWALL_DEADLINE_PREFIX = "loveiq-report-paywall-deadline";

/**
 * Urgency window for the report paywall countdown. Three minutes since
 * 2026-08-19 (was two): the clock now starts when the reader REACHES the first
 * paywalled chapter rather than on page load, so it has to survive reading that
 * chapter and the pop-up's own arrival before it runs out.
 */
export const REPORT_PAYWALL_COUNTDOWN_MS = 3 * 60 * 1_000;

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

function getPaywallDeadlineStorageKey({
  sessionId,
  token,
}: {
  sessionId?: string | null;
  token?: string | null;
}): string | null {
  if (token) return `${REPORT_PAYWALL_DEADLINE_PREFIX}:token:${token}`;
  if (sessionId) return `${REPORT_PAYWALL_DEADLINE_PREFIX}:session:${sessionId}`;
  return null;
}

/**
 * Read-or-create the report paywall countdown deadline (epoch ms) for this
 * report, persisted in sessionStorage so the urgency window survives view
 * switches, re-renders, and reopening the modal within the same tab — it does
 * NOT silently reset to a fresh 3:00 on every open. Once the deadline has
 * elapsed it is kept (the countdown shows 00:00), never regenerated.
 *
 * CREATING it starts the clock, so the caller decides when that happens — the
 * report arms it on reaching the first paywalled chapter (or on any earlier
 * paywall open), not on page load. Use {@link peekReportPaywallDeadline} to read
 * an already-running clock without starting one.
 *
 * Returns a fresh in-memory deadline when storage is unavailable (private mode)
 * or there's no token/session key, so the countdown still works — it just won't
 * persist across reopens in that edge case.
 */
/**
 * Read the paywall deadline for this report WITHOUT starting one. Returns null
 * when the clock has not been armed yet (or storage is unavailable), which is how
 * the report tells "reader has already seen the paywall in this tab" from "clock
 * not started".
 */
export function peekReportPaywallDeadline({
  sessionId,
  token,
}: {
  sessionId?: string | null;
  token?: string | null;
}): number | null {
  if (!canUseStorage()) return null;

  const storageKey = getPaywallDeadlineStorageKey({ sessionId, token });
  if (!storageKey) return null;

  try {
    const stored = sessionStorage.getItem(storageKey);
    if (!stored) return null;
    const parsed = Number.parseInt(stored, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  } catch {
    return null;
  }
}

export function getReportPaywallDeadline({
  sessionId,
  token,
}: {
  sessionId?: string | null;
  token?: string | null;
}): number {
  const fallback = Date.now() + REPORT_PAYWALL_COUNTDOWN_MS;
  if (!canUseStorage()) return fallback;

  const storageKey = getPaywallDeadlineStorageKey({ sessionId, token });
  if (!storageKey) return fallback;

  try {
    const stored = sessionStorage.getItem(storageKey);
    if (stored) {
      const parsed = Number.parseInt(stored, 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        return parsed;
      }
    }
    sessionStorage.setItem(storageKey, String(fallback));
    return fallback;
  } catch {
    return fallback;
  }
}
