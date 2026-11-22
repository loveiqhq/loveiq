import { Resend } from "resend";
import { supabaseFetch } from "@features/admin/server/supabase";
import { escapeHtml } from "@shared/emails/shared";
import { checkCooldown } from "@shared/http/ratelimit";
import logger from "@shared/observability/logger";

/**
 * Sign-in by emailed code, the way Jarvis already does it (features/brain/server/connect.ts):
 * make sure a confirmed auth user exists, have Supabase mint a magic-link token (its numeric
 * `email_otp`), and send that code with Resend. The code is checked with verifyOtp in the
 * auth route. No password, no Supabase email template, no Supabase mail rate limit.
 *
 * Sender and subject are neutral on purpose (board 05: "nothing about your chats shows in your
 * inbox"): "LoveIQ" (the brand, 18 Nov 2026), "Your sign-in code".
 */

/** Supabase mints 8 digits on our projects (mailer_otp_length); 6 to 10 is accepted, like Jarvis. */
export const SIGN_IN_CODE = /^\d{6,10}$/;

/**
 * The inbox an address reaches, as the per-address code limit counts it: lea+1@ and lea+2@ (any
 * domain), and l.e.a@gmail.com or lea@googlemail.com, all reach lea's inbox and share one
 * allowance. Only the limit's key: the account keeps the address as typed.
 */
export function addressKey(email: string): string {
  const at = email.lastIndexOf("@");
  const domain = email.slice(at + 1).toLowerCase();
  let local = email.slice(0, at).toLowerCase().split("+")[0]!;
  const gmail = domain === "gmail.com" || domain === "googlemail.com";
  if (gmail) local = local.replaceAll(".", "");
  return `${local}@${gmail ? "gmail.com" : domain}`;
}

let resend: Resend | null = null;

function neutralFrom(): string {
  const configured = process.env.RESEND_FROM || "LoveIQ <hello@send.loveiq.org>";
  const address = /<([^>]+)>/.exec(configured)?.[1] ?? configured;
  return `LoveIQ <${address}>`;
}

/** The reply-to address, only when it is one (a pulled env file holds "[SENSITIVE]" instead). */
function replyTo(): string | null {
  const v = process.env.RESEND_REPLY_TO?.trim();
  return v && /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(v) ? v : null;
}

const FOOTER =
  "Applied Psychometrics UG (haftungsbeschränkt) · Hasenheide 62, 10967 Berlin · HRB 282986 B, Amtsgericht Charlottenburg · Managing director: Marcus Börner";

/**
 * A code email: for signing in, or (22 Nov 2026) for confirming a new address in Settings, with
 * the same neutral sender, layout and footer.
 */
export function signInCodeEmail(code: string, purpose: "sign-in" | "new-address" = "sign-in") {
  const what = purpose === "sign-in" ? "sign-in code" : "confirmation code";
  const why =
    purpose === "sign-in"
      ? "Type it on the page you just came from."
      : "Type it on the page you just came from to confirm this email address.";
  const subject = `Your ${what}: ${code}`;
  const text =
    `Your ${what} is ${code}.\n\n${why} It works once, ` +
    `for an hour.\n\nIf you did not ask for this, you can ignore this email.\n\n${FOOTER}`;
  const html = `
  <div style="font-family: Arial, Helvetica, sans-serif; color:#161021; line-height:1.5;">
    <p style="margin:0 0 16px 0;">Your ${what} is</p>
    <p style="margin:0 0 20px 0; font-size:32px; font-weight:700; letter-spacing:6px;">${escapeHtml(code)}</p>
    <p style="margin:0 0 16px 0;">${why} It works once, for an hour.</p>
    <p style="margin:0 0 12px 0; font-size:13px; color:#6b6678;">If you did not ask for this, you can ignore this email.</p>
    <p style="margin:0; font-size:12px; color:#6b6678;">${FOOTER}</p>
  </div>`;
  return { subject, text, html };
}

/**
 * The note to the old address after a change of email (22 Nov 2026): neutral like every Mira
 * email (nothing about chats), with the new address masked, and who to write to if it wasn't them.
 */
export function emailChangedNotice(maskedNewAddress: string) {
  const subject = "Your sign-in email was changed";
  const text =
    `The email address you sign in with was changed to ${maskedNewAddress}.\n\n` +
    `If you made this change, there is nothing more to do.\n\nIf you didn't, write to ` +
    `hello@loveiq.org straight away and we'll help you get your account back.\n\n${FOOTER}`;
  const html = `
  <div style="font-family: Arial, Helvetica, sans-serif; color:#161021; line-height:1.5;">
    <p style="margin:0 0 16px 0;">The email address you sign in with was changed to <strong>${escapeHtml(maskedNewAddress)}</strong>.</p>
    <p style="margin:0 0 16px 0;">If you made this change, there is nothing more to do.</p>
    <p style="margin:0 0 16px 0;">If you didn't, write to <a href="mailto:hello@loveiq.org" style="color:#161021;">hello@loveiq.org</a> straight away and we'll help you get your account back.</p>
    <p style="margin:0; font-size:12px; color:#6b6678;">${FOOTER}</p>
  </div>`;
  return { subject, text, html };
}

/**
 * The note to the account's address when a passkey is added (security review M1, 22 Nov 2026):
 * someone with the browser for a few minutes could add a passkey that lives on their own phone,
 * so the owner hears of every new one. Neutral like every Mira email (nothing about chats).
 */
export function passkeyAddedNotice(label: string) {
  const subject = "A passkey was added to your account";
  const text =
    `A passkey (${label}) was just added for signing in to Mira.\n\n` +
    `If you added it, there is nothing more to do.\n\nIf you didn't, open Mira's Settings, ` +
    `Sign-in & security: remove it there, then use "Sign out everywhere" and remove your ` +
    `passkeys. Write to hello@loveiq.org if you need help.\n\n${FOOTER}`;
  const html = `
  <div style="font-family: Arial, Helvetica, sans-serif; color:#161021; line-height:1.5;">
    <p style="margin:0 0 16px 0;">A passkey (<strong>${escapeHtml(label)}</strong>) was just added for signing in to Mira.</p>
    <p style="margin:0 0 16px 0;">If you added it, there is nothing more to do.</p>
    <p style="margin:0 0 16px 0;">If you didn't, open Mira's Settings, Sign-in &amp; security: remove it there, then use &ldquo;Sign out everywhere&rdquo; and remove your passkeys. Write to <a href="mailto:hello@loveiq.org" style="color:#161021;">hello@loveiq.org</a> if you need help.</p>
    <p style="margin:0; font-size:12px; color:#6b6678;">${FOOTER}</p>
  </div>`;
  return { subject, text, html };
}

/**
 * Marks the logins Mira's sign-in creates (app_metadata, which only the service role can
 * write), so the daily cleanup in app/api/cron/mira-memory removes only those whose sign-up
 * never finished. A login that already existed (admin, Jarvis) is never marked.
 */
export const MIRA_CREATED = { created_by: "mira" } as const;

/**
 * A one-time code for this address, making the confirmed auth user first if needed, or null.
 * The emailed code uses it, and so does Google sign-in, which checks the code itself.
 */
export async function mintSignInCode(email: string): Promise<string | null> {
  // generate_link mints a usable code only for an existing, confirmed user (see the admin
  // login). 422 = the user already exists.
  const ensured = await supabaseFetch("/auth/v1/admin/users", {
    method: "POST",
    body: JSON.stringify({ email, email_confirm: true, app_metadata: MIRA_CREATED }),
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
    return null;
  }
  return link.email_otp!;
}

/** Mint and email a code. False only when something broke; the caller answers the same either way. */
export async function sendSignInCode(email: string): Promise<boolean> {
  if (!process.env.RESEND_API_KEY) {
    logger.error("mira: RESEND_API_KEY is not set, so no sign-in code can be sent");
    return false;
  }
  const code = await mintSignInCode(email);
  if (!code) return false;
  return sendNeutralEmail(email, signInCodeEmail(code));
}

/**
 * One email from the neutral sender, through the Resend account all LoveIQ mail uses, giving up
 * after 8 seconds. False when it didn't go.
 */
export async function sendNeutralEmail(
  to: string,
  content: { subject: string; html: string; text: string }
): Promise<boolean> {
  if (!process.env.RESEND_API_KEY) {
    logger.error("mira: RESEND_API_KEY is not set, so no email can be sent");
    return false;
  }
  resend ??= new Resend(process.env.RESEND_API_KEY);
  const sent = await Promise.race([
    resend.emails.send({
      from: neutralFrom(),
      to,
      ...content,
      ...(replyTo() ? { replyTo: replyTo()! } : {}),
    }),
    new Promise<{ error: Error }>((resolve) =>
      setTimeout(() => resolve({ error: new Error("Resend timeout") }), 8_000)
    ),
  ]);
  if (sent.error) {
    logger.error({ err: sent.error }, "mira: an email was not sent");
    return false;
  }
  return true;
}

/** Codes an inbox gets in 24 hours, sign-in and change of email together. */
export const CODES_PER_ADDRESS_DAY = 5;

/**
 * One of the inbox's five codes for the next 24 hours, or null when they're used: shared by the
 * sign-in code and the change-of-email code, so no one can mail an address more often through
 * either. One cooldown per code rather than a counter, so a code that never went out is given
 * back (a counter can't be). ponytail: without Redis (local, staging) cooldowns always pass, so
 * only the per-IP caps hold.
 */
export async function claimDaySlot(inbox: string): Promise<string | null> {
  for (let i = 1; i <= CODES_PER_ADDRESS_DAY; i++) {
    const bucket = `mira-code-day-${i}`;
    if ((await checkCooldown(inbox, bucket, 24 * 60 * 60 * 1000)).allowed) return bucket;
  }
  return null;
}
