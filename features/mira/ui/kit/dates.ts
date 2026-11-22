/**
 * Mira's one short date (SET-12): "22 Nov", with the year only when it isn't this one ("25 Nov
 * 2025"). Always in English day-month order, whatever the browser's language, as the app is.
 */
export function shortDate(iso: string, now = new Date()): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    ...(d.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
  });
}
