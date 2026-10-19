/**
 * GET /api/cron/unlock-feedback
 *
 * Marcus's "Why didn't you unlock your report?" email (features/unlock-feedback): three hours
 * after a new report, an unpaid reader gets ONE email whose nine buttons each answer the
 * question and unlock the full report for free (/api/unlock-feedback/open, then /why). Hourly
 * at :41 over the reports created 3 to 5 hours ago, so two runs see each report, and a reader
 * the first run could not take is tried again by the second.
 *
 * Never to: a buyer of any plan (the paid check the 72h nurture email uses, here failing
 * closed), staff and likely tests (the admin panel's rule), anyone restricted (Art. 18) or on
 * the suppression list (which every unsubscribe writes, this campaign's included), a reader
 * without an address or an archetype, a person this email already went to for another of
 * their reports (a retake), and any report created before UNLOCK_FEEDBACK_FROM. A suppression
 * lookup that cannot answer counts as suppressed: nobody is waiting for this email.
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
import { Resend } from "resend";
import { supabaseFetch } from "@features/admin/server/supabase";
import { getReportPlanByPersonalReportId } from "@features/report/server/planAccess";
import {
  candidateWindow,
  readerOf,
  type CandidateRow,
  type Reader,
} from "@features/unlock-feedback/logic/audience";
import { rotateReasons, type UnlockReason } from "@features/unlock-feedback/logic/reasons";
import { drawSubjectArm, type SubjectArm } from "@features/unlock-feedback/logic/subjects";
import { unlockFeedbackEmail } from "@features/unlock-feedback/server/emails/unlock-feedback";
import { newLinkToken } from "@features/unlock-feedback/server/link";
import { emailExperimentTags } from "@shared/emails/ab-variant";
import { getEmailSiteUrl } from "@shared/emails/site-url";
import { suppressionState } from "@shared/emails/suppression";
import { buildUnsubscribeUrl, UNSUBSCRIBE_CAMPAIGNS } from "@shared/emails/unsubscribe-token";
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

const STAGE = "unlock_feedback";
const RESEND_TIMEOUT_MS = 8_000;
const CANDIDATE_LIMIT = 200;
const RESEND_ID = /^[A-Za-z0-9_-]{1,100}$/;

let _resend: Resend | null = null;
function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  if (!_resend) _resend = new Resend(key);
  return _resend;
}

/** RESEND_FROM's address under Marcus's name: the design's sender is a person. */
function fromMarcus(): string {
  const configured = process.env.RESEND_FROM || "LoveIQ <hello@send.loveiq.org>";
  const address = /<([^<>]+)>/.exec(configured)?.[1] ?? configured;
  return `Marcus from LoveIQ <${address.trim()}>`;
}

async function fetchCandidates(window: { from: string; to: string }): Promise<CandidateRow[]> {
  const res = await supabaseFetch(
    `/rest/v1/personal_report` +
      `?created_date_time=gte.${encodeURIComponent(window.from)}` +
      `&created_date_time=lte.${encodeURIComponent(window.to)}` +
      `&select=id,survey_submission_id,survey_submission!fk_personal_report_submission(` +
      `user_id,duration_ms,app_user!fk_survey_submission_user(email,processing_restricted_at),` +
      `scoring_result(primary_archetype,v5_primary_archetype))` +
      // Oldest first: a run that hits its budget leaves the newest, which the next run still sees.
      `&order=created_date_time.asc&limit=${CANDIDATE_LIMIT}`
  );
  if (!res.ok) throw new Error(`personal_report_query_failed:${res.status}`);
  return (await res.json()) as CandidateRow[];
}

/**
 * Whether this email already went (or may have gone) to the person, for this report or
 * another of theirs: a retake is a new submission, and they get one email, not one per test.
 */
async function emailedBefore(userId: number): Promise<boolean> {
  const res = await supabaseFetch(
    `/rest/v1/unlock_feedback?select=id,survey_submission!inner(user_id)&survey_submission.user_id=eq.${userId}&limit=1`
  );
  if (!res.ok) throw new Error(`unlock_feedback_lookup_failed:${res.status}`);
  return ((await res.json()) as unknown[]).length > 0;
}

interface Claim {
  id: number;
  token: string;
  arm: SubjectArm;
  order: UnlockReason[];
}

/** The row, written before the email goes; null when another run holds it already. */
async function claim(row: CandidateRow): Promise<Claim | null> {
  const link = newLinkToken();
  const arm = drawSubjectArm();
  const order = rotateReasons();
  const res = await supabaseFetch(
    // eslint-disable-next-line no-secrets/no-secrets -- REST path, not a secret
    "/rest/v1/unlock_feedback?on_conflict=survey_submission_id&select=id",
    {
      method: "POST",
      headers: { Prefer: "resolution=ignore-duplicates,return=representation" },
      body: JSON.stringify({
        survey_submission_id: row.survey_submission_id,
        personal_report_id: row.id,
        link_hash: link.hash,
        subject_arm: arm,
        reason_order: order,
      }),
    }
  );
  if (!res.ok) throw new Error(`claim_failed:${res.status}`);
  const [inserted] = (await res.json()) as Array<{ id: number }>;
  return inserted ? { id: inserted.id, token: link.token, arm, order } : null;
}

type SendResult =
  { sent: true; resendId: string | null } | { sent: false; refused: boolean; reason: string };

async function send(
  row: CandidateRow,
  reader: Reader,
  claimed: Claim,
  ctx: RunContext
): Promise<SendResult> {
  const unsubscribeUrl = buildUnsubscribeUrl(
    reader.email,
    ctx.siteUrl,
    ctx.unsubSecret,
    UNSUBSCRIBE_CAMPAIGNS.unlockFeedback
  );
  const email = unlockFeedbackEmail({
    arm: claimed.arm,
    archetypeName: reader.archetypeName,
    reasonOrder: claimed.order,
    token: claimed.token,
    siteUrl: ctx.siteUrl,
    unsubscribeUrl,
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const { data, error } = await Promise.race([
      ctx.resend.emails.send({
        from: fromMarcus(),
        to: reader.email,
        replyTo: process.env.RESEND_REPLY_TO || "hello@loveiq.org",
        subject: email.subject,
        html: email.html,
        text: email.text,
        headers: {
          "X-LoveIQ-Stage": STAGE,
          // As the 72h nurture email: its list identity, no auto-replies, one-click unsubscribe.
          "List-ID": "LoveIQ Nurture <nurture.send.loveiq.org>",
          Precedence: "bulk",
          "List-Unsubscribe": `<${unsubscribeUrl}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
        // Resend echoes these on every webhook: `stage` and `sub` keep this email's delivery,
        // opens and clicks per reader (email_message_event), `exp` and `arm` count the subject
        // test per arm (email_experiment_event). Ids only, never the address.
        tags: [
          { name: "stage", value: STAGE },
          { name: "sub", value: String(row.survey_submission_id) },
          ...emailExperimentTags("unlock_feedback_subject", claimed.arm),
        ],
      }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("Resend timeout")), RESEND_TIMEOUT_MS);
      }),
    ]);
    if (!error) {
      const id = data?.id;
      return { sent: true, resendId: typeof id === "string" && RESEND_ID.test(id) ? id : null };
    }
    // A 4xx is Resend refusing the email. A 5xx, or no status at all (the SDK's answer when the
    // request got no response), may have sent it.
    const status = error.statusCode;
    return {
      sent: false,
      refused: typeof status === "number" && status >= 400 && status < 500,
      reason: `${error.name}: ${error.message}`.slice(0, 200),
    };
  } catch (err) {
    return {
      sent: false,
      refused: false,
      reason: (err instanceof Error ? err.message : String(err)).slice(0, 200),
    };
  } finally {
    clearTimeout(timer);
  }
}

interface RunContext {
  resend: Resend;
  siteUrl: string;
  unsubSecret: string;
  summary: {
    candidates: number;
    sent: number;
    failed: number;
    deferred: number;
    skipped: Record<string, number>;
  };
  problems: string[];
}

async function processCandidate(row: CandidateRow, ctx: RunContext): Promise<void> {
  const { summary } = ctx;
  const skip = (reason: string) => {
    summary.skipped[reason] = (summary.skipped[reason] ?? 0) + 1;
  };

  const reader = readerOf(row);
  if ("skip" in reader) return skip(reader.skip);
  if (reader.userId !== null && (await emailedBefore(reader.userId))) {
    return skip("emailed_before");
  }
  // Throws when payments cannot be read, so the reader waits for the next run: a buyer must
  // never be offered the report free. (The nurture cron carries on instead.)
  if (await getReportPlanByPersonalReportId(row.id)) return skip("paid");
  const suppression = await suppressionState(reader.email);
  if (suppression !== "clear") return skip(suppression);

  const claimed = await claim(row);
  if (!claimed) return skip("already_claimed");

  const result = await send(row, reader, claimed, ctx);
  if (result.sent) {
    summary.sent++;
    const res = await supabaseFetch(`/rest/v1/unlock_feedback?id=eq.${claimed.id}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        sent_at: new Date().toISOString(),
        resend_id: result.resendId,
        updated_at: new Date().toISOString(),
      }),
    });
    // The email went; only the record of it is missing, and the 72h discount email reads it.
    if (!res.ok) ctx.problems.push(`sent, but sent_at not written (HTTP ${res.status})`);
    return;
  }

  summary.failed++;
  ctx.problems.push(result.reason);
  if (result.refused) {
    // Nothing went: free the reader for the next run inside the window. If this fails the
    // claim stays, and they miss the email rather than risk two.
    const res = await supabaseFetch(`/rest/v1/unlock_feedback?id=eq.${claimed.id}`, {
      method: "DELETE",
      headers: { Prefer: "return=minimal" },
    });
    if (!res.ok) ctx.problems.push(`refused claim not released (HTTP ${res.status})`);
  }
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
  if (!(await isFeatureEnabled("unlock_feedback"))) {
    return NextResponse.json({ skipped: true, reason: "kill_switch" });
  }
  const resend = getResend();
  // The footer's Unsubscribe has to work, so no secret means no email.
  const unsubSecret = process.env.UNSUBSCRIBE_SECRET;
  if (!resend || !unsubSecret) {
    return NextResponse.json({ error: "Service unavailable." }, { status: 503 });
  }

  const startedAtMs = Date.now();
  const checkSlow = startCronTimer("unlock-feedback", maxDuration);
  // New candidates stop here; the one in flight (one Resend call, at most 8 s) and the run's
  // own writes finish well inside the 60 s ceiling.
  const isOutOfTime = () => Date.now() - startedAtMs > 20_000;
  const ctx: RunContext = {
    resend,
    siteUrl: getEmailSiteUrl(),
    unsubSecret,
    summary: { candidates: 0, sent: 0, failed: 0, deferred: 0, skipped: {} },
    problems: [],
  };
  let errorMessage: string | undefined;

  try {
    const window = candidateWindow(startedAtMs);
    const candidates = window ? await fetchCandidates(window) : [];
    ctx.summary.candidates = candidates.length;
    for (const [i, row] of candidates.entries()) {
      if (isOutOfTime()) {
        ctx.summary.deferred = candidates.length - i;
        logger.warn(
          { deferred: ctx.summary.deferred },
          "unlock-feedback: time budget reached; the rest wait for the next run"
        );
        break;
      }
      try {
        await processCandidate(row, ctx);
      } catch (err) {
        ctx.summary.failed++;
        ctx.problems.push((err instanceof Error ? err.message : String(err)).slice(0, 200));
        // slack:false: the run's one message below says it, with the reasons.
        logger.error(
          { err, personalReportId: row.id, slack: false },
          "unlock-feedback: reader failed"
        );
      }
    }

    if (ctx.problems.length > 0) {
      const reasons = [...new Set(ctx.problems)].slice(0, 3).join(" | ");
      await pingOps(
        new Date(startedAtMs).toISOString().slice(0, 10),
        `:warning: unlock-feedback: ${ctx.summary.failed} of ${ctx.summary.failed + ctx.summary.sent} ` +
          `email(s) failed this run, ${ctx.problems.length} problem(s). Reasons: ${escapeSlack(reasons)}`
      );
    }
    logger.info({ summary: ctx.summary }, "unlock-feedback: done");
    return NextResponse.json({ success: true, summary: ctx.summary });
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : String(err);
    logger.error({ err }, "unlock-feedback cron failed");
    return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
  } finally {
    await checkSlow();
    await recordCronRun(
      "unlock-feedback",
      startedAtMs,
      errorMessage ? "error" : "success",
      errorMessage
    );
  }
}
