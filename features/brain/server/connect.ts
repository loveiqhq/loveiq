import { Resend } from "resend";
import { supabaseFetch } from "@features/admin/server/supabase";
import { createSupabaseServer } from "@features/admin/server/supabase-server";
import { isClaudeRedirect, memberByEmail } from "@features/brain/server/sign-in";
import { escapeHtml } from "@shared/format/html-escape";
import logger from "@shared/observability/logger";

/**
 * The sign-in page Claude sends a person to, /jarvis/connect (Supabase's OAuth
 * "authorization path"). Signing in is a six-digit code sent to the person's @loveiq.org
 * address, typed on the same page, so it works when the email is read on a phone and
 * Claude runs on a laptop. The same pattern as the admin login: Supabase mints the code,
 * we send it, so nothing depends on Supabase's own mail service.
 */

export type ConnectState =
  | { kind: "no-request" }
  | { kind: "sign-in" }
  | { kind: "not-member"; email: string }
  | { kind: "consent"; app: string; name: string; email: string }
  | { kind: "not-claude"; app: string; host: string }
  | { kind: "redirect"; url: string }
  | { kind: "error"; message: string };

type Supabase = Awaited<ReturnType<typeof createSupabaseServer>>;

/** What the page should show for this browser and this authorization request. */
export async function connectState(authorizationId: string | null): Promise<ConnectState> {
  if (!authorizationId) return { kind: "no-request" };
  const supabase = await createSupabaseServer();
  const { data } = await supabase.auth.getUser();
  const email = data.user?.email;
  if (!email) return { kind: "sign-in" };

  const member = await memberByEmail(email).catch(() => null);
  if (!member) return { kind: "not-member", email };
  return requestFor(supabase, authorizationId, member);
}

async function requestFor(
  supabase: Supabase,
  authorizationId: string,
  member: { name: string; email: string }
): Promise<ConnectState> {
  const { data, error } = await supabase.auth.oauth.getAuthorizationDetails(authorizationId);
  if (error || !data) {
    return {
      kind: "error",
      message:
        "This sign-in request has expired or was already used. Go back to Claude and connect again.",
    };
  }
  // Consent was given before for this app: Supabase sends the code straight back.
  if (!("authorization_id" in data)) return { kind: "redirect", url: data.redirect_url };
  const app = data.client?.name?.trim() || "An app";
  if (!isClaudeRedirect(data.redirect_uri)) {
    return { kind: "not-claude", app, host: hostOf(data.redirect_uri) };
  }
  return { kind: "consent", app, name: member.name, email: member.email };
}

function hostOf(uri: string): string {
  try {
    return new URL(uri).host;
  } catch {
    return uri.slice(0, 80);
  }
}

/**
 * Approve or deny, for the signed-in member. Returns where to send the browser: back to
 * Claude with a code, or with `access_denied`. Refuses an app that would receive the code
 * anywhere but Claude, whatever the browser asks.
 */
export async function decide(
  authorizationId: string,
  approve: boolean
): Promise<
  | { ok: true; url: string; app: string; member: string }
  | { ok: false; status: number; message: string }
> {
  const supabase = await createSupabaseServer();
  const { data } = await supabase.auth.getUser();
  const email = data.user?.email;
  if (!email) return { ok: false, status: 401, message: "Sign in first." };
  const member = await memberByEmail(email).catch(() => null);
  if (!member) return { ok: false, status: 403, message: `${email} cannot use Jarvis.` };

  const state = await requestFor(supabase, authorizationId, member);
  if (state.kind === "redirect") return { ok: true, url: state.url, app: "", member: member.name };
  if (state.kind !== "consent") {
    return {
      ok: false,
      status: 400,
      message: state.kind === "error" ? state.message : "Jarvis connects only to Claude.",
    };
  }
  const { data: sent, error } = approve
    ? await supabase.auth.oauth.approveAuthorization(authorizationId, { skipBrowserRedirect: true })
    : await supabase.auth.oauth.denyAuthorization(authorizationId, { skipBrowserRedirect: true });
  if (error || !sent?.redirect_url) {
    logger.warn({ err: error?.message }, "jarvis: Supabase refused a consent decision");
    return {
      ok: false,
      status: 400,
      message: "That did not go through. Go back to Claude and connect again.",
    };
  }
  return { ok: true, url: sent.redirect_url, app: state.app, member: member.name };
}

let resend: Resend | null = null;

/**
 * Mint a sign-in code for a member and email it. Returns false only when something broke;
 * a non-member gets no email and the same answer, so the page cannot be used to learn who
 * is on the list.
 */
export async function sendSignInCode(email: string): Promise<boolean> {
  const member = await memberByEmail(email);
  if (!member) return true;
  if (!process.env.RESEND_API_KEY) {
    logger.error("jarvis: RESEND_API_KEY is not set, so no sign-in code can be sent");
    return false;
  }

  // generate_link only mints a usable code for an existing, confirmed user (see the admin
  // login). 422 means the user already exists.
  const ensured = await supabaseFetch("/auth/v1/admin/users", {
    method: "POST",
    body: JSON.stringify({ email: member.email, email_confirm: true }),
  });
  if (!ensured.ok && ensured.status !== 422) {
    logger.warn({ status: ensured.status }, "jarvis: could not create the auth user");
  }

  const linkRes = await supabaseFetch("/auth/v1/admin/generate_link", {
    method: "POST",
    body: JSON.stringify({ type: "magiclink", email: member.email }),
  });
  const link = (await linkRes.json().catch(() => ({}))) as { email_otp?: string };
  if (!linkRes.ok || !/^\d{6}$/.test(link.email_otp ?? "")) {
    logger.error({ status: linkRes.status }, "jarvis: Supabase did not mint a sign-in code");
    return false;
  }

  resend ??= new Resend(process.env.RESEND_API_KEY);
  const { subject, html, text } = signInCodeEmail(member.name, link.email_otp!);
  const sent = await Promise.race([
    resend.emails.send({
      from: process.env.RESEND_FROM || "LoveIQ <hello@send.loveiq.org>",
      to: member.email,
      subject,
      html,
      text,
    }),
    new Promise<{ error: Error }>((resolve) =>
      setTimeout(() => resolve({ error: new Error("Resend timeout") }), 8_000)
    ),
  ]);
  if (sent.error) {
    logger.error({ err: sent.error }, "jarvis: the sign-in code email was not sent");
    return false;
  }
  return true;
}

export function signInCodeEmail(name: string, code: string) {
  const first = name.split(" ")[0] || name;
  const subject = `Your Jarvis sign-in code: ${code}`;
  const text =
    `Hi ${first},\n\nYour code to connect Claude to Jarvis is ${code}. Type it on the page ` +
    `you just came from. It works once, for an hour.\n\nIf you did not ask for this, ignore it.`;
  const html = `
  <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; color:#111; line-height:1.5;">
    <p style="margin:0 0 16px 0;">Hi ${escapeHtml(first)},</p>
    <p style="margin:0 0 16px 0;">Your code to connect Claude to Jarvis:</p>
    <p style="margin:0 0 20px 0; font-size:32px; font-weight:700; letter-spacing:6px;">${escapeHtml(code)}</p>
    <p style="margin:0 0 16px 0;">Type it on the page you just came from. It works once, for an hour.</p>
    <p style="margin:0; font-size:13px; color:#999;">If you did not ask for this, ignore it.</p>
  </div>`;
  return { subject, html, text };
}
