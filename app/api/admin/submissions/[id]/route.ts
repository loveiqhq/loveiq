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
    const [submissionRes, answersRes] = await Promise.all([
      // Join with app_user to get email/name
      supabaseFetch(
        `/rest/v1/survey_submission?id=eq.${numericId}&select=id,status,start_date_time,created_date_time,app_user!fk_survey_submission_user(email,first_name)`
      ),
      // Join with survey_question to get frontend_qid and type
      supabaseFetch(
        `/rest/v1/survey_submission_answer?survey_submission_id=eq.${numericId}&select=id,answer_text,answer_option_id,normalized_value,answered_at,survey_question(frontend_qid,type,question)&order=survey_question_id.asc`
      ),
    ]);

    if (!submissionRes.ok || !answersRes.ok) {
      logger.error("Admin submission detail query failed");
      return NextResponse.json({ error: "Unable to load submission." }, { status: 500 });
    }

    const submissions = (await submissionRes.json()) as Array<{
      id: number;
      status: string;
      start_date_time: string | null;
      created_date_time: string;
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
    };

    // Flatten answers
    const rawAnswers = (await answersRes.json()) as Array<{
      id: number;
      answer_text: string | null;
      answer_option_id: number | null;
      normalized_value: number | null;
      answered_at: string | null;
      survey_question: { frontend_qid: string; type: string; question: string } | null;
    }>;

    const answers = rawAnswers.map((a) => ({
      q_id: a.survey_question?.frontend_qid || "",
      question_text: a.survey_question?.question || "",
      answer_type: a.survey_question?.type || "",
      answer_value: a.normalized_value ?? a.answer_text,
    }));

    return NextResponse.json({ submission, answers });
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
    // Delete answer options junction rows first
    await supabaseFetch(
      `/rest/v1/survey_submission_answer_options?survey_submission_answer_id=in.(select id from survey_submission_answer where survey_submission_id=eq.${numericId})`,
      { method: "DELETE", headers: { Prefer: "return=minimal" } }
    ).catch(() => {
      // May not exist, that's fine
    });

    // Delete answers
    const answersRes = await supabaseFetch(
      `/rest/v1/survey_submission_answer?survey_submission_id=eq.${numericId}`,
      { method: "DELETE", headers: { Prefer: "return=minimal" } }
    );

    if (!answersRes.ok) {
      logger.error("Admin: failed to delete answers for submission");
      return NextResponse.json({ error: "Unable to delete." }, { status: 500 });
    }

    // Delete submission
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
