import { NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/admin/auth";
import { hasRole } from "@/lib/admin/roles";
import { checkRateLimit, getClientIp } from "@/lib/ratelimit";
import { supabaseFetch } from "@/lib/admin/supabase";
import logger from "@/lib/logger";

interface TimelineEvent {
  type: string;
  timestamp: string;
  label: string;
  detail?: string;
}

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
    bucket: "admin-timeline",
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
    // 1. Get submission + user info
    const subRes = await supabaseFetch(
      `/rest/v1/survey_submission?id=eq.${submissionId}&select=id,user_id,session_id,start_date_time,created_date_time,status,app_user!fk_survey_submission_user(id,email,created_date_time)`
    );
    if (!subRes.ok) {
      return NextResponse.json({ error: "Unable to load submission." }, { status: 500 });
    }
    const subs = (await subRes.json()) as Array<{
      id: number;
      user_id: number;
      session_id: string | null;
      start_date_time: string | null;
      created_date_time: string;
      status: string;
      app_user: { id: number; email: string; created_date_time: string } | null;
    }>;
    if (subs.length === 0) {
      return NextResponse.json({ error: "Submission not found." }, { status: 404 });
    }
    const sub = subs[0];
    const events: TimelineEvent[] = [];

    // 2. Check waitlist signup
    if (sub.user_id) {
      const wlRes = await supabaseFetch(
        `/rest/v1/waitlist_mapping?user_id=eq.${sub.user_id}&select=waitlist_user!fk_waitlist_mapping_waitlist(created_date_time)`
      );
      if (wlRes.ok) {
        const wlData = (await wlRes.json()) as Array<{
          waitlist_user: { created_date_time: string } | null;
        }>;
        if (wlData.length > 0 && wlData[0].waitlist_user) {
          events.push({
            type: "waitlist_signup",
            timestamp: wlData[0].waitlist_user.created_date_time,
            label: "Joined waitlist",
          });
        }
      }
    }

    // 3. Account created
    if (sub.app_user) {
      events.push({
        type: "account_created",
        timestamp: sub.app_user.created_date_time,
        label: "Account created",
      });
    }

    // 4. Survey start
    if (sub.start_date_time) {
      events.push({
        type: "survey_start",
        timestamp: sub.start_date_time,
        label: "Survey started",
      });
    }

    // 5. Chapter events from behavior tracking
    if (sub.session_id) {
      const behRes = await supabaseFetch(
        `/rest/v1/survey_behavior_event?session_id=eq.${sub.session_id}&select=chapter,event_time,direction&order=event_time.asc`
      );
      if (behRes.ok) {
        const behData = (await behRes.json()) as Array<{
          chapter: string | null;
          event_time: string;
          direction: string;
        }>;

        // Group by chapter: first event per chapter = chapter start
        const chapterStarts = new Map<string, string>();
        for (const ev of behData) {
          if (ev.chapter && !chapterStarts.has(ev.chapter)) {
            chapterStarts.set(ev.chapter, ev.event_time);
          }
        }
        for (const [chapter, timestamp] of chapterStarts) {
          events.push({
            type: "chapter_start",
            timestamp,
            label: `Started chapter`,
            detail: chapter,
          });
        }
      }
    }

    // 6. Survey completed
    events.push({
      type: "survey_complete",
      timestamp: sub.created_date_time,
      label: "Survey completed",
      detail: sub.status,
    });

    // 7. Scoring
    const scoreRes = await supabaseFetch(
      `/rest/v1/scoring_result?survey_submission_id=eq.${submissionId}&select=scored_at,primary_archetype`
    );
    if (scoreRes.ok) {
      const scores = (await scoreRes.json()) as Array<{
        scored_at: string;
        primary_archetype: string;
      }>;
      if (scores.length > 0) {
        events.push({
          type: "scored",
          timestamp: scores[0].scored_at,
          label: "Archetype scored",
          detail: scores[0].primary_archetype,
        });
      }
    }

    // 8. Email: waitlist confirmation (sent immediately after waitlist insert)
    if (sub.user_id) {
      const wlRes = await supabaseFetch(
        `/rest/v1/waitlist_mapping?user_id=eq.${sub.user_id}&select=waitlist_user!fk_waitlist_mapping_waitlist(created_date_time,email)`
      );
      if (wlRes.ok) {
        const wlData = (await wlRes.json()) as Array<{
          waitlist_user: { created_date_time: string; email: string } | null;
        }>;
        if (wlData.length > 0 && wlData[0].waitlist_user) {
          events.push({
            type: "email_sent_waitlist_confirm",
            timestamp: wlData[0].waitlist_user.created_date_time,
            label: "Email: waitlist confirmation",
            detail: wlData[0].waitlist_user.email,
          });
        }
      }
    }

    // 9. Email: report link (sent on survey completion when token issued).
    // Use the earliest token row regardless of subsequent revocation — the
    // email did happen at issue time even if access was later revoked.
    if (sub.status === "completed") {
      const tokenRes = await supabaseFetch(
        `/rest/v1/report_access_token?survey_submission_id=eq.${submissionId}&select=created_at&order=created_at.asc&limit=1`
      );
      if (tokenRes.ok) {
        const tokens = (await tokenRes.json()) as Array<{ created_at: string }>;
        if (tokens.length > 0) {
          events.push({
            type: "email_sent_report_link",
            timestamp: tokens[0].created_at,
            label: "Email: report link",
            detail: sub.app_user?.email,
          });
        }
      }
    }

    // 10. Invite events — split email vs other channels
    if (sub.app_user?.email) {
      const invRes = await supabaseFetch(
        `/rest/v1/invite_event?referrer_email=eq.${encodeURIComponent(sub.app_user.email)}&select=invite_method,recipient_email,created_at&order=created_at.asc`
      );
      if (invRes.ok) {
        const invites = (await invRes.json()) as Array<{
          invite_method: string;
          recipient_email: string | null;
          created_at: string;
        }>;
        for (const inv of invites) {
          const isEmailChannel = inv.invite_method === "email";
          events.push({
            type: isEmailChannel ? "email_sent_invite" : "invite_sent",
            timestamp: inv.created_at,
            label: isEmailChannel ? "Email: invite sent" : "Invite shared",
            detail: inv.recipient_email
              ? `${inv.invite_method} → ${inv.recipient_email}`
              : inv.invite_method,
          });
        }
      }
    }

    // 11. Report shares (recipient + plan_at_share)
    const sharesRes = await supabaseFetch(
      `/rest/v1/report_share?select=recipient_email,plan_at_share,created_at,personal_report!inner(survey_submission_id)&personal_report.survey_submission_id=eq.${submissionId}&order=created_at.asc`
    );
    if (sharesRes.ok) {
      const shares = (await sharesRes.json()) as Array<{
        recipient_email: string | null;
        plan_at_share: string | null;
        created_at: string;
      }>;
      for (const share of shares) {
        events.push({
          type: "report_shared",
          timestamp: share.created_at,
          label: "Report shared",
          detail:
            [share.recipient_email, share.plan_at_share].filter(Boolean).join(" · ") || undefined,
        });
      }
    }

    // 12. Report-engagement events (persisted by /api/analytics-event)
    const analyticsRes = await supabaseFetch(
      `/rest/v1/analytics_event?survey_submission_id=eq.${submissionId}&event_type=in.(report_viewed,paywall_view,begin_checkout,paywall_unlocked,report_engagement_1min,report_engagement_5min,report_engagement_10min)&select=event_type,event_time,metadata,duration_ms&order=event_time.asc`
    );
    if (analyticsRes.ok) {
      const rows = (await analyticsRes.json()) as Array<{
        event_type: string;
        event_time: string;
        metadata: Record<string, unknown> | null;
        duration_ms: number | null;
      }>;
      for (const row of rows) {
        events.push({
          type: row.event_type,
          timestamp: row.event_time,
          label: ANALYTICS_LABELS[row.event_type] ?? row.event_type,
          detail: buildAnalyticsDetail(row.event_type, row.metadata, row.duration_ms),
        });
      }
    }

    // Sort by timestamp
    events.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    return NextResponse.json({ events });
  } catch (err) {
    logger.error({ err }, "Timeline error");
    return NextResponse.json({ error: "Unable to load timeline." }, { status: 500 });
  }
}

const ANALYTICS_LABELS: Record<string, string> = {
  report_viewed: "Report viewed",
  paywall_view: "Paywall opened",
  begin_checkout: "Began checkout",
  paywall_unlocked: "Paywall unlocked",
  report_engagement_1min: "1 min on report",
  report_engagement_5min: "5 min on report",
  report_engagement_10min: "10 min on report",
};

function buildAnalyticsDetail(
  eventType: string,
  metadata: Record<string, unknown> | null,
  durationMs: number | null
): string | undefined {
  if (!metadata && durationMs == null) return undefined;
  const m = metadata ?? {};
  switch (eventType) {
    case "report_viewed": {
      const archetype = typeof m.archetype === "string" ? m.archetype : null;
      const reportType = typeof m.report_type === "string" ? m.report_type : null;
      return [reportType, archetype].filter(Boolean).join(" · ") || undefined;
    }
    case "paywall_view": {
      const items = Array.isArray(m.items) ? m.items.length : null;
      return items ? `${items} plan${items === 1 ? "" : "s"}` : undefined;
    }
    case "begin_checkout":
    case "paywall_unlocked": {
      const plan = typeof m.plan === "string" ? m.plan : null;
      const price = typeof m.price === "number" ? m.price : null;
      const currency = typeof m.currency === "string" ? m.currency : "";
      if (plan && price != null) return `${plan} · ${price} ${currency}`.trim();
      return plan ?? undefined;
    }
    case "report_engagement_1min":
    case "report_engagement_5min":
    case "report_engagement_10min": {
      const scrollDepth =
        typeof m.scroll_depth_pct === "number" ? `${m.scroll_depth_pct}% scrolled` : null;
      return scrollDepth ?? undefined;
    }
  }
  return undefined;
}
