import { describe, it, expect } from "vitest";
import {
  buildLinearBand,
  clampMonotone,
  withSourceColumn,
  type BandStage,
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
