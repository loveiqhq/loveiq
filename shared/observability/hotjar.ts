/**
 * Hotjar helpers — strictly client-side.
 *
 * Hotjar v6 stores the user identifier in a cookie called
 * `_hjSessionUser_<siteid>`. Two encodings have shipped in the wild:
 *   1. URL-encoded JSON: `{"id":"<uuid>","created":...}`
 *   2. URL-encoded BASE64-encoded JSON (current default in Hotjar v6).
 *
 * `readHotjarUserId` tolerates both. It is used by the survey-complete handler
 * to attach the Hotjar user id to the submission row so admins can deep-link
 * to recordings.
 */

const HOTJAR_USER_ID_MAX = 64;

function getHotjarSiteId(): string | null {
  const id = process.env.NEXT_PUBLIC_HOTJAR_SITE_ID;
  if (!id || !/^\d+$/.test(id)) return null;
  return id;
}

function tryParseJson(value: string): unknown | null {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function tryBase64DecodeToJson(value: string): unknown | null {
  // Browsers expose `atob`. Be defensive in case the cookie value is also
  // padded or stripped of padding.
  if (typeof atob !== "function") return null;
  try {
    const padded = value + "=".repeat((4 - (value.length % 4)) % 4);
    const decoded = atob(padded);
    return tryParseJson(decoded);
  } catch {
    return null;
  }
}

function extractIdFromObject(parsed: unknown): string | null {
  if (!parsed || typeof parsed !== "object") return null;
  const obj = parsed as Record<string, unknown>;
  const direct = typeof obj.id === "string" ? obj.id : null;
  if (direct) return direct;
  const altKey = typeof obj.user_id === "string" ? obj.user_id : null;
  return altKey;
}

export function readHotjarUserId(): string | null {
  if (typeof document === "undefined") return null;
  const siteId = getHotjarSiteId();
  if (!siteId) return null;
  const cookieName = `_hjSessionUser_${siteId}`;
  const match = document.cookie.split("; ").find((row) => row.startsWith(`${cookieName}=`));
  if (!match) return null;
  const raw = decodeURIComponent(match.slice(match.indexOf("=") + 1));

  // Hotjar v6 typically writes a base64-encoded JSON blob; older versions
  // wrote plain JSON. Try plain JSON first (cheap, common in legacy data),
  // fall back to base64 → JSON.
  const parsed = tryParseJson(raw) ?? tryBase64DecodeToJson(raw);
  const id = extractIdFromObject(parsed);
  if (!id) return null;
  return id.slice(0, HOTJAR_USER_ID_MAX);
}
