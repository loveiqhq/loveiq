import logger from "@shared/observability/logger";
import {
  ensurePaymentItem,
  updatePersonalReportPayment,
  upsertPaymentRecord,
} from "@features/checkout/server/fulfillment";
import { getPurchaseTitle } from "@features/checkout/server/reportPurchase";
import { isReportPurchasePlan } from "@features/report/server/access";
import {
  ensurePersonalReportForSubmission,
  resolveSubmissionAccessContext,
  supabaseServiceFetch,
  upsertArchetypeTierForPersonalReport,
} from "@features/report/server/personalReport";

/** `payment.metadata.source` on the free payment an answer unlocks the report with. */
export const UNLOCK_FEEDBACK_SOURCE = "unlock_feedback";

export type UnlockOutcome = { kind: "already_paid" } | { kind: "granted"; paymentId: number };

interface PaymentRow {
  id: number;
  metadata: Record<string, unknown> | null;
}

async function succeededPayments(personalReportId: number): Promise<PaymentRow[]> {
  const response = await supabaseServiceFetch(
    `/rest/v1/payment?personal_report_id=eq.${personalReportId}&status=eq.succeeded&select=id,metadata`
  );
  if (!response.ok) throw new Error("payment_lookup_failed");
  return (await response.json()) as PaymentRow[];
}

const grantIn = (payments: PaymentRow[]) =>
  payments.find((payment) => payment.metadata?.source === UNLOCK_FEEDBACK_SOURCE)?.id ?? null;

/**
 * The free full report for an answer to the unlock-feedback email: the access a 0 full_report
 * purchase gives, without Stripe. A succeeded payment of 0 with `metadata.plan = "full_report"`
 * and the reader's own archetype (what the report's access reads), its payment_item, the
 * personal_report payment fields and the archetype tier, as fulfillment writes them.
 *
 * It counts as gifted, never as a sale: every revenue and sales figure counts `amount > 0`
 * only, and nothing here sends the purchase email, the GA4, PostHog or Ads purchase, or the
 * Slack payment message (those live in the Stripe fulfillment, which this never calls). No
 * price quote is marked purchased either, so the price tests never read it as a conversion.
 *
 * Someone holding any plan already gets nothing (`already_paid`): a free unlock after paying
 * feels unfair (the design's "Paying customers" rule). Safe to run again: an earlier grant is
 * found and finished, never doubled, and the database refuses a second one outright
 * (`payment_unlock_feedback_once`, one per report), so a double tap's two requests agree on
 * one payment.
 */
export async function unlockForFeedback({
  archetype,
  submissionId,
}: {
  /** The reader's own archetype (its current name), or null when the scoring is missing. */
  archetype: string | null;
  submissionId: number;
}): Promise<UnlockOutcome> {
  const context = await resolveSubmissionAccessContext({ submissionId });
  if (!context?.userId) throw new Error("unlock_feedback_missing_user");
  const report = await ensurePersonalReportForSubmission({ submissionId });
  if (!report?.id) throw new Error("unlock_feedback_no_report");

  const payments = await succeededPayments(report.id);
  let paymentId = grantIn(payments);
  if (!paymentId && payments.some((payment) => isReportPurchasePlan(payment.metadata?.plan))) {
    return { kind: "already_paid" };
  }

  if (!paymentId) {
    const title = getPurchaseTitle("full_report", archetype, archetype);
    let inserted: number | null = null;
    try {
      inserted = await upsertPaymentRecord({
        amount: 0,
        buyerEmail: context.userEmail,
        cardBrand: null,
        cardExpMonth: null,
        cardExpYear: null,
        cardLast4: null,
        currency: "EUR",
        description: `LoveIQ ${title} (free, unlock feedback)`,
        failureCode: null,
        failureMessage: null,
        ipAddress: null,
        metadata: { plan: "full_report", source: UNLOCK_FEEDBACK_SOURCE, archetype },
        paymentDateTime: new Date().toISOString(),
        paymentId: null,
        paymentMethodId: null,
        paymentMethodType: null,
        personalReportId: report.id,
        pricingQuoteId: null,
        receiptUrl: null,
        status: "succeeded",
        stripeChargeId: null,
        stripeCustomerId: null,
        stripePaymentIntentId: null,
        userAgent: null,
        userId: context.userId,
      });
    } catch (err) {
      // The other request of a double tap inserted first (the index answers 409), so its
      // payment is the grant. Anything else, with no grant to show for it, is a real failure.
      paymentId = grantIn(await succeededPayments(report.id));
      if (!paymentId) throw err;
    }
    if (inserted) {
      paymentId = inserted;
      // Only the request that wrote the payment writes these, so a double tap leaves one
      // item. ponytail: a crash between the insert and here leaves the grant without its
      // item and personal_report fields; access reads the payment, so nothing locks.
      await ensurePaymentItem({ amount: 0, itemName: title, paymentId });
      await updatePersonalReportPayment({
        amount: 0,
        paymentId,
        personalReportId: report.id,
        status: "succeeded",
      });
    }
    if (!paymentId) throw new Error("unlock_feedback_not_saved");
  }

  if (archetype) {
    try {
      await upsertArchetypeTierForPersonalReport({
        archetype,
        personalReportId: report.id,
        tier: "full_report",
      });
    } catch (err) {
      // The payment already opens the report, and the hourly fulfillment sweep writes a
      // succeeded payment's missing tier, so the answer still counts as unlocked.
      logger.warn({ err, personalReportId: report.id }, "Unlock feedback: tier write failed");
    }
  } else {
    logger.error(
      { personalReportId: report.id, submissionId },
      "Unlock feedback: no archetype for the tier; the payment alone opens the report"
    );
  }

  return { kind: "granted", paymentId };
}
