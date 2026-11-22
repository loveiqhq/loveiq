/** Spelled out, as AP's days.ts does: ICU builds disagree, and en-GB says "Sept" in some. */
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Mira's one short date (SET-12): "22 Nov", with the year only when it isn't this one ("25 Nov
 * 2025"). Always in English day-month order, whatever the browser's language, as the app is.
 */
export function shortDate(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const day = `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  return d.getFullYear() === now.getFullYear() ? day : `${day} ${d.getFullYear()}`;
}
