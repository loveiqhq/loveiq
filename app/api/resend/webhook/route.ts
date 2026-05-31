import { NextResponse } from "next/server";
import { Webhook } from "svix";
import { Redis } from "@upstash/redis";
import { addToSuppression } from "@shared/emails/suppression";
import { fetchWithTimeout } from "@shared/http/fetch-with-timeout";
import logger from "@shared/observability/logger";
import { notifySlack, maskEmail, escapeSlack } from "@shared/observability/slack";

/**
 * R-02: Application-level idempotency. Returns true if this svix_id is new
 * (caller should process). Returns false if the event has already been
 * processed (caller should return ok without side effects). Returns true on
 * Supabase failure (fail-open: prefer occasional double-processing over
 * silently dropping the event).
 */
async function claimResendEvent(svixId: string, eventType: string): Promise<boolean> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return true;
  try {
    const res = await fetchWithTimeout(`${url}/rest/v1/resend_webhook_event`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ svix_id: svixId, event_type: eventType }),
      timeoutMs: 3000,
    });
    if (res.status === 409) return false; // unique conflict — already handled
    if (!res.ok) {
      logger.warn({ status: res.status, svixId }, "Resend webhook claim non-ok — failing open");
      return true;
    }
    return true;
  } catch (err) {
    logger.warn({ err, svixId }, "Resend webhook claim threw — failing open");
    return true;
  }
}

// Process-scoped Upstash client used for the per-day email-engagement
// counters consumed by the funnel-digest cron's morning summary.
let _engagementRedis: Redis | null | undefined;
function getEngagementRedis(): Redis | null {
  if (_engagementRedis !== undefined) return _engagementRedis;
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  _engagementRedis = url && token ? new Redis({ url, token }) : null;
  return _engagementRedis;
}

async function bumpEmailEngagement(kind: "opened" | "clicked"): Promise<void> {
  const redis = getEngagementRedis();
  if (!redis) return;
  const day = new Date().toISOString().slice(0, 10);
  const key = `email_engage:${kind}:${day}`;
  try {
    const n = await redis.incr(key);
    // 8-day TTL — yesterday's count is still queryable by tomorrow's
    // digest, and the key drops automatically after a week.
    if (n === 1) await redis.expire(key, 8 * 86_400);
  } catch {
    // KV errors must never break the webhook handler.
  }
}

export const runtime = "nodejs";

export async function POST(request: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    logger.warn("RESEND_WEBHOOK_SECRET not set — rejecting webhook");
    return NextResponse.json({ error: "Not configured." }, { status: 503 });
  }

  const rawBody = await request.text();
  const svixHeaders = {
    "svix-id": request.headers.get("svix-id") ?? "",
    "svix-timestamp": request.headers.get("svix-timestamp") ?? "",
    "svix-signature": request.headers.get("svix-signature") ?? "",
  };

  let payload: { type: string; data: { to?: string[] } };
  try {
    const wh = new Webhook(secret);
    payload = wh.verify(rawBody, svixHeaders) as typeof payload;
  } catch (err) {
    logger.warn({ err }, "Resend webhook signature verification failed");
    // D2: signature failures usually indicate either a webhook secret
    // rotation drift between Resend dashboard + RESEND_WEBHOOK_SECRET env
    // var, or a malicious request. Either way ops should know quickly.
    await notifySlack({
      channel: "ops",
      // eslint-disable-next-line no-secrets/no-secrets -- alert kind label, not a secret
      kind: "resend_webhook_signature_fail",
      text: `:no_entry_sign: Resend webhook signature verification failed. Check RESEND_WEBHOOK_SECRET against the Resend dashboard.`,
      username: "ops_alerts",
    });
    return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
  }

  // R-02: claim the svix_id before side effects. Same svix_id arriving twice
  // within Svix's 5-min tolerance window now no-ops the second handler.
  const svixId = svixHeaders["svix-id"];
  if (svixId) {
    const claimed = await claimResendEvent(svixId, payload.type);
    if (!claimed) {
      logger.info({ svixId, type: payload.type }, "Resend webhook replay — already processed");
      return NextResponse.json({ ok: true, deduped: true });
    }
  }

  const email = payload.data?.to?.[0]?.toLowerCase().trim();
  if (!email) {
    return NextResponse.json({ ok: true });
  }

  if (payload.type === "email.bounced") {
    logger.info({ email }, "Hard bounce — suppressing email address");
    await addToSuppression(email, "hard_bounce");
    await notifySlack({
      channel: "ops",
      kind: "email_bounce",
      text: `:envelope_with_arrow: Hard bounce — ${escapeSlack(maskEmail(email))} suppressed`,
      username: "ops_alerts",
    });
  } else if (payload.type === "email.complained") {
    logger.info({ email }, "Spam complaint — suppressing email address");
    await addToSuppression(email, "complaint");
    await notifySlack({
      channel: "ops",
      kind: "email_complaint",
      text: `:rotating_light: Spam complaint — ${escapeSlack(maskEmail(email))} suppressed. Review template + sender reputation.`,
      username: "ops_alerts",
    });
  } else if (payload.type === "email.failed") {
    // B3: Resend rejected the send before delivery attempt (different from
    // hard bounce). Rare. Often a misconfigured From address or invalid
    // recipient format. Worth a per-event ping so it surfaces quickly.
    logger.warn({ email, type: payload.type }, "Resend email.failed");
    await notifySlack({
      channel: "ops",
      kind: "email_failed",
      text: `:x: Resend rejected the send — ${escapeSlack(maskEmail(email))} (Resend returned email.failed)`,
      username: "ops_alerts",
    });
  } else if (payload.type === "email.delivery_delayed") {
    // B4: Resend hit a transient delay (recipient server slow / temp
    // greylisting). Early signal of deliverability degradation. Rare.
    logger.warn({ email, type: payload.type }, "Resend email.delivery_delayed");
    await notifySlack({
      channel: "ops",
      kind: "email_delivery_delayed",
      text: `:hourglass_flowing_sand: Resend delivery delayed for ${escapeSlack(maskEmail(email))}. Recipient mail server slow or greylisting.`,
      username: "ops_alerts",
    });
  } else if (payload.type === "email.opened") {
    // B1: aggregate-only — bump daily KV counter, surfaced in the morning
    // digest. NO per-event Slack ping (would be hundreds per day).
    await bumpEmailEngagement("opened");
  } else if (payload.type === "email.clicked") {
    // B2: same as B1 but for clicks (CTR signal).
    await bumpEmailEngagement("clicked");
  } else {
    logger.info({ email, type: payload.type }, "Resend webhook received");
  }

  return NextResponse.json({ ok: true });
}
