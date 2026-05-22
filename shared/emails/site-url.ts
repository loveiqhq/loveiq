const PROD_SITE_URL = "https://www.loveiq.org";

// Anything matching these patterns gets coerced to PROD_SITE_URL. Order
// matters: localhost is allowed through (dev), everything else http or
// containing "staging" / "preview" / vercel.app is rejected as a safety net.
const STAGING_PATTERNS: RegExp[] = [
  /staging/i,
  /preview/i,
  /\.vercel\.app(\/|$)/i,
  // http:// that isn't localhost (loveiq.org would be https anyway).
  /^http:\/\/(?!localhost)/i,
];

/**
 * Returns the canonical https URL that user-facing emails should link to.
 *
 * Reads NEXT_PUBLIC_SITE_URL. If the env var is unset, blank, or matches
 * any staging/preview pattern, returns the hardcoded prod URL so a
 * misconfiguration on Vercel (e.g. Production env accidentally pointing to a
 * Preview alias) cannot result in users receiving staging links. Strips the
 * trailing slash so callers can safely template `${siteUrl}/path`.
 *
 * Scope: EMAIL templates only. Page/SEO surfaces (sitemap, robots, OG tags,
 * canonical URLs) should keep reading the env var directly so previews /
 * staging deployments can self-identify under their actual hostname.
 */
 
export function getEmailSiteUrl(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!raw) return PROD_SITE_URL;
  const cleaned = raw.replace(/\/$/, "");
  if (STAGING_PATTERNS.some((p) => p.test(cleaned))) {
    return PROD_SITE_URL;
  }
  return cleaned;
}
