/**
 * Admin analytics — email-position A/B (survey-email-position-ab) results.
 *
 * Returns, per arm ("first" = control, "last"), the consent-robust survey funnel
 * plus the per-question drop-off curve:
 *   - entered   — funnel_event `survey_engine_mount` rows tagged with the arm
 *                 (consent-FREE "saw the survey" denominator)
 *   - answered  — survey_partial_save rows tagged with the arm (consent-FREE;
 *                 a row means the user answered ≥1 question)
 *   - completed — completed survey_submission rows whose utm_tracker carries the
 *                 arm (`survey_email_position`)
 *   - curve     — get_dropout_funnel_by_arm: per-question drop-off % source
 *
 * Powers the "Email-position A/B" section of the admin analytics dashboard.
 * Every branch degrades gracefully (0 / empty) so one failing query never blanks
 * the whole panel.
 */

import { NextResponse } from "next/server";
import { verifyAdminSession } from "@features/admin/server/auth";
import { hasRole } from "@features/admin/server/roles";
import { supabaseFetch } from "@features/admin/server/supabase";
import { checkRateLimit, getClientIp } from "@shared/http/ratelimit";
import logger from "@shared/observability/logger";

interface CurvePoint {
  question_index: number;
  q_id: string;
  sessions: number;
}

interface ArmFunnel {
  entered: number;
  answered: number;
  completed: number;
  curve: CurvePoint[];
}

interface EmailPositionAbResponse {
  range: { since: string; days: number };
  first: ArmFunnel;
  last: ArmFunnel;
}

type Arm = "first" | "last";

/** Count rows for a PostgREST query via Prefer: count=exact (no row transfer). */
async function countRows(path: string): Promise<number> {
  try {
    const res = await supabaseFetch(path, {
      headers: { Prefer: "count=exact", Range: "0-0" },
    });
    if (!res.ok) return 0;
    return parseInt(res.headers.get("content-range")?.split("/")[1] || "0", 10);
  } catch (err) {
    logger.warn({ err, path }, "email-position-ab: count query failed (non-blocking)");
    return 0;
  }
}

/** Per-arm drop-off curve via the get_dropout_funnel_by_arm RPC. */
async function fetchCurve(sinceIso: string, untilIso: string, arm: Arm): Promise<CurvePoint[]> {
  try {
    const res = await supabaseFetch("/rest/v1/rpc/get_dropout_funnel_by_arm", {
      method: "POST",
      body: JSON.stringify({ since_ts: sinceIso, until_ts: untilIso, arm }),
    });
    if (!res.ok) return [];
    const raw = (await res.json()) as { questions?: unknown };
    if (!raw || !Array.isArray(raw.questions)) return [];
    const out: CurvePoint[] = [];
    for (const item of raw.questions) {
      if (!item || typeof item !== "object") continue;
      const r = item as Record<string, unknown>;
      const idx = Number(r.question_index);
      if (!Number.isFinite(idx)) continue;
      out.push({
        question_index: Math.trunc(idx),
        q_id: typeof r.q_id === "string" ? r.q_id : "",
        sessions: Math.max(0, Math.trunc(Number(r.sessions) || 0)),
      });
    }
    out.sort((a, b) => a.question_index - b.question_index);
    return out;
  } catch (err) {
    logger.warn({ err, arm }, "email-position-ab: curve RPC failed (non-blocking)");
    return [];
  }
}

/** Completed submissions per arm — parse the arm out of utm_tracker JSON. */
async function fetchCompletedByArm(sinceIso: string): Promise<{ first: number; last: number }> {
  const out = { first: 0, last: 0 };
  try {
    const res = await supabaseFetch(
      `/rest/v1/survey_submission?select=utm_tracker&status=eq.completed&created_date_time=gte.${sinceIso}`,
      { headers: { Range: "0-49999" } }
    );
    if (!res.ok) return out;
    const rows = (await res.json()) as Array<{ utm_tracker: string | null }>;
    for (const row of rows) {
      if (!row.utm_tracker) continue;
      try {
        const parsed = JSON.parse(row.utm_tracker) as { survey_email_position?: unknown };
        if (parsed?.survey_email_position === "first") out.first += 1;
        else if (parsed?.survey_email_position === "last") out.last += 1;
      } catch {
        /* non-JSON tracker — no arm */
      }
    }
  } catch (err) {
    logger.warn({ err }, "email-position-ab: completed-by-arm query failed (non-blocking)");
  }
  return out;
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
    bucket: "admin-email-position-ab",
    limit: 30,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Please try again later." }, { status: 429 });
  }

  const url = new URL(request.url);
  const days = parseInt(url.searchParams.get("days") || "30", 10);
  const since =
    days > 0
      ? new Date(Date.now() - days * 86_400_000).toISOString()
      : new Date("2000-01-01").toISOString();
  const untilIso = new Date().toISOString();
  const sinceDate = since.slice(0, 10); // funnel_event keys on `day` (date)

  const response: EmailPositionAbResponse = {
    range: { since, days },
    first: { entered: 0, answered: 0, completed: 0, curve: [] },
    last: { entered: 0, answered: 0, completed: 0, curve: [] },
  };

  try {
    const [
      firstEntered,
      lastEntered,
      firstAnswered,
      lastAnswered,
      completed,
      firstCurve,
      lastCurve,
    ] = await Promise.all([
      countRows(
        `/rest/v1/funnel_event?select=visitor_id&event_type=eq.survey_engine_mount&email_position=eq.first&day=gte.${sinceDate}`
      ),
      countRows(
        `/rest/v1/funnel_event?select=visitor_id&event_type=eq.survey_engine_mount&email_position=eq.last&day=gte.${sinceDate}`
      ),
      countRows(
        `/rest/v1/survey_partial_save?select=session_id&email_position=eq.first&started_at=gte.${since}`
      ),
      countRows(
        `/rest/v1/survey_partial_save?select=session_id&email_position=eq.last&started_at=gte.${since}`
      ),
      fetchCompletedByArm(since),
      fetchCurve(since, untilIso, "first"),
      fetchCurve(since, untilIso, "last"),
    ]);

    response.first = {
      entered: firstEntered,
      answered: firstAnswered,
      completed: completed.first,
      curve: firstCurve,
    };
    response.last = {
      entered: lastEntered,
      answered: lastAnswered,
      completed: completed.last,
      curve: lastCurve,
    };

    return NextResponse.json(response);
  } catch (err) {
    logger.error({ err }, "email-position-ab route fatal error");
    return NextResponse.json({ error: "Unable to load email-position A/B." }, { status: 500 });
  }
}
