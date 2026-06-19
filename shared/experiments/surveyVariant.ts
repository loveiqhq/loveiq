/**
 * Survey white A/B experiment.
 *
 * A 50/50 split testing whether a WHITE survey (the question screens) converts
 * better than the current dark one. Scope is the survey QUESTIONS only — the
 * pre-survey intro/consent and the pre-report wizard stay dark.
 *
 * Assignment is a sticky, no-PII functional cookie minted CLIENT-SIDE in
 * `SurveyEngine` on first render (the engine is client-only, behind SurveyPage's
 * hydration gate, and the theme is applied client-side — so no middleware/SSR
 * involvement is needed, unlike the landing A/B). The arm is read back from the
 * same cookie server-side at `/api/survey` to stamp the submission for
 * completion-rate-by-arm analysis.
 *
 * Un-gated: a real 50/50 wherever deployed. Currently shipped to staging only;
 * promotable to prod by merging staging→main when approved.
 */

const isProduction = process.env.NODE_ENV === "production";

export type SurveyVariant = "white" | "dark";

export const SURVEY_VARIANT_EXPERIMENT = "survey-white-ab";

export const SURVEY_VARIANT_COOKIE = isProduction ? "__Host-liq_sv" : "__liq_sv";

const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365; // 1 year

export function isSurveyVariant(value: string | null | undefined): value is SurveyVariant {
  return value === "white" || value === "dark";
}

export function normalizeSurveyVariant(value: string | null | undefined): SurveyVariant {
  return value === "white" ? "white" : "dark";
}

/**
 * Dev-only preview override. Reads a `survey` query value (`white` | `dark`) so
 * either arm can be previewed deterministically while running `npm run dev` —
 * append `?survey=white` to `/survey`. Returns null outside development, so the
 * branch is dead-code-eliminated in production builds (NODE_ENV is statically
 * replaced) and can never affect a real user's bucketing.
 */
export function resolveSurveyDevOverride(param: string | null | undefined): SurveyVariant | null {
  if (process.env.NODE_ENV !== "development") return null;
  return isSurveyVariant(param) ? param : null;
}

function readSurveyCookie(): SurveyVariant | null {
  if (typeof document === "undefined") return null;
  const prefix = `${SURVEY_VARIANT_COOKIE}=`;
  for (const part of document.cookie.split("; ")) {
    if (part.startsWith(prefix)) {
      const value = decodeURIComponent(part.slice(prefix.length));
      return isSurveyVariant(value) ? value : null;
    }
  }
  return null;
}

/**
 * Resolve (and persist) this browser's survey arm. Client-only. Precedence:
 *   1. dev `?survey=` override (dev builds only).
 *   2. Existing sticky cookie.
 *   3. Fresh random 50/50 (one crypto byte, low bit) → written to the sticky
 *      cookie so the arm holds across reloads/pause-resume.
 * Functional cookie (stores only "white"|"dark", no PII) — set regardless of
 * analytics consent, like the CSRF cookie.
 */
export function assignSurveyVariant(devParam?: string | null): SurveyVariant {
  const dev = resolveSurveyDevOverride(devParam);
  if (dev) return dev;

  if (typeof document === "undefined") return "dark";

  const existing = readSurveyCookie();
  if (existing) return existing;

  const buf = new Uint8Array(1);
  crypto.getRandomValues(buf);
  const assigned: SurveyVariant = (buf[0]! & 1) === 0 ? "dark" : "white";

  const secure = isProduction ? "; Secure" : "";
  document.cookie =
    `${SURVEY_VARIANT_COOKIE}=${assigned}; Path=/; Max-Age=${COOKIE_MAX_AGE_SECONDS}` +
    `; SameSite=Lax${secure}`;
  return assigned;
}
