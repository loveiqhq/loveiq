/**
 * Is this build running somewhere OTHER than the live site?
 *
 * True in local dev, on the staging project, and on Vercel preview deploys.
 * False on production — and false for an unknown or empty site URL, which is the
 * important half: every caller so far uses this to relax something that protects
 * the product, so an unrecognised environment must be treated as production
 * rather than opened up.
 *
 * The discriminator is the build-time `NEXT_PUBLIC_SITE_URL`, which is already
 * configured per Vercel project (production → loveiq.org, staging →
 * staging.loveiq.org). Being build-time means it is inlined into the client
 * bundle, so client components can read it, and it cannot be flipped by a
 * runtime env change on the production project — which is the property you want
 * for a control that must never accidentally come on in front of customers.
 *
 * Extracted from `shared/experiments/surveyVariant.ts`, which had this logic
 * privately; that module now imports it so the two cannot drift.
 */
export function isNonProdDeploy(): boolean {
  if (process.env.NODE_ENV !== "production") return true;
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "").toLowerCase();
  return siteUrl.includes("staging.") || siteUrl.includes(".vercel.app");
}

/**
 * Production hostnames of the live site, as `NEXT_PUBLIC_SITE_URL` can be set to
 * them. Only the host the production Vercel project actually bakes in
 * (`www.loveiq.org`) plus its apex — the other aliases (loveiq.de, myloveiq.org,
 * tryloveiq.com, loveiqreport.com) redirect to it and are never the baked value.
 *
 * If `NEXT_PUBLIC_SITE_URL` is ever pointed at a different production host, add it
 * here or third-party analytics goes quiet on the live site.
 */
const PRODUCTION_HOSTS = new Set(["www.loveiq.org", "loveiq.org"]);

/**
 * Is this build the live public site? Used to decide whether a third-party
 * analytics tag may load at all.
 *
 * NOT the inverse of `isNonProdDeploy()`, and the difference is the whole point.
 * The two gates guard opposite risks, so they must fail in opposite directions:
 *
 *   - `isNonProdDeploy()` relaxes a protection (report copy-blocking). An
 *     unrecognised environment must be treated as PRODUCTION, or a renamed
 *     environment silently unlocks the paid report. It therefore matches
 *     non-production by pattern and defaults to "production".
 *   - `isProductionSite()` decides whether to send data to the production GA4 /
 *     Google Ads / Clarity properties. An unrecognised environment must be
 *     treated as NOT production, or a dev machine's traffic is silently mixed
 *     into the numbers marketing reports on. It therefore matches production by
 *     ALLOWLIST and defaults to "not production".
 *
 * Writing this as `!isNonProdDeploy()` would have kept the one hole that matters
 * most for this use: `npm run build && npm start` on a laptop has
 * NODE_ENV=production and a localhost site URL, which is neither "staging." nor
 * ".vercel.app" — so it read as production and would have gone on reporting a
 * developer's clicks as customer traffic. Localhost is exactly the case marketing
 * asked to separate out.
 */
export function isProductionSite(): boolean {
  if (process.env.NODE_ENV !== "production") return false;
  const raw = (process.env.NEXT_PUBLIC_SITE_URL ?? "").trim();
  if (!raw) return false;
  try {
    const url = new URL(raw);
    // https only: an http URL claiming a production host is not the live site.
    if (url.protocol !== "https:") return false;
    return PRODUCTION_HOSTS.has(url.hostname.toLowerCase());
  } catch {
    // Not a parseable URL — cannot be the live site.
    return false;
  }
}
