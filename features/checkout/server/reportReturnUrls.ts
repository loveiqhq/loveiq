import type { ReportPurchasePlanId } from "@features/checkout/server/reportPurchase";
import type { INITIAL_UNLOCK_PLAN } from "@features/report/logic/initialUnlock";

/**
 * Where Stripe returns a report's buyer: `/checkout/return`, which waits for the payment to
 * land and then opens the report. Shared by the report checkout and the EUR 1.99 gate's
 * (`plan=initial`, app/api/stripe/initial-unlock).
 */
export function buildSuccessUrl({
  anchor,
  archetypeSlug,
  origin,
  plan,
  reportToken,
}: {
  anchor?: string | null;
  archetypeSlug?: string | null;
  origin: string;
  plan: ReportPurchasePlanId | typeof INITIAL_UNLOCK_PLAN;
  reportToken?: string | null;
}) {
  const params = [`plan=${encodeURIComponent(plan)}`, "session_id={CHECKOUT_SESSION_ID}"];

  if (reportToken) {
    params.push(`token=${encodeURIComponent(reportToken)}`);
  }

  if (archetypeSlug) {
    params.push(`archetype=${encodeURIComponent(archetypeSlug)}`);
  }

  if (anchor) {
    params.push(`anchor=${encodeURIComponent(anchor)}`);
  }

  return `${origin}/checkout/return?${params.join("&")}`;
}

/**
 * Where Stripe sends a buyer who backs out.
 *
 * Straight back to the report they came from, since the `/checkout` review page
 * they used to land on was removed on 2026-08-31. An archetype-scoped purchase
 * returns to that archetype's view so the reader is where they left off.
 */
export function buildCancelUrl({
  anchor,
  archetypeSlug,
  origin,
  reportToken,
}: {
  anchor?: string | null;
  archetypeSlug?: string | null;
  origin: string;
  reportToken?: string | null;
}) {
  const path = reportToken ? `/report/${encodeURIComponent(reportToken)}` : "/report";
  const params = new URLSearchParams();
  if (archetypeSlug) params.set("archetype", archetypeSlug);
  // Backing out of Stripe returns the reader to where they were too.
  if (anchor) params.set("anchor", anchor);
  const query = params.toString();
  return query ? `${origin}${path}?${query}` : `${origin}${path}`;
}
