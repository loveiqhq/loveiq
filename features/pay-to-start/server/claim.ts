import {
  applyPayToStartEntitlement,
  settlePayToStartSession,
} from "@features/checkout/server/fulfillment";
import { getStripeServerClient } from "@features/checkout/server/stripeCheckout";
import logger from "@shared/observability/logger";
import { escapeSlack, notifySlack } from "@shared/observability/slack";
import {
  bindEntitlement,
  findEntitlementByConsumedSubmission,
  findEntitlementById,
  findEntitlementByToken,
  type Entitlement,
} from "./entitlement";

/**
 * A submitted survey claiming the entitlement its browser holds: bind it to this one
 * submission, then apply it (the payment row, report link and full-report tier), before
 * the survey's response goes out, so the reader opens a report that is already unlocked.
 *
 * Never throws: the survey is saved whatever happens here. An error is returned for the
 * caller to report after the response, and the sweep finishes any bound, paid entitlement
 * left unapplied.
 */

export type ClaimOutcome =
  /** Bound and applied: the report is fully unlocked. */
  | { outcome: "unlocked"; entitlementId: number; paymentId: number }
  /** Bound, and the money is on its way (a delayed method): it unlocks when it settles. */
  | { outcome: "pending"; entitlementId: number }
  /**
   * Bound, but nothing was paid: a checkout opened and left. Paying it later (or a new
   * checkout from the page, under the same token) unlocks this report by itself.
   */
  | { outcome: "unpaid"; entitlementId: number }
  /** Nothing this submission may claim. */
  | {
      outcome: "refused";
      reason: "not_found" | "used" | "refunded" | "expired";
      entitlementId?: number;
    }
  /** Something failed; the reader gets the free report until the sweep catches up. */
  | { outcome: "error"; entitlementId?: number; error: unknown };

export async function claimPayToStartForSubmission({
  reportToken,
  submissionId,
  token,
}: {
  reportToken: string | null;
  submissionId: number;
  token: string;
}): Promise<ClaimOutcome> {
  let entitlementId: number | undefined;
  try {
    let entitlement = await findEntitlementByToken(token);
    if (!entitlement) return { outcome: "refused", reason: "not_found" };
    entitlementId = entitlement.id;

    if (entitlement.consumed_submission_id !== submissionId) {
      if (entitlement.consumed_submission_id || entitlement.payment_id) {
        return { outcome: "refused", reason: "used", entitlementId };
      }
      if (entitlement.status === "refunded") {
        return { outcome: "refused", reason: "refunded", entitlementId };
      }
      // An expired checkout, never paid: the bind filter would refuse it anyway.
      if (entitlement.status === "expired") {
        return { outcome: "refused", reason: "expired", entitlementId };
      }
      const won = await bindEntitlement({ id: entitlement.id, submissionId });
      const fresh = await findEntitlementById(entitlement.id);
      if (!fresh || fresh.consumed_submission_id !== submissionId) {
        // Another submission (a second tab) bound it first, or it was refunded meanwhile.
        logger.warn({ entitlementId, submissionId, won }, "pay-to-start: claim lost");
        return {
          outcome: "refused",
          reason: fresh?.status === "refunded" ? "refunded" : "used",
          entitlementId,
        };
      }
      entitlement = fresh;
    }

    return await applyClaimed(entitlement, reportToken);
  } catch (error) {
    return { outcome: "error", entitlementId, error };
  }
}

/** Apply a bound entitlement, or say why it does not unlock (yet). */
async function applyClaimed(
  entitlement: Entitlement,
  reportToken: string | null
): Promise<ClaimOutcome> {
  const entitlementId = entitlement.id;
  if (entitlement.payment_id) {
    return { outcome: "unlocked", entitlementId, paymentId: entitlement.payment_id };
  }
  switch (entitlement.status) {
    case "succeeded": {
      const paymentId = await applyPayToStartEntitlement({ entitlement, reportToken });
      return paymentId
        ? { outcome: "unlocked", entitlementId, paymentId }
        : { outcome: "error", entitlementId, error: new Error("pts_apply_returned_nothing") };
    }
    case "refunded":
      return { outcome: "refused", reason: "refunded", entitlementId };
    case "expired":
      return { outcome: "unpaid", entitlementId };
    case "pending":
      break;
  }

  // Still pending at the end of a nine-minute survey: a webhook that has not arrived, a
  // delayed method, or a checkout left open. Ask Stripe once; settling applies it when
  // it turns out paid.
  const stripe = getStripeServerClient();
  if (!entitlement.stripe_session_id || !stripe) return { outcome: "unpaid", entitlementId };
  const settled = await settlePayToStartSession({
    sessionId: entitlement.stripe_session_id,
    source: "claim",
    stripe,
  });
  switch (settled.state) {
    case "paid":
      return settled.paymentId
        ? { outcome: "unlocked", entitlementId, paymentId: settled.paymentId }
        : { outcome: "error", entitlementId, error: new Error("pts_apply_after_settle_failed") };
    case "processing":
      return { outcome: "pending", entitlementId };
    case "refunded":
      return { outcome: "refused", reason: "refunded", entitlementId };
    default:
      return { outcome: "unpaid", entitlementId };
  }
}

/**
 * A replayed submit (a lost response, a reload) without the cookie: the entitlement this
 * submission already claimed, so the reply still says it is unlocked. Null when none.
 *
 * Almost every replay is a free reader's, so a lookup that fails is "none known", never a
 * claim error: an error would put the journey in the reply (the paid wizard for a reader
 * who did not pay) and report a failed claim to #ops for them. Only applying an entitlement
 * that was found can fail as a claim; its buyer's report is finished by the sweep.
 */
export async function claimedEntitlementFor(submissionId: number): Promise<ClaimOutcome | null> {
  let entitlement: Entitlement | null;
  try {
    entitlement = await findEntitlementByConsumedSubmission(submissionId);
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : err, submissionId },
      "pay-to-start: claimed-entitlement lookup failed on a replay; treated as none"
    );
    return null;
  }
  if (!entitlement) return null;
  try {
    return await applyClaimed(entitlement, null);
  } catch (error) {
    return { outcome: "error", entitlementId: entitlement.id, error };
  }
}

/** What the survey's response tells the page, from a claim. */
export function claimResponseFields(claim: ClaimOutcome): {
  journey: "pay_to_start";
  unlocked: boolean;
  unlockPending?: true;
} {
  return {
    journey: "pay_to_start",
    unlocked: claim.outcome === "unlocked",
    ...(claim.outcome === "pending" ? { unlockPending: true as const } : {}),
  };
}

/**
 * Whether the browser's cookie has done its job. Cleared once the entitlement is bound
 * and paid (or on its way), or can never be claimed. Kept after an error, so a retry can
 * claim, and after an unpaid claim: the cookie is how a checkout from the page later
 * reuses this same token, so paying then unlocks the report this survey already has
 * (without it the page mints a new token, and the buyer would have to retake the survey).
 */
export function claimSettlesCookie(claim: ClaimOutcome): boolean {
  return claim.outcome !== "error" && claim.outcome !== "unpaid";
}

/**
 * After the reply. An error goes to #ops: the reader got the free report, and while the
 * sweep finishes an entitlement that was bound and paid, one that never bound needs a
 * person. A refusal or an unpaid claim is only logged, for support to find.
 */
export async function reportClaimProblem(claim: ClaimOutcome, submissionId: number): Promise<void> {
  if (claim.outcome === "refused" || claim.outcome === "unpaid") {
    logger.info(
      {
        submissionId,
        outcome: claim.outcome,
        ...(claim.outcome === "refused" ? { reason: claim.reason } : {}),
        entitlementId: claim.entitlementId ?? null,
      },
      "pay-to-start: survey submitted without unlocking"
    );
    return;
  }
  if (claim.outcome !== "error") return;
  const message = claim.error instanceof Error ? claim.error.message : "unknown";
  logger.error(
    { submissionId, entitlementId: claim.entitlementId ?? null, message },
    "pay-to-start: claim failed"
  );
  await notifySlack({
    channel: "ops",
    kind: "pts_claim_failed",
    text: `:rotating_light: Pay to start: submission #${submissionId} came with a paid-for entitlement${
      claim.entitlementId ? ` (#${claim.entitlementId})` : ""
    }, but claiming it failed (${escapeSlack(message)}). The reader sees the free report for now. The payment sweep finishes an entitlement that is bound and paid; one that never bound needs attaching by hand.`,
    username: "ops_alerts",
  }).catch(() => undefined);
}
