import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { checkRateLimit, getClientIp } from "@shared/http/ratelimit";
import { fetchWithTimeout } from "@shared/http/fetch-with-timeout";
import { getBreaker, CircuitOpenError } from "@shared/http/circuit-breaker";
import { verifyCsrfHeaderOrBody } from "@shared/http/csrf";
import logger from "@shared/observability/logger";
import {
  EMAIL_POSITION_COOKIE,
  isEmailPositionVariant,
} from "@shared/experiments/emailPositionVariant";

const eventSchema = z.object({
  sessionId: z.string().uuid(),
  qId: z.string().max(10),
  chapter: z.string().max(100),
  questionIndex: z.number().int().min(0).max(100),
  timeSpentMs: z.number().int().min(0).max(600_000),
  answered: z.boolean(),
  direction: z.enum(["forward", "back", "abandon", "complete"]),
  timestamp: z.string().datetime(),
});

const batchSchema = z.object({
  events: z.array(eventSchema).min(1).max(20),
  _csrf: z.string().optional(),
});

const RATE_LIMIT_CONFIG = {
  bucket: "survey-tracking",
  limit: 30,
  windowMs: 60_000,
};

export async function POST(request: Request) {
  // Parse body once — avoids double-read when sendBeacon falls back to body CSRF
  const body = await request.json().catch(() => ({}));

  // 1. CSRF verification — header preferred, body field fallback for sendBeacon.
  // verifyCsrfHeaderOrBody skips the per-IP storm counter when the header is
  // absent (legitimate beacon path) so genuine attacks remain the only signal.
  if (!(await verifyCsrfHeaderOrBody(request, body?._csrf))) {
    return NextResponse.json({ error: "Invalid request." }, { status: 403 });
  }

  // 2. Rate limiting
  const ip = getClientIp(request);
  const rateLimit = await checkRateLimit(ip, RATE_LIMIT_CONFIG);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Please try again later." },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil((rateLimit.resetAt.getTime() - Date.now()) / 1000)),
        },
      }
    );
  }

  // 3. Validation — reuse already-parsed body
  const parsed = batchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  // 4. Supabase insert
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    return NextResponse.json({ error: "Service unavailable." }, { status: 503 });
  }

  // Email-position A/B arm — read once and stamp every event in the batch so
  // per-question abandons (incl. the no-answer first-question bounce, the
  // headline metric) are sliceable by arm and `get_dropout_funnel` can split
  // cleanly. Only stamped when valid; pre-experiment traffic omits the column
  // (safe if the migration lags a deploy).
  let emailPositionRaw: string | undefined;
  try {
    emailPositionRaw = (await cookies()).get(EMAIL_POSITION_COOKIE)?.value;
  } catch {
    /* no request scope — no stamp */
  }
  const emailPositionStamp = isEmailPositionVariant(emailPositionRaw)
    ? { email_position: emailPositionRaw }
    : {};

  const rows = parsed.data.events.map((e) => ({
    session_id: e.sessionId,
    q_id: e.qId,
    chapter: e.chapter,
    question_index: e.questionIndex,
    time_spent_ms: e.timeSpentMs,
    answered: e.answered,
    direction: e.direction,
    client_ip: ip,
    event_time: e.timestamp,
    ...emailPositionStamp,
  }));

  try {
    const response = await getBreaker("supabase-tracking").fire(() =>
      fetchWithTimeout(`${url}/rest/v1/survey_behavior_event`, {
        method: "POST",
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify(rows),
        timeoutMs: 5000,
      })
    );

    if (!response.ok) {
      // Same posture as the catch block below — warn-not-error so Pino's
      // Slack hook doesn't page on transient Supabase blips. The circuit
      // breaker still trips and fires `circuit_open` on sustained failure.
      // Capture response body opportunistically for diagnosis when it happens.
      let respBody = "";
      try {
        if (typeof response.clone === "function") {
          respBody = await response.clone().text();
        } else if (typeof response.text === "function") {
          respBody = await response.text();
        }
      } catch {
        // Best-effort capture only.
      }
      logger.warn(
        { status: response.status, respBody: respBody.slice(0, 500) },
        "Supabase survey tracking insert non-2xx"
      );
      return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
    }
  } catch (err) {
    if (err instanceof CircuitOpenError) {
      logger.warn("Supabase-tracking circuit open");
    } else {
      // Individual fetch failures (timeouts, network blips) are expected
      // tail-end noise. Logged at warn — still searchable in structured logs,
      // but no Slack alert per-request. A genuine Supabase outage will trip
      // the supabase-tracking circuit breaker, which fires a one-shot
      // `circuit_open` Slack alert in `shared/http/circuit-breaker.ts`.
      logger.warn({ err }, "Supabase error on survey tracking");
    }
    return NextResponse.json({ error: "Service temporarily unavailable." }, { status: 503 });
  }

  return NextResponse.json({ success: true });
}
