import { NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit, getClientIp } from "@/lib/ratelimit";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";
import { getBreaker, CircuitOpenError } from "@/lib/circuit-breaker";
import { verifyCsrfToken } from "@/lib/csrf";
import logger from "@/lib/logger";

const schema = z.object({
  sessionId: z.string().uuid(),
  sectionId: z.string().min(1).max(100),
  feedback: z.enum(["up", "down"]),
  comment: z.string().max(1000).optional(),
  issue: z.string().max(100).optional(),
});

const RATE_LIMIT_CONFIG = {
  bucket: "report-feedback",
  limit: 60,
  windowMs: 60_000,
};

export async function POST(request: Request) {
  // 1. CSRF verification
  if (!(await verifyCsrfToken(request))) {
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

  // 3. Validation
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  // 4. Supabase upsert
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    return NextResponse.json({ error: "Service unavailable." }, { status: 503 });
  }

  const row: Record<string, string> = {
    session_id: parsed.data.sessionId,
    section_id: parsed.data.sectionId,
    feedback: parsed.data.feedback,
  };
  if (parsed.data.comment) row.comment = parsed.data.comment;
  if (parsed.data.issue) row.issue = parsed.data.issue;

  try {
    const response = await getBreaker("supabase-tracking").fire(() =>
      fetchWithTimeout(`${url}/rest/v1/report_section_feedback`, {
        method: "POST",
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates,return=minimal",
        },
        body: JSON.stringify(row),
        timeoutMs: 5000,
      })
    );

    if (!response.ok) {
      logger.error({ status: response.status }, "Supabase report feedback upsert failed");
      return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
    }
  } catch (err) {
    if (err instanceof CircuitOpenError) {
      logger.warn("Supabase-tracking circuit open (report-feedback)");
    } else {
      logger.error({ err }, "Supabase error on report feedback");
    }
    return NextResponse.json({ error: "Service temporarily unavailable." }, { status: 503 });
  }

  return NextResponse.json({ success: true });
}
