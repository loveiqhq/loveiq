/**
 * Pure aggregation core for the admin Data Explorer (`/admin/explorer`).
 *
 * The route (`app/api/admin/explorer/route.ts`) fetches + enriches submission
 * rows into `EnrichedRow[]`; everything here is pure (no DB / env / Next imports —
 * `armLabel` is a pure lookup table)
 * so the filtering, breakdown, cross-tab, trend, real-revenue and normalization
 * logic is unit-testable in isolation.
 *
 * Demographic data lives in two places (verified against prod): gender / country
 * / orientation / relationship are on `user_profile`; AGE is only in the survey
 * answer Q15003 (user_profile.birthday is 100% null). Pricing / experiment /
 * device come from `report_price_quote`; engagement from `report_session`. The
 * route resolves all of it and hands clean values to the row.
 */

import { armLabel } from "@features/attribution/server/labels";

export type DimensionKey =
  | "archetype"
  | "age"
  | "gender"
  | "country"
  | "orientation"
  | "relationship"
  | "plan"
  | "paidStatus"
  | "trafficSource"
  | "utmMedium"
  | "utmCampaign"
  | "landingVariant"
  | "device"
  | "experimentGroup"
  | "countryTier"
  | "priceBucket"
  | "behavioralBucket"
  | "reportViewed"
  | "sessionBucket";

export const DIMENSION_LABELS: Record<DimensionKey, string> = {
  archetype: "Archetype",
  age: "Age group",
  gender: "Gender",
  country: "Country",
  orientation: "Sexual orientation",
  relationship: "Relationship",
  plan: "Plan purchased",
  paidStatus: "Paid vs free",
  trafficSource: "Traffic source",
  utmMedium: "UTM medium",
  utmCampaign: "UTM campaign",
  landingVariant: "Landing page",
  device: "Device",
  experimentGroup: "Experiment group",
  countryTier: "Country tier",
  priceBucket: "Price bucket",
  behavioralBucket: "Behavioral bucket",
  reportViewed: "Report viewed",
  sessionBucket: "Report opens",
};

export const DIMENSION_KEYS = Object.keys(DIMENSION_LABELS) as DimensionKey[];

export function isDimensionKey(value: unknown): value is DimensionKey {
  return typeof value === "string" && (DIMENSION_KEYS as string[]).includes(value);
}

/** Bucket used when a dimension value is missing. */
/**
 * Landing arm stamped onto the submission's utm_tracker at submit time, as a
 * plain-English name.
 *
 * It used to return `"control"` for anything that was not exactly `"white"` —
 * matching the get_landing_variant_funnel RPC, which had the same bug — so the
 * Explorer's "Landing variant" dimension put the retired dark arm, the LIVE V1 arm
 * and every submission with no arm stamped into one bucket and called it the dark
 * landing page. On production that was 805 arm-less rows and 34 V1 rows against 53
 * genuinely dark ones: the bucket was 94% not dark, and the arm currently under
 * test was hiding inside it.
 *
 * Returns the display name rather than the raw value because that is how this route
 * already works (see parseTracker returning "Direct" / "(none)") — the Explorer
 * groups by whatever string it gets, and a non-technical reader should never meet
 * `white_prev`. Names come from armLabel, the one vocabulary Slack and the rest of
 * /admin use, so this screen cannot drift from them again.
 */
export function parseLandingVariant(tracker: string | null): string {
  const raw = ((): string | null => {
    if (!tracker?.trim()) return null;
    try {
      const parsed = JSON.parse(tracker) as Record<string, string | undefined>;
      return parsed.landing_variant?.trim() || null;
    } catch {
      return null;
    }
  })();
  return armLabel("landing", raw).short;
}

export const UNKNOWN_LABEL = "Unknown";

/** Stable display order for age buckets (matches survey Q15003 options). */
export const AGE_ORDER = ["18–24", "25–34", "35–44", "45–54", "55–64", "65+"];

const SESSION_ORDER = ["0", "1", "2", "3+"];

/**
 * Dimensions with a fixed display order. Presence here ALSO means "never fold
 * into Other" (these are low-cardinality, ordered axes).
 */
export const DIMENSION_ORDER: Partial<Record<DimensionKey, readonly string[]>> = {
  age: AGE_ORDER,
  sessionBucket: SESSION_ORDER,
  reportViewed: ["Viewed", "Not viewed"],
  paidStatus: ["Paid", "Free"],
  // Display names, in reading order: the two live arms, then the retired one, then
  // traffic that carried no arm. Must be the strings parseLandingVariant returns —
  // it used to be the raw values ["white", "control"], which stopped matching the
  // moment the round-2 arm existed, so V1 rows fell out of the ordering entirely.
  landingVariant: [
    armLabel("landing", "white").short,
    armLabel("landing", "white_prev").short,
    armLabel("landing", "control").short,
    armLabel("landing", null).short,
  ],
};

export interface EnrichedRow {
  submissionId: number;
  email: string | null;
  isTest: boolean;
  archetypeV4: string | null;
  archetypeV5: string | null;
  /** Per-archetype match % (0-100) for ALL archetypes (not just primary). {} when unscored. */
  percentagesV4: Record<string, number>;
  percentagesV5: Record<string, number>;
  ageGroup: string | null;
  gender: string | null;
  country: string | null;
  orientation: string | null;
  relationship: string | null;
  /** Purchased plan (essentials | full_report | all_reports) or null when free. */
  plan: string | null;
  /** Sum of succeeded payment amounts > 0 (real money). $0 coupon unlocks contribute 0. */
  paidAmount: number;
  /** Any succeeded payment row exists (including $0 coupon / admin grants). */
  hasSucceededPayment: boolean;
  trafficSource: string;
  utmMedium: string;
  utmCampaign: string;
  /** Landing A/B arm ("white" | "control") from the submission's utm_tracker. */
  landingVariant: string;
  // Pricing / experiment / device — from the submission's canonical quote.
  device: string | null;
  experimentGroup: string | null;
  countryTier: string | null;
  priceBucket: string | null;
  behavioralBucket: string | null;
  // Engagement — from report_session.
  reportViewed: boolean;
  sessionCount: number;
  durationMs: number | null;
  createdAt: string;
}

export type ArchetypeVersion = "v4" | "v5";
export type PaidStatusFilter = "all" | "paid" | "free";

export interface ExplorerFilters {
  /** When false (default) test rows are dropped and "paid" means real money (>0). */
  includeTest: boolean;
  archetypeVersion: ArchetypeVersion;
  paidStatus: PaidStatusFilter;
  /** Per-dimension allow-lists (already-normalized labels). Empty = no constraint. */
  selections: Partial<Record<DimensionKey, string[]>>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Label normalization
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Normalize a free-text label for grouping: collapse curly apostrophes/quotes to
 * straight, collapse internal whitespace, trim. Without this, smart-quote vs
 * straight-quote variants ("I'd rather not label this" ×2) split into two bars.
 */
export function normalizeLabel(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const cleaned = raw.replace(/[‘’ʼ]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, " ").trim();
  return cleaned.length > 0 ? cleaned : null;
}

/**
 * Collapse the two relationship-labeling eras (short canonical labels + long
 * survey-option labels) into one canonical bucket. Keyed by normalized label.
 */
const RELATIONSHIP_CANON: Record<string, string> = {
  Single: "Single",
  Monogamous: "Monogamous",
  "In one exclusive relationship (only each other)": "Monogamous",
  Monogamish: "Monogamish",
  "Mostly exclusive, with some agreed exceptions": "Monogamish",
  Open: "Open",
  "Non-exclusive, with agreed limits — known as 'open'": "Open",
  Polyamorous: "Polyamorous",
  "Multiple committed relationships, with everyone's knowledge — known as 'polyamorous'":
    "Polyamorous",
  "Solo-poly": "Solo-poly",
  "Multiple connections, prioritizing my own independence (no shared household)": "Solo-poly",
  "Fluid / Undefined": "Figuring it out",
  "Still figuring it out / doesn't fit a label": "Figuring it out",
};

export function canonicalizeRelationship(raw: string | null | undefined): string | null {
  const norm = normalizeLabel(raw);
  if (norm == null) return null;
  return RELATIONSHIP_CANON[norm] ?? norm;
}

/** Map a report-session count to its display bucket. */
export function sessionBucketLabel(count: number): string {
  if (count <= 0) return "0";
  if (count === 1) return "1";
  if (count === 2) return "2";
  return "3+";
}

// ─────────────────────────────────────────────────────────────────────────────
// Paid logic
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Whether a row counts as "paid".
 *  - default (includeTest=false): real money — a succeeded payment with amount > 0.
 *    $0 / 100%-coupon unlocks do NOT count.
 *  - includeTest=true: any succeeded payment counts (coupon/$0/test included).
 */
export function isPaidRow(row: EnrichedRow, includeTest: boolean): boolean {
  return includeTest ? row.hasSucceededPayment : row.paidAmount > 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Dimension accessor + value spec
// ─────────────────────────────────────────────────────────────────────────────

export interface AccessorOpts {
  archetypeVersion: ArchetypeVersion;
  includeTest: boolean;
}

export function dimensionValue(row: EnrichedRow, dim: DimensionKey, opts: AccessorOpts): string {
  switch (dim) {
    case "archetype":
      return (opts.archetypeVersion === "v4" ? row.archetypeV4 : row.archetypeV5) ?? UNKNOWN_LABEL;
    case "age":
      return row.ageGroup ?? UNKNOWN_LABEL;
    case "gender":
      return row.gender ?? UNKNOWN_LABEL;
    case "country":
      return row.country ?? UNKNOWN_LABEL;
    case "orientation":
      return row.orientation ?? UNKNOWN_LABEL;
    case "relationship":
      return row.relationship ?? UNKNOWN_LABEL;
    case "plan":
      return row.plan ?? "Free";
    case "paidStatus":
      return isPaidRow(row, opts.includeTest) ? "Paid" : "Free";
    case "trafficSource":
      return row.trafficSource || UNKNOWN_LABEL;
    case "utmMedium":
      return row.utmMedium || UNKNOWN_LABEL;
    case "utmCampaign":
      return row.utmCampaign || UNKNOWN_LABEL;
    case "landingVariant":
      return row.landingVariant || "control";
    case "device":
      return row.device ?? UNKNOWN_LABEL;
    case "experimentGroup":
      return row.experimentGroup ?? UNKNOWN_LABEL;
    case "countryTier":
      return row.countryTier ?? UNKNOWN_LABEL;
    case "priceBucket":
      return row.priceBucket ?? UNKNOWN_LABEL;
    case "behavioralBucket":
      return row.behavioralBucket ?? UNKNOWN_LABEL;
    case "reportViewed":
      return row.reportViewed ? "Viewed" : "Not viewed";
    case "sessionBucket":
      return sessionBucketLabel(row.sessionCount);
  }
}

/**
 * A value-provider over rows. `order` (when set) gives a fixed display order AND
 * means "never fold into Other". This abstraction lets fixed dimensions and
 * dynamic survey-answer dimensions (`q:<qid>`) share the same aggregation code.
 */
export interface ValueSpec {
  valueOf: (row: EnrichedRow) => string;
  order?: readonly string[];
}

export function specForDimension(dim: DimensionKey, opts: AccessorOpts): ValueSpec {
  return { valueOf: (row) => dimensionValue(row, dim, opts), order: DIMENSION_ORDER[dim] };
}

/** Spec for a survey-answer dimension, backed by a submissionId → label map. */
export function specForAnswers(answerBySubmission: Map<number, string>): ValueSpec {
  return { valueOf: (row) => answerBySubmission.get(row.submissionId) ?? UNKNOWN_LABEL };
}

/** Fixed 1→7 axis for Likert/scale survey questions (ordered ⇒ never folded into Other). */
export const SCALE_ORDER = ["1", "2", "3", "4", "5", "6", "7"] as const;

/**
 * Spec for a 1-7 scale survey question, backed by a submissionId → "1".."7" map
 * (built from `survey_submission_answer.normalized_value`). The fixed `order`
 * keeps the breakdown in score order and never folds low buckets into "Other".
 */
export function specForScale(valueBySubmission: Map<number, string>): ValueSpec {
  return {
    valueOf: (row) => valueBySubmission.get(row.submissionId) ?? UNKNOWN_LABEL,
    order: SCALE_ORDER,
  };
}

function orderIndexIn(order: readonly string[], label: string): number {
  const i = order.indexOf(label);
  return i === -1 ? order.length + (label === UNKNOWN_LABEL ? 1 : 0) : i;
}

// ─────────────────────────────────────────────────────────────────────────────
// Filtering
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Apply the fixed-dimension explorer filters to enriched rows. Order: drop test
 * rows (unless includeTest) → paidStatus → every active per-dimension allow-list.
 * (Survey-answer filters are applied separately by the route, which holds the
 * answer maps.)
 */
export function applyFilters(rows: EnrichedRow[], filters: ExplorerFilters): EnrichedRow[] {
  const opts: AccessorOpts = {
    archetypeVersion: filters.archetypeVersion,
    includeTest: filters.includeTest,
  };
  return rows.filter((row) => {
    if (!filters.includeTest && row.isTest) return false;

    if (filters.paidStatus !== "all") {
      const paid = isPaidRow(row, filters.includeTest);
      if (filters.paidStatus === "paid" && !paid) return false;
      if (filters.paidStatus === "free" && paid) return false;
    }

    for (const dim of DIMENSION_KEYS) {
      const selected = filters.selections[dim];
      if (!selected || selected.length === 0) continue;
      if (dim === "paidStatus") continue; // handled above
      if (!selected.includes(dimensionValue(row, dim, opts))) return false;
    }
    return true;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Stats
// ─────────────────────────────────────────────────────────────────────────────

export interface ExplorerStats {
  total: number;
  paid: number;
  free: number;
  conversionPct: number | null;
  revenue: number;
  avgDurationMin: number | null;
}

export function computeStats(rows: EnrichedRow[], includeTest: boolean): ExplorerStats {
  let paid = 0;
  let revenue = 0;
  const durations: number[] = [];
  for (const row of rows) {
    if (isPaidRow(row, includeTest)) paid += 1;
    revenue += row.paidAmount;
    if (typeof row.durationMs === "number" && row.durationMs > 0) durations.push(row.durationMs);
  }
  const total = rows.length;
  const avgMs =
    durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : null;
  return {
    total,
    paid,
    free: total - paid,
    conversionPct: total > 0 ? Math.round((paid / total) * 1000) / 10 : null,
    revenue: Math.round(revenue * 100) / 100,
    avgDurationMin: avgMs != null ? Math.round((avgMs / 60_000) * 10) / 10 : null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Breakdown (single group-by)
// ─────────────────────────────────────────────────────────────────────────────

export interface BreakdownRow {
  label: string;
  count: number;
  paid: number;
  paidPct: number | null;
  revenue: number;
  /**
   * Distribution share. Single-select/scale/dimension: count / Σcount × 100
   * (sums to ~100). Multi-select: count / cohort size × 100 (penetration —
   * won't sum to 100). Rounded to 1 dp.
   */
  sharePct: number;
  /** Per-gender tallies keyed "Women" | "Men" | "Other" (the survey's gender options collapse to these). */
  byGender: Record<string, { count: number }>;
}

/** Internal breakdown accumulator (carries the gender split). */
interface BreakdownAcc {
  count: number;
  paid: number;
  revenue: number;
  byGender: Map<string, number>;
}

/**
 * Collapse the survey's gender options ("Woman" / "Man" / "Nonbinary" /
 * "Other" / "I'd rather not label this" / null) to the three buckets the
 * strategy lead reads: Women, Men, Other.
 */
function normalizeGender(raw: string | null): "Women" | "Men" | "Other" {
  if (!raw) return "Other";
  const s = raw.trim().toLowerCase();
  if (s === "woman" || s === "women" || s === "female" || s === "f") return "Women";
  if (s === "man" || s === "men" || s === "male" || s === "m") return "Men";
  return "Other";
}

function newBreakdownAcc(): BreakdownAcc {
  return { count: 0, paid: 0, revenue: 0, byGender: new Map() };
}

function bumpBreakdownAcc(g: BreakdownAcc, row: EnrichedRow, includeTest: boolean): void {
  g.count += 1;
  if (isPaidRow(row, includeTest)) g.paid += 1;
  g.revenue += row.paidAmount;
  const gk = normalizeGender(row.gender);
  g.byGender.set(gk, (g.byGender.get(gk) ?? 0) + 1);
}

function genderMapToRecord(m: Map<string, number>): Record<string, { count: number }> {
  const out: Record<string, { count: number }> = {};
  for (const [k, v] of m) out[k] = { count: v };
  return out;
}

/** Generic breakdown over any value provider. */
export function buildBreakdownBy(
  rows: EnrichedRow[],
  spec: ValueSpec,
  opts: { includeTest: boolean; topN?: number }
): BreakdownRow[] {
  const groups = new Map<string, BreakdownAcc>();
  for (const row of rows) {
    const key = spec.valueOf(row);
    const g = groups.get(key) ?? newBreakdownAcc();
    bumpBreakdownAcc(g, row, opts.includeTest);
    groups.set(key, g);
  }

  // Total is the sum of all group counts (each row lands in exactly one group),
  // computed before any top-N fold so the "Other" share stays a true residual.
  const total = [...groups.values()].reduce((s, g) => s + g.count, 0);

  const toRow = (label: string, g: BreakdownAcc): BreakdownRow => ({
    label,
    count: g.count,
    paid: g.paid,
    paidPct: g.count > 0 ? Math.round((g.paid / g.count) * 1000) / 10 : null,
    revenue: Math.round(g.revenue * 100) / 100,
    sharePct: total > 0 ? Math.round((g.count / total) * 1000) / 10 : 0,
    byGender: genderMapToRecord(g.byGender),
  });

  const out: BreakdownRow[] = [...groups.entries()].map(([label, g]) => toRow(label, g));

  if (spec.order) {
    const order = spec.order;
    out.sort((a, b) => orderIndexIn(order, a.label) - orderIndexIn(order, b.label));
    return out; // ordered dims are never folded
  }

  out.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  const topN = opts.topN ?? 12;
  if (out.length > topN) {
    const top = out.slice(0, topN);
    const other = out.slice(topN).reduce<BreakdownAcc>((acc, r) => {
      acc.count += r.count;
      acc.paid += r.paid;
      acc.revenue += r.revenue;
      for (const [k, v] of Object.entries(r.byGender)) {
        acc.byGender.set(k, (acc.byGender.get(k) ?? 0) + v.count);
      }
      return acc;
    }, newBreakdownAcc());
    top.push(toRow("Other", other));
    return top;
  }
  return out;
}

/**
 * Breakdown for a MULTI-select survey question: a submission contributes to
 * EVERY distinct option it selected, so per-option counts reflect option
 * frequency and can sum to more than the number of people (e.g. "what's getting
 * in the way" — people pick several). Submissions with no selection fall into
 * "Unknown" (counted once). Sorted by count desc, folding beyond topN into
 * "Other" like `buildBreakdownBy`.
 */
export function buildMultiLabelBreakdown(
  rows: EnrichedRow[],
  labelsBySubmission: Map<number, string[]>,
  opts: { includeTest: boolean; topN?: number }
): BreakdownRow[] {
  const groups = new Map<string, BreakdownAcc>();
  const bump = (key: string, row: EnrichedRow) => {
    const g = groups.get(key) ?? newBreakdownAcc();
    bumpBreakdownAcc(g, row, opts.includeTest);
    groups.set(key, g);
  };

  for (const row of rows) {
    const labels = labelsBySubmission.get(row.submissionId);
    if (!labels || labels.length === 0) {
      bump(UNKNOWN_LABEL, row);
      continue;
    }
    // Distinct options per submission — a repeated selection can't double-count.
    for (const label of new Set(labels)) bump(label, row);
  }

  // Penetration denominator: the number of people in the cohort, NOT the sum of
  // option tallies (a person who picks 3 options counts toward 3 option rows).
  const cohortSize = rows.length;

  const toRow = (label: string, g: BreakdownAcc): BreakdownRow => ({
    label,
    count: g.count,
    paid: g.paid,
    paidPct: g.count > 0 ? Math.round((g.paid / g.count) * 1000) / 10 : null,
    revenue: Math.round(g.revenue * 100) / 100,
    sharePct: cohortSize > 0 ? Math.round((g.count / cohortSize) * 1000) / 10 : 0,
    byGender: genderMapToRecord(g.byGender),
  });

  const out = [...groups.entries()]
    .map(([label, g]) => toRow(label, g))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

  const topN = opts.topN ?? 12;
  if (out.length > topN) {
    const top = out.slice(0, topN);
    const other = out.slice(topN).reduce<BreakdownAcc>((acc, r) => {
      acc.count += r.count;
      acc.paid += r.paid;
      acc.revenue += r.revenue;
      for (const [k, v] of Object.entries(r.byGender)) {
        acc.byGender.set(k, (acc.byGender.get(k) ?? 0) + v.count);
      }
      return acc;
    }, newBreakdownAcc());
    top.push(toRow("Other", other));
    return top;
  }
  return out;
}

/** Backwards-compatible wrapper: breakdown by a fixed dimension. */
export function buildBreakdown(
  rows: EnrichedRow[],
  dim: DimensionKey,
  opts: { archetypeVersion: ArchetypeVersion; includeTest: boolean; topN?: number }
): BreakdownRow[] {
  const spec = specForDimension(dim, {
    archetypeVersion: opts.archetypeVersion,
    includeTest: opts.includeTest,
  });
  return buildBreakdownBy(rows, spec, { includeTest: opts.includeTest, topN: opts.topN });
}

// ─────────────────────────────────────────────────────────────────────────────
// Cross-tab (2-D)
// ─────────────────────────────────────────────────────────────────────────────

export interface CrossTab {
  rowDim: string;
  colDim: string;
  rowLabels: string[];
  colLabels: string[];
  /** cells[rowLabel][colLabel] = count. */
  cells: Record<string, Record<string, number>>;
  rowTotals: Record<string, number>;
  colTotals: Record<string, number>;
  grandTotal: number;
}

/** Top-N labels for a value provider (ordered specs keep their order, no Other). */
function topLabelsBy(rows: EnrichedRow[], spec: ValueSpec, topN: number): string[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = spec.valueOf(row);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const labels = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([label]) => label);
  if (spec.order) {
    const order = spec.order;
    return labels.sort((a, b) => orderIndexIn(order, a) - orderIndexIn(order, b));
  }
  if (labels.length > topN) {
    return [...labels.slice(0, topN), "Other"];
  }
  return labels;
}

/** Generic cross-tab over two value providers. */
export function buildCrossTabBy(
  rows: EnrichedRow[],
  rowSpec: ValueSpec,
  colSpec: ValueSpec,
  rowDim: string,
  colDim: string,
  topN = 8
): CrossTab {
  const rowLabels = topLabelsBy(rows, rowSpec, topN);
  const colLabels = topLabelsBy(rows, colSpec, topN);
  const rowSet = new Set(rowLabels);
  const colSet = new Set(colLabels);

  const cells: Record<string, Record<string, number>> = {};
  const rowTotals: Record<string, number> = {};
  const colTotals: Record<string, number> = {};
  for (const r of rowLabels) {
    cells[r] = {};
    for (const c of colLabels) cells[r]![c] = 0;
    rowTotals[r] = 0;
  }
  for (const c of colLabels) colTotals[c] = 0;

  let grandTotal = 0;
  for (const row of rows) {
    const rRaw = rowSpec.valueOf(row);
    const cRaw = colSpec.valueOf(row);
    // Each label set is derived from THESE same rows, so a value is absent only
    // when folded into "Other" (which is then present). The null branch is
    // therefore unreachable in practice (grandTotal === rows.length); it stays as
    // a defensive guard. See the reconciliation test.
    const r = rowSet.has(rRaw) ? rRaw : rowSet.has("Other") ? "Other" : null;
    const c = colSet.has(cRaw) ? cRaw : colSet.has("Other") ? "Other" : null;
    if (r == null || c == null) continue;
    cells[r]![c] = (cells[r]![c] ?? 0) + 1;
    rowTotals[r] = (rowTotals[r] ?? 0) + 1;
    colTotals[c] = (colTotals[c] ?? 0) + 1;
    grandTotal += 1;
  }

  return { rowDim, colDim, rowLabels, colLabels, cells, rowTotals, colTotals, grandTotal };
}

/** Backwards-compatible wrapper: cross-tab of two fixed dimensions. */
export function buildCrossTab(
  rows: EnrichedRow[],
  rowDim: DimensionKey,
  colDim: DimensionKey,
  filters: ExplorerFilters,
  topN = 8
): CrossTab {
  const o: AccessorOpts = {
    archetypeVersion: filters.archetypeVersion,
    includeTest: filters.includeTest,
  };
  return buildCrossTabBy(
    rows,
    specForDimension(rowDim, o),
    specForDimension(colDim, o),
    rowDim,
    colDim,
    topN
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Trend over time
// ─────────────────────────────────────────────────────────────────────────────

export type TrendGranularity = "day" | "week";

export interface TrendPoint {
  bucket: string;
  count: number;
  paid: number;
}

/** Bucket an ISO timestamp to a day (YYYY-MM-DD) or the Monday of its ISO week. */
export function bucketDate(iso: string, granularity: TrendGranularity): string {
  if (granularity === "day") return iso.slice(0, 10);
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  const dow = (d.getUTCDay() + 6) % 7; // Monday = 0
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}

export function buildTrend(
  rows: EnrichedRow[],
  granularity: TrendGranularity,
  includeTest: boolean
): TrendPoint[] {
  const map = new Map<string, { count: number; paid: number }>();
  for (const row of rows) {
    const bucket = bucketDate(row.createdAt, granularity);
    const g = map.get(bucket) ?? { count: 0, paid: 0 };
    g.count += 1;
    if (isPaidRow(row, includeTest)) g.paid += 1;
    map.set(bucket, g);
  }
  return [...map.entries()]
    .map(([bucket, g]) => ({ bucket, count: g.count, paid: g.paid }))
    .sort((a, b) => a.bucket.localeCompare(b.bucket));
}

// ─────────────────────────────────────────────────────────────────────────────
// Facets (filter options + counts)
// ─────────────────────────────────────────────────────────────────────────────

export interface FacetValue {
  label: string;
  count: number;
}
export type Facets = Partial<Record<DimensionKey, FacetValue[]>>;

/**
 * Distinct values + counts per fixed dimension over the supplied rows (the route
 * passes the test-filtered, otherwise-unfiltered candidate set so options stay
 * stable as the lead toggles filters). Ordered dims keep their order.
 */
export function buildFacets(rows: EnrichedRow[], opts: AccessorOpts): Facets {
  const facets: Facets = {};
  for (const dim of DIMENSION_KEYS) {
    const counts = new Map<string, number>();
    for (const row of rows) {
      const key = dimensionValue(row, dim, opts);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const order = DIMENSION_ORDER[dim];
    let values: FacetValue[] = [...counts.entries()].map(([label, count]) => ({ label, count }));
    values = order
      ? values.sort((a, b) => orderIndexIn(order, a.label) - orderIndexIn(order, b.label))
      : values.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
    facets[dim] = values;
  }
  return facets;
}

// ─────────────────────────────────────────────────────────────────────────────
// All-archetype profile (full match-% distribution, not just the primary)
// ─────────────────────────────────────────────────────────────────────────────

/** Pick the per-archetype match-% record for the active scoring version. */
export function percentagesForVersion(
  row: EnrichedRow,
  version: ArchetypeVersion
): Record<string, number> {
  return version === "v4" ? row.percentagesV4 : row.percentagesV5;
}

export interface ScaleSummary {
  qid: string;
  /** Mean of the 1-7 answers over the filtered rows that answered (0 when none). */
  avg: number;
  /** Number of filtered rows that actually answered this scale question. */
  n: number;
}

export interface ArchetypeStat {
  archetype: string;
  /** Mean match % (0-100) across filtered rows that have a score for this archetype. */
  avgMatch: number;
  /** Rows that had a numeric match for this archetype. */
  scored: number;
  /** Rows whose PRIMARY archetype is this one. */
  primaryCount: number;
  /** Paid rows among `primaryCount`. */
  primaryPaid: number;
  /** primaryPaid / primaryCount as a %, or null when no primaries. */
  primaryPaidPct: number | null;
}

/**
 * Build the full archetype profile across the filtered cohort: for EVERY
 * archetype (not just each person's #1), the average match %, how many people
 * have it as their primary, and the paid rate among those primaries. The
 * archetype set is derived dynamically from the data (robust to renames — no
 * hardcoded list). Sorted by avgMatch desc; the client may re-sort.
 */
export function buildArchetypeDistribution(
  rows: EnrichedRow[],
  version: ArchetypeVersion,
  includeTest: boolean
): ArchetypeStat[] {
  const sum = new Map<string, number>();
  const scored = new Map<string, number>();
  const primaryCount = new Map<string, number>();
  const primaryPaid = new Map<string, number>();

  for (const row of rows) {
    for (const [name, value] of Object.entries(percentagesForVersion(row, version))) {
      if (!Number.isFinite(value)) continue;
      sum.set(name, (sum.get(name) ?? 0) + value);
      scored.set(name, (scored.get(name) ?? 0) + 1);
    }
    const primary = version === "v4" ? row.archetypeV4 : row.archetypeV5;
    if (primary) {
      primaryCount.set(primary, (primaryCount.get(primary) ?? 0) + 1);
      if (isPaidRow(row, includeTest)) {
        primaryPaid.set(primary, (primaryPaid.get(primary) ?? 0) + 1);
      }
    }
  }

  const names = new Set<string>([...sum.keys(), ...primaryCount.keys()]);
  const out: ArchetypeStat[] = [];
  for (const name of names) {
    const n = scored.get(name) ?? 0;
    const pc = primaryCount.get(name) ?? 0;
    const pp = primaryPaid.get(name) ?? 0;
    out.push({
      archetype: name,
      avgMatch: n > 0 ? Math.round(((sum.get(name) ?? 0) / n) * 10) / 10 : 0,
      scored: n,
      primaryCount: pc,
      primaryPaid: pp,
      primaryPaidPct: pc > 0 ? Math.round((pp / pc) * 1000) / 10 : null,
    });
  }
  out.sort((a, b) => b.avgMatch - a.avgMatch || a.archetype.localeCompare(b.archetype));
  return out;
}

export interface ArchetypeMatchClause {
  archetype: string;
  /** Minimum match % (0-100) required for this archetype. */
  min: number;
}

/**
 * Keep rows whose match % for EVERY clause's archetype is ≥ the clause minimum
 * (AND semantics) — lets the lead filter to people who strongly match ANY
 * archetype, not only their primary. Pure: compares against the in-memory
 * percentages record (no DB / no dynamic SQL).
 */
export function archetypeMatchFilter(
  rows: EnrichedRow[],
  clauses: ArchetypeMatchClause[],
  version: ArchetypeVersion
): EnrichedRow[] {
  if (clauses.length === 0) return rows;
  return rows.filter((row) => {
    const pct = percentagesForVersion(row, version);
    return clauses.every((c) => {
      const entry = Object.entries(pct).find(([name]) => name === c.archetype);
      return entry != null && entry[1] >= c.min;
    });
  });
}
