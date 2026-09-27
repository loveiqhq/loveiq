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

/** Vendors that bill us but never attach a PDF, so their lines are kept by hand. */
export const NEVER_ATTACHES = [
  { sheetName: "Figma", why: "emails a receipt link, not a PDF" },
  { sheetName: "Adwords", why: "billing doc lives in the Ads console; spend is read from GA4" },
  { sheetName: "Upwork - Arsalan Majid", why: "HTML summary, hourly not fixed" },
  { sheetName: "Domain - united-domains", why: "registrar mails the portfolio owner only" },
];
