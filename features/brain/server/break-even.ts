/**
 * Break-even on ads ("turn the survey to report journey break even", Marcus): what the
 * Google Ads spend buys, and the level each lever alone would have to reach for revenue to
 * cover it, from live numbers, with "what if" values in place of any of them.
 *
 * COUNTED AS THE AP-ANALYTICS DASHBOARD COUNTS (ap-numbers.ts says why): its visitors,
 * finished surveys, paying customers and revenue, through its own facts and totals, so the
 * average order is its CLV and spend over the payers its CAC. Every visitor and every buyer,
 * on the days the Google Ads data covers, with spend and revenue over exactly those days:
 * subtracting two numbers that describe different spans is the defect analytics.ts records
 * fixing three times. Blended, not paid traffic alone: direct and organic visitors count
 * too, so this is the funnel's cost of a customer, not a campaign's.
 *
 * The one relation everything below rests on: revenue per visitor is
 *   (visitors who finish) × (finishers who pay) × (average order),
 * and the spend is covered when that reaches the cost per visitor.
 */
import { fetchFacts } from "@features/admin/server/ap/facts";
import { apFilters, apLink } from "@features/brain/server/ap-numbers";
import { dayCount } from "@features/admin/server/ap/filters";
import { ALL, spend, totals } from "@features/admin/server/ap/metrics";
import { adCostByDay } from "@features/brain/server/ingest/analytics";
import { reportingDay } from "@shared/time/reporting-day";

/** Said when Google Ads spend cannot be read: break-even is spend, so there is none to give. */
export const AD_SPEND_UNREAD =
  "Google Ads spend could not be read just now, so there is no break-even to work out. This " +
  "is an outage, not zero spend. Ask again in a few minutes.";

export const MIN_DAYS = 7;
export const MAX_DAYS = 180;
export const DEFAULT_DAYS = 30;
/** Where a window has no purchase, its average order comes from this many days instead. */
const AOV_FALLBACK_DAYS = 180;
/** Below this many purchases a share of finishers who pay is noise, and the answer says so. */
const FEW_PURCHASES = 10;

const DAY_MS = 86_400_000;
const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const addDays = (day: string, n: number) => isoDay(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS);
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const longDay = (d: string) =>
  `${Number(d.slice(8))} ${MONTHS[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}`;

const grouped = (n: number, places: number) =>
  n.toLocaleString("en-GB", { minimumFractionDigits: places, maximumFractionDigits: places });
/** Cents, or tenths of a cent under one euro, where a cost per visitor lives. */
const eur = (n: number) => `EUR ${grouped(n, Math.abs(n) < 1 && n !== 0 ? 3 : 2)}`;
const count = (n: number) => grouped(n, 0);
/** A share as a percentage, with a second decimal under one percent. */
const pct = (share: number) => `${grouped(100 * share, 100 * share < 1 && share !== 0 ? 2 : 1)}%`;
const times = (f: number) => `${grouped(f, f < 10 ? 1 : 0)} times`;

export interface Levers {
  costPerVisitor: number;
  visitorToFinish: number;
  finishToPaid: number;
  averageOrder: number;
}

export interface BreakEvenRequest {
  days?: unknown;
  cost_per_visitor?: unknown;
  visitor_to_finish?: unknown;
  finish_to_paid?: unknown;
  average_order?: unknown;
}

export type BreakEvenOutcome = { ok: false; message: string } | { ok: true; text: string };

type Parsed = { ok: true; value: number | undefined } | { ok: false; message: string };

/** A "what if" value: absent, or a number in range. Shares are given as percentages. */
function parseLever(raw: unknown, name: string, kind: "eur" | "pct"): Parsed {
  if (raw === undefined || raw === null || raw === "") return { ok: true, value: undefined };
  const n = Number(raw);
  const max = kind === "pct" ? 100 : Infinity;
  if (!Number.isFinite(n) || n < 0 || n > max) {
    return {
      ok: false,
      message:
        kind === "pct"
          ? `\`${name}\` is a percentage from 0 to 100, like 5 for 5%, not "${String(raw)}".`
          : `\`${name}\` is an amount in EUR of 0 or more, not "${String(raw)}".`,
    };
  }
  return { ok: true, value: kind === "pct" ? n / 100 : n };
}

/** One lever's line: the level it must reach alone, or why it cannot. */
function target(
  now: number,
  needed: number,
  noun: string,
  words: (v: string) => string,
  show: (v: number) => string,
  share: boolean,
  whatIf: boolean
): string {
  if (!Number.isFinite(needed)) return `${noun}: no level is enough while another lever is zero`;
  const from = whatIf ? `${show(now)} in the what-if` : `now ${show(now)}`;
  const line = `${words(show(needed))} (${from})`;
  return share && needed > 1 ? `${line}, impossible alone` : line;
}

/** The break-even lines for a set of levers, and how far revenue per visitor is from cost. */
export function breakEvenLines(l: Levers, whatIf = false): string[] {
  const perVisitor = l.visitorToFinish * l.finishToPaid * l.averageOrder;
  if (l.costPerVisitor === 0) return ["Nothing was spent, so there is nothing to earn back."];
  const factor = perVisitor > 0 ? l.costPerVisitor / perVisitor : Infinity;
  const lines = [
    `- ${target(l.costPerVisitor, perVisitor, "Cost per visitor", (v) => `each visitor costs at most ${v}`, eur, false, whatIf)}, or`,
    `- ${target(l.visitorToFinish, l.costPerVisitor / (l.finishToPaid * l.averageOrder), "Visitors who finish", (v) => `${v} of visitors finish the survey`, pct, true, whatIf)}, or`,
    `- ${target(l.finishToPaid, l.costPerVisitor / (l.visitorToFinish * l.averageOrder), "Finishers who pay", (v) => `${v} of finishers pay`, pct, true, whatIf)}, or`,
    `- ${target(l.averageOrder, l.costPerVisitor / (l.visitorToFinish * l.finishToPaid), "The average order", (v) => `the average order is ${v}`, eur, false, whatIf)}.`,
  ];
  if (factor <= 1) {
    return [
      `Already above break-even: revenue per visitor (${eur(perVisitor)}) covers its cost ` +
        `${times(1 / factor)} over. Each lever alone could fall to:`,
      ...lines,
    ];
  }
  return [
    whatIf
      ? "To break even from the what-if, any one of these, with the rest as in it:"
      : "To break even, any one of these, with the rest as they are:",
    ...lines,
    Number.isFinite(factor)
      ? `Revenue per visitor has to grow ${times(factor)}, however that is split between the levers.`
      : [l.visitorToFinish, l.finishToPaid, l.averageOrder].filter((v) => v === 0).length === 1
        ? "Revenue per visitor is zero now, so only the lever at zero can close the gap on its own."
        : "Revenue per visitor is zero now and more than one lever is at zero, so no single lever can close the gap.",
  ];
}

interface Sums {
  days: number;
  spend: number;
  visitors: number;
  finished: number;
  paid: number;
  revenue: number;
}

export async function breakEven(
  req: BreakEvenRequest,
  now = Date.now()
): Promise<BreakEvenOutcome> {
  const refuse = (message: string): BreakEvenOutcome => ({ ok: false, message });
  const days =
    req.days === undefined || req.days === null || req.days === ""
      ? DEFAULT_DAYS
      : Number(req.days);
  if (!Number.isInteger(days) || days < MIN_DAYS || days > MAX_DAYS) {
    return refuse(
      `\`days\` is a whole number from ${MIN_DAYS} to ${MAX_DAYS}, not "${String(req.days)}".`
    );
  }
  const parsed = {
    costPerVisitor: parseLever(req.cost_per_visitor, "cost_per_visitor", "eur"),
    visitorToFinish: parseLever(req.visitor_to_finish, "visitor_to_finish", "pct"),
    finishToPaid: parseLever(req.finish_to_paid, "finish_to_paid", "pct"),
    averageOrder: parseLever(req.average_order, "average_order", "eur"),
  };
  for (const p of Object.values(parsed)) if (!p.ok) return refuse(p.message);
  const given = Object.fromEntries(
    Object.entries(parsed).map(([k, p]) => [k, p.ok ? p.value : undefined])
  ) as Partial<Record<keyof Levers, number>>;

  // The dashboard's days: Berlin days, ending yesterday as its ranges do.
  const until = addDays(reportingDay(new Date(now)), -1);
  const from = addDays(until, -(days - 1));
  const ad = await adCostByDay();
  /** The dashboard's totals over [a, b], with the ad spend of those days. */
  const sum = async (a: string, b: string): Promise<Sums> => {
    const t = totals(await fetchFacts(a, b), ALL);
    return {
      days: dayCount(a, b),
      spend: spend(ad, ALL, a, b).eur ?? 0,
      visitors: t.visits ?? 0,
      finished: t.subs,
      paid: t.payers,
      revenue: t.revenue,
    };
  };
  // No window at all is a failed read (adCostByDay swallows its errors), as the dashboard reads
  // it (`spend` in metrics.ts): an outage of the spend itself, never missing data.
  if (ad.from === null || ad.to === null) return refuse(AD_SPEND_UNREAD);
  // The days of the window the ad data covers, which is one unbroken stretch.
  const lo = ad.from > from ? ad.from : from;
  const hi = ad.to < until ? ad.to : until;
  if (lo > hi) {
    return refuse(
      `The Google Ads data covers none of the ${days} days to ${longDay(until)}, so there is no ` +
        "spend to break even against. That is missing data, not zero spend."
    );
  }
  const w = await sum(lo, hi);
  if (w.visitors === 0)
    return refuse("No visitors were recorded on those days, so there is nothing to divide.");

  const notes: string[] = [];
  let averageOrder: number;
  if (w.paid > 0) {
    averageOrder = w.revenue / w.paid;
  } else {
    const longer = await sum(addDays(until, -(AOV_FALLBACK_DAYS - 1)), until);
    averageOrder = longer.paid > 0 ? longer.revenue / longer.paid : 0;
    notes.push(
      longer.paid > 0
        ? `Nobody paid in the window, so the average order is from the last ${AOV_FALLBACK_DAYS} days ` +
            `(${eur(averageOrder)} over ${count(longer.paid)} paying customers).`
        : `Nobody paid in the last ${AOV_FALLBACK_DAYS} days either, so there is no average order; ` +
            "pass average_order to model one."
    );
  }
  const live: Levers = {
    costPerVisitor: w.spend / w.visitors,
    visitorToFinish: w.finished / w.visitors,
    finishToPaid: w.finished > 0 ? w.paid / w.finished : 0,
    averageOrder,
  };
  const levers: Levers = {
    costPerVisitor: given.costPerVisitor ?? live.costPerVisitor,
    visitorToFinish: given.visitorToFinish ?? live.visitorToFinish,
    finishToPaid: given.finishToPaid ?? live.finishToPaid,
    averageOrder: given.averageOrder ?? live.averageOrder,
  };
  const whatIf = Object.values(given).some((v) => v !== undefined);

  const covered =
    w.days === days
      ? "every day covered by the ad data"
      : `the ${w.days} of them the ad data covers`;
  const net = w.revenue - w.spend;
  const out = [
    `Break-even on Google Ads, ${days} days to ${longDay(until)} (${covered}).`,
    "",
    "Now:",
    `- Spent ${eur(w.spend)} on Google Ads, ${eur(w.spend / w.days)} a day.`,
    `- ${count(w.visitors)} visitors (each person once a day), so each cost ${eur(live.costPerVisitor)}.`,
    `- ${count(w.finished)} finished the survey: ${pct(live.visitorToFinish)} of visitors.`,
    `- ${count(w.paid)} paid: ${pct(live.finishToPaid)} of finishers.`,
    w.paid > 0
      ? `- They paid ${eur(averageOrder)} on average, ${eur(w.revenue)} in all.`
      : `- Revenue ${eur(w.revenue)}.`,
    `- Net after ad spend: ${eur(net)}.` +
      (w.spend > 0 ? ` Revenue covered ${pct(w.revenue / w.spend)} of the spend.` : ""),
    "",
  ];
  if (whatIf) {
    const set = [
      given.costPerVisitor !== undefined ? `each visitor costs ${eur(levers.costPerVisitor)}` : "",
      given.visitorToFinish !== undefined
        ? `${pct(levers.visitorToFinish)} of visitors finish`
        : "",
      given.finishToPaid !== undefined ? `${pct(levers.finishToPaid)} of finishers pay` : "",
      given.averageOrder !== undefined ? `the average order is ${eur(levers.averageOrder)}` : "",
    ].filter(Boolean);
    const perVisitor = levers.visitorToFinish * levers.finishToPaid * levers.averageOrder;
    const margin = perVisitor - levers.costPerVisitor;
    out.push(
      `What if ${set.join(", ")}, with the rest as now:`,
      `- Revenue per visitor ${eur(perVisitor)} against a cost of ${eur(levers.costPerVisitor)}: ` +
        `${eur(Math.abs(margin))} ${margin >= 0 ? "profit" : "loss"} per visitor, ` +
        `${eur(Math.abs(margin * 1000))} per 1,000 visitors.`,
      `- Over the same ${count(w.visitors)} visitors: ${eur(margin * w.visitors)}.`,
      ""
    );
  }
  out.push(...breakEvenLines(levers, whatIf), "");
  if (w.paid < FEW_PURCHASES) {
    notes.unshift(
      `Read with care: ${count(w.paid)} ${w.paid === 1 ? "paying customer is" : "paying customers are"} too few to trust ` +
        "the share who pay; one more or one fewer moves every line above."
    );
  }
  notes.push(
    "Counted as the AP-Analytics dashboard counts them (Berlin days; staff and our own test " +
      "traffic left out): its visitors, finished surveys and paying customers, so the average " +
      "order is its CLV and the spend per paying customer its CAC. The same days on the " +
      `dashboard: ${apLink("assessment-a", apFilters(lo, hi, reportingDay(new Date(now))))} ` +
      "(team sign-in required). Blended: every visitor and buyer counts, not only those who " +
      "came from an ad. Revenue is what customers paid, before card fees and VAT. Only Google " +
      "Ads spend is recorded; anything spent elsewhere is not in here."
  );
  return { ok: true, text: [...out, ...notes].join("\n") };
}
