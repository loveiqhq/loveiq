import type Stripe from "stripe";
import {
  applyPayToStartEntitlement,
  reportPayToStartApplyFailure,
  settlePayToStartSession,
} from "@features/checkout/server/fulfillment";
import logger from "@shared/observability/logger";
import { listBoundUnapplied, listPendingForReconcile } from "./entitlement";

/**
 * The hourly payment sweep's two pay-to-start steps (app/api/cron/payment-fulfillment-sweep).
 * A payment is normally confirmed within seconds, by the webhook or the status page; this
 * catches what both missed:
 *
 *   1. checkouts still pending 10 minutes to 48 hours after they started: a tab closed
 *      on Stripe before the redirect, with the webhook down. Stripe is asked; a paid one
 *      runs the first-payment effects (the confirmation email among them) and an expired
 *      one is marked so. Older than 48 hours, every session has long expired.
 *   2. entitlements paid and claimed by a survey whose report was never unlocked (a
 *      failure between the claim's two steps). Applied again: idempotent.
 *
 * Never throws; each row's failure is counted and logged, an apply failure also alerted.
 */

const SETTLE_AFTER_MS = 10 * 60 * 1000;
const GIVE_UP_AFTER_MS = 48 * 60 * 60 * 1000;

export interface PayToStartSweepSummary {
  reconciled: number;
  paid: number;
  applied: number;
  errors: number;
}

export async function sweepPayToStart({
  stripe,
  now = new Date(),
  limit = 25,
  shouldStop = () => false,
}: {
  stripe: Stripe;
  now?: Date;
  limit?: number;
  /** The cron's SIGTERM flag: stop between rows rather than be cut off mid-write. */
  shouldStop?: () => boolean;
}): Promise<PayToStartSweepSummary> {
  const summary: PayToStartSweepSummary = { reconciled: 0, paid: 0, applied: 0, errors: 0 };

  try {
    const pending = await listPendingForReconcile({
      limit,
      newerThan: new Date(now.getTime() - GIVE_UP_AFTER_MS),
      olderThan: new Date(now.getTime() - SETTLE_AFTER_MS),
    });
    for (const row of pending) {
      if (shouldStop()) return summary;
      if (!row.stripe_session_id) continue;
      try {
        const settled = await settlePayToStartSession({
          sessionId: row.stripe_session_id,
          source: "sweep",
          stripe,
        });
        summary.reconciled += 1;
        if (settled.state === "paid") summary.paid += 1;
      } catch (err) {
        summary.errors += 1;
        logger.error(
          { err: err instanceof Error ? err.message : err, entitlementId: row.id },
          "pay-to-start sweep: reconciling a pending checkout failed"
        );
      }
    }
  } catch (err) {
    summary.errors += 1;
    logger.error(
      { err: err instanceof Error ? err.message : err },
      "pay-to-start sweep: listing pending checkouts failed"
    );
  }

  try {
    const unapplied = await listBoundUnapplied(limit);
    for (const row of unapplied) {
      if (shouldStop()) return summary;
      try {
        if (await applyPayToStartEntitlement({ entitlement: row, stripe })) summary.applied += 1;
      } catch (err) {
        summary.errors += 1;
        await reportPayToStartApplyFailure(row, err, "sweep");
      }
    }
  } catch (err) {
    summary.errors += 1;
    logger.error(
      { err: err instanceof Error ? err.message : err },
      "pay-to-start sweep: listing unapplied entitlements failed"
    );
  }

  return summary;
}
