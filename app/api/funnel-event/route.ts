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
import { verifyCsrfToken, verifyCsrfTokenFromBody } from "@shared/http/csrf";
import { checkRateLimit, getClientIp } from "@shared/http/ratelimit";
import { supabaseFetch } from "@features/admin/server/supabase";
import logger from "@shared/observability/logger";

const ALLOWED_EVENTS = ["unique_visitor", "survey_engine_mount"] as const;

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

  const headerCsrfValid = await verifyCsrfToken(request);
  const bodyCsrfValid = !headerCsrfValid && (await verifyCsrfTokenFromBody(parsed.data._csrf));
  if (!headerCsrfValid && !bodyCsrfValid) {
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
      logger.error({ status: insertRes.status, event }, "funnel_event insert failed");
    }
  } catch (err) {
    // Network / fetch error — log but don't surface the failure to the client.
    // Tracking pings are best-effort; failing 500 here would just create noise.
    logger.error({ err, event }, "funnel_event insert threw");
  }

  return new NextResponse(null, { status: 204 });
}
