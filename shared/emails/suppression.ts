import { Resend } from "resend";
import { fetchWithTimeout } from "@shared/http/fetch-with-timeout";
import logger from "@shared/observability/logger";

/**
 * R-05: mark the address unsubscribed in Resend, so campaigns sent from Resend
 * skip it whichever list they go to. Removing it from the one list, as this used
 * to, left the contact subscribed, and the survey's opt-in push re-subscribes
 * on create. Best-effort: a failure here doesn't break the suppression write.
 * Tried whether or not a list is configured: a contact outlives a config change.
 */
async function unsubscribeInResend(email: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return;
  try {
    const { error } = await new Resend(apiKey).contacts.update({ email, unsubscribed: true });
    // The SDK returns API errors instead of throwing. not_found = never a contact.
    if (error && error.name !== "not_found") {
      logger.warn({ error, email }, "Failed to unsubscribe email in Resend");
    }
  } catch (err) {
    logger.warn({ err, email }, "Failed to unsubscribe email in Resend");
  }
}

/**
 * "Not suppressed" and "could not tell" are different answers, and for some callers the
 * difference decides whether to send.
 *
 * `isEmailSuppressed` collapses them to `false` — send anyway — which is the right call
 * for transactional mail: a confirmation that fails to arrive because a lookup timed out
 * is a worse outcome than a small compliance risk. It is NOT the right call for mail an
 * agent composed to an address it chose, where nobody is waiting for the message and
 * "unknown" should stop it. That caller reads this; everything else keeps the old
 * behaviour through the wrapper below.
 */
export type SuppressionState = "suppressed" | "clear" | "unknown";

export async function suppressionState(email: string): Promise<SuppressionState> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return "unknown";

  try {
    const url = `${supabaseUrl}/rest/v1/email_suppression?email=eq.${encodeURIComponent(email)}&select=email&limit=1`;
    const res = await fetchWithTimeout(url, {
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
      timeoutMs: 3_000,
    });
    if (!res.ok) return "unknown";
    const rows = await res.json();
    return Array.isArray(rows) && rows.length > 0 ? "suppressed" : "clear";
  } catch (err) {
    logger.warn({ err, email }, "Suppression check failed");
    return "unknown";
  }
}

export async function isEmailSuppressed(email: string): Promise<boolean> {
  // Unknown reads as not-suppressed here, deliberately: a transactional email that fails
  // to arrive because a lookup timed out is the worse outcome. See `suppressionState`.
  return (await suppressionState(email)) === "suppressed";
}

export async function addToSuppression(
  email: string,
  reason: "unsubscribed" | "hard_bounce" | "complaint",
  // Optional attribution for the email that triggered this suppression. Only the
  // unsubscribe paths pass it; bounce/complaint callers omit it. Because the
  // insert upserts with `resolution=merge-duplicates` (ON CONFLICT DO UPDATE
  // over the columns sent), an omitted field never overwrites an existing one —
  // so a later bounce can't wipe the campaign recorded on an earlier unsubscribe.
  // `ifAbsent` inserts only when the address has no row yet (ON CONFLICT DO
  // NOTHING, in one statement), for a caller that must not relabel a reason.
  opts?: { campaign?: string; channel?: "footer" | "one-click"; ifAbsent?: boolean }
): Promise<boolean> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return false;

  const row: Record<string, string> = { email, reason };
  if (opts?.campaign) row.source_campaign = opts.campaign;
  if (opts?.channel) row.source_channel = opts.channel;

  let written = false;
  try {
    const res = await fetchWithTimeout(`${supabaseUrl}/rest/v1/email_suppression`, {
      method: "POST",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
        Prefer: opts?.ifAbsent ? "resolution=ignore-duplicates" : "resolution=merge-duplicates",
      },
      body: JSON.stringify(row),
      timeoutMs: 5_000,
    });
    // fetch rejects only on a network error: a refused insert arrives as a response. It
    // used to pass silently, and the unsubscribe page said "you've been unsubscribed" to
    // a person who stayed on the list. A 4xx refuses every write until someone fixes it,
    // so it pages; a 5xx is a blip the caller retries, like the network error below.
    written = res.ok;
    if (res.status >= 500) {
      logger.warn({ status: res.status, email, reason }, "Suppression insert refused");
    } else if (!res.ok) {
      logger.error({ status: res.status, email, reason }, "Suppression insert refused");
    }
  } catch (err) {
    // warn-not-error: the caller sees `false` and retries (the Resend webhook
    // answers 503, so Svix redelivers), so a transient failure is recoverable. Sustained outage
    // surfaces via the daily tech-digest service-health section. Avoids
    // amplifying every bounce-processing blip into an api_5xx Slack page.
    logger.warn({ err, email, reason }, "Failed to add email to suppression list");
  }

  // R-05: ALSO unsubscribe them in Resend. The suppression_list gate alone
  // doesn't protect recipients of campaigns sent from Resend, because those are
  // dispatched server-side by Resend, not through our senders. Best-effort:
  // failure here doesn't undo the suppression write above.
  await unsubscribeInResend(email);
  return written;
}
