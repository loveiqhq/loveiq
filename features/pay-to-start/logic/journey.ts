/**
 * The pay-to-start journey's constants, shared by the server routes, the survey and the
 * readouts. Pure.
 */

/** The label every record of this journey carries: utm_tracker, payment metadata, events. */
export const PAY_TO_START_JOURNEY = "pay_to_start" as const;
export type PayToStartJourney = typeof PAY_TO_START_JOURNEY;

/** utm_tracker's key for it. */
export const JOURNEY_TRACKER_KEY = "journey";

/**
 * The pre-report wizard a buyer sees: slides 1, 4, 5 and 6 of the six (Figma 1477:3938,
 * 1477:4018, 1477:4071, 1477:4123). The report map ("your free chapters") and "Unlocking
 * your report is fully risk free" are left out; there is nothing left to unlock. Indices
 * are the standard wizard's, so analytics read the same slide under the same number.
 */
export const PAY_TO_START_WIZARD_SLIDES = [0, 3, 4, 5] as const;

/** `rpp_` + 32 base62 characters, about 190 bits: unguessable and database-backed. */
export const PREPAID_TOKEN_REGEX = /^rpp_[a-zA-Z0-9]{32}$/;

/**
 * The entitlement cookie. `__Host-` in production (Secure, Path=/, no Domain); the plain
 * name on http://localhost in development, where a `__Host-` cookie cannot be set.
 */
export const PREPAID_COOKIE_PROD = "__Host-liq_pp";
export const PREPAID_COOKIE_DEV = "__liq_pp";

/**
 * The entitlement token from a raw Cookie header, or null. Reads the header rather than
 * `cookies()` so route handlers and their tests need no request scope; accepts either
 * name, so a local production build (which sets the `__Host-` one) works too.
 */
export function readPrepaidToken(cookieHeader: string | null | undefined): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    const name = part.slice(0, eq).trim();
    if (name !== PREPAID_COOKIE_PROD && name !== PREPAID_COOKIE_DEV) continue;
    let value = part.slice(eq + 1).trim();
    try {
      value = decodeURIComponent(value);
    } catch {
      continue;
    }
    if (PREPAID_TOKEN_REGEX.test(value)) return value;
  }
  return null;
}

/**
 * What /survey's server page tells the survey about a visitor who paid before it (their
 * entitlement cookie holds an unused, paid or settling entitlement). Null for everyone else.
 */
export interface SurveyJourney {
  kind: PayToStartJourney;
  /** Paid; false while the payment still settles. */
  paid: boolean;
}

/** Where the survey's way out leads for that visitor: the page they paid on. */
export const PAY_TO_START_RETURN_PATH = "/sexual-archetype";

/** A Stripe Checkout session id, as the status route accepts it. */
export const CHECKOUT_SESSION_ID_REGEX = /^cs_(test|live)_[A-Za-z0-9]{10,200}$/;

/**
 * Whether a `utm_tracker` blob carries the server's journey label (`journey`, the
 * JOURNEY_TRACKER_KEY). Only a buyer whose survey had a tracker carries it: the label
 * never creates one, so a reader of submissions must also check the claimed entitlement.
 */
export function isPayToStartTracker(tracker: string | null | undefined): boolean {
  if (!tracker || !tracker.includes(PAY_TO_START_JOURNEY)) return false;
  try {
    const parsed: unknown = JSON.parse(tracker);
    return (
      !!parsed &&
      typeof parsed === "object" &&
      !Array.isArray(parsed) &&
      (parsed as { journey?: unknown }).journey === PAY_TO_START_JOURNEY
    );
  } catch {
    return false;
  }
}
