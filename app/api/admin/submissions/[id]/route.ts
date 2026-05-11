import { NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/admin/auth";
import { hasRole } from "@/lib/admin/roles";
import { logAdminAction } from "@/lib/admin/audit";
import { deleteSubmissionCascade } from "@/lib/admin/delete-submission";
import { supabaseFetch } from "@/lib/admin/supabase";
import { verifyCsrfToken } from "@/lib/csrf";
import { checkRateLimit, getClientIp } from "@/lib/ratelimit";
import logger from "@/lib/logger";

/** Extract utm_source from a JSON utm_tracker string, falling back to the raw value. */
function parseUtmSource(tracker: string | null): string | null {
  if (!tracker?.trim()) return null;
  try {
    const parsed = JSON.parse(tracker);
    return parsed.utm_source || null;
  } catch {
    return tracker.trim();
  }
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await verifyAdminSession();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!hasRole(admin.role, "viewer")) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
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
    const [submissionRes, answersRes, scoringRes, tokenRes] = await Promise.all([
      // Join with app_user to get email/name
      supabaseFetch(
        `/rest/v1/survey_submission?id=eq.${numericId}&select=id,status,session_id,start_date_time,created_date_time,duration_ms,utm_tracker,hotjar_user_id,app_user!fk_survey_submission_user(email,first_name)`
      ),
      supabaseFetch(
        `/rest/v1/survey_submission_answer?survey_submission_id=eq.${numericId}&select=id,answer_text,answer_option_id,normalized_value,answered_at,time_spent_seconds,revision_count,was_skipped,survey_question(frontend_qid,type,question),answer_option!fk_ssa_answer_option(option_text),survey_submission_answer_options(answer_option!fk_ssao_answer_option(option_text))&order=survey_question_id.asc`
      ),
      // Scoring result (may not exist)
      supabaseFetch(
        `/rest/v1/scoring_result?survey_submission_id=eq.${numericId}&select=primary_archetype,percentages,raw_scores,engine_version,scored_at,v5_primary_archetype,v5_percentages,v5_raw_scores&limit=1`
      ),
      // Report access token — most recent active. Revoked rows are filtered.
      supabaseFetch(
        `/rest/v1/report_access_token?survey_submission_id=eq.${numericId}&revoked_at=is.null&select=token,created_at&order=created_at.desc&limit=1`
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
        v5_primary_archetype: string | null;
        v5_percentages: Record<string, number> | null;
        v5_raw_scores: Record<string, number> | null;
      }>;
      if (scoringRows.length > 0) {
        scoring = scoringRows[0];
      }
    }

    const submissions = (await submissionRes.json()) as Array<{
      id: number;
      status: string;
      session_id: string | null;
      start_date_time: string | null;
      created_date_time: string;
      duration_ms: number | null;
      utm_tracker: string | null;
      hotjar_user_id: string | null;
      app_user: { email: string; first_name: string } | null;
    }>;

    if (submissions.length === 0) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }

    let reportToken: string | null = null;
    if (tokenRes?.ok) {
      const rows = (await tokenRes.json()) as Array<{ token: string }>;
      if (rows.length > 0) reportToken = rows[0]!.token;
    }

    // submissions.length checked > 0 above; [0] is non-undefined.
    const raw = submissions[0]!;
    const submission = {
      id: raw.id,
      email: raw.app_user?.email || "",
      first_name: raw.app_user?.first_name || "",
      status: raw.status,
      session_id: raw.session_id,
      started_at: raw.start_date_time || raw.created_date_time,
      completed_at: raw.created_date_time,
      duration_ms: raw.duration_ms,
      utm_source: parseUtmSource(raw.utm_tracker),
      report_token: reportToken,
      hotjar_user_id: raw.hotjar_user_id,
    };

    // Flatten answers — resolve values by question type
    const rawAnswers = (await answersRes.json()) as Array<{
      id: number;
      answer_text: string | null;
      answer_option_id: number | null;
      normalized_value: number | null;
      answered_at: string | null;
      time_spent_seconds: number | null;
      revision_count: number | null;
      was_skipped: boolean | null;
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
        if (options.length === 0 && a.answer_option?.option_text) {
          options.push(a.answer_option.option_text);
        }
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
        time_spent_seconds: a.time_spent_seconds,
        revision_count: a.revision_count,
        was_skipped: a.was_skipped ?? false,
      };
    });

    return NextResponse.json({ submission, answers, scoring });
  } catch (err) {
    logger.error({ err }, "Admin submission detail error");
    return NextResponse.json({ error: "Unable to load submission." }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await verifyAdminSession();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!hasRole(admin.role, "editor")) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const csrfValid = await verifyCsrfToken(request);
  if (!csrfValid) {
    return NextResponse.json({ error: "Invalid request." }, { status: 403 });
  }

  const ip = getClientIp(request);
  const rateLimit = await checkRateLimit(ip, {
    bucket: "admin-submission-mutate",
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
    await logAdminAction({
      admin_email: admin.email,
      action: "update_status",
      resource_type: "submission",
      resource_id: String(numericId),
      metadata: { new_status: body.status },
      ip,
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error({ err }, "Admin submission PATCH error");
    return NextResponse.json({ error: "Unable to update." }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await verifyAdminSession();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!hasRole(admin.role, "admin")) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const csrfValid = await verifyCsrfToken(request);
  if (!csrfValid) {
    return NextResponse.json({ error: "Invalid request." }, { status: 403 });
  }

  const ip = getClientIp(request);
  const rateLimit = await checkRateLimit(ip, {
    bucket: "admin-submission-mutate",
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
    const result = await deleteSubmissionCascade(numericId);
    if (!result.ok) {
      const message =
        result.reason === "personal_report_exists"
          ? "Cannot delete: a personal report exists for this submission."
          : "Unable to delete.";
      return NextResponse.json({ error: message }, { status: result.status });
    }

    logger.info({ submissionId: numericId, ip }, "Submission deleted");
    await logAdminAction({
      admin_email: admin.email,
      action: "delete_submission",
      resource_type: "submission",
      resource_id: String(numericId),
      ip,
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error({ err }, "Admin submission DELETE error");
    return NextResponse.json({ error: "Unable to delete." }, { status: 500 });
  }
}
