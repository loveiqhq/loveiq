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
 *
 * And, as detail, Meta's click id (`fbclid`) and the referring site's hostname
 * (`referrer_host`), which tell a Meta click and organic search apart from direct.
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

/**
 * Meta's click id, on links clicked in Facebook, Instagram and Messenger whether an ad or not
 * (Meta adds it to ordinary link clicks too). So unlike a Google click id it names no source
 * and fakes no utm_source (pricing reads that): it is detail, capped, with the referrer below.
 */
const META_CLICK_ID_KEY = "fbclid";
/** Long enough for an fbclid; the whole tracker is dropped past 1,000 characters. */
const MAX_CLICK_ID = 200;
const MAX_HOST = 100;

/**
 * The site the visit came from: the referrer's hostname, never its address (a search page's
 * own address can carry the words searched). None for our own pages, and none for Stripe's
 * checkout, which every payment returns from.
 */
function referrerHost(): string | null {
  let host: string;
  try {
    host = new URL(document.referrer).hostname.toLowerCase();
  } catch {
    return null; // no referrer
  }
  host = host.replace(/[^a-z0-9.-]/g, "").slice(0, MAX_HOST);
  if (!host || host === window.location.hostname) return null;
  return /(^|\.)(loveiq\.org|stripe\.com)$/.test(host) ? null : host;
}

/**
 * A path with its campaign and ad-click parameters taken out — the keys this
 * file captures, plus the ones other networks send.
 *
 * For a path that is STORED or REPLAYED, not for attribution (which reads the
 * URL itself, above). The tap tracker's `pathname` used to carry them, so a
 * Google Ads landing put the visitor's `gclid` and search words into
 * `ux_finding.url_path`, and the dead-control probe opened production with
 * them. Everything else is kept, because some of it changes the page — the
 * report's `?v2=1` arm, for one.
 *
 * `utm_` and `gad_` are matched as prefixes: both families grow (`utm_id`,
 * `gad_campaignid`), and a list of today's members is one new parameter away
 * from leaking again.
 */
const TRACKING_KEYS: ReadonlySet<string> = new Set([
  ...CLICK_ID_KEYS,
  ...VALUE_TRACK_KEYS,
  "fbclid",
  "msclkid",
]);

export function withoutTrackingParams(path: string): string {
  const q = path.indexOf("?");
  if (q === -1) return path;
  const params = new URLSearchParams(path.slice(q + 1));
  for (const key of [...params.keys()]) {
    const k = key.toLowerCase();
    if (k.startsWith("utm_") || k.startsWith("gad_") || TRACKING_KEYS.has(k)) params.delete(key);
  }
  const kept = params.toString();
  return path.slice(0, q) + (kept ? `?${kept}` : "");
}

/** Current global storage key. */
export const GLOBAL_UTM_KEY = "loveiq-utm";

/** Legacy key used by the survey flow before global capture existed. */
export const LEGACY_UTM_KEY = "loveiq-survey-utm";

/**
 * Read UTM params from the current URL and persist them in localStorage.
 * If the URL contains no UTM params, existing stored values are left intact;
 * with nothing stored, the referrer and Meta's click id alone are stored.
 *
 * @returns JSON string of what was stored, or `null` if nothing was.
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

  // Where the click came from: Meta's click id and the referring site. Detail too, never a
  // source of its own: it joins a tagged visit, and an untagged one keeps it only when
  // nothing is stored yet, so it never replaces a campaign stored before.
  const detail = new Map<string, string>();
  const fbclid = params
    .get(META_CLICK_ID_KEY)
    ?.replace(/[^\w-]/g, "")
    .slice(0, MAX_CLICK_ID);
  if (fbclid) detail.set(META_CLICK_ID_KEY, fbclid);
  const ref = referrerHost();
  if (ref) detail.set("referrer_host", ref);

  if (utm.size === 0) {
    if (detail.size === 0 || getStoredUtm() !== null) return null;
    return store(detail);
  }
  for (const [key, value] of valueTrack) utm.set(key, value);
  for (const [key, value] of detail) utm.set(key, value);
  return store(utm);
}

function store(utm: Map<string, string>): string {
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
