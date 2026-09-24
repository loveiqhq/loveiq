import { supabaseFetch } from "@features/admin/server/supabase";
import { brainDailyRollup, longDate } from "@features/brain/server/ingest/analytics";
import { fetchShipped, shippedEntries } from "@features/brain/server/shipped";

/**
 * WHY DID A NUMBER JUMP, answered from our own numbers before anyone guesses.
 *
 * Marcus, 15 Sep: "I don't trust the data… lacking an explanation that justifies 100% higher
 * CVR". Mark, same day: "12000 visitors in a day?!". Both were asking the same thing: is this
 * move real, and where did it come from. Plan item A9.
 *
 * Two halves. `readMetric` decides whether a day is outside its usual range, against the 28
 * days before it (median and MAD, so one earlier spike does not widen the range for a month).
 * `explainReading` then splits the move by what we can see: traffic source and channel, the
 * two halves of a rate, how engaged the traffic was, whether GA4 and our own count agree, ad
 * spend and campaigns, and what shipped or was decided in those days.
 *
 * NO MODEL WRITES THE CAUSE. The replay scanners taught this: a model shown a real change
 * narrates a confident mechanism for it, and every mechanism checked was wrong. So every line
 * here is a number with its source, the "likely" sentences are fixed rules over those numbers,
 * and the answer ends by saying none of it is proof.
 */

type Rollup = Awaited<ReturnType<typeof brainDailyRollup>>[number];

/** One GA4 day, read back from the brain's own day record. */
export interface Ga4Day {
  day: string;
  sessions: number;
  users: number;
  newUsers: number;
  engaged: number;
  adCost: number | null;
  channels: Record<string, number>;
  campaigns: Record<string, number>;
}

export interface DaySeries {
  day: string;
  rollup?: Rollup;
  ga4?: Ga4Day;
}

/**
 * Parse the GA4 day record the Google ingester writes (`renderGa4` in ingest/google.ts).
 *
 * Channels, engagement and campaigns live only in the body text, not in `meta`, so they are
 * read back from the lines that ingester prints. The test pins that format with a real body.
 */
export function parseGa4Day(day: string, body: string, meta: Record<string, unknown>): Ga4Day {
  const num = (re: RegExp) => Number(re.exec(body)?.[1] ?? 0);
  const pairs = (line: string | undefined, value: RegExp) => {
    const out: Record<string, number> = {};
    for (const m of (line ?? "").matchAll(value)) out[m[1]!.trim()] = Number(m[2]);
    return out;
  };
  const channels = /^Channels: (.+)$/m.exec(body)?.[1];
  const campaigns = /^Ad campaigns: (.+)$/m.exec(body)?.[1];
  return {
    day,
    sessions: Number(meta.sessions ?? num(/Sessions: (\d+)/)),
    users: Number(meta.users ?? num(/Users: (\d+)/)),
    newUsers: num(/New users: (\d+)/),
    engaged: num(/Engaged sessions: (\d+)/),
    adCost: typeof meta.ad_cost === "number" ? meta.ad_cost : null,
    channels: pairs(channels, /([^,]+?) (\d+)(?:, |$)/g),
    campaigns: pairs(campaigns, /(.+?) EUR ([\d.]+)(?:, |$)/g),
  };
}

interface Rate {
  num: (d: DaySeries) => number | null;
  den: (d: DaySeries) => number | null;
  numLabel: string;
  denLabel: string;
  /** Days with fewer than this in the denominator are too small to read a rate off. */
  minDen: number;
}

export interface Metric {
  id: string;
  label: string;
  count?: (d: DaySeries) => number | null;
  rate?: Rate;
  /** The smallest move worth a word, however unusual: three sales is news, three visitors is not. */
  minAbs?: number;
  /** Where a count's move can be split, e.g. by traffic source. */
  segments?: { label: string; of: (d: DaySeries) => Record<string, number> | null };
}

const r = (k: keyof Rollup) => (d: DaySeries) => (d.rollup ? Number(d.rollup[k] ?? 0) : null);

export const METRICS: Metric[] = [
  {
    id: "visitors",
    label: "Visitors (our own count)",
    count: r("unique_visitors"),
    minAbs: 50,
    segments: { label: "traffic source", of: (d) => d.rollup?.top_sources ?? null },
  },
  {
    id: "sessions",
    label: "GA4 sessions",
    count: (d) => d.ga4?.sessions ?? null,
    minAbs: 50,
    segments: { label: "GA4 channel", of: (d) => d.ga4?.channels ?? null },
  },
  { id: "survey_starts", label: "Surveys started", count: r("survey_starts"), minAbs: 20 },
  { id: "submissions", label: "Surveys finished", count: r("submissions"), minAbs: 8 },
  { id: "report_opens", label: "Reports opened", count: r("report_opens"), minAbs: 8 },
  { id: "reports_paid", label: "Reports paid", count: r("reports_paid"), minAbs: 3 },
  {
    id: "start_rate",
    label: "Share of visitors who start the survey",
    rate: {
      num: r("survey_starts"),
      den: r("unique_visitors"),
      numLabel: "surveys started",
      denLabel: "visitors",
      minDen: 50,
    },
  },
  {
    id: "finish_rate",
    label: "Share of starters who finish the survey",
    rate: {
      num: r("submissions"),
      den: r("survey_starts"),
      numLabel: "surveys finished",
      denLabel: "surveys started",
      minDen: 20,
    },
  },
  {
    id: "visitor_cvr",
    label: "Share of visitors who finish the survey",
    rate: {
      num: r("submissions"),
      den: r("unique_visitors"),
      numLabel: "surveys finished",
      denLabel: "visitors",
      minDen: 50,
    },
  },
  {
    id: "engaged_rate",
    label: "Share of GA4 sessions that engage",
    rate: {
      num: (d) => d.ga4?.engaged ?? null,
      den: (d) => d.ga4?.sessions ?? null,
      numLabel: "engaged sessions",
      denLabel: "GA4 sessions",
      minDen: 50,
    },
  },
  {
    id: "paid_rate",
    label: "Share of report openers who pay",
    rate: {
      num: r("reports_paid"),
      den: r("report_opens"),
      numLabel: "reports paid",
      denLabel: "reports opened",
      minDen: 10,
    },
  },
];

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const n = s.length;
  return n % 2 ? s[(n - 1) / 2]! : (s[n / 2 - 1]! + s[n / 2]!) / 2;
};

export const BASELINE_DAYS = 28;
/** Fewer comparable days than this and there is no usual to be outside of. */
const MIN_BASELINE = 14;
/** Robust z past which a day is unusual. Tuned so a quiet month raises nothing. */
const Z = 3.5;

export interface Reading {
  metric: Metric;
  day: string;
  value: number;
  usual: number;
  low: number;
  high: number;
  z: number;
  num?: number;
  den?: number;
  usualNum?: number;
  usualDen?: number;
}

const valueOf = (m: Metric, d: DaySeries): number | null => {
  if (m.count) return m.count(d);
  const num = m.rate!.num(d);
  const den = m.rate!.den(d);
  return num === null || den === null || den < m.rate!.minDen ? null : num / den;
};

/**
 * Where `day` sits against the days before it, or null when there is not enough history.
 *
 * The spread has a floor so a flat baseline cannot make a tiny move look enormous: for a
 * count it is the Poisson noise of the usual value, for a rate the binomial noise at the
 * day's own denominator. Without it, a metric that was 0 every day for a month and is 1 today
 * would be infinitely unusual.
 */
export function readMetric(
  m: Metric,
  series: DaySeries[],
  day: string,
  baselineDays = BASELINE_DAYS
): Reading | null {
  const at = series.findIndex((d) => d.day === day);
  if (at < 0) return null;
  const value = valueOf(m, series[at]!);
  if (value === null) return null;
  const before = series.slice(Math.max(0, at - baselineDays), at);
  const base = before.map((d) => valueOf(m, d)).filter((v): v is number => v !== null);
  if (base.length < MIN_BASELINE) return null;
  const usual = median(base);
  /**
   * TWO SPREADS, ONE PER SIDE. A move up is measured against how the days BELOW the usual
   * varied, and a move down against the days above it. With one spread, a month with a
   * spike every few days widened the range for everything: on 2026-09-24, 663 visitors with
   * 4% of GA4 sessions engaged read as ordinary, because seven of the 28 days before it were
   * spikes too. The quiet side of the baseline is what "usual" actually looks like.
   */
  const side = (keep: (v: number) => boolean) =>
    median(base.filter(keep).map((v) => Math.abs(v - usual)));
  const mad = value >= usual ? side((v) => v <= usual) : side((v) => v >= usual);
  let floor = Math.sqrt(Math.max(usual, 1));
  let extra: Partial<Reading> = {};
  if (m.rate) {
    const den = m.rate.den(series[at]!)!;
    const p = Math.min(Math.max(usual, 0.5 / den), 1 - 0.5 / den);
    floor = Math.sqrt((p * (1 - p)) / den);
    const nums = before.map(m.rate.num).filter((v): v is number => v !== null);
    const dens = before.map(m.rate.den).filter((v): v is number => v !== null);
    extra = {
      num: m.rate.num(series[at]!)!,
      den,
      usualNum: nums.length ? median(nums) : undefined,
      usualDen: dens.length ? median(dens) : undefined,
    };
  }
  const spread = Math.max(1.4826 * mad, floor);
  return {
    metric: m,
    day,
    value,
    usual,
    low: Math.max(0, usual - 2 * Math.max(1.4826 * side((v) => v >= usual), floor)),
    high: usual + 2 * Math.max(1.4826 * side((v) => v <= usual), floor),
    z: (value - usual) / spread,
    ...extra,
  };
}

/** Outside the usual range AND big enough to matter. */
export function isJump(r: Reading): boolean {
  if (Math.abs(r.z) < Z) return false;
  const move = Math.abs(r.value - r.usual);
  if (r.metric.rate) return move >= 0.3 * Math.max(r.usual, 1e-9);
  return move >= Math.max(r.metric.minAbs ?? 0, 0.3 * r.usual);
}

const addDays = (day: string, n: number) =>
  new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** GA4 day records from `from` to `until`, from the brain's own copy. */
async function ga4Days(from: string, until: string): Promise<Map<string, Ga4Day>> {
  const res = await supabaseFetch(
    `/rest/v1/brain_chunk?select=body,meta,period_end` +
      `&source=eq.ga4&source_id=like.daily:*` +
      `&period_end=gte.${from}&period_end=lte.${until}&order=period_end.asc&limit=1000`
  );
  if (!res.ok) throw new Error(`ga4 day records: ${res.status}`);
  const rows = (await res.json()) as Array<{
    body: string;
    meta: Record<string, unknown> | null;
    period_end: string;
  }>;
  return new Map(rows.map((r) => [r.period_end, parseGa4Day(r.period_end, r.body, r.meta ?? {})]));
}

/**
 * Every day from `until` back far enough for `until` and the day before it to have a full
 * baseline, oldest first. GA4 is optional: a failed read leaves the funnel metrics standing.
 */
export async function loadSeries(until: string, extraDays = 0): Promise<DaySeries[]> {
  const from = addDays(until, -(BASELINE_DAYS + 1 + extraDays));
  const today = new Date().toISOString().slice(0, 10);
  const span =
    Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) +
    1;
  const [rows, ga4] = await Promise.all([
    brainDailyRollup(span),
    ga4Days(from, until).catch(() => new Map<string, Ga4Day>()),
  ]);
  const byDay = new Map(rows.map((row) => [String(row.day).slice(0, 10), row]));
  const out: DaySeries[] = [];
  for (let d = from; d <= until; d = addDays(d, 1)) {
    out.push({ day: d, rollup: byDay.get(d), ga4: ga4.get(d) });
  }
  return out;
}

/** Every metric that is unusual on `day`; with `onsetOnly`, only those that were not already unusual the day before. */
export function jumpsOn(series: DaySeries[], day: string, onsetOnly = false): Reading[] {
  const yesterday = addDays(day, -1);
  return METRICS.flatMap((m) => {
    const now = readMetric(m, series, day);
    if (!now || !isJump(now)) return [];
    if (onsetOnly) {
      const before = readMetric(m, series, yesterday);
      if (before && isJump(before) && Math.sign(before.z) === Math.sign(now.z)) return [];
    }
    return [now];
  });
}

/** What happened around a day that a number cannot show: shipped changes and decisions. */
export interface Around {
  shipped: Array<{ date: string; pr: number | null; text: string }> | null;
  decisions: Array<{ date: string; title: string; id: string }> | null;
}

export async function loadAround(day: string): Promise<Around> {
  const from = addDays(day, -2);
  const [shipped, decisions] = await Promise.all([
    fetchShipped(from, day)
      .then((r) => (r.ok ? shippedEntries(r.commits) : null))
      .catch(() => null),
    supabaseFetch(
      `/rest/v1/brain_chunk?select=source_id,title,period_end&source=eq.decision` +
        `&period_end=gte.${addDays(day, -3)}&period_end=lte.${day}&order=period_end.desc&limit=5`
    )
      .then(async (res) =>
        res.ok
          ? (
              (await res.json()) as Array<{
                source_id: string;
                title: string | null;
                period_end: string;
              }>
            ).map((d) => ({
              date: d.period_end,
              title: d.title ?? "",
              id: `decision/${d.source_id}`,
            }))
          : null
      )
      .catch(() => null),
  ]);
  return { shipped, decisions };
}

const fmt = (m: Metric, v: number) =>
  m.rate ? `${(v * 100).toFixed(1)}%` : Math.round(v).toLocaleString("en-GB");
const change = (v: number, u: number) =>
  u > 0
    ? `${v >= u ? "+" : ""}${Math.round(((v - u) / u) * 100)}%`
    : v > 0
      ? "up from nothing"
      : "no change";
const rel = (v: number, u: number) => (u > 0 ? (v - u) / u : v > 0 ? Infinity : 0);

function baselineOf(series: DaySeries[], day: string): { at: number; before: DaySeries[] } {
  const at = series.findIndex((d) => d.day === day);
  return { at, before: series.slice(Math.max(0, at - BASELINE_DAYS), at) };
}

/** A count's move split by segment, biggest move first. Days without the breakdown are left out, not read as zero. */
export function segmentShift(
  m: Metric,
  series: DaySeries[],
  day: string
): Array<{ name: string; value: number; usual: number; delta: number }> {
  if (!m.segments) return [];
  const { at, before } = baselineOf(series, day);
  const today = m.segments.of(series[at]!) ?? {};
  const days = before.map((d) => m.segments!.of(d)).filter((s): s is Record<string, number> => !!s);
  if (days.length === 0) return [];
  const names = new Set([...Object.keys(today), ...days.flatMap((s) => Object.keys(s))]);
  return [...names]
    .map((name) => {
      const usual = median(days.map((s) => s[name] ?? 0));
      const value = today[name] ?? 0;
      return { name, value, usual, delta: value - usual };
    })
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
}

/**
 * What one metric's own numbers say: which segment carried the move, or which half of a
 * rate did. Everything that belongs to the whole day is in `explainDay`, said once.
 */
export function explainMetric(reading: Reading, series: DaySeries[]): string[] {
  const m = reading.metric;
  const out: string[] = [];
  const total = reading.value - reading.usual;

  const shift = segmentShift(m, series, reading.day);
  if (shift.length > 0) {
    const top = shift[0]!;
    if (Math.sign(top.delta) === Math.sign(total) && Math.abs(top.delta) >= 0.6 * Math.abs(total)) {
      out.push(
        `Most of it is ${m.segments!.label} "${top.name}": ${top.delta > 0 ? "+" : ""}${Math.round(top.delta)} of the ` +
          `${total > 0 ? "+" : ""}${Math.round(total)}.`
      );
    }
    out.push(
      `By ${m.segments!.label}: ` +
        shift
          .slice(0, 4)
          .map((x) => `${x.name} ${Math.round(x.value)} (usual ${Math.round(x.usual)})`)
          .join(", ")
    );
  }

  if (m.rate && reading.usualNum !== undefined && reading.usualDen !== undefined) {
    const cn = rel(reading.num!, reading.usualNum);
    const cd = rel(reading.den!, reading.usualDen);
    // The rate moved against its denominator's move, and the denominator moved more: the
    // "conversion doubled" that is really traffic halving.
    if (Math.abs(cd) > Math.abs(cn) && Math.sign(cd) === -Math.sign(total)) {
      out.push(
        `The rate moved because ${m.rate.denLabel} ${cd > 0 ? "rose" : "fell"} ` +
          `${change(reading.den!, reading.usualDen)} while ${m.rate.numLabel} ` +
          `${Math.abs(cn) < 0.15 ? "held steady" : `moved ${change(reading.num!, reading.usualNum)}`}. ` +
          `Check ${m.rate.denLabel} before reading this as a ${total > 0 ? "win" : "loss"}.`
      );
    } else if (Math.sign(cn) === Math.sign(total)) {
      out.push(
        `The rate moved because ${m.rate.numLabel} moved ${change(reading.num!, reading.usualNum)} ` +
          `against ${m.rate.denLabel} ${change(reading.den!, reading.usualDen)}.`
      );
    }
    out.push(
      `${m.rate.numLabel} ${reading.num} (usual ${Math.round(reading.usualNum)}), ` +
        `${m.rate.denLabel} ${reading.den} (usual ${Math.round(reading.usualDen)})`
    );
  }
  return out;
}

/** Shipped changes that could touch the numbers come first; the rest only fill the space left. */
const TOUCHES_NUMBERS =
  /track|analytic|ga4|google ads|consent|cookie|\btag\b|pixel|landing|campaign|\bads?\b|pric|paywall|checkout|survey|visitor|traffic|bot/i;

/**
 * The day-level half: how engaged the traffic was, whether GA4 and our own count agree, ad
 * spend and campaigns, and what shipped or was decided. The "likely" sentences here are
 * fixed rules over those numbers.
 */
export function explainDay(
  series: DaySeries[],
  day: string,
  around: Around
): { likely: string[]; evidence: string[] } {
  const { at, before } = baselineOf(series, day);
  const today = series[at]!;
  const likely: string[] = [];
  const evidence: string[] = [];
  const ours = readMetric(METRICS[0]!, series, day);
  const theirs = readMetric(METRICS[1]!, series, day);
  const trafficUp = [ours, theirs].some((x) => x && x.value >= 1.3 * Math.max(x.usual, 1));

  const ga = today.ga4;
  if (ga) {
    const rateOf = (d: Ga4Day) => (d.sessions >= 20 ? d.engaged / d.sessions : null);
    const newOf = (d: Ga4Day) => (d.users >= 20 ? d.newUsers / d.users : null);
    const usualOf = (f: (d: Ga4Day) => number | null) => {
      const xs = before
        .map((d) => (d.ga4 ? f(d.ga4) : null))
        .filter((v): v is number => v !== null);
      return xs.length ? median(xs) : null;
    };
    const usualEngaged = usualOf(rateOf);
    const usualNew = usualOf(newOf);
    const engaged = rateOf(ga);
    const share = newOf(ga);
    if (engaged !== null && usualEngaged !== null) {
      evidence.push(
        `Engaged GA4 sessions ${(engaged * 100).toFixed(0)}% (usual ${(usualEngaged * 100).toFixed(0)}%)` +
          (share !== null && usualNew !== null
            ? `, new users ${(share * 100).toFixed(0)}% (usual ${(usualNew * 100).toFixed(0)}%)`
            : "")
      );
      if (trafficUp && engaged <= 0.6 * usualEngaged) {
        likely.push(
          `The extra traffic barely engages: ${(engaged * 100).toFixed(0)}% of GA4 sessions were engaged against a ` +
            `usual ${(usualEngaged * 100).toFixed(0)}%, which fits bots or a misfiring tag better than real interest.`
        );
      }
    }

    if (ga.adCost !== null) {
      const spends = before
        .map((d) => d.ga4?.adCost)
        .filter((v): v is number => typeof v === "number");
      const usualSpend = spends.length ? median(spends) : null;
      const week = new Set(
        series.slice(Math.max(0, at - 7), at).flatMap((d) => Object.keys(d.ga4?.campaigns ?? {}))
      );
      const started = Object.keys(ga.campaigns).filter((c) => !week.has(c));
      const stopped = [...week].filter((c) => !(c in ga.campaigns));
      evidence.push(
        `Google Ads spend EUR ${ga.adCost.toFixed(0)}` +
          (usualSpend !== null ? ` (usual EUR ${usualSpend.toFixed(0)})` : "") +
          (started.length ? `; new campaign ${started.join(", ")}` : "") +
          (stopped.length ? `; stopped ${stopped.join(", ")}` : "")
      );
      if (
        usualSpend !== null &&
        usualSpend > 0 &&
        Math.abs(ga.adCost - usualSpend) >= 0.5 * usualSpend
      ) {
        likely.push(
          `Ad spend moved: EUR ${ga.adCost.toFixed(0)} against a usual EUR ${usualSpend.toFixed(0)}.`
        );
      }
      if (started.length) likely.push(`A campaign started that day: ${started.join(", ")}.`);
    }
  }

  if (ours && theirs) {
    const co = rel(ours.value, ours.usual);
    const cs = rel(theirs.value, theirs.usual);
    evidence.push(
      `Our visitor count ${change(ours.value, ours.usual)}, GA4 sessions ${change(theirs.value, theirs.usual)}`
    );
    if (Math.abs(cs) >= 1 && Math.abs(co) < 0.3 * Math.abs(cs)) {
      likely.push(
        `Only GA4 saw it (sessions ${change(theirs.value, theirs.usual)}, our own count ${change(ours.value, ours.usual)}). ` +
          `Look at the GA4 side first: a tag change, or bots that run GA4 but never reach our pages.`
      );
    } else if (Math.abs(co) >= 1 && Math.abs(cs) < 0.3 * Math.abs(co)) {
      likely.push(
        `Only our own count saw it (visitors ${change(ours.value, ours.usual)}, GA4 sessions ${change(theirs.value, theirs.usual)}). ` +
          `GA4 misses visitors who decline cookies, so check consent and our counter first.`
      );
    }
  }

  if (around.shipped === null) evidence.push("What shipped could not be read from GitHub.");
  const shipped = [...(around.shipped ?? [])].sort(
    (a, b) => Number(TOUCHES_NUMBERS.test(b.text)) - Number(TOUCHES_NUMBERS.test(a.text))
  );
  for (const x of shipped.slice(0, 4))
    evidence.push(`Shipped ${x.date}${x.pr ? ` (#${x.pr})` : ""}: ${x.text}`);
  if (shipped.length > 4)
    evidence.push(
      `(${shipped.length - 4} more changes shipped those days: what_shipped lists them.)`
    );
  for (const d of (around.decisions ?? []).slice(0, 3))
    evidence.push(`Decided ${d.date}: ${d.title} (${d.id})`);
  return { likely, evidence };
}

export const NOT_PROOF =
  "None of this proves a cause: it is what our own numbers show around the day. For a finer cut " +
  "(country, device, landing page), ask query_external_service ga4 for that day.";

/** One metric's line and its own evidence. */
export function renderMetric(reading: Reading, series: DaySeries[]): string {
  const m = reading.metric;
  const head =
    `${m.label}: ${fmt(m, reading.value)} against a usual ${fmt(m, reading.usual)} ` +
    `(normal range ${fmt(m, reading.low)} to ${fmt(m, reading.high)}), ${change(reading.value, reading.usual)}.`;
  return [head, ...explainMetric(reading, series).map((l) => `- ${l}`)].join("\n");
}

/** A whole day: each reading, then what the day itself shows, said once. */
export function renderDay(
  day: string,
  readings: Reading[],
  series: DaySeries[],
  around: Around
): string {
  const { likely, evidence } = explainDay(series, day, around);
  return [
    readings.map((x) => renderMetric(x, series)).join("\n\n"),
    likely.length ? `Likely, from the whole day:\n${likely.map((l) => `- ${l}`).join("\n")}` : null,
    evidence.length
      ? `Around ${longDate(day)}:\n${evidence.map((l) => `- ${l}`).join("\n")}`
      : null,
  ]
    .filter(Boolean)
    .join("\n\n");
}

/**
 * Yesterday's unusual numbers as ONE notice, so Jarvis brings them up in Claude unasked.
 *
 * Only a metric that was NOT already unusual the day before, so a level that stays high
 * after a campaign launch is said once, not every day for a fortnight. Only between 07:00
 * and 10:59 UTC, once GA4 has settled on yesterday, and the headline carries no numbers, so
 * each hourly run in that window rewrites the same notice instead of adding one. No Slack:
 * this is the Claude-side half of the proactive layer.
 */
export async function noticeJumps(
  now: Date,
  record: (input: {
    headline: string;
    detail: string;
    kind: string;
    evidence?: string;
  }) => Promise<boolean>
): Promise<number> {
  const hour = now.getUTCHours();
  if (hour < 7 || hour > 10) return 0;
  const day = addDays(now.toISOString().slice(0, 10), -1);
  const series = await loadSeries(day);
  const readings = jumpsOn(series, day, true);
  if (readings.length === 0) return 0;
  await record({
    headline: `Unusual numbers on ${longDate(day)}`,
    detail: `${renderDay(day, readings, series, await loadAround(day))}\n\n${NOT_PROOF}`,
    kind: "number-watch",
    evidence: `explain_change with day ${day} gives the same breakdown, and any metric in full.`,
  });
  return readings.length;
}
