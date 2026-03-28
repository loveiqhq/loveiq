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
    bucket: "admin-journey",
    limit: 30,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Please try again later." }, { status: 429 });
  }

  try {
    const [waitlistRes, submissionsRes, completedRes, reportsRes, sessionsRes, sharedRes] =
      await Promise.all([
        supabaseFetch(`/rest/v1/waitlist?select=id`, { headers: { Prefer: "count=exact" } }),
        supabaseFetch(`/rest/v1/survey_submission?select=id`, {
          headers: { Prefer: "count=exact" },
        }),
        supabaseFetch(`/rest/v1/survey_submission?select=id&status=eq.completed`, {
          headers: { Prefer: "count=exact" },
        }),
        supabaseFetch(`/rest/v1/personal_report?select=id`, {
          headers: { Prefer: "count=exact" },
        }),
        supabaseFetch(`/rest/v1/report_session?select=personal_report_id`, {
          headers: { Range: "0-49999" },
        }),
        supabaseFetch(`/rest/v1/report_access_email?select=id`, {
          headers: { Prefer: "count=exact" },
        }),
      ]);

    const getCount = async (res: Response) => {
      if (!res.ok) return 0;
      const body = await res.json();
      const range = res.headers.get("content-range");
      if (range) return parseInt(range.split("/")[1] || "0", 10);
      return Array.isArray(body) ? body.length : 0;
    };

    const waitlistCount = await getCount(waitlistRes);
    const submissionCount = await getCount(submissionsRes);
    const completedCount = await getCount(completedRes);
    const reportCount = await getCount(reportsRes);
    const sharedCount = await getCount(sharedRes);

    // Unique reports viewed
    let viewedCount = 0;
    if (sessionsRes.ok) {
      const sessions = await sessionsRes.json();
      viewedCount = new Set(
        sessions.map((s: { personal_report_id: number }) => s.personal_report_id)
      ).size;
    }

    const nodes = [
      { id: "waitlist", label: "Waitlist Signup", count: waitlistCount },
      { id: "started", label: "Survey Started", count: submissionCount },
      { id: "completed", label: "Survey Completed", count: completedCount },
      { id: "report", label: "Report Generated", count: reportCount },
      { id: "viewed", label: "Report Viewed", count: viewedCount },
      { id: "shared", label: "Report Shared", count: sharedCount },
    ];

    const links = [
      { source: "waitlist", target: "started", value: submissionCount },
      { source: "started", target: "completed", value: completedCount },
      { source: "completed", target: "report", value: reportCount },
      { source: "report", target: "viewed", value: viewedCount },
      { source: "viewed", target: "shared", value: sharedCount },
    ];

    const totalUsers = waitlistCount || submissionCount;
    const overallConversion = totalUsers > 0 ? Math.round((completedCount / totalUsers) * 100) : 0;

    return NextResponse.json({ nodes, links, totalUsers, overallConversion });
  } catch (err) {
    logger.error({ err }, "Journey analytics error");
    return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
  }
}
