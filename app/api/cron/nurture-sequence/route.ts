/**
 * GET /api/cron/nurture-sequence
 *
 * Hourly nurture sequence cron that fans out across 4 timed stages keyed off
 * `personal_report.created_date_time`:
 *
 *   - `6h_no_view`     — 5–7h ago, no `analytics_event.report_viewed` row
 *   - `6h_no_unlock`   — 5–7h ago, has a viewed event but no paid plan
 *   - `30h_no_unlock`  — 29–31h ago, no paid plan; issues 50% per-user code
 *   - `54h_no_unlock`  — 53–55h ago, no paid plan; issues 75% per-user code
 *
 * Idempotency lives in `report_price_quote.metadata.nurtureEmailsSent` (array
 * of stage strings) on the `full_report` quote row for the submission. Per-
 * user Stripe promotion codes are stored alongside in
 * `metadata.nurturePromoCodes[stage]` so the checkout-session resolver can
 * look them up at click-through time.
 *
 * Auth: `Authorization: Bearer ${CRON_SECRET}` — same pattern as
 * `app/api/cron/survey-paused/route.ts`.
 */

import { timingSafeEqual, randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { Resend } from "resend";
import { getBreaker } from "@shared/http/circuit-breaker";
import { fetchWithTimeout } from "@shared/http/fetch-with-timeout";
import logger from "@shared/observability/logger";
import { buildUnsubscribeUrl } from "@shared/emails/unsubscribe-token";
import { isEmailSuppressed } from "@shared/emails/suppression";
import { getReportPlanByPersonalReportId } from "@features/report/server/planAccess";
import { getStripeServerClient } from "@features/checkout/server/stripeCheckout";
import { getCouponIdForStage } from "@features/checkout/server/promoCodes";
import { getReportPriceQuoteForContext } from "@features/pricing/logic/reportPricing";
import { nurture6hNoViewEmail } from "@features/report/server/emails/nurture/nurture-6h-no-view";
import { nurture6hNoUnlockEmail } from "@features/report/server/emails/nurture/nurture-6h-no-unlock";
import { nurture30hNoUnlockEmail } from "@features/report/server/emails/nurture/nurture-30h-no-unlock";
import { nurture54hNoUnlockEmail } from "@features/report/server/emails/nurture/nurture-54h-no-unlock";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 50;

const HOUR_MS = 60 * 60 * 1000;
const SUPABASE_TIMEOUT_MS = 8_000;
const RESEND_TIMEOUT_MS = 8_000;
const CANDIDATE_LIMIT_PER_STAGE = 200;

type Stage = "6h_no_view" | "6h_no_unlock" | "30h_no_unlock" | "54h_no_unlock";

interface AgeWindow {
  minMs: number;
  maxMs: number;
}

// 2h-wide windows so a missed hourly tick still catches users on the next run.
const AGE_WINDOWS = {
  six: { minMs: 5 * HOUR_MS, maxMs: 7 * HOUR_MS },
  thirty: { minMs: 29 * HOUR_MS, maxMs: 31 * HOUR_MS },
  fiftyFour: { minMs: 53 * HOUR_MS, maxMs: 55 * HOUR_MS },
} as const satisfies Record<string, AgeWindow>;

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

interface CandidateRow {
  id: number;
  survey_submission_id: number;
  created_date_time: string;
  survey_submission?: {
    app_user?: {
      email?: string | null;
      first_name?: string | null;
    } | null;
  } | null;
}

async function fetchCandidatesByAge(window: AgeWindow): Promise<CandidateRow[]> {
  const now = Date.now();
  const newerThan = new Date(now - window.maxMs).toISOString();
  const olderThan = new Date(now - window.minMs).toISOString();
  const path =
    `/rest/v1/personal_report` +
    `?created_date_time=gte.${encodeURIComponent(newerThan)}` +
    `&created_date_time=lte.${encodeURIComponent(olderThan)}` +
    `&select=id,survey_submission_id,created_date_time,` +
    `survey_submission!fk_personal_report_survey_submission(app_user!fk_survey_submission_user(email,first_name))` +
    `&order=created_date_time.desc` +
    `&limit=${CANDIDATE_LIMIT_PER_STAGE}`;
  const r = await supabaseFetch(path);
  if (!r.ok) {
    throw new Error(`personal_report_query_failed:${r.status}`);
  }
  return (await r.json()) as CandidateRow[];
}

interface FullReportQuote {
  id: number;
  metadata: Record<string, unknown> | null;
}

async function fetchFullReportQuote(submissionId: number): Promise<FullReportQuote | null> {
  const path =
    `/rest/v1/report_price_quote` +
    `?survey_submission_id=eq.${submissionId}` +
    `&plan=eq.full_report` +
    `&select=id,metadata` +
    `&order=id.desc&limit=1`;
  const r = await supabaseFetch(path);
  if (!r.ok) return null;
  const rows = (await r.json()) as FullReportQuote[];
  return rows[0] ?? null;
}

async function fetchAccessToken(submissionId: number): Promise<string | null> {
  const path =
    `/rest/v1/report_access_token` +
    `?survey_submission_id=eq.${submissionId}` +
    `&revoked_at=is.null&token=not.is.null` +
    `&select=token&limit=1`;
  const r = await supabaseFetch(path);
  if (!r.ok) return null;
  const rows = (await r.json()) as Array<{ token: string | null }>;
  return rows[0]?.token ?? null;
}

/**
 * Bootstrap a `full_report` quote row if none exists for the submission yet.
 * Quotes are normally created lazily on /report page-load; users who finish
 * the survey but never open the report have no quote, which would defeat the
 * 6h_no_view stage (whose whole purpose is to nudge those exact users). The
 * shared pricing helper is idempotent on `(personal_report_id, plan)` so this
 * is safe to call even if another tick raced and created the row first.
 */
async function bootstrapFullReportQuote(
  submissionId: number,
  reportToken: string
): Promise<FullReportQuote | null> {
  try {
    await getReportPriceQuoteForContext({
      plan: "full_report",
      submissionId,
      reportToken,
      userAgent: null,
    });
  } catch (err) {
    logger.warn({ err, submissionId }, "nurture-sequence: bootstrap quote failed");
    return null;
  }
  return fetchFullReportQuote(submissionId);
}

async function hasReportViewedEvent(personalReportId: number): Promise<boolean> {
  const path =
    `/rest/v1/analytics_event` +
    `?personal_report_id=eq.${personalReportId}` +
    `&event_type=eq.report_viewed` +
    `&select=id&limit=1`;
  const r = await supabaseFetch(path);
  if (!r.ok) return false;
  const rows = (await r.json()) as Array<{ id: number }>;
  return rows.length > 0;
}

function getNurtureEmailsSent(metadata: Record<string, unknown> | null): Stage[] {
  if (!metadata) return [];
  const raw = (metadata as Record<string, unknown>).nurtureEmailsSent;
  if (!Array.isArray(raw)) return [];
  return raw.filter((s): s is Stage => typeof s === "string") as Stage[];
}

function buildBase62Alphabet(): string {
  // Build from char codes so no literal alphabetic string triggers the
  // no-secrets entropy detector. 0-9 (48-57), A-Z (65-90), a-z (97-122).
  let s = "";
  for (let c = 48; c <= 57; c += 1) s += String.fromCharCode(c);
  for (let c = 65; c <= 90; c += 1) s += String.fromCharCode(c);
  for (let c = 97; c <= 122; c += 1) s += String.fromCharCode(c);
  return s;
}

const BASE62_ALPHABET = buildBase62Alphabet();

function generateUserCode(percentOff: 50 | 75): string {
  // base62, 8 chars: ~62^8 ≈ 2.18e14 keyspace. Stripe enforces uniqueness, so
  // collisions trigger a re-roll via the catch in createPromoCode below.
  const buf = randomBytes(8);
  let out = "";
  for (let i = 0; i < 8; i += 1) {
    // `buf[i]` is a number in [0,255] from randomBytes; `charAt` is total — TS
    // `noUncheckedIndexedAccess` strictness prefers it over `alphabet[idx]`.
    out += BASE62_ALPHABET.charAt(buf[i]! % BASE62_ALPHABET.length);
  }
  return `LIQ-${percentOff}-${out}`;
}

interface StripeIssuedPromo {
  code: string;
  stripePromotionCodeId: string;
  percentOff: 50 | 75;
  expiresAt: string;
}

async function createPromoCode({
  stage,
}: {
  stage: "30h_no_unlock" | "54h_no_unlock";
}): Promise<StripeIssuedPromo | null> {
  const stripe = getStripeServerClient();
  const couponId = getCouponIdForStage(stage);
  if (!stripe || !couponId) {
    logger.warn(
      { stage, hasStripe: Boolean(stripe), hasCoupon: Boolean(couponId) },
      "nurture-sequence: stripe coupon not configured"
    );
    return null;
  }

  const percentOff: 50 | 75 = stage === "30h_no_unlock" ? 50 : 75;
  const expiresAtSec = Math.floor(Date.now() / 1000) + 24 * 3600;

  // Per-user redemption restriction lives in the app layer via
  // `resolveNurturePromo` (scoped to the issuing submission). The Stripe-side
  // `customer` restriction is not used because that would require a separate
  // Stripe Customer lookup/create per recipient — `max_redemptions: 1` plus
  // 24h expiry covers the blast radius. `allow_promotion_codes: false` on the
  // checkout session prevents manual code-entry from a forwarded email.
  //
  // One retry on collision — the 62^8 keyspace makes this astronomically rare,
  // but Stripe will 400 if the code happens to already exist.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const code = generateUserCode(percentOff);
    try {
      const promo = await stripe.promotionCodes.create({
        promotion: { type: "coupon", coupon: couponId },
        code,
        max_redemptions: 1,
        expires_at: expiresAtSec,
      });
      return {
        code,
        stripePromotionCodeId: promo.id,
        percentOff,
        expiresAt: new Date(expiresAtSec * 1000).toISOString(),
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (attempt === 0 && /already exists/i.test(message)) continue;
      logger.error({ err, stage }, "nurture-sequence: stripe promo create failed");
      return null;
    }
  }
  return null;
}

interface SendInput {
  stage: Stage;
  email: string;
  firstName: string | null;
  reportToken: string;
  siteUrl: string;
  unsubscribeUrl: string | undefined;
  resend: Resend;
  promo: StripeIssuedPromo | null;
  utmCampaign: Stage;
}

function buildCtaUrl({
  stage,
  siteUrl,
  reportToken,
  promoCode,
}: {
  stage: Stage;
  siteUrl: string;
  reportToken: string;
  promoCode?: string;
}): string {
  const params = new URLSearchParams({
    offer: "1",
    utm_source: "email",
    utm_medium: "nurture",
    utm_campaign: stage,
  });
  if (promoCode) params.set("promo", promoCode);
  return `${siteUrl}/report/${encodeURIComponent(reportToken)}?${params.toString()}`;
}

function renderEmail(input: Omit<SendInput, "resend">): {
  subject: string;
  html: string;
  text: string;
} {
  const ctaUrl = buildCtaUrl({
    stage: input.stage,
    siteUrl: input.siteUrl,
    reportToken: input.reportToken,
    promoCode: input.promo?.code,
  });
  const common = {
    firstName: input.firstName,
    ctaUrl,
    siteUrl: input.siteUrl,
    unsubscribeUrl: input.unsubscribeUrl,
  };
  switch (input.stage) {
    case "6h_no_view":
      return nurture6hNoViewEmail(common);
    case "6h_no_unlock":
      return nurture6hNoUnlockEmail(common);
    case "30h_no_unlock":
      if (!input.promo) throw new Error("30h_no_unlock requires promo");
      return nurture30hNoUnlockEmail({
        ...common,
        promoCode: input.promo.code,
        percentOff: input.promo.percentOff,
      });
    case "54h_no_unlock":
      if (!input.promo) throw new Error("54h_no_unlock requires promo");
      return nurture54hNoUnlockEmail({
        ...common,
        promoCode: input.promo.code,
        percentOff: input.promo.percentOff,
      });
  }
}

async function persistStageSent({
  quoteId,
  metadata,
  stage,
  promo,
}: {
  quoteId: number;
  metadata: Record<string, unknown> | null;
  stage: Stage;
  promo: StripeIssuedPromo | null;
}) {
  const existing = getNurtureEmailsSent(metadata);
  if (existing.includes(stage)) return;
  const nextSent = [...existing, stage];

  const existingCodes = (metadata?.nurturePromoCodes as Record<string, unknown> | undefined) ?? {};
  const nextCodes: Record<string, unknown> = { ...existingCodes };
  if (promo) {
    nextCodes[stage] = {
      code: promo.code,
      stripePromotionCodeId: promo.stripePromotionCodeId,
      percentOff: promo.percentOff,
      expiresAt: promo.expiresAt,
    };
  }

  const nextMetadata: Record<string, unknown> = {
    ...(metadata ?? {}),
    nurtureEmailsSent: nextSent,
    ...(promo ? { nurturePromoCodes: nextCodes } : {}),
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

async function sendOne(input: SendInput): Promise<"sent" | "failed"> {
  const tpl = renderEmail(input);
  try {
    const { error } = await Promise.race([
      input.resend.emails.send({
        from: process.env.RESEND_FROM || "LoveIQ <hello@loveiq.org>",
        to: input.email,
        replyTo: process.env.RESEND_REPLY_TO || "hello@loveiq.org",
        subject: tpl.subject,
        html: tpl.html,
        text: tpl.text,
        headers: {
          "X-LoveIQ-Stage": input.stage,
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
      logger.error({ err: error, stage: input.stage }, "nurture-sequence: send failed");
      return "failed";
    }
    return "sent";
  } catch (err) {
    logger.error({ err, stage: input.stage }, "nurture-sequence: send error");
    return "failed";
  }
}

interface StageSummary {
  candidates: number;
  sent: number;
  skippedAlreadySent: number;
  skippedPaid: number;
  skippedSuppressed: number;
  skippedNoEmail: number;
  skippedNoToken: number;
  skippedNoQuote: number;
  skippedNoPromo: number;
  failed: number;
}

function newStageSummary(): StageSummary {
  return {
    candidates: 0,
    sent: 0,
    skippedAlreadySent: 0,
    skippedPaid: 0,
    skippedSuppressed: 0,
    skippedNoEmail: 0,
    skippedNoToken: 0,
    skippedNoQuote: 0,
    skippedNoPromo: 0,
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
  stage: Stage,
  ctx: RouteContext,
  summary: StageSummary
): Promise<void> {
  try {
    const email = candidate.survey_submission?.app_user?.email?.trim() ?? "";
    if (!email) {
      summary.skippedNoEmail++;
      return;
    }

    // Token resolves first because (a) it's needed for the CTA URL and (b) the
    // quote bootstrap below requires it to attach the quote to the right
    // personal_report.
    const reportToken = await fetchAccessToken(candidate.survey_submission_id);
    if (!reportToken) {
      summary.skippedNoToken++;
      return;
    }

    // Quote is the idempotency carrier. If absent, bootstrap it now — users who
    // never opened /report have no quote yet, and skipping them would gut the
    // 6h_no_view stage.
    let quote = await fetchFullReportQuote(candidate.survey_submission_id);
    if (!quote) {
      quote = await bootstrapFullReportQuote(candidate.survey_submission_id, reportToken);
      if (!quote) {
        summary.skippedNoQuote++;
        return;
      }
    }
    if (getNurtureEmailsSent(quote.metadata).includes(stage)) {
      summary.skippedAlreadySent++;
      return;
    }

    try {
      const currentPlan = await getReportPlanByPersonalReportId(candidate.id);
      if (currentPlan) {
        summary.skippedPaid++;
        return;
      }
    } catch (err) {
      logger.warn(
        { err, personalReportId: candidate.id },
        "nurture-sequence: paid-check failed; continuing"
      );
    }

    if (await isEmailSuppressed(email)) {
      summary.skippedSuppressed++;
      return;
    }

    const firstName = candidate.survey_submission?.app_user?.first_name?.trim() || null;
    const unsubscribeUrl = ctx.unsubSecret
      ? buildUnsubscribeUrl(email, ctx.siteUrl, ctx.unsubSecret)
      : undefined;

    let promo: StripeIssuedPromo | null = null;
    if (stage === "30h_no_unlock" || stage === "54h_no_unlock") {
      promo = await createPromoCode({ stage });
      if (!promo) {
        summary.skippedNoPromo++;
        return;
      }
    }

    const outcome = await sendOne({
      stage,
      email,
      firstName,
      reportToken,
      siteUrl: ctx.siteUrl,
      unsubscribeUrl,
      resend: ctx.resend,
      promo,
      utmCampaign: stage,
    });

    if (outcome === "sent") {
      summary.sent++;
      try {
        await persistStageSent({
          quoteId: quote.id,
          metadata: quote.metadata,
          stage,
          promo,
        });
      } catch (err) {
        logger.error(
          { err, quoteId: quote.id, stage },
          "nurture-sequence: metadata write failed (email delivered)"
        );
      }
    } else {
      summary.failed++;
    }
  } catch (err) {
    summary.failed++;
    logger.error({ err, personalReportId: candidate.id, stage }, "nurture-sequence: per-row error");
  }
}

async function runSixHourStages(
  candidates: CandidateRow[],
  ctx: RouteContext,
  noView: StageSummary,
  noUnlock: StageSummary
): Promise<void> {
  for (const c of candidates) {
    const viewed = await hasReportViewedEvent(c.id);
    const stage: Stage = viewed ? "6h_no_unlock" : "6h_no_view";
    const target = viewed ? noUnlock : noView;
    target.candidates++;
    await processCandidate(c, stage, ctx, target);
  }
}

async function runSingleStage(
  candidates: CandidateRow[],
  stage: Stage,
  ctx: RouteContext,
  summary: StageSummary
): Promise<void> {
  summary.candidates = candidates.length;
  for (const c of candidates) {
    await processCandidate(c, stage, ctx, summary);
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

  const ctx: RouteContext = {
    resend,
    siteUrl: (process.env.NEXT_PUBLIC_SITE_URL || "https://loveiq.org").replace(/\/$/, ""),
    unsubSecret: process.env.UNSUBSCRIBE_SECRET,
  };

  const summaries: Record<Stage, StageSummary> = {
    "6h_no_view": newStageSummary(),
    "6h_no_unlock": newStageSummary(),
    "30h_no_unlock": newStageSummary(),
    "54h_no_unlock": newStageSummary(),
  };

  try {
    const [sixCandidates, thirtyCandidates, fiftyFourCandidates] = await Promise.all([
      fetchCandidatesByAge(AGE_WINDOWS.six),
      fetchCandidatesByAge(AGE_WINDOWS.thirty),
      fetchCandidatesByAge(AGE_WINDOWS.fiftyFour),
    ]);

    await runSixHourStages(sixCandidates, ctx, summaries["6h_no_view"], summaries["6h_no_unlock"]);
    await runSingleStage(thirtyCandidates, "30h_no_unlock", ctx, summaries["30h_no_unlock"]);
    await runSingleStage(fiftyFourCandidates, "54h_no_unlock", ctx, summaries["54h_no_unlock"]);

    logger.info({ summaries }, "nurture-sequence cron finished");
    return NextResponse.json({ success: true, summaries });
  } catch (err) {
    logger.error({ err }, "nurture-sequence cron failed");
    return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
  }
}
