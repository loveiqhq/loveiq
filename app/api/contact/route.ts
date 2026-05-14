import { NextResponse } from "next/server";
import { Resend } from "resend";
import { z } from "zod";
import { checkRateLimit, getClientIp } from "@/lib/ratelimit";
import { scheduleAfterResponse } from "@/lib/after-response";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";
import { getBreaker, CircuitOpenError } from "@/lib/circuit-breaker";
import { verifyCsrfToken } from "@/lib/csrf";
import logger from "@/lib/logger";

const RESEND_TIMEOUT_MS = 5_000;

// Lazy initialization to avoid build-time errors when env vars are not set
let _resend: Resend | null = null;
function getResend(): Resend {
  if (!_resend) {
    _resend = new Resend(process.env.RESEND_API_KEY);
  }
  return _resend;
}

const recaptchaSecret = process.env.RECAPTCHA_SECRET_KEY;
const contactToEmail = process.env.CONTACT_TO_EMAIL;
const slackContactWebhook = process.env.SLACK_CONTACT_WEBHOOK_URL;

// Rate limit configuration
const RATE_LIMIT_CONFIG = {
  bucket: "contact",
  limit: 5,
  windowMs: 60_000, // 1 minute
};

const contactSchema = z.object({
  firstName: z.string().trim().min(1).max(120),
  lastName: z.string().trim().min(1).max(120),
  phone: z.string().trim().min(4).max(40),
  email: z.string().trim().email().max(320),
  message: z.string().trim().min(10).max(1000),
  captcha: z.string().min(10),
});

const verifyCaptcha = async (token: string, ip: string) => {
  if (!recaptchaSecret) {
    logger.error("Missing RECAPTCHA_SECRET_KEY");
    return false;
  }

  try {
    const params = new URLSearchParams();
    params.set("secret", recaptchaSecret);
    params.set("response", token);
    if (ip) params.set("remoteip", ip);

    const res = await getBreaker("recaptcha").fire(() =>
      fetchWithTimeout("https://www.google.com/recaptcha/api/siteverify", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
        cache: "no-store",
        // 5s: gives APAC / high-latency mobile users real headroom. The
        // Google siteverify endpoint is US-hosted so non-US RTT is 150–400ms.
        // The previous 3s caused legitimate APAC submissions to hit timeout
        // and trip the circuit breaker, which fails open — degrading the
        // security posture rather than the UX. Budget: ratelimit ~10ms +
        // captcha 5s + resend 5s + retry (1s + 5s) ≈ 16s worst-case. Stays
        // under Vercel function default (60s) but exceeds Hobby (10s) only
        // on a triple-failure path.
        timeoutMs: 5000,
      })
    );

    if (!res.ok) {
      logger.error({ status: res.status }, "reCAPTCHA verify failed");
      return false;
    }

    const json = (await res.json()) as { success?: boolean };
    return Boolean(json.success);
  } catch (err) {
    if (err instanceof CircuitOpenError) {
      // reCAPTCHA has been failing for N consecutive requests — the circuit is open.
      // Fail open so a Google outage doesn't block all legitimate contact submissions.
      logger.warn({ err }, "reCAPTCHA circuit open — allowing contact submission (fail-open)");
      return true;
    }
    logger.error({ err }, "reCAPTCHA verify error");
    return false;
  }
};

const sendSlackContactNotification = async (payload: {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  message: string;
}) => {
  const webhookUrl = slackContactWebhook;
  if (!webhookUrl) {
    logger.warn("Slack contact webhook missing: SLACK_CONTACT_WEBHOOK_URL");
    return;
  }

  // Mask PII to avoid sending full details to Slack
  const maskedEmail = payload.email.replace(/^(.).+(@.+)$/, "$1***$2");
  const maskedPhone = payload.phone
    ? payload.phone.length > 6
      ? payload.phone.slice(0, 3) + "***" + payload.phone.slice(-2)
      : "***"
    : null;

  // Truncate message to prevent overly long Slack messages
  const truncatedMessage =
    payload.message.length > 200 ? payload.message.slice(0, 200) + "..." : payload.message;

  // Escape special Slack markdown characters in user content
  const escapeSlack = (s: string) => s.replace(/[&<>*_~`]/g, (c) => `\\${c}`);

  const text =
    `📩 *New contact request*\n` +
    `• *Name:* ${escapeSlack(payload.firstName)} ${escapeSlack(payload.lastName)}\n` +
    `• *Email:* ${maskedEmail}\n` +
    (maskedPhone ? `• *Phone:* ${maskedPhone}\n` : "") +
    `• *Message:* ${escapeSlack(truncatedMessage)}`;

  try {
    const res = await fetchWithTimeout(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
      timeoutMs: 5000, // 5 second timeout
    });
    const body = await res.text();
    if (!res.ok) {
      logger.error({ status: res.status, body }, "Slack contact webhook failed");
    } else {
      logger.info({ status: res.status }, "Slack contact webhook sent");
    }
  } catch (err) {
    logger.error({ err }, "Slack contact webhook error");
  }
};

export async function POST(request: Request) {
  const routeStart = Date.now();
  // Server-Timing stage timestamps. Markers ship in the success response so
  // engineers can read per-stage durations from DevTools Network → Timing.
  const tStart = performance.now();

  // Verify CSRF token
  const csrfValid = await verifyCsrfToken(request);
  if (!csrfValid) {
    return NextResponse.json({ error: "Invalid request." }, { status: 403 });
  }

  // Validate required config
  if (!contactToEmail) {
    logger.error("Missing CONTACT_TO_EMAIL environment variable");
    return NextResponse.json({ error: "Service unavailable." }, { status: 503 });
  }

  const ip = getClientIp(request);

  // Check IP-based rate limit (persistent across restarts)
  const rateLimitStart = Date.now();
  const rateLimit = await checkRateLimit(ip, RATE_LIMIT_CONFIG);
  logger.info({ duration_ms: Date.now() - rateLimitStart }, "contact: rateLimit check");
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

  const parsed = contactSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  }

  const { firstName, lastName, phone, email, message, captcha } = parsed.data;

  // End of gate (CSRF + rate limit + parse). Captcha begins next.
  const tGate = performance.now();

  const captchaStart = Date.now();
  const captchaOk = await verifyCaptcha(captcha, ip);
  logger.info({ duration_ms: Date.now() - captchaStart }, "contact: reCAPTCHA verify");
  if (!captchaOk) {
    return NextResponse.json({ error: "Captcha failed. Please try again." }, { status: 400 });
  }
  const tCaptcha = performance.now();

  // Strip CRLF / null bytes from any field that flows into an email header.
  // Resend likely sanitizes internally, but defense-in-depth at the app
  // layer prevents accidental regression if the SDK changes. The Subject
  // header is the highest-risk vector — newline-injection there can spawn
  // additional headers (Bcc, Cc) under permissive mailers.
  function stripHeaderUnsafe(value: string): string {
    return value.replace(/[\r\n\0]/g, "").trim();
  }

  const sanitizedReplyTo = stripHeaderUnsafe(email);
  if (sanitizedReplyTo !== email.trim()) {
    logger.warn("Potential header injection attempt in email");
    return NextResponse.json({ error: "Invalid email format." }, { status: 400 });
  }

  const sanitizedFirstName = stripHeaderUnsafe(firstName);
  const sanitizedLastName = stripHeaderUnsafe(lastName);
  const sanitizedPhone = stripHeaderUnsafe(phone);
  if (
    sanitizedFirstName !== firstName.trim() ||
    sanitizedLastName !== lastName.trim() ||
    sanitizedPhone !== phone.trim()
  ) {
    logger.warn("Potential header injection attempt in name/phone field");
    return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  }

  const from = process.env.RESEND_FROM || "LoveIQ <hello@send.loveiq.org>";

  const sendEmail = () =>
    Promise.race([
      getResend().emails.send({
        from,
        to: contactToEmail!,
        replyTo: sanitizedReplyTo,
        subject: `New contact request from ${sanitizedFirstName} ${sanitizedLastName}`,
        text: [
          `Name: ${sanitizedFirstName} ${sanitizedLastName}`,
          `Email: ${sanitizedReplyTo}`,
          `Phone: ${sanitizedPhone}`,
          "",
          message,
        ].join("\n"),
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Resend timeout")), RESEND_TIMEOUT_MS)
      ),
    ]);

  const resendStart = Date.now();
  try {
    await sendEmail();
  } catch (firstErr) {
    // One retry with 1s backoff for transient failures
    logger.warn({ err: firstErr }, "Contact email first attempt failed, retrying");
    try {
      await new Promise((r) => setTimeout(r, 1000));
      await sendEmail();
    } catch (retryErr) {
      logger.error({ err: retryErr }, "Contact email retry also failed");
      return NextResponse.json(
        { error: "Unable to send message. Please try later." },
        { status: 500 }
      );
    }
  }

  logger.info({ duration_ms: Date.now() - resendStart }, "contact: resend email");
  logger.info({ duration_ms: Date.now() - routeStart }, "contact: total route duration");

  // End of user-blocking work. Slack notification runs post-response.
  const tEmail = performance.now();

  // Slack runs after the response — keeps the function alive but never blocks it
  scheduleAfterResponse("contact-slack-notification", () =>
    sendSlackContactNotification({ firstName, lastName, email, phone, message })
  );

  // Per-stage timing in Server-Timing format. Header name is X-Server-Timing
  // rather than Server-Timing because Vercel's edge strips Server-Timing from
  // Function responses (see vercel/next.js#12382, discussion #62353). Visible
  // in DevTools Network → Headers → Response Headers.
  const serverTiming = [
    `gate;dur=${(tGate - tStart).toFixed(1)}`,
    `captcha;dur=${(tCaptcha - tGate).toFixed(1)}`,
    `email;dur=${(tEmail - tCaptcha).toFixed(1)}`,
  ].join(", ");

  return NextResponse.json({ success: true }, { headers: { "X-Server-Timing": serverTiming } });
}
