/**
 * The Traffic page's figures as Marcus's artboard of 16 Oct 2026 works them out from the
 * server's counts: the nine tiles, the performance columns and their shading, the leakage
 * tones, the buyer index, the stacked channel charts and the cost-vs-quality scatter. Pure, so
 * the page recomputes all of it as the contribution assumptions change.
 */
import type { Table, Tile } from "@features/admin/server/ap/common";
import type { Grain } from "@features/admin/server/ap/filters";
import { EMPTY, fmt, type GoodWhen, type Unit } from "@features/admin/server/ap/format";
import type {
  IntentRow,
  PerfRow,
  PerfTable,
  QualityDot,
  TrafficTiles,
} from "@features/admin/server/ap/traffic";
import {
  contribution,
  kpi,
  KPI_KEYS,
  ratioOrNull as q,
  type Assumptions,
  type KpiKey,
} from "@features/admin/server/ap/traffic-math";

const finite = (v: number | null | undefined): v is number =>
  v !== null && v !== undefined && Number.isFinite(v);

/** "0.02×": a ratio as the design writes ROAS and CLV : CAC. */
export function times(v: number | null, digits = 2): string {
  const t = fmt("ratio", v, digits);
  return t === EMPTY ? t : `${t}×`;
}

// ---------------------------------------------------------------------------------------------
// Shading

export interface Shade {
  bg: string;
  fg: string;
}

export const PLAIN: Shade = { bg: "transparent", fg: "#161021" };
export const GOOD: Shade = { bg: "#2e7d5b14", fg: "#1f5c42" };
export const BAD: Shade = { bg: "#d6320012", fg: "#a62700" };

/** The design's band(): green in the top third of the rows' range, red in the bottom third. */
export function band(values: Array<number | null>, v: number | null, lowerIsBetter = false): Shade {
  const xs = values.filter(finite);
  if (!finite(v) || xs.length < 2) return PLAIN;
  const mn = Math.min(...xs);
  const mx = Math.max(...xs);
  if (mx === mn) return PLAIN;
  const t = lowerIsBetter ? 1 - (v - mn) / (mx - mn) : (v - mn) / (mx - mn);
  return t >= 0.67 ? GOOD : t <= 0.33 ? BAD : PLAIN;
}

/**
 * The design's v2pTone(): visitor to paid shaded by rank, red (lowest) through green (highest).
 * Rows that all read the same have no rank, so they stay plain (the design would paint them
 * all red, as tied for last).
 */
export function rankTone(values: Array<number | null>, v: number | null): Shade {
  const xs = values.filter(finite).sort((a, b) => a - b);
  if (!finite(v) || xs.length === 0 || (xs.length > 1 && xs[0] === xs[xs.length - 1])) return PLAIN;
  const t = xs.length > 1 ? xs.indexOf(v) / (xs.length - 1) : 0.5;
  const h = Math.round(t * 140);
  return {
    bg: `hsl(${h}, 62%, ${(91 + Math.abs(t - 0.5) * -6).toFixed(0)}%)`,
    fg: `hsl(${h}, 60%, 27%)`,
  };
}

// ---------------------------------------------------------------------------------------------
// The nine tiles

type Needs = keyof TrafficTiles["blocked"];

export interface TileSpec {
  label: string;
  unit: Unit;
  digits?: number;
  goodWhen: GoodWhen;
  /** What the figure is made of: the first of these that is blocked blanks it, with its reason. */
  needs: Needs[];
  suffix?: string;
  negativeBad?: boolean;
}

const TILE_SPECS: Record<KpiKey, TileSpec> = {
  spend: { label: "Ad spend", unit: "eur", digits: 0, goodWhen: "either", needs: ["spend"] },
  cpc: { label: "CPC", unit: "eur", digits: 2, goodWhen: "down", needs: ["spend"] },
  visitors: { label: "Visitors", unit: "count", goodWhen: "up", needs: ["visitors"] },
  submitCvr: {
    label: "Survey submission CVR",
    unit: "pct",
    digits: 2,
    goodWhen: "up",
    needs: ["visitors", "people"],
  },
  contribPerVisitor: {
    label: "Contribution / visitor",
    unit: "eur3",
    digits: 3,
    goodWhen: "up",
    needs: ["visitors", "spend", "people"],
    negativeBad: true,
  },
  revPerVisitor: {
    label: "Revenue / visitor",
    unit: "eur3",
    digits: 4,
    goodWhen: "up",
    needs: ["visitors", "people"],
  },
  roas: {
    label: "ROAS",
    unit: "ratio",
    digits: 2,
    goodWhen: "up",
    needs: ["spend", "people"],
    suffix: "×",
  },
  visitorToPaid: {
    label: "Visitor → paid",
    unit: "pct",
    digits: 3,
    goodWhen: "up",
    needs: ["visitors", "people"],
  },
  purchaseCvr: {
    label: "Purchase CVR",
    unit: "pct",
    digits: 2,
    goodWhen: "up",
    needs: ["people"],
  },
};

/** The nine headline tiles, in the design's order, under the assumptions in force. */
export function trafficTiles(
  t: TrafficTiles,
  a: Assumptions
): Array<{ tile: Tile; spec: TileSpec }> {
  return KPI_KEYS.map((key) => {
    const spec = TILE_SPECS[key];
    return {
      spec,
      tile: {
        key,
        label: spec.label,
        unit: spec.unit,
        value: kpi(key, t.now, a),
        prev: t.prev ? kpi(key, t.prev, a) : null,
        goodWhen: spec.goodWhen,
        spark: t.points.map((p) => kpi(key, p, a)),
        foot: "",
        trend: "",
        blocked: spec.needs.map((n) => t.blocked[n]).find((why) => why !== null) ?? null,
      },
    };
  });
}

// ---------------------------------------------------------------------------------------------
// The performance table

export type ColKey =
  | "vis"
  | "spend"
  | "cpm"
  | "ctr"
  | "cpc"
  | "att"
  | "comp"
  | "completes"
  | "cpComplete"
  | "pre"
  | "full"
  | "buy"
  | "v2p"
  | "aov"
  | "cac"
  | "cpPre"
  | "cpFull"
  | "rpu"
  | "rpv"
  | "roas"
  | "refund"
  | "contrib"
  | "cpv"
  | "read"
  | "apu"
  | "clv"
  | "ltvCac";

export type Group = "acq" | "fun" | "mon" | "pro" | "val";

export interface Col {
  key: ColKey;
  label: string;
  group: Group;
  unit: Unit;
  digits?: number;
  /** Which way is better, for the shading and the first sort; null where neither is. */
  better: "hi" | "lo" | null;
  /** Written as a multiple ("0.02×"). */
  times?: boolean;
}

/** The design's columns, in its order, with its decimals. */
export const COLS: Col[] = [
  { key: "vis", label: "Visitors", group: "acq", unit: "count", better: "hi" },
  { key: "spend", label: "Spend", group: "acq", unit: "eur", digits: 0, better: null },
  { key: "cpm", label: "CPM", group: "acq", unit: "eur", digits: 2, better: "lo" },
  { key: "ctr", label: "CTR", group: "acq", unit: "pct", digits: 1, better: "hi" },
  { key: "cpc", label: "CPC", group: "acq", unit: "eur", digits: 2, better: "lo" },
  { key: "att", label: "Start CVR", group: "fun", unit: "pct", digits: 1, better: "hi" },
  { key: "comp", label: "Completion CVR", group: "fun", unit: "pct", digits: 1, better: "hi" },
  { key: "completes", label: "Completes", group: "fun", unit: "count", better: "hi" },
  {
    key: "cpComplete",
    label: "Cost / complete",
    group: "fun",
    unit: "eur",
    digits: 2,
    better: "lo",
  },
  { key: "pre", label: "Pre-unlock rate", group: "mon", unit: "pct", digits: 1, better: "hi" },
  { key: "full", label: "Full unlock rate", group: "mon", unit: "pct", digits: 1, better: "hi" },
  { key: "buy", label: "Purchase CVR", group: "mon", unit: "pct", digits: 2, better: "hi" },
  { key: "v2p", label: "Visitor → paid", group: "mon", unit: "pct", digits: 3, better: "hi" },
  { key: "aov", label: "AOV", group: "mon", unit: "eur", digits: 2, better: "hi" },
  { key: "cac", label: "CAC", group: "mon", unit: "eur", digits: 0, better: "lo" },
  { key: "cpPre", label: "Cost / pre-unlock", group: "mon", unit: "eur", digits: 0, better: "lo" },
  {
    key: "cpFull",
    label: "Cost / full unlock",
    group: "mon",
    unit: "eur",
    digits: 0,
    better: "lo",
  },
  { key: "rpu", label: "Rev. / user", group: "mon", unit: "eur", digits: 2, better: "hi" },
  { key: "rpv", label: "Rev. / visitor", group: "mon", unit: "eur3", digits: 3, better: "hi" },
  { key: "roas", label: "ROAS", group: "mon", unit: "ratio", digits: 2, better: "hi", times: true },
  { key: "refund", label: "Refund rate", group: "mon", unit: "pct", digits: 1, better: "lo" },
  { key: "contrib", label: "Contribution", group: "pro", unit: "eur", digits: 0, better: "hi" },
  { key: "cpv", label: "Contrib. / visitor", group: "pro", unit: "eur3", digits: 3, better: "hi" },
  { key: "read", label: "Median read", group: "val", unit: "mmss", better: "hi" },
  { key: "apu", label: "Assessments / user", group: "val", unit: "ratio", digits: 2, better: "hi" },
  { key: "clv", label: "CLV / user", group: "val", unit: "eur", digits: 2, better: "hi" },
  {
    key: "ltvCac",
    label: "CLV : CAC",
    group: "val",
    unit: "ratio",
    digits: 2,
    better: "hi",
    times: true,
  },
];

export const GROUP_LABEL: Record<Group, string> = {
  acq: "Acquisition",
  fun: "Survey funnel",
  mon: "Monetisation",
  pro: "Profit",
  val: "Engagement & value",
};

export type ViewKey = "profit" | "funnel" | "cost" | "value" | "all";

/** The design's column sets. */
export const VIEWS: Array<{ key: ViewKey; label: string; cols: ColKey[] }> = [
  {
    key: "profit",
    label: "Profit",
    cols: [
      "vis",
      "spend",
      "att",
      "comp",
      "buy",
      "v2p",
      "aov",
      "cac",
      "rpv",
      "roas",
      "contrib",
      "cpv",
    ],
  },
  {
    key: "funnel",
    label: "Funnel",
    cols: ["vis", "att", "comp", "completes", "pre", "full", "buy", "v2p", "cpComplete"],
  },
  {
    key: "cost",
    label: "Cost",
    cols: ["spend", "cpm", "ctr", "cpc", "cpComplete", "cpPre", "cpFull", "cac", "roas"],
  },
  {
    key: "value",
    label: "Engagement & value",
    cols: ["completes", "rpu", "read", "apu", "clv", "ltvCac", "refund"],
  },
  { key: "all", label: "All columns", cols: COLS.map((c) => c.key) },
];

export const colsOf = (view: ViewKey): Col[] =>
  (VIEWS.find((v) => v.key === view) ?? VIEWS[0]!).cols.map((k) => COLS.find((c) => c.key === k)!);

/** A cell as the design writes it; "—" where the figure can't be known. */
export function cellText(col: Col, v: number | null): string {
  return col.times ? times(v, col.digits) : fmt(col.unit, v, col.digits);
}

export type RowValues = Record<ColKey, number | null>;

const BLANK = Object.fromEntries(COLS.map((c) => [c.key, null])) as RowValues;

/** Every column of a row from its counts, as the design defines them; a blocked row is blank. */
export function rowValues(r: PerfRow, a: Assumptions): RowValues {
  if (r.blocked) return BLANK;
  const c = r.counts;
  const contrib = contribution(c, a);
  const perMille = q(c.spend, c.impressions);
  const clv = q(r.lifetimeRevenue, r.people);
  return {
    vis: c.visitors,
    spend: c.spend,
    cpm: perMille === null ? null : perMille * 1000,
    ctr: q(c.clicks, c.impressions),
    cpc: q(c.spend, c.clicks),
    att: q(c.starts, c.visitors),
    comp: q(c.completes, c.starts),
    completes: c.completes,
    cpComplete: q(c.spend, c.completes),
    // The Initial plan (the pre-unlock) isn't on sale.
    pre: null,
    full: q(c.fullPayers, c.completes),
    buy: q(c.payers, c.completes),
    v2p: q(c.payers, c.visitors),
    aov: q(c.revenue, c.sales),
    cac: q(c.spend, c.payers),
    cpPre: null,
    cpFull: q(c.spend, c.fullPayers),
    rpu: q(c.revenue, c.completes),
    rpv: q(c.revenue, c.visitors),
    roas: q(c.revenue, c.spend),
    refund: q(r.refunded, r.allSales),
    contrib,
    cpv: q(contrib, c.visitors),
    read: r.readMs,
    apu: q(c.completes, r.people),
    clv,
    ltvCac: q(clv, q(c.spend, c.completes)),
  };
}

export type SortKey = ColKey | "name";
export type Dir = "asc" | "desc";

/** Rows by a column, blanks last whichever way; by name A to Z or back. */
export function sortRows<T extends { r: PerfRow; v: RowValues }>(
  rows: T[],
  key: SortKey,
  dir: Dir
): T[] {
  const sign = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    if (key === "name") return a.r.name.localeCompare(b.r.name) * sign;
    const x = a.v[key];
    const y = b.v[key];
    if (x === null || y === null) return x === y ? 0 : x === null ? 1 : -1;
    return (x - y) * sign;
  });
}

/** The performance table of a breakdown for the CSV: every column, the total row last. */
export function perfCsv(table: PerfTable, a: Assumptions): Table {
  const sample = table.rows.some((r) => r.sampleVisitors);
  const rows = [...table.rows, ...(table.total ? [table.total] : [])];
  return {
    columns: [
      { label: table.label, unit: "text" },
      { label: "Detail", unit: "text" },
      ...COLS.map((c) => ({
        label: c.key === "vis" && sample ? "Visitors (sample split)" : c.label,
        unit: c.unit,
      })),
    ],
    rows: rows.map((r) => {
      const v = rowValues(r, a);
      return { label: r.name, values: [r.blocked ?? r.sub, ...COLS.map((c) => v[c.key])] };
    }),
  };
}

// ---------------------------------------------------------------------------------------------
// Funnel leakage

export const LEAK_STEPS: Array<{
  key: "att" | "comp" | "buy";
  label: string;
  /** The bar's full width, as drawn: start 20%, completion 100%, purchase 10%. */
  scale: number;
  digits: number;
}> = [
  { key: "att", label: "Start CVR", scale: 0.2, digits: 1 },
  { key: "comp", label: "Completion CVR", scale: 1, digits: 1 },
  { key: "buy", label: "Purchase CVR", scale: 0.1, digits: 2 },
];

/** The rows' average of a rate, each row weighted by its visitors; rows without either are out. */
export function visitorWeighted(
  rows: Array<{ v: number | null; vis: number | null }>
): number | null {
  let w = 0;
  let sum = 0;
  for (const r of rows) {
    if (!finite(r.v) || !finite(r.vis) || r.vis <= 0) continue;
    w += r.vis;
    sum += r.v * r.vis;
  }
  return w ? sum / w : null;
}

/** Red more than 10% under the average, green more than 10% over it. */
export function againstAverage(v: number | null, avg: number | null): string {
  if (!finite(v) || !finite(avg) || avg === 0) return PLAIN.fg;
  const r = v / avg;
  return r < 0.9 ? BAD.fg : r > 1.1 ? GOOD.fg : PLAIN.fg;
}

// ---------------------------------------------------------------------------------------------
// Buyers against curiosity

/** Click-to-paid against the rows' average (1.0); null for every row while nobody has paid. */
export function buyerIndex(rows: IntentRow[]): Array<number | null> {
  let payers = 0;
  let clicks = 0;
  for (const r of rows) {
    if (!r.counts.clicks) continue;
    payers += r.counts.payers;
    clicks += r.counts.clicks;
  }
  const avg = q(payers, clicks);
  return rows.map((r) =>
    avg === null || avg === 0 ? null : q(q(r.counts.payers, r.counts.clicks), avg)
  );
}

// ---------------------------------------------------------------------------------------------
// The stacked channel charts

export type Scale = "total" | "share";
export type Anchor = "start" | "middle" | "end";

export interface ChartMark {
  /** Percent of the plot's width and height, from its bottom left. */
  x: number;
  y: number;
  anchor: Anchor;
  label: string;
}

export interface StackLayer {
  /** SVG polygon points in a 100 × 100 box. */
  pts: string;
  marks: ChartMark[];
  /** Where its label at the line's end sits, percent from the bottom. */
  endY: number;
  endVal: string;
  endShare: string;
}

export interface StackChart {
  grid: Array<{ y: number; label: string }>;
  layers: StackLayer[];
  /** Each point's total over the stack (Total only). */
  tops: ChartMark[];
  totals: number[];
  /** The plot's top, in the scale's unit (counts, or 100 for shares). */
  max: number;
}

/** 1, 2, 2.5, 5 or 10 times a power of ten, at least `v`. */
function niceMax(v: number): number {
  if (!(v > 0)) return 4;
  const m = 10 ** Math.floor(Math.log10(v));
  const f = v / m;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * m;
}

/** Where a point's label hangs from it: inwards at the two ends, centred between. */
export const anchorOf = (w: number, n: number): Anchor =>
  n === 1 ? "middle" : w === 0 ? "start" : w === n - 1 ? "end" : "middle";

/** The point's place across the plot; a single point sits in the middle. */
export const xOf = (w: number, n: number) => (n > 1 ? (w / (n - 1)) * 100 : 50);

/**
 * The design's stacked areas: one layer per channel (series[channel][point]), in counts
 * (Total) or as each point's shares (Share %). A single point is drawn as a band across.
 */
export function stackChart(series: number[][], scale: Scale): StackChart {
  const n = series[0]?.length ?? 0;
  if (n === 0) return { grid: [], layers: [], tops: [], totals: [], max: 1 };
  const totals = Array.from({ length: n }, (_, w) =>
    series.reduce((s, row) => s + (row[w] ?? 0), 0)
  );
  const max = scale === "share" ? 100 : niceMax(Math.max(...totals) * 1.12);
  const val = (i: number, w: number) => {
    const v = series[i]![w] ?? 0;
    return scale === "share" ? (totals[w] ? (v / totals[w]!) * 100 : 0) : v;
  };
  const xs = n > 1 ? totals.map((_, w) => xOf(w, n)) : [0, 100];
  const across = (vs: number[]) => (n > 1 ? vs : [vs[0]!, vs[0]!]);
  const y = (v: number) => (100 - (v / max) * 100).toFixed(2);
  const cum = totals.map(() => 0);
  const layers = series.map((row, i) => {
    const lo = cum.slice();
    const hi = lo.map((v, w) => v + val(i, w));
    hi.forEach((v, w) => (cum[w] = v));
    const top = across(hi).map((v, k) => `${xs[k]!.toFixed(2)},${y(v)}`);
    const bottom = across(lo).map((v, k) => `${xs[k]!.toFixed(2)},${y(v)}`);
    const marks: ChartMark[] = [];
    for (let w = 0; w < n; w++) {
      if (((hi[w]! - lo[w]!) / max) * 100 < 7) continue;
      marks.push({
        x: xOf(w, n),
        y: ((lo[w]! + hi[w]!) / 2 / max) * 100,
        anchor: anchorOf(w, n),
        label:
          scale === "share"
            ? fmt("count", row[w] ?? 0)
            : `${(((row[w] ?? 0) / totals[w]!) * 100).toFixed(0)}%`,
      });
    }
    const last = n - 1;
    return {
      pts: [...top, ...bottom.reverse()].join(" "),
      marks,
      mid: ((lo[last]! + hi[last]!) / 2 / max) * 100,
      endY: 0,
      endVal: fmt("count", row[last] ?? 0),
      endShare: totals[last] ? `${(((row[last] ?? 0) / totals[last]!) * 100).toFixed(1)}%` : EMPTY,
    };
  });
  // The labels at the lines' end: at their layer's middle, at least 8% apart, inside the plot.
  const order = layers.map((_, i) => i).sort((a, b) => layers[a]!.mid - layers[b]!.mid);
  let below = -Infinity;
  for (const i of order) {
    layers[i]!.endY = Math.max(layers[i]!.mid, below + 8);
    below = layers[i]!.endY;
  }
  let above = 108;
  for (const i of [...order].reverse()) {
    layers[i]!.endY = Math.min(layers[i]!.endY, above - 8);
    above = layers[i]!.endY;
  }
  return {
    grid: [0, 0.25, 0.5, 0.75, 1].map((f) => ({
      y: f * 100,
      label: scale === "share" ? `${Math.round(f * 100)}%` : fmt("count", f * max),
    })),
    layers: layers.map(({ pts, marks, endY, endVal, endShare }) => ({
      pts,
      marks,
      endY,
      endVal,
      endShare,
    })),
    tops:
      scale === "share"
        ? []
        : totals.map((t, w) => ({
            x: xOf(w, n),
            y: (t / max) * 100,
            anchor: anchorOf(w, n),
            label: fmt("count", t),
          })),
    totals,
    max,
  };
}

/**
 * The dotted cost line over the submissions chart, in the top band of the plot (80 to 94%):
 * its segments where a point has a figure, and a label at each.
 */
export function costLine(
  cost: Array<number | null>
): { segments: string[]; labels: ChartMark[] } | null {
  const n = cost.length;
  const vals = cost.filter(finite);
  if (vals.length === 0) return null;
  const mx = Math.max(...vals);
  const mn = Math.min(...vals);
  const py = (v: number) => 80 + ((v - mn) / (mx - mn || 1)) * 14;
  const segments: string[] = [];
  let run: string[] = [];
  cost.forEach((v, w) => {
    if (!finite(v)) {
      if (run.length > 1) segments.push(run.join(" "));
      run = [];
      return;
    }
    const at = (100 - py(v)).toFixed(1);
    if (n === 1) run.push(`0,${at}`, `100,${at}`);
    else run.push(`${xOf(w, n).toFixed(1)},${at}`);
  });
  if (run.length > 1) segments.push(run.join(" "));
  const labels: ChartMark[] = [];
  cost.forEach((v, w) => {
    if (finite(v))
      labels.push({ x: xOf(w, n), y: py(v), anchor: anchorOf(w, n), label: fmt("eur", v, 2) });
  });
  return { segments, labels };
}

/** A point's name under the chart: "Week of 21 Sep", "14 Sep", "Oct 2026"; a cut-short one says so. */
export function pointLabel(
  grain: Grain,
  p: { label: string; full: boolean },
  short = false
): string {
  const name = grain === "week" && !short ? `Week of ${p.label}` : p.label;
  return p.full ? name : `${name} (part)`;
}

// ---------------------------------------------------------------------------------------------
// Cost against quality

/** The design's "nice" CAC: rounded to a half of its power of ten (€125 reads €150). */
function halfStep(v: number): number {
  const m = 10 ** Math.floor(Math.log10(v));
  return (Math.round((v / m) * 2) / 2) * m;
}

export interface Scatter {
  /** Cost per click at the right edge, EUR; ticks below it. */
  xMax: number;
  xTicks: number[];
  /** Click-to-paid at the top, percent; 0 while nobody has paid. */
  yMax: number;
  yTicks: number[];
  dots: Array<{ name: string; x: number; y: number; size: number; color: string; d: QualityDot }>;
  iso: Array<{ cac: number; pts: string; lx: number; ly: number }>;
}

const DOT_SHADES = ["#5a42a6", "#6a51b8", "#795fc8", "#8c76d1"];

/**
 * The design's scatter: cost per click across, click-to-paid up (to twice the second best, so
 * one outlier doesn't flatten the rest), bubbles by spend, and the curves of equal CAC at half,
 * one and two times the campaigns' median CAC.
 */
export function scatter(all: QualityDot[]): Scatter {
  const dots = all.filter((d) => finite(d.cpc));
  const maxCpc = Math.max(0, ...dots.map((d) => d.cpc!));
  const step = niceMax(maxCpc > 0 ? maxCpc / 3 : 0.1);
  const k = Math.max(1, Math.ceil(maxCpc / step - 1e-9));
  const xMax = (k + 0.5) * step;
  const cvr = (d: QualityDot) => (d.clickToPaid ?? 0) * 100;
  const best = dots.map(cvr).sort((a, b) => b - a);
  const ref = (best[1] ?? 0) > 0 ? best[1]! : (best[0] ?? 0);
  const yMax = ref > 0 ? Math.ceil(ref * 2 * 1000) / 1000 : 0;
  const yOf = (pct: number) => (yMax > 0 ? (Math.min(pct, yMax) / yMax) * 100 : 0);
  const cacs = dots
    .filter((d) => d.payers > 0)
    .map((d) => d.spend / d.payers)
    .sort((a, b) => a - b);
  const median = cacs[Math.floor(cacs.length / 2)];
  const iso =
    yMax > 0 && median !== undefined && median > 0
      ? [halfStep(median / 2), halfStep(median), halfStep(median * 2)].map((cac) => {
          const pts: string[] = [];
          for (let i = 1; i <= 40; i++) {
            const cpc = (xMax * i) / 40;
            pts.push(
              `${((cpc / xMax) * 100).toFixed(1)},${(100 - yOf((cpc / cac) * 100)).toFixed(1)}`
            );
          }
          const cpcAtTop = Math.min(xMax, (yMax / 100) * cac);
          return {
            cac,
            pts: pts.join(" "),
            lx: (cpcAtTop / xMax) * 100 - (cpcAtTop >= xMax ? 14 : 2),
            ly: yOf((xMax / cac) * 100) - 6,
          };
        })
      : [];
  return {
    xMax,
    xTicks: Array.from({ length: k + 1 }, (_, i) => i * step),
    yMax,
    yTicks: yMax > 0 ? [0, yMax / 3, (yMax * 2) / 3, yMax] : [0],
    dots: dots.map((d, i) => ({
      name: d.name,
      x: (d.cpc! / xMax) * 100,
      y: yOf(cvr(d)),
      size: Math.round(10 + Math.sqrt(Math.max(0, d.spend)) * 1.1),
      color: DOT_SHADES[i % DOT_SHADES.length]!,
      d,
    })),
    iso,
  };
}
