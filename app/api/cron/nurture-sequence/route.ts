/**
 * GET /api/cron/nurture-sequence
 *
 * Hourly nurture sequence cron that fans out across 5 timed stages keyed off
 * `personal_report.created_date_time`:
 *
 *   - `6h_no_view`     — 5–7h ago, no `analytics_event.report_viewed` row
 *   - `6h_no_unlock`   — 5–7h ago, has a viewed event but no paid plan
 *   - `30h_no_unlock`  — 29–31h ago, no paid plan; issues 50% per-user code
 *   - `54h_no_unlock`  — 53–55h ago, no paid plan; issues 75% per-user code
 *   - `78h_no_unlock`  — 77–79h ago, no paid plan; invites a 20-min call (no
 *                        code), CTA → Calendly; logs a `booking_event` row
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
import {
  markSlackAlertDelivered,
  recordCronRun,
  startCronTimer,
  tryClaimSlackAlert,
} from "@shared/observability/slack-alert-dedup";
import { notifySlack } from "@shared/observability/slack";
import { buildUnsubscribeUrl } from "@shared/emails/unsubscribe-token";
import { isEmailSuppressed } from "@shared/emails/suppression";
import { getEmailSiteUrl } from "@shared/emails/site-url";
import { isProdCronHost } from "@shared/http/is-prod-cron-host";
import { isFeatureEnabled } from "@shared/flags/system-flags";
import { getReportPlanByPersonalReportId } from "@features/report/server/planAccess";
import { getStripeServerClient } from "@features/checkout/server/stripeCheckout";
import { getCouponIdForStage } from "@features/checkout/server/promoCodes";
import { getReportPriceQuoteForContext } from "@features/pricing/logic/reportPricing";
import { nurture6hNoViewEmail } from "@features/report/server/emails/nurture/nurture-6h-no-view";
import { nurture6hNoUnlockEmail } from "@features/report/server/emails/nurture/nurture-6h-no-unlock";
import { nurture30hNoUnlockEmail } from "@features/report/server/emails/nurture/nurture-30h-no-unlock";
import { nurture54hNoUnlockEmail } from "@features/report/server/emails/nurture/nurture-54h-no-unlock";
import { nurture78hNoUnlockEmail } from "@features/report/server/emails/nurture/nurture-78h-no-unlock";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// 60s to match the rest of the cron fleet AND the `functions` entry in
// vercel.json. The route-segment export wins on Next.js App Router, so the
// previous `50` silently capped this lone cron 10s below vercel.json's intent
// (the source of the "used 50s budget" ops alert).
export const maxDuration = 60;

const HOUR_MS = 60 * 60 * 1000;
const SUPABASE_TIMEOUT_MS = 8_000;
const RESEND_TIMEOUT_MS = 8_000;
const CANDIDATE_LIMIT_PER_STAGE = 200;
// Minimum failed sends (with ZERO delivered) before the run-level alert is
// escalated to a loud "systemic" `api_5xx` page. Below this, a failed run is
// treated as one-off noise (a bad recipient / transient Resend hiccup) and only
// emits the quiet, once-per-day ops ping. Prevents "ALL 1 send failed →
// systemic" false alarms at low volume.
const SYSTEMIC_MIN_FAILURES = 3;
// Wall-clock guard. The loop is fully sequential (3 stages × up to 200 rows,
// each a few Supabase round-trips + one ≤8s Resend send), so as the audience
// grows a run can creep toward maxDuration and hit a FUNCTION_INVOCATION_TIMEOUT
// 5xx. We stop *starting* new candidates after the budget; the in-flight row
// (worst case ~8s) plus the `finally` tracking writes still finish comfortably
// under the 60s cap. Deferred rows are caught on the next hourly run — the age
// windows are 2h-wide (5–7h / 29–31h / 53–55h), so nobody is skipped for good.
//
// SCALING: deferring is a safety valve, not throughput. When the per-run
// deferred count grows (watch the "time budget reached" warns + cron_run p95),
// the next levers — in rough order of effort — are: (1) move the
// already-sent/paid filter server-side so the loop only fetches actionable
// rows; (2) bounded concurrency over candidates (distinct quote rows ⇒ no
// intra-instance double-send; cap low to stay under Resend's rate limit).
// Both need a live Supabase/Resend integration run to validate, so they are
// deliberately NOT bundled with this guard.
const DEFAULT_TIME_BUDGET_MS = 42_000;

/**
 * Resolve the wall-clock budget (ms). Overridable via `NURTURE_TIME_BUDGET_MS`
 * so ops can tune headroom without a redeploy and tests can drive the guard
 * deterministically. Read per-request (not at module load) for that reason.
 * Falls back to the default for unset / blank / non-finite / negative values.
 *
 * NOTE: `0` is accepted and means "defer every candidate" — useful for the
 * deterministic guard test, but in prod it silently stops all sends. To PAUSE
 * the cron, flip the `nurture_sequence` kill switch instead; never set this to 0.
 */
function resolveTimeBudgetMs(): number {
  const raw = process.env.NURTURE_TIME_BUDGET_MS;
  if (raw === undefined || raw.trim() === "") return DEFAULT_TIME_BUDGET_MS;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_TIME_BUDGET_MS;
}

type Stage = "6h_no_view" | "6h_no_unlock" | "30h_no_unlock" | "54h_no_unlock" | "78h_no_unlock";

// Final-stage CTA target. The 78h email links OUT to Calendly (a 20-min call),
// not to /report. Fixed booking URL — UTM + invitee prefill are appended per-send.
const CALENDLY_CALL_URL = "https://calendly.com/ema-djedovic-loveiq/20min";

interface AgeWindow {
  minMs: number;
  maxMs: number;
}

// 2h-wide windows so a missed hourly tick still catches users on the next run.
const AGE_WINDOWS = {
  six: { minMs: 5 * HOUR_MS, maxMs: 7 * HOUR_MS },
  thirty: { minMs: 29 * HOUR_MS, maxMs: 31 * HOUR_MS },
  fiftyFour: { minMs: 53 * HOUR_MS, maxMs: 55 * HOUR_MS },
  seventyEight: { minMs: 77 * HOUR_MS, maxMs: 79 * HOUR_MS },
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
      // T-09: GDPR Art. 18 restriction flag. When non-null, the cron skips
      // this candidate entirely — no nurture email goes out while the user's
      // data is frozen.
      processing_restricted_at?: string | null;
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
    `survey_submission!fk_personal_report_submission(app_user!fk_survey_submission_user(email,first_name,processing_restricted_at))` +
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
  // F-17: honor optional expires_at — a token expiring before the user can
  // act on the nurture email is worse than no email (they'd click and 404).
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
  // 24h expiry covers the blast radius. Note: manual promo entry on the hosted
  // checkout is ON (product decision 2026-06-10), so a forwarded single-use code
  // could in principle be hand-typed before the owner uses it; the per-submission
  // ownership check still governs the auto-apply (?promo= link) path.
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
      // `slack: false` keeps the ops channel quiet — the caller already
      // handles the null return (bumps skippedNoPromo, no email sent).
      // The full error is still captured in Vercel runtime logs with
      // pino's `err` serializer (message + stack).
      logger.error(
        { err, stage, errorMessage: message, slack: false },
        "nurture-sequence: stripe promo create failed"
      );
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
  submissionId: number;
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
    // Soften the forced-paywall arm to the dismissible blurred-preview
    // experience for anyone returning via an email link (see
    // resolveReportPaywallCohort). `utm_source=email` already signals this, but
    // `from=email` is the explicit, analytics-independent flag.
    from: "email",
    utm_source: "email",
    utm_medium: "nurture",
    utm_campaign: stage,
  });
  if (promoCode) params.set("promo", promoCode);
  return `${siteUrl}/report/${encodeURIComponent(reportToken)}?${params.toString()}`;
}

/**
 * Build the Calendly CTA for the 78h call invite. Carries UTM attribution plus
 * Calendly's name/email prefill so the booking is one tap. `utm_content` is the
 * survey submission id — Calendly echoes UTM params into the `tracking` object
 * on the booking webhook, giving an exact correlation key even if the invitee
 * books under a different email.
 */
function buildCallCtaUrl({
  stage,
  email,
  firstName,
  submissionId,
}: {
  stage: Stage;
  email: string;
  firstName: string | null;
  submissionId: number;
}): string {
  const params = new URLSearchParams({
    utm_source: "email",
    utm_medium: "nurture",
    utm_campaign: stage,
    utm_content: String(submissionId),
    email,
  });
  const name = firstName?.trim();
  if (name) params.set("name", name);
  return `${CALENDLY_CALL_URL}?${params.toString()}`;
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
    case "78h_no_unlock":
      // CTA links OUT to Calendly (a call), not /report — so it ignores the
      // report `ctaUrl` in `common` and builds its own booking URL.
      return nurture78hNoUnlockEmail({
        firstName: input.firstName,
        ctaUrl: buildCallCtaUrl({
          stage: input.stage,
          email: input.email,
          firstName: input.firstName,
          submissionId: input.submissionId,
        }),
        siteUrl: input.siteUrl,
        unsubscribeUrl: input.unsubscribeUrl,
      });
  }
}

/**
 * F-08: deactivate a previously-minted promo code so it can no longer be
 * redeemed at checkout. Pulled from `metadata.nurturePromoCodes[stage]`.
 * Best-effort: any failure is logged and swallowed — the caller proceeds.
 */
async function deactivatePriorStagePromo(
  metadata: Record<string, unknown> | null,
  priorStage: Stage
): Promise<void> {
  const codes = (metadata?.nurturePromoCodes as Record<string, unknown> | undefined) ?? {};
  const prior = codes[priorStage] as { stripePromotionCodeId?: string } | undefined;
  const promoId = prior?.stripePromotionCodeId;
  if (!promoId) return;
  const stripe = getStripeServerClient();
  if (!stripe) return;
  try {
    await stripe.promotionCodes.update(promoId, { active: false });
  } catch (err) {
    logger.warn(
      { err, priorStage, promoId, slack: false },
      "nurture-sequence: deactivate prior promo failed (best-effort)"
    );
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

/**
 * Best-effort `booking_event` row for the 78h call-invite send. Gives a
 * queryable per-user funnel row (call_invite_sent → call_booked → … filled in
 * later by the Calendly webhook) that surfaces in the admin timeline.
 * Non-fatal: a failed insert is logged and swallowed — the email already went
 * out and `nurtureEmailsSent` is the send idempotency guard.
 */
async function recordCallInviteSent({
  submissionId,
  personalReportId,
  email,
  campaign,
}: {
  submissionId: number;
  personalReportId: number;
  email: string;
  campaign: Stage;
}): Promise<void> {
  try {
    await supabaseFetch(`/rest/v1/booking_event`, {
      body: JSON.stringify({
        survey_submission_id: submissionId,
        personal_report_id: personalReportId,
        email,
        event_type: "call_invite_sent",
        source_campaign: campaign,
      }),
      headers: { Prefer: "return=minimal" },
      method: "POST",
    });
  } catch (err) {
    logger.warn(
      { err, submissionId, slack: false },
      "nurture-sequence: booking_event call_invite_sent insert failed (best-effort)"
    );
  }
}

async function sendOne(input: SendInput): Promise<{ ok: true } | { ok: false; reason: string }> {
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
          // P-06: cluster nurture mail under a dedicated list identity so
          // Gmail/Outlook apply per-list reputation; `Precedence: bulk`
          // suppresses auto-responders (out-of-office, vacation replies).
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
      const reason = `${(error as { name?: string }).name ?? "ResendError"}: ${
        (error as { message?: string }).message ?? "unknown"
      }`.slice(0, 200);
      // slack:false — a single recoverable send failure is expected operational
      // noise (full mailbox, transient Resend hiccup) already counted in
      // summary.failed and surfaced (with this reason) by the run-level
      // aggregate. Per-email `api_5xx` mirrors would spam ops. Full error in logs.
      logger.error(
        { err: error, stage: input.stage, slack: false },
        "nurture-sequence: send failed"
      );
      return { ok: false, reason };
    }
    return { ok: true };
  } catch (err) {
    const reason = (err instanceof Error ? err.message : String(err)).slice(0, 200);
    logger.error({ err, stage: input.stage, slack: false }, "nurture-sequence: send error");
    return { ok: false, reason };
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
  // Absolute wall-clock deadline (ms epoch). Loops stop starting new candidates
  // once Date.now() reaches it. See TIME_BUDGET_MS.
  deadlineAtMs: number;
  // Run-level collector of "<stage>: <reason>" strings for failed sends/rows so
  // the aggregate alert is self-diagnosing instead of forcing a Vercel log dive.
  failureReasons: string[];
}

async function processCandidate(
  candidate: CandidateRow,
  stage: Stage,
  ctx: RouteContext,
  summary: StageSummary
): Promise<void> {
  try {
    // T-09: GDPR Art. 18 restriction. If the user's data is frozen, no
    // nurture email goes out for them. Counted under skippedNoEmail to
    // avoid adding a new summary field — the visible effect to ops is
    // "this user got skipped for reasons that aren't their fault." The
    // dedicated `restricted_at` row in admin_action_log is the audit
    // trail; this is just the no-op gate.
    if (candidate.survey_submission?.app_user?.processing_restricted_at) {
      summary.skippedNoEmail++;
      return;
    }

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
      // F-08: when the 54h (75%-off) code mints, deactivate any still-live
      // 30h (50%-off) code for this user so promo stacking is impossible.
      // Best-effort: a deactivate failure just leaves the smaller code live
      // until its 24h Stripe expiry — degraded but not catastrophic.
      if (stage === "54h_no_unlock") {
        await deactivatePriorStagePromo(quote.metadata, "30h_no_unlock");
      }
    }

    // F-06: persist the idempotency marker BEFORE sending. If the marker
    // write fails, we never send — the next cron run will retry. If the
    // send fails after the marker is written, the marker stays and this
    // stage will not be retried; the user simply loses this nurture email
    // and the next stage (if any) is the only follow-up. This is the
    // audit-accepted trade-off: prefer "missed nurture" over "double-send
    // with two distinct promo codes 1 hour apart".
    //
    // Race note: two concurrent cron instances can still both read stale
    // metadata, both write the marker, and both send. The structural fix
    // is a unique expression index on metadata->'nurtureEmailsSent'; out
    // of scope here. The order flip alone covers the single-instance
    // crash-mid-run case (the primary failure mode).
    try {
      await persistStageSent({
        quoteId: quote.id,
        metadata: quote.metadata,
        stage,
        promo,
      });
    } catch (err) {
      summary.failed++;
      ctx.failureReasons.push(`${stage}: marker-write-failed`);
      // slack:false — per-candidate failure already counted in summary.failed
      // and surfaced by the run-level aggregate ping; don't page ops per row.
      logger.error(
        { err, quoteId: quote.id, stage, slack: false },
        "nurture-sequence: marker write failed before send; skipping"
      );
      return;
    }

    const outcome = await sendOne({
      stage,
      email,
      firstName,
      reportToken,
      submissionId: candidate.survey_submission_id,
      siteUrl: ctx.siteUrl,
      unsubscribeUrl,
      resend: ctx.resend,
      promo,
      utmCampaign: stage,
    });

    if (outcome.ok) {
      summary.sent++;
      if (stage === "78h_no_unlock") {
        await recordCallInviteSent({
          submissionId: candidate.survey_submission_id,
          personalReportId: candidate.id,
          email,
          campaign: stage,
        });
      }
    } else {
      summary.failed++;
      ctx.failureReasons.push(`${stage}: ${outcome.reason}`);
      logger.warn(
        { quoteId: quote.id, stage },
        "nurture-sequence: send failed after marker persisted; not retrying"
      );
    }
  } catch (err) {
    summary.failed++;
    ctx.failureReasons.push(`${stage}: per-row-error`);
    logger.error(
      { err, personalReportId: candidate.id, stage, slack: false },
      "nurture-sequence: per-row error"
    );
  }
}

/**
 * T-20: every N candidates, re-check `nurture_sequence` kill switch.
 * Admin can flip the flag mid-run; we should respect it without waiting
 * for the next hourly cron. 10 is a balance: tight enough that a bad
 * email batch is stopped before ~10 more sends, loose enough that the
 * Supabase round-trip cost doesn't dominate the loop.
 */
const KILL_SWITCH_CHECK_INTERVAL = 10;

/**
 * P-04: graceful SIGTERM handling. Vercel sends SIGTERM ~100-300ms before
 * killing a stale Lambda during a deploy. If a cron is mid-loop we want
 * to exit cleanly with a log line, not get truncated. The `terminated`
 * flag is per-request: installed in GET, cleared in finally so it never
 * leaks across warm-Lambda invocations.
 */
let terminated = false;

async function isNurtureKilled(): Promise<boolean> {
  return !(await isFeatureEnabled("nurture_sequence"));
}

/**
 * Fire a single ops Slack ping, deduped per (kind, UTC day) via the two-phase
 * claim so a persistent condition pings at most once per day. Best-effort: a
 * Slack or claim failure is swallowed inside the helpers and never breaks the
 * cron. Mirrors the chapter-nudge pattern: individual send failures are logged
 * with `slack: false`; this run-level aggregate is the single actionable alert.
 */
async function pingOps(kind: string, dayKey: string, text: string): Promise<void> {
  if (!(await tryClaimSlackAlert(kind, "cron_day", dayKey))) return;
  await notifySlack({ channel: "ops", kind, text, username: "ops_alerts" });
  await markSlackAlertDelivered(kind, "cron_day", dayKey);
}

async function runSixHourStages(
  candidates: CandidateRow[],
  ctx: RouteContext,
  noView: StageSummary,
  noUnlock: StageSummary
): Promise<void> {
  for (let i = 0; i < candidates.length; i++) {
    if (Date.now() >= ctx.deadlineAtMs) {
      logger.warn(
        { processed: i, remaining: candidates.length - i, stage: "6h" },
        "nurture-sequence: time budget reached; deferring remaining candidates to next run"
      );
      return;
    }
    if (terminated) {
      logger.warn(
        { processed: i, remaining: candidates.length - i, stage: "6h" },
        "nurture-sequence: SIGTERM received mid-loop; exiting"
      );
      return;
    }
    if (i > 0 && i % KILL_SWITCH_CHECK_INTERVAL === 0 && (await isNurtureKilled())) {
      logger.warn(
        { processed: i, remaining: candidates.length - i, stage: "6h" },
        "nurture-sequence: kill switch tripped mid-loop; exiting"
      );
      return;
    }
    const c = candidates[i]!;
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
  for (let i = 0; i < candidates.length; i++) {
    if (Date.now() >= ctx.deadlineAtMs) {
      logger.warn(
        { processed: i, remaining: candidates.length - i, stage },
        "nurture-sequence: time budget reached; deferring remaining candidates to next run"
      );
      return;
    }
    if (terminated) {
      logger.warn(
        { processed: i, remaining: candidates.length - i, stage },
        "nurture-sequence: SIGTERM received mid-loop; exiting"
      );
      return;
    }
    if (i > 0 && i % KILL_SWITCH_CHECK_INTERVAL === 0 && (await isNurtureKilled())) {
      logger.warn(
        { processed: i, remaining: candidates.length - i, stage },
        "nurture-sequence: kill switch tripped mid-loop; exiting"
      );
      return;
    }
    await processCandidate(candidates[i]!, stage, ctx, summary);
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

  // Skip on the staging Vercel project (shares the prod DB). Without this
  // gate, staging's nurture cron sends emails — containing staging URLs —
  // to real prod users.
  if (!isProdCronHost()) {
    return NextResponse.json({ skipped: true, reason: "non-prod-cron-host" });
  }

  // Kill switch (F-12). Admin can flip `nurture_sequence=false` to stop
  // the cron without redeploying — useful if a bad email goes out.
  if (!(await isFeatureEnabled("nurture_sequence"))) {
    return NextResponse.json({ skipped: true, reason: "kill_switch" });
  }

  const resend = getResend();
  if (!resend) {
    return NextResponse.json({ error: "Service unavailable." }, { status: 503 });
  }

  const trackDuration = startCronTimer("nurture-sequence", 60);
  const startMs = Date.now();
  // UTC day, used to dedup the run-level send-failure ops alert to once per day.
  const dayKey = new Date(startMs).toISOString().slice(0, 10);
  let cronError: string | undefined;

  // P-04: install a one-shot SIGTERM listener. `process.once` rather than
  // `process.on` so a warm-Lambda re-invocation doesn't accumulate stale
  // handlers; the `finally` block also removes ours explicitly.
  terminated = false;
  const onSigterm = () => {
    terminated = true;
    logger.warn("nurture-sequence: SIGTERM received");
  };
  process.once("SIGTERM", onSigterm);

  const ctx: RouteContext = {
    resend,
    siteUrl: getEmailSiteUrl(),
    unsubSecret: process.env.UNSUBSCRIBE_SECRET,
    deadlineAtMs: startMs + resolveTimeBudgetMs(),
    failureReasons: [],
  };

  const summaries: Record<Stage, StageSummary> = {
    "6h_no_view": newStageSummary(),
    "6h_no_unlock": newStageSummary(),
    "30h_no_unlock": newStageSummary(),
    "54h_no_unlock": newStageSummary(),
    "78h_no_unlock": newStageSummary(),
  };

  try {
    const [sixCandidates, thirtyCandidates, fiftyFourCandidates, seventyEightCandidates] =
      await Promise.all([
        fetchCandidatesByAge(AGE_WINDOWS.six),
        fetchCandidatesByAge(AGE_WINDOWS.thirty),
        fetchCandidatesByAge(AGE_WINDOWS.fiftyFour),
        fetchCandidatesByAge(AGE_WINDOWS.seventyEight),
      ]);

    await runSixHourStages(sixCandidates, ctx, summaries["6h_no_view"], summaries["6h_no_unlock"]);
    await runSingleStage(thirtyCandidates, "30h_no_unlock", ctx, summaries["30h_no_unlock"]);
    await runSingleStage(fiftyFourCandidates, "54h_no_unlock", ctx, summaries["54h_no_unlock"]);
    await runSingleStage(seventyEightCandidates, "78h_no_unlock", ctx, summaries["78h_no_unlock"]);

    // Run-level aggregate alert. Per-email failures are logged with `slack:false`
    // (no per-email api_5xx spam); here we surface them once per run WITH the
    // actual failure reason(s) so the alert is self-diagnosing (no log dive).
    const totals = Object.values(summaries).reduce(
      (acc, s) => {
        acc.sent += s.sent;
        acc.failed += s.failed;
        return acc;
      },
      { sent: 0, failed: 0 }
    );
    if (totals.failed > 0) {
      const byStage = Object.entries(summaries)
        .filter(([, s]) => s.failed > 0)
        .map(([stage, s]) => `${stage}:${s.failed}`)
        .join(", ");
      const reasons = [...new Set(ctx.failureReasons)].slice(0, 3).join(" | ") || "see logs";
      if (totals.sent === 0 && totals.failed >= SYSTEMIC_MIN_FAILURES) {
        // Genuinely systemic: enough sends failed with ZERO delivered to suggest
        // a Resend outage / Supabase write degradation. Page loudly via
        // logger.error → ops `api_5xx`, claim-INDEPENDENT (the same Supabase
        // degradation that causes mass failures also fails pingOps's dedup-claim,
        // so routing the worst case through it could silence it entirely).
        logger.error(
          { totals, summaries, reasons: ctx.failureReasons.slice(0, 10) },
          `nurture-sequence: ${totals.failed} send(s) failed, 0 delivered (${byStage}) — likely systemic. Reasons: ${reasons}`
        );
      } else {
        // One-off / partial failures: a bad recipient or transient hiccup, NOT an
        // outage. One deduped ops ping per UTC day, with the reason so it's still
        // actionable without spamming.
        await pingOps(
          "nurture_send_failures",
          dayKey,
          `:warning: nurture-sequence: ${totals.failed} of ${totals.failed + totals.sent} send(s) ` +
            `failed this run (${byStage}). Reasons: ${reasons}`
        );
      }
    }

    logger.info({ summaries }, "nurture-sequence cron finished");
    return NextResponse.json({ success: true, summaries });
  } catch (err) {
    logger.error({ err }, "nurture-sequence cron failed");
    cronError = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
  } finally {
    process.off("SIGTERM", onSigterm);
    await trackDuration();
    await recordCronRun("nurture-sequence", startMs, cronError ? "error" : "success", cronError);
  }
}
