/**
 * The checkout status page's states, as its off-production preview names them
 * (`/sexual-archetype/checkout?preview=<state>`). Pure, so the server page can check the
 * parameter and the client page can draw the switcher from one list.
 */
export const STATUS_PREVIEWS = [
  ["verifying", "08 Verifying"],
  ["received", "09 Payment received"],
  ["complete", "10 Payment complete"],
  ["used", "Already used"],
  ["used_no_report", "Used, no report link"],
  ["failed", "Not paid"],
  ["refunded", "Refunded"],
  ["slow", "Still settling"],
  ["unknown", "Unknown session"],
  ["error", "Status check failed"],
  ["missing", "No session"],
  ["paused", "Checkout paused"],
] as const;

export type StatusPreview = (typeof STATUS_PREVIEWS)[number][0];

export function isStatusPreview(value: unknown): value is StatusPreview {
  return STATUS_PREVIEWS.some(([state]) => state === value);
}
