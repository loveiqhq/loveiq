/**
 * The email journeys' new emails, sent by the hourly job (app/api/cron/email-journeys). Each
 * email reads its own candidates in a window, leaves out whoever should not get it, and claims
 * before it sends (send.ts). Every email stops the moment a reader converts: a payment, a
 * started or finished survey, an opened report. Times count from the moment a reader entered
 * the step (the canvas's rule), and each window is wider than an hour so a missed run is
 * caught by the next, yet closed, so nobody gets an email days late.
 *
 *   I2  what €1.99 opens      3 h to 24 h after a gated reader's report, nothing paid
 *   I4  gift still unopened   24 h to 48 h after the E07 gift, report not opened since
 *   R2  answers still saved   48 h to 72 h after the last saved answer, R1 sent, not finished
 *   C2  back into your report 24 h to 48 h after a full-report purchase
 *   S3  survey waiting        24 h to 48 h after a pay-to-start payment, survey not started
 *   S4  fifteen minutes       48 h to 96 h, S3 sent, survey not started
 *   S5  last reminder         96 h to 168 h, S4 sent, survey not started
 *   R1 (pay to start)         1 h to 24 h after the buyer's last saved answer
 *   R2 (pay to start)         48 h to 72 h after it, R1 sent
 */

import type { Resend } from "resend";
import { supabaseFetch } from "@features/admin/server/supabase";
import { INITIAL_UNLOCK_GIFT } from "@features/report/logic/initialUnlockGate";
import {
  buildContinueUrl,
  resolveEmailOrigin,
} from "@features/pay-to-start/server/emails/confirmation";
import { countAnsweredQuestions, getSurveyContactInfo } from "@features/survey/server/utils";
import type { SurveyAnswers } from "@features/survey/server/types";
import { EMAIL_LINKS, tagEmailLink, type EmailLink } from "@shared/emails/email-link";
import { getEmailSiteUrl } from "@shared/emails/site-url";
import { suppressionState } from "@shared/emails/suppression";
import { buildUnsubscribeUrl } from "@shared/emails/unsubscribe-token";
import { giftUnopenedEmail, whatPriceOpensEmail } from "../emails/free-funnel";
import { backIntoReportEmail } from "../emails/purchase";
import {
  fifteenMinutesEmail,
  lastSurveyReminderEmail,
  surveyWaitingEmail,
} from "../emails/pay-to-start";
import {
  surveyPausedEmail,
  surveyStillSavedEmail,
  type PaidOffer,
} from "../emails/survey-reminders";
import type { KitEmail } from "../emails/kit";
import { EMAIL_STAGES, isEmailSwitchOn, type EmailSwitch } from "../logic/catalog";
import { claimAndSend, wasSent, type ClaimAndSendOutcome } from "./send";

const HOUR = 3_600_000;
const CANDIDATE_LIMIT = 100;

export interface StageCounts {
  candidates: number;
  sent: number;
  skipped: number;
  failed: number;
}

export interface JourneyRun {
  /** Per email: off (switch), or what it did. */
  stages: Record<string, StageCounts | "off">;
  sent: number;
  failed: number;
  stoppedEarly: boolean;
}

export interface JourneyContext {
  resend: Resend;
  nowMs: number;
  /** The route's walk budget; checked before each candidate. */
  outOfTime: () => boolean;
}

const iso = (ms: number) => encodeURIComponent(new Date(ms).toISOString());

async function getJson<T>(path: string): Promise<T> {
  const r = await supabaseFetch(path);
  if (!r.ok) throw new Error(`journeys_query_failed:${r.status}:${path.split("?")[0]}`);
  return (await r.json()) as T;
}

/** A report link that still opens (as E07 and the nurture email read theirs). */
async function liveReportToken(submissionId: number): Promise<string | null> {
  const now = iso(Date.now());
  const rows = await getJson<Array<{ token: string | null }>>(
    `/rest/v1/report_access_token?survey_submission_id=eq.${submissionId}&revoked_at=is.null&token=not.is.null` +
      `&or=(expires_at.is.null,expires_at.gt.${now})&select=token&order=created_at.desc&limit=1`
  );
  return rows[0]?.token ?? null;
}

function reportLink(token: string, link: EmailLink): string {
  return tagEmailLink(`${getEmailSiteUrl()}/report/${encodeURIComponent(token)}?from=email`, link);
}

function unsubscribe(email: string, campaign: string): string | undefined {
  const secret = process.env.UNSUBSCRIBE_SECRET;
  return secret ? buildUnsubscribeUrl(email, getEmailSiteUrl(), secret, campaign) : undefined;
}

/** Only an address the suppression list clears (an unreadable list is no answer: skip). */
async function mayEmail(email: string): Promise<boolean> {
  return (await suppressionState(email)) === "clear";
}

function emptyCounts(): StageCounts {
  return { candidates: 0, sent: 0, skipped: 0, failed: 0 };
}

function tally(counts: StageCounts, outcome: ClaimAndSendOutcome): void {
  if (outcome === "sent") counts.sent++;
  else if (outcome === "already") counts.skipped++;
  else counts.failed++;
}

interface ReaderRow {
  id: number;
  survey_submission_id: number;
  survey_submission?: {
    app_user?: {
      email?: string | null;
      first_name?: string | null;
      processing_restricted_at?: string | null;
    } | null;
  } | null;
}

const READER_SELECT =
  "survey_submission!fk_personal_report_submission(app_user!fk_survey_submission_user(email,first_name,processing_restricted_at))";

function readerOf(row: ReaderRow): { email: string; firstName: string | null } | null {
  const user = row.survey_submission?.app_user;
  const email = user?.email?.trim().toLowerCase();
  if (!email || user?.processing_restricted_at) return null;
  return { email, firstName: user?.first_name ?? null };
}

/** Whether the report's reader holds anything paid or gifted (any plan, the EUR 1.99 too). */
async function holdsAnything(personalReportId: number): Promise<boolean> {
  const rows = await getJson<unknown[]>(
    `/rest/v1/payment?personal_report_id=eq.${personalReportId}&status=in.(succeeded,refunded,disputed)&select=id&limit=1`
  );
  return rows.length > 0;
}

async function sendToReader(
  ctx: JourneyContext,
  counts: StageCounts,
  opts: {
    stage: string;
    row: ReaderRow;
    reader: { email: string; firstName: string | null };
    link: EmailLink;
    build: (p: {
      firstName: string | null;
      reportUrl: string;
      siteUrl: string;
      unsubscribeUrl?: string;
    }) => KitEmail;
  }
): Promise<void> {
  const token = await liveReportToken(opts.row.survey_submission_id);
  if (!token || !(await mayEmail(opts.reader.email))) {
    counts.skipped++;
    return;
  }
  const unsubscribeUrl = unsubscribe(opts.reader.email, opts.stage);
  const email = opts.build({
    firstName: opts.reader.firstName,
    reportUrl: reportLink(token, opts.link),
    siteUrl: getEmailSiteUrl(),
    unsubscribeUrl,
  });
  tally(
    counts,
    await claimAndSend(
      ctx.resend,
      {
        emailKey: opts.stage,
        target: `sub:${opts.row.survey_submission_id}`,
        submissionId: opts.row.survey_submission_id,
      },
      {
        to: opts.reader.email,
        email,
        stage: opts.stage,
        submissionId: opts.row.survey_submission_id,
        unsubscribeUrl,
        nurture: true,
      }
    )
  );
}

// ── I2 ───────────────────────────────────────────────────────────────────────────────────

export async function runWhatPriceOpens(ctx: JourneyContext): Promise<StageCounts> {
  const counts = emptyCounts();
  const rows = await getJson<Array<ReaderRow & { initial_gift_arm: string | null }>>(
    `/rest/v1/personal_report?initial_gate_cohort_at=lte.${iso(ctx.nowMs - 3 * HOUR)}` +
      `&initial_gate_cohort_at=gt.${iso(ctx.nowMs - 24 * HOUR)}&initial_gift_arm=is.null` +
      `&select=id,survey_submission_id,initial_gift_arm,${READER_SELECT}&order=initial_gate_cohort_at.asc&limit=${CANDIDATE_LIMIT}`
  );
  counts.candidates = rows.length;
  for (const row of rows) {
    if (ctx.outOfTime()) break;
    const reader = readerOf(row);
    if (!reader || (await holdsAnything(row.id))) {
      counts.skipped++;
      continue;
    }
    await sendToReader(ctx, counts, {
      stage: EMAIL_STAGES.i2,
      row,
      reader,
      link: EMAIL_LINKS.whatPriceOpens,
      build: whatPriceOpensEmail,
    });
  }
  return counts;
}

// ── I4 ───────────────────────────────────────────────────────────────────────────────────

/** Whether the reader opened their report after a moment (a report session started since). */
async function openedSince(personalReportId: number, sinceIso: string): Promise<boolean> {
  const rows = await getJson<unknown[]>(
    `/rest/v1/report_session?personal_report_id=eq.${personalReportId}&started_at=gte.${encodeURIComponent(sinceIso)}&select=id&limit=1`
  );
  return rows.length > 0;
}

/** Any payment but the E07 gift itself: the reader bought something since. */
async function paidBesidesGift(personalReportId: number): Promise<boolean> {
  const rows = await getJson<Array<{ metadata: Record<string, unknown> | null }>>(
    `/rest/v1/payment?personal_report_id=eq.${personalReportId}&status=in.(succeeded,refunded,disputed)&select=metadata&limit=50`
  );
  return rows.some((r) => r.metadata?.gifted !== INITIAL_UNLOCK_GIFT);
}

export async function runGiftUnopened(ctx: JourneyContext): Promise<StageCounts> {
  const counts = emptyCounts();
  const rows = await getJson<Array<ReaderRow & { initial_gift_sent_at: string }>>(
    `/rest/v1/personal_report?initial_gift_arm=eq.gift&initial_gift_sent_at=lte.${iso(ctx.nowMs - 24 * HOUR)}` +
      `&initial_gift_sent_at=gt.${iso(ctx.nowMs - 48 * HOUR)}` +
      `&select=id,survey_submission_id,initial_gift_sent_at,${READER_SELECT}&order=initial_gift_sent_at.asc&limit=${CANDIDATE_LIMIT}`
  );
  counts.candidates = rows.length;
  for (const row of rows) {
    if (ctx.outOfTime()) break;
    const reader = readerOf(row);
    if (
      !reader ||
      (await openedSince(row.id, row.initial_gift_sent_at)) ||
      (await paidBesidesGift(row.id))
    ) {
      counts.skipped++;
      continue;
    }
    await sendToReader(ctx, counts, {
      stage: EMAIL_STAGES.i4,
      row,
      reader,
      link: EMAIL_LINKS.giftUnopened,
      build: giftUnopenedEmail,
    });
  }
  return counts;
}

// ── R2 (the free survey) ─────────────────────────────────────────────────────────────────

interface DraftRow {
  session_id: string;
  answers: Record<string, unknown> | null;
  saved_at: string;
}

async function isSubmitted(sessionId: string): Promise<boolean> {
  const rows = await getJson<unknown[]>(
    `/rest/v1/survey_submission?session_id=eq.${encodeURIComponent(sessionId)}&select=id&limit=1`
  );
  return rows.length > 0;
}

/** A draft a pay-to-start purchase claims (its survey_session_id): pay to start's reminders. */
export async function isPurchaseDraft(sessionId: string): Promise<boolean> {
  const rows = await getJson<unknown[]>(
    `/rest/v1/prepaid_report_access?survey_session_id=eq.${encodeURIComponent(sessionId)}&select=id&limit=1`
  );
  return rows.length > 0;
}

/** A paid purchase this address hasn't used: its survey belongs to pay to start's reminders. */
async function hasUnusedPurchase(email: string): Promise<boolean> {
  const rows = await getJson<unknown[]>(
    `/rest/v1/prepaid_report_access?customer_email=eq.${encodeURIComponent(email)}&status=eq.succeeded&consumed_submission_id=is.null&select=id&limit=1`
  );
  return rows.length > 0;
}

export async function runSurveyStillSaved(ctx: JourneyContext): Promise<StageCounts> {
  const counts = emptyCounts();
  const rows = await getJson<DraftRow[]>(
    `/rest/v1/survey_partial_save?saved_at=lte.${iso(ctx.nowMs - 48 * HOUR)}&saved_at=gt.${iso(ctx.nowMs - 72 * HOUR)}` +
      `&select=session_id,answers,saved_at&order=saved_at.asc&limit=${CANDIDATE_LIMIT}`
  );
  counts.candidates = rows.length;
  const resumeUrl = tagEmailLink(`${getEmailSiteUrl()}/survey`, EMAIL_LINKS.surveyPaused2);
  for (const row of rows) {
    if (ctx.outOfTime()) break;
    const target = `session:${row.session_id}`;
    const { email, firstName } = getSurveyContactInfo((row.answers ?? {}) as SurveyAnswers);
    if (
      !email ||
      !(await wasSent(EMAIL_STAGES.r1, target)) ||
      (await isSubmitted(row.session_id)) ||
      (await isPurchaseDraft(row.session_id)) ||
      (await hasUnusedPurchase(email)) ||
      !(await mayEmail(email))
    ) {
      counts.skipped++;
      continue;
    }
    const unsubscribeUrl = unsubscribe(email, EMAIL_STAGES.r2);
    const tpl = surveyStillSavedEmail({
      firstName: firstName ?? null,
      answered: countAnsweredQuestions(row.answers),
      resumeUrl,
      siteUrl: getEmailSiteUrl(),
      unsubscribeUrl,
    });
    tally(
      counts,
      await claimAndSend(
        ctx.resend,
        { emailKey: EMAIL_STAGES.r2, target },
        { to: email, email: tpl, stage: EMAIL_STAGES.r2, unsubscribeUrl, nurture: true }
      )
    );
  }
  return counts;
}

// ── C2 ───────────────────────────────────────────────────────────────────────────────────

interface PaymentRow {
  id: number;
  personal_report_id: number | null;
  app_user?: {
    email?: string | null;
    first_name?: string | null;
    processing_restricted_at?: string | null;
  } | null;
}

export async function runBackIntoReport(ctx: JourneyContext): Promise<StageCounts> {
  const counts = emptyCounts();
  const rows = await getJson<PaymentRow[]>(
    `/rest/v1/payment?status=eq.succeeded&metadata->>plan=in.(full_report,all_reports)` +
      `&payment_date_time=lte.${iso(ctx.nowMs - 24 * HOUR)}&payment_date_time=gt.${iso(ctx.nowMs - 48 * HOUR)}` +
      `&select=id,personal_report_id,app_user!fk_payment_user(email,first_name,processing_restricted_at)` +
      `&order=payment_date_time.asc&limit=${CANDIDATE_LIMIT}`
  );
  counts.candidates = rows.length;
  for (const row of rows) {
    if (ctx.outOfTime()) break;
    const email = row.app_user?.email?.trim().toLowerCase();
    if (!email || row.app_user?.processing_restricted_at || !row.personal_report_id) {
      counts.skipped++;
      continue;
    }
    const [report] = await getJson<Array<{ survey_submission_id: number }>>(
      `/rest/v1/personal_report?id=eq.${row.personal_report_id}&select=survey_submission_id&limit=1`
    );
    if (!report) {
      counts.skipped++;
      continue;
    }
    await sendToReader(ctx, counts, {
      stage: EMAIL_STAGES.c2,
      row: { id: row.personal_report_id, survey_submission_id: report.survey_submission_id },
      reader: { email, firstName: row.app_user?.first_name ?? null },
      link: EMAIL_LINKS.backIntoReport,
      build: backIntoReportEmail,
    });
  }
  return counts;
}

// ── Pay to start: S3 to S5, R1 and R2 ────────────────────────────────────────────────────

interface PurchaseRow {
  id: number;
  prepaid_token: string;
  offer: string | null;
  customer_email: string | null;
  paid_at: string;
  survey_session_id?: string | null;
}

const PURCHASE_SELECT = "id,prepaid_token,offer,customer_email,paid_at,survey_session_id";

function paidOffer(row: PurchaseRow): PaidOffer | null {
  return row.offer === "pre" || row.offer === "full" ? row.offer : null;
}

async function sendToBuyer(
  ctx: JourneyContext,
  counts: StageCounts,
  row: PurchaseRow,
  stage: string,
  link: EmailLink,
  build: (continueUrl: string, offer: PaidOffer, unsubscribeUrl?: string) => KitEmail
): Promise<void> {
  const email = row.customer_email?.trim().toLowerCase();
  const offer = paidOffer(row);
  if (!email || !offer || !(await mayEmail(email))) {
    counts.skipped++;
    return;
  }
  const continueUrl = tagEmailLink(
    buildContinueUrl(resolveEmailOrigin(null), row.prepaid_token),
    link
  );
  const unsubscribeUrl = unsubscribe(email, stage);
  tally(
    counts,
    await claimAndSend(
      ctx.resend,
      { emailKey: stage, target: `prepaid:${row.id}`, prepaidAccessId: row.id },
      {
        to: email,
        email: build(continueUrl, offer, unsubscribeUrl),
        stage,
        unsubscribeUrl,
        nurture: true,
        tags: [{ name: "offer", value: offer }],
      }
    )
  );
}

/** Paid, not used, not a staff test. */
const PAID_UNUSED =
  "offer=not.is.null&status=eq.succeeded&paid_at=not.is.null&consumed_submission_id=is.null&is_test=eq.false";

export async function runSurveyNotStarted(ctx: JourneyContext): Promise<StageCounts> {
  const counts = emptyCounts();
  const steps = [
    { stage: EMAIL_STAGES.s3, after: null, from: 24, to: 48, link: EMAIL_LINKS.ptsSurveyWaiting },
    {
      stage: EMAIL_STAGES.s4,
      after: EMAIL_STAGES.s3,
      from: 48,
      to: 96,
      link: EMAIL_LINKS.ptsFifteenMinutes,
    },
    {
      stage: EMAIL_STAGES.s5,
      after: EMAIL_STAGES.s4,
      from: 96,
      to: 168,
      link: EMAIL_LINKS.ptsLastReminder,
    },
  ] as const;
  for (const step of steps) {
    const rows = await getJson<PurchaseRow[]>(
      `/rest/v1/prepaid_report_access?${PAID_UNUSED}&survey_started_at=is.null` +
        `&paid_at=lte.${iso(ctx.nowMs - step.from * HOUR)}&paid_at=gt.${iso(ctx.nowMs - step.to * HOUR)}` +
        `&select=${PURCHASE_SELECT}&order=paid_at.asc&limit=${CANDIDATE_LIMIT}`
    );
    counts.candidates += rows.length;
    for (const row of rows) {
      if (ctx.outOfTime()) return counts;
      if (step.after && !(await wasSent(step.after, `prepaid:${row.id}`))) {
        counts.skipped++;
        continue;
      }
      const siteUrl = getEmailSiteUrl();
      const days = (ctx.nowMs - Date.parse(row.paid_at)) / (24 * HOUR);
      await sendToBuyer(
        ctx,
        counts,
        row,
        step.stage,
        step.link,
        (continueUrl, offer, unsubscribeUrl) =>
          step.stage === EMAIL_STAGES.s3
            ? surveyWaitingEmail({ offer, continueUrl, siteUrl, unsubscribeUrl })
            : step.stage === EMAIL_STAGES.s4
              ? fifteenMinutesEmail({ offer, continueUrl, siteUrl, unsubscribeUrl })
              : lastSurveyReminderEmail({
                  offer,
                  continueUrl,
                  siteUrl,
                  unsubscribeUrl,
                  daysSincePayment: days,
                })
      );
    }
  }
  return counts;
}

export async function runPaidSurveyReminders(ctx: JourneyContext): Promise<StageCounts> {
  const counts = emptyCounts();
  const rows = await getJson<PurchaseRow[]>(
    `/rest/v1/prepaid_report_access?${PAID_UNUSED}&survey_started_at=not.is.null&survey_session_id=not.is.null` +
      `&survey_started_at=gt.${iso(ctx.nowMs - 30 * 24 * HOUR)}` +
      `&select=${PURCHASE_SELECT}&order=paid_at.asc&limit=${CANDIDATE_LIMIT}`
  );
  counts.candidates = rows.length;
  for (const row of rows) {
    if (ctx.outOfTime()) break;
    const [draft] = await getJson<DraftRow[]>(
      `/rest/v1/survey_partial_save?session_id=eq.${encodeURIComponent(row.survey_session_id!)}&select=session_id,answers,saved_at&limit=1`
    );
    if (!draft || (await isSubmitted(draft.session_id))) {
      counts.skipped++;
      continue;
    }
    const age = ctx.nowMs - Date.parse(draft.saved_at);
    const step =
      age >= HOUR && age < 24 * HOUR
        ? { stage: EMAIL_STAGES.r1Pts, after: null, link: EMAIL_LINKS.ptsSurveyPaused }
        : age >= 48 * HOUR && age < 72 * HOUR
          ? {
              stage: EMAIL_STAGES.r2Pts,
              after: EMAIL_STAGES.r1Pts,
              link: EMAIL_LINKS.ptsSurveyPaused2,
            }
          : null;
    if (!step || (step.after && !(await wasSent(step.after, `prepaid:${row.id}`)))) {
      counts.skipped++;
      continue;
    }
    const { firstName } = getSurveyContactInfo((draft.answers ?? {}) as SurveyAnswers);
    const answered = countAnsweredQuestions(draft.answers);
    const siteUrl = getEmailSiteUrl();
    await sendToBuyer(ctx, counts, row, step.stage, step.link, (resumeUrl, offer, unsubscribeUrl) =>
      (step.stage === EMAIL_STAGES.r1Pts ? surveyPausedEmail : surveyStillSavedEmail)({
        firstName: firstName ?? null,
        answered,
        resumeUrl,
        siteUrl,
        unsubscribeUrl,
        paidOffer: offer,
      })
    );
  }
  return counts;
}

// ── The run ──────────────────────────────────────────────────────────────────────────────

const STAGES: Array<{
  name: string;
  flag: EmailSwitch;
  run: (ctx: JourneyContext) => Promise<StageCounts>;
}> = [
  { name: EMAIL_STAGES.i2, flag: "i2", run: runWhatPriceOpens },
  { name: EMAIL_STAGES.i4, flag: "i4", run: runGiftUnopened },
  { name: EMAIL_STAGES.r2, flag: "r2", run: runSurveyStillSaved },
  { name: EMAIL_STAGES.c2, flag: "c2", run: runBackIntoReport },
  { name: "pts_survey_not_started", flag: "s3s5", run: runSurveyNotStarted },
  { name: "pts_survey_reminders", flag: "ptsReminders", run: runPaidSurveyReminders },
];

/** Every email whose switch is on, in turn, until the budget runs out. */
export async function runJourneys(ctx: JourneyContext): Promise<JourneyRun> {
  const run: JourneyRun = { stages: {}, sent: 0, failed: 0, stoppedEarly: false };
  for (const stage of STAGES) {
    if (ctx.outOfTime()) {
      run.stoppedEarly = true;
      break;
    }
    if (!(await isEmailSwitchOn(stage.flag))) {
      run.stages[stage.name] = "off";
      continue;
    }
    const counts = await stage.run(ctx);
    run.stages[stage.name] = counts;
    run.sent += counts.sent;
    run.failed += counts.failed;
  }
  if (ctx.outOfTime()) run.stoppedEarly = true;
  return run;
}
