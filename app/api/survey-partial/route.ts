import { NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit, getClientIp } from "@/lib/ratelimit";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";
import { getBreaker, CircuitOpenError } from "@/lib/circuit-breaker";
import { verifyCsrfToken, verifyCsrfTokenFromBody } from "@/lib/csrf";
import logger from "@/lib/logger";

const partialSchema = z.object({
  sessionId: z.string().uuid(),
  answers: z.record(
    z.string(),
    z.union([
      z.string().max(1000),
      z.array(z.string().max(500)).max(20),
      z.number().int().min(1).max(7),
    ])
  ),
  currentIndex: z.number().int().min(0).max(200),
  startedAt: z.string().datetime(),
  utmTracker: z.string().max(500).optional().nullable(),
  _csrf: z.string().optional(),
});

const RATE_LIMIT_CONFIG = {
  bucket: "survey-partial",
  limit: 20,
  windowMs: 60_000,
};

export async function POST(request: Request) {
  // Parse body once — avoids double-read when sendBeacon falls back to body CSRF
  const body = await request.json().catch(() => ({}));

  // 1. CSRF verification — header first, then body field (for sendBeacon)
  const csrfValid = await verifyCsrfToken(request);
  if (!csrfValid) {
    const bodyValid = await verifyCsrfTokenFromBody(body?._csrf);
    if (!bodyValid) {
      return NextResponse.json({ error: "Invalid request." }, { status: 403 });
    }
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
  const parsed = partialSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  // 4. Supabase upsert
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    return NextResponse.json({ error: "Service unavailable." }, { status: 503 });
  }

  const row = {
    session_id: parsed.data.sessionId,
    answers: parsed.data.answers,
    current_index: parsed.data.currentIndex,
    started_at: parsed.data.startedAt,
    utm_tracker: parsed.data.utmTracker || null,
    client_ip: ip,
    saved_at: new Date().toISOString(),
  };

  try {
    const response = await getBreaker("supabase-partial").fire(() =>
      fetchWithTimeout(`${url}/rest/v1/survey_partial_save?on_conflict=session_id`, {
        method: "POST",
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates",
        },
        body: JSON.stringify(row),
        timeoutMs: 5000,
      })
    );

    if (!response.ok) {
      logger.error({ status: response.status }, "Supabase survey partial upsert failed");
      return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
    }
  } catch (err) {
    if (err instanceof CircuitOpenError) {
      logger.warn("Supabase-partial circuit open");
    } else {
      logger.error({ err }, "Supabase error on survey partial save");
    }
    return NextResponse.json({ error: "Service temporarily unavailable." }, { status: 503 });
  }

  return NextResponse.json({ success: true });
}
