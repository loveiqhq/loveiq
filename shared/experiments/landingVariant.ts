/**
 * White-landing variant.
 *
 * Originally a 50/50 A/B between the dark landing ("control") and a white
 * redesign ("white") at `/`. The A/B concluded in favour of white (decision
 * 2026-06-19): the dark landing was retired and `proxy.ts` now serves "white"
 * to 100% of traffic. The sticky `__liq_lv` cookie + `x-landing-variant` header
 * are still minted (now always "white") so the attribution plumbing below keeps
 * working and historical rows stay comparable.
 *
 * The `"control"` type member is retained because historical analytics / Stripe
 * metadata rows still carry it; no new traffic is ever tagged "control".
 *
 * The variant flows through the funnel for attribution (now constant "white"):
 *   - `persistAnalyticsEvent` (features/analytics/client.ts) auto-stamps
 *     `landing_variant` (read from this cookie) onto every durable event.
 *   - `/api/survey` reads the cookie server-side and packs it into the
 *     `utm_tracker` JSON on the submission.
 *   - `/api/stripe/checkout-session` stamps it into Stripe session metadata.
 */

const isProduction = process.env.NODE_ENV === "production";

export type LandingVariant = "control" | "white";

export const LANDING_VARIANT_EXPERIMENT = "landing-white-ab";

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
  return value === "control" || value === "white";
}

/** Normalize any raw value to a variant, defaulting to the dark control. */
export function normalizeLandingVariant(value: string | null | undefined): LandingVariant {
  return value === "white" ? "white" : "control";
}
