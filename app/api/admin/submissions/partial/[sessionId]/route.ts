import { NextResponse } from "next/server";
import { verifyAdminSession } from "@features/admin/server/auth";
import { hasRole } from "@features/admin/server/roles";
import { checkRateLimit, getClientIp } from "@/lib/ratelimit";
import { supabaseFetch } from "@features/admin/server/supabase";
import logger from "@/lib/logger";
import {
  buildPartialAnswerDetails,
  buildPartialSubmissionRecord,
  type SurveyPartialRow,
} from "@features/admin/server/survey-partials";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const admin = await verifyAdminSession();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!hasRole(admin.role, "viewer")) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const ip = getClientIp(request);
  const rateLimit = await checkRateLimit(ip, {
    bucket: "admin-partial-submission-detail",
    limit: 30,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Please try again later." }, { status: 429 });
  }

  const { sessionId } = await params;
  if (!sessionId) {
    return NextResponse.json({ error: "Invalid session ID." }, { status: 400 });
  }

  try {
    const response = await supabaseFetch(
      `/rest/v1/survey_partial_save?session_id=eq.${encodeURIComponent(
        sessionId
      )}&select=id,session_id,answers,current_index,started_at,saved_at,utm_tracker&limit=1`
    );

    if (!response.ok) {
      logger.error(
        { status: response.status, sessionId },
        "Partial submission detail query failed"
      );
      return NextResponse.json({ error: "Unable to load submission." }, { status: 500 });
    }

    const rows = (await response.json()) as SurveyPartialRow[];
    if (rows.length === 0) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }

    // rows.length checked > 0 above; [0] is defined.
    const submission = buildPartialSubmissionRecord(rows[0]!);
    const answers = buildPartialAnswerDetails(rows[0]!.answers);

    return NextResponse.json({
      submission,
      answers,
      scoring: null,
    });
  } catch (err) {
    logger.error({ err, sessionId }, "Admin partial submission detail error");
    return NextResponse.json({ error: "Unable to load submission." }, { status: 500 });
  }
}
