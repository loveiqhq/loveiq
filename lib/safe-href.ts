/**
 * Sanitize an external href before passing it to `<a href={...}>`.
 *
 * React does NOT block `javascript:` URLs in href props in production —
 * it only logs a dev-mode warning. Without sanitization, an admin (or a
 * compromised admin session) writing into `admin_research_repository_entry`
 * could store `javascript:fetch('/api/admin/...')`. When another admin
 * opens that view and clicks the link, the script executes in their
 * authenticated context — admin-vs-admin XSS.
 *
 * Allowed schemes: `http://`, `https://`, `mailto:`, `tel:`, and relative
 * paths starting with `/`. Anything else returns `null`; callers should
 * render the link as plain text or hide it.
 */
const SAFE_SCHEME = /^(https?:|mailto:|tel:)/i;

export function safeHref(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  // Same-origin relative paths are always safe. Block protocol-relative
  // (`//evil.com`) which browsers interpret as cross-origin.
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) return trimmed;

  // Anchors within the page.
  if (trimmed.startsWith("#")) return trimmed;

  // Absolute URLs — only http/https/mailto/tel.
  if (SAFE_SCHEME.test(trimmed)) return trimmed;

  return null;
}
