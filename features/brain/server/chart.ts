/**
 * Charts in answers: one or two of the site's daily numbers drawn as a line, so a trend
 * can be seen rather than read ("I need to see it visually", Marcus).
 *
 * THE NUMBERS are the ones `explain_change` reads (jumps.ts: our own daily rollup and the
 * brain's GA4 day records), plus revenue from the same rollup, which takes it from the
 * payment ledger net of refunds with test payments left out, and Google Ads spend through
 * `adCostByDay`, the reader get_business_numbers and the digest use: a day inside the window
 * the ad data covers is its spend or zero, and a day outside it is a gap, never a zero.
 * Nothing here computes a number of its own.
 *
 * THE PICTURE is the Slack digest's own two-line renderer, reached through the same kind of
 * signed URL (/api/admin/digest-image/metric-trend). The URL carries the numbers and a
 * signature, so it opens in any browser without a login and pastes into a doc or a deck,
 * and it is exactly the picture the tool attaches.
 */
import { adCostByDay, adCovers } from "@features/brain/server/ingest/analytics";
import { BASELINE_DAYS, METRICS, loadSeries, type DaySeries } from "@features/brain/server/jumps";
import { fetchWithTimeout } from "@shared/http/fetch-with-timeout";
import { signImagePayload } from "@shared/url/signed-image-url";

/** A day as jumps.ts loads it, plus Google Ads spend when a chart asks for it. */
export type ChartDay = DaySeries & { adSpend?: number | null };

export interface ChartMetric {
  id: string;
  label: string;
  /** For a legend and a two-line title, where the renderer clips at 34 characters. */
  short: string;
  unit: "count" | "rate" | "money";
  /** The day's count or amount, or a rate's numerator. Null: no record for that day. */
  of: (d: ChartDay) => number | null;
  rate?: {
    den: (d: ChartDay) => number | null;
    /** Days with fewer than this in the denominator are drawn as a gap, as in explain_change. */
    minDen: number;
    denLabel: string;
  };
  /** Read from GA4, which misses visitors who decline cookies. */
  ga4?: boolean;
}

/** Legend names in the reader's words, like the digest's titles: no arrows, no "CVR". */
const SHORT: Record<string, string> = {
  visitors: "Visitors",
  sessions: "GA4 sessions",
  survey_starts: "Surveys started",
  submissions: "Surveys finished",
  report_opens: "Reports opened",
  reports_paid: "Reports paid",
  start_rate: "Visitors who start",
  finish_rate: "Starters who finish",
  visitor_cvr: "Visitors who finish",
  engaged_rate: "Sessions that engage",
  paid_rate: "Openers who pay",
};
const FROM_GA4 = new Set(["sessions", "engaged_rate"]);

export const CHART_METRICS: ChartMetric[] = [
  ...METRICS.map((m): ChartMetric => ({
    id: m.id,
    label: m.label,
    short: SHORT[m.id] ?? m.label,
    unit: m.rate ? "rate" : "count",
    of: m.rate ? m.rate.num : (m.count ?? (() => null)),
    rate: m.rate && { den: m.rate.den, minDen: m.rate.minDen, denLabel: m.rate.denLabel },
    ga4: FROM_GA4.has(m.id),
  })),
  {
    id: "revenue",
    label: "Revenue in EUR, net of refunds",
    short: "Revenue",
    unit: "money",
    of: (d) => (d.rollup ? Number(d.rollup.revenue ?? 0) : null),
  },
  {
    id: "ad_spend",
    label: "Google Ads spend in EUR",
    short: "Google Ads spend",
    unit: "money",
    of: (d) => d.adSpend ?? null,
  },
];

export const MIN_DAYS = 7;
export const MAX_DAYS = 180;
export const DEFAULT_DAYS = 30;

/** Slate for the first line and purple for the second: blue and orange mean the landing arms. */
const INK = ["#334155", "#9333ea"] as const;

const DAY_MS = 86_400_000;
const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const addDays = (day: string, n: number) => isoDay(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS);
const isRealDay = (s: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(s) && isoDay(Date.parse(`${s}T00:00:00Z`) || 0) === s;
// A fixed list, not Intl: some ICU builds abbreviate September as "Sept".
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "3 Aug", as the digest labels its axis. */
const shortDay = (day: string) => `${Number(day.slice(8))} ${MONTHS[Number(day.slice(5, 7)) - 1]}`;
const longDay = (day: string) => `${shortDay(day)} ${day.slice(0, 4)}`;
const round2 = (v: number) => Math.round(v * 100) / 100;
const whole = (n: number) => Math.round(n).toLocaleString("en-GB");
const eur = (n: number) =>
  `EUR ${n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
/** "Starters who finish" inside a sentence, but never "google Ads" or "gA4". */
const lowerFirst = (s: string) =>
  /^(Google|GA4)\b/.test(s) ? s : s[0]!.toLowerCase() + s.slice(1);

interface Point {
  day: string;
  value: number | null;
  num: number | null;
  den: number | null;
}

function pointsFor(m: ChartMetric, days: ChartDay[]): Point[] {
  return days.map((d) => {
    const num = m.of(d);
    if (!m.rate) return { day: d.day, value: num === null ? null : round2(num), num, den: null };
    const den = m.rate.den(d);
    const value =
      num === null || den === null || den < m.rate.minDen ? null : round2((100 * num) / den);
    return { day: d.day, value, num, den };
  });
}

/**
 * The window's own number: a total, or for a rate the pooled share over every day. Never an
 * average of daily rates, which lets a day with 40 visitors count as much as one with 4,000.
 */
function windowFigure(m: ChartMetric, pts: Point[]): { brief: string; full: string } | null {
  const seen = pts.filter((p) => p.num !== null);
  if (seen.length === 0) return null;
  const over = seen.length === pts.length ? "" : ` on the ${seen.length} days with a record`;
  if (m.rate) {
    const both = seen.filter((p) => p.den !== null);
    const n = both.reduce((a, p) => a + p.num!, 0);
    const k = both.reduce((a, p) => a + p.den!, 0);
    if (k === 0) return null;
    const share = `${Math.round((1000 * n) / k) / 10}%`;
    return {
      brief: share,
      full: `${share} (${whole(n)} of ${whole(k)} ${m.rate.denLabel})${over}`,
    };
  }
  const total = seen.reduce((a, p) => a + p.num!, 0);
  if (m.unit === "money") return { brief: eur(total), full: `${eur(total)}${over}` };
  return {
    brief: whole(total),
    full: `${whole(total)}${over}, ${whole(total / seen.length)} a day`,
  };
}

function listDays(m: ChartMetric, pts: Point[]): string {
  const one = (p: Point) => {
    const at = shortDay(p.day);
    if (!m.rate) {
      if (p.num === null) return `${at} –`;
      return `${at} ${m.unit === "money" ? p.num.toFixed(2) : whole(p.num)}`;
    }
    const counts = p.num !== null && p.den !== null ? ` (${whole(p.num)}/${whole(p.den)})` : "";
    return `${at} ${p.value === null ? "–" : `${p.value}%`}${counts}`;
  };
  return `- ${m.short}: ${pts.map(one).join(" · ")}`;
}

export interface ChartRequest {
  metrics: unknown;
  days?: unknown;
  until?: unknown;
}

export type ChartOutcome = { ok: false; message: string } | { ok: true; url: string; text: string };

export async function drawChart(req: ChartRequest, now = Date.now()): Promise<ChartOutcome> {
  const refuse = (message: string): ChartOutcome => ({ ok: false, message });
  const ids = [
    ...new Set(
      (Array.isArray(req.metrics) ? req.metrics : [req.metrics])
        .filter((v): v is string => typeof v === "string")
        .map((v) => v.trim())
        .filter(Boolean)
    ),
  ];
  const known = CHART_METRICS.map((m) => m.id).join(", ");
  if (ids.length === 0) return refuse(`Name one or two metrics to chart. They are: ${known}.`);
  if (ids.length > 2) return refuse("A chart holds one or two metrics, on one shared axis.");
  const metrics: ChartMetric[] = [];
  for (const id of ids) {
    const m = CHART_METRICS.find((x) => x.id === id);
    if (!m) return refuse(`No metric called "${id}". It is one of: ${known}.`);
    metrics.push(m);
  }
  const [a, b] = metrics as [ChartMetric, ChartMetric | undefined];
  if (b && b.unit !== a.unit) {
    return refuse(
      `${a.short} and ${lowerFirst(b.short)} are different kinds of number, so they cannot share ` +
        "one axis. Chart two counts, two shares or two amounts in EUR together, or ask for two charts."
    );
  }

  const days =
    req.days === undefined || req.days === null || req.days === ""
      ? DEFAULT_DAYS
      : Number(req.days);
  if (!Number.isInteger(days) || days < MIN_DAYS || days > MAX_DAYS) {
    return refuse(
      `\`days\` is a whole number from ${MIN_DAYS} to ${MAX_DAYS}, not "${String(req.days)}".`
    );
  }
  const today = isoDay(now);
  if (req.until !== undefined && req.until !== null && typeof req.until !== "string") {
    return refuse(`\`until\` must be a day like 2026-09-17, not ${JSON.stringify(req.until)}.`);
  }
  const until = req.until?.trim() || addDays(today, -1);
  if (!isRealDay(until))
    return refuse(`\`until\` must be a real day like 2026-09-17, not "${until}".`);
  if (until > today) return refuse(`${until} has not happened yet.`);

  const base = process.env.NEXT_PUBLIC_SITE_URL;
  if (!base) return refuse("Charts cannot be drawn here: NEXT_PUBLIC_SITE_URL is not set.");

  const wantsAds = metrics.some((m) => m.id === "ad_spend");
  const [loaded, ad] = await Promise.all([
    loadSeries(until, Math.max(0, days - BASELINE_DAYS - 1)),
    wantsAds ? adCostByDay().catch(() => null) : null,
  ]);
  const series: ChartDay[] = loaded
    .slice(-days)
    .map((d) =>
      wantsAds
        ? { ...d, adSpend: ad && adCovers(ad, d.day) ? (ad.byDay.get(d.day) ?? 0) : null }
        : d
    );
  const first = pointsFor(a, series);
  const second = b ? pointsFor(b, series) : undefined;
  const figA = windowFigure(a, first);
  const figB = b && second ? windowFigure(b, second) : undefined;

  const title = b ? `${a.short} and ${lowerFirst(b.short)}` : a.label;
  const windowLabel = `${days} days to ${longDay(until)}`;
  const headline = b
    ? `Over the ${days} days: ${figA?.brief ?? "nothing recorded"} · ${figB?.brief ?? "nothing recorded"}`
    : figA
      ? `Over the ${days} days: ${figA.full}`
      : "Nothing recorded on these days";
  // Only a chart that has a gap explains one: our own counts cover every day.
  const hasGap = [first, second ?? []].some((pts) => pts.some((p) => p.value === null));
  const gap = !hasGap
    ? ""
    : a.rate
      ? b
        ? "a gap is a day with too few people to read a share"
        : `a gap is a day with fewer than ${a.rate.minDen} ${a.rate.denLabel}`
      : "a gap is a day with no record";
  const ga4 = metrics.some((m) => m.ga4);
  const footnote = [
    "daily, UTC",
    gap,
    a.unit === "money" ? "amounts in EUR" : "",
    ga4 ? "GA4 misses visitors who decline cookies" : "",
  ]
    .filter(Boolean)
    .join(" · ");

  const { d, s } = await signImagePayload({
    kind: "metric-trend",
    windowLabel,
    labels: series.map((x) => shortDay(x.day)),
    first: first.map((p) => p.value),
    ...(second ? { last: second.map((p) => p.value) } : {}),
    unit: a.unit === "rate" ? "%" : "",
    title,
    legendFirst: a.short,
    ...(b ? { legendLast: b.short } : {}),
    colorFirst: INK[0],
    ...(b ? { colorLast: INK[1] } : {}),
    headline,
    footnote,
    emptyLabel: "Nothing recorded on these days.",
  });
  const u = new URL("/api/admin/digest-image/metric-trend", base);
  u.searchParams.set("d", d);
  u.searchParams.set("s", s);
  const url = u.toString();

  const notes = [
    until === today ? "Today is still going, so its numbers are partial." : "",
    wantsAds && !ad ? "Google Ads spend could not be read just now, so it is left blank." : "",
    ga4
      ? "GA4 misses visitors who decline cookies, so it reads lower than our own visitor count."
      : "",
  ].filter(Boolean);
  const text = [
    `${title}, ${windowLabel} (UTC days).`,
    b
      ? [a, b]
          .map((m, i) => `${m.short}: ${(i === 0 ? figA : figB)?.full ?? "nothing recorded"}.`)
          .join("\n")
      : `${headline}.`,
    `Picture: ${url}`,
    "The link opens in any browser without a login and can be pasted into a doc or a deck.",
    ...notes,
    "",
    "By day, oldest first:",
    listDays(a, first),
    ...(b && second ? [listDays(b, second)] : []),
  ].join("\n");
  return { ok: true, url, text };
}

/** The picture itself, base64, or null when it could not be drawn in time. */
export async function chartPng(url: string): Promise<string | null> {
  try {
    const res = await fetchWithTimeout(url, { timeoutMs: 8_000 });
    if (!res.ok || !(res.headers.get("content-type") ?? "").startsWith("image/png")) return null;
    return Buffer.from(await res.arrayBuffer()).toString("base64");
  } catch {
    return null;
  }
}
