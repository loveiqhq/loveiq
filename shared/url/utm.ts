/**
 * Global UTM parameter capture and retrieval.
 *
 * Captures the five standard UTM params from the URL on every page load and
 * persists them in localStorage so they survive navigation and refresh.
 * Consumers (survey submission, waitlist form, etc.) call `getStoredUtm()`
 * to read the stored JSON string.
 *
 * Also captures Google Ads click ids (gclid / gbraid / wbraid). Ads auto-tagging
 * (the default) sends a click id with NO utm_* params, so those clicks would
 * otherwise be recorded as "Direct"; we keep the click id and normalize the
 * session to google/cpc for correct first-party attribution.
 *
 * And the ValueTrack detail (`matchtype`, `network`) that a Final URL suffix can
 * add. Those are not utm_-prefixed, so an allowlist of utm_* keys silently drops
 * them — which is exactly what happened until it was measured.
 */

const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"] as const;

/** Google Ads click identifiers appended by auto-tagging (gbraid/wbraid are iOS). */
const CLICK_ID_KEYS = ["gclid", "gbraid", "wbraid"] as const;

/**
 * Google Ads ValueTrack detail, when the Final URL suffix supplies it.
 *
 * NOT utm_-prefixed, which is why they need naming separately — and why they were
 * silently dropped for as long as they have been sent. `classifyTraffic` in
 * features/attribution/server/traffic.ts already reads `matchtype` and `network`
 * and `trafficLine` already renders them into the Slack survey ping, but the
 * capture allowlist above never let them through, so that branch could never
 * fire. Measured after tagging went live: ads arrived with utm_campaign and
 * utm_term populated and these two null.
 *
 * `matchtype` is e/p/b (exact, phrase, broad) and `network` is g/s/d/u — short
 * enum-ish codes. They are URL-supplied and therefore attacker-controllable, so
 * they get the same treatment as every utm value: length-capped in
 * `classifyTraffic` and escaped before reaching Slack.
 */
const VALUE_TRACK_KEYS = ["matchtype", "network"] as const;

/** Current global storage key. */
export const GLOBAL_UTM_KEY = "loveiq-utm";

/** Legacy key used by the survey flow before global capture existed. */
export const LEGACY_UTM_KEY = "loveiq-survey-utm";

/**
 * Read UTM params from the current URL and persist them in localStorage.
 * If the URL contains no UTM params, existing stored values are left intact.
 *
 * @returns JSON string of captured UTM params, or `null` if none found in URL.
 */
export function captureUtmFromUrl(): string | null {
  if (typeof window === "undefined") return null;

  const params = new URLSearchParams(window.location.search);
  const utm = new Map<string, string>();

  for (const key of UTM_KEYS) {
    const value = params.get(key);
    if (value) utm.set(key, value);
  }

  // Google Ads auto-tagging lands users with a click id — `gclid`, or
  // `gbraid`/`wbraid` on iOS — and NO utm_* params. Capture the click id and,
  // when the campaign didn't also set utm_source, synthesize google/cpc so the
  // whole first-party pipeline (traffic classification, funnel, pricing) attributes
  // the session to paid Google instead of Direct. The raw click id is kept too so
  // a conversion can be tied back to the ad click later (offline conversion import).
  let hasClickId = false;
  for (const key of CLICK_ID_KEYS) {
    const value = params.get(key);
    if (value) {
      utm.set(key, value);
      hasClickId = true;
    }
  }
  if (hasClickId) {
    if (!utm.has("utm_source")) utm.set("utm_source", "google");
    if (!utm.has("utm_medium")) utm.set("utm_medium", "cpc");
  }

  // ValueTrack detail rides alongside the utm_* params, not inside them — it is
  // DETAIL about an attribution signal, never a signal on its own. Collected
  // separately and merged only once something real was found, because writing it
  // into `utm` directly made `utm.size` non-zero for a URL carrying nothing but
  // `?matchtype=e&network=g`, which then STORED and overwrote a genuine earlier
  // first-touch value with two meaningless fields.
  const valueTrack = new Map<string, string>();
  for (const key of VALUE_TRACK_KEYS) {
    const value = params.get(key);
    if (value) valueTrack.set(key, value);
  }

  if (utm.size === 0) return null;
  for (const [key, value] of valueTrack) utm.set(key, value);

  const json = JSON.stringify(Object.fromEntries(utm));
  try {
    localStorage.setItem(GLOBAL_UTM_KEY, json);
    // Also write to the legacy key so older survey hooks pick it up
    localStorage.setItem(LEGACY_UTM_KEY, json);
  } catch {
    // Storage full or unavailable — continue with in-memory value
  }
  return json;
}

/**
 * Retrieve the stored UTM JSON string.
 * Checks the global key first, then falls back to the legacy survey key.
 *
 * @returns JSON string of UTM params, or `null` if nothing is stored.
 */
export function getStoredUtm(): string | null {
  if (typeof window === "undefined") return null;

  try {
    return localStorage.getItem(GLOBAL_UTM_KEY) ?? localStorage.getItem(LEGACY_UTM_KEY);
  } catch {
    return null;
  }
}

/**
 * Normalize a raw utm_source into a single canonical channel label.
 *
 * Both writers of `funnel_event.utm_source` — the server visit path (proxy.ts →
 * recordUniqueVisit) and the client survey-start path (SurveyEngine → funnel-event
 * route) — call this so a given source string normalizes to the same canonical
 * label on both rows. NOTE: it only unifies FORMAT, not provenance — the visitor
 * row is last-touch (live URL on the daily visit) while the survey row is
 * first-touch (sticky localStorage), so per-channel start-rate is DIRECTIONAL,
 * not an exact numerator/denominator match for returning/multi-day visitors.
 * Also strips to a safe charset at the trust boundary (the raw value is
 * attacker-controllable via the URL), caps length, and lowercases.
 *
 * @returns the cleaned source, or `undefined` when there's nothing usable.
 */
export function sanitizeUtmSource(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  // trim BEFORE slice so leading/trailing whitespace doesn't eat into the
  // 64-char budget (and can't clip the real token). charset-strip runs first so
  // control chars / CRLF are gone before anything else.
  const cleaned = raw
    .replace(/[^\w.\- ]/g, "")
    .trim()
    .slice(0, 64)
    .toLowerCase();
  return cleaned || undefined;
}
