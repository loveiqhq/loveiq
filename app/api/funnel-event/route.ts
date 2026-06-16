/**
 * Persists top-of-funnel signals to `funnel_event` so the daily Slack digest
 * can render Unique-visitor + Saw-Q1 rows. These events fire BEFORE any
 * survey_submission exists, which is why they can't live in analytics_event
 * (NOT NULL FK to survey_submission).
 *
 * Strict gates:
 *   - CSRF token required (double-submit cookie; body fallback for beacon)
 *   - IP rate-limited at 30/min
 *   - Only the two allowed event types are accepted
 *   - PK (visitor_id, day, event_type) makes duplicates a silent no-op
 *
 * Body: {
 *   event: "unique_visitor" | "survey_engine_mount",
 *   visitor_id: uuid,
 *   utm_source?: string,
 *   _csrf?: string,  // sendBeacon fallback
 * }
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyCsrfHeaderOrBody } from "@shared/http/csrf";
import { checkRateLimit, getClientIp } from "@shared/http/ratelimit";
import { supabaseFetch } from "@features/admin/server/supabase";
import logger from "@shared/observability/logger";

// Top-of-funnel signals that all predate survey_submission, so analytics_event
// can't host them — see funnel_event migrations for the table-level CHECK
// constraint (which must list the same set):
//   • unique_visitor / survey_engine_mount      — original
//   • intro_slide_1..4                           — 2026-05-29 longitudinal digest
const ALLOWED_EVENTS = [
  "unique_visitor",
  "survey_engine_mount",
  "intro_slide_1",
  "intro_slide_2",
  "intro_slide_3",
  "intro_slide_4",
] as const;

const schema = z.object({
  event: z.enum(ALLOWED_EVENTS),
  visitor_id: z.string().uuid(),
  utm_source: z.string().max(64).optional(),
  _csrf: z.string().optional(),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  }

  if (!(await verifyCsrfHeaderOrBody(request, parsed.data._csrf))) {
    return NextResponse.json({ error: "Invalid request." }, { status: 403 });
  }

  const ip = getClientIp(request);
  const rateLimit = await checkRateLimit(ip, {
    bucket: "funnel-event",
    limit: 30,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Rate limited." }, { status: 429 });
  }

  const { event, visitor_id, utm_source } = parsed.data;
  void parsed.data._csrf;

  // PK (visitor_id, day, event_type) handles dedup — duplicates are no-ops
  // thanks to Prefer: resolution=ignore-duplicates.
  try {
    const insertRes = await supabaseFetch("/rest/v1/funnel_event", {
      method: "POST",
      headers: {
        Prefer: "return=minimal,resolution=ignore-duplicates",
      },
      body: JSON.stringify({
        visitor_id,
        day: new Date().toISOString().slice(0, 10),
        event_type: event,
        ...(utm_source ? { utm_source } : {}),
      }),
    });

    if (!insertRes.ok) {
      // Best-effort tracking route — log at WARN, not ERROR. The pino->Slack
      // hook only mirrors error/fatal, so warn keeps the signal in Vercel logs
      // for diagnosis without paging ops on every transient Supabase blip /
      // tracking-event-related condition. Capture response body so root cause
      // is visible (PostgREST returns JSON with code+message+details on 4xx).
      const respBody = await insertRes
        .clone()
        .text()
        .catch(() => "");
      logger.warn(
        { status: insertRes.status, event, respBody: respBody.slice(0, 500) },
        "funnel_event insert non-2xx"
      );
    }
  } catch (err) {
    // Network / fetch error — same posture: warn, not error. The route already
    // returns 204 to the client so this never bubbles up as user-visible.
    logger.warn({ err, event }, "funnel_event insert threw");
  }

  return new NextResponse(null, { status: 204 });
}
