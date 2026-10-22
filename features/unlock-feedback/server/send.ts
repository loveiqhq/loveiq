import { Resend } from "resend";
import { supabaseFetch } from "@features/admin/server/supabase";
import {
  getReportPlanByPersonalReportId,
  hasInitialUnlockByPersonalReportId,
} from "@features/report/server/planAccess";
import { readerOf, type CandidateRow, type Reader } from "@features/unlock-feedback/logic/audience";
import { rotateReasons, type UnlockReason } from "@features/unlock-feedback/logic/reasons";
import { drawSubjectArm, type SubjectArm } from "@features/unlock-feedback/logic/subjects";
import { unlockFeedbackEmail } from "@features/unlock-feedback/server/emails/unlock-feedback";
import { newLinkToken } from "@features/unlock-feedback/server/link";
import { emailExperimentTags } from "@shared/emails/ab-variant";
import { suppressionState } from "@shared/emails/suppression";
import { buildUnsubscribeUrl, UNSUBSCRIBE_CAMPAIGNS } from "@shared/emails/unsubscribe-token";
import { checkCooldown, releaseCooldown } from "@shared/http/ratelimit";

/**
 * Who gets the unlock-feedback email and how one goes out, shared by its three senders: the
 * hourly cron (reports 3 to 5 hours old, from the launch date), and the admin's two buttons on
 * AP-Analytics › Unlock feedback: a test to the admin's own report, and a tranche to the newest
 * readers who never got it, any date (Mark and Eman, 22.10: the first 250). Which reports each
 * looks at differs; who among them may get the email does not.
 */

export const STAGE = "unlock_feedback";
/**
 * Failed sends after which a run or a tranche call stops. A send without a clear answer keeps
 * its claim, so that reader never gets the email: during a Resend outage, carrying on would use
 * up every reader in reach.
 */
export const MAX_FAILED_SENDS = 3;
const RESEND_TIMEOUT_MS = 8_000;
export const CANDIDATE_LIMIT = 200;
const RESEND_ID = /^[A-Za-z0-9_-]{1,100}$/;

/** What a send is recorded under (unlock_feedback.send_batch): the cron, a test or a tranche. */
export type SendBatch = "hourly" | "test" | `tranche:${string}`;

let _resend: Resend | null = null;
export function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  if (!_resend) _resend = new Resend(key);
  return _resend;
}

/** RESEND_FROM's address under Marcus's name: the design's sender is a person. */
export function fromMarcus(): string {
  const configured = process.env.RESEND_FROM || "LoveIQ <hello@send.loveiq.org>";
  const address = /<([^<>]+)>/.exec(configured)?.[1] ?? configured;
  return `Marcus from LoveIQ <${address.trim()}>`;
}

const CANDIDATE_SELECT =
  `&select=id,created_date_time,survey_submission_id,survey_submission!fk_personal_report_submission(` +
  `user_id,duration_ms,app_user!fk_survey_submission_user(email,first_name,processing_restricted_at),` +
  `scoring_result(primary_archetype,v5_primary_archetype))`;

/** The cron's reports: created inside the window, oldest first. */
export async function fetchCandidatesInWindow(window: {
  from: string;
  to: string;
}): Promise<CandidateRow[]> {
  const res = await supabaseFetch(
    `/rest/v1/personal_report` +
      `?created_date_time=gte.${encodeURIComponent(window.from)}` +
      `&created_date_time=lte.${encodeURIComponent(window.to)}` +
      CANDIDATE_SELECT +
      // Oldest first: a run that hits its budget leaves the newest, which the next run still sees.
      `&order=created_date_time.asc&limit=${CANDIDATE_LIMIT}`
  );
  if (!res.ok) throw new Error(`personal_report_query_failed:${res.status}`);
  return (await res.json()) as CandidateRow[];
}

/**
 * A tranche's reports: created before `before`, newest first, so a tranche walks back from
 * the newest report three hours old and each call carries on where the last one stopped.
 */
export async function fetchCandidatesBefore(
  before: string,
  limit: number
): Promise<CandidateRow[]> {
  const res = await supabaseFetch(
    `/rest/v1/personal_report?created_date_time=lt.${encodeURIComponent(before)}` +
      CANDIDATE_SELECT +
      `&order=created_date_time.desc&limit=${limit}`
  );
  if (!res.ok) throw new Error(`personal_report_query_failed:${res.status}`);
  return (await res.json()) as CandidateRow[];
}

/** One submission's report, for the admin's test. */
export async function fetchCandidateForSubmission(
  submissionId: number
): Promise<CandidateRow | null> {
  const res = await supabaseFetch(
    `/rest/v1/personal_report?survey_submission_id=eq.${submissionId}` +
      CANDIDATE_SELECT +
      `&limit=1`
  );
  if (!res.ok) throw new Error(`personal_report_query_failed:${res.status}`);
  const [row] = (await res.json()) as CandidateRow[];
  return row ?? null;
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

const MAX_OWN_SUBMISSIONS = 50;

/**
 * Whether the person paid for another of their reports: someone who bought and then took the
 * test again is a buyer, not a reader who stopped at the paywall. Past 50 submissions the list
 * would be cut short, so that person counts as a buyer: they are not emailed.
 */
async function paidAnotherReport(userId: number, row: CandidateRow): Promise<boolean> {
  const subs = await supabaseFetch(
    `/rest/v1/survey_submission?user_id=eq.${userId}&select=id&limit=${MAX_OWN_SUBMISSIONS + 1}`
  );
  if (!subs.ok) throw new Error(`other_submissions_lookup_failed:${subs.status}`);
  const all = (await subs.json()) as Array<{ id: number }>;
  if (all.length > MAX_OWN_SUBMISSIONS) return true;
  const others = all.map((s) => s.id).filter((id) => id !== row.survey_submission_id);
  if (others.length === 0) return false;
  const reports = await supabaseFetch(
    `/rest/v1/personal_report?survey_submission_id=in.(${others.join(",")})&select=id`
  );
  if (!reports.ok) throw new Error(`other_reports_lookup_failed:${reports.status}`);
  for (const { id } of (await reports.json()) as Array<{ id: number }>) {
    if (await getReportPlanByPersonalReportId(id)) return true;
    if (await hasInitialUnlockByPersonalReportId(id)) return true;
  }
  return false;
}

/**
 * Whether the report is in the EUR 1.99 pre-unlock gate's cohort (`initial_gate_cohort_at`,
 * features/report/server/initialGateState.ts): the gate, its EUR 10 credit and the day-4 gift
 * are that reader's offer, and a free full report would undercut them, as the 72h email
 * skips them too. Throws when it can't be read, so the reader waits.
 */
async function inInitialGateCohort(personalReportId: number): Promise<boolean> {
  const res = await supabaseFetch(
    `/rest/v1/personal_report?id=eq.${personalReportId}&initial_gate_cohort_at=not.is.null&select=id&limit=1`
  );
  if (!res.ok) throw new Error(`gate_cohort_lookup_failed:${res.status}`);
  return ((await res.json()) as unknown[]).length > 0;
}

/**
 * Whether the reader opened their report, by the server's own report_session (written on
 * every open, not consent-gated): the email says they "reviewed your results" (Eman, 22.10:
 * only readers who opened it).
 */
async function reportOpened(personalReportId: number): Promise<boolean> {
  const res = await supabaseFetch(
    `/rest/v1/report_session?personal_report_id=eq.${personalReportId}&select=id&limit=1`
  );
  if (!res.ok) throw new Error(`report_session_lookup_failed:${res.status}`);
  return ((await res.json()) as unknown[]).length > 0;
}

/**
 * What the full report was worth to this reader: its full_report quote's price, as the pay
 * screen showed it ("€29.99"; Marcus 18.10, Eman 22.10). Null without a euro quote, and then
 * the email simply leaves "worth" out.
 */
async function quotedWorth(personalReportId: number): Promise<string | null> {
  const res = await supabaseFetch(
    `/rest/v1/report_price_quote?personal_report_id=eq.${personalReportId}&plan=eq.full_report` +
      `&select=current_price,currency&order=created_date_time.desc&limit=1`
  );
  if (!res.ok) return null;
  const [quote] = (await res.json()) as Array<{
    current_price: number | string | null;
    currency: string | null;
  }>;
  const price = Number(quote?.current_price);
  if (!quote || (quote.currency ?? "EUR").toUpperCase() !== "EUR") return null;
  return Number.isFinite(price) && price > 0 ? `€${price.toFixed(2)}` : null;
}

export type Skip =
  | "restricted"
  | "no_email"
  | "test"
  | "no_archetype"
  | "emailed_before"
  | "paid"
  | "suppressed"
  | "unknown"
  | "not_opened"
  | "gate_cohort"
  | "already_claimed";

export interface Eligible {
  reader: Reader;
  worth: string | null;
}

/**
 * The reader to email, or why not. Throws when payments cannot be read, so the reader waits:
 * a buyer must never be offered the report free. A buyer of any plan is left out, the EUR 1.99
 * initial report too (it is no report plan, and its buyer already has EUR 10 off the full
 * report: a free full report would undo the offer), and so is someone who bought another of
 * their reports.
 *
 * `staffTest` is the admin's own test: their address is staff, they may have had it before
 * and bought other reports; everything else holds, this report's own payments included.
 */
export async function eligibility(
  row: CandidateRow,
  opts: { staffTest?: boolean } = {}
): Promise<Eligible | { skip: Skip }> {
  const r = readerOf(row, opts);
  if ("skip" in r) return r;
  if (!opts.staffTest && r.userId !== null && (await emailedBefore(r.userId)))
    return { skip: "emailed_before" };
  if (await getReportPlanByPersonalReportId(row.id)) return { skip: "paid" };
  if (await hasInitialUnlockByPersonalReportId(row.id)) return { skip: "paid" };
  if (!opts.staffTest && r.userId !== null && (await paidAnotherReport(r.userId, row)))
    return { skip: "paid" };
  if (await inInitialGateCohort(row.id)) return { skip: "gate_cohort" };
  const suppression = await suppressionState(r.email);
  if (suppression !== "clear") return { skip: suppression };
  if (!(await reportOpened(row.id))) return { skip: "not_opened" };
  return { reader: r, worth: await quotedWorth(row.id) };
}

interface Claim {
  id: number;
  token: string;
  arm: SubjectArm;
  order: UnlockReason[];
  batch: SendBatch;
}

/** The row, written before the email goes; null when another run holds it already. */
async function claim(
  row: CandidateRow,
  batch: SendBatch,
  arm: SubjectArm = drawSubjectArm()
): Promise<Claim | null> {
  const link = newLinkToken();
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
        send_batch: batch,
      }),
    }
  );
  if (!res.ok) throw new Error(`claim_failed:${res.status}`);
  const [inserted] = (await res.json()) as Array<{ id: number }>;
  return inserted ? { id: inserted.id, token: link.token, arm, order, batch } : null;
}

/**
 * The admin's test replaces its own earlier row, so each test sends a fresh email with a
 * working link; only a staff reader's row, never anyone else's.
 */
async function releaseTestRow(row: CandidateRow): Promise<void> {
  const res = await supabaseFetch(
    // eslint-disable-next-line no-secrets/no-secrets -- REST path, not a secret
    `/rest/v1/unlock_feedback?survey_submission_id=eq.${row.survey_submission_id}&send_batch=eq.test`,
    { method: "DELETE", headers: { Prefer: "return=minimal" } }
  );
  if (!res.ok) throw new Error(`test_row_release_failed:${res.status}`);
}

type SendResult =
  { sent: true; resendId: string | null } | { sent: false; refused: boolean; reason: string };

export interface SendContext {
  resend: Resend;
  siteUrl: string;
  unsubSecret: string;
}

async function send(
  row: CandidateRow,
  { reader, worth }: Eligible,
  claimed: Claim,
  ctx: SendContext
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
    firstName: reader.firstName,
    worth,
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
          // Not for an admin's test: the subject test's daily counts are readers only.
          ...(claimed.batch === "test"
            ? []
            : emailExperimentTags("unlock_feedback_subject", claimed.arm)),
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

export type Outcome =
  { sent: true; arm: SubjectArm } | { sent: false; skip: Skip } | { sent: false; failed: string };

/**
 * Claim, send, record: exactly once per reader. Resend refusing it (a 4xx) frees the claim for
 * a later try; no clear answer keeps it, and the reader misses the email rather than get two.
 */
export async function claimAndSend(
  row: CandidateRow,
  eligible: Eligible,
  ctx: SendContext,
  opts: { batch: SendBatch; arm?: SubjectArm }
): Promise<Outcome & { problem?: string }> {
  if (opts.batch === "test") await releaseTestRow(row);
  const claimed = await claim(row, opts.batch, opts.arm);
  if (!claimed) return { sent: false, skip: "already_claimed" };

  const result = await send(row, eligible, claimed, ctx);
  if (result.sent) {
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
    return {
      sent: true,
      arm: claimed.arm,
      ...(res.ok ? {} : { problem: `sent, but sent_at not written (HTTP ${res.status})` }),
    };
  }

  if (result.refused) {
    // Nothing went: free the reader for a later try. If this fails the claim stays, and they
    // miss the email rather than risk two.
    const res = await supabaseFetch(`/rest/v1/unlock_feedback?id=eq.${claimed.id}`, {
      method: "DELETE",
      headers: { Prefer: "return=minimal" },
    });
    if (!res.ok)
      return {
        sent: false,
        failed: result.reason,
        problem: `refused claim not released (HTTP ${res.status})`,
      };
  }
  return { sent: false, failed: result.reason };
}

const LOCK = { key: "run", bucket: "unlock-feedback-send", ms: 75_000 } as const;

/**
 * One sender at a time: the hourly run, a test and each call of a tranche hold this lock
 * (75 s, past the 60 s any of them can run), so two of them never both find a person not yet
 * emailed and email them twice for two of their reports. Without Redis it is always free.
 */
export async function takeSendLock(): Promise<boolean> {
  return (await checkCooldown(LOCK.key, LOCK.bucket, LOCK.ms)).allowed;
}

export function releaseSendLock(): Promise<void> {
  return releaseCooldown(LOCK.key, LOCK.bucket);
}
