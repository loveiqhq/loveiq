/**
 * Global UTM parameter capture and retrieval.
 *
 * Captures the five standard UTM params from the URL on every page load and
 * persists them in localStorage so they survive navigation and refresh.
 * Consumers (survey submission, waitlist form, etc.) call `getStoredUtm()`
 * to read the stored JSON string.
 */

const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"] as const;

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

  if (utm.size === 0) return null;

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
