import type { AdminBenchmarkDefinition } from "@/data/admin-benchmarks";
import {
  ADMIN_METRIC_OPTIONS,
  fetchMetricValue,
  loadBenchmarkDefinitions,
} from "@/lib/admin/metric-library";
import {
  fetchMetricRegistryEntries,
  formatMetricValue,
  type AdminMetricRegistryEntry,
  type MetricUnit,
} from "@/lib/admin/metric-registry";
import {
  countDeltaSignal,
  meanDifferenceSignal,
  orientSignalToDirection,
  twoProportionSignal,
  type StatisticalSignificance,
} from "@/lib/admin/statistics";
import { supabaseFetch } from "@/lib/admin/supabase";
import logger from "@/lib/logger";

export type ExperimentStatus = "draft" | "active" | "paused" | "completed" | "archived";
export type ExperimentConfidence = "high" | "medium" | "low";
export type ExperimentDecisionState =
  | "running"
  | "ready"
  | "guardrail-risk"
  | "awaiting-readout"
  | "needs-instrumentation"
  | "archived";
export type ExperimentTone = "good" | "watch" | "risk" | "neutral";
type MetricStatus = "good" | "watch" | "risk" | "unknown";

export const EXPERIMENT_SELECT = [
  "id",
  "name",
  "hypothesis",
  "owner_email",
  "segment_id",
  "primary_metric_key",
  "status",
  "start_date",
  "decision_date",
  "expected_impact",
  "result_summary",
  "outcome",
  "readout_method",
  "control_sample_size",
  "control_success_count",
  "variant_sample_size",
  "variant_success_count",
  "control_metric_value",
  "variant_metric_value",
  "control_stddev_value",
  "variant_stddev_value",
  "readout_notes",
  "created_at",
  "updated_at",
  "admin_email",
  "admin_experiment_metric(metric_key,metric_role)",
].join(",");

export type ExperimentMetricRow = {
  metric_key: string;
  metric_role: "primary" | "guardrail";
};

export type ExperimentRow = {
  id: number;
  name: string;
  hypothesis: string;
  owner_email: string | null;
  segment_id: number | null;
  primary_metric_key: string;
  status: ExperimentStatus;
  start_date: string | null;
  decision_date: string | null;
  expected_impact: string | null;
  result_summary: string | null;
  outcome: string | null;
  readout_method: "conversion-rate" | "count-delta" | "average-value" | null;
  control_sample_size: number | null;
  control_success_count: number | null;
  variant_sample_size: number | null;
  variant_success_count: number | null;
  control_metric_value: number | null;
  variant_metric_value: number | null;
  control_stddev_value: number | null;
  variant_stddev_value: number | null;
  readout_notes: string | null;
  created_at: string;
  updated_at: string;
  admin_email: string;
  admin_experiment_metric?: ExperimentMetricRow[] | null;
};

export interface ExperimentReadoutSnapshot {
  method: "conversion-rate" | "count-delta" | "average-value" | null;
  methodLabel: string;
  controlSampleSize: number | null;
  controlSuccessCount: number | null;
  variantSampleSize: number | null;
  variantSuccessCount: number | null;
  controlMetricValue: number | null;
  variantMetricValue: number | null;
  controlStddevValue: number | null;
  variantStddevValue: number | null;
  controlRateLabel: string | null;
  variantRateLabel: string | null;
  controlMetaLabel: string | null;
  variantMetaLabel: string | null;
  deltaLabel: string | null;
  significance: StatisticalSignificance;
  significanceLabel: string;
  summary: string;
  pValue: number | null;
  ciLabel: string | null;
  notes: string | null;
  isReady: boolean;
  winnerLabel: string;
  winnerConfidenceScore: number;
  winnerConfidenceLabel: string;
  winnerDetail: string;
}

interface ReviewRow {
  id: number;
  status: string;
  resource_id: number | null;
  due_date: string | null;
}

interface MetricSignal {
  key: string;
  label: string;
  href: string;
  description: string;
  status: MetricStatus;
  currentValue: number | null;
  currentLabel: string;
  targetValue: number | null;
  targetLabel: string | null;
  warningValue: number | null;
  warningLabel: string | null;
  unit: MetricUnit;
  direction: "higher" | "lower";
  trustMode: string | null;
  trustNote: string | null;
  reviewStatus: "fresh" | "due" | "overdue" | "never" | "unknown";
}

export interface ExperimentSnapshot {
  id: number;
  name: string;
  hypothesis: string;
  owner_email: string | null;
  segment_id: number | null;
  segment_name: string | null;
  primary_metric_key: string;
  primary_metric_label: string;
  status: ExperimentStatus;
  start_date: string | null;
  decision_date: string | null;
  expected_impact: string | null;
  result_summary: string | null;
  outcome: string | null;
  metric_value: number | null;
  created_at: string;
  updated_at: string;
  admin_email: string;
  guardrail_metric_keys: string[];
  primaryMetric: MetricSignal;
  guardrails: MetricSignal[];
  guardrailRiskCount: number;
  blindspotCount: number;
  confidence: ExperimentConfidence;
  confidenceScore: number;
  confidenceDetail: string;
  readout: ExperimentReadoutSnapshot;
  decisionState: ExperimentDecisionState;
  decisionLabel: string;
  decisionDetail: string;
  decisionTone: ExperimentTone;
  daysRunning: number | null;
  daysToDecision: number | null;
  openReviewCount: number;
  overdueReviewCount: number;
}

export interface ExperimentRegistrySnapshot {
  summary: {
    total: number;
    active: number;
    completed: number;
    pendingDecision: number;
    readyForDecision: number;
    guardrailRisks: number;
    highConfidence: number;
    blindspots: number;
  };
  scorecard: {
    readyQueue: ExperimentSnapshot[];
    riskQueue: ExperimentSnapshot[];
    weakSignalQueue: ExperimentSnapshot[];
  };
  experiments: ExperimentSnapshot[];
  segments: Array<{ id: number; name: string }>;
  metrics: typeof ADMIN_METRIC_OPTIONS;
}

export function normalizeGuardrails(
  primaryMetricKey: string,
  guardrailMetricKeys: string[] | undefined
) {
  return [...new Set((guardrailMetricKeys ?? []).map((key) => key.trim()).filter(Boolean))].filter(
    (key) => key !== primaryMetricKey
  );
}

export function normalizeExperimentMetrics(experiment: ExperimentRow) {
  const metricRows = experiment.admin_experiment_metric ?? [];
  const primaryMetricKey =
    metricRows.find((row) => row.metric_role === "primary")?.metric_key ??
    experiment.primary_metric_key;
  const guardrailMetricKeys = normalizeGuardrails(
    primaryMetricKey,
    metricRows.filter((row) => row.metric_role === "guardrail").map((row) => row.metric_key)
  );

  return { primaryMetricKey, guardrailMetricKeys };
}

function registryReviewStatus(
  entry: AdminMetricRegistryEntry | undefined
): MetricSignal["reviewStatus"] {
  if (!entry) return "unknown";
  if (!entry.last_reviewed_at) return "never";
  const dueAt = new Date(entry.last_reviewed_at).getTime() + entry.review_cadence_days * 86_400_000;
  if (dueAt < Date.now()) return "overdue";
  if (dueAt - Date.now() <= 7 * 86_400_000) return "due";
  return "fresh";
}

function inferUnit(
  metricKey: string,
  benchmark: AdminBenchmarkDefinition | undefined,
  registryEntry: AdminMetricRegistryEntry | undefined
): AdminMetricRegistryEntry["unit"] {
  if (registryEntry?.unit) return registryEntry.unit;
  if (benchmark?.unit) return benchmark.unit;
  if (metricKey.includes("rate") || metricKey.includes("agreement")) return "percent";
  if (metricKey.includes("duration") || metricKey.includes("minutes")) return "minutes";
  if (metricKey.includes("revenue")) return "currency";
  return "count";
}

function inferDirection(
  metricKey: string,
  benchmark: AdminBenchmarkDefinition | undefined
): "higher" | "lower" {
  if (benchmark?.direction) return benchmark.direction;
  if (
    metricKey.includes("duration") ||
    metricKey.includes("minutes") ||
    metricKey.includes("case") ||
    metricKey.includes("latency") ||
    metricKey.includes("error")
  ) {
    return "lower";
  }
  return "higher";
}

function metricStatus(
  value: number | null,
  benchmark: AdminBenchmarkDefinition | undefined
): MetricStatus {
  if (value == null || !benchmark) return "unknown";
  if (benchmark.direction === "higher") {
    if (value >= benchmark.targetValue) return "good";
    if (value >= benchmark.warningValue) return "watch";
    return "risk";
  }
  if (value <= benchmark.targetValue) return "good";
  if (value <= benchmark.warningValue) return "watch";
  return "risk";
}

function metricSignal(
  metricKey: string,
  metricValues: Map<string, number | null>,
  benchmarkMap: Map<string, AdminBenchmarkDefinition>,
  registryMap: Map<string, AdminMetricRegistryEntry>
): MetricSignal {
  const option = ADMIN_METRIC_OPTIONS.find((item) => item.key === metricKey);
  const benchmark = benchmarkMap.get(metricKey);
  const registryEntry = registryMap.get(metricKey);
  const unit = inferUnit(metricKey, benchmark, registryEntry);
  const currentValue = metricValues.get(metricKey) ?? null;

  return {
    key: metricKey,
    label: registryEntry?.label ?? benchmark?.label ?? option?.label ?? metricKey,
    href: registryEntry?.linked_href ?? benchmark?.href ?? option?.href ?? "/admin/benchmarks",
    description:
      registryEntry?.description ??
      benchmark?.description ??
      option?.description ??
      "No metric description.",
    status: metricStatus(currentValue, benchmark),
    currentValue,
    currentLabel: formatMetricValue(currentValue, unit),
    targetValue: benchmark?.targetValue ?? null,
    targetLabel: benchmark ? formatMetricValue(benchmark.targetValue, benchmark.unit) : null,
    warningValue: benchmark?.warningValue ?? null,
    warningLabel: benchmark ? formatMetricValue(benchmark.warningValue, benchmark.unit) : null,
    unit,
    direction: inferDirection(metricKey, benchmark),
    trustMode: registryEntry?.trust_mode ?? null,
    trustNote: registryEntry?.trust_note ?? null,
    reviewStatus: registryReviewStatus(registryEntry),
  };
}

function daysBetween(dateValue: string | null): number | null {
  if (!dateValue) return null;
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return null;
  return Math.floor((Date.now() - date.getTime()) / 86_400_000);
}

function daysUntil(dateValue: string | null): number | null {
  if (!dateValue) return null;
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return null;
  return Math.ceil((date.getTime() - Date.now()) / 86_400_000);
}

function confidenceBand(score: number): ExperimentConfidence {
  if (score >= 78) return "high";
  if (score >= 56) return "medium";
  return "low";
}

function significanceLabel(value: StatisticalSignificance) {
  if (value === "significant-lift") return "Significant lift";
  if (value === "significant-regression") return "Significant regression";
  if (value === "inconclusive") return "Inconclusive";
  return "Insufficient sample";
}

function readoutMethodLabel(method: ExperimentRow["readout_method"]) {
  if (method === "count-delta") return "Count Delta";
  if (method === "average-value") return "Average Value";
  return "Conversion Rate";
}

function signedMetricValue(value: number, unit: MetricUnit, suffixOverride?: string) {
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  const abs = Math.abs(value);
  if (unit === "currency") return `${sign}$${Math.round(abs * 100) / 100}`;
  if (unit === "minutes") return `${sign}${Math.round(abs * 10) / 10}m`;
  if (unit === "percent") return `${sign}${Math.round(abs * 10) / 10}${suffixOverride ?? "%"}`;
  if (unit === "score") return `${sign}${Math.round(abs * 10) / 10}`;
  return `${sign}${Math.round(abs * 10) / 10}`;
}

function intervalLabel(
  ciLow: number | null,
  ciHigh: number | null,
  unit: MetricUnit,
  suffixOverride?: string
) {
  if (ciLow == null || ciHigh == null) return null;
  return `${signedMetricValue(ciLow, unit, suffixOverride)} to ${signedMetricValue(
    ciHigh,
    unit,
    suffixOverride
  )}`;
}

function readoutSummary(
  signal: {
    delta: number;
    ciLow: number | null;
    ciHigh: number | null;
    significance: StatisticalSignificance;
  },
  unit: MetricUnit,
  suffixOverride?: string
) {
  if (signal.significance === "insufficient-data") return "Insufficient sample";
  if (signal.ciLow == null || signal.ciHigh == null) return "Confidence unavailable";
  return `${signedMetricValue(signal.delta, unit, suffixOverride)} · 95% CI ${intervalLabel(
    signal.ciLow,
    signal.ciHigh,
    unit,
    suffixOverride
  )}`;
}

function winnerConfidence(score: number) {
  if (score >= 72) return "High";
  if (score >= 48) return "Medium";
  if (score > 0) return "Low";
  return "None";
}

function computeWinnerConfidence(input: {
  method: ExperimentRow["readout_method"];
  signal: {
    significance: StatisticalSignificance;
    pValue: number | null;
    ciLow: number | null;
    ciHigh: number | null;
  };
  controlSampleSize: number | null;
  variantSampleSize: number | null;
  controlStddevValue: number | null;
  variantStddevValue: number | null;
}) {
  if (input.signal.significance === "insufficient-data") return 0;

  let score = 20;
  const totalObserved = (input.controlSampleSize ?? 0) + (input.variantSampleSize ?? 0);

  if (
    input.signal.significance === "significant-lift" ||
    input.signal.significance === "significant-regression"
  ) {
    score += 28;
  } else {
    score += 10;
  }

  if (input.signal.pValue != null) {
    if (input.signal.pValue <= 0.01) score += 18;
    else if (input.signal.pValue <= 0.05) score += 10;
    else if (input.signal.pValue <= 0.1) score += 4;
  }

  if (totalObserved >= 400) score += 18;
  else if (totalObserved >= 150) score += 12;
  else if (totalObserved >= 60) score += 6;

  if (
    input.signal.ciLow != null &&
    input.signal.ciHigh != null &&
    ((input.signal.ciLow > 0 && input.signal.ciHigh > 0) ||
      (input.signal.ciLow < 0 && input.signal.ciHigh < 0))
  ) {
    score += 10;
  }

  if (
    input.method === "average-value" &&
    input.controlStddevValue != null &&
    input.variantStddevValue != null
  ) {
    score += 8;
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}

function winnerLabel(significance: StatisticalSignificance) {
  if (significance === "significant-lift") return "Variant winning";
  if (significance === "significant-regression") return "Control winning";
  if (significance === "inconclusive") return "Hold / inconclusive";
  return "Needs more data";
}

function winnerDetail(significance: StatisticalSignificance) {
  if (significance === "significant-lift") {
    return "Variant is ahead in the beneficial direction with statistical support.";
  }
  if (significance === "significant-regression") {
    return "Variant is harming the primary metric enough that control is the safer winner.";
  }
  if (significance === "inconclusive") {
    return "Observed movement exists, but the readout is not strong enough to call a winner yet.";
  }
  return "The readout is incomplete or the sample is too small to support a winner call.";
}

function buildExperimentReadout(
  experiment: ExperimentRow,
  primaryMetric: Pick<MetricSignal, "unit" | "direction">
): ExperimentReadoutSnapshot {
  const controlSampleSize = experiment.control_sample_size ?? null;
  const controlSuccessCount = experiment.control_success_count ?? null;
  const variantSampleSize = experiment.variant_sample_size ?? null;
  const variantSuccessCount = experiment.variant_success_count ?? null;
  const controlMetricValue = experiment.control_metric_value ?? null;
  const variantMetricValue = experiment.variant_metric_value ?? null;
  const controlStddevValue = experiment.control_stddev_value ?? null;
  const variantStddevValue = experiment.variant_stddev_value ?? null;
  const method = experiment.readout_method ?? null;
  const methodLabel = readoutMethodLabel(method);
  const direction = primaryMetric.direction;
  const unit = primaryMetric.unit;

  if (method === "count-delta") {
    if (controlSuccessCount == null || variantSuccessCount == null) {
      return {
        method,
        methodLabel,
        controlSampleSize,
        controlSuccessCount,
        variantSampleSize,
        variantSuccessCount,
        controlMetricValue,
        variantMetricValue,
        controlStddevValue,
        variantStddevValue,
        controlRateLabel: null,
        variantRateLabel: null,
        controlMetaLabel: null,
        variantMetaLabel: null,
        deltaLabel: null,
        significance: "insufficient-data",
        significanceLabel: "Readout incomplete",
        summary: "Add control and variant observed totals to compare event-count movement.",
        pValue: null,
        ciLabel: null,
        notes: experiment.readout_notes ?? null,
        isReady: false,
        winnerLabel: "Needs more data",
        winnerConfidenceScore: 0,
        winnerConfidenceLabel: "None",
        winnerDetail:
          "Event totals are missing, so the count-based readout cannot be interpreted yet.",
      };
    }

    const signal = orientSignalToDirection(
      countDeltaSignal(controlSuccessCount, variantSuccessCount),
      direction
    );
    const confidenceScore = computeWinnerConfidence({
      method,
      signal,
      controlSampleSize,
      variantSampleSize,
      controlStddevValue,
      variantStddevValue,
    });

    return {
      method,
      methodLabel,
      controlSampleSize,
      controlSuccessCount,
      variantSampleSize,
      variantSuccessCount,
      controlMetricValue,
      variantMetricValue,
      controlStddevValue,
      variantStddevValue,
      controlRateLabel: formatMetricValue(controlSuccessCount, unit),
      variantRateLabel: formatMetricValue(variantSuccessCount, unit),
      controlMetaLabel:
        controlSampleSize != null ? `Observed across n=${controlSampleSize}` : "Observed total",
      variantMetaLabel:
        variantSampleSize != null ? `Observed across n=${variantSampleSize}` : "Observed total",
      deltaLabel: signedMetricValue(signal.delta, "percent"),
      significance: signal.significance,
      significanceLabel: significanceLabel(signal.significance),
      summary: readoutSummary(signal, "percent"),
      pValue: signal.pValue,
      ciLabel: intervalLabel(signal.ciLow, signal.ciHigh, "percent"),
      notes: experiment.readout_notes ?? null,
      isReady: signal.significance !== "insufficient-data",
      winnerLabel: winnerLabel(signal.significance),
      winnerConfidenceScore: confidenceScore,
      winnerConfidenceLabel: winnerConfidence(confidenceScore),
      winnerDetail: winnerDetail(signal.significance),
    };
  }

  if (method === "average-value") {
    if (
      controlSampleSize == null ||
      variantSampleSize == null ||
      controlMetricValue == null ||
      variantMetricValue == null ||
      controlStddevValue == null ||
      variantStddevValue == null
    ) {
      return {
        method,
        methodLabel,
        controlSampleSize,
        controlSuccessCount,
        variantSampleSize,
        variantSuccessCount,
        controlMetricValue,
        variantMetricValue,
        controlStddevValue,
        variantStddevValue,
        controlRateLabel: null,
        variantRateLabel: null,
        controlMetaLabel: null,
        variantMetaLabel: null,
        deltaLabel: null,
        significance: "insufficient-data",
        significanceLabel: "Readout incomplete",
        summary:
          "Add control and variant sample sizes, average values, and standard deviations to compare continuous metrics.",
        pValue: null,
        ciLabel: null,
        notes: experiment.readout_notes ?? null,
        isReady: false,
        winnerLabel: "Needs more data",
        winnerConfidenceScore: 0,
        winnerConfidenceLabel: "None",
        winnerDetail:
          "Continuous-metric readouts require sample size, mean value, and spread for both control and variant.",
      };
    }

    const signal = orientSignalToDirection(
      meanDifferenceSignal(
        controlSampleSize,
        controlMetricValue,
        controlStddevValue,
        variantSampleSize,
        variantMetricValue,
        variantStddevValue
      ),
      direction
    );
    const confidenceScore = computeWinnerConfidence({
      method,
      signal,
      controlSampleSize,
      variantSampleSize,
      controlStddevValue,
      variantStddevValue,
    });

    return {
      method,
      methodLabel,
      controlSampleSize,
      controlSuccessCount,
      variantSampleSize,
      variantSuccessCount,
      controlMetricValue,
      variantMetricValue,
      controlStddevValue,
      variantStddevValue,
      controlRateLabel: formatMetricValue(controlMetricValue, unit),
      variantRateLabel: formatMetricValue(variantMetricValue, unit),
      controlMetaLabel: `n=${controlSampleSize} · sd ${formatMetricValue(controlStddevValue, unit)}`,
      variantMetaLabel: `n=${variantSampleSize} · sd ${formatMetricValue(variantStddevValue, unit)}`,
      deltaLabel: signedMetricValue(signal.delta, unit),
      significance: signal.significance,
      significanceLabel: significanceLabel(signal.significance),
      summary: readoutSummary(signal, unit),
      pValue: signal.pValue,
      ciLabel: intervalLabel(signal.ciLow, signal.ciHigh, unit),
      notes: experiment.readout_notes ?? null,
      isReady: signal.significance !== "insufficient-data",
      winnerLabel: winnerLabel(signal.significance),
      winnerConfidenceScore: confidenceScore,
      winnerConfidenceLabel: winnerConfidence(confidenceScore),
      winnerDetail: winnerDetail(signal.significance),
    };
  }

  if (
    method !== "conversion-rate" ||
    controlSampleSize == null ||
    controlSuccessCount == null ||
    variantSampleSize == null ||
    variantSuccessCount == null
  ) {
    return {
      method,
      methodLabel,
      controlSampleSize,
      controlSuccessCount,
      variantSampleSize,
      variantSuccessCount,
      controlMetricValue,
      variantMetricValue,
      controlStddevValue,
      variantStddevValue,
      controlRateLabel: null,
      variantRateLabel: null,
      controlMetaLabel: null,
      variantMetaLabel: null,
      deltaLabel: null,
      significance: "insufficient-data",
      significanceLabel: "Readout incomplete",
      summary:
        "Add control and variant sample sizes plus converted counts to compute significance.",
      pValue: null,
      ciLabel: null,
      notes: experiment.readout_notes ?? null,
      isReady: false,
      winnerLabel: "Needs more data",
      winnerConfidenceScore: 0,
      winnerConfidenceLabel: "None",
      winnerDetail: "Control and variant conversion data are incomplete.",
    };
  }

  const signal = orientSignalToDirection(
    twoProportionSignal(
      controlSampleSize,
      controlSuccessCount,
      variantSampleSize,
      variantSuccessCount
    ),
    direction
  );
  const controlRate =
    controlSampleSize > 0 ? (controlSuccessCount / controlSampleSize) * 100 : null;
  const variantRate =
    variantSampleSize > 0 ? (variantSuccessCount / variantSampleSize) * 100 : null;
  const confidenceScore = computeWinnerConfidence({
    method,
    signal,
    controlSampleSize,
    variantSampleSize,
    controlStddevValue,
    variantStddevValue,
  });

  return {
    method,
    methodLabel,
    controlSampleSize,
    controlSuccessCount,
    variantSampleSize,
    variantSuccessCount,
    controlMetricValue,
    variantMetricValue,
    controlStddevValue,
    variantStddevValue,
    controlRateLabel: controlRate == null ? null : `${Math.round(controlRate * 10) / 10}%`,
    variantRateLabel: variantRate == null ? null : `${Math.round(variantRate * 10) / 10}%`,
    controlMetaLabel: `${controlSuccessCount}/${controlSampleSize} converted`,
    variantMetaLabel: `${variantSuccessCount}/${variantSampleSize} converted`,
    deltaLabel: `${signal.delta >= 0 ? "+" : ""}${signal.delta}pp`,
    significance: signal.significance,
    significanceLabel: significanceLabel(signal.significance),
    summary: readoutSummary(signal, "percent", "pp"),
    pValue: signal.pValue,
    ciLabel: intervalLabel(signal.ciLow, signal.ciHigh, "percent", "pp"),
    notes: experiment.readout_notes ?? null,
    isReady: signal.significance !== "insufficient-data",
    winnerLabel: winnerLabel(signal.significance),
    winnerConfidenceScore: confidenceScore,
    winnerConfidenceLabel: winnerConfidence(confidenceScore),
    winnerDetail: winnerDetail(signal.significance),
  };
}

function decisionSignal(input: {
  experiment: ExperimentRow;
  confidenceScore: number;
  blindspotCount: number;
  guardrailRiskCount: number;
  daysToDecision: number | null;
  openReviewCount: number;
  readout: ExperimentReadoutSnapshot;
}) {
  if (input.experiment.status === "archived") {
    return {
      state: "archived" as const,
      label: "Archived",
      detail: "Experiment is archived and no longer needs active decision handling.",
      tone: "neutral" as const,
    };
  }

  if (
    input.experiment.status === "completed" &&
    (!input.experiment.result_summary || !input.experiment.outcome || !input.readout.isReady)
  ) {
    return {
      state: "awaiting-readout" as const,
      label: "Awaiting readout",
      detail: "Completed experiment still needs a result summary, outcome, or statistical readout.",
      tone: "watch" as const,
    };
  }

  if (input.guardrailRiskCount > 0) {
    return {
      state: "guardrail-risk" as const,
      label: "Guardrail risk",
      detail: "At least one guardrail metric is outside its warning boundary.",
      tone: "risk" as const,
    };
  }

  if (input.blindspotCount > 0 || input.confidenceScore < 50) {
    return {
      state: "needs-instrumentation" as const,
      label: "Needs instrumentation",
      detail:
        "Decision rigor is limited by missing metric signal, weak guardrails, or stale metric governance.",
      tone: "watch" as const,
    };
  }

  if (
    ((input.daysToDecision != null && input.daysToDecision <= 0) ||
      input.readout.significance === "significant-lift" ||
      input.readout.significance === "significant-regression") &&
    input.confidenceScore >= 70 &&
    input.openReviewCount === 0
  ) {
    return {
      state: "ready" as const,
      label: "Ready for decision",
      detail:
        input.readout.significance === "significant-lift" ||
        input.readout.significance === "significant-regression"
          ? `Readout shows ${significanceLabel(input.readout.significance).toLowerCase()} with guardrail coverage in place.`
          : "Decision date is due and the experiment has enough signal and guardrail coverage for review.",
      tone: "good" as const,
    };
  }

  return {
    state: "running" as const,
    label: "Still running",
    detail:
      input.daysToDecision != null && input.daysToDecision > 0
        ? `${input.daysToDecision} days until the decision date.`
        : "Experiment is still gathering evidence.",
    tone: "neutral" as const,
  };
}

function confidenceDetail(input: {
  confidenceScore: number;
  blindspotCount: number;
  guardrailRiskCount: number;
  hasReadout: boolean;
  significance: StatisticalSignificance;
  openReviewCount: number;
}) {
  if (input.guardrailRiskCount > 0) {
    return "Confidence is constrained because one or more guardrails are currently breached.";
  }
  if (input.blindspotCount > 0) {
    return "Confidence is constrained by missing metric benchmarks, trust metadata, or live values.";
  }
  if (
    input.significance === "significant-lift" ||
    input.significance === "significant-regression"
  ) {
    return "Confidence includes a statistically significant experiment readout with a completed result summary.";
  }
  if (!input.hasReadout) {
    return "Confidence is based on setup and signal quality; a formal readout is still missing.";
  }
  if (input.openReviewCount > 0) {
    return "Confidence is high enough for review, but open governance items still need closure.";
  }
  if (input.confidenceScore >= 78) {
    return "Experiment has strong decision hygiene, metric coverage, and no active guardrail warning.";
  }
  if (input.confidenceScore >= 56) {
    return "Experiment has usable signal, but more evidence or tighter documentation would improve certainty.";
  }
  return "Experiment lacks enough decision rigor to support a confident call.";
}

export async function buildExperimentRegistrySnapshot(
  adminEmail: string
): Promise<ExperimentRegistrySnapshot> {
  const [experimentsRes, segmentsRes, reviewsRes, benchmarks, registryEntries] = await Promise.all([
    supabaseFetch(`/rest/v1/admin_experiment?select=${EXPERIMENT_SELECT}&order=updated_at.desc`, {
      headers: { Range: "0-999" },
    }),
    supabaseFetch(
      `/rest/v1/admin_segment?or=(admin_email.eq.${encodeURIComponent(adminEmail)},is_shared.eq.true)&select=id,name&order=name.asc`,
      { headers: { Range: "0-999" } }
    ),
    supabaseFetch(
      "/rest/v1/admin_review_request?select=id,status,resource_id,due_date&resource_type=eq.experiment&order=updated_at.desc",
      { headers: { Range: "0-999" } }
    ),
    loadBenchmarkDefinitions(),
    fetchMetricRegistryEntries(),
  ]);

  if (!experimentsRes.ok || !segmentsRes.ok || !reviewsRes.ok) {
    logger.error(
      { statuses: [experimentsRes.status, segmentsRes.status, reviewsRes.status] },
      "Experiment registry snapshot query failed"
    );
    throw new Error("experiment_registry_query_failed");
  }

  const experiments = (await experimentsRes.json()) as ExperimentRow[];
  const segments = (await segmentsRes.json()) as Array<{ id: number; name: string }>;
  const reviews = (await reviewsRes.json()) as ReviewRow[];

  const benchmarkMap = new Map(benchmarks.map((entry) => [entry.key, entry]));
  const registryMap = new Map(registryEntries.map((entry) => [entry.metric_key, entry]));
  const segmentMap = new Map(segments.map((segment) => [segment.id, segment.name]));
  const reviewMap = new Map<number, ReviewRow[]>();

  for (const review of reviews) {
    if (review.resource_id == null) continue;
    const current = reviewMap.get(review.resource_id) ?? [];
    current.push(review);
    reviewMap.set(review.resource_id, current);
  }

  const normalizedExperiments = experiments.map((experiment) => {
    const metrics = normalizeExperimentMetrics(experiment);
    return {
      ...experiment,
      primary_metric_key: metrics.primaryMetricKey,
      guardrail_metric_keys: metrics.guardrailMetricKeys,
    };
  });

  const metricKeys = new Set<string>();
  for (const experiment of normalizedExperiments) {
    metricKeys.add(experiment.primary_metric_key);
    for (const key of experiment.guardrail_metric_keys) {
      metricKeys.add(key);
    }
  }

  const metricValues = new Map<string, number | null>();
  await Promise.all(
    [...metricKeys].map(async (metricKey) => {
      metricValues.set(metricKey, await fetchMetricValue(metricKey));
    })
  );

  const snapshots = normalizedExperiments.map((experiment) => {
    const experimentReviews = reviewMap.get(experiment.id) ?? [];
    const openReviewCount = experimentReviews.filter((review) =>
      ["requested", "in-review", "changes-requested"].includes(review.status)
    ).length;
    const primaryMetric = metricSignal(
      experiment.primary_metric_key,
      metricValues,
      benchmarkMap,
      registryMap
    );
    const guardrails = experiment.guardrail_metric_keys.map((metricKey) =>
      metricSignal(metricKey, metricValues, benchmarkMap, registryMap)
    );
    const readout = buildExperimentReadout(experiment, primaryMetric);
    const guardrailRiskCount = guardrails.filter((guardrail) => guardrail.status === "risk").length;
    const blindspotCount =
      (primaryMetric.status === "unknown" ? 1 : 0) +
      guardrails.filter((guardrail) => guardrail.status === "unknown").length +
      (primaryMetric.reviewStatus === "overdue" || primaryMetric.reviewStatus === "never" ? 1 : 0) +
      (experiment.status === "completed" && !readout.isReady ? 1 : 0);

    const daysRunning = experiment.start_date
      ? Math.max(0, daysBetween(experiment.start_date) ?? 0)
      : null;
    const daysToDecision = daysUntil(experiment.decision_date);
    let confidenceScore = 20;

    if (experiment.owner_email) confidenceScore += 10;
    if (experiment.start_date) confidenceScore += 8;
    if (experiment.decision_date) confidenceScore += 8;
    if (experiment.expected_impact) confidenceScore += 10;
    if (primaryMetric.currentValue != null) confidenceScore += 14;
    if (primaryMetric.targetValue != null) confidenceScore += 8;
    if (primaryMetric.trustMode) confidenceScore += 8;
    if (primaryMetric.reviewStatus === "fresh" || primaryMetric.reviewStatus === "due") {
      confidenceScore += 6;
    }
    if (guardrails.length > 0) confidenceScore += 10;
    if (guardrailRiskCount === 0 && guardrails.length > 0) confidenceScore += 10;
    if (experiment.result_summary) confidenceScore += 8;
    if (experiment.outcome) confidenceScore += 8;
    if (readout.isReady) confidenceScore += 12;
    if (
      readout.significance === "significant-lift" ||
      readout.significance === "significant-regression"
    ) {
      confidenceScore += 10;
    } else if (readout.significance === "inconclusive") {
      confidenceScore += 4;
    }
    if (daysRunning != null && daysRunning >= 7) confidenceScore += 4;
    if (experimentReviews.length > 0) confidenceScore += 2;
    confidenceScore -= blindspotCount * 9;
    confidenceScore -= guardrailRiskCount * 18;

    const boundedConfidenceScore = Math.max(0, Math.min(100, Math.round(confidenceScore)));

    const decision = decisionSignal({
      experiment,
      confidenceScore: boundedConfidenceScore,
      blindspotCount,
      guardrailRiskCount,
      daysToDecision,
      openReviewCount,
      readout,
    });

    return {
      ...experiment,
      primary_metric_label: primaryMetric.label,
      segment_name: experiment.segment_id ? (segmentMap.get(experiment.segment_id) ?? null) : null,
      metric_value: primaryMetric.currentValue,
      primaryMetric,
      guardrails,
      guardrailRiskCount,
      blindspotCount,
      confidence: confidenceBand(boundedConfidenceScore),
      confidenceScore: boundedConfidenceScore,
      confidenceDetail: confidenceDetail({
        confidenceScore: boundedConfidenceScore,
        blindspotCount,
        guardrailRiskCount,
        hasReadout: readout.isReady,
        significance: readout.significance,
        openReviewCount,
      }),
      readout,
      decisionState: decision.state,
      decisionLabel: decision.label,
      decisionDetail: decision.detail,
      decisionTone: decision.tone,
      daysRunning,
      daysToDecision,
      openReviewCount,
      overdueReviewCount: experimentReviews.filter(
        (review) =>
          review.due_date != null &&
          review.due_date < new Date().toISOString().slice(0, 10) &&
          !["approved", "rejected"].includes(review.status)
      ).length,
    } satisfies ExperimentSnapshot;
  });

  const readyForDecision = snapshots.filter((experiment) => experiment.decisionState === "ready");
  const guardrailRisks = snapshots.filter(
    (experiment) => experiment.decisionState === "guardrail-risk"
  );
  const weakSignalQueue = snapshots.filter(
    (experiment) => experiment.decisionState === "needs-instrumentation"
  );

  return {
    summary: {
      total: snapshots.length,
      active: snapshots.filter((experiment) => experiment.status === "active").length,
      completed: snapshots.filter((experiment) => experiment.status === "completed").length,
      pendingDecision: snapshots.filter(
        (experiment) =>
          experiment.status !== "archived" &&
          experiment.decision_date != null &&
          experiment.decision_date <= new Date().toISOString().slice(0, 10)
      ).length,
      readyForDecision: readyForDecision.length,
      guardrailRisks: guardrailRisks.length,
      highConfidence: snapshots.filter((experiment) => experiment.confidence === "high").length,
      blindspots: snapshots.filter((experiment) => experiment.blindspotCount > 0).length,
    },
    scorecard: {
      readyQueue: [...readyForDecision]
        .sort((a, b) => b.confidenceScore - a.confidenceScore || a.name.localeCompare(b.name))
        .slice(0, 6),
      riskQueue: [...guardrailRisks]
        .sort(
          (a, b) =>
            b.guardrailRiskCount - a.guardrailRiskCount || b.confidenceScore - a.confidenceScore
        )
        .slice(0, 6),
      weakSignalQueue: [...weakSignalQueue]
        .sort(
          (a, b) => b.blindspotCount - a.blindspotCount || a.confidenceScore - b.confidenceScore
        )
        .slice(0, 6),
    },
    experiments: snapshots,
    segments,
    metrics: ADMIN_METRIC_OPTIONS,
  };
}
