/**
 * GET /api/cron/report-discount-email
 *
 * Daily cron that nudges users whose personalised report quote has advanced
 * down the discount ladder (24h / 72h / 7d / 14d) and who have NOT yet
 * purchased. One email per user per ladder step. Dedup lives in
 * `report_price_quote.metadata.discountEmailsSent` (array of integers).
 *
 * Auth: `Authorization: Bearer ${CRON_SECRET}` — same pattern as
 * `app/api/cron/survey-paused/route.ts`.
 */

import { timingSafeEqual, randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { Resend } from "resend";
import { getBreaker } from "@/lib/circuit-breaker";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";
import logger from "@/lib/logger";
import { reportDiscountEmail } from "@/lib/emails/report-discount";
import { buildUnsubscribeUrl } from "@/lib/emails/unsubscribe-token";
import { getReportPriceQuotesForContext } from "@/lib/pricing/reportPricing";
import { getReportPlanByPersonalReportId } from "@/lib/report/planAccess";
import type { ReportPurchasePlanId } from "@/lib/checkout/reportPurchase";
import type { ReportPriceQuoteSnapshot } from "@/lib/pricing/reportPricing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CANDIDATE_LIMIT = 500;
const RESEND_TIMEOUT_MS = 8_000;
const SUPABASE_TIMEOUT_MS = 8_000;

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
  init: {
    body?: string;
    headers?: Record<string, string>;
    method?: string;
  } = {}
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

interface CandidateRow {
  id: number;
  personal_report_id: number;
  survey_submission_id: number;
  user_id: number | null;
  discount_step: number;
  metadata: Record<string, unknown> | null;
  app_user?: {
    email?: string | null;
    first_name?: string | null;
  } | null;
}

interface AccessTokenRow {
  token: string | null;
}

function getDiscountEmailsSent(metadata: Record<string, unknown> | null | undefined): number[] {
  if (!metadata) return [];
  const raw = (metadata as Record<string, unknown>).discountEmailsSent;
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (entry): entry is number => typeof entry === "number" && Number.isFinite(entry)
  );
}

async function fetchCandidates(): Promise<CandidateRow[]> {
  // Full Report quotes drive the send — the email body renders all three plans
  // by recomputing quotes via getReportPriceQuotesForContext. One send per
  // personal_report per ladder step.
  const path =
    `/rest/v1/report_price_quote` +
    `?plan=eq.full_report` +
    `&purchased_at=is.null` +
    `&discount_step=gte.1` +
    `&select=id,personal_report_id,survey_submission_id,user_id,discount_step,metadata,` +
    `app_user:user_id(email,first_name)` +
    `&order=discount_step.desc` +
    `&limit=${CANDIDATE_LIMIT}`;
  const response = await supabaseFetch(path);
  if (!response.ok) {
    throw new Error(`report_price_quote_query_failed:${response.status}`);
  }
  return (await response.json()) as CandidateRow[];
}

async function fetchAccessToken(submissionId: number): Promise<string | null> {
  const path =
    `/rest/v1/report_access_token` +
    `?survey_submission_id=eq.${submissionId}` +
    `&token=not.is.null` +
    `&select=token` +
    `&limit=1`;
  const response = await supabaseFetch(path);
  if (!response.ok) return null;
  const rows = (await response.json()) as AccessTokenRow[];
  return rows[0]?.token ?? null;
}

async function markDiscountEmailSent({
  quoteId,
  metadata,
  discountStep,
}: {
  quoteId: number;
  metadata: Record<string, unknown> | null;
  discountStep: number;
}) {
  const existing = getDiscountEmailsSent(metadata);
  if (existing.includes(discountStep)) return;
  const nextMetadata: Record<string, unknown> = {
    ...(metadata ?? {}),
    discountEmailsSent: [...existing, discountStep],
  };
  await supabaseFetch(`/rest/v1/report_price_quote?id=eq.${quoteId}`, {
    body: JSON.stringify({
      metadata: nextMetadata,
      updated_date_time: new Date().toISOString(),
    }),
    headers: { Prefer: "return=minimal" },
    method: "PATCH",
  });
}

interface SendContext {
  candidate: CandidateRow;
  email: string;
  firstName: string | null;
  reportToken: string;
  siteUrl: string;
  resend: Resend;
  unsubscribeUrl: string | undefined;
}

async function sendOne(ctx: SendContext): Promise<"sent" | "failed"> {
  const pricingSessionId = randomUUID();
  const quotes = await getReportPriceQuotesForContext({
    reportToken: ctx.reportToken,
    submissionId: ctx.candidate.survey_submission_id,
    pricingSessionId,
  });

  const quotesForEmail: Partial<Record<ReportPurchasePlanId, ReportPriceQuoteSnapshot>> | null =
    quotes ?? null;

  const ctaUrl =
    `${ctx.siteUrl}/report/${encodeURIComponent(ctx.reportToken)}` +
    `?offer=1&pricingSessionId=${pricingSessionId}`;

  const tpl = reportDiscountEmail({
    firstName: ctx.firstName,
    siteUrl: ctx.siteUrl,
    ctaUrl,
    quotes: quotesForEmail,
    unsubscribeUrl: ctx.unsubscribeUrl,
  });

  try {
    const { error } = await Promise.race([
      ctx.resend.emails.send({
        from: process.env.RESEND_FROM || "LoveIQ <hello@loveiq.org>",
        to: ctx.email,
        replyTo: process.env.RESEND_REPLY_TO || "hello@loveiq.org",
        subject: tpl.subject,
        html: tpl.html,
        text: tpl.text,
        headers: ctx.unsubscribeUrl
          ? {
              "List-Unsubscribe": `<${ctx.unsubscribeUrl}>`,
              "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
            }
          : undefined,
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Resend timeout")), RESEND_TIMEOUT_MS)
      ),
    ]);
    if (error) {
      logger.error(
        { err: error, quoteId: ctx.candidate.id },
        "report-discount-email: resend send failed"
      );
      return "failed";
    }
    return "sent";
  } catch (err) {
    logger.error({ err, quoteId: ctx.candidate.id }, "report-discount-email: send error");
    return "failed";
  }
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

  const resend = getResend();
  if (!resend) {
    return NextResponse.json({ error: "Service unavailable." }, { status: 503 });
  }

  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "https://loveiq.org").replace(/\/$/, "");

  const summary = {
    processed: 0,
    sent: 0,
    skippedAlreadySent: 0,
    skippedNoEmail: 0,
    skippedNoToken: 0,
    skippedAlreadyPaid: 0,
    failed: 0,
  };

  try {
    const candidates = await fetchCandidates();
    summary.processed = candidates.length;

    for (const candidate of candidates) {
      try {
        const step = candidate.discount_step;
        const alreadySent = getDiscountEmailsSent(candidate.metadata);
        if (alreadySent.includes(step)) {
          summary.skippedAlreadySent++;
          continue;
        }

        // Cross-quote paid check: the quote-level `purchased_at` filter at
        // fetchCandidates only catches users who paid via this exact quote.
        // A user who bought via a different pricing session would still slip
        // through. Look up the strongest succeeded plan on the personal_report
        // and skip if anything is paid.
        try {
          const currentPlan = await getReportPlanByPersonalReportId(candidate.personal_report_id);
          if (currentPlan) {
            summary.skippedAlreadyPaid++;
            continue;
          }
        } catch (err) {
          logger.warn(
            { err, quoteId: candidate.id, personalReportId: candidate.personal_report_id },
            "report-discount-email: paid-plan check failed; sending email anyway"
          );
        }

        const email = candidate.app_user?.email?.trim() ?? "";
        if (!email) {
          summary.skippedNoEmail++;
          continue;
        }

        const reportToken = await fetchAccessToken(candidate.survey_submission_id);
        if (!reportToken) {
          summary.skippedNoToken++;
          continue;
        }

        const firstName = candidate.app_user?.first_name?.trim() || null;
        const unsubSecret = process.env.UNSUBSCRIBE_SECRET;
        const unsubscribeUrl = unsubSecret
          ? buildUnsubscribeUrl(email, siteUrl, unsubSecret)
          : undefined;

        const outcome = await sendOne({
          candidate,
          email,
          firstName,
          reportToken,
          siteUrl,
          resend,
          unsubscribeUrl,
        });

        if (outcome === "sent") {
          summary.sent++;
          try {
            await markDiscountEmailSent({
              quoteId: candidate.id,
              metadata: candidate.metadata,
              discountStep: step,
            });
          } catch (err) {
            // Email was delivered — log dedup failure but do not count as fail.
            logger.error(
              { err, quoteId: candidate.id },
              "report-discount-email: dedup write failed"
            );
          }
        } else {
          summary.failed++;
        }
      } catch (err) {
        summary.failed++;
        logger.error(
          { err, quoteId: candidate.id },
          "report-discount-email: per-row processing error"
        );
      }
    }

    logger.info(summary, "report-discount-email cron finished");
    return NextResponse.json({ success: true, ...summary });
  } catch (err) {
    logger.error({ err }, "report-discount-email cron failed");
    return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
  }
}
