/**
 * Hotjar helpers — strictly client-side.
 *
 * Hotjar stores its user_id in a cookie called `_hjSessionUser_<siteid>`,
 * URL-encoded JSON shaped roughly like `{"id":"...","created":...}`. This
 * helper reads + parses it, returning the user id or null. Used by the
 * survey complete handler to attach the Hotjar id to the submission row so
 * admins can deep-link to recordings.
 */

const HOTJAR_USER_ID_MAX = 64;

export function getHotjarSiteId(): string | null {
  const id = process.env.NEXT_PUBLIC_HOTJAR_SITE_ID;
  if (!id || !/^\d+$/.test(id)) return null;
  return id;
}

export function readHotjarUserId(): string | null {
  if (typeof document === "undefined") return null;
  const siteId = getHotjarSiteId();
  if (!siteId) return null;
  const cookieName = `_hjSessionUser_${siteId}`;
  const match = document.cookie.split("; ").find((row) => row.startsWith(`${cookieName}=`));
  if (!match) return null;
  const raw = decodeURIComponent(match.slice(match.indexOf("=") + 1));
  try {
    const parsed = JSON.parse(raw);
    const id =
      typeof parsed?.id === "string"
        ? parsed.id
        : typeof parsed?.user_id === "string"
          ? parsed.user_id
          : null;
    if (!id) return null;
    return id.slice(0, HOTJAR_USER_ID_MAX);
  } catch {
    return null;
  }
}
