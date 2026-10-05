import { fetchWithTimeout } from "@shared/http/fetch-with-timeout";
import { isLandingVariant } from "@shared/experiments/landingVariant";
import { sanitizeUtmSource } from "@shared/url/utm";
import { reportingDay } from "@shared/time/reporting-day";
import logger from "@shared/observability/logger";

/**
 * Record ONE aggregate, non-identifying daily unique-visit in `funnel_event`.
 *
 * Called from the root layout via `after()` when `proxy.ts` flags a fresh daily
 * visit (consent-independent — it's the denominator for the Visitor→Survey-start
 * CVR, which the consent-gated `__liq_vid` pinger massively under-counted).
 *
 * Privacy: the `visitor_id` is a throwaway random UUID that is NOT persisted
 * client-side and is not linkable to a person or across days — it only makes
 * `COUNT(DISTINCT visitor_id)` equal the number of daily visits. Per-browser
 * daily dedup is handled by the short-lived `liq_dv` cookie in middleware, so
 * this writes at most once per browser per day. Best-effort: a failure must
 * never affect the page.
 */
async function writeFunnelEvent(
  eventType: "unique_visitor" | "survey_page_view",
  variant: string,
  utmSource?: string
): Promise<void> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return;

  // Re-sanitize at the write boundary — do NOT trust the header to have been
  // cleaned. `x-liq-new-visit-utm` is copied from inbound request headers in
  // proxy.ts, so a spoofed/echoed header could otherwise inject arbitrary text
  // into funnel_event.utm_source. This is the single choke point every caller
  // routes through (mirrors the `variant` clamp below).
  const cleanUtm = sanitizeUtmSource(utmSource);

  try {
    const res = await fetchWithTimeout(`${supabaseUrl}/rest/v1/funnel_event`, {
      method: "POST",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        visitor_id: crypto.randomUUID(),
        day: reportingDay(),
        event_type: eventType,
        // Landing A/B arm, stored RAW so the arms stay distinguishable (see proxy.ts).
        //
        // This used to be `variant === "white" ? "white" : "control"`, which wrote
        // round-2's `white_prev` under round-1's RETIRED `control` label. Because
        // this is the server write path, that destroyed the arm at write time: it
        // left one column conflating genuine June dark traffic with today's
        // `white_prev`, and every consumer splitting on it (get_funnel_cvr_sparklines,
        // get_landing_variant_funnel, the admin explorer) reported `white_prev` as
        // "dark". Rows written BEFORE this fix stay ambiguous and must never be
        // relabelled — per-arm visitor counts are only trustworthy from here on.
        //
        // Still clamped, just to the real arm set instead of collapsing: the header
        // this arrives on is copied from an inbound request in proxy.ts, so an
        // unrecognised value must not reach the column.
        // isLandingVariant, not normalizeLandingVariant: the normaliser defaults
        // anything unrecognised to "white", which is exactly the mis-attribution
        // proxy.ts now avoids by sending "unknown". Normalising here would undo
        // it one layer down.
        landing_variant: isLandingVariant(variant) ? variant : "unknown",
        // Last-touch acquisition source for THIS visit (re-sanitized above).
        // Omitted (stays NULL) for direct/untagged visits so COUNT(utm_source)
        // reflects only real campaign traffic.
        ...(cleanUtm ? { utm_source: cleanUtm } : {}),
      }),
      timeoutMs: 3000,
    });
    if (!res.ok) {
      const body = await res
        .clone()
        .text()
        .catch(() => "");
      logger.warn(
        { status: res.status, body: body.slice(0, 200) },
        `recordFunnelEvent(${eventType}) insert non-2xx`
      );
    }
  } catch (err) {
    logger.warn({ err, eventType }, "recordFunnelEvent failed");
  }
}

/**
 * One aggregate daily unique-visit, as described above.
 */
export async function recordUniqueVisit(variant: string, utmSource?: string): Promise<void> {
  return writeFunnelEvent("unique_visitor", variant, utmSource);
}

/**
 * One aggregate daily SURVEY-PAGE view — the consent-independent sibling of the
 * visit count, written by the same code path with the same throwaway per-day id
 * and the same Berlin day clock.
 *
 * WHY IT EXISTS. The step above it in the funnel was `survey_engine_mount`,
 * which the BROWSER posts using the `__liq_vid` cookie — and proxy.ts mints that
 * cookie only after the visitor clicks Accept. So the numerator was
 * consent-gated while its denominator was not, and /admin labelled the
 * difference "Bounced on landing". Measured 2026-09-19 over 30 days: 637
 * visitors reached the consent-gated step against 977 server-written survey
 * drafts, and of 3,172 mount ids all time only 632 (20%) ever appear as a
 * `unique_visitor` id at all — a per-day random UUID against a persistent
 * cookie value, so the two could not be compared even in principle.
 *
 * This is a NEW event type, not a change to the old one. Both run side by side:
 * the existing series keeps its meaning, nothing is double counted, and the
 * difference between them is a direct readout of the consent gap — which is
 * worth being able to see rather than assume.
 */
export async function recordSurveyPageView(variant: string, utmSource?: string): Promise<void> {
  return writeFunnelEvent("survey_page_view", variant, utmSource);
}
