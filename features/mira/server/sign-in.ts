import { Resend } from "resend";
import { supabaseFetch } from "@features/admin/server/supabase";
import { escapeHtml } from "@shared/emails/shared";
import logger from "@shared/observability/logger";

/**
 * Sign-in by emailed code, the way Jarvis already does it (features/brain/server/connect.ts):
 * make sure a confirmed auth user exists, have Supabase mint a magic-link token (its numeric
 * `email_otp`), and send that code with Resend. The code is checked with verifyOtp in the
 * auth route. No password, no Supabase email template, no Supabase mail rate limit.
 *
 * Sender and subject are neutral on purpose (board 05: "nothing about your chats shows in your
 * inbox"): "Applied Psychometrics", "Your sign-in code".
 */

/** Supabase mints 8 digits on our projects (mailer_otp_length); 6 to 10 is accepted, like Jarvis. */
export const SIGN_IN_CODE = /^\d{6,10}$/;

let resend: Resend | null = null;

function neutralFrom(): string {
  const configured = process.env.RESEND_FROM || "LoveIQ <hello@send.loveiq.org>";
  const address = /<([^>]+)>/.exec(configured)?.[1] ?? configured;
  return `Applied Psychometrics <${address}>`;
}

/** The reply-to address, only when it is one (a pulled env file holds "[SENSITIVE]" instead). */
function replyTo(): string | null {
  const v = process.env.RESEND_REPLY_TO?.trim();
  return v && /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(v) ? v : null;
}

/**
 * Voids a person's outstanding code after too many wrong guesses: minting a recovery token
 * replaces the magic-link one (Supabase keeps one per user), so the guessed-at code stops
 * working and the person simply asks for a new one. A recovery link is never minted for an
 * address without an account (404), so no account is created here. Nothing is emailed.
 */
export async function voidOutstandingCode(email: string): Promise<void> {
  const res = await supabaseFetch("/auth/v1/admin/generate_link", {
    method: "POST",
    body: JSON.stringify({ type: "recovery", email }),
  });
  if (!res.ok && res.status !== 404) {
    logger.warn({ status: res.status }, "mira: could not void a guessed-at sign-in code");
  }
}

export function signInCodeEmail(code: string) {
  const subject = `Your sign-in code: ${code}`;
  const text =
    `Your sign-in code is ${code}.\n\nType it on the page you just came from. It works once, ` +
    `for an hour.\n\nIf you did not ask for this, you can ignore this email.\n\nApplied Psychometrics`;
  const html = `
  <div style="font-family: Arial, Helvetica, sans-serif; color:#161021; line-height:1.5;">
    <p style="margin:0 0 16px 0;">Your sign-in code is</p>
    <p style="margin:0 0 20px 0; font-size:32px; font-weight:700; letter-spacing:6px;">${escapeHtml(code)}</p>
    <p style="margin:0 0 16px 0;">Type it on the page you just came from. It works once, for an hour.</p>
    <p style="margin:0; font-size:13px; color:#6b6678;">If you did not ask for this, you can ignore this email. Applied Psychometrics</p>
  </div>`;
  return { subject, text, html };
}

/** Mint and email a code. False only when something broke; the caller answers the same either way. */
export async function sendSignInCode(email: string): Promise<boolean> {
  if (!process.env.RESEND_API_KEY) {
    logger.error("mira: RESEND_API_KEY is not set, so no sign-in code can be sent");
    return false;
  }
  // generate_link mints a usable code only for an existing, confirmed user (see the admin
  // login). 422 = the user already exists.
  const ensured = await supabaseFetch("/auth/v1/admin/users", {
    method: "POST",
    body: JSON.stringify({ email, email_confirm: true }),
  });
  if (!ensured.ok && ensured.status !== 422) {
    logger.warn({ status: ensured.status }, "mira: could not create the auth user");
  }

  const linkRes = await supabaseFetch("/auth/v1/admin/generate_link", {
    method: "POST",
    body: JSON.stringify({ type: "magiclink", email }),
  });
  const link = (await linkRes.json().catch(() => ({}))) as { email_otp?: string };
  if (!linkRes.ok || !SIGN_IN_CODE.test(link.email_otp ?? "")) {
    logger.error({ status: linkRes.status }, "mira: Supabase did not mint a sign-in code");
    return false;
  }

  resend ??= new Resend(process.env.RESEND_API_KEY);
  const { subject, html, text } = signInCodeEmail(link.email_otp!);
  const sent = await Promise.race([
    resend.emails.send({
      from: neutralFrom(),
      to: email,
      subject,
      html,
      text,
      ...(replyTo() ? { replyTo: replyTo()! } : {}),
    }),
    new Promise<{ error: Error }>((resolve) =>
      setTimeout(() => resolve({ error: new Error("Resend timeout") }), 8_000)
    ),
  ]);
  if (sent.error) {
    logger.error({ err: sent.error }, "mira: the sign-in code email was not sent");
    return false;
  }
  return true;
}
