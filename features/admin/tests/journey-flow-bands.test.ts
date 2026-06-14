import { describe, it, expect } from "vitest";
import {
  buildLinearBand,
  buildFriction,
  buildPricing,
  clampMonotone,
  withSourceColumn,
  type BandStage,
  type BehaviorEvent,
  type PriceShownEvent,
} from "@features/admin/server/journeyFlow";

describe("clampMonotone", () => {
  it("passes already-monotone sequences through unchanged", () => {
    expect(clampMonotone([100, 80, 80, 5])).toEqual({
      clamped: [100, 80, 80, 5],
      wasClamped: false,
    });
  });

  it("clamps a locally-noisy bump and flags it", () => {
    expect(clampMonotone([100, 80, 95, 60])).toEqual({
      clamped: [100, 80, 80, 60],
      wasClamped: true,
    });
  });

  it("handles empty and single-element input", () => {
    expect(clampMonotone([])).toEqual({ clamped: [], wasClamped: false });
    expect(clampMonotone([7])).toEqual({ clamped: [7], wasClamped: false });
  });
});

describe("buildLinearBand", () => {
  const stages: BandStage[] = [
    { id: "a", label: "Stage A", count: 100 },
    { id: "b", label: "Stage B", count: 70, dropLabel: "Left at A" },
    { id: "c", label: "Stage C", count: 70 },
    { id: "d", label: "Stage D", count: 10, dropLabel: "Left at C" },
  ];

  it("builds a conserved spine with drop sinks", () => {
    const band = buildLinearBand(stages);
    // Conservation: every non-terminal node's outflow equals its count.
    for (const node of band.nodes.filter((n) => n.kind === "stage")) {
      const outflow = band.links
        .filter((l) => l.source === node.id)
        .reduce((sum, l) => sum + l.value, 0);
      const isTerminal = !band.links.some((l) => l.source === node.id);
      if (!isTerminal) expect(outflow).toBe(node.count);
    }
    // a→b 70 + a→drop 30
    expect(band.links).toContainEqual({ source: "a", target: "b", value: 70, kind: "flow" });
    expect(band.links).toContainEqual({ source: "a", target: "b:drop", value: 30, kind: "drop" });
    // b→c full flow, no drop node for the zero difference
    expect(band.links).toContainEqual({ source: "b", target: "c", value: 70, kind: "flow" });
    expect(band.nodes.find((n) => n.id === "c:drop")).toBeUndefined();
    // custom drop label
    expect(band.nodes.find((n) => n.id === "d:drop")?.label).toBe("Left at C");
    expect(band.wasClamped).toBe(false);
  });

  it("never links to a skipped zero-count node", () => {
    const band = buildLinearBand([
      { id: "a", label: "A", count: 10 },
      { id: "b", label: "B", count: 0 },
      { id: "c", label: "C", count: 0 },
    ]);
    const nodeIds = new Set(band.nodes.map((n) => n.id));
    for (const link of band.links) {
      expect(nodeIds.has(link.source)).toBe(true);
      expect(nodeIds.has(link.target)).toBe(true);
    }
    // The full 10 drop into the first sink; b/c are omitted entirely.
    expect(nodeIds.has("b")).toBe(false);
    expect(band.links).toContainEqual({ source: "a", target: "b:drop", value: 10, kind: "drop" });
  });

  it("never dangles when a mid-band zero is followed by a non-zero raw count", () => {
    // Raw [10, 0, 5] clamps to [10, 0, 0]: the zero predecessor forces every
    // later stage to zero, so no link can reference the skipped "b"/"c" nodes.
    const band = buildLinearBand([
      { id: "a", label: "A", count: 10 },
      { id: "b", label: "B", count: 0 },
      { id: "c", label: "C", count: 5 },
    ]);
    const nodeIds = new Set(band.nodes.map((n) => n.id));
    for (const link of band.links) {
      expect(nodeIds.has(link.source)).toBe(true);
      expect(nodeIds.has(link.target)).toBe(true);
    }
    expect(nodeIds.has("c")).toBe(false);
    expect(band.wasClamped).toBe(true);
  });

  it("withSourceColumn no-ops when the entry stage was omitted", () => {
    const empty = buildLinearBand([
      { id: "visitors", label: "Visitors", count: 0 },
      { id: "mount", label: "Opened", count: 0 },
    ]);
    const result = withSourceColumn(empty, [{ bucket: "Direct", count: 5 }], "visitors");
    expect(result.nodes).toHaveLength(0);
    expect(result.links).toHaveLength(0);
  });

  it("clamps non-monotone counts so no negative drops are emitted", () => {
    const band = buildLinearBand([
      { id: "a", label: "A", count: 50 },
      { id: "b", label: "B", count: 80 }, // noisy: higher than predecessor
      { id: "c", label: "C", count: 20 },
    ]);
    expect(band.wasClamped).toBe(true);
    expect(band.nodes.find((n) => n.id === "b")?.count).toBe(50);
    for (const link of band.links) expect(link.value).toBeGreaterThan(0);
  });
});

describe("buildFriction", () => {
  const chapters = [
    { cId: 15, label: "Ch 1" }, // lead chapter (q_id 00000/00001 belong here)
    { cId: 1, label: "Ch 2" },
    { cId: 2, label: "Ch 3" },
  ];
  const reached = new Map([
    [15, 120],
    [1, 100],
    [2, 70],
  ]);
  // Real q_id → cId map: note 00000/00001 → cId 15 (NOT cId 0 from the prefix).
  const qIdToCId = new Map<string, number>([
    ["00000", 15],
    ["01002", 1],
    ["01005", 1],
    ["02001", 2],
    ["02002", 2],
  ]);
  const events: BehaviorEvent[] = [
    { session_id: "s0", q_id: "00000", direction: "abandon", time_spent_ms: 3000 }, // would be lost by slice(0,2)
    { session_id: "s1", q_id: "01002", direction: "abandon", time_spent_ms: 4000 },
    { session_id: "s2", q_id: "01005", direction: "abandon", time_spent_ms: 2000 },
    { session_id: "s1", q_id: "01002", direction: "abandon", time_spent_ms: 1000 }, // same session
    { session_id: "s3", q_id: "02001", direction: "back", time_spent_ms: 6000 },
    { session_id: "s4", q_id: "02002", direction: "forward", time_spent_ms: 8000 },
  ];

  it("maps lead questions to their real chapter (not cId 0)", () => {
    const rows = buildFriction(events, chapters, reached, qIdToCId);
    const lead = rows.find((r) => r.cId === 15)!;
    expect(lead.abandons).toBe(1); // the 00000 abandon is NOT dropped
    expect(lead.medianMs).toBe(3000);
  });

  it("aggregates abandons (distinct sessions), backs, and per-session median time", () => {
    const rows = buildFriction(events, chapters, reached, qIdToCId);
    const ch1 = rows.find((r) => r.cId === 1)!;
    const ch2 = rows.find((r) => r.cId === 2)!;
    expect(ch1.reached).toBe(100);
    expect(ch1.abandons).toBe(2); // s1 (deduped) + s2
    expect(ch1.backs).toBe(0);
    // Per-session totals: s1 = 4000+1000 = 5000, s2 = 2000 → median([5000,2000]) = 3500.
    expect(ch1.medianMs).toBe(3500);
    expect(ch2.backs).toBe(1);
    expect(ch2.medianMs).toBe(7000); // per-session s3=6000, s4=8000
  });
});

describe("buildPricing", () => {
  const events: PriceShownEvent[] = [
    { survey_submission_id: 1, price: 29.99, discountStep: 0 },
    { survey_submission_id: 2, price: 29.99, discountStep: 0 },
    { survey_submission_id: 3, price: 14.99, discountStep: 2 },
    { survey_submission_id: 1, price: 29.99, discountStep: 0 }, // same sub+price dedup
    { survey_submission_id: null, price: 9.99, discountStep: 4 },
  ];

  it("buckets prices/steps by distinct submission and marks converted", () => {
    const out = buildPricing(events, new Set([1]));
    const p30 = out.points.find((p) => p.price === 30)!; // rounded
    expect(p30.shown).toBe(2); // subs 1 & 2 (1 counted once)
    expect(p30.converted).toBe(1); // only sub 1 converted
    const p15 = out.points.find((p) => p.price === 15)!;
    expect(p15.shown).toBe(1);
    expect(p15.converted).toBe(0);
    // null submission_id ignored
    expect(out.points.find((p) => p.price === 10)).toBeUndefined();
    expect(out.points.map((p) => p.price)).toEqual([15, 30]); // sorted asc
  });
});

describe("withSourceColumn", () => {
  it("prepends source nodes + links feeding the first stage", () => {
    const band = buildLinearBand([
      { id: "visitors", label: "Visitors", count: 30 },
      { id: "mount", label: "Opened", count: 12 },
    ]);
    const withSources = withSourceColumn(
      band,
      [
        { bucket: "Direct", count: 20 },
        { bucket: "Google Ads", count: 10 },
        { bucket: "Email", count: 0 },
      ],
      "visitors"
    );
    expect(withSources.nodes.filter((n) => n.kind === "source")).toHaveLength(2);
    expect(withSources.links).toContainEqual({
      source: "src:Direct",
      target: "visitors",
      value: 20,
      kind: "source",
    });
    // Source inflow equals the first stage count.
    const inflow = withSources.links
      .filter((l) => l.target === "visitors")
      .reduce((sum, l) => sum + l.value, 0);
    expect(inflow).toBe(30);
  });
});
