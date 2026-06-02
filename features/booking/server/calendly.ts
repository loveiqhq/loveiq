import { createHmac, timingSafeEqual } from "crypto";
import { fetchWithTimeout } from "@shared/http/fetch-with-timeout";
import logger from "@shared/observability/logger";

const SUPABASE_TIMEOUT_MS = 5_000;
// Calendly recommends rejecting events whose signature timestamp is more than
// 3 minutes from now (replay protection).
const SIGNATURE_TOLERANCE_SEC = 180;

/** Minimal shape of the Calendly v2 webhook envelope we consume. */
export interface CalendlyWebhookPayload {
  event?: string; // "invitee.created" | "invitee.canceled" | …
  payload?: {
    email?: string | null;
    name?: string | null;
    /** Invitee resource URI — unique per booking; our idempotency key. */
    uri?: string | null;
    scheduled_event?: {
      uri?: string | null;
      start_time?: string | null;
    } | null;
    tracking?: {
      utm_content?: string | null;
      utm_campaign?: string | null;
      [k: string]: unknown;
    } | null;
    [k: string]: unknown;
  } | null;
}

interface SupabaseCfg {
  url: string;
  headers: Record<string, string>;
}

function supabaseCfg(): SupabaseCfg | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return {
    url,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
  };
}

/**
 * Verify a Calendly webhook signature.
 *
 * Header `Calendly-Webhook-Signature: t=<unix_seconds>,v1=<hex>`. The signed
 * base string is `${t}.${rawBody}`, HMAC-SHA256 with the subscription's signing
 * key, hex-encoded. Rejects signatures whose timestamp is outside the tolerance
 * window (replay guard). Constant-time comparison. `nowMs` is injectable for
 * deterministic tests.
 */
export function verifyCalendlySignature(
  rawBody: string,
  header: string | null,
  secret: string,
  nowMs: number = Date.now()
): boolean {
  if (!header) return false;
  const parts: Record<string, string> = {};
  for (const segment of header.split(",")) {
    const idx = segment.indexOf("=");
    if (idx > 0) parts[segment.slice(0, idx).trim()] = segment.slice(idx + 1).trim();
  }
  const t = parts.t;
  const v1 = parts.v1;
  if (!t || !v1) return false;

  const tsSec = Number(t);
  if (!Number.isFinite(tsSec)) return false;
  if (Math.abs(nowMs / 1000 - tsSec) > SIGNATURE_TOLERANCE_SEC) return false;

  const expected = createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex");
  const expectedBuf = Buffer.from(expected);
  const providedBuf = Buffer.from(v1);
  if (expectedBuf.length !== providedBuf.length) return false;
  return timingSafeEqual(expectedBuf, providedBuf);
}

/**
 * Application-level idempotency for the Calendly webhook (mirrors the Resend
 * pattern). Returns true if `eventKey` is new (caller should process), false if
 * already handled. Fails OPEN on Supabase error / missing config — prefer
 * occasional reprocessing over silently dropping a booking.
 */
export async function claimCalendlyEvent(eventKey: string, eventType: string): Promise<boolean> {
  const cfg = supabaseCfg();
  if (!cfg) return true;
  try {
    const res = await fetchWithTimeout(`${cfg.url}/rest/v1/calendly_webhook_event`, {
      method: "POST",
      headers: { ...cfg.headers, Prefer: "return=minimal" },
      body: JSON.stringify({ event_key: eventKey, event_type: eventType }),
      timeoutMs: 3000,
    });
    if (res.status === 409) return false; // unique conflict — already handled
    if (!res.ok) {
      logger.warn({ status: res.status, eventKey }, "Calendly webhook claim non-ok — failing open");
      return true;
    }
    return true;
  } catch (err) {
    logger.warn({ err, eventKey }, "Calendly webhook claim threw — failing open");
    return true;
  }
}

/**
 * Release a previously-claimed event key (delete the idempotency row) so a
 * Calendly retry can reprocess. Called when the booking insert fails after the
 * claim was written — without this the retry would dedupe into a no-op and the
 * booking would be permanently lost. Best-effort; logs on failure.
 */
export async function releaseCalendlyEvent(eventKey: string): Promise<void> {
  const cfg = supabaseCfg();
  if (!cfg) return;
  try {
    await fetchWithTimeout(
      `${cfg.url}/rest/v1/calendly_webhook_event?event_key=eq.${encodeURIComponent(eventKey)}`,
      { method: "DELETE", headers: { ...cfg.headers, Prefer: "return=minimal" }, timeoutMs: 3000 }
    );
  } catch (err) {
    logger.warn({ err, eventKey }, "Calendly webhook claim release failed");
  }
}

async function selectOne<T>(cfg: SupabaseCfg, path: string): Promise<T | null> {
  try {
    const res = await fetchWithTimeout(`${cfg.url}${path}`, {
      cache: "no-store",
      headers: cfg.headers,
      timeoutMs: SUPABASE_TIMEOUT_MS,
    });
    if (!res.ok) return null;
    const rows = (await res.json()) as T[];
    return rows[0] ?? null;
  } catch {
    return null;
  }
}

async function resolveSubmissionByEmail(cfg: SupabaseCfg, email: string): Promise<number | null> {
  const user = await selectOne<{ id: number }>(
    cfg,
    `/rest/v1/app_user?email=eq.${encodeURIComponent(email)}&select=id&limit=1`
  );
  if (!user?.id) return null;
  const submission = await selectOne<{ id: number }>(
    cfg,
    `/rest/v1/survey_submission?user_id=eq.${user.id}&select=id&order=created_date_time.desc&limit=1`
  );
  return submission?.id ?? null;
}

export interface BookingCorrelation {
  submissionId: number | null;
  personalReportId: number | null;
}

/**
 * Resolve a booking to a submission / personal report. Primary key is
 * `utm_content` (the survey submission id we stamp into the Calendly CTA);
 * falls back to the invitee email → app_user → latest submission. Returns nulls
 * when nothing resolves — the booking row is still stored (email + raw) so the
 * data is never lost and can be reconciled later.
 */
export async function correlateBooking({
  utmContent,
  email,
}: {
  utmContent?: string | null;
  email?: string | null;
}): Promise<BookingCorrelation> {
  const cfg = supabaseCfg();
  if (!cfg) return { submissionId: null, personalReportId: null };

  // Primary: utm_content is the submission id we stamped into the Calendly CTA.
  // It travels in a user-editable URL, so confirm it resolves to a real
  // personal_report before trusting it — a forged/stale value must not reach the
  // booking_event FK and fail the insert.
  if (utmContent && /^\d+$/.test(utmContent)) {
    const submissionId = Number(utmContent);
    const report = await selectOne<{ id: number }>(
      cfg,
      `/rest/v1/personal_report?survey_submission_id=eq.${submissionId}&select=id&limit=1`
    );
    if (report?.id) return { submissionId, personalReportId: report.id };
  }

  // Fallback: invitee email → app_user → latest submission. The submission id
  // comes from a live survey_submission row, so it's always FK-safe.
  if (email) {
    const submissionId = await resolveSubmissionByEmail(cfg, email.toLowerCase().trim());
    if (submissionId) {
      const report = await selectOne<{ id: number }>(
        cfg,
        `/rest/v1/personal_report?survey_submission_id=eq.${submissionId}&select=id&limit=1`
      );
      return { submissionId, personalReportId: report?.id ?? null };
    }
  }

  return { submissionId: null, personalReportId: null };
}

export interface BookingEventInsert {
  submissionId: number | null;
  personalReportId: number | null;
  email: string | null;
  eventType: "call_invite_sent" | "call_booked" | "call_canceled" | "call_coupon_sent";
  sourceCampaign?: string | null;
  calendlyEventUri?: string | null;
  calendlyInviteeUri?: string | null;
  scheduledAt?: string | null;
  raw?: unknown;
}

/** Insert a booking_event row. Best-effort: logs + swallows on failure. */
export async function insertBookingEvent(input: BookingEventInsert): Promise<boolean> {
  const cfg = supabaseCfg();
  if (!cfg) return false;
  try {
    const res = await fetchWithTimeout(`${cfg.url}/rest/v1/booking_event`, {
      method: "POST",
      headers: { ...cfg.headers, Prefer: "return=minimal" },
      body: JSON.stringify({
        survey_submission_id: input.submissionId,
        personal_report_id: input.personalReportId,
        email: input.email,
        event_type: input.eventType,
        source_campaign: input.sourceCampaign ?? null,
        calendly_event_uri: input.calendlyEventUri ?? null,
        calendly_invitee_uri: input.calendlyInviteeUri ?? null,
        scheduled_at: input.scheduledAt ?? null,
        raw: input.raw ?? {},
      }),
      timeoutMs: SUPABASE_TIMEOUT_MS,
    });
    if (!res.ok) {
      logger.warn(
        { status: res.status, eventType: input.eventType },
        "booking_event insert non-ok"
      );
      return false;
    }
    return true;
  } catch (err) {
    logger.warn({ err, eventType: input.eventType }, "booking_event insert threw");
    return false;
  }
}

const EVENT_TYPE_MAP: Record<string, "call_booked" | "call_canceled"> = {
  "invitee.created": "call_booked",
  "invitee.canceled": "call_canceled",
};

export type CalendlyProcessResult =
  | { status: "ignored" }
  | { status: "stored"; eventType: "call_booked" | "call_canceled" }
  | { status: "insert_failed"; eventType: "call_booked" | "call_canceled" };

/**
 * Map a verified Calendly event to a booking_event row and persist it.
 * `ignored` = an event type we don't track; `stored` = row written;
 * `insert_failed` = the Supabase write failed (caller should let Calendly retry).
 */
export async function processCalendlyEvent(
  payload: CalendlyWebhookPayload
): Promise<CalendlyProcessResult> {
  const eventType = payload.event ? EVENT_TYPE_MAP[payload.event] : undefined;
  if (!eventType) return { status: "ignored" };

  const data = payload.payload ?? {};
  const email = data.email?.toLowerCase().trim() || null;
  const tracking = data.tracking ?? {};
  const utmContent = typeof tracking.utm_content === "string" ? tracking.utm_content : null;
  const sourceCampaign = typeof tracking.utm_campaign === "string" ? tracking.utm_campaign : null;

  const { submissionId, personalReportId } = await correlateBooking({ utmContent, email });

  const ok = await insertBookingEvent({
    submissionId,
    personalReportId,
    email,
    eventType,
    sourceCampaign,
    calendlyEventUri: data.scheduled_event?.uri ?? null,
    calendlyInviteeUri: data.uri ?? null,
    scheduledAt: data.scheduled_event?.start_time ?? null,
    raw: payload,
  });

  return ok ? { status: "stored", eventType } : { status: "insert_failed", eventType };
}

/** Build the idempotency key for an event. `${event}:${inviteeUri}` is unique. */
export function calendlyEventKey(payload: CalendlyWebhookPayload): string | null {
  const inviteeUri = payload.payload?.uri;
  if (!payload.event || !inviteeUri) return null;
  return `${payload.event}:${inviteeUri}`;
}
