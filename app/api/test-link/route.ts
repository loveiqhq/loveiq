/**
 * POST /api/test-link
 *
 * Emails someone a link to the LoveIQ test. Backs the "Not in the mood right
 * now?" band on the landing page (features/landing/ui/white/WCapBand.tsx).
 *
 * Same protections as /api/invite: CSRF + per-IP rate limit + a long
 * per-recipient cooldown, so a rotating-IP attacker can't email-bomb an address
 * and burn the sending domain's reputation.
 */

import { NextResponse } from "next/server";
import { Resend } from "resend";
import { z } from "zod";
import { testLinkEmail } from "@features/survey/server/emails/test-link";
import { getEmailSiteUrl } from "@shared/emails/site-url";
import { isEmailSuppressed } from "@shared/emails/suppression";
import { buildUnsubscribeUrl, UNSUBSCRIBE_CAMPAIGNS } from "@shared/emails/unsubscribe-token";
import { verifyCsrfToken } from "@shared/http/csrf";
import { checkCooldown, checkRateLimit, getClientIp } from "@shared/http/ratelimit";
import { scheduleAfterResponse } from "@shared/http/after-response";
import logger from "@shared/observability/logger";

const schema = z.object({
  // Trim before validating: pasted addresses often carry a leading/trailing
  // space, and rejecting those as "invalid email" is a pure UX own-goal.
  email: z.string().trim().email().max(320),
});

const RECIPIENT_COOLDOWN_MS = 24 * 60 * 60 * 1000;

let _resend: Resend | null = null;
function getResend(): Resend {
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
}

export async function POST(request: Request) {
  if (!(await verifyCsrfToken(request))) {
    return NextResponse.json({ error: "Invalid request." }, { status: 403 });
  }

  const ip = getClientIp(request);
  const rateLimit = await checkRateLimit(ip, { bucket: "test-link", limit: 5, windowMs: 60_000 });
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

  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 });
  }

  const recipient = parsed.data.email.toLowerCase().trim();

  const cooldown = await checkCooldown(recipient, "test-link-recipient", RECIPIENT_COOLDOWN_MS);
  if (!cooldown.allowed) {
    // Same success shape on purpose — a distinct error here would let anyone
    // probe whether an address already requested a link.
    return NextResponse.json({ success: true });
  }

  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ error: "Service unavailable." }, { status: 503 });
  }

  const siteUrl = getEmailSiteUrl();
  // eslint-disable-next-line no-secrets/no-secrets
  const testUrl = `${siteUrl}/survey?utm_source=loveiq_email&utm_medium=email&utm_campaign=test_link`;
  const unsubSecret = process.env.UNSUBSCRIBE_SECRET;
  const unsubscribeUrl = unsubSecret
    ? buildUnsubscribeUrl(recipient, siteUrl, unsubSecret, UNSUBSCRIBE_CAMPAIGNS.testLink)
    : undefined;
  const tpl = testLinkEmail({ testUrl, siteUrl, unsubscribeUrl });

  scheduleAfterResponse("test-link-email", async () => {
    if (await isEmailSuppressed(recipient)) {
      logger.info({ recipient }, "test-link: skip suppressed recipient");
      return;
    }
    try {
      const { error } = await Promise.race([
        getResend().emails.send({
          from: process.env.RESEND_FROM || "LoveIQ <hello@loveiq.org>",
          to: recipient,
          replyTo: process.env.RESEND_REPLY_TO || "hello@loveiq.org",
          subject: tpl.subject,
          html: tpl.html,
          text: tpl.text,
          headers: {
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
        // warn-not-error: best-effort post-response send. The user can ask again.
        logger.warn({ error }, "Test-link email send failed");
      }
    } catch (err) {
      logger.warn({ err }, "Test-link email error");
    }
  });

  return NextResponse.json({ success: true });
}
