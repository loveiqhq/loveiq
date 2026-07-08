import { fetchWithTimeout } from "@shared/http/fetch-with-timeout";
import { sanitizeUtmSource } from "@shared/url/utm";
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
export async function recordUniqueVisit(variant: string, utmSource?: string): Promise<void> {
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
        day: new Date().toISOString().slice(0, 10),
        event_type: "unique_visitor",
        // Landing A/B arm so the digest can split dark vs white (see proxy.ts).
        landing_variant: variant === "white" ? "white" : "control",
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
        "recordUniqueVisit insert non-2xx"
      );
    }
  } catch (err) {
    logger.warn({ err }, "recordUniqueVisit failed");
  }
}
