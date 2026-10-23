/**
 * GET /api/cron/unlock-feedback
 *
 * Marcus's "Why didn't you unlock your report?" email (features/unlock-feedback): three hours
 * after a new report, an unpaid reader who opened it gets ONE email whose eight buttons each
 * answer the question and unlock the full report for free (/api/unlock-feedback/open, then
 * /why). Hourly at :41 over the reports created 3 to 5 hours ago, so two runs see each report,
 * and a reader the first run could not take is tried again by the second. Off by its flag
 * until the team turns it on; the first tranche goes from the admin's button instead
 * (app/api/admin/ap/unlock-feedback/send), by the same rules (server/send.ts).
 *
 * Never to: a buyer of any plan, the EUR 1.99 initial report included (the paid check fails
 * closed), staff and likely tests (the admin panel's rule), anyone restricted (Art. 18) or on
 * the suppression list (which every unsubscribe writes, this campaign's included), a reader
 * without an address or an archetype, one who never opened the report, a person this email
 * already went to for another of their reports (a retake), and any report created before
 * UNLOCK_FEEDBACK_FROM. A suppression lookup that cannot answer counts as suppressed: nobody
 * is waiting for this email.
 *
 * Exactly once per reader: the unlock_feedback row (UNIQUE per submission) is claimed BEFORE
 * the email goes, then the send, then sent_at and Resend's id.
 *   - Resend refuses it (a 4xx answer): nothing went, so the claim is deleted and the next run
 *     inside the window tries again, with a new link.
 *   - No clear answer (a timeout, a network failure, a 5xx): it may have gone, so the claim
 *     stays and the reader is never tried again. A missed email beats a second one.
 * The 72h discount email skips everyone with a sent_at here (app/api/cron/nurture-sequence).
 *
 * Kill switch: system_flags `unlock_feedback`. Auth: `Authorization: Bearer ${CRON_SECRET}`.
 */

import { NextResponse } from "next/server";
import { candidateWindow } from "@features/unlock-feedback/logic/audience";
import {
  claimAndSend,
  eligibility,
  fetchCandidatesInWindow,
  getResend,
  MAX_FAILED_SENDS,
  releaseSendLock,
  takeSendLock,
  type SendContext,
} from "@features/unlock-feedback/server/send";
import { getEmailSiteUrl } from "@shared/emails/site-url";
import { isFeatureEnabled } from "@shared/flags/system-flags";
import { isProdCronHost } from "@shared/http/is-prod-cron-host";
import logger from "@shared/observability/logger";
import { escapeSlack, notifySlack } from "@shared/observability/slack";
import {
  markSlackAlertDelivered,
  recordCronRun,
  startCronTimer,
  tryClaimSlackAlert,
  verifyCronAuth,
} from "@shared/observability/slack-alert-dedup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface Summary {
  candidates: number;
  sent: number;
  failed: number;
  deferred: number;
  skipped: Record<string, number>;
}

/** One ops message a day at most, with the reasons, like the nurture cron's. */
async function pingOps(dayKey: string, text: string): Promise<void> {
  const kind = "unlock_feedback_problems";
  if (!(await tryClaimSlackAlert(kind, "cron_day", dayKey))) return;
  await notifySlack({ channel: "ops", kind, text, username: "ops_alerts" });
  await markSlackAlertDelivered(kind, "cron_day", dayKey);
}

export async function GET(request: Request) {
  if (!verifyCronAuth(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  // Staging must never email real readers.
  if (!isProdCronHost()) {
    return NextResponse.json({ skipped: true, reason: "non-prod-cron-host" });
  }
  const startedAtMs = Date.now();
  // Off until the team turns the hourly sends on (seeded off, 20261022200000), and off when
  // the flag cannot be read: these emails give a report away, so no answer means no. The
  // admin's test and tranche buttons are their own decision and do not read it. The run is
  // recorded either way, or the stall watch would call the cron dead every day it is off.
  if (!(await isFeatureEnabled("unlock_feedback", false))) {
    await recordCronRun("unlock-feedback", startedAtMs, "success", "skipped: the flag is off");
    return NextResponse.json({ skipped: true, reason: "kill_switch" });
  }
  const resend = getResend();
  // The footer's Unsubscribe has to work, so no secret means no email.
  const unsubSecret = process.env.UNSUBSCRIBE_SECRET;
  if (!resend || !unsubSecret) {
    return NextResponse.json({ error: "Service unavailable." }, { status: 503 });
  }

  // One sender at a time (server/send.ts): an admin's tranche may be running.
  if (!(await takeSendLock())) {
    await recordCronRun("unlock-feedback", startedAtMs, "success", "skipped: another send runs");
    return NextResponse.json({ skipped: true, reason: "another_send_running" });
  }
  const checkSlow = startCronTimer("unlock-feedback", maxDuration);
  // New candidates stop here; the one in flight (one Resend call, at most 8 s) and the run's
  // own writes finish well inside the 60 s ceiling.
  const isOutOfTime = () => Date.now() - startedAtMs > 20_000;
  const ctx: SendContext = { resend, siteUrl: getEmailSiteUrl(), unsubSecret };
  const summary: Summary = { candidates: 0, sent: 0, failed: 0, deferred: 0, skipped: {} };
  const problems: string[] = [];
  let errorMessage: string | undefined;

  try {
    const window = candidateWindow(startedAtMs);
    const candidates = window ? await fetchCandidatesInWindow(window) : [];
    summary.candidates = candidates.length;
    for (const [i, row] of candidates.entries()) {
      if (isOutOfTime() || summary.failed >= MAX_FAILED_SENDS) {
        summary.deferred = candidates.length - i;
        logger.warn(
          { deferred: summary.deferred, failed: summary.failed },
          "unlock-feedback: out of time or too many failures; the rest wait for the next run"
        );
        break;
      }
      try {
        const eligible = await eligibility(row);
        if ("skip" in eligible) {
          summary.skipped[eligible.skip] = (summary.skipped[eligible.skip] ?? 0) + 1;
          continue;
        }
        const outcome = await claimAndSend(row, eligible, ctx, { batch: "hourly" });
        if (outcome.problem) problems.push(outcome.problem);
        if (outcome.sent) summary.sent++;
        else if ("skip" in outcome)
          summary.skipped[outcome.skip] = (summary.skipped[outcome.skip] ?? 0) + 1;
        else {
          summary.failed++;
          problems.push(outcome.failed);
        }
      } catch (err) {
        summary.failed++;
        problems.push((err instanceof Error ? err.message : String(err)).slice(0, 200));
        // slack:false: the run's one message below says it, with the reasons.
        logger.error(
          { err, personalReportId: row.id, slack: false },
          "unlock-feedback: reader failed"
        );
      }
    }

    if (problems.length > 0) {
      const reasons = [...new Set(problems)].slice(0, 3).join(" | ");
      await pingOps(
        new Date(startedAtMs).toISOString().slice(0, 10),
        `:warning: unlock-feedback: ${summary.failed} of ${summary.failed + summary.sent} ` +
          `email(s) failed this run, ${problems.length} problem(s). Reasons: ${escapeSlack(reasons)}`
      );
    }
    logger.info({ summary }, "unlock-feedback: done");
    return NextResponse.json({ success: true, summary });
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : String(err);
    logger.error({ err }, "unlock-feedback cron failed");
    return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
  } finally {
    await releaseSendLock();
    await checkSlow();
    await recordCronRun(
      "unlock-feedback",
      startedAtMs,
      errorMessage ? "error" : "success",
      errorMessage
    );
  }
}
