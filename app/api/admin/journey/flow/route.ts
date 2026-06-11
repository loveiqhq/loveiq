import { NextResponse } from "next/server";
import { verifyAdminSession } from "@features/admin/server/auth";
import { hasRole } from "@features/admin/server/roles";
import {
  CHANNEL_BUCKETS,
  classifyChannel,
  clampDays,
  makeSince,
  parseUtmTracker,
  type ChannelBucket,
} from "@features/admin/server/next-level";
import { checkRateLimit, getClientIp } from "@shared/http/ratelimit";
import { supabaseFetch } from "@features/admin/server/supabase";
import logger from "@shared/observability/logger";

/**
 * GET /api/admin/journey/flow — the comprehensive funnel Sankey.
 *
 * Returns a strictly-NESTED (conserved) funnel for ONE segment, selected by
 * query params: `days`, `source` (a CHANNEL_BUCKETS value | "all"),
 * `landingVariant` ("control"|"white"|"all"), `paywallArm`
 * ("control"|"treatment"|"all").
 *
 * The spine is per-submission-linked (survey_submission_id → personal_report_id),
 * so it is rigorous. Each stage is computed as a SUBSET of the previous
 * (viewed ⊇ paywall ⊇ checkout ⊇ purchased), which guarantees every Sankey link
 * conserves flow and the drop-off "sink" nodes always sum correctly. Source
 * buckets come from each submission's utm_tracker.
 *
 * Top-of-funnel context (anonymous visitors, partial-save survey starts) is
 * returned as summary stats, NOT spine nodes — visitors aren't per-journey
 * linked (an attribution seam) and survey rows only exist on completion.
 */

const PAYWALL_EVENTS = "paywall_view,paywall_initiated,begin_checkout,price_shown";

type SubmissionRecord = {
  source: ChannelBucket;
  landingVariant: string | null;
  arm: string | null;
  scored: boolean;
  hasReport: boolean;
  viewed: boolean;
  paywall: boolean;
  checkout: boolean;
  purchased: boolean;
  refunded: boolean;
  shared: boolean;
  bookedCall: boolean;
  revenue: number;
};

export async function GET(request: Request) {
  const admin = await verifyAdminSession();
  if (!admin) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (!hasRole(admin.role, "viewer")) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const ip = getClientIp(request);
  const rateLimit = await checkRateLimit(ip, {
    bucket: "admin-journey-flow",
    limit: 30,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Please try again later." }, { status: 429 });
  }

  try {
    const url = new URL(request.url);
    const days = clampDays(parseInt(url.searchParams.get("days") || "30", 10), 7, 365);
    const since = makeSince(days)!;
    const sinceDay = since.slice(0, 10);

    const sourceParam = url.searchParams.get("source") || "all";
    const sourceFilter: ChannelBucket | "all" = (CHANNEL_BUCKETS as readonly string[]).includes(
      sourceParam
    )
      ? (sourceParam as ChannelBucket)
      : "all";
    const landingFilter = url.searchParams.get("landingVariant") || "all"; // all|control|white
    const armFilter = url.searchParams.get("paywallArm") || "all"; // all|control|treatment

    const range = { headers: { Range: "0-49999" } };
    const [
      submissionsRes,
      scoringRes,
      reportsRes,
      sessionsRes,
      paywallRes,
      quotesRes,
      paymentsRes,
      sharesRes,
      bookingsRes,
      partialsRes,
      visitorsRes,
    ] = await Promise.all([
      supabaseFetch(
        `/rest/v1/survey_submission?select=id,utm_tracker,created_date_time&created_date_time=gte.${since}&order=created_date_time.desc`,
        range
      ),
      // Outcome tables are date-scoped to `since` too: every outcome (score,
      // report, view, paywall, quote, payment, share, call) happens at/after its
      // submission, which is already >= since — so this drops only irrelevant old
      // rows and keeps the 50k row cap from biting as the tables grow.
      supabaseFetch(
        `/rest/v1/scoring_result?select=survey_submission_id&scored_at=gte.${since}`,
        range
      ),
      supabaseFetch(
        `/rest/v1/personal_report?select=id,survey_submission_id&created_date_time=gte.${since}`,
        range
      ),
      supabaseFetch(
        `/rest/v1/report_session?select=personal_report_id&started_at=gte.${since}`,
        range
      ),
      supabaseFetch(
        `/rest/v1/analytics_event?select=event_type,survey_submission_id&event_type=in.(${PAYWALL_EVENTS})&event_time=gte.${since}`,
        range
      ),
      supabaseFetch(
        `/rest/v1/report_price_quote?select=${[
          "survey_submission_id",
          "forced_paywall_arm",
          "checkout_started_at",
          "purchased_at",
        ].join(",")}&created_date_time=gte.${since}`,
        range
      ),
      supabaseFetch(
        `/rest/v1/payment?select=personal_report_id,status,amount&created_date_time=gte.${since}`,
        range
      ),
      supabaseFetch(
        `/rest/v1/report_share?select=personal_report_id&created_at=gte.${since}`,
        range
      ),
      supabaseFetch(
        `/rest/v1/booking_event?select=survey_submission_id,event_type&created_at=gte.${since}`,
        range
      ),
      supabaseFetch(`/rest/v1/survey_partial_save?select=session_id&saved_at=gte.${since}`, range),
      supabaseFetch(
        `/rest/v1/funnel_event?select=visitor_id&event_type=eq.unique_visitor&day=gte.${sinceDay}`,
        range
      ),
    ]);

    const allRes = [
      submissionsRes,
      scoringRes,
      reportsRes,
      sessionsRes,
      paywallRes,
      quotesRes,
      paymentsRes,
      sharesRes,
      bookingsRes,
      partialsRes,
      visitorsRes,
    ];
    if (!allRes.every((res) => res.ok)) {
      logger.error("Journey-flow: one or more Supabase queries failed");
      return NextResponse.json({ error: "Unable to load journey data." }, { status: 500 });
    }

    const submissions = (await submissionsRes.json()) as Array<{
      id: number;
      utm_tracker: string | null;
    }>;
    const scoring = (await scoringRes.json()) as Array<{ survey_submission_id: number }>;
    const reports = (await reportsRes.json()) as Array<{
      id: number;
      survey_submission_id: number;
    }>;
    const sessions = (await sessionsRes.json()) as Array<{ personal_report_id: number }>;
    const paywall = (await paywallRes.json()) as Array<{
      event_type: string;
      survey_submission_id: number | null;
    }>;
    const quotes = (await quotesRes.json()) as Array<{
      survey_submission_id: number | null;
      forced_paywall_arm: string | null;
      checkout_started_at: string | null;
      purchased_at: string | null;
    }>;
    const payments = (await paymentsRes.json()) as Array<{
      personal_report_id: number | null;
      status: string;
      amount: number | string | null;
    }>;
    const shares = (await sharesRes.json()) as Array<{ personal_report_id: number }>;
    const bookings = (await bookingsRes.json()) as Array<{
      survey_submission_id: number | null;
      event_type: string;
    }>;
    const partials = (await partialsRes.json()) as Array<{ session_id: string }>;
    const visitors = (await visitorsRes.json()) as Array<{ visitor_id: string }>;

    // ---- Lookup sets/maps keyed by the journey keys --------------------
    const scoredSet = new Set(scoring.map((r) => r.survey_submission_id));
    const reportIdBySubmission = new Map<number, number>();
    for (const r of reports) reportIdBySubmission.set(r.survey_submission_id, r.id);
    const viewedReportIds = new Set(sessions.map((r) => r.personal_report_id));
    const sharedReportIds = new Set(shares.map((r) => r.personal_report_id));
    const paywallSubmissionIds = new Set(
      paywall.map((r) => r.survey_submission_id).filter((id): id is number => id != null)
    );
    const beginCheckoutIds = new Set(
      paywall
        .filter((r) => r.event_type === "begin_checkout")
        .map((r) => r.survey_submission_id)
        .filter((id): id is number => id != null)
    );
    const bookedSubmissionIds = new Set(
      bookings
        .filter((r) => r.event_type === "call_booked")
        .map((r) => r.survey_submission_id)
        .filter((id): id is number => id != null)
    );

    const armBySubmission = new Map<number, string>();
    const quoteCheckoutIds = new Set<number>();
    const quotePurchasedIds = new Set<number>();
    for (const q of quotes) {
      if (q.survey_submission_id == null) continue;
      if (q.forced_paywall_arm) armBySubmission.set(q.survey_submission_id, q.forced_paywall_arm);
      if (q.checkout_started_at) quoteCheckoutIds.add(q.survey_submission_id);
      if (q.purchased_at) quotePurchasedIds.add(q.survey_submission_id);
    }

    const paidReportIds = new Set<number>();
    const refundedReportIds = new Set<number>();
    const revenueByReport = new Map<number, number>();
    for (const p of payments) {
      if (p.personal_report_id == null) continue;
      if (p.status === "succeeded") {
        paidReportIds.add(p.personal_report_id);
        const amt = typeof p.amount === "string" ? parseFloat(p.amount) : (p.amount ?? 0);
        if (typeof amt === "number" && Number.isFinite(amt)) {
          revenueByReport.set(
            p.personal_report_id,
            (revenueByReport.get(p.personal_report_id) ?? 0) + amt
          );
        }
      } else if (p.status === "refunded") {
        refundedReportIds.add(p.personal_report_id);
      }
    }

    // ---- Assemble one record per submission, with NESTED stage flags ---
    const records: SubmissionRecord[] = submissions.map((s) => {
      const reportId = reportIdBySubmission.get(s.id) ?? null;
      const utm = parseUtmTracker(s.utm_tracker);
      const everPaid =
        reportId != null && (paidReportIds.has(reportId) || refundedReportIds.has(reportId));
      const rawPurchased = everPaid || quotePurchasedIds.has(s.id);
      const rawCheckout = quoteCheckoutIds.has(s.id) || beginCheckoutIds.has(s.id) || rawPurchased;
      const rawPaywall = paywallSubmissionIds.has(s.id) || rawCheckout || armBySubmission.has(s.id);
      const hasReport = reportId != null;
      // Each stage strictly implies the previous → conserved Sankey. "viewed" is
      // an actual report_session, a paywall PAGE event, or a purchase — NOT a bare
      // quote/arm row (which can be written server-side without a page view), so
      // the viewed stage isn't inflated.
      const viewed =
        hasReport &&
        (viewedReportIds.has(reportId) || paywallSubmissionIds.has(s.id) || rawPurchased);
      const paywall = viewed && rawPaywall;
      const checkout = paywall && rawCheckout;
      const purchased = checkout && rawPurchased;
      const refunded = purchased && reportId != null && refundedReportIds.has(reportId);
      return {
        source: classifyChannel(s.utm_tracker),
        landingVariant: utm.landing_variant ?? null,
        arm: armBySubmission.get(s.id) ?? null,
        scored: scoredSet.has(s.id),
        hasReport,
        viewed,
        paywall,
        checkout,
        purchased,
        refunded,
        shared: reportId != null && sharedReportIds.has(reportId),
        bookedCall: bookedSubmissionIds.has(s.id),
        revenue: !refunded && reportId != null ? (revenueByReport.get(reportId) ?? 0) : 0,
      };
    });

    // ---- Apply the segment filters -------------------------------------
    // A paywall-arm filter implies "only journeys that reached the report stage"
    // (where the arm is assigned), so journeys with no arm are excluded then.
    const filtered = records.filter((r) => {
      if (sourceFilter !== "all" && r.source !== sourceFilter) return false;
      if (landingFilter !== "all" && r.landingVariant !== landingFilter) return false;
      if (armFilter !== "all" && r.arm !== armFilter) return false;
      return true;
    });

    // ---- Aggregate counts ----------------------------------------------
    const c = {
      submitted: filtered.length,
      scored: 0,
      report: 0,
      viewed: 0,
      paywall: 0,
      checkout: 0,
      purchased: 0,
      refunded: 0,
      shared: 0,
      booked: 0,
      revenue: 0,
    };
    const perSource = new Map<ChannelBucket, number>();
    for (const r of filtered) {
      perSource.set(r.source, (perSource.get(r.source) ?? 0) + 1);
      if (r.scored) c.scored += 1;
      if (r.hasReport) c.report += 1;
      if (r.viewed) c.viewed += 1;
      if (r.paywall) c.paywall += 1;
      if (r.checkout) c.checkout += 1;
      if (r.purchased) c.purchased += 1;
      if (r.refunded) c.refunded += 1;
      if (r.shared) c.shared += 1;
      if (r.bookedCall) c.booked += 1;
      c.revenue += r.revenue;
    }

    // ---- Build the conserved Sankey nodes + links ----------------------
    const nodes: Array<{ id: string; label: string; count: number; kind: string }> = [];
    const links: Array<{ source: string; target: string; value: number; kind: string }> = [];
    const addNode = (id: string, label: string, count: number, kind = "stage") => {
      if (count > 0) nodes.push({ id, label, count, kind });
    };
    const addLink = (source: string, target: string, value: number, kind = "flow") => {
      if (value > 0) links.push({ source, target, value, kind });
    };

    const orderedSources = CHANNEL_BUCKETS.filter((b) => (perSource.get(b) ?? 0) > 0);
    for (const bucket of orderedSources) {
      const count = perSource.get(bucket) ?? 0;
      addNode(`src:${bucket}`, bucket, count, "source");
      addLink(`src:${bucket}`, "submitted", count, "source");
    }

    addNode("submitted", "Completed survey", c.submitted);
    addNode("viewed", "Viewed report", c.viewed);
    addNode("paywall", "Saw paywall", c.paywall);
    addNode("checkout", "Started checkout", c.checkout);
    addNode("purchased", "Purchased", c.purchased);
    addNode("retained", "Retained", c.purchased - c.refunded, "outcome");

    addNode("drop_view", "Never opened report", c.submitted - c.viewed, "drop");
    addNode("drop_paywall", "No paywall reached", c.viewed - c.paywall, "drop");
    addNode("drop_checkout", "Left at paywall", c.paywall - c.checkout, "drop");
    addNode("drop_purchase", "Abandoned checkout", c.checkout - c.purchased, "drop");
    addNode("refunded", "Refunded", c.refunded, "drop");

    addLink("submitted", "viewed", c.viewed);
    addLink("submitted", "drop_view", c.submitted - c.viewed, "drop");
    addLink("viewed", "paywall", c.paywall);
    addLink("viewed", "drop_paywall", c.viewed - c.paywall, "drop");
    addLink("paywall", "checkout", c.checkout);
    addLink("paywall", "drop_checkout", c.paywall - c.checkout, "drop");
    addLink("checkout", "purchased", c.purchased);
    addLink("checkout", "drop_purchase", c.checkout - c.purchased, "drop");
    addLink("purchased", "retained", c.purchased - c.refunded, "outcome");
    addLink("purchased", "refunded", c.refunded, "drop");

    const visitorCount = new Set(visitors.map((v) => v.visitor_id)).size;
    const startedCount = new Set(partials.map((p) => p.session_id)).size;
    const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : 0);

    return NextResponse.json({
      days,
      filters: { source: sourceFilter, landingVariant: landingFilter, paywallArm: armFilter },
      nodes,
      links,
      summary: {
        visitors: visitorCount,
        surveyStarted: startedCount,
        submitted: c.submitted,
        scored: c.scored,
        viewed: c.viewed,
        paywall: c.paywall,
        checkout: c.checkout,
        purchased: c.purchased,
        refunded: c.refunded,
        revenue: Math.round(c.revenue * 100) / 100,
        shared: c.shared,
        bookedCalls: c.booked,
        viewRate: pct(c.viewed, c.submitted),
        purchaseRate: pct(c.purchased, c.submitted),
        viewToPurchaseRate: pct(c.purchased, c.viewed),
      },
      sources: orderedSources.map((b) => ({ bucket: b, count: perSource.get(b) ?? 0 })),
      caveats: {
        visitorsSeam:
          "Visitors and survey-starts are funnel-wide top-of-funnel context (anonymous / partial-save sessions), not per-journey linked to the source-split spine below.",
        armScope:
          "The paywall-arm filter only covers journeys that reached the report stage (where the arm is assigned). The landing-variant filter needs the white-landing A/B live in production to have data.",
      },
    });
  } catch (err) {
    logger.error({ err }, "Journey-flow analytics error");
    return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
  }
}
