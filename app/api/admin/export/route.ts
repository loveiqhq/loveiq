import { NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/admin/auth";
import { hasRole } from "@/lib/admin/roles";
import { logAdminAction } from "@/lib/admin/audit";
import { supabaseFetch } from "@/lib/admin/supabase";
import { checkRateLimit, getClientIp } from "@/lib/ratelimit";
import logger from "@/lib/logger";

/** Extract utm_source from a JSON utm_tracker string, falling back to the raw value. */
function parseUtmSource(tracker: string | null, fallback = "Direct"): string {
  if (!tracker?.trim()) return fallback;
  try {
    const parsed = JSON.parse(tracker);
    return parsed.utm_source || fallback;
  } catch {
    return tracker.trim();
  }
}

export async function GET(request: Request) {
  const admin = await verifyAdminSession();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!hasRole(admin.role, "admin")) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const ip = getClientIp(request);
  const rateLimit = await checkRateLimit(ip, {
    bucket: "admin-export",
    limit: 5,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Please try again later." }, { status: 429 });
  }

  logger.info({ ip, query: request.url }, "Admin CSV export");
  await logAdminAction({
    admin_email: admin.email,
    action: "export_csv",
    resource_type: "export",
    metadata: { query: request.url },
    ip,
  });

  const url = new URL(request.url);
  const status = url.searchParams.get("status") || "";
  const email = url.searchParams.get("email") || "";
  const archetype = url.searchParams.get("archetype") || "";
  const dateFrom = url.searchParams.get("dateFrom") || "";
  const dateTo = url.searchParams.get("dateTo") || "";

  const userJoin = email
    ? "app_user!fk_survey_submission_user!inner(email,first_name)"
    : "app_user!fk_survey_submission_user(email,first_name)";
  const scoringJoin = archetype ? ",scoring_result!inner(primary_archetype)" : "";

  let query = `/rest/v1/survey_submission?select=id,status,start_date_time,created_date_time,duration_ms,utm_tracker,${userJoin}${scoringJoin}&order=created_date_time.desc`;
  if (status) query += `&status=eq.${encodeURIComponent(status)}`;
  if (dateFrom) query += `&start_date_time=gte.${encodeURIComponent(dateFrom)}`;
  if (dateTo) query += `&start_date_time=lte.${encodeURIComponent(dateTo + "T23:59:59.999Z")}`;
  if (email) query += `&app_user.email=ilike.*${encodeURIComponent(email)}*`;
  if (archetype) query += `&scoring_result.primary_archetype=eq.${encodeURIComponent(archetype)}`;

  try {
    const res = await supabaseFetch(query, { headers: { Range: "0-99999" } });
    if (!res.ok) {
      logger.error({ status: res.status }, "Admin export query failed");
      return NextResponse.json({ error: "Unable to export." }, { status: 500 });
    }

    const rawSubmissions = (await res.json()) as Array<{
      id: number;
      status: string;
      start_date_time: string | null;
      created_date_time: string;
      duration_ms: number | null;
      utm_tracker: string | null;
      app_user: { email: string; first_name: string } | null;
    }>;

    const submissions = rawSubmissions.map((r) => ({
      id: r.id,
      email: r.app_user?.email || "",
      first_name: r.app_user?.first_name || "",
      status: r.status,
      started_at: r.start_date_time || r.created_date_time,
      completed_at: r.created_date_time,
      duration_ms: r.duration_ms,
      utm_source: parseUtmSource(r.utm_tracker),
    }));

    // Fetch scoring results for all submissions
    const ids = submissions.map((s) => s.id);
    const scoringMap: Record<
      number,
      {
        primary_archetype: string;
        percentages: Record<string, number>;
        raw_scores: Record<string, number>;
        engine_version: string;
        scored_at: string;
        v5_primary_archetype: string | null;
        v5_percentages: Record<string, number> | null;
      }
    > = {};

    if (ids.length > 0) {
      try {
        const scoringRes = await supabaseFetch(
          `/rest/v1/scoring_result?survey_submission_id=in.(${ids.join(",")})&select=survey_submission_id,primary_archetype,percentages,raw_scores,engine_version,scored_at,v5_primary_archetype,v5_percentages`,
          { headers: { Range: "0-99999" } }
        );
        if (scoringRes.ok) {
          const scoringRows = (await scoringRes.json()) as Array<{
            survey_submission_id: number;
            primary_archetype: string;
            percentages: Record<string, number>;
            raw_scores: Record<string, number>;
            engine_version: string;
            scored_at: string;
            v5_primary_archetype: string | null;
            v5_percentages: Record<string, number> | null;
          }>;
          for (const row of scoringRows) {
            scoringMap[row.survey_submission_id] = row;
          }
        }
      } catch {
        // Scoring fetch failure is non-blocking
      }
    }

    // Archetype filtering is now done at the query level via scoring_result!inner join
    const filteredSubmissions = submissions;

    // Collect all unique archetype names from percentages for CSV columns
    const allArchetypes = new Set<string>();
    for (const s of Object.values(scoringMap)) {
      for (const key of Object.keys(s.percentages)) {
        allArchetypes.add(key);
      }
    }
    const sortedArchetypes = Array.from(allArchetypes).sort();

    // Fetch answers for all submissions with question info and per-answer metadata
    const answersMap: Record<number, Record<string, string>> = {};
    const answerMetaMap: Record<
      number,
      Record<string, { time_spent: number | null; revisions: number | null; skipped: boolean }>
    > = {};

    if (ids.length > 0) {
      const answersRes = await supabaseFetch(
        `/rest/v1/survey_submission_answer?survey_submission_id=in.(${ids.join(",")})&select=survey_submission_id,answer_text,answer_option_id,normalized_value,time_spent_seconds,revision_count,was_skipped,survey_question(frontend_qid,type),answer_option!fk_ssa_answer_option(option_text),survey_submission_answer_options(answer_option!fk_ssao_answer_option(option_text))&order=survey_question_id.asc`,
        { headers: { Range: "0-999999" } }
      );
      if (answersRes.ok) {
        const answers = (await answersRes.json()) as Array<{
          survey_submission_id: number;
          answer_text: string | null;
          answer_option_id: number | null;
          normalized_value: number | null;
          time_spent_seconds: number | null;
          revision_count: number | null;
          was_skipped: boolean | null;
          survey_question: { frontend_qid: string; type: string } | null;
          answer_option: { option_text: string } | null;
          survey_submission_answer_options: Array<{
            answer_option: { option_text: string } | null;
          }>;
        }>;
        for (const a of answers) {
          const qId = a.survey_question?.frontend_qid || "unknown";
          const type = a.survey_question?.type || "";
          let value = "";

          if (type === "scale") {
            value = a.normalized_value != null ? String(a.normalized_value) : "";
          } else if (type === "open") {
            value = a.answer_text || "";
          } else if (type === "single") {
            value = a.answer_option?.option_text || a.answer_text || "";
          } else if (type === "multiple") {
            const options = (a.survey_submission_answer_options || [])
              .map((o) => o.answer_option?.option_text)
              .filter((t): t is string => !!t);
            if (a.answer_text) options.push(a.answer_text);
            value = options.join("; ");
          } else {
            value = a.normalized_value != null ? String(a.normalized_value) : a.answer_text || "";
          }

          if (!answersMap[a.survey_submission_id]) answersMap[a.survey_submission_id] = {};
          answersMap[a.survey_submission_id][qId] = value;

          if (!answerMetaMap[a.survey_submission_id]) answerMetaMap[a.survey_submission_id] = {};
          answerMetaMap[a.survey_submission_id][qId] = {
            time_spent: a.time_spent_seconds,
            revisions: a.revision_count,
            skipped: a.was_skipped ?? false,
          };
        }
      }
    }

    // Collect all unique question IDs for headers
    const allQIds = new Set<string>();
    for (const map of Object.values(answersMap)) {
      for (const qId of Object.keys(map)) {
        allQIds.add(qId);
      }
    }
    const sortedQIds = Array.from(allQIds).sort();

    // Build CSV
    const headers = [
      "id",
      "email",
      "name",
      "status",
      "utm_source",
      "started_at",
      "completed_at",
      "duration_sec",
      "primary_archetype",
      "v5_primary_archetype",
      "engine_version",
      "scored_at",
      ...sortedArchetypes.map((a) => `pct_${a}`),
      ...sortedArchetypes.map((a) => `v5_pct_${a}`),
      ...sortedArchetypes.map((a) => `raw_${a}`),
      ...sortedQIds.flatMap((qId) => [
        qId,
        `${qId}_time_sec`,
        `${qId}_revisions`,
        `${qId}_skipped`,
      ]),
    ];
    const rows = filteredSubmissions.map((s) => {
      const answers = answersMap[s.id] || {};
      const meta = answerMetaMap[s.id] || {};
      const scoring = scoringMap[s.id];
      const durationSec = s.duration_ms != null ? Math.round(s.duration_ms / 1000) : "";
      return [
        s.id,
        s.email,
        s.first_name,
        s.status,
        s.utm_source,
        s.started_at,
        s.completed_at,
        durationSec,
        scoring?.primary_archetype || "",
        scoring?.v5_primary_archetype || "",
        scoring?.engine_version || "",
        scoring?.scored_at || "",
        ...sortedArchetypes.map((a) =>
          scoring?.percentages[a] != null ? Math.round(scoring.percentages[a] * 10) / 10 : ""
        ),
        ...sortedArchetypes.map((a) =>
          scoring?.v5_percentages?.[a] != null
            ? Math.round(scoring.v5_percentages[a] * 10) / 10
            : ""
        ),
        ...sortedArchetypes.map((a) =>
          scoring?.raw_scores[a] != null ? Math.round(scoring.raw_scores[a] * 100) / 100 : ""
        ),
        ...sortedQIds.flatMap((qId) => [
          answers[qId] || "",
          meta[qId]?.time_spent ?? "",
          meta[qId]?.revisions ?? "",
          meta[qId]?.skipped ? "yes" : "",
        ]),
      ];
    });

    const csvLines = [
      headers.map(escapeCSV).join(","),
      ...rows.map((row) => row.map((v) => escapeCSV(String(v))).join(",")),
    ];
    const csv = csvLines.join("\n");

    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="loveiq-submissions-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  } catch (err) {
    logger.error({ err }, "Admin export error");
    return NextResponse.json({ error: "Unable to export." }, { status: 500 });
  }
}

function escapeCSV(value: string): string {
  // Prevent formula injection in Excel/Sheets
  if (/^[=+\-@]/.test(value)) {
    value = "'" + value;
  }
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
