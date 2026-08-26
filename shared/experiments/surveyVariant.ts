/**
 * Survey theme — CONCLUDED 2026-08-25 in favour of white.
 *
 * This was a 50/50 test of a white question screen against the original dark
 * one, live in production from 2026-06-20. Final numbers: white 453 completions
 * / 84 reached checkout (18.5%) / 8 purchases, dark 411 / 62 (15.1%) / 9. White
 * won clearly on reaching checkout; purchases were a dead heat, which is why the
 * decision was made on the checkout rate.
 *
 * Everyone now gets white. `assignSurveyVariant` returns `"white"`
 * unconditionally — see the comment on it for why simply changing the coin flip
 * would NOT have been enough.
 *
 * The dark branches are still in the UI (33 theme ternaries across 10
 * components, not a separate tree) and `?survey=dark` still previews them on
 * dev/staging, so the old look can be inspected without a revert. What is gone is the assignment and the
 * reporting: the `survey` axis is dropped from every live-axis list, following
 * the same pattern as the concluded paywall experiment, and `/admin` lists it
 * under "Finished — not being tested any more" with no rates attached.
 *
 * What survives is the RECORD, not a rendering of it.
 * `survey_submission.utm_tracker.survey_variant` still holds what each past
 * visitor saw and it is still in the structured Slack log line, but no /admin
 * screen displays it — the submission-detail route reduces `utm_tracker` to
 * `utm_source`. That is the point of retiring the axis; it also means "still
 * visible in /admin" would be false if anyone wrote it.
 *
 * From this deploy nothing writes the arm either: /api/survey stamped it from the
 * cookie, and the cookie is gone, so new submissions carry no survey arm at all.
 * The 453/411 split is therefore final and permanently reproducible.
 */

import { isNonProdDeploy } from "@shared/env/is-non-prod-deploy";

const isProduction = process.env.NODE_ENV === "production";

export type SurveyVariant = "white" | "dark";

export const SURVEY_VARIANT_COOKIE = isProduction ? "__Host-liq_sv" : "__liq_sv";

export function isSurveyVariant(value: string | null | undefined): value is SurveyVariant {
  return value === "white" || value === "dark";
}

/**
 * Preview override. Reads a `survey` query value (`white` | `dark`) so either arm
 * can be previewed deterministically — append `?survey=white` to `/survey`.
 * Active in dev and on staging/preview deploys; returns null on production so it
 * can never affect a real user's bucketing.
 */
export function resolveSurveyDevOverride(param: string | null | undefined): SurveyVariant | null {
  if (!isNonProdDeploy()) return null;
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
 * Everyone gets white. Only the `?survey=` preview override can say otherwise,
 * and only on dev/staging builds.
 *
 * WHY THIS IS NOT JUST A CHANGED COIN FLIP. Assignment used to be sticky in a
 * one-year cookie that was consulted BEFORE the randomiser. Deleting the flip
 * alone would have left every browser already holding `dark` on the dark survey
 * for up to a year after the test was called — the arm would have looked
 * concluded in the code and in the reporting while real people kept being served
 * the losing variant. So the cookie is no longer READ — which is what flips a
 * returning dark visitor, on this visit and not a later one — and it is also
 * actively EXPIRED, so a dead value does not sit in a browser for a year. The
 * expiry runs when the survey engine mounts, so someone who never opens the
 * survey again keeps the stale value; nothing reads it.
 */
export function assignSurveyVariant(devParam?: string | null): SurveyVariant {
  // Expire FIRST, before the override can return. Nothing reads this cookie any
  // more, so it should not survive a visit under any path — and on staging, which
  // shares the production database, a previewer holding a pre-conclusion `dark`
  // could otherwise keep it and have it stamped onto a real submission.
  if (typeof document !== "undefined") clearSurveyCookie();

  const dev = resolveSurveyDevOverride(devParam);
  if (dev) return dev;
  return "white";
}

/**
 * Expire the sticky arm cookie. Max-Age=0 on the same Path the cookie was
 * written with, or the browser keeps the original alongside the deletion.
 */
function clearSurveyCookie(): void {
  if (!readSurveyCookie()) return;
  const secure = isProduction ? "; Secure" : "";
  document.cookie = `${SURVEY_VARIANT_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax${secure}`;
}
