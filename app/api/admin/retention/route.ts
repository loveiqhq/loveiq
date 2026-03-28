import { NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/admin/auth";
import { hasRole } from "@/lib/admin/roles";
import { checkRateLimit, getClientIp } from "@/lib/ratelimit";
import { supabaseFetch } from "@/lib/admin/supabase";
import logger from "@/lib/logger";

export async function GET(request: Request) {
  const admin = await verifyAdminSession();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!hasRole(admin.role, "viewer")) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const ip = getClientIp(request);
  const rateLimit = await checkRateLimit(ip, {
    bucket: "admin-retention",
    limit: 30,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Please try again later." }, { status: 429 });
  }

  const url = new URL(request.url);
  const days = parseInt(url.searchParams.get("days") || "0", 10);
  const since = days > 0 ? new Date(Date.now() - days * 86_400_000).toISOString() : null;

  try {
    const completedFilter = since ? `&created_date_time=gte.${since}` : "";

    const [submissionsRes, reportsRes, sessionsRes, accessRes, inviteRes] = await Promise.all([
      supabaseFetch(
        `/rest/v1/survey_submission?select=id,created_date_time&status=eq.completed${completedFilter}&order=created_date_time.asc`,
        { headers: { Prefer: "count=exact", Range: "0-49999" } }
      ),
      supabaseFetch(`/rest/v1/personal_report?select=id,survey_submission_id,created_date_time`, {
        headers: { Range: "0-49999" },
      }),
      supabaseFetch(`/rest/v1/report_session?select=id,personal_report_id,started_at`, {
        headers: { Range: "0-49999" },
      }),
      supabaseFetch(`/rest/v1/report_access_email?select=id,personal_report_id`, {
        headers: { Prefer: "count=exact" },
      }),
      supabaseFetch(`/rest/v1/invite_event?select=id,referrer_email,created_at`, {
        headers: { Prefer: "count=exact", Range: "0-49999" },
      }),
    ]);

    const submissions = submissionsRes.ok ? await submissionsRes.json() : [];
    const reports = reportsRes.ok ? await reportsRes.json() : [];
    const sessions = sessionsRes.ok ? await sessionsRes.json() : [];
    const accessEmails = accessRes.ok ? await accessRes.json() : [];
    const invites = inviteRes.ok ? await inviteRes.json() : [];

    const completedCount = submissions.length;
    const reportGeneratedCount = reports.length;

    // Reports with at least one session
    const reportIdsViewed = new Set(
      sessions.map((s: { personal_report_id: number }) => s.personal_report_id)
    );
    const reportViewedCount = reportIdsViewed.size;

    // Reports with at least one access email shared
    const reportIdsShared = new Set(
      accessEmails.map((e: { personal_report_id: number }) => e.personal_report_id)
    );
    const reportSharedCount = reportIdsShared.size;

    const inviteConversionCount = invites.length;

    // Funnel
    const funnel = [
      { stage: "Completed Survey", count: completedCount },
      { stage: "Report Generated", count: reportGeneratedCount },
      { stage: "Report Viewed", count: reportViewedCount },
      { stage: "Report Shared", count: reportSharedCount },
      { stage: "Invites Sent", count: inviteConversionCount },
    ];

    // Return visits (users with >1 session on different days)
    const sessionsByReport: Record<number, Set<string>> = {};
    for (const s of sessions as Array<{ personal_report_id: number; started_at: string }>) {
      if (!sessionsByReport[s.personal_report_id]) {
        sessionsByReport[s.personal_report_id] = new Set();
      }
      sessionsByReport[s.personal_report_id].add(s.started_at.slice(0, 10));
    }
    const returnVisitors = Object.values(sessionsByReport).filter((days) => days.size > 1).length;

    // Weekly cohorts from completion date
    const cohortMap: Record<string, { total: number; viewed: number }> = {};
    for (const sub of submissions as Array<{ id: number; created_date_time: string }>) {
      const d = new Date(sub.created_date_time);
      const weekStart = new Date(d);
      weekStart.setDate(d.getDate() - d.getDay());
      const weekKey = weekStart.toISOString().slice(0, 10);
      if (!cohortMap[weekKey]) cohortMap[weekKey] = { total: 0, viewed: 0 };
      cohortMap[weekKey].total++;

      // Check if this submission's report was viewed
      const report = reports.find(
        (r: { survey_submission_id: number }) => r.survey_submission_id === sub.id
      );
      if (report && reportIdsViewed.has(report.id)) {
        cohortMap[weekKey].viewed++;
      }
    }
    const cohorts = Object.entries(cohortMap)
      .map(([week, d]) => ({
        week,
        total: d.total,
        viewed: d.viewed,
        viewRate: d.total > 0 ? Math.round((d.viewed / d.total) * 100) : 0,
      }))
      .sort((a, b) => a.week.localeCompare(b.week));

    // Viral coefficient
    const uniqueReferrers = new Set(
      invites.map((i: { referrer_email: string }) => i.referrer_email)
    ).size;
    const viralCoefficient =
      completedCount > 0 ? Math.round((inviteConversionCount / completedCount) * 100) / 100 : 0;

    return NextResponse.json({
      funnel,
      returnVisitors,
      cohorts,
      viralCoefficient,
      uniqueReferrers,
    });
  } catch (err) {
    logger.error({ err }, "Retention analytics error");
    return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
  }
}
