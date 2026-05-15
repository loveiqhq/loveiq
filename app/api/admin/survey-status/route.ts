import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { verifyAdminSession } from "@features/admin/server/auth";
import { hasRole } from "@features/admin/server/roles";
import { logAdminAction } from "@features/admin/server/audit";
import { supabaseFetch } from "@features/admin/server/supabase";
import { verifyCsrfToken } from "@/lib/csrf";
import { checkRateLimit, getClientIp } from "@/lib/ratelimit";
import logger from "@/lib/logger";

function verifyClosePassword(input: string): boolean {
  const expected = process.env.SURVEY_CLOSE_PASSWORD;
  if (!expected) return false;
  if (input.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(input), Buffer.from(expected));
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
    bucket: "admin-survey-status",
    limit: 30,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Please try again later." }, { status: 429 });
  }

  try {
    const res = await supabaseFetch(`/rest/v1/survey?select=id,status&limit=1&order=id.asc`);
    if (!res.ok) {
      logger.error({ status: res.status }, "Admin survey status query failed");
      return NextResponse.json({ error: "Unable to load status." }, { status: 500 });
    }

    const rows = (await res.json()) as Array<{ id: number; status: string }>;
    const survey = rows.length > 0 ? rows[0] : null;

    if (!survey) {
      return NextResponse.json({ error: "No survey found." }, { status: 404 });
    }

    return NextResponse.json({ id: survey.id, active: survey.status === "active" });
  } catch (err) {
    logger.error({ err }, "Admin survey status error");
    return NextResponse.json({ error: "Unable to load status." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
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
    bucket: "admin-survey-status",
    limit: 10,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Please try again later." }, { status: 429 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    active?: boolean;
    closePassword?: string;
  };
  if (typeof body.active !== "boolean") {
    return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  }

  // Closing the survey requires the close password
  if (!body.active) {
    if (!body.closePassword || !verifyClosePassword(body.closePassword)) {
      return NextResponse.json({ error: "Invalid authorization password." }, { status: 403 });
    }
  }

  try {
    // Get the first survey's ID
    const getRes = await supabaseFetch(`/rest/v1/survey?select=id&limit=1&order=id.asc`);
    if (!getRes.ok) {
      return NextResponse.json({ error: "Unable to find survey." }, { status: 500 });
    }
    const surveys = (await getRes.json()) as Array<{ id: number }>;
    if (surveys.length === 0) {
      return NextResponse.json({ error: "No survey found." }, { status: 404 });
    }

    // surveys.length checked > 0 above; [0] is defined.
    const surveyId = surveys[0]!.id;
    const newStatus = body.active ? "active" : "closed";

    const res = await supabaseFetch(`/rest/v1/survey?id=eq.${surveyId}`, {
      method: "PATCH",
      body: JSON.stringify({ status: newStatus }),
      headers: { Prefer: "return=minimal" },
    });

    if (!res.ok) {
      logger.error({ status: res.status }, "Admin survey status PATCH failed");
      return NextResponse.json({ error: "Unable to update." }, { status: 500 });
    }

    logger.info({ surveyId, newStatus }, "Survey status updated");
    await logAdminAction({
      admin_email: admin.email,
      action: "toggle_survey",
      resource_type: "survey",
      resource_id: String(surveyId),
      metadata: { new_status: newStatus },
      ip,
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error({ err }, "Admin survey status PATCH error");
    return NextResponse.json({ error: "Unable to update." }, { status: 500 });
  }
}
