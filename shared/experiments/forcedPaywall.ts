import { pickClientVariant } from "./clientBucket";

/**
 * Coupled report-paywall experiment.
 *
 * One 50/50 split, keyed on the report token, drives BOTH treatments together:
 *   - "treatment" → the pre-report wizard shows an extra final slide AND the
 *     scroll-triggered pricing modal becomes non-closable (must pay).
 *   - "control"   → no extra slide; the scroll modal stays dismissible (today's
 *     behaviour — the user can close it and pay later).
 *
 * Both surfaces (the wizard right after submit, and `/report/[token]`) key on
 * the SAME report token, so a given user lands in the same arm everywhere with
 * no server state. The wizard's `reportToken` (from `/api/survey`) is the exact
 * value used in the `/report/[token]` URL.
 */
export const FORCED_PAYWALL_EXPERIMENT = "report-forced-paywall";

export type ForcedPaywallCohort = "treatment" | "control";

/**
 * Resolve the coupled paywall arm for a report token. Missing token → control
 * (we never force a user we can't deterministically bucket).
 */
export function getForcedPaywallCohort(token: string | null | undefined): ForcedPaywallCohort {
  if (!token) return "control";
  return pickClientVariant(token, FORCED_PAYWALL_EXPERIMENT) === "a" ? "treatment" : "control";
}

/**
 * Dev-only preview override. Reads an `arm` query value (`treatment` |
 * `control`) so either arm can be previewed deterministically while running
 * `npm run dev` — append `?arm=treatment` to `/survey` or `/report/<token>`.
 *
 * Returns null outside development, so the whole branch is dead-code-eliminated
 * in production builds (NODE_ENV is statically replaced) and can never affect a
 * real user's bucketing.
 */
export function resolveDevCohortOverride(
  armParam: string | null | undefined
): ForcedPaywallCohort | null {
  // NODE_ENV is statically replaced at build time, so this branch is
  // dead-code-eliminated in production bundles.
  if (process.env.NODE_ENV !== "development") return null;
  return armParam === "treatment" || armParam === "control" ? armParam : null;
}

/**
 * Resolve the effective paywall arm for a single `/report/[token]` visit,
 * layering the email-return escape hatch on top of the deterministic bucketing.
 *
 * Precedence:
 *   1. `devArm` — dev-only `?arm=` preview override (null in production).
 *   2. `fromEmail` — a visit that arrived from one of our email links always
 *      gets the soft "control" experience (dismissible scroll modal, blurred
 *      premium sections, pay-if-you-want) instead of the forced hard wall.
 *      Re-engagement emails should never slam a returning user with a paywall
 *      they can't close. This does NOT change the user's true assigned arm —
 *      the server still recomputes the deterministic arm from the token for
 *      pricing + `report_price_quote.forced_paywall_arm` attribution, so A/B
 *      analysis by assigned arm is unaffected.
 *   3. Otherwise the normal deterministic 50/50 bucketing on the token.
 */
export function resolveReportPaywallCohort({
  devArm,
  fromEmail,
  token,
}: {
  devArm: ForcedPaywallCohort | null;
  fromEmail: boolean;
  token: string | null | undefined;
}): ForcedPaywallCohort {
  if (devArm) return devArm;
  if (fromEmail) return "control";
  return getForcedPaywallCohort(token);
}
