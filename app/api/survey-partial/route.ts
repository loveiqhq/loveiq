import { NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit, getClientIp } from "@shared/http/ratelimit";
import { fetchWithTimeout } from "@shared/http/fetch-with-timeout";
import { getBreaker, CircuitOpenError } from "@shared/http/circuit-breaker";
import { verifyCsrfHeaderOrBody } from "@shared/http/csrf";
import logger from "@shared/observability/logger";
import { isSurveyClosed } from "@features/survey/server/server";
import { isFeatureEnabled } from "@shared/flags/system-flags";

const partialSchema = z.object({
  sessionId: z.string().uuid(),
  // Keys are question IDs (numeric, ≤~12 chars). Bound key length AND key count
  // so a body of thousands of long junk keys can't bloat the survey_partial_save
  // JSONB column (values were already bounded; keys/count were not). [Audit L1]
  answers: z
    .record(
      z.string().min(1).max(16),
      z.union([
        z.string().max(1000),
        z.array(z.string().max(500)).max(20),
        z.number().int().min(1).max(7),
      ])
    )
    .refine((obj) => Object.keys(obj).length <= 200, { message: "Too many answers" }),
  currentIndex: z.number().int().min(0).max(200),
  startedAt: z.string().datetime(),
  // 1000 (not 500) so a Google Ads click id (gclid) captured with utm params
  // fits; column is `text`, so this is only an anti-abuse bound. See utm.ts.
  utmTracker: z.string().max(1000).optional().nullable(),
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
  const parsed = partialSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  // 4. Survey-closed gate (F-04). Cached 30s. Fails open on Supabase trouble.
  // Placed after validation so malformed bodies still 400 cheaply, but before
  // the Supabase write so a paused survey doesn't accumulate orphan partials.
  if (await isSurveyClosed()) {
    return NextResponse.json({ error: "The survey is currently paused." }, { status: 409 });
  }

  // Kill switch (F-12).
  if (!(await isFeatureEnabled("survey_submissions"))) {
    return NextResponse.json({ error: "Service temporarily unavailable." }, { status: 503 });
  }

  // 5. Supabase upsert
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
      // Downgrade to WARN: the circuit-breaker absorbs sustained failures
      // and fires `circuit_open` separately, the client still gets a 5xx
      // so it surfaces in normal Vercel monitoring, and the pino->Slack
      // hook only mirrors error+fatal — keeps transient Supabase blips
      // out of #ops while preserving the page-worthy "breaker is open"
      // signal. Capture body opportunistically so root cause is visible
      // when it happens (response.clone/text may not exist on every
      // implementation, so guard defensively).
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
        "Supabase survey partial upsert non-2xx"
      );
      return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
    }
  } catch (err) {
    if (err instanceof CircuitOpenError) {
      logger.warn("Supabase-partial circuit open");
    } else {
      // Same posture as the non-2xx branch above — warn, not error.
      logger.warn({ err }, "Supabase error on survey partial save");
    }
    return NextResponse.json({ error: "Service temporarily unavailable." }, { status: 503 });
  }

  return NextResponse.json({ success: true });
}
