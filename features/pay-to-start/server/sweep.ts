import type Stripe from "stripe";
import {
  applyPayToStartEntitlement,
  reportPayToStartApplyFailure,
  settlePayToStartSession,
} from "@features/checkout/server/fulfillment";
import logger from "@shared/observability/logger";
import { listBoundUnapplied, listPendingForReconcile } from "./entitlement";

/**
 * The payment sweep's two pay-to-start steps (app/api/cron/payment-fulfillment-sweep, twice
 * an hour). A payment is normally confirmed within seconds, by the webhook or the status
 * page; this catches what both missed:
 *
 *   1. entitlements paid and claimed by a survey whose report was never unlocked (a
 *      failure between the claim's two steps). Applied again: idempotent. First, because
 *      these buyers are reading a locked report now.
 *   2. checkouts pending 10 minutes to 48 hours since the row last changed: a tab closed
 *      on Stripe before the redirect, with the webhook down. Stripe is asked, oldest
 *      first, `limit` a run; a paid one runs the first-payment effects (the confirmation
 *      email, and the unlock when a survey already claimed it) and an expired one is
 *      marked so. Older than 48 hours, every session has long expired.
 *
 * Each step has its own share of the run (`stepBudgetMs`, checked between rows): a backlog
 * in one, of abandoned checkouts or of rows that keep failing to apply, cannot spend the
 * other's. Never throws; each row's failure is counted and logged, an apply failure also
 * alerted.
 */

const SETTLE_AFTER_MS = 10 * 60 * 1000;
/** Half of the 10 s the cron gives pay to start (payment-fulfillment-sweep). */
const STEP_BUDGET_MS = 5_000;
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
  stepBudgetMs = STEP_BUDGET_MS,
}: {
  stripe: Stripe;
  now?: Date;
  limit?: number;
  /** The cron's SIGTERM flag and time budget: stop between rows rather than be cut off. */
  shouldStop?: () => boolean;
  stepBudgetMs?: number;
}): Promise<PayToStartSweepSummary> {
  const summary: PayToStartSweepSummary = { reconciled: 0, paid: 0, applied: 0, errors: 0 };
  const spent = (since: number) => Date.now() - since > stepBudgetMs;

  try {
    const since = Date.now();
    const unapplied = await listBoundUnapplied(limit);
    for (const row of unapplied) {
      if (shouldStop()) return summary;
      if (spent(since)) break;
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

  try {
    const since = Date.now();
    const pending = await listPendingForReconcile({
      limit,
      newerThan: new Date(now.getTime() - GIVE_UP_AFTER_MS),
      olderThan: new Date(now.getTime() - SETTLE_AFTER_MS),
    });
    for (const row of pending) {
      if (shouldStop() || spent(since)) return summary;
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

  return summary;
}
