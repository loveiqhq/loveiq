/**
 * The Business Case cost sheet: where the monthly invoice filing writes each vendor's
 * charge (app/api/cron/file-invoices), and where cost_watch reads it back. One place, so
 * the two cannot drift apart.
 */

// eslint-disable-next-line no-secrets/no-secrets -- public Sheets file id, not a credential
export const COST_SHEET_ID = "11ulNYMtbZ34eQEdBFaW2OWn1FpRvYH9GFRwAoc_8rXE";
export const COST_SHEET_TAB = "Costs";
/** The Costs tab as raw numbers, the way both of them read it. */
export const COST_SHEET_READ_URL =
  `https://sheets.googleapis.com/v4/spreadsheets/${COST_SHEET_ID}/values/${COST_SHEET_TAB}!A1:AZ60` +
  // eslint-disable-next-line no-secrets/no-secrets -- a Sheets API parameter, not a secret
  "?valueRenderOption=UNFORMATTED_VALUE";

/**
 * The categories cost_watch reports: tools and services. Everything else is left out,
 * which is how people's pay stays out: listing the pay categories instead would let a new
 * one ("Salaries", "Team") through. Checked 2026-09-27: the sheet also uses "FTE -
 * Freelance", "Freelance - part time" and "Intern - full time", all people.
 */
export const TOOL_CATEGORIES = ["Software", "Marketing", "Books", "Other"];

/** Vendors that bill us but never attach a PDF, so their lines are kept by hand. */
export const NEVER_ATTACHES = [
  { sheetName: "Figma", why: "emails a receipt link, not a PDF" },
  { sheetName: "Adwords", why: "billing doc lives in the Ads console; spend is read from GA4" },
  { sheetName: "Upwork - Arsalan Majid", why: "HTML summary, hourly not fixed" },
  { sheetName: "Domain - united-domains", why: "registrar mails the portfolio owner only" },
];

/** A Costs-tab date serial (a day count between 2009 and 2119); any other number is not a date. */
export function isDateSerial(v: unknown): v is number {
  return typeof v === "number" && v > 40_000 && v < 80_000;
}

/** The month a Costs-tab date serial stands for (a spreadsheet day count from 1899-12-30). */
export function serialMonth(serial: number): string {
  return new Date(Date.UTC(1899, 11, 30) + serial * 86_400_000).toISOString().slice(0, 7);
}

const monthAfter = (ym: string): string => {
  const [y = 0, m = 0] = ym.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
};

/**
 * The columns the sheet models as months: the longest run of row-1 date serials going up one
 * calendar month at a time. Anything else in row 1 (an "as of" date, a "Total 2026" column, a
 * note after the last month) falls outside it, so no write lands on it or is carried across it.
 */
export function monthColumns(header: unknown[]): { first: number; last: number } | null {
  let best: { first: number; last: number } | null = null;
  let first = -1;
  let prev = "";
  header.forEach((v, i) => {
    if (!isDateSerial(v)) {
      first = -1;
      return;
    }
    const month = serialMonth(v);
    if (first < 0 || month !== monthAfter(prev)) first = i;
    prev = month;
    if (!best || i - first > best.last - best.first) best = { first, last: i };
  });
  return best;
}
