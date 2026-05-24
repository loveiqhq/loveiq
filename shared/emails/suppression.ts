import { fetchWithTimeout } from "@shared/http/fetch-with-timeout";
import logger from "@shared/observability/logger";

export async function isEmailSuppressed(email: string): Promise<boolean> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return false;

  try {
    const url = `${supabaseUrl}/rest/v1/email_suppression?email=eq.${encodeURIComponent(email)}&select=email&limit=1`;
    const res = await fetchWithTimeout(url, {
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
      timeoutMs: 3_000,
    });
    if (!res.ok) return false;
    const rows = await res.json();
    return Array.isArray(rows) && rows.length > 0;
  } catch (err) {
    logger.warn({ err, email }, "Suppression check failed — sending anyway");
    return false;
  }
}

export async function addToSuppression(
  email: string,
  reason: "unsubscribed" | "hard_bounce" | "complaint"
): Promise<void> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return;

  try {
    await fetchWithTimeout(`${supabaseUrl}/rest/v1/email_suppression`, {
      method: "POST",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates",
      },
      body: JSON.stringify({ email, reason }),
      timeoutMs: 5_000,
    });
  } catch (err) {
    // warn-not-error: the Resend webhook retries on non-2xx (Svix-signed), so
    // a transient suppression insert failure is recoverable. Sustained outage
    // surfaces via the daily tech-digest service-health section. Avoids
    // amplifying every bounce-processing blip into an api_5xx Slack page.
    logger.warn({ err, email, reason }, "Failed to add email to suppression list");
  }
}
