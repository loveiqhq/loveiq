/**
 * GET /api/cron/chapter-nudge
 *
 * "Chapter by chapter" drip. Daily trigger; each eligible report owner receives
 * ONE locked, archetype-specific chapter every other day (a 44h per-user gate),
 * starting 72h (day 3) after `personal_report.created_date_time` — after the
 * 6h/30h/54h nurture promo sequence finishes, so the two barely overlap.
 *
 * Audience: report owners who still have LOCKED archetype chapters for their
 * primary archetype — i.e. FREE (no purchase) and ESSENTIALS buyers. Full /
 * all-reports owners have nothing locked and are skipped automatically.
 *
 * Each email teases ~150 words of the user's archetype prose for one chapter,
 * cut mid-thought, with a "Continue reading" CTA to /report. No promo code —
 * the link rides the report's existing time-based price ladder.
 *
 * Idempotency lives in `report_price_quote.metadata` on the `full_report` quote
 * row for the submission (the same row the nurture cron uses):
 *   - `chapterNudgesSent`: string[] of section ids already sent
 *   - `chapterNudgeLastSentAt`: ISO timestamp of the last send (drives the 44h gate)
 *
 * Auth: `Authorization: Bearer ${CRON_SECRET}`.
 */

import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { Resend } from "resend";
import { getBreaker } from "@shared/http/circuit-breaker";
import { fetchWithTimeout } from "@shared/http/fetch-with-timeout";
import logger from "@shared/observability/logger";
import { recordCronRun, startCronTimer } from "@shared/observability/slack-alert-dedup";
import { buildUnsubscribeUrl } from "@shared/emails/unsubscribe-token";
import { isEmailSuppressed } from "@shared/emails/suppression";
import { getEmailSiteUrl } from "@shared/emails/site-url";
import { isProdCronHost } from "@shared/http/is-prod-cron-host";
import { isFeatureEnabled } from "@shared/flags/system-flags";
import {
  getReportPlanByPersonalReportId,
  type ReportAccessPlan,
} from "@features/report/server/planAccess";
import { getReportPriceQuoteForContext } from "@features/pricing/logic/reportPricing";
import {
  buildChapterContent,
  computeLockedChapters,
  getChapterNudgesSentFromMetadata,
  normalizeArchetypeName,
  pickNextChapter,
} from "@features/report/server/chapterTease";
import { chapterNudgeEmail } from "@features/report/server/emails/nurture/chapter-nudge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const HOUR_MS = 60 * 60 * 1000;
const SUPABASE_TIMEOUT_MS = 8_000;
const RESEND_TIMEOUT_MS = 8_000;
// Fetch ceiling — set above the current eligible set (~424 reports ≥72h old)
// so the WHOLE backlog is covered, not just the newest N. Throughput is bounded
// by maxDuration (60s) + graceful SIGTERM, NOT by this number: each run sends
// ~70-80 (every due candidate = a few Supabase round-trips + one Resend send),
// exits cleanly, and the next daily run continues the not-yet-sent reports. The
// every-other-day (44h) gate makes already-sent reports skip fast (one quote
// read). Full backlog rolls out over ~5-8 days, then steady-state every other
// day — no single large blast.
//
// SCALING: when eligible reports approach this ceiling, the per-run not-due
// skips start eating the budget. At that point move the due-filter server-side
// (filter on report_price_quote.metadata) rather than raising this further. The
// loop is graceful at every size — it never crashes or double-sends, it just
// rolls out over more days.
const CANDIDATE_LIMIT = 500;
const MIN_AGE_MS = 72 * HOUR_MS; // start at day 3
// 44h (not 48h) so daily-cron jitter / DST never makes a user skip a beat;
// worst case a user is emailed ~44-48h apart — i.e. "every other day".
const MIN_RESEND_GAP_MS = 44 * HOUR_MS;
const STAGE = "chapter_nudge";

function safeCompare(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

let _resend: Resend | null = null;
function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  if (!_resend) _resend = new Resend(key);
  return _resend;
}

function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error("supabase_not_configured");
  return { url, serviceRoleKey };
}

async function supabaseFetch(
  path: string,
  init: { body?: string; headers?: Record<string, string>; method?: string } = {}
) {
  const { url, serviceRoleKey } = getSupabaseConfig();
  const { body, headers = {}, method = "GET" } = init;
  return getBreaker("supabase").fire(() =>
    fetchWithTimeout(`${url}${path}`, {
      body,
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
        ...headers,
      },
      method,
      timeoutMs: SUPABASE_TIMEOUT_MS,
    })
  );
}

interface ScoringRow {
  primary_archetype?: string | null;
  v5_primary_archetype?: string | null;
}

interface CandidateRow {
  id: number;
  survey_submission_id: number;
  created_date_time: string;
  survey_submission?: {
    app_user?: {
      email?: string | null;
      first_name?: string | null;
      // GDPR Art. 18: data frozen → skip entirely.
      processing_restricted_at?: string | null;
    } | null;
    scoring_result?: ScoringRow[] | ScoringRow | null;
  } | null;
}

async function fetchCandidates(): Promise<CandidateRow[]> {
  const olderThan = new Date(Date.now() - MIN_AGE_MS).toISOString();
  const path =
    `/rest/v1/personal_report` +
    `?created_date_time=lte.${encodeURIComponent(olderThan)}` +
    `&select=id,survey_submission_id,created_date_time,` +
    `survey_submission!fk_personal_report_submission(` +
    `app_user!fk_survey_submission_user(email,first_name,processing_restricted_at),` +
    `scoring_result(primary_archetype,v5_primary_archetype)` +
    `)` +
    `&order=created_date_time.desc` +
    `&limit=${CANDIDATE_LIMIT}`;
  const r = await supabaseFetch(path);
  if (!r.ok) {
    throw new Error(`personal_report_query_failed:${r.status}`);
  }
  return (await r.json()) as CandidateRow[];
}

function resolvePrimaryArchetype(candidate: CandidateRow): string | null {
  const sr = candidate.survey_submission?.scoring_result;
  const row = Array.isArray(sr) ? sr[0] : sr;
  return normalizeArchetypeName(row?.v5_primary_archetype || row?.primary_archetype || null);
}

interface QuoteRow {
  id: number;
  metadata: Record<string, unknown> | null;
}

async function fetchChapterNudgeQuote(submissionId: number): Promise<QuoteRow | null> {
  const path =
    `/rest/v1/report_price_quote` +
    `?survey_submission_id=eq.${submissionId}` +
    `&plan=eq.full_report` +
    `&select=id,metadata` +
    `&order=id.desc&limit=1`;
  const r = await supabaseFetch(path);
  if (!r.ok) return null;
  const rows = (await r.json()) as QuoteRow[];
  return rows[0] ?? null;
}

/**
 * Bootstrap a `full_report` quote row if none exists yet (idempotent on
 * `(personal_report_id, plan)`). Reports whose owner never opened /report have
 * no quote; without this their drip would never start.
 */
async function bootstrapQuote(submissionId: number, reportToken: string): Promise<QuoteRow | null> {
  try {
    await getReportPriceQuoteForContext({
      plan: "full_report",
      submissionId,
      reportToken,
      userAgent: null,
    });
  } catch (err) {
    logger.warn({ err, submissionId }, "chapter-nudge: bootstrap quote failed");
    return null;
  }
  return fetchChapterNudgeQuote(submissionId);
}

async function fetchAccessToken(submissionId: number): Promise<string | null> {
  // Honor optional expires_at + revoked_at so the CTA never 404s.
  const nowIso = encodeURIComponent(new Date().toISOString());
  const path =
    `/rest/v1/report_access_token` +
    `?survey_submission_id=eq.${submissionId}` +
    `&revoked_at=is.null&token=not.is.null` +
    `&or=(expires_at.is.null,expires_at.gt.${nowIso})` +
    `&select=token&limit=1`;
  const r = await supabaseFetch(path);
  if (!r.ok) return null;
  const rows = (await r.json()) as Array<{ token: string | null }>;
  return rows[0]?.token ?? null;
}

interface PersonalReportTiers {
  archetypeTiers: Record<string, string> | null;
  unlockedArchetypes: string[] | null;
}

async function fetchPersonalReportTiers(personalReportId: number): Promise<PersonalReportTiers> {
  const path =
    `/rest/v1/personal_report` +
    `?id=eq.${personalReportId}` +
    `&select=archetype_tiers,unlocked_archetypes&limit=1`;
  const r = await supabaseFetch(path);
  if (!r.ok) return { archetypeTiers: null, unlockedArchetypes: null };
  const rows = (await r.json()) as Array<{
    archetype_tiers: Record<string, string> | null;
    unlocked_archetypes: string[] | null;
  }>;
  const row = rows[0];
  return {
    archetypeTiers: row?.archetype_tiers ?? null,
    unlockedArchetypes: row?.unlocked_archetypes ?? null,
  };
}

function getChapterNudgeLastSentAt(metadata: Record<string, unknown> | null): string | null {
  const raw = metadata?.chapterNudgeLastSentAt;
  return typeof raw === "string" ? raw : null;
}

function isDueForSend(lastSentAt: string | null, nowMs: number): boolean {
  if (!lastSentAt) return true;
  const t = Date.parse(lastSentAt);
  if (Number.isNaN(t)) return true;
  return nowMs - t >= MIN_RESEND_GAP_MS;
}

async function persistChapterSent({
  quoteId,
  metadata,
  sectionId,
  nowIso,
}: {
  quoteId: number;
  metadata: Record<string, unknown> | null;
  sectionId: string;
  nowIso: string;
}): Promise<void> {
  const existing = getChapterNudgesSentFromMetadata(metadata);
  const nextSent = existing.includes(sectionId) ? existing : [...existing, sectionId];
  const nextMetadata: Record<string, unknown> = {
    ...(metadata ?? {}),
    chapterNudgesSent: nextSent,
    chapterNudgeLastSentAt: nowIso,
  };
  await supabaseFetch(`/rest/v1/report_price_quote?id=eq.${quoteId}`, {
    body: JSON.stringify({ metadata: nextMetadata, updated_date_time: nowIso }),
    headers: { Prefer: "return=minimal" },
    method: "PATCH",
  });
}

function buildCtaUrl(siteUrl: string, reportToken: string, sectionId: string): string {
  const params = new URLSearchParams({
    utm_source: "email",
    utm_medium: "chapter_drip",
    utm_campaign: "chapter_nudge",
    utm_content: sectionId,
  });
  return `${siteUrl}/report/${encodeURIComponent(reportToken)}?${params.toString()}`;
}

interface SendInput {
  email: string;
  subject: string;
  html: string;
  text: string;
  unsubscribeUrl: string | undefined;
  resend: Resend;
}

async function sendOne(input: SendInput): Promise<"sent" | "failed"> {
  try {
    const { error } = await Promise.race([
      input.resend.emails.send({
        from: process.env.RESEND_FROM || "LoveIQ <hello@loveiq.org>",
        to: input.email,
        replyTo: process.env.RESEND_REPLY_TO || "hello@loveiq.org",
        subject: input.subject,
        html: input.html,
        text: input.text,
        headers: {
          "X-LoveIQ-Stage": STAGE,
          "List-ID": "LoveIQ Nurture <nurture.send.loveiq.org>",
          Precedence: "bulk",
          ...(input.unsubscribeUrl && {
            "List-Unsubscribe": `<${input.unsubscribeUrl}>`,
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
          }),
        },
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Resend timeout")), RESEND_TIMEOUT_MS)
      ),
    ]);
    if (error) {
      logger.error({ err: error, stage: STAGE }, "chapter-nudge: send failed");
      return "failed";
    }
    return "sent";
  } catch (err) {
    logger.error({ err, stage: STAGE }, "chapter-nudge: send error");
    return "failed";
  }
}

interface Summary {
  candidates: number;
  sent: number;
  skippedNotDue: number;
  skippedComplete: number;
  skippedSuppressed: number;
  skippedNoEmail: number;
  skippedNoToken: number;
  skippedNoQuote: number;
  skippedNoArchetype: number;
  skippedRestricted: number;
  failed: number;
}

function newSummary(): Summary {
  return {
    candidates: 0,
    sent: 0,
    skippedNotDue: 0,
    skippedComplete: 0,
    skippedSuppressed: 0,
    skippedNoEmail: 0,
    skippedNoToken: 0,
    skippedNoQuote: 0,
    skippedNoArchetype: 0,
    skippedRestricted: 0,
    failed: 0,
  };
}

interface RouteContext {
  resend: Resend;
  siteUrl: string;
  unsubSecret: string | undefined;
}

async function processCandidate(
  candidate: CandidateRow,
  ctx: RouteContext,
  summary: Summary
): Promise<void> {
  const nowMs = Date.now();
  try {
    const appUser = candidate.survey_submission?.app_user;
    if (appUser?.processing_restricted_at) {
      summary.skippedRestricted++;
      return;
    }

    const email = appUser?.email?.trim() ?? "";
    if (!email) {
      summary.skippedNoEmail++;
      return;
    }

    const primaryArchetype = resolvePrimaryArchetype(candidate);
    if (!primaryArchetype) {
      summary.skippedNoArchetype++;
      return;
    }

    // Quote carries the idempotency markers. Fetch it first so the
    // every-other-day gate short-circuits the majority of candidates with a
    // single query — token / tiers / suppression lookups are skipped for the
    // ~half that are not due on any given day.
    let quote = await fetchChapterNudgeQuote(candidate.survey_submission_id);
    if (quote && !isDueForSend(getChapterNudgeLastSentAt(quote.metadata), nowMs)) {
      summary.skippedNotDue++;
      return;
    }

    // Token is needed for the CTA and to bootstrap a missing quote. A revoked /
    // expired token means a click would 404 — skip rather than send a dead link.
    const reportToken = await fetchAccessToken(candidate.survey_submission_id);
    if (!reportToken) {
      summary.skippedNoToken++;
      return;
    }

    if (!quote) {
      quote = await bootstrapQuote(candidate.survey_submission_id, reportToken);
      if (!quote) {
        summary.skippedNoQuote++;
        return;
      }
      // A freshly bootstrapped quote has no last-sent marker → due immediately.
    }

    // accessPlan is only used to short-circuit all_reports; a non-primary
    // purchase must not unlock the primary archetype's chapters.
    let accessPlan: ReportAccessPlan = null;
    try {
      accessPlan = await getReportPlanByPersonalReportId(candidate.id);
    } catch (err) {
      logger.warn(
        { err, personalReportId: candidate.id },
        "chapter-nudge: plan lookup failed; treating as free"
      );
    }

    const { archetypeTiers, unlockedArchetypes } = await fetchPersonalReportTiers(candidate.id);
    const lockedChapters = computeLockedChapters({
      accessPlan,
      archetypeTiers,
      unlockedArchetypes,
      primaryArchetype,
    });

    const next = pickNextChapter({
      lockedChapters,
      alreadySent: getChapterNudgesSentFromMetadata(quote.metadata),
      email,
    });
    if (!next) {
      summary.skippedComplete++;
      return;
    }

    if (await isEmailSuppressed(email)) {
      summary.skippedSuppressed++;
      return;
    }

    const content = buildChapterContent(next.entry, primaryArchetype);
    if (!content) {
      summary.skippedNoArchetype++;
      return;
    }

    const unsubscribeUrl = ctx.unsubSecret
      ? buildUnsubscribeUrl(email, ctx.siteUrl, ctx.unsubSecret)
      : undefined;
    const tpl = chapterNudgeEmail({
      firstName: appUser?.first_name?.trim() || null,
      ctaUrl: buildCtaUrl(ctx.siteUrl, reportToken, content.sectionId),
      siteUrl: ctx.siteUrl,
      unsubscribeUrl,
      chapterIndex: next.index,
      chapterTotal: next.total,
      chapterTitle: content.chapterTitle,
      whatYoullLearn: content.whatYoullLearn,
      teaseText: content.teaseText,
      wasTruncated: content.wasTruncated,
    });

    // Write the idempotency marker BEFORE sending so a crash mid-send never
    // repeats the same chapter or sends twice in one window. If the marker
    // write fails we do not send; the next run retries.
    try {
      await persistChapterSent({
        quoteId: quote.id,
        metadata: quote.metadata,
        sectionId: content.sectionId,
        nowIso: new Date(nowMs).toISOString(),
      });
    } catch (err) {
      summary.failed++;
      logger.error(
        { err, quoteId: quote.id, sectionId: content.sectionId },
        "chapter-nudge: marker write failed before send; skipping"
      );
      return;
    }

    const outcome = await sendOne({
      email,
      subject: tpl.subject,
      html: tpl.html,
      text: tpl.text,
      unsubscribeUrl,
      resend: ctx.resend,
    });
    if (outcome === "sent") {
      summary.sent++;
    } else {
      summary.failed++;
      logger.warn(
        { personalReportId: candidate.id, sectionId: content.sectionId },
        "chapter-nudge: send failed after marker persisted; not retrying this chapter"
      );
    }
  } catch (err) {
    summary.failed++;
    logger.error({ err, personalReportId: candidate.id }, "chapter-nudge: per-row error");
  }
}

// Re-check the kill switch every N candidates so an admin flip stops the run
// without waiting for the next daily tick.
const KILL_SWITCH_CHECK_INTERVAL = 10;

// Per-request SIGTERM flag (Vercel sends SIGTERM before killing a stale lambda
// during a deploy). Installed in GET, cleared in finally.
let terminated = false;

async function isChapterNudgeKilled(): Promise<boolean> {
  return !(await isFeatureEnabled("chapter_nudge"));
}

export async function GET(request: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json({ error: "Service unavailable." }, { status: 503 });
  }

  const auth = request.headers.get("authorization") || "";
  if (!safeCompare(auth, `Bearer ${expected}`)) {
    return NextResponse.json({ error: "Invalid request." }, { status: 401 });
  }

  // Skip on the staging Vercel project (shares the prod DB) so staging never
  // emails real users with staging URLs.
  if (!isProdCronHost()) {
    return NextResponse.json({ skipped: true, reason: "non-prod-cron-host" });
  }

  if (!(await isFeatureEnabled("chapter_nudge"))) {
    return NextResponse.json({ skipped: true, reason: "kill_switch" });
  }

  const resend = getResend();
  if (!resend) {
    return NextResponse.json({ error: "Service unavailable." }, { status: 503 });
  }

  const trackDuration = startCronTimer("chapter-nudge", 60);
  const startMs = Date.now();
  let cronError: string | undefined;

  terminated = false;
  const onSigterm = () => {
    terminated = true;
    logger.warn("chapter-nudge: SIGTERM received");
  };
  process.once("SIGTERM", onSigterm);

  const ctx: RouteContext = {
    resend,
    siteUrl: getEmailSiteUrl(),
    unsubSecret: process.env.UNSUBSCRIBE_SECRET,
  };

  const summary = newSummary();

  try {
    const candidates = await fetchCandidates();
    summary.candidates = candidates.length;

    let processed = 0;
    for (const candidate of candidates) {
      if (terminated) {
        logger.warn(
          { processed, remaining: candidates.length - processed },
          "chapter-nudge: SIGTERM received mid-loop; exiting"
        );
        break;
      }
      if (
        processed > 0 &&
        processed % KILL_SWITCH_CHECK_INTERVAL === 0 &&
        (await isChapterNudgeKilled())
      ) {
        logger.warn(
          { processed, remaining: candidates.length - processed },
          "chapter-nudge: kill switch tripped mid-loop; exiting"
        );
        break;
      }
      await processCandidate(candidate, ctx, summary);
      processed += 1;
    }

    logger.info({ summary }, "chapter-nudge cron finished");
    return NextResponse.json({ success: true, summary });
  } catch (err) {
    logger.error({ err }, "chapter-nudge cron failed");
    cronError = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
  } finally {
    process.off("SIGTERM", onSigterm);
    await trackDuration();
    await recordCronRun("chapter-nudge", startMs, cronError ? "error" : "success", cronError);
  }
}
