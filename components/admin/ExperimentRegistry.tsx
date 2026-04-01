"use client";

import { useMemo, useState } from "react";
import AdminCommentsThread from "@/components/admin/AdminCommentsThread";
import EmbeddedIntelligencePanel from "@/components/admin/EmbeddedIntelligencePanel";
import AdminSimulationPanel from "@/components/admin/AdminSimulationPanel";
import { useAdminFetch } from "@/components/admin/hooks/useAdminFetch";
import KpiDataTable, { type Column } from "@/components/admin/kpi-tabs/KpiDataTable";
import { getCsrfToken } from "@/lib/csrf-client";

type ExperimentStatus = "draft" | "active" | "paused" | "completed" | "archived";
type ExperimentConfidence = "high" | "medium" | "low";
type ExperimentDecisionState =
  | "running"
  | "ready"
  | "guardrail-risk"
  | "awaiting-readout"
  | "needs-instrumentation"
  | "archived";
type ExperimentTone = "good" | "watch" | "risk" | "neutral";
type MetricStatus = "good" | "watch" | "risk" | "unknown";
type ReviewStatus = "fresh" | "due" | "overdue" | "never" | "unknown";
type ReadoutMethod = "conversion-rate" | "count-delta" | "average-value";
type StatisticalSignificance =
  | "significant-lift"
  | "significant-regression"
  | "inconclusive"
  | "insufficient-data";

interface MetricOption {
  key: string;
  label: string;
  description: string;
  href: string;
}

interface SegmentOption {
  id: number;
  name: string;
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
  unit: "percent" | "minutes" | "count" | "currency" | "score";
  direction: "higher" | "lower";
  trustMode: string | null;
  trustNote: string | null;
  reviewStatus: ReviewStatus;
}

interface Experiment {
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
  readout: {
    method: ReadoutMethod | null;
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
  };
  decisionState: ExperimentDecisionState;
  decisionLabel: string;
  decisionDetail: string;
  decisionTone: ExperimentTone;
  daysRunning: number | null;
  daysToDecision: number | null;
  openReviewCount: number;
  overdueReviewCount: number;
}

interface ExperimentsData {
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
    readyQueue: Experiment[];
    riskQueue: Experiment[];
    weakSignalQueue: Experiment[];
  };
  experiments: Experiment[];
  segments: SegmentOption[];
  metrics: MetricOption[];
}

const STATUS_CLASSES: Record<ExperimentStatus, string> = {
  draft: "bg-white/10 text-text-muted",
  active: "bg-emerald-500/10 text-emerald-300",
  paused: "bg-amber-500/10 text-amber-200",
  completed: "bg-cyan-500/10 text-cyan-300",
  archived: "bg-red-500/10 text-red-300",
};

const CONFIDENCE_CLASSES: Record<ExperimentConfidence, string> = {
  high: "bg-emerald-500/10 text-emerald-300",
  medium: "bg-amber-500/10 text-amber-200",
  low: "bg-red-500/10 text-red-300",
};

const DECISION_CLASSES: Record<ExperimentTone, string> = {
  good: "bg-emerald-500/10 text-emerald-300",
  watch: "bg-amber-500/10 text-amber-200",
  risk: "bg-red-500/10 text-red-300",
  neutral: "bg-white/10 text-text-muted",
};

const METRIC_STATUS_CLASSES: Record<MetricStatus, string> = {
  good: "border-emerald-500/20 bg-emerald-500/5 text-emerald-300",
  watch: "border-amber-500/20 bg-amber-500/5 text-amber-200",
  risk: "border-red-500/20 bg-red-500/5 text-red-300",
  unknown: "border-white/10 bg-white/5 text-text-muted",
};

const REVIEW_STATUS_CLASSES: Record<ReviewStatus, string> = {
  fresh: "bg-emerald-500/10 text-emerald-300",
  due: "bg-amber-500/10 text-amber-200",
  overdue: "bg-red-500/10 text-red-300",
  never: "bg-white/10 text-text-muted",
  unknown: "bg-white/10 text-text-muted",
};

const columns: Column<Experiment>[] = [
  { key: "name", label: "Experiment" },
  { key: "decisionLabel", label: "Decision" },
  {
    key: "confidenceScore",
    label: "Confidence",
    align: "right",
    format: (value) => `${value as number}%`,
  },
  { key: "primary_metric_label", label: "Primary Metric" },
  {
    key: "metric_value",
    label: "Current",
    align: "right",
    format: (_value, row) => row.primaryMetric.currentLabel,
  },
  {
    key: "daysToDecision",
    label: "Decision Date",
    format: (value) => formatDecisionCountdown(value as number | null),
  },
];

const READOUT_METHOD_OPTIONS: Array<{
  value: ReadoutMethod;
  label: string;
  detail: string;
}> = [
  {
    value: "conversion-rate",
    label: "Conversion Rate",
    detail: "Best for % outcomes like completion, view, or purchase conversion.",
  },
  {
    value: "count-delta",
    label: "Count Delta",
    detail: "Best for raw event totals when the KPI is an observed count, not a rate.",
  },
  {
    value: "average-value",
    label: "Average Value",
    detail:
      "Best for continuous outcomes like minutes, scores, revenue per user, or per-user value.",
  },
];

function emptyForm() {
  return {
    name: "",
    hypothesis: "",
    owner_email: "",
    segment_id: "",
    primary_metric_key: "",
    guardrail_metric_keys: [] as string[],
    status: "draft" as ExperimentStatus,
    start_date: "",
    decision_date: "",
    expected_impact: "",
    result_summary: "",
    outcome: "",
    readout_method: "conversion-rate" as ReadoutMethod,
    control_sample_size: "",
    control_success_count: "",
    variant_sample_size: "",
    variant_success_count: "",
    control_metric_value: "",
    variant_metric_value: "",
    control_stddev_value: "",
    variant_stddev_value: "",
    readout_notes: "",
  };
}

function parseOptionalInt(value: string) {
  if (!value.trim()) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function parseOptionalNumber(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function readoutFieldCopy(method: ReadoutMethod) {
  if (method === "count-delta") {
    return {
      summary:
        "Enter observed totals for control and variant. Use this for count-based experiment outcomes.",
      controlPrimaryLabel: "Control Total",
      variantPrimaryLabel: "Variant Total",
      controlSecondaryLabel: null,
      variantSecondaryLabel: null,
      primaryPlaceholders: ["210", "248"] as const,
      secondaryPlaceholders: ["", ""] as const,
    };
  }
  if (method === "average-value") {
    return {
      summary:
        "Enter sample size, mean value, and standard deviation for both groups to compare continuous metrics.",
      controlPrimaryLabel: "Control Average",
      variantPrimaryLabel: "Variant Average",
      controlSecondaryLabel: "Control Std Dev",
      variantSecondaryLabel: "Variant Std Dev",
      primaryPlaceholders: ["12.6", "10.8"] as const,
      secondaryPlaceholders: ["4.2", "3.9"] as const,
    };
  }
  return {
    summary:
      "Enter control and variant sample sizes plus converted counts to compute significance.",
    controlPrimaryLabel: "Control Conversions",
    variantPrimaryLabel: "Variant Conversions",
    controlSecondaryLabel: null,
    variantSecondaryLabel: null,
    primaryPlaceholders: ["120", "146"] as const,
    secondaryPlaceholders: ["", ""] as const,
  };
}

function significanceClasses(value: StatisticalSignificance) {
  if (value === "significant-lift") return "bg-emerald-500/10 text-emerald-300";
  if (value === "significant-regression") return "bg-red-500/10 text-red-300";
  if (value === "inconclusive") return "bg-amber-500/10 text-amber-200";
  return "bg-white/10 text-text-muted";
}

function formatDecisionCountdown(days: number | null) {
  if (days == null) return "No decision date";
  if (days > 0) return `${days}d left`;
  if (days === 0) return "Due today";
  return `${Math.abs(days)}d overdue`;
}

function scorecardTitle(kind: "ready" | "risk" | "weak") {
  if (kind === "ready") return "Ready For Decision";
  if (kind === "risk") return "Guardrail Risk";
  return "Weak Signal";
}

function scorecardDescription(kind: "ready" | "risk" | "weak") {
  if (kind === "ready") return "Due experiments with enough signal to make a call.";
  if (kind === "risk") return "Active tests with breached guardrails or unsafe downside.";
  return "Experiments missing rigor, trust metadata, or live instrumentation.";
}

function impactLevel(experiment: Experiment) {
  if (experiment.decisionState === "guardrail-risk") return "critical";
  if (experiment.decisionState === "ready" || experiment.confidence === "high") return "high";
  if (experiment.blindspotCount > 0) return "medium";
  return "low";
}

function metricReviewLabel(status: ReviewStatus) {
  if (status === "fresh") return "Review fresh";
  if (status === "due") return "Review due";
  if (status === "overdue") return "Review overdue";
  if (status === "never") return "Never reviewed";
  return "Review unknown";
}

export default function ExperimentRegistry() {
  const { data, loading, error, refetch } =
    useAdminFetch<ExperimentsData>("/api/admin/experiments");
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [statusFilter, setStatusFilter] = useState<ExperimentStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);

  const filtered = useMemo(() => {
    const experiments = data?.experiments ?? [];
    const needle = search.trim().toLowerCase();

    return experiments.filter((experiment) => {
      if (statusFilter !== "all" && experiment.status !== statusFilter) return false;
      if (!needle) return true;
      return [
        experiment.name,
        experiment.hypothesis,
        experiment.primary_metric_label,
        experiment.primary_metric_key,
        experiment.segment_name ?? "",
        experiment.decisionLabel,
        experiment.status,
      ]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(needle));
    });
  }, [data, search, statusFilter]);
  const readoutCopy = readoutFieldCopy(form.readout_method);

  async function submitForm() {
    if (!form.name.trim() || !form.hypothesis.trim() || !form.primary_metric_key) return;

    const controlSampleSize = parseOptionalInt(form.control_sample_size);
    const controlSuccessCount = parseOptionalInt(form.control_success_count);
    const variantSampleSize = parseOptionalInt(form.variant_sample_size);
    const variantSuccessCount = parseOptionalInt(form.variant_success_count);
    const controlMetricValue = parseOptionalNumber(form.control_metric_value);
    const variantMetricValue = parseOptionalNumber(form.variant_metric_value);
    const controlStddevValue = parseOptionalNumber(form.control_stddev_value);
    const variantStddevValue = parseOptionalNumber(form.variant_stddev_value);

    if (form.readout_method === "conversion-rate") {
      if (
        (controlSampleSize != null &&
          controlSuccessCount != null &&
          controlSuccessCount > controlSampleSize) ||
        (variantSampleSize != null &&
          variantSuccessCount != null &&
          variantSuccessCount > variantSampleSize)
      ) {
        setMessage({
          type: "error",
          text: "Conversions cannot exceed the corresponding sample size.",
        });
        return;
      }
    }

    if (
      form.readout_method === "average-value" &&
      ((controlSampleSize != null && controlSampleSize <= 1) ||
        (variantSampleSize != null && variantSampleSize <= 1))
    ) {
      setMessage({
        type: "error",
        text: "Average-value readouts need at least 2 observations per group.",
      });
      return;
    }

    setSaving(true);
    setMessage(null);
    try {
      const payload = {
        action: editingId ? "update" : "create",
        ...(editingId ? { experimentId: editingId } : {}),
        name: form.name.trim(),
        hypothesis: form.hypothesis.trim(),
        owner_email: form.owner_email.trim() || null,
        segment_id: form.segment_id ? Number(form.segment_id) : null,
        primary_metric_key: form.primary_metric_key,
        guardrail_metric_keys: form.guardrail_metric_keys,
        status: form.status,
        start_date: form.start_date || null,
        decision_date: form.decision_date || null,
        expected_impact: form.expected_impact.trim() || null,
        result_summary: form.result_summary.trim() || null,
        outcome: form.outcome.trim() || null,
        readout_method: form.readout_method,
        control_sample_size: controlSampleSize,
        control_success_count: controlSuccessCount,
        variant_sample_size: variantSampleSize,
        variant_success_count: variantSuccessCount,
        control_metric_value: controlMetricValue,
        variant_metric_value: variantMetricValue,
        control_stddev_value: controlStddevValue,
        variant_stddev_value: variantStddevValue,
        readout_notes: form.readout_notes.trim() || null,
      };

      const response = await fetch("/api/admin/experiments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": getCsrfToken(),
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error((body as { error?: string } | null)?.error || "Failed to save experiment.");
      }

      setForm(emptyForm());
      setEditingId(null);
      setShowForm(false);
      setMessage({
        type: "success",
        text: editingId ? `Updated experiment #${editingId}.` : "Experiment created.",
      });
      refetch();
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Unknown error." });
    } finally {
      setSaving(false);
    }
  }

  async function deleteExperiment(id: number) {
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/experiments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": getCsrfToken(),
        },
        body: JSON.stringify({ action: "delete", experimentId: id }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(
          (body as { error?: string } | null)?.error || "Failed to delete experiment."
        );
      }

      setMessage({ type: "success", text: `Deleted experiment #${id}.` });
      refetch();
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Unknown error." });
    } finally {
      setSaving(false);
    }
  }

  async function queueReview(experiment: Experiment) {
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/reviews", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": getCsrfToken(),
        },
        body: JSON.stringify({
          title: `Review experiment: ${experiment.name}`,
          description: experiment.result_summary || experiment.hypothesis,
          resource_type: "experiment",
          resource_id: experiment.id,
          linked_metric_key: experiment.primary_metric_key,
          impact_level: impactLevel(experiment),
          reviewer_email: experiment.owner_email || null,
          source_href: "/admin/experiments",
          due_date: experiment.decision_date || null,
          payload_snapshot: {
            confidenceScore: experiment.confidenceScore,
            decisionState: experiment.decisionState,
            guardrailRiskCount: experiment.guardrailRiskCount,
            blindspotCount: experiment.blindspotCount,
            openReviewCount: experiment.openReviewCount,
            readoutSignificance: experiment.readout.significance,
            readoutSummary: experiment.readout.summary,
          },
        }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(
          (body as { error?: string } | null)?.error || "Failed to queue review request."
        );
      }

      setMessage({ type: "success", text: `Queued review for experiment #${experiment.id}.` });
      refetch();
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Unknown error." });
    } finally {
      setSaving(false);
    }
  }

  function editExperiment(experiment: Experiment) {
    setEditingId(experiment.id);
    setForm({
      name: experiment.name,
      hypothesis: experiment.hypothesis,
      owner_email: experiment.owner_email ?? "",
      segment_id: experiment.segment_id ? String(experiment.segment_id) : "",
      primary_metric_key: experiment.primary_metric_key,
      guardrail_metric_keys: experiment.guardrail_metric_keys,
      status: experiment.status,
      start_date: experiment.start_date ?? "",
      decision_date: experiment.decision_date ?? "",
      expected_impact: experiment.expected_impact ?? "",
      result_summary: experiment.result_summary ?? "",
      outcome: experiment.outcome ?? "",
      readout_method: experiment.readout.method ?? "conversion-rate",
      control_sample_size:
        experiment.readout.controlSampleSize != null
          ? String(experiment.readout.controlSampleSize)
          : "",
      control_success_count:
        experiment.readout.controlSuccessCount != null
          ? String(experiment.readout.controlSuccessCount)
          : "",
      variant_sample_size:
        experiment.readout.variantSampleSize != null
          ? String(experiment.readout.variantSampleSize)
          : "",
      variant_success_count:
        experiment.readout.variantSuccessCount != null
          ? String(experiment.readout.variantSuccessCount)
          : "",
      control_metric_value:
        experiment.readout.controlMetricValue != null
          ? String(experiment.readout.controlMetricValue)
          : "",
      variant_metric_value:
        experiment.readout.variantMetricValue != null
          ? String(experiment.readout.variantMetricValue)
          : "",
      control_stddev_value:
        experiment.readout.controlStddevValue != null
          ? String(experiment.readout.controlStddevValue)
          : "",
      variant_stddev_value:
        experiment.readout.variantStddevValue != null
          ? String(experiment.readout.variantStddevValue)
          : "",
      readout_notes: experiment.readout.notes ?? "",
    });
    setShowForm(true);
    setMessage(null);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-accent-purple" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-center text-sm text-red-400">
        {error || "Failed to load experiments."}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-serif text-xl font-bold text-text-primary">Experiment Scorecard</h2>
          <p className="mt-1 max-w-3xl text-sm text-text-muted">
            Treat experiments as decision assets, not a loose registry. This surface shows signal
            quality, guardrail health, review rigor, and which tests are ready to ship, risky to
            stop, or still too weak to trust.
          </p>
        </div>
        <button
          onClick={() => {
            setShowForm((current) => !current);
            if (showForm) {
              setEditingId(null);
              setForm(emptyForm());
            }
            setMessage(null);
          }}
          className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-text-primary transition hover:bg-white/10"
        >
          {showForm ? "Cancel" : editingId ? "Edit Experiment" : "New Experiment"}
        </button>
      </div>

      {message && (
        <div
          className={`rounded-xl border p-4 text-sm ${
            message.type === "success"
              ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-300"
              : "border-red-500/20 bg-red-500/5 text-red-300"
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-8">
        <SummaryCard label="Total" value={data.summary.total} />
        <SummaryCard label="Active" value={data.summary.active} tone="emerald" />
        <SummaryCard label="Completed" value={data.summary.completed} tone="cyan" />
        <SummaryCard label="Decision Due" value={data.summary.pendingDecision} tone="amber" />
        <SummaryCard label="Ready" value={data.summary.readyForDecision} tone="emerald" />
        <SummaryCard label="Guardrail Risk" value={data.summary.guardrailRisks} tone="red" />
        <SummaryCard label="High Confidence" value={data.summary.highConfidence} tone="cyan" />
        <SummaryCard label="Blindspots" value={data.summary.blindspots} tone="slate" />
      </div>

      <EmbeddedIntelligencePanel surface="experiments" days={30} title="Experiment Copilot" />
      <EmbeddedIntelligencePanel
        endpoint="/api/admin/experiment-strategy"
        surface="experiments"
        days={30}
        title="Experiment Strategy Intelligence"
      />
      <EmbeddedIntelligencePanel
        endpoint="/api/admin/optimization-intelligence"
        surface="experiments"
        days={30}
        title="Experiment Optimization Intelligence"
      />
      <AdminSimulationPanel surface="experiments" days={30} title="Experiment Scenarios" />

      <div className="grid gap-4 xl:grid-cols-3">
        <ScorecardColumn
          title={scorecardTitle("ready")}
          description={scorecardDescription("ready")}
          tone="good"
          items={data.scorecard.readyQueue}
        />
        <ScorecardColumn
          title={scorecardTitle("risk")}
          description={scorecardDescription("risk")}
          tone="risk"
          items={data.scorecard.riskQueue}
        />
        <ScorecardColumn
          title={scorecardTitle("weak")}
          description={scorecardDescription("weak")}
          tone="watch"
          items={data.scorecard.weakSignalQueue}
        />
      </div>

      {showForm && (
        <div className="grid gap-4 rounded-xl border border-white/10 bg-surface p-5 lg:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs text-text-muted">Name</label>
            <input
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-text-primary focus:border-white/20 focus:outline-none"
              placeholder="Homepage pricing test"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-text-muted">Status</label>
            <select
              value={form.status}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  status: event.target.value as ExperimentStatus,
                }))
              }
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-text-primary focus:border-white/20 focus:outline-none"
            >
              {(["draft", "active", "paused", "completed", "archived"] as ExperimentStatus[]).map(
                (status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                )
              )}
            </select>
          </div>
          <div className="lg:col-span-2">
            <label className="mb-1 block text-xs text-text-muted">Hypothesis</label>
            <textarea
              value={form.hypothesis}
              onChange={(event) =>
                setForm((current) => ({ ...current, hypothesis: event.target.value }))
              }
              className="min-h-24 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-text-primary focus:border-white/20 focus:outline-none"
              placeholder="If we simplify the intro framing, more users will start and finish the survey."
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-text-muted">Primary Metric</label>
            <select
              value={form.primary_metric_key}
              onChange={(event) =>
                setForm((current) => ({ ...current, primary_metric_key: event.target.value }))
              }
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-text-primary focus:border-white/20 focus:outline-none"
            >
              <option value="">Select metric</option>
              {data.metrics.map((metric) => (
                <option key={metric.key} value={metric.key}>
                  {metric.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-text-muted">Segment</label>
            <select
              value={form.segment_id}
              onChange={(event) =>
                setForm((current) => ({ ...current, segment_id: event.target.value }))
              }
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-text-primary focus:border-white/20 focus:outline-none"
            >
              <option value="">All / not specified</option>
              {data.segments.map((segment) => (
                <option key={segment.id} value={segment.id}>
                  {segment.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-text-muted">Owner Email</label>
            <input
              type="email"
              value={form.owner_email}
              onChange={(event) =>
                setForm((current) => ({ ...current, owner_email: event.target.value }))
              }
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-text-primary focus:border-white/20 focus:outline-none"
              placeholder="owner@example.com"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-text-muted">Guardrails</label>
            <select
              multiple
              value={form.guardrail_metric_keys}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  guardrail_metric_keys: Array.from(event.target.selectedOptions).map(
                    (option) => option.value
                  ),
                }))
              }
              className="min-h-28 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-text-primary focus:border-white/20 focus:outline-none"
            >
              {data.metrics.map((metric) => (
                <option key={metric.key} value={metric.key}>
                  {metric.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-text-muted">Start Date</label>
            <input
              type="date"
              value={form.start_date}
              onChange={(event) =>
                setForm((current) => ({ ...current, start_date: event.target.value }))
              }
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-text-primary focus:border-white/20 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-text-muted">Decision Date</label>
            <input
              type="date"
              value={form.decision_date}
              onChange={(event) =>
                setForm((current) => ({ ...current, decision_date: event.target.value }))
              }
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-text-primary focus:border-white/20 focus:outline-none"
            />
          </div>
          <div className="lg:col-span-2">
            <label className="mb-1 block text-xs text-text-muted">Expected Impact</label>
            <textarea
              value={form.expected_impact}
              onChange={(event) =>
                setForm((current) => ({ ...current, expected_impact: event.target.value }))
              }
              className="min-h-20 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-text-primary focus:border-white/20 focus:outline-none"
              placeholder="Expected to improve activation without hurting downstream quality."
            />
          </div>
          <div className="lg:col-span-2">
            <label className="mb-1 block text-xs text-text-muted">Result Summary</label>
            <textarea
              value={form.result_summary}
              onChange={(event) =>
                setForm((current) => ({ ...current, result_summary: event.target.value }))
              }
              className="min-h-20 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-text-primary focus:border-white/20 focus:outline-none"
              placeholder="What happened once the test ran?"
            />
          </div>
          <div className="lg:col-span-2">
            <label className="mb-1 block text-xs text-text-muted">Outcome</label>
            <textarea
              value={form.outcome}
              onChange={(event) =>
                setForm((current) => ({ ...current, outcome: event.target.value }))
              }
              className="min-h-20 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-text-primary focus:border-white/20 focus:outline-none"
              placeholder="Ship, iterate, roll back, or archive with notes."
            />
          </div>
          <div className="lg:col-span-2 rounded-xl border border-white/10 bg-white/5 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-text-muted">
                  Statistical Readout
                </p>
                <p className="mt-1 text-sm text-text-muted">{readoutCopy.summary}</p>
              </div>
              <select
                value={form.readout_method}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    readout_method: event.target.value as ReadoutMethod,
                  }))
                }
                className="rounded-lg border border-white/10 bg-surface px-3 py-2 text-sm text-text-primary focus:border-white/20 focus:outline-none"
              >
                {READOUT_METHOD_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              {READOUT_METHOD_OPTIONS.map((option) => (
                <div
                  key={option.value}
                  className={`rounded-lg border px-3 py-3 text-sm ${
                    form.readout_method === option.value
                      ? "border-white/20 bg-surface text-text-primary"
                      : "border-white/10 bg-black/10 text-text-muted"
                  }`}
                >
                  <p className="font-medium">{option.label}</p>
                  <p className="mt-1 text-xs opacity-80">{option.detail}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {form.readout_method !== "count-delta" && (
                <>
                  <div>
                    <label className="mb-1 block text-xs text-text-muted">Control Sample</label>
                    <input
                      type="number"
                      min={0}
                      value={form.control_sample_size}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          control_sample_size: event.target.value,
                        }))
                      }
                      className="w-full rounded-lg border border-white/10 bg-surface px-3 py-2 text-sm text-text-primary focus:border-white/20 focus:outline-none"
                      placeholder="500"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-text-muted">
                      {readoutCopy.controlPrimaryLabel}
                    </label>
                    <input
                      type="number"
                      min={0}
                      step={form.readout_method === "average-value" ? "0.01" : "1"}
                      value={
                        form.readout_method === "average-value"
                          ? form.control_metric_value
                          : form.control_success_count
                      }
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          [form.readout_method === "average-value"
                            ? "control_metric_value"
                            : "control_success_count"]: event.target.value,
                        }))
                      }
                      className="w-full rounded-lg border border-white/10 bg-surface px-3 py-2 text-sm text-text-primary focus:border-white/20 focus:outline-none"
                      placeholder={readoutCopy.primaryPlaceholders[0]}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-text-muted">Variant Sample</label>
                    <input
                      type="number"
                      min={0}
                      value={form.variant_sample_size}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          variant_sample_size: event.target.value,
                        }))
                      }
                      className="w-full rounded-lg border border-white/10 bg-surface px-3 py-2 text-sm text-text-primary focus:border-white/20 focus:outline-none"
                      placeholder="520"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-text-muted">
                      {readoutCopy.variantPrimaryLabel}
                    </label>
                    <input
                      type="number"
                      min={0}
                      step={form.readout_method === "average-value" ? "0.01" : "1"}
                      value={
                        form.readout_method === "average-value"
                          ? form.variant_metric_value
                          : form.variant_success_count
                      }
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          [form.readout_method === "average-value"
                            ? "variant_metric_value"
                            : "variant_success_count"]: event.target.value,
                        }))
                      }
                      className="w-full rounded-lg border border-white/10 bg-surface px-3 py-2 text-sm text-text-primary focus:border-white/20 focus:outline-none"
                      placeholder={readoutCopy.primaryPlaceholders[1]}
                    />
                  </div>
                </>
              )}
              {form.readout_method === "average-value" && (
                <>
                  <div>
                    <label className="mb-1 block text-xs text-text-muted">
                      {readoutCopy.controlSecondaryLabel}
                    </label>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={form.control_stddev_value}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          control_stddev_value: event.target.value,
                        }))
                      }
                      className="w-full rounded-lg border border-white/10 bg-surface px-3 py-2 text-sm text-text-primary focus:border-white/20 focus:outline-none"
                      placeholder={readoutCopy.secondaryPlaceholders[0]}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-text-muted">
                      {readoutCopy.variantSecondaryLabel}
                    </label>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={form.variant_stddev_value}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          variant_stddev_value: event.target.value,
                        }))
                      }
                      className="w-full rounded-lg border border-white/10 bg-surface px-3 py-2 text-sm text-text-primary focus:border-white/20 focus:outline-none"
                      placeholder={readoutCopy.secondaryPlaceholders[1]}
                    />
                  </div>
                </>
              )}
              {form.readout_method === "count-delta" && (
                <>
                  <div>
                    <label className="mb-1 block text-xs text-text-muted">
                      {readoutCopy.controlPrimaryLabel}
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={form.control_success_count}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          control_success_count: event.target.value,
                        }))
                      }
                      className="w-full rounded-lg border border-white/10 bg-surface px-3 py-2 text-sm text-text-primary focus:border-white/20 focus:outline-none"
                      placeholder={readoutCopy.primaryPlaceholders[0]}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-text-muted">
                      {readoutCopy.variantPrimaryLabel}
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={form.variant_success_count}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          variant_success_count: event.target.value,
                        }))
                      }
                      className="w-full rounded-lg border border-white/10 bg-surface px-3 py-2 text-sm text-text-primary focus:border-white/20 focus:outline-none"
                      placeholder={readoutCopy.primaryPlaceholders[1]}
                    />
                  </div>
                </>
              )}
            </div>
            <div className="mt-4">
              <label className="mb-1 block text-xs text-text-muted">Readout Notes</label>
              <textarea
                value={form.readout_notes}
                onChange={(event) =>
                  setForm((current) => ({ ...current, readout_notes: event.target.value }))
                }
                className="min-h-20 w-full rounded-lg border border-white/10 bg-surface px-3 py-2 text-sm text-text-primary focus:border-white/20 focus:outline-none"
                placeholder="Any exclusions, rollout caveats, or measurement concerns."
              />
            </div>
          </div>
          <div className="lg:col-span-2 flex justify-end gap-3">
            <button
              onClick={() => {
                setShowForm(false);
                setEditingId(null);
                setForm(emptyForm());
              }}
              className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-text-primary transition hover:bg-white/10"
            >
              Cancel
            </button>
            <button
              onClick={() => void submitForm()}
              disabled={
                saving || !form.name.trim() || !form.hypothesis.trim() || !form.primary_metric_key
              }
              className="rounded-lg bg-accent-purple px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-purple/80 disabled:opacity-40"
            >
              {saving ? "Saving..." : editingId ? "Save Changes" : "Create Experiment"}
            </button>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-white/10 bg-surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-text-primary">Registry Table</h3>
          <div className="flex flex-wrap gap-2">
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as ExperimentStatus | "all")}
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-text-primary focus:border-white/20 focus:outline-none"
            >
              <option value="all">All statuses</option>
              <option value="draft">Draft</option>
              <option value="active">Active</option>
              <option value="paused">Paused</option>
              <option value="completed">Completed</option>
              <option value="archived">Archived</option>
            </select>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search experiments..."
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-text-primary placeholder:text-text-muted/50 focus:border-white/20 focus:outline-none"
            />
          </div>
        </div>
        <div className="mt-4">
          <KpiDataTable
            data={filtered}
            columns={columns}
            defaultSortKey="confidenceScore"
            defaultSortDir="desc"
          />
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {filtered.map((experiment) => (
          <ExperimentCard
            key={experiment.id}
            experiment={experiment}
            busy={saving}
            onDelete={deleteExperiment}
            onEdit={editExperiment}
            onQueueReview={queueReview}
          />
        ))}
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "emerald" | "cyan" | "amber" | "red" | "slate";
}) {
  const classes =
    tone === "emerald"
      ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
      : tone === "cyan"
        ? "border-cyan-500/20 bg-cyan-500/10 text-cyan-300"
        : tone === "amber"
          ? "border-amber-500/20 bg-amber-500/10 text-amber-200"
          : tone === "red"
            ? "border-red-500/20 bg-red-500/10 text-red-300"
            : tone === "slate"
              ? "border-white/10 bg-white/5 text-text-muted"
              : "border-white/10 bg-white/5 text-text-primary";

  return (
    <div className={`rounded-xl border p-4 ${classes}`}>
      <p className="text-xs font-medium uppercase tracking-wider">{label}</p>
      <p className="mt-2 text-2xl font-bold">{value}</p>
    </div>
  );
}

function ScorecardColumn({
  title,
  description,
  tone,
  items,
}: {
  title: string;
  description: string;
  tone: ExperimentTone;
  items: Experiment[];
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-surface p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
          <p className="mt-1 text-sm text-text-muted">{description}</p>
        </div>
        <span
          className={`rounded-full px-2 py-1 text-[11px] uppercase tracking-wide ${DECISION_CLASSES[tone]}`}
        >
          {items.length}
        </span>
      </div>

      <div className="mt-4 space-y-3">
        {items.length === 0 && (
          <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-4 text-sm text-text-muted">
            No experiments in this queue right now.
          </div>
        )}
        {items.map((experiment) => (
          <div key={experiment.id} className="rounded-lg border border-white/10 bg-white/5 p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-text-primary">{experiment.name}</p>
                <p className="mt-1 text-xs text-text-muted">{experiment.primary_metric_label}</p>
              </div>
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] uppercase tracking-wide ${DECISION_CLASSES[experiment.decisionTone]}`}
              >
                {experiment.decisionLabel}
              </span>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              <MiniMetric label="Confidence" value={`${experiment.confidenceScore}%`} />
              <MiniMetric
                label="Decision"
                value={formatDecisionCountdown(experiment.daysToDecision)}
              />
              <MiniMetric
                label="Readout"
                value={experiment.readout.isReady ? experiment.readout.winnerLabel : "Missing"}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ExperimentCard({
  experiment,
  busy,
  onEdit,
  onDelete,
  onQueueReview,
}: {
  experiment: Experiment;
  busy: boolean;
  onEdit: (experiment: Experiment) => void;
  onDelete: (id: number) => void;
  onQueueReview: (experiment: Experiment) => void;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] uppercase tracking-wide ${STATUS_CLASSES[experiment.status]}`}
            >
              {experiment.status}
            </span>
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] uppercase tracking-wide ${DECISION_CLASSES[experiment.decisionTone]}`}
            >
              {experiment.decisionLabel}
            </span>
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] uppercase tracking-wide ${CONFIDENCE_CLASSES[experiment.confidence]}`}
            >
              {experiment.confidence} confidence
            </span>
            {experiment.segment_name && (
              <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] uppercase tracking-wide text-text-muted">
                {experiment.segment_name}
              </span>
            )}
          </div>
          <p className="mt-2 text-lg font-semibold text-text-primary">{experiment.name}</p>
          <p className="mt-1 text-sm text-text-muted">{experiment.hypothesis}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => onQueueReview(experiment)}
            disabled={busy}
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-text-primary transition hover:bg-white/10 disabled:opacity-40"
          >
            Queue Review
          </button>
          <button
            onClick={() => onEdit(experiment)}
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-text-primary transition hover:bg-white/10"
          >
            Edit
          </button>
          <button
            onClick={() => onDelete(experiment.id)}
            disabled={busy}
            className="rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-sm text-red-300 transition hover:bg-red-500/10 disabled:opacity-40"
          >
            Delete
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Primary metric" value={experiment.primary_metric_label} />
        <MetricCard label="Current" value={experiment.primaryMetric.currentLabel} />
        <MetricCard
          label="Decision date"
          value={experiment.decision_date ?? "Not scheduled"}
          meta={formatDecisionCountdown(experiment.daysToDecision)}
        />
        <MetricCard
          label="Open reviews"
          value={String(experiment.openReviewCount)}
          meta={
            experiment.overdueReviewCount > 0
              ? `${experiment.overdueReviewCount} overdue`
              : "No overdue review"
          }
        />
      </div>

      <div className="mt-4 grid gap-3 xl:grid-cols-2">
        <MetricSignalCard
          title="Primary Metric Health"
          signal={experiment.primaryMetric}
          emphasis={`${experiment.confidenceScore}% confidence`}
        />
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-text-muted">Guardrails</p>
              <p className="mt-1 text-sm text-text-muted">
                {experiment.guardrails.length > 0
                  ? "Guardrail safety checks tied to the experiment."
                  : "No guardrails configured yet."}
              </p>
            </div>
            <span className="text-sm font-medium text-text-primary">
              {experiment.guardrailRiskCount} at risk
            </span>
          </div>

          <div className="mt-4 space-y-3">
            {experiment.guardrails.length === 0 && (
              <div className="rounded-lg border border-dashed border-white/10 px-3 py-4 text-sm text-text-muted">
                Add at least one guardrail metric so this experiment can detect unsafe tradeoffs.
              </div>
            )}
            {experiment.guardrails.map((guardrail) => (
              <div
                key={guardrail.key}
                className={`rounded-lg border px-3 py-3 ${METRIC_STATUS_CLASSES[guardrail.status]}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">{guardrail.label}</p>
                    <p className="mt-1 text-xs opacity-80">{guardrail.currentLabel}</p>
                  </div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] uppercase tracking-wide ${REVIEW_STATUS_CLASSES[guardrail.reviewStatus]}`}
                  >
                    {metricReviewLabel(guardrail.reviewStatus)}
                  </span>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <MiniMetric label="Target" value={guardrail.targetLabel ?? "Not set"} />
                  <MiniMetric label="Warning" value={guardrail.warningLabel ?? "Not set"} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <MetricCard
          label="Owner"
          value={experiment.owner_email ?? "Unassigned"}
          meta={experiment.start_date ?? "No start date"}
        />
        <MetricCard
          label="Blindspots"
          value={String(experiment.blindspotCount)}
          meta={experiment.confidenceDetail}
        />
        <MetricCard
          label="Decision state"
          value={experiment.decisionLabel}
          meta={experiment.decisionDetail}
        />
      </div>

      <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-text-muted">Readout Confidence</p>
            <p className="mt-1 text-sm text-text-muted">
              Statistical comparison between control and variant using the{" "}
              {experiment.readout.methodLabel.toLowerCase()} convention.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] uppercase tracking-wide text-text-muted">
              {experiment.readout.methodLabel}
            </span>
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] uppercase tracking-wide ${significanceClasses(
                experiment.readout.significance
              )}`}
            >
              {experiment.readout.significanceLabel}
            </span>
            <span className="rounded-full bg-cyan-500/10 px-2 py-0.5 text-[11px] uppercase tracking-wide text-cyan-300">
              {experiment.readout.winnerConfidenceLabel} winner confidence
            </span>
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Control"
            value={experiment.readout.controlRateLabel ?? "Not entered"}
            meta={experiment.readout.controlMetaLabel ?? undefined}
          />
          <MetricCard
            label="Variant"
            value={experiment.readout.variantRateLabel ?? "Not entered"}
            meta={experiment.readout.variantMetaLabel ?? undefined}
          />
          <MetricCard
            label="Observed Delta"
            value={experiment.readout.deltaLabel ?? "-"}
            meta={experiment.readout.ciLabel ?? undefined}
          />
          <MetricCard
            label="Winner"
            value={experiment.readout.winnerLabel}
            meta={`${experiment.readout.winnerConfidenceLabel} confidence${
              experiment.readout.pValue != null ? ` · p=${experiment.readout.pValue}` : ""
            }`}
          />
        </div>

        <div className="mt-4 rounded-lg border border-white/10 bg-surface px-3 py-3 text-sm text-text-muted">
          <p>{experiment.readout.summary}</p>
          {experiment.readout.winnerDetail && (
            <p className="mt-2 text-xs text-text-muted">{experiment.readout.winnerDetail}</p>
          )}
        </div>

        {experiment.readout.notes && (
          <div className="mt-4 rounded-lg border border-white/10 bg-surface px-3 py-3 text-sm text-text-muted">
            {experiment.readout.notes}
          </div>
        )}
      </div>

      {(experiment.expected_impact || experiment.result_summary || experiment.outcome) && (
        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          <NarrativeCard label="Expected Impact" value={experiment.expected_impact} />
          <NarrativeCard label="Result Summary" value={experiment.result_summary} />
          <NarrativeCard label="Outcome" value={experiment.outcome} />
        </div>
      )}

      <AdminCommentsThread
        resourceType="experiment"
        resourceId={experiment.id}
        title="Experiment Discussion"
      />
    </div>
  );
}

function MetricCard({ label, value, meta }: { label: string; value: string; meta?: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-3">
      <p className="text-xs uppercase tracking-wide text-text-muted">{label}</p>
      <p className="mt-1 text-sm font-medium text-text-primary">{value}</p>
      {meta && <p className="mt-2 text-xs text-text-muted">{meta}</p>}
    </div>
  );
}

function MetricSignalCard({
  title,
  signal,
  emphasis,
}: {
  title: string;
  signal: MetricSignal;
  emphasis?: string;
}) {
  return (
    <div className={`rounded-xl border p-4 ${METRIC_STATUS_CLASSES[signal.status]}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide opacity-80">{title}</p>
          <p className="mt-1 text-lg font-semibold">{signal.label}</p>
          <p className="mt-2 text-sm opacity-80">{signal.description}</p>
        </div>
        {emphasis && <span className="text-sm font-medium">{emphasis}</span>}
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MiniMetric label="Current" value={signal.currentLabel} />
        <MiniMetric label="Target" value={signal.targetLabel ?? "Not set"} />
        <MiniMetric label="Warning" value={signal.warningLabel ?? "Not set"} />
        <MiniMetric label="Trust" value={signal.trustMode ?? "Not documented"} />
      </div>
      {signal.trustNote && (
        <p className="mt-4 rounded-lg border border-white/10 bg-black/10 px-3 py-3 text-sm">
          {signal.trustNote}
        </p>
      )}
      <div className="mt-4 flex items-center justify-between gap-3 text-xs opacity-80">
        <span>{metricReviewLabel(signal.reviewStatus)}</span>
        <a href={signal.href} className="text-cyan-300 transition hover:text-cyan-200">
          Open metric
        </a>
      </div>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/10 px-3 py-3">
      <p className="text-[11px] uppercase tracking-wide opacity-70">{label}</p>
      <p className="mt-1 text-sm font-medium">{value}</p>
    </div>
  );
}

function NarrativeCard({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;

  return (
    <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-3">
      <p className="text-xs uppercase tracking-wide text-text-muted">{label}</p>
      <p className="mt-1 text-sm text-text-primary">{value}</p>
    </div>
  );
}
