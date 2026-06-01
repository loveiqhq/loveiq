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

/**
 * Returns the base URL that EMAIL `<img>` tags should use for their `src`.
 *
 * Mail clients (notably Gmail) treat remote images hosted on a domain that
 * does not align with the authenticated sending domain as suspicious and may
 * strip them, so the logo / testimonial photos silently fail for some
 * recipients. Resend surfaces this as a "Host images on the sending domain"
 * deliverability warning when images live on `www.loveiq.org` but mail is
 * sent from `send.loveiq.org`.
 *
 * Set `EMAIL_IMAGE_BASE_URL` to a host aligned with the sending domain
 * (e.g. `https://send.loveiq.org`) — but ONLY once that host actually serves
 * the `/public` assets (add it to the Vercel project first, otherwise every
 * email image 404s). When unset, falls back to `fallbackSiteUrl` (the link
 * base already threaded into the template) so behaviour is unchanged and
 * nothing can break. Staging/preview/non-localhost-http values are rejected to
 * the safe fallback, matching {@link getEmailSiteUrl}.
 */
export function getEmailImageBaseUrl(fallbackSiteUrl?: string): string {
  const fallback = fallbackSiteUrl?.trim().replace(/\/$/, "") || getEmailSiteUrl();
  const raw = process.env.EMAIL_IMAGE_BASE_URL?.trim();
  if (!raw) return fallback;
  const cleaned = raw.replace(/\/$/, "");
  if (STAGING_PATTERNS.some((p) => p.test(cleaned))) {
    return fallback;
  }
  return cleaned;
}
