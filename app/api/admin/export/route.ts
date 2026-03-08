import { NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/admin/auth";
import { supabaseFetch } from "@/lib/admin/supabase";
import { checkRateLimit, getClientIp } from "@/lib/ratelimit";
import logger from "@/lib/logger";

export async function GET(request: Request) {
  const isAdmin = await verifyAdminSession();
  if (!isAdmin) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
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

  const url = new URL(request.url);
  const status = url.searchParams.get("status") || "";
  const dateFrom = url.searchParams.get("dateFrom") || "";
  const dateTo = url.searchParams.get("dateTo") || "";

  let query = `/rest/v1/survey_submission?select=id,status,start_date_time,created_date_time,duration_ms,app_user!fk_survey_submission_user(email,first_name)&order=created_date_time.desc`;
  if (status) query += `&status=eq.${encodeURIComponent(status)}`;
  if (dateFrom) query += `&start_date_time=gte.${encodeURIComponent(dateFrom)}`;
  if (dateTo) query += `&start_date_time=lte.${encodeURIComponent(dateTo)}`;

  try {
    const res = await supabaseFetch(query);
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
    }));

    // Fetch answers for all submissions with question info
    const ids = submissions.map((s) => s.id);
    const answersMap: Record<number, Record<string, string>> = {};

    if (ids.length > 0) {
      const answersRes = await supabaseFetch(
        `/rest/v1/survey_submission_answer?survey_submission_id=in.(${ids.join(",")})&select=survey_submission_id,answer_text,answer_option_id,normalized_value,survey_question(frontend_qid,type),answer_option!fk_ssa_answer_option(option_text),survey_submission_answer_options(answer_option!fk_ssao_answer_option(option_text))&order=survey_question_id.asc`
      );
      if (answersRes.ok) {
        const answers = (await answersRes.json()) as Array<{
          survey_submission_id: number;
          answer_text: string | null;
          answer_option_id: number | null;
          normalized_value: number | null;
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
      "first_name",
      "status",
      "started_at",
      "completed_at",
      "duration_sec",
      ...sortedQIds,
    ];
    const rows = submissions.map((s) => {
      const answers = answersMap[s.id] || {};
      const durationSec = s.duration_ms != null ? Math.round(s.duration_ms / 1000) : "";
      return [
        s.id,
        s.email,
        s.first_name,
        s.status,
        s.started_at,
        s.completed_at,
        durationSec,
        ...sortedQIds.map((qId) => answers[qId] || ""),
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
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
