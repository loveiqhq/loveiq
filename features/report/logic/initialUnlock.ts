/**
 * The initial unlock, "Core Archetype unlocked": what EUR 1.99 buys before the full report
 * (Figma Report-3.0: the Pre-Paywall board 1604:2328 and its E06 email; Pay to start >
 * Pre-Payments 1741:5587). The reader's own Core Archetype card and its Summary open in
 * full, every chapter a free reader gets stays as it is, and the full report costs EUR 10
 * less ("€10 credit toward the full Premium Report").
 *
 * Not a report purchase plan: it never enters `isReportPurchasePlan`, the price tables or
 * `archetype_tiers`, so every pay screen keeps selling the full report to its buyers. A
 * succeeded payment whose `metadata.plan` is this key grants it, for that report; a refund
 * (the payment is no longer succeeded) takes it back. Shared by pay to start's EUR 1.99
 * offer and the forced EUR 1.99 paywall after the wizard ("RFD > Pre-Unlock").
 */
export const INITIAL_UNLOCK_PLAN = "initial";

/** "€10 credit toward the full Premium Report": taken off the full report's price. */
export const INITIAL_UNLOCK_CREDIT_CENTS = 1000;

/**
 * The gate it opens beyond the free view: `summary` covers the Core Archetype card and the
 * Summary chapter (Part II of the slimmed report, one gate on the server).
 */
export const INITIAL_UNLOCK_SECTION_ID = "summary";

export function isInitialUnlockPlan(value: unknown): value is typeof INITIAL_UNLOCK_PLAN {
  return value === INITIAL_UNLOCK_PLAN;
}

/**
 * How a reader holds the initial unlock: bought it (the EUR 1.99), or only E07's gift (its
 * EUR 0 row). The full report's exit page words the EUR 10 by it (server/personalReport.ts
 * initialUnlockSourceOf).
 */
export type InitialUnlockSource = "paid" | "gift";
