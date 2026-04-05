import { describe, expect, it } from "vitest";
import {
  buildSegmentMetrics,
  evaluateSegmentRules,
  type SegmentComparableRow,
  type SegmentRules,
} from "../../lib/admin/segment-evaluator";

const sampleRow: SegmentComparableRow = {
  id: 1,
  status: "completed",
  duration_ms: 120000,
  created_date_time: "2026-03-01T12:00:00.000Z",
  utm_tracker: JSON.stringify({ utm_source: "google", utm_medium: "cpc" }),
  scoring_result: {
    primary_archetype: "Spark Seeker",
    v5_primary_archetype: "Spark Seeker",
  },
  app_user: {
    user_profile: {
      gender: "Female",
      sexual_orientation: "Heterosexual",
      relationship_status: "Single",
      location_primary: "Germany",
    },
  },
  personal_report: [{ id: 7, payment_id: 99 }],
};

describe("segment evaluator", () => {
  it("evaluates mixed rule conditions against submission shape", () => {
    const rules: SegmentRules = {
      logic: "and",
      conditions: [
        { field: "archetype", operator: "eq", value: "Spark Seeker" },
        { field: "utm_source", operator: "eq", value: "google" },
        { field: "has_payment", operator: "eq", value: true },
        { field: "duration_ms", operator: "gte", value: 60000 },
      ],
    };

    expect(evaluateSegmentRules(sampleRow, rules)).toBe(true);
  });

  it("builds cohort metrics from matched rows", () => {
    const metrics = buildSegmentMetrics([
      sampleRow,
      {
        ...sampleRow,
        id: 2,
        status: "flagged",
        duration_ms: 60000,
        scoring_result: {
          primary_archetype: "Romantic Idealist",
          v5_primary_archetype: null,
        },
      },
    ]);

    expect(metrics.total_submissions).toBe(2);
    expect(metrics.completed).toBe(1);
    expect(metrics.avg_duration_ms).toBe(90000);
    expect(metrics.archetype_distribution).toEqual(
      expect.arrayContaining([
        { archetype: "Spark Seeker", count: 1 },
        { archetype: "Romantic Idealist", count: 1 },
      ])
    );
  });
});
