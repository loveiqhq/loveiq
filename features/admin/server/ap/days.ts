/**
 * Day arithmetic on "YYYY-MM-DD" strings, for the AP-Analytics pages and the browser alike
 * (no server imports: the filter bar runs in the browser).
 */

export function addDays(day: string, n: number): string {
  const [y = 1970, m = 1, d = 1] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "21 Sep". Spelled out because ICU builds disagree ("Sep" vs "Sept"). */
export function shortDate(day: string): string {
  const [, m = 1, d = 1] = day.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]}`;
}

/** "22 to 24 Nov", or "30 Nov to 2 Dec" across a month end: a run of days as people say it. */
export function dayRange(from: string, to: string): string {
  if (from === to) return shortDate(from);
  const [fromDay, fromMonth] = shortDate(from).split(" ");
  const toLabel = shortDate(to);
  return fromMonth === toLabel.split(" ")[1]
    ? `${fromDay} to ${toLabel}`
    : `${shortDate(from)} to ${toLabel}`;
}
