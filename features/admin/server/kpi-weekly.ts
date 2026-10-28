/**
 * The 📊 KPI database in Notion, live. Eman, 2026-10-12: the KPIs there should always be
 * up to date. Marcus, 9 Oct: a visual report per KPI (chart, table, filters) rather than
 * text, one KPI at a time and in depth; his comments on the rows ask for the splits by
 * traffic source and by landing page test.
 *
 * Every High and Medium KPI our own data can measure is computed here per week (Monday
 * to Sunday, Berlin days) from get_kpi_week, whose definitions are the morning message's
 * (migration 20261012120000). The kpi-weekly cron writes the result to three places: a
 * row per KPI, week and slice in "KPI weekly numbers" (the charts read it), the live
 * columns of each KPI's row in 📊 KPI, and a summary at the top of each High KPI's page.
 * The KPI's own Formula and Source columns are the definitions followed here.
 *
 * Not measured, and said so rather than faked: paid against organic visits (the visit
 * log cannot tell them apart), a 0 to 10 satisfaction score (no such question; the
 * share of thumbs up on chapters stands in), and the drop-off per question, which has
 * its own page and job (kpi-dropoff).
 */
import {
  addDays,
  askedQuestions,
  DROPOFF_FLOOR,
  dropoffWeeks,
  FIRST_TRACKED_MONDAY,
  shortDate,
  type DropoffWeek,
} from "@features/admin/server/dropoff-weekly";
import { weekRange, type Segment, type Tally } from "@features/admin/server/dropoff-report";
import { supabaseFetch } from "@features/admin/server/supabase";
import { adCovers, type AdCost } from "@features/brain/server/ingest/analytics";
import { reportingDay } from "@shared/time/reporting-day";

/** Complete weeks kept current; older weeks stay as written. */
export const KPI_WEEKS = 8;

/** No earlier week: the visit log and the ad cost both start in late May 2026. */
const FIRST_KPI_MONDAY = "2026-06-01";

/** Drafts of people who never finish are cleared after about 30 days. */
const DRAFT_DAYS = 28;

/** A complete week this many days past its Sunday is final: written once, then kept. */
const FREEZE_AFTER_DAYS = 14;

export type KpiUnit = "count" | "percent" | "euro" | "minutes";

/** Written into every row as its Segment: a rename needs that option renamed too (see title). */
export const KPI_SEGMENTS = [
  "All traffic",
  "Google Ads",
  "Other sources",
  "Phone",
  "Computer",
  "Landing: question card",
  "Landing: video",
] as const;
export type KpiSegment = (typeof KPI_SEGMENTS)[number];

/** The landing test of 7 Oct 2026 (shared/experiments/landingVariant.ts, round 3). */
const LANDING_ARMS: Array<[string, KpiSegment]> = [
  ["white_card", "Landing: question card"],
  ["white_video", "Landing: video"],
];

/** One week of get_kpi_week. */
export interface KpiWeekData {
  visits: { all: number; byArm: Map<string, number> };
  starts: { all: number; googleAds: number; byArm: Map<string, number> };
  finished: { all: number; googleAds: number };
  checkout: number;
  /** Of the week's checkout readers, how many have paid since. */
  checkoutPaid: number;
  paywall: number;
  sales: number;
  salesGoogleAds: number;
  gifted: number;
  revenue: number;
  finishCohort: { finished: number; paid: number };
  startCohort: Record<"all" | "google_ads" | "other" | "phone" | "computer", Cohort>;
  surveyMinutes: Minutes;
  reportMinutes: Minutes;
  thumbs: { up: number; down: number };
}
interface Cohort {
  started: number;
  finished: number;
}
interface Minutes {
  n: number;
  median: number | null;
  p90: number | null;
}

function num(v: unknown, what: string): number {
  const n = typeof v === "string" ? Number(v) : v;
  if (typeof n !== "number" || !Number.isFinite(n)) {
    throw new Error(`get_kpi_week: ${what} is not a number`);
  }
  return n;
}
const optNum = (v: unknown, what: string) => (v === null || v === undefined ? null : num(v, what));
function counts(v: unknown, what: string): Map<string, number> {
  if (v === null || typeof v !== "object") throw new Error(`get_kpi_week: ${what} is not a map`);
  return new Map(Object.entries(v).map(([k, n]) => [k, num(n, `${what}.${k}`)]));
}

/** A field of the function's JSON by path, or undefined. */
function at(raw: unknown, path: string): unknown {
  let v: unknown = raw;
  for (const k of path.split(".")) {
    v = v !== null && typeof v === "object" ? new Map(Object.entries(v)).get(k) : undefined;
  }
  return v;
}

/** The function's JSON, checked: a wrong shape throws rather than writing zeros. */
export function parseKpiWeek(raw: unknown): KpiWeekData {
  const n = (path: string) => num(at(raw, path), path);
  const cohort = (k: string): Cohort => ({
    started: num(at(raw, `start_cohort.${k}.started`) ?? 0, `start_cohort.${k}.started`),
    finished: num(at(raw, `start_cohort.${k}.finished`) ?? 0, `start_cohort.${k}.finished`),
  });
  const minutes = (k: string): Minutes => ({
    n: n(`${k}.n`),
    median: optNum(at(raw, `${k}.median`), `${k}.median`),
    p90: optNum(at(raw, `${k}.p90`), `${k}.p90`),
  });
  return {
    visits: { all: n("visits.all"), byArm: counts(at(raw, "visits.by_arm"), "visits.by_arm") },
    starts: {
      all: n("starts.all"),
      googleAds: n("starts.google_ads"),
      byArm: counts(at(raw, "starts.by_arm"), "starts.by_arm"),
    },
    finished: { all: n("finished.all"), googleAds: n("finished.google_ads") },
    checkout: n("checkout"),
    checkoutPaid: n("checkout_paid"),
    paywall: n("paywall"),
    sales: n("sales"),
    salesGoogleAds: n("sales_google_ads"),
    gifted: n("gifted"),
    revenue: n("revenue"),
    finishCohort: { finished: n("finish_cohort.finished"), paid: n("finish_cohort.paid") },
    startCohort: {
      all: cohort("all"),
      google_ads: cohort("google_ads"),
      other: cohort("other"),
      phone: cohort("phone"),
      computer: cohort("computer"),
    },
    surveyMinutes: minutes("survey_minutes"),
    reportMinutes: minutes("report_minutes"),
    thumbs: { up: n("thumbs.up"), down: n("thumbs.down") },
  };
}

/** One window's numbers. Throws rather than guess. */
export async function fetchKpiWeek(since: Date, until: Date): Promise<KpiWeekData> {
  const res = await supabaseFetch("/rest/v1/rpc/get_kpi_week", {
    method: "POST",
    body: JSON.stringify({ since_ts: since.toISOString(), until_ts: until.toISOString() }),
    timeoutMs: 20_000,
  });
  if (!res.ok) throw new Error(`get_kpi_week ${res.status}`);
  return parseKpiWeek(await res.json());
}

/** The weeks shown: up to eight complete ones, then the week so far. */
export function kpiWeeks(now: Date): DropoffWeek[] {
  return dropoffWeeks(now, KPI_WEEKS, FIRST_KPI_MONDAY);
}

/** The Berlin days a week covers (seven, or through yesterday for the week so far). */
export function weekDays(week: DropoffWeek, today: string): string[] {
  const monday = reportingDay(week.since);
  const n = week.partial ? Math.round((Date.parse(today) - Date.parse(monday)) / 86_400_000) : 7;
  return Array.from({ length: n }, (_, i) => addDays(monday, i));
}

/** Google Ads spend over the days, or null unless every one of them is covered. */
export function adSpend(ad: AdCost, days: string[]): number | null {
  if (days.length === 0 || !days.every((d) => adCovers(ad, d))) return null;
  return Math.round(days.reduce((s, d) => s + (ad.byDay.get(d) ?? 0), 0) * 100) / 100;
}

export interface KpiValue {
  segment: KpiSegment;
  value: number | null;
  num?: number;
  den?: number;
  /** After the shown value, wherever it appears (" (P90 22.5)"). */
  extra?: string;
}

export interface WeekContext {
  monday: string;
  days: number;
  partial: boolean;
  /** Google Ads spend for the week, null when not every day is in yet. */
  adCost: number | null;
  /** Drafts of the week are still kept, so starts are complete. */
  startsComplete: boolean;
  /** Survey steps are complete for the week (from 21 Sep 2026). */
  stepsComplete: boolean;
}

export interface KpiDef {
  id: string;
  /**
   * The row's title in 📊 KPI, exactly. Every row of "KPI weekly numbers" carries it as
   * its KPI, and a final week's rows are never rewritten: renaming it here also needs the
   * KPI option renamed there (every row follows), or the charts lose the final weeks.
   */
  title: string;
  unit: KpiUnit;
  high: boolean;
  values(w: KpiWeekData, c: WeekContext): KpiValue[];
  /** One line under the numbers on a High KPI's page (only those have a summary). */
  note?(w: KpiWeekData, c: WeekContext): string | null;
  /**
   * The alert rule of the 8 Oct proposal on the KPI's page, against the usual level (the
   * four complete weeks before). Null when it holds, the reason when it does not.
   */
  watch?(last: number, usual: number, w: KpiWeekData): string | null;
  /** The rule in words, for the page. */
  rule?: string;
  /** After a shown value, when the number alone would mislead ("thumbs up"). */
  suffix?: string;
  /** Said instead of a number when the last full week has none: why, for that week. */
  empty?(w: KpiWeekData, c: WeekContext): string;
}

const ratio = (segment: KpiSegment, n: number, d: number, floor = 1): KpiValue => ({
  segment,
  value: d >= floor && d > 0 ? n / d : null,
  num: n,
  den: d,
});
const plain = (segment: KpiSegment, value: number | null): KpiValue => ({ segment, value });
/** The median, with the 90th percentile beside it: the KPIs are "Median / P90". */
const median = (m: Minutes): KpiValue => ({
  segment: "All traffic",
  value: m.n >= 5 ? m.median : null,
  extra: m.p90 !== null ? ` (P90 ${m.p90.toFixed(1)})` : undefined,
});
/** Why a cost KPI has no number: the spend, or nothing to divide it by. */
const noCost = (c: WeekContext, nothing: string) =>
  c.adCost === null ? "ad spend not in yet" : nothing;

/** The share of a rate's measure below or above its usual level, in points or percent. */
const pts = (last: number, usual: number) => (last - usual) * 100;

export const KPIS: KpiDef[] = [
  {
    id: "visitors",
    title: "Unique Visitors #",
    unit: "count",
    high: true,
    values: (w) => [
      plain("All traffic", w.visits.all),
      ...LANDING_ARMS.filter(([arm]) => (w.visits.byArm.get(arm) ?? 0) > 0).map(([arm, seg]) =>
        plain(seg, w.visits.byArm.get(arm)!)
      ),
    ],
    rule: "under half the usual visits in a week (an outage or stopped ads)",
    watch: (last, usual) =>
      usual > 0 && last < usual / 2 ? `under half the usual (${Math.round(usual)})` : null,
  },
  {
    id: "visit_to_start",
    title: "Unique Visitors → Survey Attempts CVR %",
    unit: "percent",
    high: true,
    values: (w, c) =>
      c.startsComplete
        ? [
            ratio("All traffic", w.starts.all, w.visits.all, 20),
            ...LANDING_ARMS.filter(([arm]) => (w.visits.byArm.get(arm) ?? 0) >= 20).map(
              ([arm, seg]) => ratio(seg, w.starts.byArm.get(arm) ?? 0, w.visits.byArm.get(arm)!, 20)
            ),
          ]
        : [],
    rule: "2 points or more below the usual level",
    watch: (last, usual) =>
      pts(last, usual) <= -2
        ? `${Math.abs(pts(last, usual)).toFixed(1)} points below the usual level`
        : null,
  },
  {
    id: "starts",
    title: "Survey Attempts #",
    unit: "count",
    high: true,
    values: (w, c) =>
      c.startsComplete
        ? [
            plain("All traffic", w.starts.all),
            plain("Google Ads", w.starts.googleAds),
            plain("Other sources", w.starts.all - w.starts.googleAds),
          ]
        : [],
    rule: "under half the usual starts in a week (a broken landing page or survey)",
    watch: (last, usual) =>
      usual > 0 && last < usual / 2 ? `under half the usual (${Math.round(usual)})` : null,
  },
  {
    id: "start_to_finish",
    title: "Survey Attemp → Survey Completion CVR %",
    unit: "percent",
    high: true,
    values: (w, c) => {
      if (!c.stepsComplete) return [];
      const k = w.startCohort;
      return [
        ratio("All traffic", k.all.finished, k.all.started, 20),
        ratio("Google Ads", k.google_ads.finished, k.google_ads.started, 20),
        ratio("Other sources", k.other.finished, k.other.started, 20),
        ratio("Phone", k.phone.finished, k.phone.started, 20),
        ratio("Computer", k.computer.finished, k.computer.started, 20),
      ].filter((v) => (v.den ?? 0) > 0);
    },
    note: () =>
      "Followed per start week: people who started late in a week may still finish, so recent weeks can still rise.",
    rule: "5 points or more below the usual level",
    watch: (last, usual) =>
      pts(last, usual) <= -5
        ? `${Math.abs(pts(last, usual)).toFixed(1)} points below the usual level`
        : null,
  },
  {
    id: "finished",
    title: "Survey Completed #",
    unit: "count",
    high: true,
    values: (w) => [
      plain("All traffic", w.finished.all),
      plain("Google Ads", w.finished.googleAds),
      plain("Other sources", w.finished.all - w.finished.googleAds),
    ],
    rule: "under half the usual finished surveys in a week",
    watch: (last, usual) =>
      usual > 0 && last < usual / 2 ? `under half the usual (${Math.round(usual)})` : null,
  },
  {
    id: "cost_per_finished",
    title: "Cost per Survey Completed €",
    unit: "euro",
    high: true,
    empty: (_w, c) => noCost(c, "no finished survey from Google Ads"),
    values: (w, c) => [
      {
        segment: "All traffic",
        value:
          c.adCost !== null && w.finished.googleAds > 0 ? c.adCost / w.finished.googleAds : null,
        num: c.adCost ?? undefined,
        den: w.finished.googleAds,
      },
    ],
    note: (_w, c) =>
      c.adCost === null
        ? "Ad spend for these days is not in yet; it arrives with a day or two of delay."
        : `Google Ads spend €${c.adCost.toFixed(2)}, divided by the finished surveys that came from a Google Ads click.`,
    rule: "30% or more above the usual level",
    watch: (last, usual) =>
      usual > 0 && last >= usual * 1.3
        ? `${Math.round((last / usual - 1) * 100)}% above the usual level`
        : null,
  },
  {
    id: "sales",
    title: "Paid Reports #",
    unit: "count",
    high: true,
    values: (w) => [plain("All traffic", w.sales)],
    note: (w) =>
      w.gifted > 0
        ? `Plus ${w.gifted} unlocked free (a coupon, E07's gift or the unlock-feedback email), not counted (decided 19 Sep).`
        : null,
  },
  {
    id: "finish_to_paid",
    title: "Survey Completed → Paid CVR %",
    unit: "percent",
    high: true,
    values: (w) => [ratio("All traffic", w.finishCohort.paid, w.finishCohort.finished, 20)],
    note: () =>
      "Followed per finishing week: of those who finished that week, how many have paid since, so it can still rise.",
  },
  {
    id: "revenue_per_finished",
    title: "Revenue per Survey Completed €",
    unit: "euro",
    high: true,
    values: (w) => [
      {
        segment: "All traffic",
        value: w.finished.all > 0 ? w.revenue / w.finished.all : null,
        num: w.revenue,
        den: w.finished.all,
      },
    ],
  },
  {
    id: "checkouts",
    title: "Checkout Attempts #",
    unit: "count",
    high: true,
    values: (w) => [plain("All traffic", w.checkout)],
    note: (w) =>
      w.paywall > 0
        ? `${w.paywall} people reached the paywall; ${w.checkout} started checkout.`
        : null,
    rule: "no checkout start in a week although 40 or more reached the paywall",
    watch: (last, _usual, w) =>
      last === 0 && w.paywall >= 40
        ? `no checkout start from ${w.paywall} people at the paywall`
        : null,
  },
  {
    id: "checkout_to_paid",
    title: "Checkout Attempts → Paid Reports CVR %",
    unit: "percent",
    high: true,
    values: (w) => [ratio("All traffic", w.checkoutPaid, w.checkout)],
    note: () =>
      "Followed per checkout week: of the people who started checkout that week, how many have paid since.",
  },
  {
    id: "satisfaction",
    title: "Report Satisfaction Score (NPS) #",
    unit: "percent",
    high: false,
    // A stand-in, as the row's "How we show it" says: there is no 0 to 10 question yet.
    suffix: " thumbs up",
    empty: () => "fewer than 5 chapter ratings",
    values: (w) => [ratio("All traffic", w.thumbs.up, w.thumbs.up + w.thumbs.down, 5)],
  },
  {
    id: "report_minutes",
    title: "Avg. Report Session Duration (Median / P90) in minutes",
    unit: "minutes",
    high: false,
    empty: () => "fewer than 5 closed sessions",
    values: (w) => [median(w.reportMinutes)],
  },
  {
    id: "cppr",
    title: "Cost per Paid Report (CPPR) €",
    unit: "euro",
    high: false,
    empty: (_w, c) => noCost(c, "no paid report from ads"),
    values: (w, c) => [
      {
        segment: "All traffic",
        value: c.adCost !== null && w.salesGoogleAds > 0 ? c.adCost / w.salesGoogleAds : null,
        num: c.adCost ?? undefined,
        den: w.salesGoogleAds,
      },
    ],
  },
  {
    id: "revenue",
    title: "Total Revenue €",
    unit: "euro",
    high: false,
    values: (w) => [plain("All traffic", w.revenue)],
  },
  {
    id: "sales_per_day",
    title: "Paid Reports per Day #",
    unit: "count",
    high: false,
    values: (w, c) => [plain("All traffic", c.days > 0 ? w.sales / c.days : null)],
  },
  {
    id: "finished_per_day",
    title: "Survey Completions per Day #",
    unit: "count",
    high: false,
    values: (w, c) => [plain("All traffic", c.days > 0 ? w.finished.all / c.days : null)],
  },
  {
    id: "survey_minutes",
    title: "Avg. Survey Time to Complete (Median / P90) in minutes",
    unit: "minutes",
    high: false,
    empty: () => "fewer than 5 finished surveys",
    values: (w) => [median(w.surveyMinutes)],
  },
];

/** One row of "KPI weekly numbers": a KPI's value for one week and slice. */
export interface KpiRow {
  key: string;
  week: string;
  days: number;
  kpiId: string;
  kpi: string;
  unit: KpiUnit;
  segment: KpiSegment;
  value: number;
  num: number | null;
  den: number | null;
  shown: string;
}

const round = (v: number, digits: number) => Math.round(v * 10 ** digits) / 10 ** digits;

/** The value as stored: fractions for percents (Notion shows 0.475 as 47.5%). */
function stored(unit: KpiUnit, v: number): number {
  return unit === "percent" ? round(v, 4) : unit === "count" ? round(v, 1) : round(v, 2);
}

const MONEY = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const WHOLE = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

/** "2,049", "20.3", "47.5%", "€2.91", "15.3 min". */
export function formatValue(unit: KpiUnit, v: number): string {
  if (unit === "percent") return `${(v * 100).toFixed(1)}%`;
  if (unit === "euro") return `€${MONEY.format(v)}`;
  if (unit === "minutes") return `${v.toFixed(1)} min`;
  return Number.isInteger(round(v, 1)) ? WHOLE.format(v) : v.toFixed(1);
}

/** "▲ 19 (+15.4%)", "▼ 2.1 pts", "▲ €0.40", "no change". Arrows say direction, not good or bad. */
export function formatChange(unit: KpiUnit, now: number, before: number): string {
  const diff = now - before;
  if (Math.abs(diff) < (unit === "percent" ? 0.0005 : 0.05)) return "no change";
  const arrow = diff > 0 ? "▲" : "▼";
  if (unit === "percent") return `${arrow} ${Math.abs(diff * 100).toFixed(1)} pts`;
  const size = formatValue(unit, Math.abs(diff));
  if (unit === "count" && before > 0) {
    const pct = (diff / before) * 100;
    return `${arrow} ${size} (${pct > 0 ? "+" : "−"}${Math.abs(pct).toFixed(1)}%)`;
  }
  return `${arrow} ${size}`;
}

const BARS = "▁▂▃▄▅▆▇█";

/** Eight weeks as bars, oldest first; a week without a number is a dot. */
export function sparkline(values: Array<number | null>): string {
  const known = values.filter((v): v is number => v !== null);
  if (known.length === 0) return "";
  const [lo, hi] = [Math.min(...known), Math.max(...known)];
  return values
    .map((v) =>
      v === null
        ? "·"
        : hi === lo
          ? BARS[3]
          : BARS[Math.round(((v - lo) / (hi - lo)) * (BARS.length - 1))]
    )
    .join("");
}

/** The context of each week: its days, ad spend and which sources are complete for it. */
export function weekContexts(weeks: DropoffWeek[], ad: AdCost, today: string): WeekContext[] {
  const draftsFrom = addDays(today, -DRAFT_DAYS);
  return weeks.map((week) => {
    const monday = reportingDay(week.since);
    const days = weekDays(week, today);
    return {
      monday,
      days: days.length,
      partial: week.partial,
      adCost: adSpend(ad, days),
      startsComplete: monday >= draftsFrom,
      stepsComplete: monday >= FIRST_TRACKED_MONDAY,
    };
  });
}

/** Whether a week is final: complete, and its Sunday more than two weeks back. */
export function isFrozenWeek(monday: string, today: string): boolean {
  return addDays(monday, 6) < addDays(today, -FREEZE_AFTER_DAYS);
}

/** Every row for every KPI, week and slice that has a number. */
export function buildKpiRows(data: KpiWeekData[], contexts: WeekContext[]): KpiRow[] {
  const rows: KpiRow[] = [];
  data.forEach((w, i) => {
    const c = contexts.at(i)!;
    for (const kpi of KPIS) {
      for (const v of kpi.values(w, c)) {
        if (v.value === null || !Number.isFinite(v.value)) continue;
        rows.push({
          key: `${kpi.id} · ${c.monday} · ${v.segment}`,
          week: c.monday,
          days: c.days,
          kpiId: kpi.id,
          kpi: kpi.title,
          unit: kpi.unit,
          segment: v.segment,
          value: stored(kpi.unit, v.value),
          num: v.num ?? null,
          den: v.den ?? null,
          shown: formatValue(kpi.unit, v.value) + (v.extra ?? ""),
        });
      }
    }
  });
  return rows;
}

/** What a KPI's row in 📊 KPI and the top of its page say. */
export interface KpiSummary {
  kpi: KpiDef;
  lastFull: { monday: string; row: KpiRow } | null;
  before: KpiRow | null;
  /** The complete weeks before the last full week (up to four), pooled where the KPI is a ratio. */
  usual: number | null;
  /** How many weeks `usual` stands on. */
  usualWeeks: number;
  soFar: KpiRow | null;
  /** The complete weeks, oldest first. */
  trend: Array<number | null>;
  /** Last full week's other slices. */
  splits: KpiRow[];
  /** The alert rule's verdict: null when there is no rule or too little history. */
  watch: { ok: boolean; text: string } | null;
  notes: string[];
  /** Why the last full week has no number, said instead of one. */
  empty: string;
}

export function summarize(
  rows: KpiRow[],
  data: KpiWeekData[],
  contexts: WeekContext[]
): KpiSummary[] {
  const complete = contexts.map((c, i) => ({ c, i })).filter(({ c }) => !c.partial);
  const last = complete.at(-1);
  const partial = contexts.findIndex((c) => c.partial);
  return KPIS.map((kpi) => {
    const all = (monday: string) =>
      rows.find((r) => r.kpiId === kpi.id && r.week === monday && r.segment === "All traffic") ??
      null;
    const lastRow = last ? all(last.c.monday) : null;
    const prev = complete.at(-2);
    const usualWeeks = complete
      .slice(-5, -1)
      .map(({ c }) => all(c.monday))
      .filter((r): r is KpiRow => r !== null);
    const pooled =
      usualWeeks.length > 0 &&
      usualWeeks.every((r) => r.num !== null && r.den !== null && kpi.unit === "percent")
        ? usualWeeks.reduce((s, r) => s + r.num!, 0) / usualWeeks.reduce((s, r) => s + r.den!, 0)
        : usualWeeks.length > 0
          ? usualWeeks.reduce((s, r) => s + r.value, 0) / usualWeeks.length
          : null;
    const usual = pooled !== null && Number.isFinite(pooled) ? pooled : null;
    const w = last ? data[last.i]! : null;
    const watch =
      kpi.watch && lastRow && usual !== null && usualWeeks.length >= 2 && w
        ? (() => {
            const why = kpi.watch!(lastRow.value, usual, w);
            return why ? { ok: false, text: why } : { ok: true, text: "within its usual range" };
          })()
        : null;
    const notes: string[] = [];
    if (last && w) {
      const n = kpi.note?.(w, last.c);
      if (n) notes.push(n);
    }
    return {
      kpi,
      empty: (last && w && kpi.empty?.(w, last.c)) || "not measured that week",
      lastFull: last && lastRow ? { monday: last.c.monday, row: lastRow } : null,
      before: prev ? all(prev.c.monday) : null,
      usual,
      usualWeeks: usual === null ? 0 : usualWeeks.length,
      soFar: partial >= 0 ? all(contexts.at(partial)!.monday) : null,
      trend: complete.slice(-KPI_WEEKS).map(({ c }) => all(c.monday)?.value ?? null),
      splits: last
        ? rows.filter(
            (r) => r.kpiId === kpi.id && r.week === last.c.monday && r.segment !== "All traffic"
          )
        : [],
      watch,
      notes,
    };
  });
}

/** The live columns of a KPI's row in 📊 KPI, as text. */
export interface KpiColumns {
  lastFullWeek: string;
  weekBefore: string;
  change: string;
  lastWeeks: string;
  thisWeekSoFar: string;
}

export function kpiColumns(s: KpiSummary): KpiColumns {
  const { unit } = s.kpi;
  const last = s.lastFull?.row ?? null;
  const shown = (r: KpiRow) => `${r.shown}${s.kpi.suffix ?? ""}`;
  return {
    lastFullWeek: last ? `${shown(last)} (${weekRange(last.week)})` : s.empty,
    weekBefore: s.before ? shown(s.before) : "",
    change: last && s.before ? formatChange(unit, last.value, s.before.value) : "",
    lastWeeks: s.trend.some((v) => v !== null) ? sparkline(s.trend) : "",
    thisWeekSoFar: s.soFar
      ? `${shown(s.soFar)} (${s.soFar.days} day${s.soFar.days === 1 ? "" : "s"})`
      : "",
  };
}

/** A run of text in a callout, as Notion styles it. */
export interface Span {
  text: string;
  bold?: boolean;
  italic?: boolean;
}

const SPLIT_LABEL: Record<string, string> = {
  "Google Ads": "Google Ads",
  "Other sources": "other sources",
  Phone: "phone",
  Computer: "computer",
  "Landing: question card": "question card",
  "Landing: video": "video",
};

function splitLine(s: KpiSummary): Span[] | null {
  if (s.splits.length === 0) return null;
  const groups: Array<[string, string[]]> = [
    ["By source", ["Google Ads", "Other sources"]],
    ["By device", ["Phone", "Computer"]],
    ["By landing page", ["Landing: question card", "Landing: video"]],
  ];
  const parts = groups
    .map(([label, segs]) => {
      const found = s.splits.filter((r) => segs.includes(r.segment));
      if (found.length === 0) return null;
      return `${label}: ${found
        .map(
          (r) =>
            `${SPLIT_LABEL[r.segment]} ${r.shown}${r.num !== null && r.den !== null && s.kpi.unit === "percent" ? ` (${WHOLE.format(r.num)} of ${WHOLE.format(r.den)})` : ""}`
        )
        .join(", ")}.`;
    })
    .filter((p): p is string => p !== null);
  return parts.length > 0 ? [{ text: parts.join(" ") }] : null;
}

/** The summary at the top of a High KPI's page: lines, not prose. */
export function kpiCallout(s: KpiSummary, today: string, marker: string): Span[][] {
  const lines: Span[][] = [];
  const last = s.lastFull?.row;
  if (last) {
    const counts =
      last.num !== null && last.den !== null && s.kpi.unit === "percent"
        ? ` (${WHOLE.format(last.num)} of ${WHOLE.format(last.den)})`
        : "";
    lines.push([
      { text: `Last full week, ${weekRange(last.week)}: `, bold: true },
      { text: `${last.shown}${s.kpi.suffix ?? ""}${counts}`, bold: true },
      {
        text:
          (s.before ? `. Week before: ${s.before.shown}` : "") +
          (s.usual !== null
            ? `. Usual level (the ${s.usualWeeks === 1 ? "week" : `${s.usualWeeks} weeks`} before): ${formatValue(s.kpi.unit, s.usual)}.`
            : "."),
      },
    ]);
  } else {
    lines.push([{ text: "Last full week: ", bold: true }, { text: `${s.empty}.` }]);
  }
  const split = splitLine(s);
  if (split) lines.push(split);
  if (s.soFar) {
    lines.push([
      {
        text: `This week so far (${s.soFar.days} day${s.soFar.days === 1 ? "" : "s"}): `,
        bold: true,
      },
      { text: s.soFar.shown },
    ]);
  }
  if (s.watch) {
    lines.push([
      { text: s.watch.ok ? "Watch: " : "⚠ Watch: ", bold: true },
      { text: `${s.watch.text}. The rule: ${s.kpi.rule}.` },
    ]);
  }
  for (const n of s.notes) lines.push([{ text: n }]);
  lines.push([
    {
      text: `Refreshed every morning by the ${marker}, last on ${shortDate(today)}. Weeks run Monday to Sunday, Berlin days; the chart on this page shows every week.`,
      italic: true,
    },
  ]);
  return lines;
}

/**
 * The drop-off KPI's row in 📊 KPI: its numbers live on its own page (kpi-dropoff), so
 * its row shows the week's highest drop-off question. `tallies` is per week of `weeks`,
 * null for a week before survey steps were complete.
 */
export function dropoffColumns(
  weeks: DropoffWeek[],
  tallies: Array<Map<Segment, Tally> | null>,
  today: string
): KpiColumns {
  const asked = new Map(askedQuestions(46).map((q) => [q.qId, q]));
  const top = (t: Map<Segment, Tally> | null) => {
    let best: { n: number; rate: number } | null = null;
    for (const [qId, q] of t?.get("All traffic")?.byQuestion ?? []) {
      const known = asked.get(qId);
      if (!known || q.reached < DROPOFF_FLOOR) continue;
      const rate = q.left / q.reached;
      if (!best || rate > best.rate || (rate === best.rate && known.n < best.n))
        best = { n: known.n, rate };
    }
    return best;
  };
  const tops = weeks.map((w, i) => ({ w, top: top(tallies.at(i) ?? null) }));
  const complete = tops.filter(({ w }) => !w.partial);
  const last = complete.at(-1);
  const before = complete.at(-2);
  const soFar = tops.find(({ w }) => w.partial);
  const days = soFar ? weekDays(soFar.w, today).length : 0;
  const pct = (r: number) => `${(r * 100).toFixed(1)}%`;
  return {
    lastFullWeek: last?.top
      ? `Q${last.top.n} ${pct(last.top.rate)}, the highest (${weekRange(reportingDay(last.w.since))})`
      : "",
    weekBefore: before?.top ? `Q${before.top.n} ${pct(before.top.rate)}` : "",
    change:
      last?.top && before?.top
        ? `${formatChange("percent", last.top.rate, before.top.rate)} (highest question)`
        : "",
    lastWeeks: complete.some(({ top }) => top)
      ? sparkline(complete.map(({ top }) => top?.rate ?? null))
      : "",
    thisWeekSoFar: soFar?.top
      ? `Q${soFar.top.n} ${pct(soFar.top.rate)} (${days} day${days === 1 ? "" : "s"})`
      : "",
  };
}
