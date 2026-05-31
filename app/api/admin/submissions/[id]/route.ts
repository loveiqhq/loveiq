import { NextResponse } from "next/server";
import { verifyAdminSession } from "@features/admin/server/auth";
import { hasRole } from "@features/admin/server/roles";
import { logAdminAction } from "@features/admin/server/audit";
import { deleteSubmissionCascade } from "@features/admin/server/delete-submission";
import { supabaseFetch } from "@features/admin/server/supabase";
import { verifyCsrfToken } from "@shared/http/csrf";
import { checkRateLimit, getClientIp } from "@shared/http/ratelimit";
import logger from "@shared/observability/logger";

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
      // Join with app_user to get email/name. updated_date_time is included
      // so the UI can echo it back on PATCH for optimistic-lock enforcement (F-05).
      supabaseFetch(
        `/rest/v1/survey_submission?id=eq.${numericId}&select=id,status,session_id,start_date_time,created_date_time,updated_date_time,duration_ms,utm_tracker,hotjar_user_id,app_user!fk_survey_submission_user(email,first_name)`
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
      updated_date_time: string | null;
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
      updated_at: raw.updated_date_time,
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

  const body = (await request.json().catch(() => ({}))) as {
    status?: string;
    first_name?: string;
    email?: string;
    expected_updated_at?: string;
  };

  const validStatuses = ["completed", "flagged", "archived"];
  const wantsStatusChange = body.status !== undefined;
  const wantsFirstNameChange = typeof body.first_name === "string";
  const wantsEmailChange = typeof body.email === "string";

  // T-08: admin PATCH now supports first_name + email rectification (GDPR
  // Art. 16 right to correction) in addition to status. At least one
  // mutable field must be provided; status validation still applies when set.
  if (!wantsStatusChange && !wantsFirstNameChange && !wantsEmailChange) {
    return NextResponse.json(
      { error: "Provide at least one of: status, first_name, email." },
      { status: 400 }
    );
  }
  if (wantsStatusChange && !validStatuses.includes(body.status!)) {
    return NextResponse.json({ error: "Invalid status." }, { status: 400 });
  }

  // Email validation + normalization. Mirror normalizeEmail from F-01.
  let normalizedEmail: string | null = null;
  if (wantsEmailChange) {
    const trimmed = (body.email ?? "").trim().toLowerCase();
    const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!EMAIL_RE.test(trimmed) || trimmed.length > 320) {
      return NextResponse.json({ error: "Invalid email." }, { status: 400 });
    }
    normalizedEmail = trimmed;
  }

  // first_name validation: trim, allow empty (admin may want to clear it),
  // cap at the same 80-char limit the survey schema enforces.
  let normalizedFirstName: string | null = null;
  if (wantsFirstNameChange) {
    const trimmed = (body.first_name ?? "").trim();
    if (trimmed.length > 80) {
      return NextResponse.json({ error: "first_name too long." }, { status: 400 });
    }
    normalizedFirstName = trimmed;
  }

  if (!body.expected_updated_at) {
    // F-05: client must include the timestamp returned by GET. Forces a fresh
    // load if another admin already changed the row.
    return NextResponse.json(
      { error: "expected_updated_at is required for concurrency control." },
      { status: 400 }
    );
  }

  try {
    // F-05: Optimistic lock on survey_submission. We always bump
    // updated_date_time even when the only mutation targets app_user — the
    // submission row IS the audit-anchor for any rectification.
    const expected = body.expected_updated_at;
    const submissionPatchBody: Record<string, unknown> = {
      updated_date_time: new Date().toISOString(),
    };
    if (wantsStatusChange) submissionPatchBody.status = body.status;

    const res = await supabaseFetch(
      `/rest/v1/survey_submission?id=eq.${numericId}&updated_date_time=eq.${encodeURIComponent(expected)}&select=id,updated_date_time,user_id`,
      {
        method: "PATCH",
        body: JSON.stringify(submissionPatchBody),
        headers: { Prefer: "return=representation" },
      }
    );

    if (!res.ok) {
      logger.error({ status: res.status }, "Admin submission PATCH failed");
      return NextResponse.json({ error: "Unable to update." }, { status: 500 });
    }

    const updatedRows = (await res.json()) as Array<{
      id: number;
      updated_date_time: string;
      user_id: number | null;
    }>;
    if (updatedRows.length === 0) {
      // Mismatch — fetch the current row so the client can reconcile.
      const currentRes = await supabaseFetch(
        `/rest/v1/survey_submission?id=eq.${numericId}&select=updated_date_time,status&limit=1`
      );
      const current = currentRes.ok
        ? ((await currentRes.json()) as Array<{ updated_date_time: string; status: string }>)
        : [];
      return NextResponse.json(
        {
          error: "Submission has been modified by another admin.",
          current: current[0] ?? null,
        },
        { status: 409 }
      );
    }

    // T-08: rectification on app_user if requested. The submission row was
    // already locked via the optimistic check above, so a parallel admin
    // editing the same submission would have been rejected with 409. The
    // app_user write is a separate row but logically owned by THIS
    // submission's rectification request.
    const userId = updatedRows[0]!.user_id;
    if ((wantsFirstNameChange || wantsEmailChange) && userId !== null) {
      // Email collision check: another app_user must not already hold this email.
      if (wantsEmailChange && normalizedEmail !== null) {
        const collisionRes = await supabaseFetch(
          `/rest/v1/app_user?email=eq.${encodeURIComponent(normalizedEmail)}&select=id&limit=1`
        );
        if (collisionRes.ok) {
          const collisions = (await collisionRes.json()) as Array<{ id: number }>;
          const colliding = collisions[0];
          if (colliding && colliding.id !== userId) {
            return NextResponse.json(
              { error: "Another user already has that email." },
              { status: 409 }
            );
          }
        }
      }

      const appUserPatchBody: Record<string, unknown> = {
        updated_date_time: new Date().toISOString(),
      };
      if (wantsFirstNameChange) appUserPatchBody.first_name = normalizedFirstName;
      if (wantsEmailChange) appUserPatchBody.email = normalizedEmail;

      const userPatchRes = await supabaseFetch(`/rest/v1/app_user?id=eq.${userId}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify(appUserPatchBody),
      });
      if (!userPatchRes.ok) {
        logger.error(
          { status: userPatchRes.status, userId },
          "T-08: app_user rectification PATCH failed"
        );
        // The submission was already touched (status bumped) — we can't
        // cleanly roll back, but we surface the partial-success error so
        // ops sees what happened.
        return NextResponse.json(
          { error: "Submission updated but user-data rectification failed." },
          { status: 500 }
        );
      }
    }

    // Audit log: one row per kind of change. Keeps the trail readable.
    if (wantsStatusChange) {
      await logAdminAction({
        admin_email: admin.email,
        action: "update_status",
        resource_type: "submission",
        resource_id: String(numericId),
        metadata: { new_status: body.status },
        ip,
      });
    }
    if (wantsFirstNameChange || wantsEmailChange) {
      await logAdminAction({
        admin_email: admin.email,
        action: "rectify_user_data",
        resource_type: "submission",
        resource_id: String(numericId),
        metadata: {
          first_name_changed: wantsFirstNameChange,
          email_changed: wantsEmailChange,
        },
        ip,
      });
    }

    logger.info(
      {
        submissionId: numericId,
        newStatus: body.status,
        rectified: wantsFirstNameChange || wantsEmailChange,
      },
      "Submission updated"
    );
    return NextResponse.json({ success: true, updated_at: updatedRows[0]!.updated_date_time });
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
