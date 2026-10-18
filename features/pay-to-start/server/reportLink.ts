import {
  lookupReportTokenBySubmissionId,
  resolveSubmissionAccessContext,
} from "@features/report/server/personalReport";
import logger from "@shared/observability/logger";
import type { Entitlement } from "./entitlement";

/**
 * The report an entitlement unlocked, for its payer only: the survey that claimed it was
 * taken under the address Stripe took for the payment. Null otherwise.
 *
 * A purchase changes hands: a gift, a forwarded confirmation email, a shared browser, a
 * checkout session id copied out of analytics. The report belongs to whoever took the
 * survey, and it is about their sex life, so holding the purchase must never open it for
 * someone else. The survey taker always has their own link, in their report email.
 */
export async function claimedReportPathForPayer(
  entitlement: Pick<Entitlement, "consumed_submission_id" | "customer_email">
): Promise<string | null> {
  const submissionId = entitlement.consumed_submission_id;
  const payer = entitlement.customer_email?.trim().toLowerCase();
  if (!submissionId || !payer) return null;
  try {
    const context = await resolveSubmissionAccessContext({ submissionId });
    const taker = context?.userEmail?.trim().toLowerCase();
    if (!taker || taker !== payer) return null;
    const token = await lookupReportTokenBySubmissionId(submissionId);
    return token ? `/report/${encodeURIComponent(token)}` : null;
  } catch (err) {
    logger.warn({ err, submissionId }, "pay-to-start: claimed report lookup failed");
    return null;
  }
}
