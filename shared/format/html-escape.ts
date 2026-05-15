/**
 * HTML entity escaping for any string that flows into a `dangerouslySetInnerHTML`,
 * an email body, or any other context where the value will be parsed as HTML.
 *
 * Treat user-controlled text (first names, archetype slugs from URLs, share
 * personal messages, etc.) as untrusted and escape before interpolating into
 * a template literal. Without this, an attacker can store XSS that fires for
 * a paying viewer when they open the report or for an admin reviewing the
 * submission queue.
 */
export function escapeHtml(input: string): string {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
