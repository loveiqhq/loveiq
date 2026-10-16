/**
 * The Traffic page's arithmetic, shared by the server and the page: the contribution after
 * fees, report cost and ads (with the assumptions the page lets you edit), and every figure
 * built from a period's counts. Pure, so the page recomputes as the assumptions change.
 */

/** What a period (or one row of a breakdown) counted. Null where it can't be known. */
export interface Counts {
  /** Google Ads spend, EUR. */
  spend: number | null;
  /** Google Ads clicks and impressions. */
  clicks: number | null;
  impressions: number | null;
  visitors: number | null;
  starts: number | null;
  /** Finished surveys. */
  completes: number;
  /** Of those finishers, people who paid (so far), their sales and the revenue. */
  payers: number;
  sales: number;
  revenue: number;
  /** Payers whose sale was a full unlock (Full, Full All, Core). */
  fullPayers: number;
}

export interface Assumptions {
  /** Payment fee, percent of revenue. */
  feePct: number;
  /** Fee per payment, EUR. */
  feeFix: number;
  /** Variable cost per report (per finished survey), EUR. */
  varCost: number;
  /** VAT included in revenue, percent. */
  vat: number;
}

/** The design's starting values: Stripe's standard card fee, a report's running cost, no VAT. */
export const DEFAULT_ASSUMPTIONS: Assumptions = {
  feePct: 2.9,
  feeFix: 0.25,
  varCost: 0.05,
  vat: 0,
};

const div = (a: number | null, b: number | null) =>
  a === null || b === null || b === 0 || !Number.isFinite(a) || !Number.isFinite(b) ? null : a / b;

/** Revenue net of VAT, less payment fees, the reports' running cost and the ads. */
export function contribution(c: Counts, a: Assumptions): number | null {
  if (c.spend === null) return null;
  const net = c.revenue / (1 + a.vat / 100);
  const fees = c.revenue * (a.feePct / 100) + c.sales * a.feeFix;
  return net - fees - c.completes * a.varCost - c.spend;
}

export type KpiKey =
  | "spend"
  | "cpc"
  | "visitors"
  | "submitCvr"
  | "contribPerVisitor"
  | "revPerVisitor"
  | "roas"
  | "visitorToPaid"
  | "purchaseCvr";

/** The nine headline figures, in the design's order. */
export const KPI_KEYS: KpiKey[] = [
  "spend",
  "cpc",
  "visitors",
  "submitCvr",
  "contribPerVisitor",
  "revPerVisitor",
  "roas",
  "visitorToPaid",
  "purchaseCvr",
];

export function kpi(key: KpiKey, c: Counts, a: Assumptions): number | null {
  switch (key) {
    case "spend":
      return c.spend;
    case "cpc":
      return div(c.spend, c.clicks);
    case "visitors":
      return c.visitors;
    case "submitCvr":
      return div(c.completes, c.visitors);
    case "contribPerVisitor":
      return div(contribution(c, a), c.visitors);
    case "revPerVisitor":
      return div(c.revenue, c.visitors);
    case "roas":
      return div(c.revenue, c.spend);
    case "visitorToPaid":
      return div(c.payers, c.visitors);
    case "purchaseCvr":
      return div(c.payers, c.completes);
  }
}

export { div as ratioOrNull };
