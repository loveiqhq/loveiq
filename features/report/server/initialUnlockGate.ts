import { findEntitlementByConsumedSubmission } from "@features/pay-to-start/server/entitlement";
import { needsInitialUnlockGate } from "@features/report/logic/initialUnlockGate";
import {
  isInitialUnlockGateEnabled,
  readInitialGateState,
} from "@features/report/server/initialGateState";
import { getReportAccessPlanForSubmission } from "@features/report/server/personalReport";
import { isFeatureEnabled } from "@shared/flags/system-flags";
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

/**
 * The gate's answer for an owner, for a route that acts for them without building the
 * report (the report route has every input at hand and feeds the rule itself). Each input
 * is read only once the earlier ones say the gate could still apply.
 */
export async function ownerMeetsInitialGate({
  personalReportId,
  submissionId,
}: {
  personalReportId: number;
  submissionId: number;
}): Promise<boolean> {
  if (!(await isInitialUnlockGateEnabled())) return false;
  const state = await readInitialGateState(personalReportId);
  if (!state?.cohortAt) return false;

  let access: Awaited<ReturnType<typeof getReportAccessPlanForSubmission>> | null = null;
  try {
    access = await getReportAccessPlanForSubmission(submissionId);
  } catch (err) {
    logger.warn({ err, submissionId }, "pre-unlock: purchases unread, gate stands aside");
  }
  const [paywallEnforced, livePayToStart] = await Promise.all([
    isFeatureEnabled("report_paywall_enforced", true).catch(() => true),
    hasLivePayToStartEntitlement(submissionId),
  ]);

  return needsInitialUnlockGate({
    gateEnabled: true,
    paywallEnforced,
    viewMode: "owner",
    inCohort: true,
    accessPlan: access?.accessPlan ?? null,
    purchasedPlan: access?.anyPlan ?? null,
    initialUnlock: access?.initialUnlock === true,
    livePayToStart,
    accessLookupFailed: access === null,
  });
}
