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
