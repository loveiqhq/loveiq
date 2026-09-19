import { cookies } from "next/headers";

import { isLandingVariant, LANDING_VARIANT_COOKIE } from "@shared/experiments/landingVariant";

/**
 * Merge the sticky landing arm into a `utm_tracker` JSON blob, server-side.
 *
 * WHY THIS IS SHARED RATHER THAN INLINE. It lived in `app/api/survey/route.ts`
 * only, which stamps on SUBMIT. That means the arm is recorded exactly for the
 * people who finished the survey, and for nobody who dropped out — which is the
 * entire population a mid-funnel question is about. Measured 2026-09-19: all
 * 1,044 `survey_partial_save` rows in the trailing 30 days carried a tracker
 * (941 of them non-null) and not one carried a `landing_variant`, so
 * "how far into the survey does each landing page get people" was unanswerable
 * from stored data even though the progress itself was recorded all along.
 *
 * The arm is read from the COOKIE, never from the request body: the body is the
 * client's word for which experiment it was in, and a caller that can choose its
 * own arm can choose the flattering one.
 *
 * Rules kept identical to the submit-side original, because the two blobs are
 * compared against each other:
 *  - only stamps when the cookie is present, so "no cookie → no stamp" still
 *    holds for crawlers, direct hits and anyone predating the stamp;
 *  - never grows the blob past the 1000-char `utm_tracker` budget — over budget
 *    the ORIGINAL is returned, not a truncated one;
 *  - a tracker that is not a JSON object is left exactly as it was.
 *
 * `cookies()` throws when there is no request scope (a unit test calling POST
 * directly), which is caught and treated as "no arm" rather than an error.
 */
export async function stampLandingArm(
  utmTracker: string | null | undefined
): Promise<string | null> {
  const tracker = utmTracker ?? null;

  let arm: string | undefined;
  try {
    arm = (await cookies()).get(LANDING_VARIANT_COOKIE)?.value;
  } catch {
    /* no request scope — fall through; a body-supplied arm is still stripped */
  }
  const cookieArm = isLandingVariant(arm) ? arm : null;

  let base: unknown;
  try {
    base = tracker ? JSON.parse(tracker) : {};
  } catch {
    return tracker; // wasn't JSON — leave it exactly as it was
  }
  if (!base || typeof base !== "object" || Array.isArray(base)) return tracker;

  /**
   * A client cannot assert its own arm.
   *
   * `utm_tracker` is assembled in the browser and posted verbatim, so a crafted
   * body could previously name whichever arm it liked and that value was stored
   * and read back as the truth. Downstream is guarded — `armLabel`'s own-property
   * lookup stops a `__proto__` reaching the digest — but a plausible-looking
   * `{"landing_variant":"white"}` is not caught by that and never was: it is a
   * well-formed lie, which is the harder problem.
   *
   * So the key is always removed first, and re-added only from the cookie. No
   * cookie means no arm, which is the honest answer for a crawler, a direct hit
   * or anyone predating the stamp.
   */
  const { landing_variant: _claimed, ...rest } = base as Record<string, unknown>;
  const merged = cookieArm ? { ...rest, landing_variant: cookieArm } : rest;

  // Unchanged blob in, unchanged blob out — so a tracker with no arm claim and no
  // cookie is byte-identical to what the caller sent, not a re-serialised copy.
  if (!cookieArm && _claimed === undefined) return tracker;

  const candidate = JSON.stringify(merged);
  // Over budget: keep the ORIGINAL rather than a truncated one.
  return candidate.length <= 1000 ? candidate : tracker;
}
