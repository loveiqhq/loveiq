import { NextResponse } from "next/server";
import { Resend } from "resend";
import { inviteEmail } from "@features/invite/emails/invite";
import { inviteBEmail } from "@features/invite/emails/invite-b";
import { buildUnsubscribeUrl } from "@shared/emails/unsubscribe-token";
import { isEmailSuppressed } from "@shared/emails/suppression";
import { pickEmailVariant } from "@shared/emails/ab-variant";
import { getEmailSiteUrl } from "@shared/emails/site-url";
import { z } from "zod";
import { checkRateLimit, getClientIp } from "@shared/http/ratelimit";
import { scheduleAfterResponse } from "@shared/http/after-response";
import { fetchWithTimeout } from "@shared/http/fetch-with-timeout";
import { getBreaker, CircuitOpenError } from "@shared/http/circuit-breaker";
import { verifyCsrfToken } from "@shared/http/csrf";
import logger from "@shared/observability/logger";
import { notifySlack, maskEmail, escapeSlack } from "@shared/observability/slack";

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
  const siteUrl = getEmailSiteUrl();
  // eslint-disable-next-line no-secrets/no-secrets
  const ctaUrl = `${siteUrl}?utm_source=loveiq_email&utm_medium=email&utm_campaign=refer_a_friend&utm_content=version_${variant}&utm_term=report_purchaser`;

  // 5. Build email — variant A keeps the original framing, variant B uses the
  // first-person testimonial copy (Figma node 5319-1846).
  const unsubSecret = process.env.UNSUBSCRIBE_SECRET;
  const unsubscribeUrl = unsubSecret
    ? buildUnsubscribeUrl(normalizedRecipient, siteUrl, unsubSecret)
    : undefined;
  const tpl =
    variant === "b"
      ? inviteBEmail({ referrerName, ctaUrl, siteUrl, personalMessage, unsubscribeUrl })
      : inviteEmail({ referrerName, ctaUrl, siteUrl, variant, personalMessage, unsubscribeUrl });

  // 6. Send email via Resend + track in DB (after response)
  const resendKey = process.env.RESEND_API_KEY;
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!resendKey) {
    return NextResponse.json({ error: "Service unavailable." }, { status: 503 });
  }

  scheduleAfterResponse("invite-email-and-tracking", async () => {
    // Invite emails are user-initiated outreach to a third party. Respect any
    // prior unsubscribe from the recipient — and continue tracking (the
    // invite_event row records the attempt so the referrer's stats stay
    // accurate, just without the actual send).
    const suppressed = await isEmailSuppressed(normalizedRecipient);

    // Send email — skip when recipient previously unsubscribed.
    if (suppressed) {
      logger.info({ recipient: normalizedRecipient }, "invite: skip suppressed recipient");
    } else {
      try {
        const { error } = await Promise.race([
          getResend().emails.send({
            from: process.env.RESEND_FROM || "LoveIQ <hello@loveiq.org>",
            to: normalizedRecipient,
            replyTo: process.env.RESEND_REPLY_TO || "hello@loveiq.org",
            subject: tpl.subject,
            html: tpl.html,
            text: tpl.text,
            headers: {
              "X-LoveIQ-Variant": variant,
              ...(unsubscribeUrl && {
                "List-Unsubscribe": `<${unsubscribeUrl}>`,
                "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
              }),
            },
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

    const from = referrerEmail
      ? escapeSlack(maskEmail(referrerEmail.toLowerCase().trim()))
      : "anonymous";
    const to = escapeSlack(maskEmail(normalizedRecipient));
    await notifySlack({
      channel: "ops",
      kind: "invite_sent",
      text: `:incoming_envelope: Invite sent — ${from} → ${to}${suppressed ? " (recipient suppressed; tracking only)" : ""}`,
      username: "ops_alerts",
    });
  });

  return NextResponse.json({ success: true });
}
