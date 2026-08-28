import { NextResponse } from "next/server";
import { verifyAdminSession } from "@features/admin/server/auth";
import { hasRole } from "@features/admin/server/roles";
import {
  buildTrustDescriptor,
  classifyPlacement,
  clampDays,
} from "@features/admin/server/next-level";
import { checkRateLimit, getClientIp } from "@shared/http/ratelimit";
import { supabaseFetch } from "@features/admin/server/supabase";
import logger from "@shared/observability/logger";

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
    bucket: "admin-growth-embed-performance",
    limit: 30,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Please try again later." }, { status: 429 });
  }

  const url = new URL(request.url);
  const days = clampDays(parseInt(url.searchParams.get("days") || "30", 10), 7, 365);
  const since = new Date(Date.now() - days * 86_400_000).toISOString();

  try {
    const [submissionsRes, partialsRes, reportsRes, sessionsRes, paymentsRes] = await Promise.all([
      supabaseFetch(
        `/rest/v1/survey_submission?select=id,status,session_id,utm_tracker&created_date_time=gte.${since}`,
        { headers: { Range: "0-49999" } }
      ),
      supabaseFetch(
        `/rest/v1/survey_partial_save?select=session_id,utm_tracker&saved_at=gte.${since}`,
        { headers: { Range: "0-49999" } }
      ),
      supabaseFetch(`/rest/v1/personal_report?select=id,survey_submission_id,created_date_time`, {
        headers: { Range: "0-49999" },
      }),
      supabaseFetch(`/rest/v1/report_session?select=personal_report_id`, {
        headers: { Range: "0-49999" },
      }),
      supabaseFetch(
        `/rest/v1/payment?is_test=is.false&select=personal_report_id,status&payment_date_time=gte.${since}`,
        {
          headers: { Range: "0-49999" },
        }
      ),
    ]);

    if (
      !submissionsRes.ok ||
      !partialsRes.ok ||
      !reportsRes.ok ||
      !sessionsRes.ok ||
      !paymentsRes.ok
    ) {
      logger.error("Embed performance: query failed");
      return NextResponse.json({ error: "Unable to load data." }, { status: 500 });
    }

    const submissions = (await submissionsRes.json()) as Array<{
      id: number;
      status: string;
      session_id: string | null;
      utm_tracker: string | null;
    }>;
    const partials = (await partialsRes.json()) as Array<{
      session_id: string;
      utm_tracker: string | null;
    }>;
    const reports = (await reportsRes.json()) as Array<{
      id: number;
      survey_submission_id: number;
    }>;
    const viewedReportIds = new Set(
      ((await sessionsRes.json()) as Array<{ personal_report_id: number }>).map(
        (row) => row.personal_report_id
      )
    );
    const paidReportIds = new Set(
      ((await paymentsRes.json()) as Array<{ personal_report_id: number; status: string }>)
        .filter((row) => row.status === "succeeded")
        .map((row) => row.personal_report_id)
    );

    const reportBySubmission = new Map(
      reports.map((report) => [report.survey_submission_id, report.id])
    );
    const recoveredSessions = new Set(
      submissions
        .filter((submission) => submission.status === "completed" && submission.session_id)
        .map((submission) => submission.session_id as string)
    );

    const placementMap = new Map<
      string,
      {
        starts: number;
        completed: number;
        partials: number;
        recovered: number;
        viewed: number;
        paid: number;
      }
    >();

    for (const submission of submissions) {
      const placement = classifyPlacement(submission.utm_tracker);
      const current = placementMap.get(placement) ?? {
        starts: 0,
        completed: 0,
        partials: 0,
        recovered: 0,
        viewed: 0,
        paid: 0,
      };
      current.starts += 1;
      if (submission.status === "completed") current.completed += 1;
      const reportId = reportBySubmission.get(submission.id);
      if (reportId && viewedReportIds.has(reportId)) current.viewed += 1;
      if (reportId && paidReportIds.has(reportId)) current.paid += 1;
      placementMap.set(placement, current);
    }

    for (const partial of partials) {
      const placement = classifyPlacement(partial.utm_tracker);
      const current = placementMap.get(placement) ?? {
        starts: 0,
        completed: 0,
        partials: 0,
        recovered: 0,
        viewed: 0,
        paid: 0,
      };
      current.partials += 1;
      if (recoveredSessions.has(partial.session_id)) current.recovered += 1;
      placementMap.set(placement, current);
    }

    const placements = [...placementMap.entries()]
      .map(([placement, stats]) => ({
        placement,
        starts: stats.starts,
        completionRate: stats.starts > 0 ? Math.round((stats.completed / stats.starts) * 100) : 0,
        partialRate: stats.starts > 0 ? Math.round((stats.partials / stats.starts) * 100) : 0,
        recoveryRate: stats.partials > 0 ? Math.round((stats.recovered / stats.partials) * 100) : 0,
        reportViewRate: stats.starts > 0 ? Math.round((stats.viewed / stats.starts) * 100) : 0,
        paidRate: stats.starts > 0 ? Math.round((stats.paid / stats.starts) * 100) : 0,
      }))
      .sort((a, b) => b.starts - a.starts);

    const embeddedCount = placements
      .filter((placement) => placement.placement === "Embedded")
      .reduce((sum, placement) => sum + placement.starts, 0);

    return NextResponse.json({
      days,
      placements,
      summary: {
        trackedPlacements: placements.length,
        embeddedStarts: embeddedCount,
        hostedStarts: placements
          .filter((placement) => placement.placement === "Hosted")
          .reduce((sum, placement) => sum + placement.starts, 0),
      },
      trust: buildTrustDescriptor({
        source: "survey_submission + survey_partial_save + personal_report + payment",
        mode: "derived",
        sampleSize: submissions.length + partials.length,
        lastUpdated: new Date().toISOString(),
        warning:
          embeddedCount === 0
            ? "No explicit embed markers were found in the tracked UTM payloads for this window."
            : null,
      }),
    });
  } catch (err) {
    logger.error({ err }, "Embed performance error");
    return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
  }
}
