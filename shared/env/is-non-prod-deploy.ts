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
/**
 * Which Vercel environment this build was produced for: "production" | "preview" |
 * "development". Undefined off Vercel (a laptop, CI), which every caller below treats as
 * "no opinion" so behaviour there is unchanged.
 *
 * WHY THIS EXISTS. Both gates below used to discriminate on `NEXT_PUBLIC_SITE_URL` alone,
 * and that variable is ONE value shared by the Production, Preview and Development
 * environments of this Vercel project — `https://www.loveiq.org`. So every preview
 * deployment satisfied the production host allowlist and identified as the live site:
 * `isProductionSite()` returned true there, which loaded GA4, GTM, Clarity and the Google
 * Ads conversion path on preview builds, and stamped `deploy_env: "production"` on their
 * PostHog events. Measured 2026-09-14: a preview served the identical analytics tags as
 * production, and there was no way to tell such traffic apart afterwards.
 *
 * The site URL is a CONTENT setting — it decides canonical tags, sitemap entries and the
 * links in emails. Overloading it as an ENVIRONMENT discriminator is what broke; this is
 * the environment asking what environment it is. Vercel stamps it per DEPLOYMENT and it is
 * inlined at build time, so it cannot be flipped at runtime on the production project —
 * the property the original comment wanted from the site URL, actually delivered.
 *
 * Verified on a live preview rather than assumed: /api/build-info reports VERCEL_ENV
 * "production" on www.loveiq.org and "preview" on a preview deployment.
 */
function vercelEnvironment(): string | undefined {
  return process.env.NEXT_PUBLIC_VERCEL_ENV?.trim().toLowerCase() || undefined;
}

export function isNonProdDeploy(): boolean {
  if (process.env.NODE_ENV !== "production") return true;
  // A deployment Vercel built for anything other than production IS non-production,
  // whatever site URL was baked into it. Additive: absent (off Vercel) changes nothing,
  // and on the production deployment this is "production" and falls through untouched.
  const environment = vercelEnvironment();
  if (environment && environment !== "production") return true;
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
  // A preview deployment is never the live site, however production its baked site URL
  // looks. This is the half that stopped preview traffic reporting into the production
  // GA4 property, the Google Ads conversion path and Clarity. Checked BEFORE the host
  // allowlist because the allowlist is exactly what a preview build passes.
  const environment = vercelEnvironment();
  if (environment && environment !== "production") return false;
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
