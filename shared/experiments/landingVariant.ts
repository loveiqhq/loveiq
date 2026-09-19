/**
 * Landing-page variant.
 *
 * ROUND 1 (concluded 2026-06-19): dark landing ("control") vs the white redesign
 * ("white"), 50/50. White won on visitor->survey (~7.9% vs ~4.9%), the dark
 * landing was retired and white served 100% of traffic. `"control"` is retained
 * below because historical analytics / Stripe metadata rows still carry it; no
 * new traffic is ever tagged with it.
 *
 * ROUND 2 (from 2026-08-21): the white landing was rebuilt to the "Landing E"
 * frame on 2026-08-10 (question 1 on the page, new hero, trust strip, find-out
 * block, sticky CTA). This test puts that rebuild against the white landing that
 * preceded it, 50/50:
 *   - `"white"`      — the current landing, features/landing/ui/white/
 *   - `"white_prev"` — the one before the rebuild, features/landing/ui/white-v1/
 *
 * The variant flows through the funnel for attribution:
 *   - `LandingPageTracker` sets it as a GA4 user property and fires
 *     `experiment_exposure` for LANDING_VARIANT_EXPERIMENT.
 *   - `persistAnalyticsEvent` (features/analytics/client.ts) auto-stamps
 *     `landing_variant` (read from this cookie) onto every durable event.
 *   - `/api/survey` reads the cookie server-side and packs it into the
 *     `utm_tracker` JSON on the submission — the source of truth the admin
 *     Funnels -> "Landing A/B" tab groups by.
 *   - `/api/stripe/checkout-session` stamps it into Stripe session metadata.
 */

const isProduction = process.env.NODE_ENV === "production";

export type LandingVariant = "control" | "white" | "white_prev";

/**
 * Bumped for round 2 so GA4 keeps the two tests apart: rows tagged
 * `landing-white-ab` are dark-vs-white, `landing-white-rebuild-ab` is
 * current-vs-previous white.
 */
export const LANDING_VARIANT_EXPERIMENT = "landing-white-rebuild-ab";

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
  return value === "control" || value === "white" || value === "white_prev";
}

/** The two arms currently in the test. `control` is history, never assigned. */
export const LANDING_VARIANT_ARMS = [
  "white",
  "white_prev",
] as const satisfies readonly LandingVariant[];

/**
 * Normalize any raw value to a variant. Defaults to `"white"` — the live arm — so
 * an absent or unrecognised value never invents an arm that is not being served.
 */
export function normalizeLandingVariant(value: string | null | undefined): LandingVariant {
  return isLandingVariant(value) ? value : "white";
}
