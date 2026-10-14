/**
 * AP-Analytics filters: the state of the shared filter bar, as it travels in the URL and as
 * the server reads it. Used by the pages (to draw the bar) and by the API routes (to count).
 *
 * Days are Berlin days, both ends included, like every other KPI here (see
 * shared/time/reporting-day.ts). The ranges end YESTERDAY, so the period and the one it is
 * compared with are both whole days; "Today" is the one range that is still running.
 */
import { addDays, shortDate } from "./days";
import { reportingDayStart } from "@shared/time/reporting-day";

export const PERIODS = [
  { value: "today", label: "Today" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "12m", label: "Last 12 months" },
  { value: "custom", label: "Custom range" },
] as const;
export type Period = (typeof PERIODS)[number]["value"];

export const COMPARES = [
  { value: "prev", label: "Previous period" },
  { value: "yoy", label: "Same period last year" },
  { value: "none", label: "No comparison" },
] as const;
export type Compare = (typeof COMPARES)[number]["value"];

export const ASSESSMENTS = [
  { value: "all", label: "All assessments" },
  { value: "a", label: "Assessment A" },
  { value: "b", label: "Assessment B (not launched)" },
  { value: "c", label: "Assessment C (not launched)" },
] as const;
export type AssessmentFilter = (typeof ASSESSMENTS)[number]["value"];

/**
 * Where a person came from, read off the survey's tracker (the first page they landed on).
 * Google Ads is a click id or google/cpc; the rest is utm_source as the links set it.
 */
export const SOURCES = [
  { value: "all", label: "All sources" },
  { value: "google_ads", label: "Google Ads" },
  { value: "ai", label: "AI assistants" },
  { value: "email", label: "Email" },
  { value: "social", label: "Social" },
  { value: "referral", label: "Referral" },
  { value: "direct", label: "Direct / untagged" },
] as const;
export type SourceFilter = (typeof SOURCES)[number]["value"];
export type Source = Exclude<SourceFilter, "all">;

/** iOS and Android are mobile; the pricing code reads tablets as one or the other. */
export const DEVICES = [
  { value: "all", label: "All devices" },
  { value: "phone", label: "Mobile" },
  { value: "computer", label: "Desktop" },
] as const;
export type DeviceFilter = (typeof DEVICES)[number]["value"];

/** The country price tiers the pricing code assigns (report_price_quote.country_tier). */
export const TIERS = [
  { value: "all", label: "All tiers" },
  { value: "tier_1", label: "Tier 1" },
  { value: "tier_2", label: "Tier 2" },
  { value: "tier_3", label: "Tier 3" },
  { value: "tier_4", label: "Tier 4" },
  { value: "tier_5", label: "Tier 5" },
  { value: "default", label: "Other countries" },
] as const;
export type TierFilter = (typeof TIERS)[number]["value"];

export interface ApFilters {
  period: Period;
  /** First day, YYYY-MM-DD (Berlin). */
  from: string;
  /** Last day, included. */
  to: string;
  compare: Compare;
  assessment: AssessmentFilter;
  source: SourceFilter;
  device: DeviceFilter;
  tier: TierFilter;
  /** The range includes today, which is still running (set by parseFilters). */
  running?: boolean;
}

/** The first day the site counted anything (the first survey submission). */
export const DATA_START = "2026-03-21";
/** Longer than this is refused: the counting reads every row in the window. */
export const MAX_DAYS = 400;

const DAY = /^\d{4}-\d{2}-\d{2}$/;

function isDay(value: unknown): value is string {
  if (typeof value !== "string" || !DAY.test(value)) return false;
  return addDays(value, 0) === value;
}

function oneOf<T extends string>(options: readonly { value: T }[], value: unknown, fallback: T): T {
  return options.some((o) => o.value === value) ? (value as T) : fallback;
}

/** Days from `from` to `to`, both counted. */
export function dayCount(from: string, to: string): number {
  return (
    Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1
  );
}

/** The days a preset covers, given today's Berlin date. */
export function periodRange(period: Exclude<Period, "custom">, today: string) {
  if (period === "today") return { from: today, to: today };
  const days = period === "7d" ? 7 : period === "30d" ? 30 : period === "90d" ? 90 : 365;
  return { from: addDays(today, -days), to: addDays(today, -1) };
}

export function defaultFilters(today: string): ApFilters {
  return {
    period: "30d",
    ...periodRange("30d", today),
    compare: "prev",
    assessment: "all",
    source: "all",
    device: "all",
    tier: "all",
  };
}

/**
 * Filters from URL parameters. Anything missing or malformed falls back to the default, so a
 * shared link never breaks a page; a custom range is clamped to the data and to today.
 */
export function parseFilters(
  input: URLSearchParams | Record<string, string | undefined>,
  today: string
): ApFilters {
  const get = (k: string) =>
    input instanceof URLSearchParams ? (input.get(k) ?? undefined) : input[k];
  const base = defaultFilters(today);
  const period = oneOf(PERIODS, get("period"), base.period);
  let range = period === "custom" ? null : periodRange(period, today);
  // A preset reaching back before the records starts where they start (Last 12 months).
  if (range && range.from < DATA_START && range.to >= DATA_START)
    range = { ...range, from: DATA_START };
  if (period === "custom") {
    let from = isDay(get("from")) ? get("from")! : base.from;
    let to = isDay(get("to")) ? get("to")! : base.to;
    if (to > today) to = today;
    if (from < DATA_START) from = DATA_START;
    if (from > to) from = to;
    if (dayCount(from, to) > MAX_DAYS) from = addDays(to, -(MAX_DAYS - 1));
    range = { from, to };
  }
  return {
    period,
    from: range!.from,
    to: range!.to,
    compare: oneOf(COMPARES, get("compare"), base.compare),
    assessment: oneOf(ASSESSMENTS, get("assessment"), base.assessment),
    source: oneOf(SOURCES, get("source"), base.source),
    device: oneOf(DEVICES, get("device"), base.device),
    tier: oneOf(TIERS, get("tier"), base.tier),
    running: range!.to >= today,
  };
}

/** The URL parameters for a filter state: defaults left out, the dates only when custom. */
export function filterParams(f: ApFilters): Record<string, string> {
  const out: Record<string, string> = {};
  if (f.period !== "30d") out.period = f.period;
  if (f.period === "custom") {
    out.from = f.from;
    out.to = f.to;
  }
  if (f.compare !== "prev") out.compare = f.compare;
  if (f.assessment !== "all") out.assessment = f.assessment;
  if (f.source !== "all") out.source = f.source;
  if (f.device !== "all") out.device = f.device;
  if (f.tier !== "all") out.tier = f.tier;
  return out;
}

/** The query string for links between pages, so the filters travel with them. */
export function filterQuery(f: ApFilters): string {
  const q = new URLSearchParams(filterParams(f)).toString();
  return q ? `?${q}` : "";
}

/** The same calendar dates a year earlier; 29 Feb becomes 28 Feb. */
function yearEarlier(day: string): string {
  const [y = 1970, m = 1, d = 1] = day.split("-").map(Number);
  const last = new Date(Date.UTC(y - 1, m, 0)).getUTCDate();
  return `${y - 1}-${String(m).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
}

/**
 * The period the figures are compared with, or null. Never while the range includes today:
 * part of a day against whole days would read as a fall every morning.
 */
export function comparisonRange(f: ApFilters): { from: string; to: string } | null {
  if (f.compare === "none" || f.period === "today" || f.running) return null;
  if (f.compare === "yoy") return { from: yearEarlier(f.from), to: yearEarlier(f.to) };
  return previousRange(f);
}

/** The same number of days just before the range. */
export function previousRange(f: Pick<ApFilters, "from" | "to">): { from: string; to: string } {
  const n = dayCount(f.from, f.to);
  return { from: addDays(f.from, -n), to: addDays(f.from, -1) };
}

/** True when no figure can exist for the range: it ends before the site counted anything. */
export function beforeData(range: { from: string; to: string }): boolean {
  return range.to < DATA_START;
}

/** The window as instants: from the start of the first Berlin day to the start of the next. */
export function windowOf(range: { from: string; to: string }): { since: Date; until: Date } {
  return { since: reportingDayStart(range.from), until: reportingDayStart(addDays(range.to, 1)) };
}

function year(day: string): string {
  return day.slice(0, 4);
}

/** "13 Sep – 12 Oct 2026", "5 Oct 2026", "20 Dec 2025 – 3 Jan 2026". */
export function rangeLabel(from: string, to: string): string {
  if (from === to) return `${shortDate(from)} ${year(from)}`;
  if (year(from) === year(to)) return `${shortDate(from)} – ${shortDate(to)} ${year(to)}`;
  return `${shortDate(from)} ${year(from)} – ${shortDate(to)} ${year(to)}`;
}

function labelOf(options: readonly { value: string; label: string }[], value: string): string {
  return options.find((o) => o.value === value)?.label ?? value;
}

/** The line under the bar: the range, the comparison and every filter that narrows. */
export function filterSummary(f: ApFilters, today: string): string {
  const cmp = comparisonRange(f);
  const parts = [
    rangeLabel(f.from, f.to) + (f.to >= today ? " (today so far)" : ""),
    cmp
      ? `vs ${rangeLabel(cmp.from, cmp.to)}`
      : f.period === "today" || f.running
        ? "no comparison while today runs"
        : "no comparison",
  ];
  const narrowing = [
    f.assessment !== "all" ? labelOf(ASSESSMENTS, f.assessment) : null,
    f.source !== "all" ? labelOf(SOURCES, f.source) : null,
    f.device !== "all" ? labelOf(DEVICES, f.device) : null,
    f.tier !== "all" ? labelOf(TIERS, f.tier) : null,
  ].filter((x): x is string => x !== null);
  parts.push(narrowing.length ? narrowing.join(" · ") : "all assessments, sources and devices");
  return parts.join(" · ");
}

/** The narrowing filters that are on, by name, for "this figure ignores …" notes. */
export function activeNarrowing(f: ApFilters): Array<"source" | "device" | "tier"> {
  return (["source", "device", "tier"] as const).filter((k) => f[k] !== "all");
}

export interface Bucket {
  /** First day. */
  from: string;
  /** Last day, included. */
  to: string;
  /** "14 Sep", "Oct 2026". */
  label: string;
  /** Days in the bucket. */
  days: number;
  /** A whole week or month, not one cut short by the range. */
  full: boolean;
}

export type Grain = "day" | "week" | "month";

/** Days for up to two weeks, weeks up to about four months, months beyond. */
export function grainOf(from: string, to: string): Grain {
  const n = dayCount(from, to);
  return n <= 14 ? "day" : n <= 126 ? "week" : "month";
}

/**
 * The points of a trend line, at grainOf's grain: Monday-to-Sunday weeks and calendar months
 * are cut at the ends of the range.
 */
export function buckets(from: string, to: string): Bucket[] {
  const grain = grainOf(from, to);
  const out: Bucket[] = [];
  if (grain === "day") {
    for (let d = from; d <= to; d = addDays(d, 1)) {
      out.push({ from: d, to: d, label: shortDate(d), days: 1, full: true });
    }
    return out;
  }
  if (grain === "week") {
    let start = from;
    while (start <= to) {
      const weekday = (new Date(`${start}T12:00:00Z`).getUTCDay() + 6) % 7; // Monday = 0
      const sunday = addDays(start, 6 - weekday);
      const end = sunday < to ? sunday : to;
      const days = dayCount(start, end);
      out.push({
        from: start,
        to: end,
        label: shortDate(addDays(start, -weekday)),
        days,
        full: days === 7,
      });
      start = addDays(end, 1);
    }
    return out;
  }
  const MONTHS = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  let start = from;
  while (start <= to) {
    const [y = 1970, m = 1] = start.split("-").map(Number);
    const monthEnd = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
    const end = monthEnd < to ? monthEnd : to;
    const days = dayCount(start, end);
    out.push({
      from: start,
      to: end,
      label: `${MONTHS[m - 1]} ${y}`,
      days,
      full: start.endsWith("-01") && end === monthEnd,
    });
    start = addDays(end, 1);
  }
  return out;
}

/**
 * The points a trend line draws: the whole weeks or months of the range. A week cut short
 * by the range would read as a drop, so it is left out, unless fewer than two whole ones.
 */
export function trendBuckets(from: string, to: string): Bucket[] {
  const all = buckets(from, to);
  const full = all.filter((b) => b.full);
  return full.length >= 2 ? full : all;
}

/** "Weekly · 14 Sep – 5 Oct": what a trend line's points are. */
export function bucketCaption(from: string, to: string): string {
  const b = trendBuckets(from, to);
  if (!b.length) return "";
  const kind = { day: "Daily", week: "Weekly", month: "Monthly" }[grainOf(from, to)];
  return b.length === 1
    ? `${kind} · ${b[0]!.label}`
    : `${kind} · ${b[0]!.label} – ${b[b.length - 1]!.label}`;
}
