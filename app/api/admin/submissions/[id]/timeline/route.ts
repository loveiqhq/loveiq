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

    // 8. Invite events
    if (sub.app_user?.email) {
      const invRes = await supabaseFetch(
        `/rest/v1/invite_event?referrer_email=eq.${encodeURIComponent(sub.app_user.email)}&select=invite_method,created_at&order=created_at.asc`
      );
      if (invRes.ok) {
        const invites = (await invRes.json()) as Array<{
          invite_method: string;
          created_at: string;
        }>;
        for (const inv of invites) {
          events.push({
            type: "invite_sent",
            timestamp: inv.created_at,
            label: "Invite shared",
            detail: inv.invite_method,
          });
        }
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
