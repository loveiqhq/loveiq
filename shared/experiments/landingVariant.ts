/**
 * Landing-page variant.
 *
 * ROUND 1 (concluded 2026-06-19): dark landing ("control") vs the white redesign
 * ("white"), 50/50. White won on visitor->survey (~7.9% vs ~4.9%), the dark
 * landing was retired and white served 100% of traffic. `"control"` is retained
 * below because historical analytics / Stripe metadata rows still carry it; no
 * new traffic is ever tagged with it.
 *
 * ROUND 2 (2026-08-21 to 2026-09-19): the white landing rebuilt to the "Landing E"
 * frame on 2026-08-10 (question 1 in the hero, new hero, trust strip, find-out
 * block, sticky CTA) against the white landing that preceded it:
 *   - `"white"`      — the rebuild, "Landing Page V2", features/landing/ui/white/
 *   - `"white_prev"` — the one before it, "V1", features/landing/ui/white-v1/
 * Settled on V2 (see proxy.ts). Both values stay valid because stored rows carry
 * them; neither is assigned to a visitor any more.
 *
 * ROUND 3 (from LANDING_HERO_VIDEO_LAUNCH_DAY): the V2 page with two different
 * heroes, 50/50 (decided at the 2026-10-06 sync; Figma Report-3.0 `1503:1341`):
 *   - `"white_card"`  — arm A, question 1 in the hero: V2 exactly as it was
 *   - `"white_video"` — arm B, the presenter video in that slot instead (V3)
 * New values rather than `"white"` for arm A. Every visitor since 2026-09-19 holds
 * a one-year `white` cookie and a live arm's cookie is sticky, so reusing `white`
 * would have kept every returning visitor in arm A and only new visitors could
 * reach B. New values re-roll those cookies, and keep round 2's rows from pooling
 * into round 3's (Pricing 3.0 took new letters, A3/B3, for the same reason).
 *
 * The variant flows through the funnel for attribution:
 *   - `LandingPageTracker` sets it as a GA4 user property and PostHog
 *     super-property, and fires `experiment_exposure` for LANDING_VARIANT_EXPERIMENT.
 *   - `persistAnalyticsEvent` (features/analytics/client.ts) auto-stamps
 *     `landing_variant` (read from this cookie) onto every durable event.
 *   - `/api/survey` and `/api/survey-partial` read the cookie server-side and pack
 *     it into the `utm_tracker` JSON (shared/experiments/stampArm.ts) — the source
 *     of truth the readouts group by; `funnel_event.landing_variant` gets it too.
 *   - `/api/stripe/checkout-session` stamps it into Stripe session metadata.
 */

const isProduction = process.env.NODE_ENV === "production";

export type LandingVariant = "control" | "white" | "white_prev" | "white_card" | "white_video";

/**
 * Bumped every round so GA4 and PostHog keep the tests apart: `landing-white-ab` is
 * round 1 (dark vs white), `landing-white-rebuild-ab` round 2 (V2 vs V1),
 * `landing-hero-video-ab` round 3 (question card vs video).
 */
export const LANDING_VARIANT_EXPERIMENT = "landing-hero-video-ab";

/**
 * The day round 3 started assigning arms on production (Berlin day). Its readouts
 * start here: the axis trend and the conversion digest cut the landing comparison at
 * this day, so a window that reaches back before it is never read as days of a test
 * that was not running. Staging ran it from 2026-10-06. If the release lands on a
 * later day than this, move it to that day: a day too early only shows as an empty
 * first day, but a day too late would drop real data from the readouts.
 */
export const LANDING_HERO_VIDEO_LAUNCH_DAY = "2026-10-07";

/**
 * Sticky assignment cookie. `__Host-` prefix in production (requires Secure +
 * Path=/ + no Domain — all satisfied below). Plain name in dev so it works over
 * http://localhost. Mirrors the CSRF / visitor-id cookie naming in `proxy.ts`.
 */
export const LANDING_VARIANT_COOKIE = isProduction ? "__Host-liq_lv" : "__liq_lv";

/**
 * Request header `proxy.ts` sets so `app/page.tsx` renders the correct arm on
 * the same request that mints the cookie (see module doc above).
 */
export const LANDING_VARIANT_HEADER = "x-landing-variant";

/** Type guard for a raw cookie/header/string value. */
export function isLandingVariant(value: string | null | undefined): value is LandingVariant {
  return (
    value === "control" ||
    value === "white" ||
    value === "white_prev" ||
    value === "white_card" ||
    value === "white_video"
  );
}

/**
 * The two arms currently in the test, in reading order (A, then B). `control`,
 * `white` and `white_prev` are history: valid on stored rows, never assigned.
 */
export const LANDING_VARIANT_ARMS = [
  "white_card",
  "white_video",
] as const satisfies readonly LandingVariant[];

export type LiveLandingArm = (typeof LANDING_VARIANT_ARMS)[number];

/** True only for an arm the current test assigns — not for a valid but retired value. */
export function isLiveLandingArm(value: string | null | undefined): value is LiveLandingArm {
  return value === "white_card" || value === "white_video";
}

/**
 * Normalize any raw value to a variant. Defaults to `"white"`: it renders arm A's page
 * (question 1 in the hero), and it is NOT a live arm, so an absent or unrecognised
 * value is never credited to either side of the test. Defaulting to `"white_card"`
 * would hand every buyer without a cookie (checkout-session's Stripe metadata) to A.
 */
export function normalizeLandingVariant(value: string | null | undefined): LandingVariant {
  return isLandingVariant(value) ? value : "white";
}
