/**
 * Persists a small allowlist of report-engagement events to `analytics_event`
 * so the admin submission timeline can surface them. The same events are
 * still dispatched to GA4 client-side; this endpoint is the durable-storage
 * mirror.
 *
 * Strict gates:
 *   - CSRF token required (double-submit cookie)
 *   - IP rate-limited at 60/min
 *   - Only the allowlisted event_type values are accepted
 *   - The submission id is verified by lookup before insert (FK guard)
 *
 * Body: {
 *   event_type: AllowedEvent,
 *   submission_id?: number,
 *   metadata?: Record<string, unknown>,
 *   duration_ms?: number,
 * }
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyCsrfToken, verifyCsrfTokenFromBody } from "@/lib/csrf";
import { checkRateLimit, getClientIp } from "@/lib/ratelimit";
import { supabaseFetch } from "@/lib/admin/supabase";
import logger from "@/lib/logger";

const ALLOWED_EVENTS = [
  "report_viewed",
  "paywall_view",
  "price_shown",
  "begin_checkout",
  "paywall_unlocked",
  "report_engagement_1min",
  "report_engagement_5min",
  "report_engagement_10min",
] as const;

type AllowedEvent = (typeof ALLOWED_EVENTS)[number];

function entityTypeFor(event: AllowedEvent): string {
  switch (event) {
    case "report_viewed":
    case "report_engagement_1min":
    case "report_engagement_5min":
    case "report_engagement_10min":
      return "report";
    case "paywall_view":
    case "price_shown":
      return "paywall";
    case "begin_checkout":
    case "paywall_unlocked":
      return "checkout";
  }
}

const schema = z.object({
  event_type: z.enum(ALLOWED_EVENTS),
  // Required: events without a submission FK can't be surfaced in the admin
  // timeline (which is the whole point of persisting them), and writing a
  // sentinel entity_id=0 would clutter analytics_event with orphan rows.
  submission_id: z.number().int().positive(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  duration_ms: z.number().int().min(0).max(86_400_000).optional(),
  // Beacon fallback: sendBeacon() cannot set headers, so callers may include
  // the CSRF token in the body. Header is preferred when available.
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
    bucket: "analytics-event",
    limit: 60,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Rate limited." }, { status: 429 });
  }

  const { event_type, submission_id, metadata, duration_ms } = parsed.data;
  void parsed.data._csrf;

  // FK guard: ensure the submission exists. analytics_event has a real FK to
  // survey_submission and inserts with a bogus id would 409 noisily.
  const lookup = await supabaseFetch(
    `/rest/v1/survey_submission?id=eq.${submission_id}&select=id&limit=1`
  );
  if (!lookup.ok) {
    return new NextResponse(null, { status: 204 });
  }
  const rows = (await lookup.json()) as Array<{ id: number }>;
  if (rows.length === 0) {
    // Unknown submission id — silently drop. Don't tell the client whether
    // it exists.
    return new NextResponse(null, { status: 204 });
  }

  const insertRes = await supabaseFetch("/rest/v1/analytics_event", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      event_type,
      entity_type: entityTypeFor(event_type),
      // entity_id is NOT NULL bigint — pair it with the submission id so
      // entity_type:entity_id has consistent meaning across rows.
      entity_id: submission_id,
      survey_submission_id: submission_id,
      metadata: metadata ?? {},
      ...(typeof duration_ms === "number" ? { duration_ms } : {}),
    }),
  });

  if (!insertRes.ok) {
    logger.error({ status: insertRes.status, event_type }, "analytics_event insert failed");
    // Don't leak details — return 204 so the client doesn't retry endlessly.
    return new NextResponse(null, { status: 204 });
  }

  return new NextResponse(null, { status: 204 });
}
