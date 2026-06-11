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
