import { NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/admin/auth";
import { supabaseFetch } from "@/lib/admin/supabase";
import { verifyCsrfToken } from "@/lib/csrf";
import { checkRateLimit, getClientIp } from "@/lib/ratelimit";
import logger from "@/lib/logger";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const isAdmin = await verifyAdminSession();
  if (!isAdmin) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const ip = getClientIp(request);
  const rateLimit = await checkRateLimit(ip, {
    bucket: "admin-submission-detail",
    limit: 30,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Please try again later." }, { status: 429 });
  }

  const { id } = await params;
  const numericId = parseInt(id, 10);
  if (isNaN(numericId)) {
    return NextResponse.json({ error: "Invalid ID." }, { status: 400 });
  }

  try {
    const [submissionRes, answersRes, scoringRes] = await Promise.all([
      // Join with app_user to get email/name
      supabaseFetch(
        `/rest/v1/survey_submission?id=eq.${numericId}&select=id,status,start_date_time,created_date_time,duration_ms,app_user!fk_survey_submission_user(email,first_name)`
      ),
      // Join with survey_question, answer_option (single-choice), and junction (multi-choice)
      supabaseFetch(
        `/rest/v1/survey_submission_answer?survey_submission_id=eq.${numericId}&select=id,answer_text,answer_option_id,normalized_value,answered_at,survey_question(frontend_qid,type,question),answer_option!fk_ssa_answer_option(option_text),survey_submission_answer_options(answer_option!fk_ssao_answer_option(option_text))&order=survey_question_id.asc`
      ),
      // Scoring result (may not exist)
      supabaseFetch(
        `/rest/v1/scoring_result?survey_submission_id=eq.${numericId}&select=primary_archetype,percentages,raw_scores,engine_version,scored_at&limit=1`
      ),
    ]);

    if (!submissionRes.ok || !answersRes.ok) {
      logger.error("Admin submission detail query failed");
      return NextResponse.json({ error: "Unable to load submission." }, { status: 500 });
    }

    // Parse scoring result (optional — may not exist for older submissions)
    let scoring = null;
    if (scoringRes.ok) {
      const scoringRows = (await scoringRes.json()) as Array<{
        primary_archetype: string;
        percentages: Record<string, number>;
        raw_scores: Record<string, number>;
        engine_version: string;
        scored_at: string;
      }>;
      if (scoringRows.length > 0) {
        scoring = scoringRows[0];
      }
    }

    const submissions = (await submissionRes.json()) as Array<{
      id: number;
      status: string;
      start_date_time: string | null;
      created_date_time: string;
      duration_ms: number | null;
      app_user: { email: string; first_name: string } | null;
    }>;

    if (submissions.length === 0) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }

    const raw = submissions[0];
    const submission = {
      id: raw.id,
      email: raw.app_user?.email || "",
      first_name: raw.app_user?.first_name || "",
      status: raw.status,
      started_at: raw.start_date_time || raw.created_date_time,
      completed_at: raw.created_date_time,
      duration_ms: raw.duration_ms,
    };

    // Flatten answers — resolve values by question type
    const rawAnswers = (await answersRes.json()) as Array<{
      id: number;
      answer_text: string | null;
      answer_option_id: number | null;
      normalized_value: number | null;
      answered_at: string | null;
      survey_question: { frontend_qid: string; type: string; question: string } | null;
      answer_option: { option_text: string } | null;
      survey_submission_answer_options: Array<{
        answer_option: { option_text: string } | null;
      }>;
    }>;

    const answers = rawAnswers.map((a) => {
      const type = a.survey_question?.type || "";
      let answer_value: string | string[] | number | null = null;

      if (type === "scale") {
        answer_value = a.normalized_value;
      } else if (type === "open") {
        answer_value = a.answer_text;
      } else if (type === "single") {
        answer_value = a.answer_option?.option_text || a.answer_text || null;
      } else if (type === "multiple") {
        const options = (a.survey_submission_answer_options || [])
          .map((o) => o.answer_option?.option_text)
          .filter((t): t is string => !!t);
        if (a.answer_text) options.push(a.answer_text);
        answer_value = options.length > 0 ? options : null;
      } else {
        answer_value = a.normalized_value ?? a.answer_text;
      }

      return {
        q_id: a.survey_question?.frontend_qid || "",
        question_text: a.survey_question?.question || "",
        answer_type: type,
        answer_value,
      };
    });

    return NextResponse.json({ submission, answers, scoring });
  } catch (err) {
    logger.error({ err }, "Admin submission detail error");
    return NextResponse.json({ error: "Unable to load submission." }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const isAdmin = await verifyAdminSession();
  if (!isAdmin) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const csrfValid = await verifyCsrfToken(request);
  if (!csrfValid) {
    return NextResponse.json({ error: "Invalid request." }, { status: 403 });
  }

  const { id } = await params;
  const numericId = parseInt(id, 10);
  if (isNaN(numericId)) {
    return NextResponse.json({ error: "Invalid ID." }, { status: 400 });
  }

  const body = (await request.json().catch(() => ({}))) as { status?: string };
  const validStatuses = ["completed", "flagged", "archived"];
  if (!body.status || !validStatuses.includes(body.status)) {
    return NextResponse.json({ error: "Invalid status." }, { status: 400 });
  }

  try {
    const res = await supabaseFetch(`/rest/v1/survey_submission?id=eq.${numericId}`, {
      method: "PATCH",
      body: JSON.stringify({ status: body.status }),
      headers: { Prefer: "return=minimal" },
    });

    if (!res.ok) {
      logger.error({ status: res.status }, "Admin submission PATCH failed");
      return NextResponse.json({ error: "Unable to update." }, { status: 500 });
    }

    logger.info({ submissionId: numericId, newStatus: body.status }, "Submission status updated");
    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error({ err }, "Admin submission PATCH error");
    return NextResponse.json({ error: "Unable to update." }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const isAdmin = await verifyAdminSession();
  if (!isAdmin) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const csrfValid = await verifyCsrfToken(request);
  if (!csrfValid) {
    return NextResponse.json({ error: "Invalid request." }, { status: 403 });
  }

  const { id } = await params;
  const numericId = parseInt(id, 10);
  if (isNaN(numericId)) {
    return NextResponse.json({ error: "Invalid ID." }, { status: 400 });
  }

  try {
    // Guard: block delete if personal_report exists (too valuable to cascade)
    const reportCheckRes = await supabaseFetch(
      `/rest/v1/personal_report?survey_submission_id=eq.${numericId}&select=id&limit=1`
    );
    if (reportCheckRes.ok) {
      const reports = (await reportCheckRes.json()) as Array<{ id: number }>;
      if (reports.length > 0) {
        return NextResponse.json(
          { error: "Cannot delete: a personal report exists for this submission." },
          { status: 409 }
        );
      }
    }

    // 1. Delete answer options junction rows
    await supabaseFetch(
      `/rest/v1/survey_submission_answer_options?survey_submission_answer_id=in.(select id from survey_submission_answer where survey_submission_id=eq.${numericId})`,
      { method: "DELETE", headers: { Prefer: "return=minimal" } }
    ).catch(() => {
      // May not exist, that's fine
    });

    // 2. Delete answer history rows (FK to survey_submission_answer)
    await supabaseFetch(
      `/rest/v1/survey_submission_answer_history?survey_submission_answer_id=in.(select id from survey_submission_answer where survey_submission_id=eq.${numericId})`,
      { method: "DELETE", headers: { Prefer: "return=minimal" } }
    ).catch(() => {
      // May not exist, that's fine
    });

    // 3. Delete answers
    const answersRes = await supabaseFetch(
      `/rest/v1/survey_submission_answer?survey_submission_id=eq.${numericId}`,
      { method: "DELETE", headers: { Prefer: "return=minimal" } }
    );

    if (!answersRes.ok) {
      logger.error("Admin: failed to delete answers for submission");
      return NextResponse.json({ error: "Unable to delete." }, { status: 500 });
    }

    // 4. Delete scoring result
    await supabaseFetch(`/rest/v1/scoring_result?survey_submission_id=eq.${numericId}`, {
      method: "DELETE",
      headers: { Prefer: "return=minimal" },
    }).catch(() => {
      // May not exist, that's fine
    });

    // 5. Delete analytics events referencing this submission
    await supabaseFetch(`/rest/v1/analytics_event?survey_submission_id=eq.${numericId}`, {
      method: "DELETE",
      headers: { Prefer: "return=minimal" },
    }).catch(() => {
      // May not exist, that's fine
    });

    // 6. Delete submission
    const submissionRes = await supabaseFetch(`/rest/v1/survey_submission?id=eq.${numericId}`, {
      method: "DELETE",
      headers: { Prefer: "return=minimal" },
    });

    if (!submissionRes.ok) {
      logger.error("Admin: failed to delete submission");
      return NextResponse.json({ error: "Unable to delete." }, { status: 500 });
    }

    logger.info({ submissionId: numericId }, "Submission deleted");
    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error({ err }, "Admin submission DELETE error");
    return NextResponse.json({ error: "Unable to delete." }, { status: 500 });
  }
}
