import { NextResponse } from "next/server";
import { Resend } from "resend";
import { verifyCsrfToken } from "@shared/http/csrf";
import { checkRateLimit, getClientIp } from "@shared/http/ratelimit";
import { supabaseFetch } from "@features/admin/server/supabase";
import { adminMagicLinkEmail } from "@features/admin/server/emails/admin-magic-link";
import logger from "@shared/observability/logger";
import { z } from "zod";

let _resend: Resend | null = null;
function getResend(): Resend {
  if (!_resend) {
    _resend = new Resend(process.env.RESEND_API_KEY);
  }
  return _resend;
}

const schema = z.object({
  email: z
    .string()
    .email()
    .max(320)
    .transform((e) => e.toLowerCase().trim()),
});

export async function POST(request: Request) {
  // 1. CSRF
  if (!(await verifyCsrfToken(request))) {
    return NextResponse.json({ error: "Invalid request." }, { status: 403 });
  }

  // 2. Rate limit
  const ip = getClientIp(request);
  const rateLimit = await checkRateLimit(ip, {
    bucket: "admin-login",
    limit: 5,
    windowMs: 60_000,
  });
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

  // 3. Validate
  const body = await request.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid email." }, { status: 400 });
  }

  const { email } = parsed.data;

  // 4. Check admin_users (silent fail — don't reveal allowlist).
  // Capture allowlist match in a flag so we can keep the response shape AND
  // overall latency identical for both branches below — preventing email
  // enumeration via timing side-channel.
  let isAllowlisted = false;
  try {
    const res = await supabaseFetch(
      `/rest/v1/admin_users?email=eq.${encodeURIComponent(email)}&select=email&limit=1`
    );
    const admins = await res.json();
    isAllowlisted = res.ok && Array.isArray(admins) && admins.length > 0;
  } catch {
    logger.error({ ip, email }, "Admin login: failed to check admin_users");
    return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
  }

  if (!isAllowlisted) {
    logger.info({ ip, email }, "Admin login attempt: email not in allowlist");
    // Burn ~600-1200ms so the response timing is in the same order of
    // magnitude as the allowlisted branch (which spends ~1-3s waiting on
    // Resend). A constant-time difference of 2-5x is much harder to
    // exploit than the previous ~50ms vs 5s gap.
    const jitter = 600 + Math.floor(Math.random() * 600);
    await new Promise((resolve) => setTimeout(resolve, jitter));
    return NextResponse.json({
      success: true,
      message: "If your email is registered, check your inbox.",
    });
  }

  // 5. Generate magic link + send email via Resend
  // Uses admin.generateLink REST API to avoid PKCE code_verifier cookies,
  // which break when the magic link is opened in a different browser context.
  if (!process.env.RESEND_API_KEY) {
    logger.error({ ip }, "RESEND_API_KEY not configured — cannot send magic link");
    return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
  }

  // Ensure the admin's Supabase auth user exists AND is email-confirmed before minting the
  // link. generate_link(magiclink) only produces a verifiable magic-link token for an
  // existing, confirmed user; for a brand-new email it silently creates an UNCONFIRMED user
  // plus a `confirmation_token`, which verifyOtp({ type: "magiclink" }) in the callback
  // cannot consume — surfacing as `403 "One-time token not found"` and the recurring
  // "Admin auth callback failed" alert on a new admin's first login. We only reach here for
  // allowlisted emails, so creating them pre-confirmed is safe. Best-effort: 200 = created +
  // confirmed, 422 = already exists; a transient failure must not block an existing admin
  // from logging in, so we log and continue.
  try {
    const ensureRes = await supabaseFetch("/auth/v1/admin/users", {
      method: "POST",
      body: JSON.stringify({ email, email_confirm: true }),
    });
    if (!ensureRes.ok && ensureRes.status !== 422) {
      const ensureBody = await ensureRes.json().catch(() => ({}));
      logger.warn(
        { status: ensureRes.status, body: ensureBody, ip },
        "Admin login: could not pre-confirm auth user"
      );
    }
  } catch (err) {
    logger.warn({ err, ip }, "Admin login: pre-confirm auth user threw");
  }

  try {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

    const linkRes = await supabaseFetch("/auth/v1/admin/generate_link", {
      method: "POST",
      body: JSON.stringify({ type: "magiclink", email }),
    });

    if (!linkRes.ok) {
      const errBody = await linkRes.json().catch(() => ({}));
      logger.error({ status: linkRes.status, body: errBody, ip }, "Failed to generate magic link");
      return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
    }

    const linkData = await linkRes.json();
    const hashedToken: string | undefined = linkData.hashed_token;

    if (!hashedToken) {
      logger.error({ ip }, "generate_link response missing hashed_token");
      return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
    }

    const callbackUrl = `${siteUrl}/admin/auth/callback?token_hash=${encodeURIComponent(hashedToken)}&type=magiclink`;
    const { subject, html } = adminMagicLinkEmail({ magicLink: callbackUrl });

    const from = process.env.RESEND_FROM || "LoveIQ <hello@send.loveiq.org>";
    const replyTo = process.env.RESEND_REPLY_TO || "hello@loveiq.org";

    const RESEND_TIMEOUT_MS = 8_000;
    const { error: sendError } = await Promise.race([
      getResend().emails.send({
        from,
        replyTo,
        to: email,
        subject,
        html,
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Resend timeout")), RESEND_TIMEOUT_MS)
      ),
    ]);

    if (sendError) {
      logger.error({ error: sendError, ip }, "Resend rejected magic link email");
      return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
    }
  } catch (err) {
    logger.error({ err, ip }, "Magic link send error or timeout");
    return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
  }

  // 6. Generic response (same whether email is in allowlist or not)
  return NextResponse.json({
    success: true,
    message: "If your email is registered, check your inbox.",
  });
}
