/**
 * Trustpilot configuration, sourced from NEXT_PUBLIC_* env (client-safe,
 * build-time inlined). The live cookie-setting widget only activates when a
 * Business Unit ID is present; the cookieless static block renders regardless.
 *
 * Env vars (all optional — the site renders without them):
 *   NEXT_PUBLIC_TRUSTPILOT_BUSINESS_UNIT_ID  → enables the live widget
 *   NEXT_PUBLIC_TRUSTPILOT_DOMAIN            → builds the public profile link
 *   NEXT_PUBLIC_TRUSTPILOT_TEMPLATE_ID_CAROUSEL / _MICRO → TrustBox templates
 *   NEXT_PUBLIC_TRUSTPILOT_SCORE / _REVIEW_COUNT → static block numbers
 *
 * IMPORTANT: each env var below is referenced by its full static name so Next.js
 * can inline it into the client bundle. Do not refactor to dynamic (computed)
 * key access on the env object — that breaks inlining.
 */

// Trustpilot's public TrustBox template ids (identical for every business —
// see Trustpilot Business → Integrations → TrustBox). Overridable via env.
const DEFAULT_TEMPLATE_CAROUSEL = "53aa8807dec7e10d38f59f32"; // Review Carousel
const DEFAULT_TEMPLATE_MICRO = "5419b6ffb0d04a076446a9af"; // Micro Combo (score + stars + count)

export interface TrustpilotConfig {
  /** Trustpilot Business Unit ID. Null disables the live widget (static only). */
  businessUnitId: string | null;
  /** Review domain (e.g. "loveiq.org") used to build the public profile link. */
  domain: string | null;
  templateCarousel: string;
  templateMicro: string;
  /** Optional static-block values. Shown only when BOTH are set — never fabricated. */
  score: string | null;
  reviewCount: string | null;
  /** Public Trustpilot profile URL, or null when the domain is unknown. */
  profileUrl: string | null;
  locale: string;
}

const clean = (value: string | undefined): string | null => {
  const trimmed = (value ?? "").trim();
  return trimmed.length > 0 ? trimmed : null;
};

export function getTrustpilotConfig(): TrustpilotConfig {
  const businessUnitId = clean(process.env.NEXT_PUBLIC_TRUSTPILOT_BUSINESS_UNIT_ID);
  const domain = clean(process.env.NEXT_PUBLIC_TRUSTPILOT_DOMAIN);

  return {
    businessUnitId,
    domain,
    templateCarousel:
      clean(process.env.NEXT_PUBLIC_TRUSTPILOT_TEMPLATE_ID_CAROUSEL) ?? DEFAULT_TEMPLATE_CAROUSEL,
    templateMicro:
      clean(process.env.NEXT_PUBLIC_TRUSTPILOT_TEMPLATE_ID_MICRO) ?? DEFAULT_TEMPLATE_MICRO,
    score: clean(process.env.NEXT_PUBLIC_TRUSTPILOT_SCORE),
    reviewCount: clean(process.env.NEXT_PUBLIC_TRUSTPILOT_REVIEW_COUNT),
    profileUrl: domain ? `https://www.trustpilot.com/review/${domain}` : null,
    locale: "en-US",
  };
}

/**
 * Master kill switch for ALL on-site Trustpilot UI (landing sections + report
 * pricing modals + the bootstrap script). Defaults OFF so nothing Trustpilot
 * renders until we have enough reviews — the integration stays in the codebase,
 * just hidden. Flip on by setting NEXT_PUBLIC_TRUSTPILOT_ENABLED to the string
 * true in the Vercel env (no code change needed). Referenced by its full name so
 * Next.js inlines it into the client bundle — do not refactor to dynamic access.
 */
export const isTrustpilotEnabled = (): boolean =>
  (process.env.NEXT_PUBLIC_TRUSTPILOT_ENABLED ?? "").trim() === "true";

/** True when the live, cookie-setting Trustpilot widget can be loaded (post-consent). */
export const isTrustpilotLiveConfigured = (config: TrustpilotConfig): boolean =>
  config.businessUnitId !== null;

/** Where the "See our reviews" link points when no domain is configured. */
export const TRUSTPILOT_FALLBACK_URL = "https://www.trustpilot.com";
