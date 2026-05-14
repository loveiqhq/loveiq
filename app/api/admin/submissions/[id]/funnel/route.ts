/**
 * Admin user-session funnel for one submission. Returns the same shape the
 * team tracks in `Tracking & Pricing - User tracking.csv`:
 *   landing → start survey → 25/50/75% progress → completed → report viewed
 *   → engagement 1/5/10 min → paywall view → price shown → unlocked → € paid
 * Plus invite recipients, share recipients, UTM, session, Hotjar id.
 *
 * All data is derived from existing tables — no new client-side tracking is
 * required. Progress milestones are computed from `survey_behavior_event`
 * (max question_index reached / total questions). Conversion is read from
 * `report_price_quote` (the source of truth) and cross-checked against the
 * `paywall_unlocked` analytics_event row.
 */

import { NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/admin/auth";
import { hasRole } from "@/lib/admin/roles";
import { checkRateLimit, getClientIp } from "@/lib/ratelimit";
import { supabaseFetch } from "@/lib/admin/supabase";
import { maskEmail } from "@/lib/admin/format";
import { SURVEY_TOTAL_QUESTIONS, parseUtmSource } from "@features/survey/server/utils";
import logger from "@/lib/logger";

interface ShareEntry {
  method: "email" | "link" | "share";
  channel: string;
  recipient_email: string | null;
  shared_at: string;
  plan_at_share: string | null;
}

interface FunnelResponse {
  submission_id: number;
  user: { id: number | null; email_masked: string | null; first_name: string | null };
  funnel: {
    started_at: string | null;
    landing_page_view: boolean;
    start_survey_at: string | null;
    progress_25_at: string | null;
    progress_50_at: string | null;
    progress_75_at: string | null;
    survey_completed_at: string | null;
    report_viewed_at: string | null;
    engagement_1min_at: string | null;
    engagement_5min_at: string | null;
    engagement_10min_at: string | null;
    paywall_view_at: string | null;
    paywall_unlocked_at: string | null;
  };
  pricing: {
    bucket: string | null;
    price_shown_full_report_eur: number | null;
    currency: string;
  };
  conversion: {
    plan: string | null;
    value_eur: number | null;
    currency: string;
    transaction_id: string | null;
  };
  shares: ShareEntry[];
  context: {
    session_id: string | null;
    hotjar_user_id: string | null;
    utm_source: string | null;
    utm_tracker: string | null;
  };
}

const PROGRESS_THRESHOLDS = [
  { key: "progress_25_at" as const, ratio: 0.25 },
  { key: "progress_50_at" as const, ratio: 0.5 },
  { key: "progress_75_at" as const, ratio: 0.75 },
];

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await verifyAdminSession();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!hasRole(admin.role, "viewer")) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const ip = getClientIp(request);
  const rateLimit = await checkRateLimit(ip, {
    bucket: "admin-funnel",
    limit: 30,
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

  try {
    const subRes = await supabaseFetch(
      `/rest/v1/survey_submission?id=eq.${submissionId}&select=id,user_id,session_id,start_date_time,created_date_time,status,utm_tracker,hotjar_user_id,app_user!fk_survey_submission_user(id,email,first_name)`
    );
    if (!subRes.ok) {
      return NextResponse.json({ error: "Unable to load submission." }, { status: 500 });
    }
    const subs = (await subRes.json()) as Array<{
      id: number;
      user_id: number | null;
      session_id: string | null;
      start_date_time: string | null;
      created_date_time: string;
      status: string;
      utm_tracker: string | null;
      hotjar_user_id: string | null;
      app_user: { id: number; email: string; first_name: string | null } | null;
    }>;
    if (subs.length === 0) {
      return NextResponse.json({ error: "Submission not found." }, { status: 404 });
    }
    // subs.length checked > 0 above; [0] is non-undefined.
    const sub = subs[0]!;

    const progressTimestamps: Record<
      "progress_25_at" | "progress_50_at" | "progress_75_at",
      string | null
    > = {
      progress_25_at: null,
      progress_50_at: null,
      progress_75_at: null,
    };

    if (sub.session_id) {
      const behRes = await supabaseFetch(
        `/rest/v1/survey_behavior_event?session_id=eq.${sub.session_id}&select=question_index,event_time&order=event_time.asc`
      );
      if (behRes.ok) {
        const rows = (await behRes.json()) as Array<{
          question_index: number;
          event_time: string;
        }>;
        let maxIndex = -1;
        for (const row of rows) {
          if (row.question_index <= maxIndex) continue;
          maxIndex = row.question_index;
          // question_index is 0-based; +1 = number of questions reached.
          const ratio = (row.question_index + 1) / SURVEY_TOTAL_QUESTIONS;
          for (const t of PROGRESS_THRESHOLDS) {
            if (ratio >= t.ratio && progressTimestamps[t.key] === null) {
              progressTimestamps[t.key] = row.event_time;
            }
          }
        }
      }
    }

    const analyticsRes = await supabaseFetch(
      `/rest/v1/analytics_event?survey_submission_id=eq.${submissionId}&event_type=in.(report_viewed,paywall_view,paywall_unlocked,report_engagement_1min,report_engagement_5min,report_engagement_10min)&select=event_type,event_time,metadata&order=event_time.asc`
    );
    const firstByType = new Map<
      string,
      { event_time: string; metadata: Record<string, unknown> | null }
    >();
    if (analyticsRes.ok) {
      const rows = (await analyticsRes.json()) as Array<{
        event_type: string;
        event_time: string;
        metadata: Record<string, unknown> | null;
      }>;
      for (const row of rows) {
        if (!firstByType.has(row.event_type)) {
          firstByType.set(row.event_type, { event_time: row.event_time, metadata: row.metadata });
        }
      }
    }

    // Pricing — prefer report_price_quote (the canonical source set by the
    // engine when the modal was rendered). Fall back to paywall_view metadata
    // if no quote exists yet (e.g. user opened modal before quote write).
    const quoteRes = await supabaseFetch(
      `/rest/v1/report_price_quote?survey_submission_id=eq.${submissionId}&select=plan,base_price_bucket,current_price,currency,purchased_at,checkout_started_at,metadata&order=created_date_time.asc`
    );
    let bucket: string | null = null;
    let priceShownFullReportEur: number | null = null;
    let currency = "EUR";
    let conversionPlan: string | null = null;
    let conversionValue: number | null = null;
    let conversionTxnId: string | null = null;
    let unlockedAt: string | null = null;

    if (quoteRes.ok) {
      const quotes = (await quoteRes.json()) as Array<{
        plan: string;
        base_price_bucket: string | null;
        current_price: string | number;
        currency: string | null;
        purchased_at: string | null;
        checkout_started_at: string | null;
        metadata: Record<string, unknown> | null;
      }>;
      const purchasedPlans: string[] = [];
      let totalConversion = 0;
      let hasPurchased = false;
      for (const q of quotes) {
        const priceNum =
          typeof q.current_price === "number" ? q.current_price : Number(q.current_price);
        if (q.plan === "full_report") {
          bucket = q.base_price_bucket ?? bucket;
          priceShownFullReportEur = Number.isFinite(priceNum) ? priceNum : priceShownFullReportEur;
          if (q.currency) currency = q.currency;
        }
        if (q.purchased_at) {
          hasPurchased = true;
          purchasedPlans.push(q.plan);
          if (Number.isFinite(priceNum)) totalConversion += priceNum;
          if (q.currency) currency = q.currency;
          // Take the latest purchase timestamp (created_date_time order doesn't
          // guarantee purchased_at order — a quote created earlier might be
          // paid later if the user upgraded).
          if (!unlockedAt || new Date(q.purchased_at) > new Date(unlockedAt)) {
            unlockedAt = q.purchased_at;
            const meta = q.metadata ?? {};
            conversionTxnId =
              (typeof meta.paymentId === "number" || typeof meta.paymentId === "string"
                ? String(meta.paymentId)
                : null) ?? (typeof meta.transaction_id === "string" ? meta.transaction_id : null);
          }
        }
      }
      if (hasPurchased) {
        conversionValue = totalConversion;
        conversionPlan = purchasedPlans.join(" + ");
      }
    }

    if (priceShownFullReportEur === null) {
      const paywall = firstByType.get("paywall_view");
      const items = Array.isArray(paywall?.metadata?.items) ? paywall!.metadata!.items : null;
      if (items) {
        for (const raw of items as Array<Record<string, unknown>>) {
          if (raw.plan === "full_report" && typeof raw.price === "number") {
            priceShownFullReportEur = raw.price;
            if (typeof raw.currency === "string") currency = raw.currency;
            break;
          }
        }
      }
    }

    const unlockedEvent = firstByType.get("paywall_unlocked");
    if (!unlockedAt && unlockedEvent) {
      unlockedAt = unlockedEvent.event_time;
      const m = unlockedEvent.metadata ?? {};
      if (typeof m.plan === "string") conversionPlan = m.plan;
      if (typeof m.price === "number") conversionValue = m.price;
      if (typeof m.currency === "string") currency = m.currency;
      if (typeof m.transaction_id === "string") conversionTxnId = m.transaction_id;
    }

    const shares: ShareEntry[] = [];
    const userEmail = sub.app_user?.email ?? null;
    if (userEmail) {
      const invRes = await supabaseFetch(
        `/rest/v1/invite_event?referrer_email=eq.${encodeURIComponent(userEmail)}&select=invite_method,recipient_email,created_at&order=created_at.asc`
      );
      if (invRes.ok) {
        const invites = (await invRes.json()) as Array<{
          invite_method: string;
          recipient_email: string | null;
          created_at: string;
        }>;
        for (const inv of invites) {
          shares.push({
            method: inv.invite_method === "email" ? "email" : "link",
            channel: inv.invite_method,
            recipient_email: inv.recipient_email,
            shared_at: inv.created_at,
            plan_at_share: null,
          });
        }
      }
    }

    const sharesRes = await supabaseFetch(
      `/rest/v1/report_share?select=recipient_email,plan_at_share,created_at,personal_report!inner(survey_submission_id)&personal_report.survey_submission_id=eq.${submissionId}&order=created_at.asc`
    );
    if (sharesRes.ok) {
      const rows = (await sharesRes.json()) as Array<{
        recipient_email: string | null;
        plan_at_share: string | null;
        created_at: string;
      }>;
      for (const r of rows) {
        shares.push({
          method: "share",
          channel: "report_share",
          recipient_email: r.recipient_email,
          shared_at: r.created_at,
          plan_at_share: r.plan_at_share,
        });
      }
    }

    const utmSource = parseUtmSource(sub.utm_tracker);

    const response: FunnelResponse = {
      submission_id: sub.id,
      user: {
        id: sub.app_user?.id ?? null,
        email_masked: userEmail ? maskEmail(userEmail) : null,
        first_name: sub.app_user?.first_name ?? null,
      },
      funnel: {
        started_at: sub.start_date_time,
        landing_page_view: true,
        start_survey_at: sub.start_date_time,
        ...progressTimestamps,
        survey_completed_at: sub.status === "completed" ? sub.created_date_time : null,
        report_viewed_at: firstByType.get("report_viewed")?.event_time ?? null,
        engagement_1min_at: firstByType.get("report_engagement_1min")?.event_time ?? null,
        engagement_5min_at: firstByType.get("report_engagement_5min")?.event_time ?? null,
        engagement_10min_at: firstByType.get("report_engagement_10min")?.event_time ?? null,
        paywall_view_at: firstByType.get("paywall_view")?.event_time ?? null,
        paywall_unlocked_at: unlockedAt,
      },
      pricing: {
        bucket,
        price_shown_full_report_eur:
          priceShownFullReportEur !== null && Number.isFinite(priceShownFullReportEur)
            ? priceShownFullReportEur
            : null,
        currency,
      },
      conversion: {
        plan: conversionPlan,
        value_eur:
          conversionValue !== null && Number.isFinite(conversionValue) ? conversionValue : null,
        currency,
        transaction_id: conversionTxnId,
      },
      shares,
      context: {
        session_id: sub.session_id,
        hotjar_user_id: sub.hotjar_user_id,
        utm_source: utmSource,
        utm_tracker: sub.utm_tracker,
      },
    };

    return NextResponse.json(response);
  } catch (err) {
    logger.error({ err }, "Funnel route error");
    return NextResponse.json({ error: "Unable to load funnel." }, { status: 500 });
  }
}
