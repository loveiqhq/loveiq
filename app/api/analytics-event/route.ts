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
import { verifyCsrfHeaderOrBody } from "@shared/http/csrf";
import { checkRateLimit, getClientIp } from "@shared/http/ratelimit";
import { supabaseFetch } from "@features/admin/server/supabase";
import logger from "@shared/observability/logger";

const ALLOWED_EVENTS = [
  // Original 8 — funnel + engagement timers
  "report_viewed",
  "paywall_view",
  "paywall_initiated",
  "price_shown",
  "begin_checkout",
  "paywall_unlocked",
  "report_engagement_1min",
  "report_engagement_5min",
  "report_engagement_10min",
  // Report-page intent + dismiss events (Phase B.1)
  "report_chapter_menu_opened",
  "paywall_dismissed",
  "scroll_paywall_dismissed",
  "lock_icon_clicked",
  "sticky_unlock_clicked",
  "report_share_opened",
  "refer_friend_opened",
  "chapter_feedback_submitted",
  // Survey + wizard funnel slot (Phase B.2)
  "wizard_slide_advanced",
  // eslint-disable-next-line no-secrets/no-secrets -- not a secret, analytics event name
  "survey_confirmation_cta_clicked",
  // Invite (Phase B.4)
  "invite_modal_dismissed",
  // Checkout return (Phase B.5)
  "checkout_return_viewed",
  "checkout_retry_clicked",
  "checkout_abandoned_return",
  // UX quality signals (Phase D)
  "scroll_depth_25",
  "scroll_depth_50",
  "scroll_depth_75",
  "scroll_depth_100",
  "rage_click",
  // Forced-paywall A/B experiment (Phase E)
  "experiment_exposure",
  "scroll_paywall_shown",
  "experiment_card_flipped",
  // Locked-chapter-card paywall surface (inline price + countdown)
  "locked_card_price_shown",
  "paywall_countdown_expired",
] as const;

type AllowedEvent = (typeof ALLOWED_EVENTS)[number];

function entityTypeFor(event: AllowedEvent): string {
  switch (event) {
    case "report_viewed":
    case "report_engagement_1min":
    case "report_engagement_5min":
    case "report_engagement_10min":
    case "report_chapter_menu_opened":
    case "report_share_opened":
    case "refer_friend_opened":
    case "chapter_feedback_submitted":
      return "report";
    case "paywall_view":
    case "paywall_initiated":
    case "price_shown":
    case "paywall_dismissed":
    case "scroll_paywall_dismissed":
    case "lock_icon_clicked":
      return "paywall";
    case "begin_checkout":
    case "paywall_unlocked":
    case "sticky_unlock_clicked":
    case "checkout_return_viewed":
    case "checkout_retry_clicked":
    case "checkout_abandoned_return":
      return "checkout";
    case "wizard_slide_advanced":
    // eslint-disable-next-line no-secrets/no-secrets -- not a secret, analytics event name
    case "survey_confirmation_cta_clicked":
      return "survey";
    case "invite_modal_dismissed":
      return "invite";
    case "scroll_depth_25":
    case "scroll_depth_50":
    case "scroll_depth_75":
    case "scroll_depth_100":
    case "rage_click":
      return "ux";
    case "scroll_paywall_shown":
    case "locked_card_price_shown":
    case "paywall_countdown_expired":
      return "paywall";
    case "experiment_exposure":
    case "experiment_card_flipped":
      return "experiment";
  }
}

const schema = z.object({
  event_type: z.enum(ALLOWED_EVENTS),
  // Required: events without a submission FK can't be surfaced in the admin
  // timeline (which is the whole point of persisting them), and writing a
  // sentinel entity_id=0 would clutter analytics_event with orphan rows.
  submission_id: z.number().int().positive(),
  // Bound size, not shape: cap key count and total serialized size so an
  // attacker can't write oversized/deeply-nested JSON into analytics_event.
  // Any reasonable flat analytics metadata stays well under these limits. [Audit L3]
  metadata: z
    .record(z.string().max(128), z.unknown())
    .refine((obj) => Object.keys(obj).length <= 50 && JSON.stringify(obj).length <= 8192, {
      message: "metadata too large",
    })
    .optional(),
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

  if (!(await verifyCsrfHeaderOrBody(request, parsed.data._csrf))) {
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

  // R-18: per-submission cap. The IP-level limit alone lets one IP spam
  // events for a SINGLE known submission_id at 60/min. Add a tighter
  // bucket keyed by (ip, submission_id) at 20/min — enough headroom for
  // legit per-page activity but stops single-target floods.
  const perSubmissionLimit = await checkRateLimit(`${ip}:${submission_id}`, {
    bucket: "analytics-event-per-submission",
    limit: 20,
    windowMs: 60_000,
  });
  if (!perSubmissionLimit.allowed) {
    return NextResponse.json({ error: "Rate limited." }, { status: 429 });
  }
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
    // warn-not-error: best-effort event capture, route already returns 204
    // regardless. Capture response body for diagnosis (PostgREST surfaces
    // code/message/details on 4xx).
    let respBody = "";
    try {
      if (typeof insertRes.clone === "function") {
        respBody = await insertRes.clone().text();
      } else if (typeof insertRes.text === "function") {
        respBody = await insertRes.text();
      }
    } catch {
      // Best-effort capture only.
    }
    logger.warn(
      { status: insertRes.status, event_type, respBody: respBody.slice(0, 500) },
      "analytics_event insert non-2xx"
    );
    // Don't leak details — return 204 so the client doesn't retry endlessly.
    return new NextResponse(null, { status: 204 });
  }

  return new NextResponse(null, { status: 204 });
}
