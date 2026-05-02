import { NextResponse } from "next/server";
import { Resend } from "resend";
import { waitlistEmail } from "@/lib/emails/waitlist";
import { z } from "zod";
import { checkRateLimit, checkCooldown, getClientIp } from "@/lib/ratelimit";
import { scheduleAfterResponse } from "@/lib/after-response";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";
import { getBreaker, CircuitOpenError } from "@/lib/circuit-breaker";
import { verifyCsrfToken } from "@/lib/csrf";
import logger from "@/lib/logger";

type Payload = {
  email?: string;
  source?: string;
  firstName?: string | null;
  website?: string | null; // honeypot
  utmTracker?: string | null;
};

const tableName = "waitlist_user"; // matches Supabase table name

// Lazy initialization to avoid build-time errors when env vars are not set
let _resend: Resend | null = null;
function getResend(): Resend {
  if (!_resend) {
    _resend = new Resend(process.env.RESEND_API_KEY);
  }
  return _resend;
}

const waitlistSchema = z.object({
  email: z.string().email().max(320),
  source: z.string().max(120).optional(),
  firstName: z.string().max(80).optional().nullable(),
  website: z.string().max(0).optional().nullable(), // honeypot must be empty
  utmTracker: z.string().max(500).optional().nullable(),
});

const RESEND_TIMEOUT_MS = 8_000;

// Rate limit configuration
const RATE_LIMIT_CONFIG = {
  bucket: "waitlist",
  limit: 5,
  windowMs: 60_000, // 1 minute
};

const EMAIL_COOLDOWN_MS = 60_000; // 1 minute per email
async function sendConfirmationEmail(to: string, firstName: string | null) {
  const from = process.env.RESEND_FROM || "LoveIQ <hello@send.loveiq.org>";
  const replyTo = process.env.RESEND_REPLY_TO || "hello@loveiq.org";
  const tpl = waitlistEmail({ firstName });

  try {
    const { error } = await Promise.race([
      getResend().emails.send({
        from,
        to,
        replyTo,
        subject: tpl.subject,
        html: tpl.html,
        text: tpl.text,
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Resend timeout")), RESEND_TIMEOUT_MS)
      ),
    ]);
    if (error) {
      logger.error({ error }, "Waitlist confirmation email failed");
    }
  } catch (err) {
    logger.error({ err }, "Waitlist confirmation email error or timeout");
  }
}

const notifySlackWaitlist = async ({
  email,
  firstName,
  source,
  utmSource,
}: {
  email: string;
  firstName?: string | null;
  source?: string | null;
  utmSource?: string | null;
}) => {
  const url = process.env.SLACK_WAITLIST_WEBHOOK_URL;

  if (!url) {
    logger.warn("Slack webhook missing: set SLACK_WAITLIST_WEBHOOK_URL to enable waitlist alerts.");
    return;
  }

  // Mask to avoid sending full PII to Slack
  const maskedEmail = email.replace(/^(.).+(@.+)$/, "$1***$2");
  const text = `New waitlist signup: ${firstName ? `*${firstName}* ` : ""}${maskedEmail}${source ? ` (source: ${source})` : ""}${utmSource ? ` [utm: ${utmSource}]` : ""}`;

  try {
    logger.info({ maskedEmail, source: source || "n/a" }, "Sending Slack waitlist notification");
    const res = await fetchWithTimeout(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, username: "waitlist_signup" }),
      timeoutMs: 5000, // 5 second timeout
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      logger.error({ status: res.status, body }, "Slack webhook failed");
    } else {
      logger.info({ status: res.status }, "Slack webhook sent");
    }
  } catch (err) {
    logger.error({ err }, "Slack webhook error");
  }
};

export async function POST(request: Request) {
  const routeStart = Date.now();

  // Verify CSRF token
  const csrfValid = await verifyCsrfToken(request);
  if (!csrfValid) {
    return NextResponse.json({ error: "Invalid request." }, { status: 403 });
  }

  const ip = getClientIp(request);

  // Check IP-based rate limit (persistent across restarts)
  const rateLimitStart = Date.now();
  const rateLimit = await checkRateLimit(ip, RATE_LIMIT_CONFIG);
  logger.info({ duration_ms: Date.now() - rateLimitStart }, "waitlist: rateLimit check");
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

  const parsed = waitlistSchema.safeParse(await request.json().catch(() => ({}) as Payload));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const { email, source, firstName, website, utmTracker } = parsed.data;
  const normalizedEmail = email.trim().toLowerCase();
  const normalizedFirstName = firstName?.trim() || null;

  if (website) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    return NextResponse.json({ error: "Service unavailable." }, { status: 503 });
  }

  // Run cooldown check and duplicate check in parallel to reduce latency
  // (these are independent reads that don't depend on each other)
  let cooldown: { allowed: boolean; retryAfterMs: number };
  let existingRes: Response;
  const parallelStart = Date.now();
  try {
    [cooldown, existingRes] = await Promise.all([
      checkCooldown(normalizedEmail, "waitlist-email", EMAIL_COOLDOWN_MS),
      getBreaker("supabase-crud").fire(() =>
        fetchWithTimeout(
          `${url}/rest/v1/${tableName}?email=eq.${encodeURIComponent(normalizedEmail)}&select=id&limit=1`,
          {
            headers: {
              apikey: serviceRoleKey,
              Authorization: `Bearer ${serviceRoleKey}`,
            },
            cache: "no-store",
            timeoutMs: 3000,
          }
        )
      ),
    ]);
  } catch (err) {
    if (err instanceof CircuitOpenError) {
      logger.warn("Supabase circuit open on waitlist cooldown/duplicate check");
    } else {
      logger.error({ err }, "Supabase error on waitlist cooldown/duplicate check");
    }
    return NextResponse.json({ error: "Service temporarily unavailable." }, { status: 503 });
  }
  logger.info(
    { duration_ms: Date.now() - parallelStart },
    "waitlist: cooldown+duplicate check (parallel)"
  );

  if (!cooldown.allowed) {
    return NextResponse.json(
      { error: "Please wait before retrying." },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil(cooldown.retryAfterMs / 1000)) },
      }
    );
  }

  // Parse UTM tracker JSON safely for JSONB storage
  let parsedUtm: Record<string, string> | null = null;
  if (utmTracker) {
    try {
      parsedUtm = JSON.parse(utmTracker);
    } catch {
      // Malformed UTM JSON — store null
    }
  }

  if (!existingRes.ok) {
    return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
  }

  const existing = (await existingRes.json()) as Array<{ id: string }>;
  if (Array.isArray(existing) && existing.length > 0) {
    return NextResponse.json({ success: true, already: true });
  }

  const insertPayload = {
    email: normalizedEmail,
    source: source?.trim() || "landing-modal",
    created_date_time: new Date().toISOString(),
    ...(parsedUtm && { utm_tracker: parsedUtm }),
  };

  let response: Response;
  const insertStart = Date.now();
  try {
    response = await getBreaker("supabase-crud").fire(() =>
      fetchWithTimeout(`${url}/rest/v1/${tableName}`, {
        method: "POST",
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
          "Content-Type": "application/json",
          Prefer: "return=representation",
        },
        body: JSON.stringify(insertPayload),
        timeoutMs: 3000, // fits within Vercel free plan 10s limit
      })
    );
  } catch (err) {
    if (err instanceof CircuitOpenError) {
      logger.warn("Supabase circuit open on waitlist insert");
    } else {
      logger.error({ err }, "Supabase error on waitlist insert");
    }
    return NextResponse.json({ error: "Service temporarily unavailable." }, { status: 503 });
  }

  logger.info({ duration_ms: Date.now() - insertStart }, "waitlist: supabase insert");

  if (!response.ok) {
    // 409 = UNIQUE constraint violation: a concurrent request inserted the same email
    // a split-second before us. Treat as success — the record is in the DB.
    if (response.status === 409) {
      return NextResponse.json({ success: true, already: true });
    }
    return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
  }

  logger.info({ duration_ms: Date.now() - routeStart }, "waitlist: total route duration");

  // DB insert succeeded — return success immediately.
  // Email and Slack run after the response so the serverless function stays
  // alive until they finish, but a failure never blocks or fails the response.
  scheduleAfterResponse("waitlist-confirmation-email", () =>
    sendConfirmationEmail(normalizedEmail, normalizedFirstName)
  );
  scheduleAfterResponse("waitlist-slack-notification", () =>
    notifySlackWaitlist({
      email: normalizedEmail,
      firstName: normalizedFirstName,
      source,
      utmSource: parsedUtm?.utm_source ?? null,
    })
  );

  return NextResponse.json({ success: true });
}
