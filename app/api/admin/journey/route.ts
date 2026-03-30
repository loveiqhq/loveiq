import { NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/admin/auth";
import { hasRole } from "@/lib/admin/roles";
import {
  classifyPlacement,
  clampDays,
  parseAnswerCount,
  parseUtmCampaign,
  sourceLabel,
} from "@/lib/admin/next-level";
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
    const url = new URL(request.url);
    const days = clampDays(parseInt(url.searchParams.get("days") || "30", 10), 7, 365);
    const since = new Date(Date.now() - days * 86_400_000).toISOString();

    const [
      waitlistRes,
      submissionsRes,
      reportsRes,
      sessionsRes,
      sharedRes,
      partialsRes,
      scoringRes,
      paymentsRes,
    ] = await Promise.all([
      supabaseFetch(
        `/rest/v1/waitlist_user?select=id,utm_tracker,created_date_time&created_date_time=gte.${since}&order=created_date_time.desc`,
        { headers: { Range: "0-49999" } }
      ),
      supabaseFetch(
        `/rest/v1/survey_submission?select=id,status,session_id,utm_tracker,created_date_time&created_date_time=gte.${since}&order=created_date_time.desc`,
        { headers: { Range: "0-49999" } }
      ),
      supabaseFetch(
        `/rest/v1/personal_report?select=id,survey_submission_id,created_date_time&created_date_time=gte.${since}&order=created_date_time.desc`,
        { headers: { Range: "0-49999" } }
      ),
      supabaseFetch(`/rest/v1/report_session?select=personal_report_id,started_at`, {
        headers: { Range: "0-49999" },
      }),
      supabaseFetch(`/rest/v1/report_access_email?select=id,personal_report_id`, {
        headers: { Range: "0-49999" },
      }),
      supabaseFetch(
        `/rest/v1/survey_partial_save?select=session_id,current_index,answers,saved_at,utm_tracker&saved_at=gte.${since}&order=saved_at.desc`,
        { headers: { Range: "0-49999" } }
      ),
      supabaseFetch(`/rest/v1/scoring_result?select=survey_submission_id&scored_at=gte.${since}`, {
        headers: { Range: "0-49999" },
      }),
      supabaseFetch(
        `/rest/v1/payment?select=personal_report_id,status&payment_date_time=gte.${since}`,
        {
          headers: { Range: "0-49999" },
        }
      ),
    ]);

    if (
      !waitlistRes.ok ||
      !submissionsRes.ok ||
      !reportsRes.ok ||
      !sessionsRes.ok ||
      !sharedRes.ok ||
      !partialsRes.ok ||
      !scoringRes.ok ||
      !paymentsRes.ok
    ) {
      logger.error("Journey analytics: one or more Supabase queries failed");
      return NextResponse.json({ error: "Unable to load journey data." }, { status: 500 });
    }

    const waitlistRows = (await waitlistRes.json()) as Array<{
      id: number;
      utm_tracker: string | null;
      created_date_time: string;
    }>;
    const submissions = (await submissionsRes.json()) as Array<{
      id: number;
      status: string;
      session_id: string | null;
      utm_tracker: string | null;
      created_date_time: string;
    }>;
    const reports = (await reportsRes.json()) as Array<{
      id: number;
      survey_submission_id: number;
      created_date_time: string;
    }>;
    const sessions = (await sessionsRes.json()) as Array<{
      personal_report_id: number;
      started_at: string;
    }>;
    const shared = (await sharedRes.json()) as Array<{
      id: number;
      personal_report_id: number;
    }>;
    const partials = (await partialsRes.json()) as Array<{
      session_id: string;
      current_index: number;
      answers: Record<string, unknown> | null;
      saved_at: string;
      utm_tracker: string | null;
    }>;
    const scoringRows = (await scoringRes.json()) as Array<{ survey_submission_id: number }>;
    const payments = (await paymentsRes.json()) as Array<{
      personal_report_id: number;
      status: string;
    }>;

    const submissionCount = submissions.length;
    const completedCount = submissions.filter(
      (submission) => submission.status === "completed"
    ).length;
    const reportCount = reports.length;
    const sharedCount = new Set(shared.map((row) => row.personal_report_id)).size;
    const viewedReportIds = new Set(sessions.map((row) => row.personal_report_id));
    const viewedCount = viewedReportIds.size;
    const scoredIds = new Set(scoringRows.map((row) => row.survey_submission_id));
    const paidReportIds = new Set(
      payments.filter((row) => row.status === "succeeded").map((row) => row.personal_report_id)
    );

    const nodes = [
      { id: "waitlist", label: "Waitlist Signup", count: waitlistRows.length },
      { id: "started", label: "Survey Started", count: submissionCount },
      { id: "partial", label: "Partial Save", count: partials.length },
      { id: "completed", label: "Survey Completed", count: completedCount },
      { id: "scored", label: "Scored", count: scoredIds.size },
      { id: "report", label: "Report Generated", count: reportCount },
      { id: "viewed", label: "Report Viewed", count: viewedCount },
      { id: "paid", label: "Payment Completed", count: paidReportIds.size },
      { id: "shared", label: "Report Shared", count: sharedCount },
    ];

    const links = [
      { source: "waitlist", target: "started", value: submissionCount },
      { source: "started", target: "partial", value: partials.length },
      { source: "started", target: "completed", value: completedCount },
      { source: "completed", target: "scored", value: scoredIds.size },
      { source: "scored", target: "report", value: reportCount },
      { source: "report", target: "viewed", value: viewedCount },
      { source: "viewed", target: "paid", value: paidReportIds.size },
      { source: "viewed", target: "shared", value: sharedCount },
    ];

    const totalUsers = waitlistRows.length || submissionCount;
    const overallConversion = totalUsers > 0 ? Math.round((completedCount / totalUsers) * 100) : 0;

    const reportIdBySubmission = new Map(
      reports.map((report) => [report.survey_submission_id, report.id])
    );
    const partialByPlacement = new Map<
      string,
      { partials: number; recovered: number; totalAnswers: number }
    >();
    for (const partial of partials) {
      const placement = classifyPlacement(partial.utm_tracker);
      const current = partialByPlacement.get(placement) ?? {
        partials: 0,
        recovered: 0,
        totalAnswers: 0,
      };
      current.partials += 1;
      current.totalAnswers += parseAnswerCount(partial.answers);
      if (
        submissions.some(
          (submission) =>
            submission.session_id === partial.session_id && submission.status === "completed"
        )
      ) {
        current.recovered += 1;
      }
      partialByPlacement.set(placement, current);
    }

    const checkpointsMap = new Map<number, { count: number; recovered: number }>();
    for (const partial of partials) {
      const checkpoint = checkpointsMap.get(partial.current_index) ?? { count: 0, recovered: 0 };
      checkpoint.count += 1;
      if (
        submissions.some(
          (submission) =>
            submission.session_id === partial.session_id && submission.status === "completed"
        )
      ) {
        checkpoint.recovered += 1;
      }
      checkpointsMap.set(partial.current_index, checkpoint);
    }

    const pathMap = new Map<
      string,
      { total: number; completed: number; viewed: number; paid: number }
    >();
    for (const submission of submissions) {
      const path = `${sourceLabel(submission.utm_tracker)} · ${
        parseUtmCampaign(submission.utm_tracker) === "unknown"
          ? "organic"
          : parseUtmCampaign(submission.utm_tracker)
      }`;
      const current = pathMap.get(path) ?? { total: 0, completed: 0, viewed: 0, paid: 0 };
      current.total += 1;
      if (submission.status === "completed") current.completed += 1;

      const reportId = reportIdBySubmission.get(submission.id);
      if (reportId && viewedReportIds.has(reportId)) current.viewed += 1;
      if (reportId && paidReportIds.has(reportId)) current.paid += 1;
      pathMap.set(path, current);
    }

    return NextResponse.json({
      days,
      nodes,
      links,
      totalUsers,
      overallConversion,
      lineageSummary: {
        waitlist: waitlistRows.length,
        started: submissionCount,
        partial: partials.length,
        completed: completedCount,
        scored: scoredIds.size,
        reportGenerated: reportCount,
        reportViewed: viewedCount,
        paid: paidReportIds.size,
      },
      partialAnalytics: {
        totalPartials: partials.length,
        avgCheckpoint:
          partials.length > 0
            ? Math.round(
                partials.reduce((sum, row) => sum + row.current_index, 0) / partials.length
              )
            : 0,
        checkpoints: [...checkpointsMap.entries()]
          .map(([checkpoint, value]) => ({
            checkpoint,
            count: value.count,
            recovered: value.recovered,
            recoveryRate: value.count > 0 ? Math.round((value.recovered / value.count) * 100) : 0,
          }))
          .sort((a, b) => b.count - a.count),
        placementSegments: [...partialByPlacement.entries()].map(([placement, stats]) => ({
          placement,
          partials: stats.partials,
          recovered: stats.recovered,
          recoveryRate:
            stats.partials > 0 ? Math.round((stats.recovered / stats.partials) * 100) : 0,
          avgAnswers: stats.partials > 0 ? Math.round(stats.totalAnswers / stats.partials) : 0,
        })),
      },
      cohorts: [...pathMap.entries()]
        .map(([path, value]) => ({
          path,
          total: value.total,
          completed: value.completed,
          viewed: value.viewed,
          paid: value.paid,
          completionRate: value.total > 0 ? Math.round((value.completed / value.total) * 100) : 0,
          viewRate: value.total > 0 ? Math.round((value.viewed / value.total) * 100) : 0,
          paidRate: value.total > 0 ? Math.round((value.paid / value.total) * 100) : 0,
        }))
        .sort((a, b) => b.total - a.total),
    });
  } catch (err) {
    logger.error({ err }, "Journey analytics error");
    return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
  }
}
