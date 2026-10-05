import { createHmac, timingSafeEqual } from "crypto";
import { fetchWithTimeout } from "@shared/http/fetch-with-timeout";
import logger from "@shared/observability/logger";

const SUPABASE_TIMEOUT_MS = 5_000;
// Calendly recommends rejecting events whose signature timestamp is more than
// 3 minutes from now (replay protection).
const SIGNATURE_TOLERANCE_SEC = 180;

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
 * One row in `booking_event`, the log of call-related things we did to a person.
 *
 * This is all that survives of the Calendly integration, removed on 2026-09-14: the
 * webhook, its signature check, its idempotency table and the 78h call-invite email are
 * gone because the company does not use Calendly. `booking_event` itself stays — it holds
 * 234 real records of invitations sent to real people in June 2026, and the data-subject
 * export and erasure paths both read it, so dropping it would break a GDPR request.
 *
 * The one remaining writer is the admin "grant post-call coupon" action.
 */
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
