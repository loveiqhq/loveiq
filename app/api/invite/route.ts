import { NextResponse } from "next/server";
import { Resend } from "resend";
import { inviteEmail } from "@/lib/emails/invite";
import { inviteBEmail } from "@/lib/emails/invite-b";
import { pickEmailVariant } from "@/lib/emails/ab-variant";
import { z } from "zod";
import { checkRateLimit, getClientIp } from "@/lib/ratelimit";
import { scheduleAfterResponse } from "@/lib/after-response";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";
import { getBreaker, CircuitOpenError } from "@/lib/circuit-breaker";
import { verifyCsrfToken } from "@/lib/csrf";
import logger from "@/lib/logger";

const schema = z.object({
  recipientEmail: z.string().email().max(320),
  referrerEmail: z.string().email().max(320).optional(),
  referrerName: z.string().max(100).optional(),
  personalMessage: z.string().max(1500).optional(),
});

let _resend: Resend | null = null;
function getResend(): Resend {
  if (!_resend) {
    _resend = new Resend(process.env.RESEND_API_KEY);
  }
  return _resend;
}

export async function POST(request: Request) {
  // 1. CSRF verification
  if (!(await verifyCsrfToken(request))) {
    return NextResponse.json({ error: "Invalid request." }, { status: 403 });
  }

  // 2. Rate limiting
  const ip = getClientIp(request);
  const rateLimit = await checkRateLimit(ip, {
    bucket: "invite-send",
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

  // 3. Validation
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const { recipientEmail, referrerEmail, referrerName, personalMessage } = parsed.data;
  const normalizedRecipient = recipientEmail.toLowerCase().trim();

  // 4. Build UTM-tagged CTA URL (deterministic A/B variant per recipient)
  const variant = pickEmailVariant(normalizedRecipient, "invite");
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://loveiq.org";
  // eslint-disable-next-line no-secrets/no-secrets
  const ctaUrl = `${siteUrl}?utm_source=loveiq_email&utm_medium=email&utm_campaign=refer_a_friend&utm_content=version_${variant}&utm_term=report_purchaser`;

  // 5. Build email — variant A keeps the original framing, variant B uses the
  // first-person testimonial copy (Figma node 5319-1846).
  const tpl =
    variant === "b"
      ? inviteBEmail({ referrerName, ctaUrl, siteUrl, personalMessage })
      : inviteEmail({ referrerName, ctaUrl, siteUrl, variant, personalMessage });

  // 6. Send email via Resend + track in DB (after response)
  const resendKey = process.env.RESEND_API_KEY;
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!resendKey) {
    return NextResponse.json({ error: "Service unavailable." }, { status: 503 });
  }

  scheduleAfterResponse("invite-email-and-tracking", async () => {
    // Send email
    try {
      const { error } = await Promise.race([
        getResend().emails.send({
          from: process.env.RESEND_FROM || "LoveIQ <hello@send.loveiq.org>",
          to: normalizedRecipient,
          replyTo: process.env.RESEND_REPLY_TO || "hello@loveiq.org",
          subject: tpl.subject,
          html: tpl.html,
          text: tpl.text,
          headers: { "X-LoveIQ-Variant": variant },
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Resend timeout")), 8_000)
        ),
      ]);
      if (error) {
        logger.error({ error, variant }, "Invite email send failed");
      }
    } catch (err) {
      logger.error({ err, variant }, "Invite email error");
    }

    // Track in Supabase
    if (supabaseUrl && serviceRoleKey) {
      try {
        await getBreaker("supabase-tracking").fire(() =>
          fetchWithTimeout(`${supabaseUrl}/rest/v1/invite_event`, {
            method: "POST",
            headers: {
              apikey: serviceRoleKey,
              Authorization: `Bearer ${serviceRoleKey}`,
              "Content-Type": "application/json",
              Prefer: "return=minimal",
            },
            body: JSON.stringify({
              referrer_email: referrerEmail?.toLowerCase().trim() || null,
              recipient_email: normalizedRecipient,
              invite_method: "email",
              client_ip: ip,
            }),
            timeoutMs: 5000,
          })
        );
      } catch (err) {
        if (err instanceof CircuitOpenError) {
          logger.warn("Supabase-tracking circuit open (invite)");
        } else {
          logger.error({ err }, "Invite tracking insert failed");
        }
      }
    }
  });

  return NextResponse.json({ success: true });
}
