/**
 * Where a sign-in to the admin goes back to: the page its link was for.
 *
 * A link to an AP-Analytics view (a period, a filter) lost itself at the sign-in: the proxy
 * sent the visitor to /admin/login with nothing, and the sign-in always landed on /admin/ap. So
 * the page travels as `next` through the login page, the magic link and its callback, and every
 * one of them reads it through this one function.
 *
 * LAX, IT IS AN OPEN REDIRECT. The callback redirects to text that came in a link, so only a
 * same-site admin path passes: one that starts with "/admin/", is made only of the characters
 * our own admin links use (letters, digits, - . _ ~ / ? & = #), and has no "//" and no ".."
 * segment. That leaves out a backslash, a scheme (":"), an "@", whitespace and every
 * percent-encoding ("%"), so no encoded "//" or "\" can get through either. Anything else is
 * null, and the caller falls back to ADMIN_HOME.
 */
export const ADMIN_HOME = "/admin/ap";

const ADMIN_PATH = /^\/admin\/[A-Za-z0-9\-._~/?&=#]*$/;
const DOT_DOT = /(^|\/)\.\.(\/|$|[?#])/;
/** Longer than any link the admin makes; a longer one is not ours. */
const MAX_LENGTH = 1024;

export function safeAdminNext(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length > MAX_LENGTH) return null;
  if (!ADMIN_PATH.test(raw) || raw.includes("//") || DOT_DOT.test(raw)) return null;
  // Belt and braces: whatever a URL parser makes of it, it must stay on this site's /admin/.
  const base = "https://admin.invalid";
  const url = new URL(raw, base);
  return url.origin === base && url.pathname.startsWith("/admin/") ? raw : null;
}
