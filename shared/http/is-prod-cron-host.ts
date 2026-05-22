// https or http (we never expect http in prod but accept it as a no-op
// match for completeness); apex OR www subdomain of loveiq.org; nothing else.
// Apex prod env still passes — Vercel's apex→www 308 doesn't affect this check.
const PROD_HOST_PATTERN = /^https?:\/\/(www\.)?loveiq\.org$/i;

/**
 * Returns true iff this code is running on the PRODUCTION Vercel project's
 * production deployment. False for the staging project, preview deployments,
 * and local dev.
 *
 * Why this matters: the Vercel account has two projects sharing one Supabase
 * DB — loveiq-web (main branch → www.loveiq.org) and loveiq-staging
 * (staging branch → staging.loveiq.org). Vercel runs cron jobs on each
 * project's production deployment. Without this gate, the staging project's
 * crons fan out across real prod users in the shared DB: nurture/invite
 * emails arrive with staging URLs, payment-fulfillment sweeps would mutate
 * real prod data, and Slack ops alerts double-post. Every cron route calls
 * this and returns 200 OK with `{skipped: true, reason: "non-prod-cron-host"}`
 * if it's false, so Vercel doesn't retry.
 *
 * The discriminator is NEXT_PUBLIC_SITE_URL (already configured per project).
 * Accepts the canonical prod URL with or without the www subdomain, so the
 * Production env can legitimately be `https://loveiq.org` OR
 * `https://www.loveiq.org` and both work. Anything else — staging subdomain,
 * vercel.app preview alias, localhost, blank — disables the cron's prod work.
 */
export function isProdCronHost(): boolean {
  const site = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "");
  if (!site) return false;
  return PROD_HOST_PATTERN.test(site);
}
