"use client";

import { useState } from "react";
import AdminCommentsThread from "@/components/admin/AdminCommentsThread";
import { useAdminFetch } from "@/components/admin/hooks/useAdminFetch";
import { getCsrfToken } from "@/lib/csrf-client";

type StewardshipRole = "strategy" | "product" | "growth" | "tech" | "ops";
type MetricUnit = "percent" | "minutes" | "count" | "currency" | "score";
type TrustMode = "live" | "derived" | "sampled" | "materialized";
type RegistryStatus = "draft" | "active" | "watch" | "deprecated";

interface MetricOption {
  key: string;
  label: string;
  description: string;
  href: string;
}

interface RegistryEntry {
  id: number;
  metric_key: string;
  label: string;
  description: string | null;
  owner_email: string | null;
  stewardship_role: StewardshipRole | null;
  formula: string | null;
  source_of_truth: string | null;
  review_cadence_days: number;
  last_reviewed_at: string | null;
  review_due_at: string | null;
  review_status: "fresh" | "due" | "overdue" | "never";
  unit: MetricUnit;
  linked_href: string;
  trust_mode: TrustMode;
  trust_note: string | null;
  caveats: string | null;
  status: RegistryStatus;
  current_value: number | null;
  current_value_label: string;
  metric_description: string;
  updated_at: string;
}

interface RegistryData {
  entries: RegistryEntry[];
  availableMetrics: MetricOption[];
  coverage: {
    totalMetrics: number;
    coveredMetrics: number;
    unownedMetrics: number;
    overdueReviews: number;
    activeMetrics: number;
  };
}

const ROLES: StewardshipRole[] = ["strategy", "product", "growth", "tech", "ops"];
const UNITS: MetricUnit[] = ["percent", "minutes", "count", "currency", "score"];
const TRUST_MODES: TrustMode[] = ["live", "derived", "sampled", "materialized"];
const STATUSES: RegistryStatus[] = ["draft", "active", "watch", "deprecated"];

function reviewBadge(status: RegistryEntry["review_status"]): string {
  if (status === "fresh") return "bg-emerald-500/10 text-emerald-300";
  if (status === "due") return "bg-amber-500/10 text-amber-200";
  if (status === "overdue") return "bg-red-500/10 text-red-300";
  return "bg-white/10 text-text-muted";
}

export default function MetricRegistryTab() {
  const { data, loading, error, refetch } = useAdminFetch<RegistryData>(
    "/api/admin/metric-registry"
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [form, setForm] = useState({
    metric_key: "",
    label: "",
    description: "",
    owner_email: "",
    stewardship_role: "strategy" as StewardshipRole,
    formula: "",
    source_of_truth: "",
    review_cadence_days: "30",
    unit: "count" as MetricUnit,
    linked_href: "",
    trust_mode: "derived" as TrustMode,
    trust_note: "",
    caveats: "",
    status: "active" as RegistryStatus,
  });

  function fillFromMetric(metricKey: string) {
    const metric = (data?.availableMetrics ?? []).find((item) => item.key === metricKey);
    setForm((current) => ({
      ...current,
      metric_key: metricKey,
      label: current.label || metric?.label || "",
      description: current.description || metric?.description || "",
      linked_href: current.linked_href || metric?.href || "",
    }));
  }

  async function createEntry() {
    if (!form.metric_key || !form.label.trim()) return;
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/metric-registry", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": getCsrfToken(),
        },
        body: JSON.stringify({
          action: "create",
          metric_key: form.metric_key,
          label: form.label.trim(),
          description: form.description.trim() || null,
          owner_email: form.owner_email.trim() || null,
          stewardship_role: form.stewardship_role,
          formula: form.formula.trim() || null,
          source_of_truth: form.source_of_truth.trim() || null,
          review_cadence_days: Number(form.review_cadence_days),
          unit: form.unit,
          linked_href: form.linked_href.trim() || null,
          trust_mode: form.trust_mode,
          trust_note: form.trust_note.trim() || null,
          caveats: form.caveats.trim() || null,
          status: form.status,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error((body as { error?: string } | null)?.error || "Failed to create metric.");
      }

      setForm({
        metric_key: "",
        label: "",
        description: "",
        owner_email: "",
        stewardship_role: "strategy",
        formula: "",
        source_of_truth: "",
        review_cadence_days: "30",
        unit: "count",
        linked_href: "",
        trust_mode: "derived",
        trust_note: "",
        caveats: "",
        status: "active",
      });
      setMessage({ type: "success", text: "Metric definition created." });
      refetch();
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Unknown error." });
    } finally {
      setSaving(false);
    }
  }

  async function updateEntry(id: number, patch: Record<string, unknown>, successText: string) {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/metric-registry", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": getCsrfToken(),
        },
        body: JSON.stringify({
          action: "update",
          registryId: id,
          ...patch,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error((body as { error?: string } | null)?.error || "Failed to update metric.");
      }
      setMessage({ type: "success", text: successText });
      refetch();
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Unknown error." });
    } finally {
      setSaving(false);
    }
  }

  async function markReviewed(id: number) {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/metric-registry", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": getCsrfToken(),
        },
        body: JSON.stringify({
          action: "review",
          registryId: id,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error((body as { error?: string } | null)?.error || "Failed to review metric.");
      }
      setMessage({ type: "success", text: "Metric marked as reviewed." });
      refetch();
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Unknown error." });
    } finally {
      setSaving(false);
    }
  }

  async function queueReview(entry: RegistryEntry) {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/reviews", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": getCsrfToken(),
        },
        body: JSON.stringify({
          title: `Review metric definition: ${entry.label}`,
          description: entry.description ?? entry.metric_description,
          resource_type: "metric-registry",
          resource_id: entry.id,
          linked_metric_key: entry.metric_key,
          impact_level: entry.status === "active" ? "high" : "medium",
          source_href: entry.linked_href,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(
          (body as { error?: string } | null)?.error || "Failed to queue review request."
        );
      }
      setMessage({ type: "success", text: `Queued review for metric #${entry.id}.` });
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Unknown error." });
    } finally {
      setSaving(false);
    }
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
        {error || "Failed to load metric registry."}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-serif text-xl font-bold text-text-primary">Metric Registry</h2>
        <p className="mt-1 text-sm text-text-muted">
          Canonical metric ownership, definitions, formulas, review cadence, and trust notes.
        </p>
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

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <SummaryTile
          label="Covered Metrics"
          value={`${data.coverage.coveredMetrics}/${data.coverage.totalMetrics}`}
        />
        <SummaryTile label="Active Metrics" value={String(data.coverage.activeMetrics)} />
        <SummaryTile label="Unowned" value={String(data.coverage.unownedMetrics)} />
        <SummaryTile label="Overdue Reviews" value={String(data.coverage.overdueReviews)} />
        <SummaryTile label="Gaps" value={String(data.availableMetrics.length)} />
      </div>

      <div className="grid gap-4 rounded-xl border border-white/10 bg-surface p-5 xl:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs text-text-muted">Metric</label>
          <select
            value={form.metric_key}
            onChange={(event) => fillFromMetric(event.target.value)}
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-text-primary focus:border-white/20 focus:outline-none"
          >
            <option value="">Select metric</option>
            {data.availableMetrics.map((metric) => (
              <option key={metric.key} value={metric.key}>
                {metric.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-text-muted">Label</label>
          <input
            value={form.label}
            onChange={(event) => setForm((current) => ({ ...current, label: event.target.value }))}
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-text-primary focus:border-white/20 focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-text-muted">Owner Email</label>
          <input
            value={form.owner_email}
            onChange={(event) =>
              setForm((current) => ({ ...current, owner_email: event.target.value }))
            }
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-text-primary focus:border-white/20 focus:outline-none"
            placeholder="owner@loveiq.com"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-text-muted">Stewardship Role</label>
          <select
            value={form.stewardship_role}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                stewardship_role: event.target.value as StewardshipRole,
              }))
            }
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-text-primary focus:border-white/20 focus:outline-none"
          >
            {ROLES.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-text-muted">Unit</label>
          <select
            value={form.unit}
            onChange={(event) =>
              setForm((current) => ({ ...current, unit: event.target.value as MetricUnit }))
            }
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-text-primary focus:border-white/20 focus:outline-none"
          >
            {UNITS.map((unit) => (
              <option key={unit} value={unit}>
                {unit}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-text-muted">Review Cadence (days)</label>
          <input
            type="number"
            value={form.review_cadence_days}
            onChange={(event) =>
              setForm((current) => ({ ...current, review_cadence_days: event.target.value }))
            }
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-text-primary focus:border-white/20 focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-text-muted">Trust Mode</label>
          <select
            value={form.trust_mode}
            onChange={(event) =>
              setForm((current) => ({ ...current, trust_mode: event.target.value as TrustMode }))
            }
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-text-primary focus:border-white/20 focus:outline-none"
          >
            {TRUST_MODES.map((mode) => (
              <option key={mode} value={mode}>
                {mode}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-text-muted">Status</label>
          <select
            value={form.status}
            onChange={(event) =>
              setForm((current) => ({ ...current, status: event.target.value as RegistryStatus }))
            }
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-text-primary focus:border-white/20 focus:outline-none"
          >
            {STATUSES.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </div>
        <div className="xl:col-span-2">
          <label className="mb-1 block text-xs text-text-muted">Source Of Truth</label>
          <input
            value={form.source_of_truth}
            onChange={(event) =>
              setForm((current) => ({ ...current, source_of_truth: event.target.value }))
            }
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-text-primary focus:border-white/20 focus:outline-none"
            placeholder="survey_submission + scoring_result RPC"
          />
        </div>
        <div className="xl:col-span-2">
          <label className="mb-1 block text-xs text-text-muted">Formula</label>
          <textarea
            value={form.formula}
            onChange={(event) =>
              setForm((current) => ({ ...current, formula: event.target.value }))
            }
            className="min-h-20 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-text-primary focus:border-white/20 focus:outline-none"
            placeholder="completed_submissions / started_submissions * 100"
          />
        </div>
        <div className="xl:col-span-2">
          <label className="mb-1 block text-xs text-text-muted">Definition</label>
          <textarea
            value={form.description}
            onChange={(event) =>
              setForm((current) => ({ ...current, description: event.target.value }))
            }
            className="min-h-20 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-text-primary focus:border-white/20 focus:outline-none"
          />
        </div>
        <div className="xl:col-span-2">
          <label className="mb-1 block text-xs text-text-muted">Trust Note</label>
          <textarea
            value={form.trust_note}
            onChange={(event) =>
              setForm((current) => ({ ...current, trust_note: event.target.value }))
            }
            className="min-h-20 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-text-primary focus:border-white/20 focus:outline-none"
            placeholder="Known caveats about freshness, derivation, or gaps."
          />
        </div>
        <div className="xl:col-span-2">
          <label className="mb-1 block text-xs text-text-muted">Caveats</label>
          <textarea
            value={form.caveats}
            onChange={(event) =>
              setForm((current) => ({ ...current, caveats: event.target.value }))
            }
            className="min-h-20 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-text-primary focus:border-white/20 focus:outline-none"
            placeholder="Edge cases, exclusions, or interpretation warnings."
          />
        </div>
        <div className="xl:col-span-2">
          <label className="mb-1 block text-xs text-text-muted">Admin Link</label>
          <input
            value={form.linked_href}
            onChange={(event) =>
              setForm((current) => ({ ...current, linked_href: event.target.value }))
            }
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-text-primary focus:border-white/20 focus:outline-none"
            placeholder="/admin/product-kpis"
          />
        </div>
        <div className="xl:col-span-2 flex justify-end">
          <button
            onClick={createEntry}
            disabled={saving || !form.metric_key || !form.label.trim()}
            className="rounded-lg bg-accent-purple px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-purple/80 disabled:opacity-40"
          >
            {saving ? "Saving..." : "Add Metric Definition"}
          </button>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {data.entries.map((entry) => (
          <div key={entry.id} className="rounded-xl border border-white/10 bg-surface p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] uppercase tracking-wide text-text-muted">
                    {entry.metric_key}
                  </span>
                  <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] uppercase tracking-wide text-text-muted">
                    {entry.stewardship_role ?? "unassigned"}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] uppercase tracking-wide ${reviewBadge(entry.review_status)}`}
                  >
                    {entry.review_status}
                  </span>
                </div>
                <p className="mt-2 text-lg font-semibold text-text-primary">{entry.label}</p>
                <p className="mt-1 text-sm text-text-muted">
                  {entry.description ?? entry.metric_description}
                </p>
              </div>
              <div className="text-right">
                <p className="font-serif text-2xl font-semibold text-text-primary">
                  {entry.current_value_label}
                </p>
                <p className="mt-1 text-xs text-text-muted">
                  {entry.owner_email || "No owner assigned"}
                </p>
                <div className="mt-3 flex justify-end gap-2">
                  <button
                    onClick={() => void queueReview(entry)}
                    disabled={saving}
                    className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-text-primary transition hover:bg-white/10 disabled:opacity-40"
                  >
                    Queue review
                  </button>
                  <button
                    onClick={() => void markReviewed(entry.id)}
                    disabled={saving}
                    className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-text-primary transition hover:bg-white/10 disabled:opacity-40"
                  >
                    Mark reviewed
                  </button>
                  <button
                    onClick={() =>
                      void updateEntry(
                        entry.id,
                        { status: entry.status === "deprecated" ? "active" : "deprecated" },
                        `Metric #${entry.id} ${entry.status === "deprecated" ? "reactivated" : "deprecated"}.`
                      )
                    }
                    disabled={saving}
                    className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-text-primary transition hover:bg-white/10 disabled:opacity-40"
                  >
                    {entry.status === "deprecated" ? "Reactivate" : "Deprecate"}
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <MetricMeta
                label="Source of truth"
                value={entry.source_of_truth ?? "Not documented"}
              />
              <MetricMeta label="Trust mode" value={entry.trust_mode} />
              <MetricMeta
                label="Last reviewed"
                value={
                  entry.last_reviewed_at
                    ? new Date(entry.last_reviewed_at).toLocaleDateString()
                    : "Never"
                }
              />
              <MetricMeta
                label="Review due"
                value={
                  entry.review_due_at
                    ? new Date(entry.review_due_at).toLocaleDateString()
                    : "Needs first review"
                }
              />
            </div>

            {entry.formula && (
              <div className="mt-4 rounded-lg border border-white/10 bg-white/5 px-3 py-3">
                <p className="text-xs uppercase tracking-wide text-text-muted">Formula</p>
                <p className="mt-1 text-sm text-text-primary">{entry.formula}</p>
              </div>
            )}
            {entry.trust_note && (
              <div className="mt-3 rounded-lg border border-white/10 bg-white/5 px-3 py-3">
                <p className="text-xs uppercase tracking-wide text-text-muted">Trust note</p>
                <p className="mt-1 text-sm text-text-primary">{entry.trust_note}</p>
              </div>
            )}
            {entry.caveats && (
              <div className="mt-3 rounded-lg border border-white/10 bg-white/5 px-3 py-3">
                <p className="text-xs uppercase tracking-wide text-text-muted">Caveats</p>
                <p className="mt-1 text-sm text-text-primary">{entry.caveats}</p>
              </div>
            )}
            <div className="mt-4 flex items-center justify-between gap-3">
              <span className="text-xs uppercase tracking-wide text-text-muted">
                {entry.status}
              </span>
              <a href={entry.linked_href} className="text-sm text-cyan-300 hover:text-cyan-200">
                Open metric view
              </a>
            </div>
            <AdminCommentsThread
              resourceType="metric-registry"
              resourceId={entry.id}
              title="Metric Discussion"
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-surface p-4">
      <p className="text-xs uppercase tracking-wide text-text-muted">{label}</p>
      <p className="mt-2 font-serif text-2xl font-semibold text-text-primary">{value}</p>
    </div>
  );
}

function MetricMeta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-3">
      <p className="text-xs uppercase tracking-wide text-text-muted">{label}</p>
      <p className="mt-1 text-sm font-medium text-text-primary">{value}</p>
    </div>
  );
}
