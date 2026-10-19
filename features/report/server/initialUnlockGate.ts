import { findEntitlementByConsumedSubmission } from "@features/pay-to-start/server/entitlement";
import logger from "@shared/observability/logger";

/**
 * Whether this survey was paid for up front (pay to start), for the EUR 1.99 gate: true for
 * an entitlement bound to it that is succeeded or pending, false for none or an expired or
 * refunded one, null when the lookup fails, and the gate then stands aside.
 *
 * Not hasBoundEntitlement: that counts expired and refunded rows, and turns a failed lookup
 * into false, which would gate a reader who paid during an outage. Pending stands aside
 * because the claim binds a pending row both for a payment still settling ("it unlocks when
 * it settles") and for a checkout opened and left, and only Stripe can tell them apart.
 * Standing aside never asks a settling buyer for EUR 1.99 again; an abandoned checkout reads
 * the free view until Stripe expires its session (24 h by default, checkout.session.expired
 * → markEntitlementExpired), and meets the gate after that.
 */
export async function hasLivePayToStartEntitlement(submissionId: number): Promise<boolean | null> {
  try {
    const entitlement = await findEntitlementByConsumedSubmission(submissionId);
    return (
      entitlement !== null &&
      (entitlement.status === "succeeded" || entitlement.status === "pending")
    );
  } catch (err) {
    logger.warn({ err, submissionId }, "pre-unlock: pay-to-start lookup failed, gate stands aside");
    return null;
  }
}
