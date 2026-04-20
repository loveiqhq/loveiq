import { NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit, getClientIp } from "@/lib/ratelimit";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";
import { getBreaker, CircuitOpenError } from "@/lib/circuit-breaker";
import { verifyCsrfToken } from "@/lib/csrf";
import logger from "@/lib/logger";

const schema = z.object({
  method: z.enum([
    "email",
    "copy_link",
    "whatsapp",
    "twitter",
    "facebook",
    "instagram",
    "sms",
    "telegram",
    "email_client",
  ]),
  referrerEmail: z.string().email().max(320).optional(),
});

const RATE_LIMIT_CONFIG = {
  bucket: "invite-tracking",
  limit: 10,
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

  // 4. Supabase insert
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    return NextResponse.json({ error: "Service unavailable." }, { status: 503 });
  }

  const row = {
    referrer_email: parsed.data.referrerEmail?.toLowerCase().trim() || null,
    invite_method: parsed.data.method,
    client_ip: ip,
  };

  try {
    const response = await getBreaker("supabase-tracking").fire(() =>
      fetchWithTimeout(`${url}/rest/v1/invite_event`, {
        method: "POST",
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify(row),
        timeoutMs: 5000,
      })
    );

    if (!response.ok) {
      logger.error({ status: response.status }, "Supabase invite tracking insert failed");
      return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
    }
  } catch (err) {
    if (err instanceof CircuitOpenError) {
      logger.warn("Supabase-tracking circuit open (invite)");
    } else {
      logger.error({ err }, "Supabase error on invite tracking");
    }
    return NextResponse.json({ error: "Service temporarily unavailable." }, { status: 503 });
  }

  return NextResponse.json({ success: true });
}
