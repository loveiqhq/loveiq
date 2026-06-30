/**
 * Survey email-position A/B experiment.
 *
 * A 50/50 split testing WHERE the email-capture question (`qId "00000"`) sits in
 * the survey, to measure drop-off:
 *   - "first" (control / current behavior) — email is the very first question.
 *   - "last"  — email moves to immediately BEFORE the marketing opt-in
 *               (`qId "16015"`); the opt-in stays the final question, as today.
 *
 * Assignment is a sticky, no-PII functional cookie minted CLIENT-SIDE in
 * `SurveyEngine` on first render (same gate as the survey-white A/B: the engine
 * is client-only behind SurveyPage's hydration gate, so reading/minting the
 * cookie and reordering the questions there is SSR-safe and flash-free). The arm
 * is read back from the same cookie server-side at `/api/survey`,
 * `/api/survey-partial`, `/api/funnel-event` and `/api/survey-tracking` to stamp
 * the funnel for complete, consent-robust drop-off-by-arm analysis.
 *
 * Un-gated: a real 50/50 wherever deployed. Orthogonal to the survey-white A/B
 * (separate cookie) — a user is in one of 4 cells, so analysis must GROUP BY
 * both arms.
 */

import type { SurveyQuestion } from "@/data/survey-data";

const isProduction = process.env.NODE_ENV === "production";

export type EmailPositionVariant = "first" | "last";

export const EMAIL_POSITION_EXPERIMENT = "survey-email-position-ab";

export const EMAIL_POSITION_COOKIE = isProduction ? "__Host-liq_ep" : "__liq_ep";

const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365; // 1 year

/** The email-capture question. Moved by the "last" arm. */
export const EMAIL_QID = "00000";
/** The marketing opt-in. "last" inserts email immediately before this. */
export const OPT_IN_QID = "16015";

export function isEmailPositionVariant(
  value: string | null | undefined
): value is EmailPositionVariant {
  return value === "first" || value === "last";
}

/** Anything that isn't an explicit "last" normalizes to "first" (the control). */
export function normalizeEmailPositionVariant(
  value: string | null | undefined
): EmailPositionVariant {
  return value === "last" ? "last" : "first";
}

/**
 * Is this build allowed to honour the `?emailPosition=` preview override? True in
 * dev, and on recognizably non-production deploys (staging / vercel previews,
 * keyed off the build-time `NEXT_PUBLIC_SITE_URL`). Safe-by-default: an
 * unknown/empty site URL is treated as production (override OFF), so the live
 * apex/www can never let a real user self-select an arm and bias the experiment.
 */
function isPreviewableDeploy(): boolean {
  if (process.env.NODE_ENV !== "production") return true;
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "").toLowerCase();
  return siteUrl.includes("staging.") || siteUrl.includes(".vercel.app");
}

/**
 * Preview override. Reads an `emailPosition` query value (`first` | `last`) so
 * either arm can be previewed deterministically — append `?emailPosition=last`
 * to `/survey`. Active in dev and on staging/preview deploys; returns null on
 * production so it can never affect a real user's bucketing.
 */
export function resolveEmailPositionDevOverride(
  param: string | null | undefined
): EmailPositionVariant | null {
  if (!isPreviewableDeploy()) return null;
  return isEmailPositionVariant(param) ? param : null;
}

function readEmailPositionCookie(): EmailPositionVariant | null {
  if (typeof document === "undefined") return null;
  const prefix = `${EMAIL_POSITION_COOKIE}=`;
  for (const part of document.cookie.split("; ")) {
    if (part.startsWith(prefix)) {
      const value = decodeURIComponent(part.slice(prefix.length));
      return isEmailPositionVariant(value) ? value : null;
    }
  }
  return null;
}

/**
 * Resolve (and persist) this browser's email-position arm. Client-only.
 * Precedence:
 *   1. dev `?emailPosition=` override (preview builds only).
 *   2. Existing sticky cookie.
 *   3. Fresh random 50/50 (one crypto byte, low bit) → written to the sticky
 *      cookie so the arm holds across reloads/pause-resume.
 * Functional cookie (stores only "first"|"last", no PII) — set regardless of
 * analytics consent, like the CSRF cookie.
 */
export function assignEmailPositionVariant(devParam?: string | null): EmailPositionVariant {
  const dev = resolveEmailPositionDevOverride(devParam);
  if (dev) return dev;

  if (typeof document === "undefined") return "first";

  const existing = readEmailPositionCookie();
  if (existing) return existing;

  const buf = new Uint8Array(1);
  crypto.getRandomValues(buf);
  const assigned: EmailPositionVariant = (buf[0]! & 1) === 0 ? "first" : "last";

  const secure = isProduction ? "; Secure" : "";
  document.cookie =
    `${EMAIL_POSITION_COOKIE}=${assigned}; Path=/; Max-Age=${COOKIE_MAX_AGE_SECONDS}` +
    `; SameSite=Lax${secure}`;
  return assigned;
}

/**
 * Pure, deterministic question reorder for the experiment.
 *   - "first": returns the SAME array reference unchanged → the control arm is
 *     byte-identical to current behavior (email at index 0).
 *   - "last":  removes the email question and reinserts it immediately before the
 *     marketing opt-in (`OPT_IN_QID`). Falls back to appending at the end if the
 *     opt-in question is absent. Length and the relative order of every other
 *     question are preserved; email appears exactly once.
 */
export function orderByEmailPosition(
  questions: SurveyQuestion[],
  variant: EmailPositionVariant
): SurveyQuestion[] {
  if (variant === "first") return questions;

  const email = questions.find((q) => q.qId === EMAIL_QID);
  if (!email) return questions; // defensive: nothing to move

  const rest = questions.filter((q) => q.qId !== EMAIL_QID);
  const optInIdx = rest.findIndex((q) => q.qId === OPT_IN_QID);
  if (optInIdx === -1) return [...rest, email]; // fallback: truly last

  return [...rest.slice(0, optInIdx), email, ...rest.slice(optInIdx)];
}
