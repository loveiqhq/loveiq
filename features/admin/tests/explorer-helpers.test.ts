import { describe, expect, it } from "vitest";
import {
  DIMENSION_ORDER,
  parseLandingVariant,
  applyFilters,
  archetypeMatchFilter,
  bucketDate,
  buildArchetypeDistribution,
  buildBreakdown,
  buildBreakdownBy,
  buildCrossTab,
  buildMultiLabelBreakdown,
  buildFacets,
  buildTrend,
  canonicalizeRelationship,
  computeStats,
  dimensionValue,
  isPaidRow,
  normalizeLabel,
  sessionBucketLabel,
  specForAnswers,
  specForScale,
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
    percentagesV4: {},
    percentagesV5: {},
    ageGroup: "25–34",
    gender: "Woman",
    country: "United States",
    orientation: "Heterosexual",
    relationship: "Single",
    plan: null,
    paidAmount: 0,
    hasSucceededPayment: false,
    trafficSource: "Direct",
    utmMedium: "(none)",
    utmCampaign: "(none)",
    landingVariant: "control",
    device: "desktop",
    paywallArm: null,
    experimentGroup: "control",
    countryTier: "tier1",
    priceBucket: "mid",
    behavioralBucket: null,
    reportViewed: false,
    sessionCount: 0,
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

  it("filters by landing variant (white vs dark journey)", () => {
    const variantRows = [
      row({ submissionId: 1, landingVariant: "white" }),
      row({ submissionId: 2, landingVariant: "control" }),
      row({ submissionId: 3, landingVariant: "white" }),
    ];
    expect(
      applyFilters(variantRows, { ...baseFilters, selections: { landingVariant: ["white"] } }).map(
        (r) => r.submissionId
      )
    ).toEqual([1, 3]);
    expect(
      applyFilters(variantRows, {
        ...baseFilters,
        selections: { landingVariant: ["control"] },
      }).map((r) => r.submissionId)
    ).toEqual([2]);
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

describe("new dimensions", () => {
  const opts = { archetypeVersion: "v5" as const, includeTest: false };

  it("exposes pricing/experiment/device/acquisition/engagement via the accessor", () => {
    const r = row({
      device: "mobile",
      paywallArm: "armB",
      experimentGroup: "variant",
      countryTier: "tier2",
      priceBucket: "high",
      behavioralBucket: "hot",
      utmMedium: "cpc",
      utmCampaign: "spring",
      reportViewed: true,
      sessionCount: 2,
    });
    expect(dimensionValue(r, "device", opts)).toBe("mobile");
    expect(dimensionValue(r, "paywallArm", opts)).toBe("armB");
    expect(dimensionValue(r, "experimentGroup", opts)).toBe("variant");
    expect(dimensionValue(r, "utmMedium", opts)).toBe("cpc");
    expect(dimensionValue(r, "utmCampaign", opts)).toBe("spring");
    expect(dimensionValue(r, "reportViewed", opts)).toBe("Viewed");
    expect(dimensionValue(r, "sessionBucket", opts)).toBe("2");
  });

  it("missing pricing/engagement reads as Unknown / Not viewed / 0", () => {
    const r = row({ paywallArm: null, reportViewed: false, sessionCount: 0 });
    expect(dimensionValue(r, "paywallArm", opts)).toBe("Unknown");
    expect(dimensionValue(r, "reportViewed", opts)).toBe("Not viewed");
    expect(dimensionValue(r, "sessionBucket", opts)).toBe("0");
  });

  it("sessionBucketLabel buckets 0/1/2/3+", () => {
    expect(sessionBucketLabel(0)).toBe("0");
    expect(sessionBucketLabel(1)).toBe("1");
    expect(sessionBucketLabel(2)).toBe("2");
    expect(sessionBucketLabel(5)).toBe("3+");
  });

  it("sessionBucket breakdown keeps fixed order and never folds to Other", () => {
    const rows = [
      row({ sessionCount: 5 }),
      row({ sessionCount: 0 }),
      row({ sessionCount: 1 }),
      row({ sessionCount: 2 }),
    ];
    const out = buildBreakdown(rows, "sessionBucket", { ...opts, topN: 1 });
    expect(out.map((r) => r.label)).toEqual(["0", "1", "2", "3+"]);
  });
});

describe("bucketDate + buildTrend", () => {
  it("buckets by day or ISO-week Monday", () => {
    expect(bucketDate("2026-06-04T10:00:00Z", "day")).toBe("2026-06-04");
    // 2026-06-04 is a Thursday → week bucket is Monday 2026-06-01.
    expect(bucketDate("2026-06-04T10:00:00Z", "week")).toBe("2026-06-01");
  });

  it("builds an ordered daily series with paid counts", () => {
    const rows = [
      row({ createdAt: "2026-06-02T00:00:00Z", paidAmount: 10 }),
      row({ createdAt: "2026-06-01T00:00:00Z" }),
      row({ createdAt: "2026-06-01T12:00:00Z", paidAmount: 5 }),
    ];
    const trend = buildTrend(rows, "day", false);
    expect(trend.map((t) => t.bucket)).toEqual(["2026-06-01", "2026-06-02"]);
    expect(trend[0]).toEqual({ bucket: "2026-06-01", count: 2, paid: 1 });
    expect(trend[1]).toEqual({ bucket: "2026-06-02", count: 1, paid: 1 });
  });
});

describe("survey-answer grouping (buildBreakdownBy + specForAnswers)", () => {
  it("groups rows by a per-submission answer map", () => {
    const rows = [row({ submissionId: 1 }), row({ submissionId: 2 }), row({ submissionId: 3 })];
    const answerMap = new Map<number, string>([
      [1, "Daily"],
      [2, "Daily"],
      [3, "Weekly"],
    ]);
    const out = buildBreakdownBy(rows, specForAnswers(answerMap), { includeTest: false });
    expect(out.find((r) => r.label === "Daily")?.count).toBe(2);
    expect(out.find((r) => r.label === "Weekly")?.count).toBe(1);
  });

  it("rows with no answer fall into Unknown", () => {
    const rows = [row({ submissionId: 1 }), row({ submissionId: 2 })];
    const out = buildBreakdownBy(rows, specForAnswers(new Map([[1, "Yes"]])), {
      includeTest: false,
    });
    expect(out.find((r) => r.label === "Unknown")?.count).toBe(1);
  });
});

describe("scale (1-7) grouping (specForScale)", () => {
  it("keeps the 1→7 axis in fixed order and never folds into Other", () => {
    const rows = [
      row({ submissionId: 1 }),
      row({ submissionId: 2 }),
      row({ submissionId: 3 }),
      row({ submissionId: 4 }),
    ];
    // Out-of-order map; one unanswered (submission 4).
    const scaleMap = new Map<number, string>([
      [1, "7"],
      [2, "1"],
      [3, "7"],
    ]);
    const out = buildBreakdownBy(rows, specForScale(scaleMap), { includeTest: false, topN: 1 });
    // 1..7 order preserved, no folding to "Other"; unanswered → Unknown sorts last.
    expect(out.map((r) => r.label)).toEqual(["1", "7", "Unknown"]);
    expect(out.find((r) => r.label === "7")?.count).toBe(2);
    expect(out.some((r) => r.label === "Other")).toBe(false);
  });
});

describe("buildMultiLabelBreakdown (multi-select, count each option)", () => {
  const rows = [
    row({ submissionId: 1, paidAmount: 30 }),
    row({ submissionId: 2, paidAmount: 0 }),
    row({ submissionId: 3, paidAmount: 0 }),
  ];

  it("counts a person in EVERY option they picked (counts can exceed people)", () => {
    const labels = new Map<number, string[]>([
      [1, ["Time", "Shame"]],
      [2, ["Time"]],
      [3, ["Shame", "Pain"]],
    ]);
    const out = buildMultiLabelBreakdown(rows, labels, { includeTest: false });
    expect(out.find((r) => r.label === "Time")?.count).toBe(2);
    expect(out.find((r) => r.label === "Shame")?.count).toBe(2);
    expect(out.find((r) => r.label === "Pain")?.count).toBe(1);
    // 5 option-picks across 3 people → sum exceeds the row count.
    expect(out.reduce((a, r) => a + r.count, 0)).toBe(5);
  });

  it("per-option paid/conversion reflects only that option's people", () => {
    const labels = new Map<number, string[]>([
      [1, ["Time"]], // paid
      [2, ["Time"]], // free
      [3, ["Pain"]], // free
    ]);
    const out = buildMultiLabelBreakdown(rows, labels, { includeTest: false });
    const time = out.find((r) => r.label === "Time")!;
    expect(time).toMatchObject({ count: 2, paid: 1, paidPct: 50, revenue: 30 });
    expect(out.find((r) => r.label === "Pain")?.paidPct).toBe(0);
  });

  it("de-dupes a repeated option within one submission", () => {
    const labels = new Map<number, string[]>([[1, ["Time", "Time"]]]);
    const out = buildMultiLabelBreakdown([rows[0]!], labels, { includeTest: false });
    expect(out.find((r) => r.label === "Time")?.count).toBe(1);
  });

  it("no-selection rows fall into Unknown", () => {
    const out = buildMultiLabelBreakdown(rows, new Map([[1, ["Time"]]]), { includeTest: false });
    expect(out.find((r) => r.label === "Unknown")?.count).toBe(2);
  });

  it("folds beyond topN into Other", () => {
    const labels = new Map<number, string[]>([
      [1, ["A", "B", "C"]],
      [2, ["A", "D"]],
      [3, ["A", "B"]],
    ]);
    const out = buildMultiLabelBreakdown(rows, labels, { includeTest: false, topN: 2 });
    expect(out.map((r) => r.label).slice(0, 2)).toEqual(["A", "B"]);
    expect(out.find((r) => r.label === "Other")).toBeTruthy();
  });
});

describe("buildArchetypeDistribution", () => {
  const rows = [
    row({
      submissionId: 1,
      archetypeV5: "Relational Nurturer",
      percentagesV5: { "Relational Nurturer": 80, "Emotional Voyeur": 40 },
      paidAmount: 29,
    }),
    row({
      submissionId: 2,
      archetypeV5: "Relational Nurturer",
      percentagesV5: { "Relational Nurturer": 60, "Emotional Voyeur": 50 },
      paidAmount: 0,
    }),
    row({
      submissionId: 3,
      archetypeV5: "Emotional Voyeur",
      percentagesV5: { "Relational Nurturer": 10, "Emotional Voyeur": 90 },
      paidAmount: 0,
    }),
  ];

  it("averages match % across ALL archetypes (not just the primary)", () => {
    const dist = buildArchetypeDistribution(rows, "v5", false);
    const nurturer = dist.find((d) => d.archetype === "Relational Nurturer")!;
    const voyeur = dist.find((d) => d.archetype === "Emotional Voyeur")!;
    expect(nurturer.avgMatch).toBe(50); // (80+60+10)/3
    expect(voyeur.avgMatch).toBe(60); // (40+50+90)/3
    expect(nurturer.scored).toBe(3);
  });

  it("counts primaries + paid rate among primaries", () => {
    const dist = buildArchetypeDistribution(rows, "v5", false);
    const nurturer = dist.find((d) => d.archetype === "Relational Nurturer")!;
    expect(nurturer.primaryCount).toBe(2);
    expect(nurturer.primaryPaid).toBe(1);
    expect(nurturer.primaryPaidPct).toBe(50);
    const voyeur = dist.find((d) => d.archetype === "Emotional Voyeur")!;
    expect(voyeur.primaryCount).toBe(1);
    expect(voyeur.primaryPaidPct).toBe(0);
  });

  it("reads the version-specific percentages", () => {
    const r = [
      row({
        archetypeV4: "Old Name",
        percentagesV4: { "Old Name": 70 },
        percentagesV5: { "New Name": 30 },
      }),
    ];
    expect(
      buildArchetypeDistribution(r, "v4", false).find((d) => d.archetype === "Old Name")?.avgMatch
    ).toBe(70);
    expect(
      buildArchetypeDistribution(r, "v5", false).find((d) => d.archetype === "New Name")?.avgMatch
    ).toBe(30);
  });

  it("returns [] for an empty cohort", () => {
    expect(buildArchetypeDistribution([], "v5", false)).toEqual([]);
  });
});

describe("archetypeMatchFilter", () => {
  const rows = [
    row({ submissionId: 1, percentagesV5: { "Emotional Voyeur": 80, Nurturer: 20 } }),
    row({ submissionId: 2, percentagesV5: { "Emotional Voyeur": 40, Nurturer: 70 } }),
    row({ submissionId: 3, percentagesV5: {} }), // unscored
  ];

  it("keeps people matching an archetype ≥ threshold even if not primary", () => {
    const out = archetypeMatchFilter(rows, [{ archetype: "Emotional Voyeur", min: 50 }], "v5");
    expect(out.map((r) => r.submissionId)).toEqual([1]);
  });

  it("AND semantics across clauses", () => {
    const out = archetypeMatchFilter(
      rows,
      [
        { archetype: "Emotional Voyeur", min: 30 },
        { archetype: "Nurturer", min: 60 },
      ],
      "v5"
    );
    expect(out.map((r) => r.submissionId)).toEqual([2]);
  });

  it("no clauses → passthrough; unscored rows never match", () => {
    expect(archetypeMatchFilter(rows, [], "v5")).toHaveLength(3);
    const out = archetypeMatchFilter(rows, [{ archetype: "Emotional Voyeur", min: 1 }], "v5");
    expect(out.map((r) => r.submissionId)).toEqual([1, 2]); // row 3 unscored, excluded
  });
});

describe("breakdown distribution share % (sharePct)", () => {
  it("single-select share = count / total, sums to ~100", () => {
    const rows = [
      row({ submissionId: 1 }),
      row({ submissionId: 2 }),
      row({ submissionId: 3 }),
      row({ submissionId: 4 }),
    ];
    const answers = new Map<number, string>([
      [1, "Daily"],
      [2, "Daily"],
      [3, "Daily"],
      [4, "Weekly"],
    ]);
    const out = buildBreakdownBy(rows, specForAnswers(answers), { includeTest: false });
    expect(out.find((r) => r.label === "Daily")?.sharePct).toBe(75);
    expect(out.find((r) => r.label === "Weekly")?.sharePct).toBe(25);
    expect(out.reduce((a, r) => a + r.sharePct, 0)).toBeCloseTo(100, 5);
  });

  it("multi-select share = penetration (count / cohort size), NOT share of option-picks", () => {
    const rows = [row({ submissionId: 1 }), row({ submissionId: 2 }), row({ submissionId: 3 })];
    const labels = new Map<number, string[]>([
      [1, ["A", "B"]],
      [2, ["A"]],
      [3, ["A"]],
    ]);
    const out = buildMultiLabelBreakdown(rows, labels, { includeTest: false });
    // A picked by all 3 of 3 people → 100% (even though it's 3 of 4 option-picks).
    expect(out.find((r) => r.label === "A")?.sharePct).toBe(100);
    expect(out.find((r) => r.label === "B")?.sharePct).toBeCloseTo(33.3, 1);
  });

  it("the folded 'Other' row keeps a correct residual share", () => {
    const rows = Array.from({ length: 5 }, (_, i) => row({ submissionId: i + 1 }));
    const answers = new Map<number, string>([
      [1, "A"],
      [2, "A"],
      [3, "B"],
      [4, "C"],
      [5, "D"],
    ]);
    const out = buildBreakdownBy(rows, specForAnswers(answers), { includeTest: false, topN: 1 });
    expect(out[0]).toMatchObject({ label: "A", count: 2, sharePct: 40 });
    expect(out.find((r) => r.label === "Other")).toMatchObject({ count: 3, sharePct: 60 });
  });
});

describe("breakdown gender split (byGender)", () => {
  it("tallies + normalizes gender per group (Woman→Women, Man→Men, else→Other)", () => {
    const rows = [
      row({ submissionId: 1, gender: "Woman" }),
      row({ submissionId: 2, gender: "Woman" }),
      row({ submissionId: 3, gender: "Man" }),
      row({ submissionId: 4, gender: "Nonbinary" }),
      row({ submissionId: 5, gender: null }),
    ];
    const answers = new Map<number, string>([
      [1, "X"],
      [2, "X"],
      [3, "X"],
      [4, "X"],
      [5, "X"],
    ]);
    const out = buildBreakdownBy(rows, specForAnswers(answers), { includeTest: false });
    const x = out.find((r) => r.label === "X")!;
    expect(x.byGender.Women?.count).toBe(2);
    expect(x.byGender.Men?.count).toBe(1);
    expect(x.byGender.Other?.count).toBe(2); // Nonbinary + null
  });

  it("merges byGender across rows folded into 'Other'", () => {
    const rows = [
      // "Top" has count 2 so it's kept; the two single-count tails fold into Other.
      row({ submissionId: 1, gender: "Woman" }),
      row({ submissionId: 2, gender: "Woman" }),
      row({ submissionId: 3, gender: "Man" }),
      row({ submissionId: 4, gender: "Woman" }),
    ];
    const answers = new Map<number, string>([
      [1, "Top"],
      [2, "Top"],
      [3, "TailM"],
      [4, "TailW"],
    ]);
    const out = buildBreakdownBy(rows, specForAnswers(answers), { includeTest: false, topN: 1 });
    const other = out.find((r) => r.label === "Other")!;
    // TailM (Man) + TailW (Woman) merged.
    expect(other.byGender.Men?.count).toBe(1);
    expect(other.byGender.Women?.count).toBe(1);
  });
});

/**
 * The Explorer's "Landing page" dimension.
 *
 * Until 2026-08-27 this returned `"control"` for anything that was not exactly
 * `"white"`, so the dimension put the retired dark arm, the LIVE V1 arm, and every
 * submission with no arm stamped into one bucket and named it the dark landing page.
 * Measured on production that bucket was 805 arm-less rows + 34 V1 rows against 53
 * genuinely dark ones — 94% not dark, with the arm under test hiding inside it.
 * Nothing threw and no test failed, which is why it survived two months.
 */
describe("parseLandingVariant", () => {
  const stamp = (arm: string) => JSON.stringify({ utm_source: "google", landing_variant: arm });

  it("gives each arm its own plain-English name", () => {
    expect(parseLandingVariant(stamp("white"))).toBe("Landing Page V2 (Survey in Hero)");
    expect(parseLandingVariant(stamp("white_prev"))).toBe("Landing Page V1 (First Design)");
    expect(parseLandingVariant(stamp("control"))).toBe("Dark landing page (before V1)");
  });

  it("never folds the live V1 arm into the retired dark one", () => {
    // The exact regression. These three must be three different buckets.
    const seen = new Set(
      ["white", "white_prev", "control"].map((arm) => parseLandingVariant(stamp(arm)))
    );
    expect(seen.size).toBe(3);
  });

  it("reports missing, empty and unparseable trackers as not recorded, not as dark", () => {
    for (const tracker of [
      null,
      "",
      "   ",
      "not json",
      JSON.stringify({ utm_source: "google" }),
      JSON.stringify({ landing_variant: "" }),
      JSON.stringify({ landing_variant: "   " }),
    ]) {
      expect(parseLandingVariant(tracker), JSON.stringify(tracker)).toBe("Not recorded");
    }
  });

  it("reports an unrecognised arm as not recorded rather than inventing a name", () => {
    expect(parseLandingVariant(stamp("white_v3_experiment"))).toBe("Not recorded");
  });

  it("keeps the dimension's value ordering in step with what it returns", () => {
    // These two drifted apart before: the ordering listed raw values ["white",
    // "control"] while the parser returned display names, so once the round-2 arm
    // existed its rows had no place in the order at all.
    for (const label of DIMENSION_ORDER.landingVariant ?? []) {
      expect(typeof label).toBe("string");
    }
    expect(DIMENSION_ORDER.landingVariant).toContain(parseLandingVariant(stamp("white_prev")));
    expect(DIMENSION_ORDER.landingVariant).toContain(parseLandingVariant(null));
  });
});
