const PROD_SITE_URL = "https://www.loveiq.org";

/**
 * Returns true iff this code is running on the PRODUCTION Vercel project's
 * production deployment. False for the staging project, preview deployments,
 * and local dev.
 *
 * Why this matters: the Vercel account has two projects sharing one Supabase
 * DB — `loveiq-web` (main branch → www.loveiq.org) and `loveiq-staging`
 * (staging branch → staging.loveiq.org). Vercel runs cron jobs on each
 * project's production deployment. Without this gate, the staging project's
 * crons fan out across real prod users in the shared DB: nurture/invite
 * emails arrive with staging URLs, payment-fulfillment sweeps would mutate
 * real prod data, and Slack ops alerts double-post. Every cron route calls
 * this and returns 200 OK with `{skipped: true, reason: "non-prod-cron-host"}`
 * if it's false, so Vercel doesn't retry.
 *
 * The discriminator is NEXT_PUBLIC_SITE_URL (already configured per project).
 * Coercion-equivalent to the canonical prod URL is required; any other value
 * — including a misconfigured Production env — disables the cron's prod work.
 */
export function isProdCronHost(): boolean {
  const site = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "");
  return site === PROD_SITE_URL;
}
