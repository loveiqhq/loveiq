import { describe, expect, it } from "vitest";
import {
  applyFilters,
  buildBreakdown,
  buildCrossTab,
  buildFacets,
  canonicalizeRelationship,
  computeStats,
  isPaidRow,
  normalizeLabel,
  type EnrichedRow,
  type ExplorerFilters,
} from "@features/admin/server/explorer";

function row(p: Partial<EnrichedRow> = {}): EnrichedRow {
  return {
    submissionId: 1,
    email: "a@example.com",
    isTest: false,
    archetypeV4: "Spark Seeker",
    archetypeV5: "Spark Seeker",
    ageGroup: "25–34",
    gender: "Woman",
    country: "United States",
    orientation: "Heterosexual",
    relationship: "Single",
    plan: null,
    paidAmount: 0,
    hasSucceededPayment: false,
    trafficSource: "Direct",
    durationMs: 300_000,
    createdAt: "2026-06-01T00:00:00Z",
    ...p,
  };
}

const baseFilters: ExplorerFilters = {
  includeTest: false,
  archetypeVersion: "v5",
  paidStatus: "all",
  selections: {},
};

describe("normalizeLabel", () => {
  it("collapses smart apostrophes so quote variants merge", () => {
    expect(normalizeLabel("I’d rather not label this")).toBe("I'd rather not label this");
    expect(normalizeLabel("I'd rather not label this")).toBe("I'd rather not label this");
  });
  it("collapses whitespace and trims, returns null for blank", () => {
    expect(normalizeLabel("  Woman   ")).toBe("Woman");
    expect(normalizeLabel("   ")).toBeNull();
    expect(normalizeLabel(null)).toBeNull();
  });
});

describe("canonicalizeRelationship", () => {
  it("collapses the two labeling eras into one bucket", () => {
    expect(canonicalizeRelationship("In one exclusive relationship (only each other)")).toBe(
      "Monogamous"
    );
    expect(canonicalizeRelationship("Monogamous")).toBe("Monogamous");
    expect(canonicalizeRelationship("Non-exclusive, with agreed limits — known as 'open'")).toBe(
      "Open"
    );
    expect(canonicalizeRelationship("Open")).toBe("Open");
  });
  it("passes through unknown values (normalized)", () => {
    expect(canonicalizeRelationship("Something new")).toBe("Something new");
    expect(canonicalizeRelationship(null)).toBeNull();
  });
});

describe("isPaidRow", () => {
  it("default (real revenue): only amount > 0 counts", () => {
    expect(isPaidRow(row({ paidAmount: 29 }), false)).toBe(true);
    expect(isPaidRow(row({ paidAmount: 0, hasSucceededPayment: true }), false)).toBe(false);
  });
  it("includeTest: any succeeded payment counts (coupon/$0)", () => {
    expect(isPaidRow(row({ paidAmount: 0, hasSucceededPayment: true }), true)).toBe(true);
    expect(isPaidRow(row({ paidAmount: 0, hasSucceededPayment: false }), true)).toBe(false);
  });
});

describe("applyFilters", () => {
  const rows = [
    row({ submissionId: 1, country: "United States", paidAmount: 29 }),
    row({ submissionId: 2, country: "United Kingdom", paidAmount: 0 }),
    row({ submissionId: 3, country: "United States", isTest: true }),
  ];

  it("drops test rows unless includeTest", () => {
    expect(applyFilters(rows, baseFilters).map((r) => r.submissionId)).toEqual([1, 2]);
    expect(
      applyFilters(rows, { ...baseFilters, includeTest: true }).map((r) => r.submissionId)
    ).toEqual([1, 2, 3]);
  });

  it("filters by paid status (real revenue)", () => {
    expect(
      applyFilters(rows, { ...baseFilters, paidStatus: "paid" }).map((r) => r.submissionId)
    ).toEqual([1]);
    expect(
      applyFilters(rows, { ...baseFilters, paidStatus: "free" }).map((r) => r.submissionId)
    ).toEqual([2]);
  });

  it("filters by a dimension allow-list", () => {
    expect(
      applyFilters(rows, { ...baseFilters, selections: { country: ["United States"] } }).map(
        (r) => r.submissionId
      )
    ).toEqual([1]); // row 3 is test (dropped first)
  });

  it("combines filters (paid AND country) — the lead's example", () => {
    const out = applyFilters(rows, {
      ...baseFilters,
      paidStatus: "paid",
      selections: { country: ["United States"] },
    });
    expect(out.map((r) => r.submissionId)).toEqual([1]);
  });
});

describe("computeStats", () => {
  it("computes totals, conversion, revenue, avg duration", () => {
    const rows = [
      row({ paidAmount: 30, durationMs: 600_000 }),
      row({ paidAmount: 0, durationMs: 120_000 }),
      row({ paidAmount: 10, durationMs: 0 }), // 0 duration excluded from avg
    ];
    const stats = computeStats(rows, false);
    expect(stats.total).toBe(3);
    expect(stats.paid).toBe(2);
    expect(stats.free).toBe(1);
    expect(stats.revenue).toBe(40);
    expect(stats.conversionPct).toBeCloseTo(66.7, 1);
    expect(stats.avgDurationMin).toBe(6); // (10+2)/2 min
  });
});

describe("buildBreakdown", () => {
  it("groups with paid %, revenue, and folds Other beyond topN", () => {
    const rows = [
      row({ country: "United States", paidAmount: 29 }),
      row({ country: "United States", paidAmount: 0 }),
      row({ country: "United Kingdom", paidAmount: 0 }),
      row({ country: "Canada", paidAmount: 0 }),
      row({ country: "Germany", paidAmount: 0 }),
    ];
    const out = buildBreakdown(rows, "country", {
      archetypeVersion: "v5",
      includeTest: false,
      topN: 2,
    });
    expect(out[0]).toMatchObject({ label: "United States", count: 2, paid: 1, paidPct: 50 });
    const other = out.find((r) => r.label === "Other");
    expect(other?.count).toBe(2); // Canada + Germany (UK is rank 2 → kept)
  });

  it("keeps age in fixed order and never folds it into Other", () => {
    const rows = [row({ ageGroup: "65+" }), row({ ageGroup: "18–24" }), row({ ageGroup: "25–34" })];
    const out = buildBreakdown(rows, "age", {
      archetypeVersion: "v5",
      includeTest: false,
      topN: 1,
    });
    expect(out.map((r) => r.label)).toEqual(["18–24", "25–34", "65+"]);
  });
});

describe("buildCrossTab", () => {
  it("builds a matrix with row/col/grand totals", () => {
    const rows = [
      row({ gender: "Woman", ageGroup: "25–34" }),
      row({ gender: "Woman", ageGroup: "25–34" }),
      row({ gender: "Man", ageGroup: "18–24" }),
    ];
    const ct = buildCrossTab(rows, "gender", "age", baseFilters, 8);
    expect(ct.grandTotal).toBe(3);
    expect(ct.cells["Woman"]?.["25–34"]).toBe(2);
    expect(ct.cells["Man"]?.["18–24"]).toBe(1);
    expect(ct.rowTotals["Woman"]).toBe(2);
    expect(ct.colTotals["18–24"]).toBe(1);
  });

  it("reconciles: grandTotal === row count even when one axis overflows top-N and the other is age (no Other bucket)", () => {
    // 20 distinct countries (→ top-8 + Other) crossed with age (never folds to
    // Other). No row may be silently dropped — grand/row/col totals must all == 20.
    const rows: EnrichedRow[] = [];
    for (let i = 0; i < 20; i++) {
      rows.push(
        row({ submissionId: i, country: `Country ${i}`, ageGroup: i % 2 ? "25–34" : "18–24" })
      );
    }
    const ct = buildCrossTab(rows, "country", "age", baseFilters, 8);
    expect(ct.grandTotal).toBe(20);
    expect(Object.values(ct.rowTotals).reduce((a, b) => a + b, 0)).toBe(20);
    expect(Object.values(ct.colTotals).reduce((a, b) => a + b, 0)).toBe(20);
  });
});

describe("buildFacets", () => {
  it("returns distinct values + counts per dimension", () => {
    const rows = [row({ gender: "Woman" }), row({ gender: "Woman" }), row({ gender: "Man" })];
    const facets = buildFacets(rows, { archetypeVersion: "v5", includeTest: false });
    expect(facets.gender).toEqual([
      { label: "Woman", count: 2 },
      { label: "Man", count: 1 },
    ]);
  });

  it("buckets missing values as Unknown", () => {
    const facets = buildFacets([row({ country: null })], {
      archetypeVersion: "v5",
      includeTest: false,
    });
    expect(facets.country).toEqual([{ label: "Unknown", count: 1 }]);
  });
});
