import { NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/admin/auth";
import { hasRole } from "@/lib/admin/roles";
import {
  isScoringPendingSubmission,
  MISSING_SCORING_REASON,
  SCORING_PENDING_REASON,
} from "@/lib/admin/submission-scoring";
import { supabaseFetch } from "@/lib/admin/supabase";
import { checkRateLimit, getClientIp } from "@/lib/ratelimit";
import logger from "@/lib/logger";
import { buildPartialSubmissionRecord, type SurveyPartialRow } from "@/lib/admin/survey-partials";

export const dynamic = "force-dynamic";

function topGap(values: Record<string, number> | null | undefined): number | null {
  if (!values) return null;
  const sorted = Object.values(values)
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => b - a);
  if (sorted.length === 0) return null;
  if (sorted.length === 1) return Math.round(sorted[0] * 10) / 10;
  return Math.round((sorted[0] - sorted[1]) * 10) / 10;
}

function matchesEmailFilter(email: string, filter: string) {
  if (!filter) return true;
  return email.toLowerCase().includes(filter.toLowerCase());
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
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
  const includePartials = !status || status === "partial" || status === "pending_completion";
  const includeCompleted = !status || (status !== "partial" && status !== "pending_completion");

  try {
    let partialRecords: Array<ReturnType<typeof buildPartialSubmissionRecord>> = [];

    if (includePartials && !archetype) {
      let partialQuery =
        "/rest/v1/survey_partial_save?select=id,session_id,answers,current_index,started_at,saved_at,utm_tracker&order=saved_at.desc";
      if (dateFrom) partialQuery += `&saved_at=gte.${encodeURIComponent(dateFrom)}`;
      if (dateTo) {
        partialQuery += `&saved_at=lte.${encodeURIComponent(dateTo + "T23:59:59.999Z")}`;
      }

      const partialRes = await supabaseFetch(partialQuery, {
        headers: {
          Prefer: "count=exact",
          Range: "0-4999",
        },
      });

      if (!partialRes.ok) {
        logger.error({ status: partialRes.status }, "Admin partial submissions query failed");
        return NextResponse.json({ error: "Unable to load submissions." }, { status: 500 });
      }

      const partialRows = (await partialRes.json()) as SurveyPartialRow[];
      const sessionIds = [...new Set(partialRows.map((row) => row.session_id).filter(Boolean))];
      const matchedSessionIds = new Set<string>();

      for (const batch of chunk(sessionIds, 100)) {
        const response = await supabaseFetch(
          `/rest/v1/survey_submission?select=session_id&session_id=in.(${batch
            .map((sessionId) => encodeURIComponent(sessionId))
            .join(",")})`,
          { headers: { Range: "0-999" } }
        );

        if (!response.ok) {
          logger.error({ status: response.status }, "Admin matched session lookup failed");
          return NextResponse.json({ error: "Unable to load submissions." }, { status: 500 });
        }

        const rows = (await response.json()) as Array<{ session_id: string | null }>;
        rows.forEach((row) => {
          if (row.session_id) matchedSessionIds.add(row.session_id);
        });
      }

      partialRecords = partialRows
        .filter((row) => !matchedSessionIds.has(row.session_id))
        .map(buildPartialSubmissionRecord)
        .filter((row) => matchesEmailFilter(row.email, email))
        .filter((row) => (status ? row.status === status : true));
    }

    let completedRows: Array<{
      id: number;
      record_type: "submission";
      submission_id: number;
      session_id: null;
      detail_href: string;
      selectable: true;
      email: string;
      first_name: string;
      status: string;
      started_at: string;
      completed_at: string;
      saved_at: string;
      duration_ms: number | null;
      primary_archetype: string | null;
      v5_primary_archetype: string | null;
      priority_score: number;
      priority_label: "high" | "medium" | "low";
      review_reasons: string[];
      answer_count: null;
      current_index: null;
      recoverable: false;
      utm_source: null;
    }> = [];
    let completedTotal = 0;

    if (includeCompleted) {
      const userJoin = email
        ? "app_user!fk_survey_submission_user!inner(email,first_name)"
        : "app_user!fk_survey_submission_user(email,first_name)";
      const scoringJoin = archetype
        ? "scoring_result!inner(primary_archetype,v5_primary_archetype,percentages,v5_percentages)"
        : "scoring_result(primary_archetype,v5_primary_archetype,percentages,v5_percentages)";
      const completedFetchSize = Math.max(limit, offset + limit + partialRecords.length);

      let query = `/rest/v1/survey_submission?select=id,status,start_date_time,created_date_time,duration_ms,${userJoin},${scoringJoin}&order=created_date_time.desc`;
      if (status) query += `&status=eq.${encodeURIComponent(status)}`;
      if (dateFrom) query += `&start_date_time=gte.${encodeURIComponent(dateFrom)}`;
      if (dateTo) {
        query += `&start_date_time=lte.${encodeURIComponent(dateTo + "T23:59:59.999Z")}`;
      }
      if (email) query += `&app_user.email=ilike.*${encodeURIComponent(email)}*`;
      if (archetype)
        query += `&scoring_result.primary_archetype=eq.${encodeURIComponent(archetype)}`;

      const res = await supabaseFetch(query, {
        headers: {
          Prefer: "count=exact",
          Range: `0-${completedFetchSize - 1}`,
        },
      });

      if (!res.ok) {
        logger.error({ status: res.status }, "Admin submissions query failed");
        return NextResponse.json({ error: "Unable to load submissions." }, { status: 500 });
      }

      completedTotal = parseInt(res.headers.get("content-range")?.split("/")[1] || "0", 10);
      const raw = (await res.json()) as Array<{
        id: number;
        status: string;
        start_date_time: string | null;
        created_date_time: string;
        duration_ms: number | null;
        app_user: { email: string; first_name: string } | null;
        scoring_result: {
          primary_archetype: string;
          v5_primary_archetype: string | null;
          percentages?: Record<string, number> | null;
          v5_percentages?: Record<string, number> | null;
        } | null;
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

      completedRows = raw.map((row) => {
        const scoring = row.scoring_result;
        const metrics = answerMetrics.get(row.id) ?? { skipped: 0, revisions: 0 };
        const v4Gap = topGap(scoring?.percentages);
        const v5Gap = topGap(scoring?.v5_percentages);
        const scoringPending = isScoringPendingSubmission({
          completedAt: row.created_date_time,
          primaryArchetype: scoring?.primary_archetype ?? null,
          status: row.status,
        });
        const hasDisagreement =
          !!scoring?.primary_archetype &&
          !!scoring?.v5_primary_archetype &&
          scoring.primary_archetype !== scoring.v5_primary_archetype;

        let priorityScore = 0;
        const reviewReasons: string[] = [];

        if (row.status === "flagged") {
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
        if (row.duration_ms != null && row.duration_ms > 1_200_000) {
          priorityScore += 10;
          reviewReasons.push("Long completion time");
        }
        if (!scoring?.primary_archetype) {
          if (scoringPending) {
            reviewReasons.push(SCORING_PENDING_REASON);
          } else {
            priorityScore += 8;
            reviewReasons.push(MISSING_SCORING_REASON);
          }
        }

        const priorityLabel = priorityScore >= 60 ? "high" : priorityScore >= 30 ? "medium" : "low";

        return {
          id: row.id,
          record_type: "submission" as const,
          submission_id: row.id,
          session_id: null,
          detail_href: `/admin/submissions/${row.id}`,
          selectable: true as const,
          email: row.app_user?.email || "",
          first_name: row.app_user?.first_name || "",
          status: row.status,
          started_at: row.start_date_time || row.created_date_time,
          completed_at: row.created_date_time,
          saved_at: row.created_date_time,
          duration_ms: row.duration_ms,
          primary_archetype: scoring?.primary_archetype || null,
          v5_primary_archetype: scoring?.v5_primary_archetype || null,
          priority_score: priorityScore,
          priority_label: priorityLabel,
          review_reasons: reviewReasons,
          answer_count: null,
          current_index: null,
          recoverable: false as const,
          utm_source: null,
        };
      });
    }

    const submissions = [...partialRecords, ...completedRows]
      .sort(
        (left, right) =>
          right.priority_score - left.priority_score ||
          new Date(right.completed_at).getTime() - new Date(left.completed_at).getTime()
      )
      .slice(offset, offset + limit);

    return NextResponse.json(
      {
        submissions,
        total: completedTotal + partialRecords.length,
        page,
        limit,
      },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      }
    );
  } catch (err) {
    logger.error({ err }, "Admin submissions error");
    return NextResponse.json({ error: "Unable to load submissions." }, { status: 500 });
  }
}
