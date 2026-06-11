/**
 * White-landing A/B experiment.
 *
 * A 50/50 split between the existing dark landing page ("control") and a new
 * white redesign ("white"), both served at the same `/` URL. Assignment is a
 * sticky, no-PII functional cookie minted in `proxy.ts` on the first `/` visit
 * (random, 1yr). The chosen variant is handed to the server render via the
 * `x-landing-variant` request header — NOT by reading the cookie in the page —
 * because on the very request that mints the cookie, `cookies()` would not yet
 * see it and 50% of brand-new visitors would wrongly render the dark control on
 * their first impression. The header is set on the SAME request the cookie is
 * minted, so the first paint is always the assigned arm.
 *
 * Search-engine / AI crawlers are forced to "control" in middleware so the dark
 * page stays the single indexed version (no cloaking, stable SEO).
 *
 * The variant also flows through the funnel for attribution:
 *   - `persistAnalyticsEvent` (features/analytics/client.ts) auto-stamps
 *     `landing_variant` (read from this cookie) onto every durable event.
 *   - `/api/survey` reads the cookie server-side and packs it into the
 *     `utm_tracker` JSON on the submission (headline metric source).
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
