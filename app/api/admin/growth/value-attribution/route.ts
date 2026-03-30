import { NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/admin/auth";
import { hasRole } from "@/lib/admin/roles";
import { buildTrustDescriptor, clampDays, sourceLabel } from "@/lib/admin/next-level";
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
    bucket: "admin-growth-value-attribution",
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
    const [submissionsRes, reportsRes, sessionsRes, paymentsRes, scoringRes] = await Promise.all([
      supabaseFetch(
        `/rest/v1/survey_submission?select=id,status,utm_tracker&created_date_time=gte.${since}`,
        { headers: { Range: "0-49999" } }
      ),
      supabaseFetch(`/rest/v1/personal_report?select=id,survey_submission_id`, {
        headers: { Range: "0-49999" },
      }),
      supabaseFetch(`/rest/v1/report_session?select=personal_report_id`, {
        headers: { Range: "0-49999" },
      }),
      supabaseFetch(
        `/rest/v1/payment?select=personal_report_id,status,amount&payment_date_time=gte.${since}`,
        {
          headers: { Range: "0-49999" },
        }
      ),
      supabaseFetch(
        `/rest/v1/scoring_result?select=survey_submission_id,primary_archetype&scored_at=gte.${since}`,
        { headers: { Range: "0-49999" } }
      ),
    ]);

    if (
      !submissionsRes.ok ||
      !reportsRes.ok ||
      !sessionsRes.ok ||
      !paymentsRes.ok ||
      !scoringRes.ok
    ) {
      logger.error("Value attribution: query failed");
      return NextResponse.json({ error: "Unable to load data." }, { status: 500 });
    }

    const submissions = (await submissionsRes.json()) as Array<{
      id: number;
      status: string;
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
    const payments = (await paymentsRes.json()) as Array<{
      personal_report_id: number;
      status: string;
      amount: number | null;
    }>;
    const scores = (await scoringRes.json()) as Array<{
      survey_submission_id: number;
      primary_archetype: string;
    }>;

    const reportBySubmission = new Map(
      reports.map((report) => [report.survey_submission_id, report.id])
    );
    const scoreBySubmission = new Map(
      scores.map((score) => [score.survey_submission_id, score.primary_archetype])
    );

    const sourceMap = new Map<
      string,
      { starts: number; completed: number; viewed: number; paid: number; revenue: number }
    >();
    const archetypeMap = new Map<
      string,
      { starts: number; viewed: number; paid: number; revenue: number }
    >();

    for (const submission of submissions) {
      const source = sourceLabel(submission.utm_tracker);
      const reportId = reportBySubmission.get(submission.id);
      const payment = payments.find(
        (row) => row.personal_report_id === reportId && row.status === "succeeded"
      );

      const sourceStats = sourceMap.get(source) ?? {
        starts: 0,
        completed: 0,
        viewed: 0,
        paid: 0,
        revenue: 0,
      };
      sourceStats.starts += 1;
      if (submission.status === "completed") sourceStats.completed += 1;
      if (reportId && viewedReportIds.has(reportId)) sourceStats.viewed += 1;
      if (payment) {
        sourceStats.paid += 1;
        sourceStats.revenue += Number(payment.amount ?? 0);
      }
      sourceMap.set(source, sourceStats);

      const archetype = scoreBySubmission.get(submission.id);
      if (archetype) {
        const archetypeStats = archetypeMap.get(archetype) ?? {
          starts: 0,
          viewed: 0,
          paid: 0,
          revenue: 0,
        };
        archetypeStats.starts += 1;
        if (reportId && viewedReportIds.has(reportId)) archetypeStats.viewed += 1;
        if (payment) {
          archetypeStats.paid += 1;
          archetypeStats.revenue += Number(payment.amount ?? 0);
        }
        archetypeMap.set(archetype, archetypeStats);
      }
    }

    return NextResponse.json({
      days,
      channels: [...sourceMap.entries()]
        .map(([source, value]) => ({
          source,
          starts: value.starts,
          completionRate: value.starts > 0 ? Math.round((value.completed / value.starts) * 100) : 0,
          reportViewRate: value.starts > 0 ? Math.round((value.viewed / value.starts) * 100) : 0,
          paidRate: value.starts > 0 ? Math.round((value.paid / value.starts) * 100) : 0,
          revenueTotal: Math.round(value.revenue * 100) / 100,
        }))
        .sort((a, b) => b.revenueTotal - a.revenueTotal || b.starts - a.starts),
      archetypes: [...archetypeMap.entries()]
        .map(([archetype, value]) => ({
          archetype,
          starts: value.starts,
          reportViewRate: value.starts > 0 ? Math.round((value.viewed / value.starts) * 100) : 0,
          paidRate: value.starts > 0 ? Math.round((value.paid / value.starts) * 100) : 0,
          revenueTotal: Math.round(value.revenue * 100) / 100,
        }))
        .sort((a, b) => b.revenueTotal - a.revenueTotal || b.starts - a.starts),
      trust: buildTrustDescriptor({
        source: "survey_submission + personal_report + payment + scoring_result",
        mode: "derived",
        sampleSize: submissions.length,
        lastUpdated: new Date().toISOString(),
        warning:
          payments.filter((payment) => payment.status === "succeeded").length === 0
            ? "No succeeded payments exist in the selected window, so attribution is directional only."
            : null,
      }),
    });
  } catch (err) {
    logger.error({ err }, "Value attribution error");
    return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
  }
}
