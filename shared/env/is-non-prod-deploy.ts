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
