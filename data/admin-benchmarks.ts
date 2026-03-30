export type BenchmarkDirection = "higher" | "lower";
export type BenchmarkUnit = "percent" | "minutes" | "count";

export interface AdminBenchmarkDefinition {
  key:
    | "completion_rate"
    | "waitlist_to_start_rate"
    | "scoring_agreement"
    | "avg_duration_minutes"
    | "open_high_priority_cases";
  label: string;
  description: string;
  referenceLabel: string;
  targetValue: number;
  warningValue: number;
  direction: BenchmarkDirection;
  unit: BenchmarkUnit;
  href: string;
}

// Internal starter thresholds. These are not external market truths.
// Replace them once the team has stronger historical or category baselines.
export const ADMIN_BENCHMARKS: AdminBenchmarkDefinition[] = [
  {
    key: "completion_rate",
    label: "Survey Completion",
    description: "Healthy completion for the current survey shape and intent mix.",
    referenceLabel: "Internal reference",
    targetValue: 72,
    warningValue: 60,
    direction: "higher",
    unit: "percent",
    href: "/admin/product-kpis",
  },
  {
    key: "waitlist_to_start_rate",
    label: "Waitlist -> Start",
    description: "How efficiently waitlist demand turns into survey starts.",
    referenceLabel: "Internal reference",
    targetValue: 55,
    warningValue: 40,
    direction: "higher",
    unit: "percent",
    href: "/admin/pipeline",
  },
  {
    key: "scoring_agreement",
    label: "V4/V5 Agreement",
    description:
      "Share of scored submissions where the current engines agree on primary archetype.",
    referenceLabel: "Internal reference",
    targetValue: 85,
    warningValue: 70,
    direction: "higher",
    unit: "percent",
    href: "/admin/scoring",
  },
  {
    key: "avg_duration_minutes",
    label: "Avg Completion Time",
    description: "Average time to finish the survey without excessive friction.",
    referenceLabel: "Internal reference",
    targetValue: 12,
    warningValue: 18,
    direction: "lower",
    unit: "minutes",
    href: "/admin/submissions",
  },
  {
    key: "open_high_priority_cases",
    label: "Open High-Priority Cases",
    description: "How much unresolved operational risk is sitting in the investigation queue.",
    referenceLabel: "Internal reference",
    targetValue: 3,
    warningValue: 8,
    direction: "lower",
    unit: "count",
    href: "/admin/tags",
  },
];
