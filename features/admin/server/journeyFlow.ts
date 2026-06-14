/**
 * Pure helpers for the admin Funnel Flow "journey atlas" — turn ordered stage
 * counts into conserved Sankey bands (nodes + links with drop sinks). Kept
 * free of fetching/route concerns so the band math is unit-testable.
 */

export interface FlowNode {
  id: string;
  label: string;
  count: number;
  kind: string; // source | stage | outcome | drop
}

export interface FlowLink {
  source: string;
  target: string;
  value: number;
  kind: string; // source | flow | drop | outcome
}

export interface Band {
  nodes: FlowNode[];
  links: FlowLink[];
}

export interface BandStage {
  id: string;
  label: string;
  count: number;
  /** Label for the drop sink between the PREVIOUS stage and this one. */
  dropLabel?: string;
  kind?: string;
}

/**
 * Clamp a stage-count sequence to be monotonically non-increasing. Aggregate
 * bands (e.g. visitor-keyed intro slides vs session-keyed survey starts) can be
 * locally noisy — a later stage may count a hair higher than its predecessor
 * because the keys differ or events arrive out of order. A Sankey can't render
 * negative drop flows, so we clamp each stage to its predecessor and report
 * whether anything was clamped (surfaced as a caveat, never hidden).
 */
export function clampMonotone(counts: number[]): { clamped: number[]; wasClamped: boolean } {
  let wasClamped = false;
  const clamped: number[] = [];
  for (let i = 0; i < counts.length; i++) {
    const raw = counts[i] ?? 0;
    const prev = i === 0 ? Infinity : (clamped[i - 1] ?? 0);
    if (raw > prev) {
      wasClamped = true;
      clamped.push(prev);
    } else {
      clamped.push(raw);
    }
  }
  return { clamped, wasClamped };
}

/**
 * Build a conserved linear Sankey band from ordered stages: a spine link from
 * each stage to the next plus a drop sink for the difference. Counts are
 * monotone-clamped FIRST (see clampMonotone), which is what makes dangling
 * links impossible: once a clamped count hits 0, every later stage is 0 too,
 * so a link can never reference a skipped (zero-count) node. Zero-count
 * nodes/links are omitted.
 */
export function buildLinearBand(stages: BandStage[]): Band & { wasClamped: boolean } {
  const { clamped, wasClamped } = clampMonotone(stages.map((s) => s.count));

  const nodes: FlowNode[] = [];
  const links: FlowLink[] = [];
  const addNode = (id: string, label: string, count: number, kind = "stage") => {
    if (count > 0) nodes.push({ id, label, count, kind });
  };
  const addLink = (source: string, target: string, value: number, kind = "flow") => {
    if (value > 0) links.push({ source, target, value, kind });
  };

  stages.forEach((stage, i) => {
    const count = clamped[i] ?? 0;
    addNode(stage.id, stage.label, count, stage.kind ?? "stage");
    if (i === 0) return;
    const prev = stages[i - 1]!;
    const prevCount = clamped[i - 1] ?? 0;
    addLink(prev.id, stage.id, count);
    const dropped = prevCount - count;
    if (dropped > 0) {
      const dropId = `${stage.id}:drop`;
      addNode(dropId, stage.dropLabel ?? `Dropped before ${stage.label}`, dropped, "drop");
      addLink(prev.id, dropId, dropped, "drop");
    }
  });

  return { nodes, links, wasClamped };
}

/**
 * Prepend per-source entry nodes feeding the first stage of a band. The first
 * stage's count must equal the sum of the source counts (caller guarantees it —
 * typically by deriving both from the same rows).
 */
export function withSourceColumn(
  band: Band,
  sources: Array<{ bucket: string; count: number }>,
  firstStageId: string
): Band {
  // Defensive: if the entry stage was omitted (zero count), adding source links
  // to it would dangle — return the band untouched instead.
  if (!band.nodes.some((n) => n.id === firstStageId)) return band;
  const nodes: FlowNode[] = [
    ...sources
      .filter((s) => s.count > 0)
      .map((s) => ({ id: `src:${s.bucket}`, label: s.bucket, count: s.count, kind: "source" })),
    ...band.nodes,
  ];
  const links: FlowLink[] = [
    ...sources
      .filter((s) => s.count > 0)
      .map((s) => ({
        source: `src:${s.bucket}`,
        target: firstStageId,
        value: s.count,
        kind: "source",
      })),
    ...band.links,
  ];
  return { nodes, links };
}

/* ------------------------------------------------------------------ */
/*  Survey friction (per-chapter abandons / backs / time)             */
/* ------------------------------------------------------------------ */

export interface FrictionRow {
  cId: number;
  label: string;
  reached: number;
  abandons: number;
  backs: number;
  medianMs: number;
}

export interface BehaviorEvent {
  session_id: string;
  q_id: string;
  direction: string; // forward | back | abandon | complete
  time_spent_ms: number | null;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round(((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2)
    : (sorted[mid] ?? 0);
}

/**
 * Aggregate per-chapter friction from survey_behavior_event rows. The chapter
 * for each event is resolved via `qIdToCId` (built from the survey data) —
 * NOT `q_id.slice(0,2)`, because the lead questions "00000"/"00001" belong to a
 * chapter whose code isn't their prefix. `reachedByCId` supplies the "reached"
 * count from the survey band. `events` must already be filtered to the segment's
 * sessions. Median time is per-session total time-in-chapter (a session that
 * revisits a chapter counts once), so repeat-abandoners don't skew it.
 */
export function buildFriction(
  events: BehaviorEvent[],
  chapters: Array<{ cId: number; label: string }>,
  reachedByCId: Map<number, number>,
  qIdToCId: Map<string, number>
): FrictionRow[] {
  const abandons = new Map<number, Set<string>>();
  const backs = new Map<number, Set<string>>();
  // cId -> (session -> summed time in that chapter)
  const timeBySession = new Map<number, Map<string, number>>();
  for (const e of events) {
    const cId = qIdToCId.get(e.q_id) ?? parseInt(e.q_id.slice(0, 2), 10);
    if (!Number.isFinite(cId)) continue;
    if (e.direction === "abandon") {
      (abandons.get(cId) ?? abandons.set(cId, new Set()).get(cId)!).add(e.session_id);
    } else if (e.direction === "back") {
      (backs.get(cId) ?? backs.set(cId, new Set()).get(cId)!).add(e.session_id);
    }
    if (typeof e.time_spent_ms === "number" && e.time_spent_ms > 0) {
      const sessions = timeBySession.get(cId) ?? timeBySession.set(cId, new Map()).get(cId)!;
      sessions.set(e.session_id, (sessions.get(e.session_id) ?? 0) + e.time_spent_ms);
    }
  }
  return chapters.map((ch) => ({
    cId: ch.cId,
    label: ch.label,
    reached: reachedByCId.get(ch.cId) ?? 0,
    abandons: abandons.get(ch.cId)?.size ?? 0,
    backs: backs.get(ch.cId)?.size ?? 0,
    medianMs: median([...(timeBySession.get(ch.cId)?.values() ?? [])]),
  }));
}

/* ------------------------------------------------------------------ */
/*  Pricing exposure (price points + discount steps)                  */
/* ------------------------------------------------------------------ */

export interface PriceShownEvent {
  survey_submission_id: number | null;
  price: number | null;
  discountStep: number | null;
}

export interface PricingSummary {
  points: Array<{ price: number; shown: number; converted: number }>;
  steps: Array<{ step: number; shown: number; converted: number }>;
}

/**
 * Aggregate price_shown events into price-point and discount-step distributions.
 * A submission "converted" if it is in `convertedSubmissionIds` (reached
 * begin_checkout / purchased). Each submission counts once per distinct price /
 * step it was shown.
 */
export function buildPricing(
  events: PriceShownEvent[],
  convertedSubmissionIds: Set<number>
): PricingSummary {
  const byPrice = new Map<number, { shown: Set<number>; converted: Set<number> }>();
  const byStep = new Map<number, { shown: Set<number>; converted: Set<number> }>();
  const bump = (
    map: Map<number, { shown: Set<number>; converted: Set<number> }>,
    key: number,
    sub: number
  ) => {
    const entry =
      map.get(key) ?? map.set(key, { shown: new Set(), converted: new Set() }).get(key)!;
    entry.shown.add(sub);
    if (convertedSubmissionIds.has(sub)) entry.converted.add(sub);
  };
  for (const e of events) {
    if (e.survey_submission_id == null) continue;
    if (typeof e.price === "number" && Number.isFinite(e.price)) {
      bump(byPrice, Math.round(e.price), e.survey_submission_id);
    }
    if (typeof e.discountStep === "number" && Number.isFinite(e.discountStep)) {
      bump(byStep, e.discountStep, e.survey_submission_id);
    }
  }
  const toRows = (map: Map<number, { shown: Set<number>; converted: Set<number> }>) =>
    [...map.entries()]
      .map(([key, v]) => ({ key, shown: v.shown.size, converted: v.converted.size }))
      .sort((a, b) => a.key - b.key);
  return {
    points: toRows(byPrice).map((r) => ({ price: r.key, shown: r.shown, converted: r.converted })),
    steps: toRows(byStep).map((r) => ({ step: r.key, shown: r.shown, converted: r.converted })),
  };
}
