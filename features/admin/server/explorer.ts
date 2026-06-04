/**
 * Pure aggregation core for the admin Data Explorer (`/admin/explorer`).
 *
 * The route (`app/api/admin/explorer/route.ts`) fetches + enriches submission
 * rows into `EnrichedRow[]`; everything here is pure (no DB / env / Next imports)
 * so the filtering, breakdown, cross-tab, real-revenue and label-normalization
 * logic is unit-testable in isolation.
 *
 * Demographic data lives in two places (verified against prod): gender / country
 * / orientation / relationship are on `user_profile`; AGE is only in the survey
 * answer Q15003 (user_profile.birthday is 100% null). The route resolves both
 * and hands clean values to the row.
 */

export type DimensionKey =
  | "archetype"
  | "age"
  | "gender"
  | "country"
  | "orientation"
  | "relationship"
  | "plan"
  | "paidStatus"
  | "trafficSource";

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
};

export const DIMENSION_KEYS = Object.keys(DIMENSION_LABELS) as DimensionKey[];

export function isDimensionKey(value: unknown): value is DimensionKey {
  return typeof value === "string" && (DIMENSION_KEYS as string[]).includes(value);
}

/** Bucket used when a dimension value is missing. */
export const UNKNOWN_LABEL = "Unknown";

/** Stable display order for age buckets (matches survey Q15003 options). */
export const AGE_ORDER = ["18–24", "25–34", "35–44", "45–54", "55–64", "65+"];

export interface EnrichedRow {
  submissionId: number;
  email: string | null;
  isTest: boolean;
  archetypeV4: string | null;
  archetypeV5: string | null;
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
// Dimension accessor
// ─────────────────────────────────────────────────────────────────────────────

export function dimensionValue(
  row: EnrichedRow,
  dim: DimensionKey,
  opts: { archetypeVersion: ArchetypeVersion; includeTest: boolean }
): string {
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
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Filtering
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Apply the explorer filters to enriched rows. Order: drop test rows (unless
 * includeTest) → paidStatus → every active per-dimension allow-list.
 */
export function applyFilters(rows: EnrichedRow[], filters: ExplorerFilters): EnrichedRow[] {
  const opts = {
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
}

function sortBreakdown(rows: BreakdownRow[], dim: DimensionKey): BreakdownRow[] {
  if (dim === "age") {
    return [...rows].sort((a, b) => orderIndex(a.label) - orderIndex(b.label));
  }
  return [...rows].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

function orderIndex(label: string): number {
  const i = AGE_ORDER.indexOf(label);
  return i === -1 ? AGE_ORDER.length + (label === UNKNOWN_LABEL ? 1 : 0) : i;
}

/**
 * Group rows by one dimension. `topN` keeps the N largest groups and folds the
 * rest into "Other" (skipped for age, which is small + ordered). Always reports
 * count, paid count, paid %, and revenue per group.
 */
export function buildBreakdown(
  rows: EnrichedRow[],
  dim: DimensionKey,
  opts: { archetypeVersion: ArchetypeVersion; includeTest: boolean; topN?: number }
): BreakdownRow[] {
  const groups = new Map<string, { count: number; paid: number; revenue: number }>();
  for (const row of rows) {
    const key = dimensionValue(row, dim, opts);
    const g = groups.get(key) ?? { count: 0, paid: 0, revenue: 0 };
    g.count += 1;
    if (isPaidRow(row, opts.includeTest)) g.paid += 1;
    g.revenue += row.paidAmount;
    groups.set(key, g);
  }

  let out: BreakdownRow[] = [...groups.entries()].map(([label, g]) => ({
    label,
    count: g.count,
    paid: g.paid,
    paidPct: g.count > 0 ? Math.round((g.paid / g.count) * 1000) / 10 : null,
    revenue: Math.round(g.revenue * 100) / 100,
  }));

  out = sortBreakdown(out, dim);

  const topN = opts.topN ?? 12;
  if (dim !== "age" && dim !== "paidStatus" && out.length > topN) {
    const top = out.slice(0, topN);
    const rest = out.slice(topN);
    const other = rest.reduce(
      (acc, r) => {
        acc.count += r.count;
        acc.paid += r.paid;
        acc.revenue += r.revenue;
        return acc;
      },
      { count: 0, paid: 0, revenue: 0 }
    );
    top.push({
      label: "Other",
      count: other.count,
      paid: other.paid,
      paidPct: other.count > 0 ? Math.round((other.paid / other.count) * 1000) / 10 : null,
      revenue: Math.round(other.revenue * 100) / 100,
    });
    return top;
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Cross-tab (2-D)
// ─────────────────────────────────────────────────────────────────────────────

export interface CrossTab {
  rowDim: DimensionKey;
  colDim: DimensionKey;
  rowLabels: string[];
  colLabels: string[];
  /** cells[rowLabel][colLabel] = count. Sparse-safe via 0 defaults in `cell`. */
  cells: Record<string, Record<string, number>>;
  rowTotals: Record<string, number>;
  colTotals: Record<string, number>;
  grandTotal: number;
}

/** Top-N labels of a dimension by frequency (age uses fixed order, no Other). */
function topLabels(rows: EnrichedRow[], dim: DimensionKey, opts: ExplorerFilters, topN: number) {
  const counts = new Map<string, number>();
  const o = { archetypeVersion: opts.archetypeVersion, includeTest: opts.includeTest };
  for (const row of rows) {
    const key = dimensionValue(row, dim, o);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  let labels = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([label]) => label);
  if (dim === "age") {
    return labels.sort((a, b) => orderIndex(a) - orderIndex(b));
  }
  if (labels.length > topN) {
    labels = labels.slice(0, topN);
    labels.push("Other");
  }
  return labels;
}

export function buildCrossTab(
  rows: EnrichedRow[],
  rowDim: DimensionKey,
  colDim: DimensionKey,
  filters: ExplorerFilters,
  topN = 8
): CrossTab {
  const o = { archetypeVersion: filters.archetypeVersion, includeTest: filters.includeTest };
  const rowLabels = topLabels(rows, rowDim, filters, topN);
  const colLabels = topLabels(rows, colDim, filters, topN);
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
    const rRaw = dimensionValue(row, rowDim, o);
    const cRaw = dimensionValue(row, colDim, o);
    // Each label set is derived from THESE same rows, so a value is absent from a
    // set only when it was folded into "Other" (which is then present). The null
    // branch is therefore unreachable in practice (grandTotal === rows.length);
    // it stays as a defensive guard. See the reconciliation test.
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

// ─────────────────────────────────────────────────────────────────────────────
// Facets (filter options + counts)
// ─────────────────────────────────────────────────────────────────────────────

export interface FacetValue {
  label: string;
  count: number;
}
export type Facets = Partial<Record<DimensionKey, FacetValue[]>>;

/**
 * Distinct values + counts per dimension over the supplied rows (the route passes
 * the test-filtered, otherwise-unfiltered candidate set so options stay stable as
 * the lead toggles filters). Age keeps its fixed order; others sort by count.
 */
export function buildFacets(
  rows: EnrichedRow[],
  opts: { archetypeVersion: ArchetypeVersion; includeTest: boolean }
): Facets {
  const facets: Facets = {};
  for (const dim of DIMENSION_KEYS) {
    const counts = new Map<string, number>();
    for (const row of rows) {
      const key = dimensionValue(row, dim, opts);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    let values: FacetValue[] = [...counts.entries()].map(([label, count]) => ({ label, count }));
    values =
      dim === "age"
        ? values.sort((a, b) => orderIndex(a.label) - orderIndex(b.label))
        : values.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
    facets[dim] = values;
  }
  return facets;
}
