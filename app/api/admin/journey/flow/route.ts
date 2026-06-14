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
import {
  buildLinearBand,
  buildFriction,
  buildPricing,
  withSourceColumn,
  type Band,
  type BandStage,
} from "@features/admin/server/journeyFlow";
import { surveyQuestions } from "@/data/survey-data";
import { checkRateLimit, getClientIp } from "@shared/http/ratelimit";
import { supabaseFetch } from "@features/admin/server/supabase";
import logger from "@shared/observability/logger";

/**
 * GET /api/admin/journey/flow — the funnel "journey atlas".
 *
 * Returns FOUR conserved Sankey bands for one segment (selected by `days`,
 * `source`, `landingVariant`, `paywallArm`) plus an engagement-depth panel:
 *
 *   A `acquisition`  — visitor-keyed: sources → visitors → opened survey →
 *                      intro slides 1-4 → started answering. Counts are
 *                      distinct visitors/sessions (aggregate band, monotone-
 *                      clamped); only the `source` filter applies — visitors
 *                      are anonymous, so landing/arm can't slice this band.
 *   B `survey`       — session-keyed: started → chapter checkpoints (from
 *                      survey_partial_save.current_index vs each chapter's
 *                      first question index, survey order) → submitted.
 *   C `wizard`       — submission-keyed: submitted → saw wizard → advanced
 *                      through slides 2-6 (max metadata.to_slide, 0-indexed).
 *                      Wizard events are analytics-consent-gated (caveat).
 *   D `monetization` — submission-keyed, strictly nested (v1 spine):
 *                      submitted → viewed → paywall → checkout → purchased →
 *                      retained, with refund + drop sinks.
 *
 * The submission spine joins survey_submission_id → personal_report_id; each
 * D stage is a strict subset of the previous so every link conserves.
 */

const PAYWALL_EVENTS = "paywall_view,paywall_initiated,begin_checkout,price_shown";
const ENGAGEMENT_EVENTS = [
  "report_engagement_1min",
  "report_engagement_5min",
  "report_engagement_10min",
  "scroll_depth_25",
  "scroll_depth_50",
  "scroll_depth_75",
  "scroll_depth_100",
] as const;

const INTRO_EVENTS = [
  "unique_visitor",
  "survey_engine_mount",
  "intro_slide_1",
  "intro_slide_2",
  "intro_slide_3",
  "intro_slide_4",
] as const;
type IntroEvent = (typeof INTRO_EVENTS)[number];

/** Ordered survey chapters with each one's first question index (survey order). */
function getOrderedChapters(): Array<{ cId: number; label: string; firstIndex: number }> {
  const seen = new Map<number, { cId: number; label: string; firstIndex: number }>();
  surveyQuestions.forEach((q, index) => {
    if (!seen.has(q.cId)) {
      const firstWord = q.chapter.split(/\s+/).find((w) => w.length > 3) ?? q.chapter;
      seen.set(q.cId, { cId: q.cId, label: firstWord, firstIndex: index });
    }
  });
  return [...seen.values()];
}

type SubmissionRecord = {
  id: number;
  sessionId: string | null;
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
  maxWizardSlide: number; // -1 = no wizard event tracked
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
    const submissionFiltersActive = landingFilter !== "all" || armFilter !== "all";

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
      funnelRes,
      wizardRes,
      engagementRes,
      behaviorRes,
      priceShownRes,
    ] = await Promise.all([
      supabaseFetch(
        `/rest/v1/survey_submission?select=id,session_id,utm_tracker,created_date_time&created_date_time=gte.${since}&order=created_date_time.desc`,
        range
      ),
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
          "metadata",
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
      supabaseFetch(
        `/rest/v1/survey_partial_save?select=session_id,current_index,utm_tracker&saved_at=gte.${since}`,
        range
      ),
      supabaseFetch(
        `/rest/v1/funnel_event?select=visitor_id,event_type,utm_source&day=gte.${sinceDay}`,
        range
      ),
      supabaseFetch(
        `/rest/v1/analytics_event?select=survey_submission_id,metadata&event_type=eq.wizard_slide_advanced&event_time=gte.${since}`,
        range
      ),
      supabaseFetch(
        `/rest/v1/analytics_event?select=event_type,survey_submission_id&event_type=in.(${ENGAGEMENT_EVENTS.join(",")})&event_time=gte.${since}`,
        range
      ),
      supabaseFetch(
        `/rest/v1/survey_behavior_event?select=session_id,q_id,direction,time_spent_ms&event_time=gte.${since}`,
        range
      ),
      supabaseFetch(
        `/rest/v1/analytics_event?select=survey_submission_id,metadata&event_type=eq.price_shown&event_time=gte.${since}`,
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
      funnelRes,
      wizardRes,
      engagementRes,
      behaviorRes,
      priceShownRes,
    ];
    if (!allRes.every((res) => res.ok)) {
      logger.error("Journey-flow: one or more Supabase queries failed");
      return NextResponse.json({ error: "Unable to load journey data." }, { status: 500 });
    }

    const ROW_CAP = 50_000;

    const submissions = (await submissionsRes.json()) as Array<{
      id: number;
      session_id: string | null;
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
      metadata: { nurtureEmailsSent?: unknown } | null;
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
    const partials = (await partialsRes.json()) as Array<{
      session_id: string;
      current_index: number;
      utm_tracker: string | null;
    }>;
    const funnelEvents = (await funnelRes.json()) as Array<{
      visitor_id: string;
      event_type: string;
      utm_source: string | null;
    }>;
    const wizardEvents = (await wizardRes.json()) as Array<{
      survey_submission_id: number | null;
      metadata: { to_slide?: number | string } | null;
    }>;
    const engagementEvents = (await engagementRes.json()) as Array<{
      event_type: string;
      survey_submission_id: number | null;
    }>;
    const behaviorEvents = (await behaviorRes.json()) as Array<{
      session_id: string;
      q_id: string;
      direction: string;
      time_spent_ms: number | null;
    }>;
    const priceShownEvents = (await priceShownRes.json()) as Array<{
      survey_submission_id: number | null;
      metadata: { price?: number | string; discount_step?: number | string } | null;
    }>;

    // Any query that returned exactly the 50k cap was almost certainly
    // truncated (the behaviour-event query is the one that trips this on long
    // windows). We surface it rather than silently undercount.
    const wasTruncated = [
      submissions,
      paywall,
      partials,
      funnelEvents,
      wizardEvents,
      engagementEvents,
      behaviorEvents,
      priceShownEvents,
    ].some((arr) => arr.length >= ROW_CAP);

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
    const nurtureStagesBySubmission = new Map<number, Set<string>>();
    for (const q of quotes) {
      if (q.survey_submission_id == null) continue;
      if (q.forced_paywall_arm) armBySubmission.set(q.survey_submission_id, q.forced_paywall_arm);
      if (q.checkout_started_at) quoteCheckoutIds.add(q.survey_submission_id);
      if (q.purchased_at) quotePurchasedIds.add(q.survey_submission_id);
      const sent = q.metadata?.nurtureEmailsSent;
      if (Array.isArray(sent) && sent.length > 0) {
        const set =
          nurtureStagesBySubmission.get(q.survey_submission_id) ??
          nurtureStagesBySubmission
            .set(q.survey_submission_id, new Set())
            .get(q.survey_submission_id)!;
        for (const stage of sent) if (typeof stage === "string") set.add(stage);
      }
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

    // Per-submission max wizard slide reached (metadata.to_slide is 0-indexed;
    // advancing 0→1 … 4→5 means to_slide ∈ 0..5 across the 6 slides).
    const maxWizardBySubmission = new Map<number, number>();
    for (const e of wizardEvents) {
      if (e.survey_submission_id == null) continue;
      const raw = e.metadata?.to_slide;
      const slide = typeof raw === "string" ? parseInt(raw, 10) : (raw ?? NaN);
      if (!Number.isFinite(slide)) continue;
      const prev = maxWizardBySubmission.get(e.survey_submission_id) ?? -1;
      if (slide > prev) maxWizardBySubmission.set(e.survey_submission_id, slide);
    }

    // ---- One record per submission, with NESTED stage flags ------------
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
      // an actual report_session, a paywall PAGE event, or a purchase — NOT a
      // bare quote/arm row (server-written without a page view).
      const viewed =
        hasReport &&
        (viewedReportIds.has(reportId) || paywallSubmissionIds.has(s.id) || rawPurchased);
      const paywallSeen = viewed && rawPaywall;
      const checkout = paywallSeen && rawCheckout;
      const purchased = checkout && rawPurchased;
      const refunded = purchased && reportId != null && refundedReportIds.has(reportId);
      return {
        id: s.id,
        sessionId: s.session_id,
        source: classifyChannel(s.utm_tracker),
        landingVariant: utm.landing_variant ?? null,
        arm: armBySubmission.get(s.id) ?? null,
        scored: scoredSet.has(s.id),
        hasReport,
        viewed,
        paywall: paywallSeen,
        checkout,
        purchased,
        refunded,
        shared: reportId != null && sharedReportIds.has(reportId),
        bookedCall: bookedSubmissionIds.has(s.id),
        revenue: !refunded && reportId != null ? (revenueByReport.get(reportId) ?? 0) : 0,
        maxWizardSlide: maxWizardBySubmission.get(s.id) ?? -1,
      };
    });

    // ---- Segment filters -------------------------------------------------
    const filtered = records.filter((r) => {
      if (sourceFilter !== "all" && r.source !== sourceFilter) return false;
      if (landingFilter !== "all" && r.landingVariant !== landingFilter) return false;
      if (armFilter !== "all" && r.arm !== armFilter) return false;
      return true;
    });
    const filteredIds = new Set(filtered.map((r) => r.id));
    const filteredSessionIds = new Set(
      filtered.map((r) => r.sessionId).filter((id): id is string => id != null)
    );

    // =====================================================================
    // Band A — Acquisition & intro (visitor-keyed funnel_event aggregates)
    // =====================================================================
    const sourceOfUtm = (utmSource: string | null): ChannelBucket =>
      classifyChannel(utmSource ? JSON.stringify({ utm_source: utmSource }) : null);

    const visitorsByStage = new Map<IntroEvent, Set<string>>();
    for (const ev of INTRO_EVENTS) visitorsByStage.set(ev, new Set());
    const visitorSources = new Map<ChannelBucket, number>();
    for (const row of funnelEvents) {
      if (!(INTRO_EVENTS as readonly string[]).includes(row.event_type)) continue;
      const bucket = sourceOfUtm(row.utm_source);
      if (sourceFilter !== "all" && bucket !== sourceFilter) continue;
      const stageSet = visitorsByStage.get(row.event_type as IntroEvent)!;
      if (row.event_type === "unique_visitor" && !stageSet.has(row.visitor_id)) {
        visitorSources.set(bucket, (visitorSources.get(bucket) ?? 0) + 1);
      }
      stageSet.add(row.visitor_id);
    }

    const stageCount = (ev: IntroEvent) => visitorsByStage.get(ev)!.size;
    const acquisitionStages: BandStage[] = [
      { id: "visitors", label: "Visitors", count: stageCount("unique_visitor") },
      {
        id: "mount",
        label: "Opened survey",
        count: stageCount("survey_engine_mount"),
        dropLabel: "Bounced on landing",
      },
      {
        id: "intro1",
        label: "Intro slide 1",
        count: stageCount("intro_slide_1"),
        dropLabel: "Left before intro",
      },
      {
        id: "intro2",
        label: "Intro slide 2",
        count: stageCount("intro_slide_2"),
        dropLabel: "Left at intro 1",
      },
      {
        id: "intro3",
        label: "Intro slide 3",
        count: stageCount("intro_slide_3"),
        dropLabel: "Left at intro 2",
      },
      {
        id: "intro4",
        label: "Intro slide 4",
        count: stageCount("intro_slide_4"),
        dropLabel: "Left at intro 3",
      },
      // NOTE: deliberately ends at intro 4. "Started answering" is session-keyed
      // (survey_partial_save persists server-side) while this band is visitor-
      // keyed (funnel_event needs client JS + consent and undercounts), so the
      // two can differ by >2x — Band B carries the honest session-keyed start.
    ];
    const acquisitionBuilt = buildLinearBand(acquisitionStages);
    const acquisitionSources = CHANNEL_BUCKETS.filter((b) => (visitorSources.get(b) ?? 0) > 0).map(
      (b) => ({ bucket: b, count: visitorSources.get(b) ?? 0 })
    );
    const acquisition: Band = withSourceColumn(acquisitionBuilt, acquisitionSources, "visitors");

    // =====================================================================
    // Band B — Survey progress by chapter (session-keyed)
    // =====================================================================
    // Sessions that submitted count as having reached every chapter (their
    // partial checkpoint may be stale). Landing/arm filters only exist on
    // submissions, so when active the band restricts to submitted journeys.
    const chapters = getOrderedChapters();
    const maxIndexBySession = new Map<string, number>();
    for (const p of partials) {
      if (sourceFilter !== "all" && classifyChannel(p.utm_tracker) !== sourceFilter) continue;
      const prev = maxIndexBySession.get(p.session_id) ?? -1;
      if (p.current_index > prev) maxIndexBySession.set(p.session_id, p.current_index);
    }
    // `filtered` already carries the source filter; when landing/arm are
    // inactive it equals the source-filtered records, so it serves both cases.
    const submittedSessionKeys = new Set<string>();
    for (const r of filtered) {
      submittedSessionKeys.add(r.sessionId ?? `sub:${r.id}`);
    }
    if (submissionFiltersActive) {
      // Non-submitted sessions can't be sliced by landing/arm — exclude them.
      for (const key of [...maxIndexBySession.keys()]) {
        if (!filteredSessionIds.has(key)) maxIndexBySession.delete(key);
      }
    }
    const surveyStartedKeys = new Set([...maxIndexBySession.keys(), ...submittedSessionKeys]);
    const reachedChapter = (firstIndex: number) => {
      let count = submittedSessionKeys.size;
      for (const [key, maxIndex] of maxIndexBySession) {
        if (submittedSessionKeys.has(key)) continue; // already counted
        if (maxIndex >= firstIndex) count += 1;
      }
      return count;
    };
    const reachedByCId = new Map<number, number>();
    for (const ch of chapters) reachedByCId.set(ch.cId, reachedChapter(ch.firstIndex));
    const surveyStages: BandStage[] = [
      { id: "sv:start", label: "Started survey", count: surveyStartedKeys.size },
      ...chapters.map((ch, i) => ({
        id: `sv:ch${ch.cId}`,
        label: `Ch ${i + 1} · ${ch.label}`,
        count: reachedByCId.get(ch.cId) ?? 0,
        dropLabel: i === 0 ? "Left before Ch 1" : `Left in Ch ${i}`,
      })),
      {
        id: "sv:submitted",
        label: "Submitted",
        count: submittedSessionKeys.size,
        dropLabel: `Left in Ch ${chapters.length}`,
      },
    ];
    const surveyBuilt = buildLinearBand(surveyStages);

    // =====================================================================
    // Band C — Pre-report wizard (submission-keyed, consent-gated events)
    // =====================================================================
    const wizardReached = (minToSlide: number) =>
      filtered.filter((r) => r.maxWizardSlide >= minToSlide).length;
    const wizardStages: BandStage[] = [
      { id: "wz:submitted", label: "Submitted", count: filtered.length },
      {
        id: "wz:s1",
        label: "Saw wizard",
        count: wizardReached(0),
        dropLabel: "No wizard tracked",
      },
      { id: "wz:s2", label: "Slide 2", count: wizardReached(1), dropLabel: "Left at slide 1" },
      { id: "wz:s3", label: "Slide 3", count: wizardReached(2), dropLabel: "Left at slide 2" },
      { id: "wz:s4", label: "Slide 4", count: wizardReached(3), dropLabel: "Left at slide 3" },
      { id: "wz:s5", label: "Slide 5", count: wizardReached(4), dropLabel: "Left at slide 4" },
      {
        id: "wz:s6",
        label: "Finished wizard",
        count: wizardReached(5),
        dropLabel: "Left at slide 5",
      },
    ];
    const wizardBuilt = buildLinearBand(wizardStages);

    // =====================================================================
    // Band D — Report & monetization (strictly nested spine, as v1)
    // =====================================================================
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

    const monetizationStages: BandStage[] = [
      { id: "mz:submitted", label: "Submitted", count: c.submitted },
      {
        id: "mz:viewed",
        label: "Viewed report",
        count: c.viewed,
        dropLabel: "Never opened report",
      },
      { id: "mz:paywall", label: "Saw paywall", count: c.paywall, dropLabel: "No paywall reached" },
      {
        id: "mz:checkout",
        label: "Started checkout",
        count: c.checkout,
        dropLabel: "Left at paywall",
      },
      {
        id: "mz:purchased",
        label: "Purchased",
        count: c.purchased,
        dropLabel: "Abandoned checkout",
      },
    ];
    const monetizationBuilt = buildLinearBand(monetizationStages);
    // Terminal split: retained vs refunded.
    if (c.purchased > 0) {
      const retained = c.purchased - c.refunded;
      if (retained > 0) {
        monetizationBuilt.nodes.push({
          id: "mz:retained",
          label: "Retained",
          count: retained,
          kind: "outcome",
        });
        monetizationBuilt.links.push({
          source: "mz:purchased",
          target: "mz:retained",
          value: retained,
          kind: "outcome",
        });
      }
      if (c.refunded > 0) {
        monetizationBuilt.nodes.push({
          id: "mz:refunded",
          label: "Refunded",
          count: c.refunded,
          kind: "drop",
        });
        monetizationBuilt.links.push({
          source: "mz:purchased",
          target: "mz:refunded",
          value: c.refunded,
          kind: "drop",
        });
      }
    }

    // ---- Engagement depth panel (distinct submissions, of the segment) --
    const engagementBySubmission = new Map<string, Set<number>>();
    for (const ev of ENGAGEMENT_EVENTS) engagementBySubmission.set(ev, new Set());
    for (const e of engagementEvents) {
      if (e.survey_submission_id == null || !filteredIds.has(e.survey_submission_id)) continue;
      engagementBySubmission.get(e.event_type)?.add(e.survey_submission_id);
    }
    const engagementCount = (ev: (typeof ENGAGEMENT_EVENTS)[number]) =>
      engagementBySubmission.get(ev)?.size ?? 0;

    // =====================================================================
    // Band E — Email recovery ladder (nurtured submissions in the segment)
    // =====================================================================
    // Stages are sequential nurture sends (a later email only goes out if the
    // user still hadn't unlocked), so per-submission membership is naturally
    // nested ⇒ aggregate counts are monotone. The drop at each step is "unlocked
    // after Nh" — i.e. re-engagement working.
    const hasStage = (id: number, ...stages: string[]) => {
      const set = nurtureStagesBySubmission.get(id);
      return !!set && stages.some((s) => set.has(s));
    };
    const recoveryStages: BandStage[] = [
      {
        id: "rc:n6",
        label: "Nurtured (6h email)",
        count: filtered.filter((r) => hasStage(r.id, "6h_no_view", "6h_no_unlock")).length,
      },
      {
        id: "rc:n30",
        label: "Still locked → 30h",
        count: filtered.filter((r) => hasStage(r.id, "30h_no_unlock")).length,
        dropLabel: "Unlocked after 6h",
      },
      {
        id: "rc:n54",
        label: "Still locked → 54h",
        count: filtered.filter((r) => hasStage(r.id, "54h_no_unlock")).length,
        dropLabel: "Unlocked after 30h",
      },
      {
        id: "rc:n78",
        label: "Call invite (78h)",
        count: filtered.filter((r) => hasStage(r.id, "78h_no_unlock")).length,
        dropLabel: "Unlocked after 54h",
      },
    ];
    const recoveryBuilt = buildLinearBand(recoveryStages);
    // "Recovered" = ANY nurture email was sent (not just the 6h one — a 6h send
    // can be skipped) AND the user eventually purchased.
    const recoveredAmongNurtured = filtered.filter(
      (r) =>
        hasStage(
          r.id,
          "6h_no_view",
          "6h_no_unlock",
          "30h_no_unlock",
          "54h_no_unlock",
          "78h_no_unlock"
        ) && r.purchased
    ).length;

    // ---- Survey friction (per-chapter) for the segment's sessions ------
    // Resolve each behaviour event's chapter via the real q_id→cId map (the
    // lead questions "00000"/"00001" belong to a chapter whose code isn't their
    // 2-char prefix, so a prefix shortcut would silently drop them).
    const qIdToCId = new Map<string, number>(surveyQuestions.map((q) => [q.qId, q.cId]));
    const segmentSessionIds = new Set<string>([...maxIndexBySession.keys(), ...filteredSessionIds]);
    const friction = buildFriction(
      behaviorEvents.filter((e) => segmentSessionIds.has(e.session_id)),
      chapters.map((ch, i) => ({ cId: ch.cId, label: `Ch ${i + 1} · ${ch.label}` })),
      reachedByCId,
      qIdToCId
    );

    // ---- Pricing exposure ----------------------------------------------
    // "Converted" = actually purchased (the panel labels it "buy").
    const convertedSubmissionIds = new Set<number>();
    for (const r of filtered) if (r.purchased) convertedSubmissionIds.add(r.id);
    const pricing = buildPricing(
      priceShownEvents
        .filter((e) => e.survey_submission_id != null && filteredIds.has(e.survey_submission_id))
        .map((e) => ({
          survey_submission_id: e.survey_submission_id,
          price:
            typeof e.metadata?.price === "string"
              ? parseFloat(e.metadata.price)
              : (e.metadata?.price ?? null),
          discountStep:
            typeof e.metadata?.discount_step === "string"
              ? parseInt(e.metadata.discount_step, 10)
              : (e.metadata?.discount_step ?? null),
        })),
      convertedSubmissionIds
    );

    const visitorCount = stageCount("unique_visitor");
    const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : 0);

    return NextResponse.json({
      days,
      filters: { source: sourceFilter, landingVariant: landingFilter, paywallArm: armFilter },
      bands: {
        acquisition: { nodes: acquisition.nodes, links: acquisition.links },
        survey: { nodes: surveyBuilt.nodes, links: surveyBuilt.links },
        wizard: { nodes: wizardBuilt.nodes, links: wizardBuilt.links },
        monetization: { nodes: monetizationBuilt.nodes, links: monetizationBuilt.links },
        recovery: { nodes: recoveryBuilt.nodes, links: recoveryBuilt.links },
      },
      friction,
      pricing,
      recoveredAmongNurtured,
      engagement: {
        viewed: c.viewed,
        active1min: engagementCount("report_engagement_1min"),
        active5min: engagementCount("report_engagement_5min"),
        active10min: engagementCount("report_engagement_10min"),
        scroll25: engagementCount("scroll_depth_25"),
        scroll50: engagementCount("scroll_depth_50"),
        scroll75: engagementCount("scroll_depth_75"),
        scroll100: engagementCount("scroll_depth_100"),
      },
      summary: {
        visitors: visitorCount,
        surveyStarted: surveyStartedKeys.size,
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
        introCompletionRate: pct(stageCount("intro_slide_4"), stageCount("survey_engine_mount")),
        wizardCompletionRate: pct(wizardReached(5), wizardReached(0)),
      },
      sources: CHANNEL_BUCKETS.filter((b) => (perSource.get(b) ?? 0) > 0).map((b) => ({
        bucket: b,
        count: perSource.get(b) ?? 0,
      })),
      caveats: {
        acquisitionSeam:
          "Acquisition counts are visitor-level (anonymous) — only the source filter applies to that band" +
          (submissionFiltersActive
            ? "; the landing/arm filters do NOT slice it, so it shows all visitors"
            : "") +
          (acquisitionBuilt.wasClamped || surveyBuilt.wasClamped
            ? ". Some adjacent stages were clamped to keep flows conserved (different tracking keys can be locally noisy)."
            : "."),
        wizardConsent:
          "Wizard + engagement events require analytics consent, so those bands cover the consenting subset of submissions.",
        armScope:
          "The paywall-arm filter only covers journeys that reached the report stage; the landing-variant filter needs the white-landing A/B live in production.",
        recovery:
          "Recovery ladder = nurture emails actually sent. They're normally sequential (each step a subset of the prior); if an earlier send was skipped a step is clamped to keep flows conserved" +
          (recoveryBuilt.wasClamped ? " (clamping applied here)" : "") +
          ". Per-email purchase attribution isn't stamped on payments yet, so 'recovered' counts nurtured users who eventually purchased — not necessarily because of a specific email.",
        ...(wasTruncated
          ? {
              truncation:
                "Some underlying tables hit the 50,000-row query cap for this window (likely survey behaviour events) — friction/time figures may be undercounted. Use a shorter range for exact numbers.",
            }
          : {}),
      },
    });
  } catch (err) {
    logger.error({ err }, "Journey-flow analytics error");
    return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
  }
}
