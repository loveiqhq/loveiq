/**
 * Coupled report-paywall — now FORCED for every identifiable report.
 *
 * Originally a 50/50 A/B keyed on the report token (treatment = non-closable
 * scroll modal + a must-pay final wizard slide; control = dismissible "pay
 * later"). The experiment was concluded in favour of the forced experience, so
 * every dark/unpaid report viewer now gets "treatment".
 *
 * The landing A/B (dark vs white) is purely cosmetic and does NOT affect this
 * resolver — both arms take the same survey and hit the same forced report
 * paywall. Two escape hatches remain in resolveReportPaywallCohort: the dev
 * `?arm=` preview and the email-return softener (re-engagement links must never
 * trap a returning user in a wall they can't close).
 *
 * Kept as a single resolver (not inlined) so the wizard, the report modal, and
 * the server-side attribution stamp all agree on one value per report.
 */
export const FORCED_PAYWALL_EXPERIMENT = "report-forced-paywall";

export type ForcedPaywallCohort = "treatment" | "control";

/**
 * Resolve the coupled paywall arm for a report token. Now 100% "treatment" for
 * any identifiable report. A missing token can't be tied to a report, so it
 * stays "control" — we never force a user we can't bucket, which also keeps
 * null-token wizard/preview states soft.
 */
export function getForcedPaywallCohort(token: string | null | undefined): ForcedPaywallCohort {
  return token ? "treatment" : "control";
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
 * layering the email-return escape hatch on top of the (now-forced) base arm.
 *
 * Precedence:
 *   1. `devArm` — dev-only `?arm=` preview override (null in production).
 *   2. `fromEmail` — a visit that arrived from one of our email links always
 *      gets the soft "control" experience (dismissible scroll modal, blurred
 *      premium sections, pay-if-you-want) instead of the forced hard wall.
 *      Re-engagement emails should never slam a returning user with a paywall
 *      they can't close. The server still stamps the base arm onto
 *      `report_price_quote.forced_paywall_arm` for attribution.
 *   3. Otherwise "treatment" for any identifiable token — the forced paywall is
 *      now the standard experience (the 50/50 A/B was concluded). Only a missing
 *      token falls back to "control".
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
