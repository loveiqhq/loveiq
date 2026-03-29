import { NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/admin/auth";
import { hasRole } from "@/lib/admin/roles";
import { supabaseFetch } from "@/lib/admin/supabase";
import { checkRateLimit, getClientIp } from "@/lib/ratelimit";
import logger from "@/lib/logger";

function topGap(values: Record<string, number> | null | undefined): number | null {
  if (!values) return null;
  const sorted = Object.values(values)
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => b - a);
  if (sorted.length === 0) return null;
  if (sorted.length === 1) return Math.round(sorted[0] * 10) / 10;
  return Math.round((sorted[0] - sorted[1]) * 10) / 10;
}

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
    bucket: "admin-submissions",
    limit: 30,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Please try again later." }, { status: 429 });
  }

  const url = new URL(request.url);
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") || "20", 10)));
  const status = url.searchParams.get("status") || "";
  const email = url.searchParams.get("email") || "";
  const archetype = url.searchParams.get("archetype") || "";
  const dateFrom = url.searchParams.get("dateFrom") || "";
  const dateTo = url.searchParams.get("dateTo") || "";

  const offset = (page - 1) * limit;

  // Build PostgREST query with server-side filtering via !inner joins
  const userJoin = email
    ? "app_user!fk_survey_submission_user!inner(email,first_name)"
    : "app_user!fk_survey_submission_user(email,first_name)";
  const scoringJoin = archetype
    ? "scoring_result!inner(primary_archetype,v5_primary_archetype,percentages,v5_percentages)"
    : "scoring_result(primary_archetype,v5_primary_archetype,percentages,v5_percentages)";

  let query = `/rest/v1/survey_submission?select=id,status,start_date_time,created_date_time,duration_ms,${userJoin},${scoringJoin}&order=created_date_time.desc`;

  if (status) query += `&status=eq.${encodeURIComponent(status)}`;
  if (dateFrom) query += `&start_date_time=gte.${encodeURIComponent(dateFrom)}`;
  if (dateTo) query += `&start_date_time=lte.${encodeURIComponent(dateTo + "T23:59:59.999Z")}`;
  if (email) query += `&app_user.email=ilike.*${encodeURIComponent(email)}*`;
  if (archetype) query += `&scoring_result.primary_archetype=eq.${encodeURIComponent(archetype)}`;

  try {
    const res = await supabaseFetch(query, {
      headers: {
        Prefer: "count=exact",
        Range: `${offset}-${offset + limit - 1}`,
      },
    });

    if (!res.ok) {
      logger.error({ status: res.status }, "Admin submissions query failed");
      return NextResponse.json({ error: "Unable to load submissions." }, { status: 500 });
    }

    const total = parseInt(res.headers.get("content-range")?.split("/")[1] || "0", 10);
    const raw = (await res.json()) as Array<{
      id: number;
      status: string;
      start_date_time: string | null;
      created_date_time: string;
      duration_ms: number | null;
      app_user: { email: string; first_name: string } | null;
      scoring_result: Array<{
        primary_archetype: string;
        v5_primary_archetype: string | null;
        percentages?: Record<string, number> | null;
        v5_percentages?: Record<string, number> | null;
      }>;
    }>;

    const submissionIds = raw.map((row) => row.id);
    const answerMetrics = new Map<number, { skipped: number; revisions: number }>();

    if (submissionIds.length > 0) {
      const answersRes = await supabaseFetch(
        `/rest/v1/survey_submission_answer?select=survey_submission_id,revision_count,was_skipped&survey_submission_id=in.(${submissionIds.join(",")})`,
        { headers: { Range: "0-99999" } }
      );

      if (answersRes.ok) {
        const answers = (await answersRes.json()) as Array<{
          survey_submission_id: number;
          revision_count: number | null;
          was_skipped: boolean | null;
        }>;

        for (const answer of answers) {
          const current = answerMetrics.get(answer.survey_submission_id) ?? {
            skipped: 0,
            revisions: 0,
          };
          if (answer.was_skipped) current.skipped += 1;
          current.revisions += answer.revision_count ?? 0;
          answerMetrics.set(answer.survey_submission_id, current);
        }
      }
    }

    const submissions = raw
      .map((r) => {
        const scoring = r.scoring_result?.[0];
        const metrics = answerMetrics.get(r.id) ?? { skipped: 0, revisions: 0 };
        const v4Gap = topGap(scoring?.percentages);
        const v5Gap = topGap(scoring?.v5_percentages);
        const hasDisagreement =
          !!scoring?.primary_archetype &&
          !!scoring?.v5_primary_archetype &&
          scoring.primary_archetype !== scoring.v5_primary_archetype;

        let priorityScore = 0;
        const reviewReasons: string[] = [];

        if (r.status === "flagged") {
          priorityScore += 40;
          reviewReasons.push("Already flagged");
        }
        if (hasDisagreement) {
          priorityScore += 25;
          reviewReasons.push("V4 and V5 disagree");
        }
        const minGap = Math.min(v4Gap ?? 100, v5Gap ?? 100);
        if (minGap < 10) {
          priorityScore += 20;
          reviewReasons.push("Ambiguous score spread");
        } else if (minGap < 20) {
          priorityScore += 10;
          reviewReasons.push("Borderline score spread");
        }
        if (metrics.skipped > 0) {
          priorityScore += Math.min(metrics.skipped * 4, 12);
          reviewReasons.push(
            `${metrics.skipped} skipped answer${metrics.skipped === 1 ? "" : "s"}`
          );
        }
        if (metrics.revisions >= 3) {
          priorityScore += Math.min(metrics.revisions * 2, 14);
          reviewReasons.push(`${metrics.revisions} revisions`);
        }
        if (r.duration_ms != null && r.duration_ms > 1_200_000) {
          priorityScore += 10;
          reviewReasons.push("Long completion time");
        }
        if (!scoring?.primary_archetype) {
          priorityScore += 8;
          reviewReasons.push("Missing scoring");
        }

        const priorityLabel = priorityScore >= 60 ? "high" : priorityScore >= 30 ? "medium" : "low";

        return {
          id: r.id,
          email: r.app_user?.email || "",
          first_name: r.app_user?.first_name || "",
          status: r.status,
          started_at: r.start_date_time || r.created_date_time,
          completed_at: r.created_date_time,
          duration_ms: r.duration_ms,
          primary_archetype: scoring?.primary_archetype || null,
          v5_primary_archetype: scoring?.v5_primary_archetype || null,
          priority_score: priorityScore,
          priority_label: priorityLabel,
          review_reasons: reviewReasons,
        };
      })
      .sort(
        (a, b) =>
          b.priority_score - a.priority_score ||
          new Date(b.completed_at).getTime() - new Date(a.completed_at).getTime()
      );

    return NextResponse.json({ submissions, total, page, limit });
  } catch (err) {
    logger.error({ err }, "Admin submissions error");
    return NextResponse.json({ error: "Unable to load submissions." }, { status: 500 });
  }
}
