/**
 * AP-Analytics, Assessment A · Pay to start: the pay-first funnel on its own page (22.10 sync:
 * "a separate custom report specifically to analyze the new pay-to-start funnel", "focus the
 * report on indicators such as cost per click and cost per conversion").
 *
 * Its two offers are read apart: `full` (EUR 29.99 at /sexual-archetype, the survey and the
 * full report) and `pre` (EUR 1.99 at /sexual-archetype/initial, the survey and the Core
 * Archetype, then EUR 10 off the full report). Everything comes from our own records except
 * the ads, which Google Ads splits by the page an ad lands on, so the split holds whatever
 * the campaigns are called.
 *
 * - Checkouts: `prepaid_report_access` rows with an offer, by `created_at`.
 * - Paid: their `paid_at` (the charge), status succeeded or refunded, money taken.
 * - Finished survey: the entitlement's `consumed_submission_id` (the survey claimed it).
 * - Report opened: a `report_session` on that submission's report.
 * - Upgraded: a EUR 1.99 buyer's later full-report or All 14 payment on the same report
 *   (with the EUR 10 credit or not: a code may have beaten it).
 * - Visits: `funnel_event` unique visitors labelled `pay_to_start` (proxy.ts). Both pages share
 *   the label, so visits are the journey's, not an offer's.
 * Staff and test buys are left out (`is_test`, staff addresses), as on every AP page.
 */
import { googleAdsSearch } from "@shared/http/google-ads";
import { isStaffEmail } from "@shared/env/staff-email";
import logger from "@shared/observability/logger";
import { reportingDay } from "@shared/time/reporting-day";

import { fetchAllRows } from "../supabase";
import { windowOf, type ApFilters } from "./filters";

export type PtsOffer = "full" | "pre";

export interface EntitlementRow {
  id: number;
  offer: string | null;
  status: string;
  amount_cents: number | null;
  list_price_cents: number | null;
  is_test: boolean | null;
  customer_email: string | null;
  created_at: string;
  paid_at: string | null;
  consumed_submission_id: number | null;
}

export interface AdsLanding {
  url: string;
  cost: number;
  clicks: number;
  impressions: number;
}

export type AdsLandingResult = { ok: true; value: AdsLanding[] } | { ok: false; error: string };

export interface PtsInput {
  entitlements: EntitlementRow[];
  /** Pay-to-start visits per Berlin day; null when they could not be read. */
  visitsByDay: Record<string, number> | null;
  /** Submissions whose report was opened. */
  openedSubmissions: ReadonlySet<number>;
  /** Submissions that bought the full report after the EUR 1.99, with what they paid. */
  upgrades: ReadonlyMap<number, number>;
  ads: AdsLandingResult;
  from: string;
  to: string;
  today: string;
}

export interface PtsArm {
  offer: PtsOffer | "all";
  label: string;
  /** Ad spend, clicks and impressions on this offer's page; null when Ads is unreadable. */
  spend: number | null;
  clicks: number | null;
  impressions: number | null;
  cpc: number | null;
  ctr: number | null;
  checkouts: number;
  paid: number;
  refunded: number;
  /** Money kept from the offer's own sales (refunds left out), in euros. */
  revenue: number;
  finished: number;
  opened: number;
  upgrades: number;
  upgradeRevenue: number;
  /** spend ÷ paid: the cost of one paying customer (cost per conversion). */
  costPerPaid: number | null;
  costPerFinished: number | null;
  /** paid ÷ clicks. */
  clickToPaid: number | null;
  /** (revenue + upgrade revenue) ÷ spend. */
  roas: number | null;
}

export interface PtsDay {
  day: string;
  visits: number | null;
  checkouts: Record<PtsOffer, number>;
  paid: Record<PtsOffer, number>;
}

export interface PtsPayload {
  range: { from: string; to: string };
  /** First day pay to start sold anything in this range's data; null when it never has. */
  liveFrom: string | null;
  visits: number | null;
  arms: PtsArm[];
  days: PtsDay[];
  ads: { ok: boolean; note: string | null; unmatched: number };
  notes: string[];
}

const OFFERS: PtsOffer[] = ["full", "pre"];
export const OFFER_LABEL: Record<PtsOffer | "all", string> = {
  full: "Pay to start · full (€29.99)",
  pre: "Pay to start · €1.99 pre",
  all: "Both offers",
};

const PAID_STATUSES = new Set(["succeeded", "refunded"]);

/** Which offer an ad's landing page sells, from its path; null for every other page. */
export function offerOfLanding(url: string): PtsOffer | null {
  let path: string;
  try {
    path = new URL(url).pathname;
  } catch {
    return null;
  }
  // ValueTrack placeholders stay in an unexpanded URL ("/{ignore}" is live on our account),
  // percent-encoded: decode, drop them, then match the page.
  try {
    path = decodeURIComponent(path);
  } catch {
    return null;
  }
  path = path.replace(/\{[^}]*\}/g, "").replace(/\/+$/, "");
  if (path === "/sexual-archetype/initial") return "pre";
  if (path === "/sexual-archetype") return "full";
  return null;
}

const ratio = (a: number | null, b: number | null): number | null =>
  a !== null && b !== null && b > 0 ? a / b : null;
const cents = (n: number) => Math.round(n * 100) / 100;

/** A real buyer's row: an offer, not a test, not one of us. */
function counts(e: EntitlementRow): e is EntitlementRow & { offer: PtsOffer } {
  return (
    (e.offer === "full" || e.offer === "pre") &&
    e.is_test !== true &&
    !isStaffEmail(e.customer_email)
  );
}

export function buildPayToStart(input: PtsInput): PtsPayload {
  const { from, to } = input;
  const inRange = (iso: string | null) => {
    if (!iso) return false;
    const day = reportingDay(new Date(iso));
    return day >= from && day <= to;
  };
  const rows = input.entitlements.filter(counts);

  // Ad spend per offer, from the page each ad landed on.
  const adsBy: Record<PtsOffer, { cost: number; clicks: number; impressions: number }> = {
    full: { cost: 0, clicks: 0, impressions: 0 },
    pre: { cost: 0, clicks: 0, impressions: 0 },
  };
  let unmatched = 0;
  if (input.ads.ok) {
    for (const line of input.ads.value) {
      const offer = offerOfLanding(line.url);
      if (!offer) {
        unmatched += 1;
        continue;
      }
      adsBy[offer].cost += line.cost;
      adsBy[offer].clicks += line.clicks;
      adsBy[offer].impressions += line.impressions;
    }
  }

  const arm = (offer: PtsOffer | "all"): PtsArm => {
    const mine = rows.filter((e) => offer === "all" || e.offer === offer);
    const started = mine.filter((e) => inRange(e.created_at));
    const paidRows = mine.filter(
      (e) => PAID_STATUSES.has(e.status) && (e.amount_cents ?? 0) > 0 && inRange(e.paid_at)
    );
    const kept = paidRows.filter((e) => e.status === "succeeded");
    const finishedRows = paidRows.filter((e) => e.consumed_submission_id !== null);
    const subs = finishedRows.map((e) => e.consumed_submission_id as number);
    const upgraded = paidRows.filter(
      (e) =>
        e.offer === "pre" &&
        e.consumed_submission_id !== null &&
        input.upgrades.has(e.consumed_submission_id)
    );
    const upgradeRevenue = upgraded.reduce(
      (sum, e) => sum + (input.upgrades.get(e.consumed_submission_id as number) ?? 0),
      0
    );
    const ads = input.ads.ok
      ? offer === "all"
        ? {
            cost: adsBy.full.cost + adsBy.pre.cost,
            clicks: adsBy.full.clicks + adsBy.pre.clicks,
            impressions: adsBy.full.impressions + adsBy.pre.impressions,
          }
        : adsBy[offer]
      : null;
    const spend = ads ? cents(ads.cost) : null;
    const revenue = cents(kept.reduce((sum, e) => sum + (e.amount_cents ?? 0) / 100, 0));
    return {
      offer,
      label: OFFER_LABEL[offer],
      spend,
      clicks: ads ? ads.clicks : null,
      impressions: ads ? ads.impressions : null,
      cpc: ratio(spend, ads ? ads.clicks : null),
      ctr: ratio(ads ? ads.clicks : null, ads ? ads.impressions : null),
      checkouts: started.length,
      paid: paidRows.length,
      refunded: paidRows.length - kept.length,
      revenue,
      finished: finishedRows.length,
      opened: subs.filter((id) => input.openedSubmissions.has(id)).length,
      upgrades: upgraded.length,
      upgradeRevenue: cents(upgradeRevenue),
      costPerPaid: ratio(spend, paidRows.length),
      costPerFinished: ratio(spend, finishedRows.length),
      clickToPaid: ratio(paidRows.length, ads ? ads.clicks : null),
      roas: ratio(spend === null ? null : revenue + upgradeRevenue, spend),
    };
  };

  const days: PtsDay[] = [];
  for (let day = from; day <= to; day = nextDay(day)) {
    const on = (iso: string | null) => iso !== null && reportingDay(new Date(iso)) === day;
    const zero = (): Record<PtsOffer, number> => ({ full: 0, pre: 0 });
    const checkouts = zero();
    const paid = zero();
    for (const e of rows) {
      if (on(e.created_at)) checkouts[e.offer] += 1;
      if (PAID_STATUSES.has(e.status) && (e.amount_cents ?? 0) > 0 && on(e.paid_at))
        paid[e.offer] += 1;
    }
    days.push({
      day,
      visits: input.visitsByDay ? (input.visitsByDay[day] ?? 0) : null,
      checkouts,
      paid,
    });
  }

  const firstSale = rows
    .map((e) => e.created_at)
    .sort()
    .find(Boolean);
  const notes: string[] = [];
  if (!input.ads.ok) notes.push(input.ads.error);
  else if (unmatched > 0 && adsBy.full.clicks + adsBy.pre.clicks === 0)
    notes.push("No ad in this range lands on a pay-to-start page yet.");
  if (input.visitsByDay === null) notes.push("Visits could not be read just now.");
  notes.push(
    "Visits are the journey's: both pages carry the same pay_to_start label, so they are not split by offer."
  );
  if (to >= input.today)
    notes.push("Today is still running: its figures are so far, and the ads lag a few hours.");

  return {
    range: { from, to },
    liveFrom: firstSale ? reportingDay(new Date(firstSale)) : null,
    visits: input.visitsByDay
      ? Object.values(input.visitsByDay).reduce((sum, n) => sum + n, 0)
      : null,
    arms: [arm("all"), ...OFFERS.map(arm)],
    days,
    ads: {
      ok: input.ads.ok,
      note: input.ads.ok ? null : input.ads.error,
      unmatched,
    },
    notes,
  };
}

function nextDay(day: string): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

const UNREADABLE = "Google Ads could not be read just now.";

/** Cost, clicks and impressions per landing page over [from, to] (the account's own days). */
export async function fetchAdsByLanding(
  from: string,
  to: string,
  oidcToken?: string | null
): Promise<AdsLandingResult> {
  try {
    const rows = await googleAdsSearch<{
      landingPageView?: { unexpandedFinalUrl?: string };
      metrics?: { impressions?: string; clicks?: string; costMicros?: string };
    }>(
      "SELECT landing_page_view.unexpanded_final_url, metrics.impressions, metrics.clicks, " +
        `metrics.cost_micros FROM landing_page_view WHERE segments.date BETWEEN '${from}' AND '${to}'`,
      { oidcToken, timeoutMs: 15_000 }
    );
    if (!rows) return { ok: false, error: UNREADABLE };
    const num = (v: unknown) => {
      const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
      return Number.isFinite(n) ? n : 0;
    };
    return {
      ok: true,
      value: rows
        .map((r) => ({
          url: r.landingPageView?.unexpandedFinalUrl ?? "",
          cost: num(r.metrics?.costMicros) / 1_000_000,
          clicks: num(r.metrics?.clicks),
          impressions: num(r.metrics?.impressions),
        }))
        .filter((l) => l.url && (l.cost || l.clicks || l.impressions)),
    };
  } catch (err) {
    logger.warn({ err }, "AP pay to start: Google Ads read failed");
    return { ok: false, error: UNREADABLE };
  }
}

/** Everything the page reads from our database for [from, to]. */
export async function fetchPayToStartRecords(filters: Pick<ApFilters, "from" | "to">): Promise<{
  entitlements: EntitlementRow[];
  visitsByDay: Record<string, number> | null;
  openedSubmissions: Set<number>;
  upgrades: Map<number, number>;
}> {
  const { until } = windowOf(filters);
  const entitlements = await fetchAllRows<EntitlementRow>(
    "/rest/v1/prepaid_report_access?offer=not.is.null" +
      `&created_at=lt.${until.toISOString()}` +
      "&select=id,offer,status,amount_cents,list_price_cents,is_test,customer_email,created_at,paid_at,consumed_submission_id" +
      "&order=id.asc"
  );
  if (!entitlements) throw new Error("prepaid_report_access could not be read");

  const visitRows = await fetchAllRows<{ day: string }>(
    "/rest/v1/funnel_event?event_type=eq.unique_visitor&landing_variant=eq.pay_to_start" +
      `&day=gte.${filters.from}&day=lte.${filters.to}&select=day&order=day.asc,visitor_id.asc`
  );
  const visitsByDay = visitRows
    ? visitRows.reduce<Record<string, number>>((acc, r) => {
        acc[r.day] = (acc[r.day] ?? 0) + 1;
        return acc;
      }, {})
    : null;

  const subs = [
    ...new Set(
      entitlements
        .map((e) => e.consumed_submission_id)
        .filter((id): id is number => typeof id === "number")
    ),
  ];
  const openedSubmissions = new Set<number>();
  const upgrades = new Map<number, number>();
  // Small: one row per pay-to-start buyer who finished. Read in chunks to keep the URLs short.
  for (let i = 0; i < subs.length; i += 100) {
    const chunk = subs.slice(i, i + 100);
    const reports = await fetchAllRows<{ id: number; survey_submission_id: number }>(
      `/rest/v1/personal_report?survey_submission_id=in.(${chunk.join(",")})` +
        "&select=id,survey_submission_id&order=id.asc"
    );
    if (!reports) throw new Error("personal_report could not be read");
    const subOfReport = new Map(reports.map((r) => [r.id, r.survey_submission_id]));
    const ids = [...subOfReport.keys()];
    if (ids.length === 0) continue;
    const [sessions, payments] = await Promise.all([
      fetchAllRows<{ personal_report_id: number }>(
        `/rest/v1/report_session?personal_report_id=in.(${ids.join(",")})` +
          "&select=personal_report_id&order=personal_report_id.asc"
      ),
      fetchAllRows<{ personal_report_id: number; amount: number | string | null }>(
        `/rest/v1/payment?is_test=is.false&metadata->>gifted=is.null&personal_report_id=in.(${ids.join(",")})` +
          "&status=eq.succeeded&metadata->>plan=in.(full_report,all_reports)" +
          "&select=personal_report_id,amount&order=id.asc"
      ),
    ]);
    if (!sessions || !payments) throw new Error("the readers' reports could not be read");
    for (const s of sessions) {
      const sub = subOfReport.get(s.personal_report_id);
      if (sub !== undefined) openedSubmissions.add(sub);
    }
    for (const p of payments) {
      const sub = subOfReport.get(p.personal_report_id);
      const amount = Number(p.amount ?? 0);
      if (sub !== undefined && Number.isFinite(amount) && amount > 0)
        upgrades.set(sub, (upgrades.get(sub) ?? 0) + amount);
    }
  }
  return { entitlements, visitsByDay, openedSubmissions, upgrades };
}
