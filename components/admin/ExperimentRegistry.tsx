"use client";

import { startTransition, useMemo, useState } from "react";
import { useAdminFetch } from "@/components/admin/hooks/useAdminFetch";
import KpiDataTable, { type Column } from "@/components/admin/kpi-tabs/KpiDataTable";
import { getCsrfToken } from "@/lib/csrf-client";

type ExperimentStatus = "draft" | "active" | "paused" | "completed" | "archived";

interface MetricOption {
  key: string;
  label: string;
  description: string;
  href: string;
}

interface Experiment {
  id: number;
  name: string;
  hypothesis: string;
  owner_email: string | null;
  segment_id: number | null;
  segment_name: string | null;
  primary_metric_key: string;
  guardrail_metric_keys: string[];
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
}

interface SegmentOption {
  id: number;
  name: string;
}

interface ExperimentsData {
  summary: {
    total: number;
    active: number;
    completed: number;
    pendingDecision: number;
  };
  experiments: Experiment[];
  segments: SegmentOption[];
  metrics: MetricOption[];
}

const statusClasses: Record<ExperimentStatus, string> = {
  draft: "bg-white/10 text-text-muted",
  active: "bg-emerald-500/10 text-emerald-300",
  paused: "bg-amber-500/10 text-amber-200",
  completed: "bg-cyan-500/10 text-cyan-300",
  archived: "bg-red-500/10 text-red-300",
};

const columns: Column<Experiment>[] = [
  { key: "name", label: "Experiment" },
  { key: "status", label: "Status" },
  { key: "primary_metric_key", label: "Metric" },
  { key: "segment_name", label: "Segment" },
  { key: "metric_value", label: "Current", align: "right" },
  { key: "decision_date", label: "Decision" },
];

export default function ExperimentRegistry() {
  const { data, loading, error, refetch } =
    useAdminFetch<ExperimentsData>("/api/admin/experiments");
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [statusFilter, setStatusFilter] = useState<ExperimentStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({
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
  });

  const filtered = useMemo(() => {
    const experiments = data?.experiments ?? [];
    const needle = search.trim().toLowerCase();
    return experiments.filter((experiment) => {
      if (statusFilter !== "all" && experiment.status !== statusFilter) return false;
      if (!needle) return true;
      return (
        experiment.name.toLowerCase().includes(needle) ||
        experiment.hypothesis.toLowerCase().includes(needle) ||
        experiment.primary_metric_key.toLowerCase().includes(needle) ||
        (experiment.segment_name ?? "").toLowerCase().includes(needle)
      );
    });
  }, [data, search, statusFilter]);

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

  async function submitForm() {
    if (!form.name.trim() || !form.hypothesis.trim() || !form.primary_metric_key) return;
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
      };

      const res = await fetch("/api/admin/experiments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": getCsrfToken(),
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error((body as { error?: string } | null)?.error || "Failed to save experiment.");
      }

      setMessage({
        type: "success",
        text: editingId ? `Updated experiment #${editingId}.` : "Experiment created.",
      });
      setForm({
        name: "",
        hypothesis: "",
        owner_email: "",
        segment_id: "",
        primary_metric_key: "",
        guardrail_metric_keys: [],
        status: "draft",
        start_date: "",
        decision_date: "",
        expected_impact: "",
        result_summary: "",
        outcome: "",
      });
      setEditingId(null);
      setShowForm(false);
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
      const res = await fetch("/api/admin/experiments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": getCsrfToken(),
        },
        body: JSON.stringify({ action: "delete", experimentId: id }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
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
    });
    setShowForm(true);
    setMessage(null);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-serif text-xl font-bold text-text-primary">Experiment Registry</h2>
          <p className="mt-1 text-sm text-text-muted">
            Track hypotheses, exposed segments, primary metrics, guardrails, and decision dates in
            one operating surface.
          </p>
        </div>
        <button
          onClick={() => {
            setShowForm((value) => !value);
            if (showForm) setEditingId(null);
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

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Total" value={data.summary.total} />
        <SummaryCard label="Active" value={data.summary.active} tone="emerald" />
        <SummaryCard label="Completed" value={data.summary.completed} tone="cyan" />
        <SummaryCard label="Decision Due" value={data.summary.pendingDecision} tone="amber" />
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
              placeholder="Expected to improve start and completion conversion without hurting report engagement."
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
          <div className="lg:col-span-2 flex justify-end gap-3">
            <button
              onClick={() => {
                setShowForm(false);
                setEditingId(null);
              }}
              className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-text-primary transition hover:bg-white/10"
            >
              Cancel
            </button>
            <button
              onClick={submitForm}
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
              onChange={(event) =>
                startTransition(() =>
                  setStatusFilter(event.target.value as ExperimentStatus | "all")
                )
              }
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
            defaultSortKey="updated_at"
            defaultSortDir="desc"
          />
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {filtered.map((experiment) => (
          <div key={experiment.id} className="rounded-xl border border-white/10 bg-surface p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] uppercase tracking-wide ${statusClasses[experiment.status]}`}
                  >
                    {experiment.status}
                  </span>
                  <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] uppercase tracking-wide text-text-muted">
                    {experiment.primary_metric_key}
                  </span>
                  {experiment.segment_name && (
                    <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] uppercase tracking-wide text-text-muted">
                      {experiment.segment_name}
                    </span>
                  )}
                </div>
                <p className="mt-2 text-lg font-semibold text-text-primary">{experiment.name}</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => editExperiment(experiment)}
                  className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-text-primary transition hover:bg-white/10"
                >
                  Edit
                </button>
                <button
                  onClick={() => deleteExperiment(experiment.id)}
                  className="rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-sm text-red-300 transition hover:bg-red-500/10"
                >
                  Delete
                </button>
              </div>
            </div>
            <p className="mt-3 text-sm text-text-muted">{experiment.hypothesis}</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                label="Current metric"
                value={experiment.metric_value == null ? "—" : String(experiment.metric_value)}
              />
              <MetricCard label="Owner" value={experiment.owner_email ?? "Unassigned"} />
              <MetricCard label="Start" value={experiment.start_date ?? "TBD"} />
              <MetricCard label="Decision" value={experiment.decision_date ?? "TBD"} />
            </div>
            {experiment.guardrail_metric_keys.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {experiment.guardrail_metric_keys.map((guardrail) => (
                  <span
                    key={guardrail}
                    className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-text-muted"
                  >
                    guardrail: {guardrail}
                  </span>
                ))}
              </div>
            )}
            {(experiment.expected_impact || experiment.result_summary || experiment.outcome) && (
              <div className="mt-4 grid gap-3 lg:grid-cols-3">
                {experiment.expected_impact && (
                  <NarrativeCard label="Expected Impact" value={experiment.expected_impact} />
                )}
                {experiment.result_summary && (
                  <NarrativeCard label="Result Summary" value={experiment.result_summary} />
                )}
                {experiment.outcome && <NarrativeCard label="Outcome" value={experiment.outcome} />}
              </div>
            )}
          </div>
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
  tone?: "default" | "emerald" | "cyan" | "amber";
}) {
  const classes =
    tone === "emerald"
      ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
      : tone === "cyan"
        ? "border-cyan-500/20 bg-cyan-500/10 text-cyan-300"
        : tone === "amber"
          ? "border-amber-500/20 bg-amber-500/10 text-amber-200"
          : "border-white/10 bg-white/5 text-text-primary";
  return (
    <div className={`rounded-xl border p-4 ${classes}`}>
      <p className="text-xs font-medium uppercase tracking-wider">{label}</p>
      <p className="mt-2 text-2xl font-bold">{value}</p>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-3">
      <p className="text-xs uppercase tracking-wide text-text-muted">{label}</p>
      <p className="mt-1 text-sm font-medium text-text-primary">{value}</p>
    </div>
  );
}

function NarrativeCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-3">
      <p className="text-xs uppercase tracking-wide text-text-muted">{label}</p>
      <p className="mt-1 text-sm text-text-primary">{value}</p>
    </div>
  );
}
