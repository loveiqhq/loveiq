import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyAdminSession } from "@features/admin/server/auth";
import { hasRole } from "@features/admin/server/roles";
import { logAdminAction } from "@features/admin/server/audit";
import { verifyCsrfToken } from "@/lib/csrf";
import { checkRateLimit, getClientIp } from "@/lib/ratelimit";
import { supabaseFetch } from "@features/admin/server/supabase";
import logger from "@/lib/logger";
import {
  buildPartialSubmissionRecord,
  type SurveyPartialRow,
} from "@features/admin/server/survey-partials";
import type { SurveyAnswers } from "@features/survey/server/types";
import { getSurveyContactInfo } from "@features/survey/server/utils";
import {
  computeSurveyScoring,
  ensureSubmissionScored,
  submitSurveyOnce,
} from "@features/survey/server/server";

const recoverSchema = z.object({
  sessionId: z.string().uuid(),
});

export async function POST(request: Request) {
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
    bucket: "admin-submission-recover",
    limit: 20,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Please try again later." }, { status: 429 });
  }

  const parsed = recoverSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  }

  try {
    const partialRes = await supabaseFetch(
      `/rest/v1/survey_partial_save?session_id=eq.${encodeURIComponent(
        parsed.data.sessionId
      )}&select=id,session_id,answers,current_index,started_at,saved_at,utm_tracker&limit=1`
    );

    if (!partialRes.ok) {
      logger.error(
        { status: partialRes.status, sessionId: parsed.data.sessionId },
        "Partial submission recovery query failed"
      );
      return NextResponse.json({ error: "Unable to recover submission." }, { status: 500 });
    }

    const partialRows = (await partialRes.json()) as SurveyPartialRow[];
    if (partialRows.length === 0) {
      return NextResponse.json({ error: "Saved session not found." }, { status: 404 });
    }

    // partialRows.length checked > 0 above; [0] is non-undefined.
    const partial = partialRows[0]!;
    const record = buildPartialSubmissionRecord(partial);
    if (!record.recoverable) {
      return NextResponse.json(
        { error: "This saved session has not reached the final submission state." },
        { status: 409 }
      );
    }

    const answers = (partial.answers ?? {}) as SurveyAnswers;
    const { email, firstName } = getSurveyContactInfo(answers);
    if (!email) {
      return NextResponse.json(
        { error: "Saved session is missing the required email answer." },
        { status: 409 }
      );
    }

    const durationMs = partial.started_at
      ? Math.max(0, new Date(partial.saved_at).getTime() - new Date(partial.started_at).getTime())
      : 0;
    const scoringResult = computeSurveyScoring(answers);

    const { submissionId, isExisting } = await submitSurveyOnce({
      email,
      firstName,
      answers,
      startedAt: partial.started_at || partial.saved_at,
      durationMs,
      utmTracker: partial.utm_tracker,
      sessionId: partial.session_id,
    });

    const scoring = await ensureSubmissionScored(submissionId, answers, scoringResult);

    await logAdminAction({
      admin_email: admin.email,
      action: isExisting ? "recover_submission_existing" : "recover_submission",
      resource_type: "submission",
      resource_id: String(submissionId),
      metadata: {
        session_id: partial.session_id,
        primary_archetype: scoring?.primaryArchetype ?? null,
        v5_primary_archetype: scoring?.v5PrimaryArchetype ?? null,
      },
      ip,
    });

    return NextResponse.json({
      success: true,
      submissionId,
      scoring,
    });
  } catch (err) {
    logger.error({ err }, "Admin submission recovery error");
    return NextResponse.json({ error: "Unable to recover submission." }, { status: 500 });
  }
}
