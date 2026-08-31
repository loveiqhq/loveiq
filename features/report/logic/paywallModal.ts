import type { ReportAccessPlan } from "../server/access";

/**
 * Decide whether to auto-open the pricing modal in "offer" variant for an
 * `?offer=1` email deep-link (nurture / discount CTA).
 *
 * The hard rule this enforces: a customer who has already purchased ANY plan
 * is NEVER auto-shown the payment modal again. Re-engagement emails always
 * carry `?offer=1`, and an already-paid user can click an old one from their
 * inbox — they must land on their report, not a checkout prompt. Upgrades to a
 * higher tier still happen on demand via the in-report locked-section CTAs.
 *
 * Pure + side-effect-free so the gate is unit-tested independently of the React
 * effect that consumes it.
 */
export function shouldAutoOpenOfferModal({
  isOfferLink,
  accessPlan,
  viewMode,
}: {
  isOfferLink: boolean;
  accessPlan: ReportAccessPlan;
  viewMode: "owner" | "shared";
}): boolean {
  // Not an offer deep-link — nothing to auto-open.
  if (!isOfferLink) return false;
  // Already purchased — never re-prompt a paying customer.
  if (accessPlan !== null) return false;
  // Shared (recipient) views never see the owner paywall.
  if (viewMode === "shared") return false;
  return true;
}
