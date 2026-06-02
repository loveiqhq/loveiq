import { NextResponse } from "next/server";
import { Resend } from "resend";
import { verifyAdminSession } from "@features/admin/server/auth";
import { hasRole } from "@features/admin/server/roles";
import { logAdminAction } from "@features/admin/server/audit";
import { supabaseFetch } from "@features/admin/server/supabase";
import { verifyCsrfToken } from "@shared/http/csrf";
import { checkRateLimit, getClientIp } from "@shared/http/ratelimit";
import logger from "@shared/observability/logger";
import { getCouponIdForStage, mintUserPromoCode } from "@features/checkout/server/promoCodes";
import { getReportPriceQuoteForContext } from "@features/pricing/logic/reportPricing";
import { getEmailSiteUrl } from "@shared/emails/site-url";
import { buildUnsubscribeUrl } from "@shared/emails/unsubscribe-token";
import { postCallCouponEmail } from "@features/report/server/emails/nurture/post-call-coupon";
import { insertBookingEvent } from "@features/booking/server/calendly";

export const runtime = "nodejs";

const COUPON_EXPIRY_DAYS = 14;

interface QuoteRow {
  id: number;
  metadata: Record<string, unknown> | null;
}

/**
 * POST /api/admin/submissions/[id]/grant-call-coupon
 *
 * Admin action taken AFTER a 20-minute call: mints a one-time, per-user
 * 100%-off promo code, stores it on the submission's full_report quote (so
 * checkout can pre-apply it via `?promo=`), emails the user a one-tap unlock
 * link, and records a `call_coupon_sent` booking_event. Idempotent: a second
 * call returns 409 with the already-issued code.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await verifyAdminSession();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!hasRole(admin.role, "editor")) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  if (!(await verifyCsrfToken(request))) {
    return NextResponse.json({ error: "Invalid request." }, { status: 403 });
  }

  const ip = getClientIp(request);
  const rateLimit = await checkRateLimit(ip, {
    bucket: "admin-grant-coupon",
    limit: 10,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Please try again later." }, { status: 429 });
  }

  const { id } = await params;
  const submissionId = parseInt(id, 10);
  if (isNaN(submissionId) || submissionId < 1) {
    return NextResponse.json({ error: "Invalid submission ID." }, { status: 400 });
  }

  const couponId = getCouponIdForStage("post_call");
  if (!couponId) {
    logger.error("grant-call-coupon: STRIPE_COUPON_100 not configured");
    return NextResponse.json({ error: "Coupon not configured." }, { status: 503 });
  }

  try {
    // Resolve recipient, report token, personal report id, and the full_report
    // quote (the idempotency + code carrier) in parallel.
    const [subRes, tokenRes, reportRes] = await Promise.all([
      supabaseFetch(
        `/rest/v1/survey_submission?id=eq.${submissionId}&select=id,app_user!fk_survey_submission_user(email,first_name)`
      ),
      supabaseFetch(
        `/rest/v1/report_access_token?survey_submission_id=eq.${submissionId}&revoked_at=is.null&token=not.is.null&select=token&order=created_at.desc&limit=1`
      ),
      supabaseFetch(
        `/rest/v1/personal_report?survey_submission_id=eq.${submissionId}&select=id&limit=1`
      ),
    ]);

    if (!subRes.ok) {
      return NextResponse.json({ error: "Unable to load submission." }, { status: 500 });
    }
    const subs = (await subRes.json()) as Array<{
      id: number;
      app_user: { email: string | null; first_name: string | null } | null;
    }>;
    if (subs.length === 0) {
      return NextResponse.json({ error: "Submission not found." }, { status: 404 });
    }
    const email = subs[0]!.app_user?.email?.trim() || null;
    const firstName = subs[0]!.app_user?.first_name?.trim() || null;
    if (!email) {
      return NextResponse.json({ error: "Submission has no email." }, { status: 400 });
    }

    let reportToken: string | null = null;
    if (tokenRes.ok) {
      const tokenRows = (await tokenRes.json()) as Array<{ token: string }>;
      reportToken = tokenRows[0]?.token ?? null;
    }
    if (!reportToken) {
      // 422 (not 409) — a missing token is a data prerequisite failure, not a
      // duplicate-grant conflict. 409 is reserved for the already-granted case.
      return NextResponse.json(
        { error: "No report access token for submission." },
        { status: 422 }
      );
    }

    const personalReportId = reportRes.ok
      ? (((await reportRes.json()) as Array<{ id: number }>)[0]?.id ?? null)
      : null;

    // Fetch the full_report quote (idempotency + code carrier); bootstrap it if
    // the user never opened /report (rare by post-call time).
    let quote = await fetchFullReportQuote(submissionId);
    if (!quote) {
      try {
        await getReportPriceQuoteForContext({
          plan: "full_report",
          submissionId,
          reportToken,
          userAgent: null,
        });
      } catch (err) {
        logger.warn({ err, submissionId }, "grant-call-coupon: quote bootstrap failed");
      }
      quote = await fetchFullReportQuote(submissionId);
    }
    if (!quote) {
      // 422 prerequisite failure (not 409 — that's the already-granted signal).
      return NextResponse.json({ error: "No price quote for submission." }, { status: 422 });
    }

    // One-time guard: never re-grant. Return the existing code so the admin can
    // resend it manually if the original email was lost.
    const existingCodes =
      (quote.metadata?.nurturePromoCodes as Record<string, { code?: string }> | undefined) ?? {};
    if (existingCodes.post_call?.code) {
      return NextResponse.json(
        { error: "Coupon already granted.", code: existingCodes.post_call.code },
        { status: 409 }
      );
    }

    const minted = await mintUserPromoCode({
      percentOff: 100,
      couponId,
      expiresAtSec: Math.floor(Date.now() / 1000) + COUPON_EXPIRY_DAYS * 24 * 3600,
    });
    if (!minted) {
      return NextResponse.json({ error: "Unable to create coupon." }, { status: 502 });
    }

    // Persist the code on the quote so resolveNurturePromo can pre-apply it.
    const nextMetadata: Record<string, unknown> = {
      ...(quote.metadata ?? {}),
      nurturePromoCodes: {
        ...existingCodes,
        post_call: {
          code: minted.code,
          stripePromotionCodeId: minted.stripePromotionCodeId,
          percentOff: minted.percentOff,
          expiresAt: minted.expiresAt,
        },
      },
    };
    const patchRes = await supabaseFetch(`/rest/v1/report_price_quote?id=eq.${quote.id}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ metadata: nextMetadata, updated_date_time: new Date().toISOString() }),
    });
    if (!patchRes.ok) {
      logger.error(
        { status: patchRes.status, submissionId },
        "grant-call-coupon: metadata write failed"
      );
      return NextResponse.json({ error: "Unable to store coupon." }, { status: 500 });
    }

    // Email the user (best-effort — the coupon is already valid + stored, so a
    // send failure is non-fatal; we return the code so the admin can resend).
    const siteUrl = getEmailSiteUrl();
    const params2 = new URLSearchParams({
      promo: minted.code,
      offer: "1",
      utm_source: "email",
      utm_medium: "nurture",
      utm_campaign: "post_call_coupon",
    });
    const ctaUrl = `${siteUrl}/report/${encodeURIComponent(reportToken)}?${params2.toString()}`;
    const unsubSecret = process.env.UNSUBSCRIBE_SECRET;
    const unsubscribeUrl = unsubSecret
      ? buildUnsubscribeUrl(email, siteUrl, unsubSecret)
      : undefined;

    let emailed = false;
    const resendKey = process.env.RESEND_API_KEY;
    if (resendKey) {
      try {
        const tpl = postCallCouponEmail({
          firstName,
          ctaUrl,
          promoCode: minted.code,
          siteUrl,
          unsubscribeUrl,
        });
        const { error } = await new Resend(resendKey).emails.send({
          from: process.env.RESEND_FROM || "LoveIQ <hello@loveiq.org>",
          to: email,
          replyTo: process.env.RESEND_REPLY_TO || "hello@loveiq.org",
          subject: tpl.subject,
          html: tpl.html,
          text: tpl.text,
          headers: {
            "X-LoveIQ-Stage": "post_call",
            ...(unsubscribeUrl && {
              "List-Unsubscribe": `<${unsubscribeUrl}>`,
              "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
            }),
          },
        });
        emailed = !error;
        if (error) {
          logger.error({ err: error, submissionId }, "grant-call-coupon: email send failed");
        }
      } catch (err) {
        logger.error({ err, submissionId }, "grant-call-coupon: email send threw");
      }
    }

    // Record the grant in the call funnel (best-effort).
    await insertBookingEvent({
      submissionId,
      personalReportId,
      email,
      eventType: "call_coupon_sent",
      sourceCampaign: "post_call_coupon",
    });

    await logAdminAction({
      admin_email: admin.email,
      action: "grant_call_coupon",
      resource_type: "submission",
      resource_id: String(submissionId),
      metadata: { code: minted.code, emailed },
      ip,
    });

    return NextResponse.json({
      success: true,
      code: minted.code,
      expiresAt: minted.expiresAt,
      emailed,
    });
  } catch (err) {
    logger.error({ err, submissionId }, "grant-call-coupon: error");
    return NextResponse.json({ error: "Unable to grant coupon." }, { status: 500 });
  }
}

async function fetchFullReportQuote(submissionId: number): Promise<QuoteRow | null> {
  const res = await supabaseFetch(
    `/rest/v1/report_price_quote?survey_submission_id=eq.${submissionId}&plan=eq.full_report&select=id,metadata&order=id.desc&limit=1`
  );
  if (!res.ok) return null;
  const rows = (await res.json()) as QuoteRow[];
  return rows[0] ?? null;
}
