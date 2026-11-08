/**
 * Sending a journey email: the claim in email_journey_send before it goes (a lost send is
 * preferred to a double one), the Resend call with its tags and headers, and the record after.
 */

import { Resend } from "resend";
import { supabaseFetch } from "@features/admin/server/supabase";
import logger from "@shared/observability/logger";
import type { KitEmail } from "@features/email-journeys/emails/kit";

const RESEND_TIMEOUT_MS = 8_000;
const RESEND_ID = /^[A-Za-z0-9_-]{1,100}$/;

let _resend: Resend | null = null;
export function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  if (!_resend) _resend = new Resend(key);
  return _resend;
}

export function fromAddress(): string {
  return process.env.RESEND_FROM || "LoveIQ <hello@send.loveiq.org>";
}

export interface SendSpec {
  to: string;
  email: KitEmail;
  /** The Resend `stage` tag (EMAIL_STAGES). */
  stage: string;
  /** The `sub` tag: with it the webhook keeps this email's events per reader. */
  submissionId?: number | null;
  unsubscribeUrl?: string;
  /** A reminder or nudge: its list identity and no auto-replies, as the 72h email. */
  nurture?: boolean;
  /** Tags beyond stage and sub (journey, offer…), letters, digits, _ and - only. */
  tags?: Array<{ name: string; value: string }>;
}

/** `retry`: Resend asked to slow down (429) and sent nothing: the claim is freed for the next run. */
export type SendResult =
  { sent: true; resendId: string | null } | { sent: false; retry: boolean; reason: string };

/**
 * One Resend call. A 429 (too many requests) sent nothing and is worth another try. Any other
 * refusal (a bad address) would be refused again, and a 5xx, a timeout or no answer may have
 * sent it: those claims are kept as failed, never retried.
 */
export async function sendKitEmail(resend: Resend, spec: SendSpec): Promise<SendResult> {
  const tags = [
    { name: "stage", value: spec.stage },
    ...(spec.submissionId ? [{ name: "sub", value: String(spec.submissionId) }] : []),
    ...(spec.tags ?? []),
  ].map((t) => ({ name: t.name, value: t.value.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 64) }));
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const { data, error } = await Promise.race([
      resend.emails.send({
        from: fromAddress(),
        to: spec.to,
        replyTo: process.env.RESEND_REPLY_TO || "hello@loveiq.org",
        subject: spec.email.subject,
        html: spec.email.html,
        text: spec.email.text,
        tags,
        headers: {
          "X-LoveIQ-Stage": spec.stage,
          ...(spec.nurture
            ? { "List-ID": "LoveIQ Nurture <nurture.send.loveiq.org>", Precedence: "bulk" }
            : {}),
          ...(spec.unsubscribeUrl
            ? {
                "List-Unsubscribe": `<${spec.unsubscribeUrl}>`,
                "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
              }
            : {}),
        },
      }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("Resend timeout")), RESEND_TIMEOUT_MS);
      }),
    ]);
    if (!error) {
      const id = data?.id;
      return { sent: true, resendId: typeof id === "string" && RESEND_ID.test(id) ? id : null };
    }
    const status = (error as { statusCode?: number | null }).statusCode;
    return {
      sent: false,
      retry: status === 429,
      reason: `${error.name}: ${error.message}`.slice(0, 200),
    };
  } catch (err) {
    return {
      sent: false,
      retry: false,
      reason: (err instanceof Error ? err.message : String(err)).slice(0, 200),
    };
  } finally {
    clearTimeout(timer);
  }
}

export interface ClaimSpec {
  emailKey: string;
  target: string;
  submissionId?: number | null;
  prepaidAccessId?: number | null;
}

/** The claim's id, or null when the email already went (or is going) to this target. */
export async function claimSend(spec: ClaimSpec): Promise<number | null> {
  const res = await supabaseFetch(
    // eslint-disable-next-line no-secrets/no-secrets -- REST path, not a secret
    "/rest/v1/email_journey_send?on_conflict=email_key,target&select=id",
    {
      method: "POST",
      headers: { Prefer: "resolution=ignore-duplicates,return=representation" },
      body: JSON.stringify({
        email_key: spec.emailKey,
        target: spec.target,
        survey_submission_id: spec.submissionId ?? null,
        prepaid_access_id: spec.prepaidAccessId ?? null,
      }),
    }
  );
  if (!res.ok) throw new Error(`journey_claim_failed:${res.status}`);
  const [row] = (await res.json()) as Array<{ id: number }>;
  return row ? row.id : null;
}

/** After the send: sent with Resend's id, failed (kept, never retried), or released (a 429). */
export async function settleClaim(id: number, result: SendResult): Promise<void> {
  try {
    if (result.sent) {
      await supabaseFetch(`/rest/v1/email_journey_send?id=eq.${id}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({
          status: "sent",
          resend_id: result.resendId,
          sent_at: new Date().toISOString(),
        }),
      });
    } else if (result.retry) {
      await supabaseFetch(`/rest/v1/email_journey_send?id=eq.${id}`, {
        method: "DELETE",
        headers: { Prefer: "return=minimal" },
      });
    } else {
      await supabaseFetch(`/rest/v1/email_journey_send?id=eq.${id}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ status: "failed" }),
      });
    }
  } catch (err) {
    // The claim stays as it was: at worst a sent email reads "claimed", never a second send.
    logger.warn({ err, id }, "email-journeys: claim not settled");
  }
}

/** Whether an email went to a target (its claim reads sent), for the "after R1" rules. */
export async function wasSent(emailKey: string, target: string): Promise<boolean> {
  const res = await supabaseFetch(
    `/rest/v1/email_journey_send?email_key=eq.${encodeURIComponent(emailKey)}&target=eq.${encodeURIComponent(target)}&status=eq.sent&select=id&limit=1`
  );
  if (!res.ok) throw new Error(`journey_lookup_failed:${res.status}`);
  return ((await res.json()) as unknown[]).length > 0;
}

export type ClaimAndSendOutcome = "sent" | "already" | "retry" | "failed";

/** Claim, send, settle: exactly once per email and target. */
export async function claimAndSend(
  resend: Resend,
  claim: ClaimSpec,
  spec: SendSpec
): Promise<ClaimAndSendOutcome> {
  const id = await claimSend(claim);
  if (id === null) return "already";
  const result = await sendKitEmail(resend, spec);
  await settleClaim(id, result);
  if (result.sent) return "sent";
  logger.warn(
    { emailKey: claim.emailKey, target: claim.target, reason: result.reason },
    "email-journeys: send failed"
  );
  return result.retry ? "retry" : "failed";
}
