"use client";

import { useState } from "react";
import MetricImpactTab from "@features/admin/ui/MetricImpactTab";
import MetricLineageTab from "@features/admin/ui/MetricLineageTab";
import MetricRegistryTab from "@features/admin/ui/MetricRegistryTab";
import MetricStatusBoardTab from "@features/admin/ui/MetricStatusBoardTab";
import { useAdminFetch } from "@features/admin/ui/hooks/useAdminFetch";
import { getCsrfToken } from "@shared/http/csrf-client";

interface MetricOption {
  key: string;
  label: string;
  description: string;
  href: string;
}

interface Benchmark {
  id: number;
  metric_key: string;
  label: string;
  description: string | null;
  source_name: string;
  source_url: string | null;
  benchmark_type: "internal" | "category" | "competitive";
  target_value: number;
  warning_value: number;
  direction: "higher" | "lower";
  unit: "percent" | "minutes" | "count";
  is_active: boolean;
  current_value: number | null;
  created_at: string;
  updated_at: string;
}

interface BenchmarksData {
  benchmarks: Benchmark[];
  metrics: MetricOption[];
}

export default function BenchmarkRegistry() {
  const [activeTab, setActiveTab] = useState<
    "Metric Registry" | "Status & Leading" | "Metric Impact" | "Lineage & Trust" | "Benchmarks"
  >("Metric Registry");
  const tabs = [
    "Metric Registry",
    "Status & Leading",
    "Metric Impact",
    "Lineage & Trust",
    "Benchmarks",
  ] as const;
  const { data, loading, error, refetch } = useAdminFetch<BenchmarksData>("/api/admin/benchmarks");
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    metric_key: "",
    label: "",
    description: "",
    source_name: "",
    source_url: "",
    benchmark_type: "category" as "internal" | "category" | "competitive",
    target_value: "",
    warning_value: "",
    direction: "higher" as "higher" | "lower",
    unit: "percent" as "percent" | "minutes" | "count",
  });

  if (activeTab === "Metric Registry") {
    return (
      <div className="space-y-6">
        <div className="inline-flex rounded-lg border border-white/10 bg-surface p-1">
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`rounded-md px-4 py-2 text-sm font-medium transition ${
                activeTab === tab
                  ? "bg-white/10 text-text-primary"
                  : "text-text-muted hover:text-text-primary"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
        <MetricRegistryTab />
      </div>
    );
  }

  if (activeTab === "Status & Leading") {
    return (
      <div className="space-y-6">
        <div className="inline-flex rounded-lg border border-white/10 bg-surface p-1">
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`rounded-md px-4 py-2 text-sm font-medium transition ${
                activeTab === tab
                  ? "bg-white/10 text-text-primary"
                  : "text-text-muted hover:text-text-primary"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
        <MetricStatusBoardTab />
      </div>
    );
  }

  if (activeTab === "Metric Impact") {
    return (
      <div className="space-y-6">
        <div className="inline-flex rounded-lg border border-white/10 bg-surface p-1">
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`rounded-md px-4 py-2 text-sm font-medium transition ${
                activeTab === tab
                  ? "bg-white/10 text-text-primary"
                  : "text-text-muted hover:text-text-primary"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
        <MetricImpactTab />
      </div>
    );
  }

  if (activeTab === "Lineage & Trust") {
    return (
      <div className="space-y-6">
        <div className="inline-flex rounded-lg border border-white/10 bg-surface p-1">
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`rounded-md px-4 py-2 text-sm font-medium transition ${
                activeTab === tab
                  ? "bg-white/10 text-text-primary"
                  : "text-text-muted hover:text-text-primary"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
        <MetricLineageTab />
      </div>
    );
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
        {error || "Failed to load benchmarks."}
      </div>
    );
  }

  async function createBenchmark() {
    if (!form.metric_key || !form.label.trim() || !form.source_name.trim()) return;
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/benchmarks", {
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
          source_name: form.source_name.trim(),
          source_url: form.source_url.trim() || null,
          benchmark_type: form.benchmark_type,
          target_value: Number(form.target_value),
          warning_value: Number(form.warning_value),
          direction: form.direction,
          unit: form.unit,
          is_active: true,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(
          (body as { error?: string } | null)?.error || "Failed to create benchmark."
        );
      }
      setForm({
        metric_key: "",
        label: "",
        description: "",
        source_name: "",
        source_url: "",
        benchmark_type: "category",
        target_value: "",
        warning_value: "",
        direction: "higher",
        unit: "percent",
      });
      setMessage({ type: "success", text: "Benchmark created." });
      refetch();
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Unknown error." });
    } finally {
      setSaving(false);
    }
  }

  async function updateBenchmark(id: number, patch: Record<string, unknown>, successText: string) {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/benchmarks", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": getCsrfToken(),
        },
        body: JSON.stringify({
          action: "update",
          benchmarkId: id,
          ...patch,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(
          (body as { error?: string } | null)?.error || "Failed to update benchmark."
        );
      }
      setMessage({ type: "success", text: successText });
      refetch();
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Unknown error." });
    } finally {
      setSaving(false);
    }
  }

  async function deleteBenchmark(id: number) {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/benchmarks", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": getCsrfToken(),
        },
        body: JSON.stringify({
          action: "delete",
          benchmarkId: id,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(
          (body as { error?: string } | null)?.error || "Failed to delete benchmark."
        );
      }
      setMessage({ type: "success", text: `Deleted benchmark #${id}.` });
      refetch();
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Unknown error." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="inline-flex rounded-lg border border-white/10 bg-surface p-1">
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`rounded-md px-4 py-2 text-sm font-medium transition ${
              activeTab === tab
                ? "bg-white/10 text-text-primary"
                : "text-text-muted hover:text-text-primary"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>
      <div>
        <h2 className="font-serif text-xl font-bold text-text-primary">Benchmarks</h2>
        <p className="mt-1 text-sm text-text-muted">
          Store manual category and competitive reference points after the canonical metric
          definition is documented in the registry.
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

      <div className="grid gap-4 rounded-xl border border-white/10 bg-surface p-5 lg:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs text-text-muted">Metric</label>
          <select
            value={form.metric_key}
            onChange={(event) =>
              setForm((current) => ({ ...current, metric_key: event.target.value }))
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
          <label className="mb-1 block text-xs text-text-muted">Label</label>
          <input
            value={form.label}
            onChange={(event) => setForm((current) => ({ ...current, label: event.target.value }))}
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-text-primary focus:border-white/20 focus:outline-none"
            placeholder="Category completion benchmark"
          />
        </div>
        <div className="lg:col-span-2">
          <label className="mb-1 block text-xs text-text-muted">Description</label>
          <textarea
            value={form.description}
            onChange={(event) =>
              setForm((current) => ({ ...current, description: event.target.value }))
            }
            className="min-h-20 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-text-primary focus:border-white/20 focus:outline-none"
            placeholder="Explain what this benchmark represents and where it came from."
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-text-muted">Source Name</label>
          <input
            value={form.source_name}
            onChange={(event) =>
              setForm((current) => ({ ...current, source_name: event.target.value }))
            }
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-text-primary focus:border-white/20 focus:outline-none"
            placeholder="Internal market scan"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-text-muted">Source URL</label>
          <input
            value={form.source_url}
            onChange={(event) =>
              setForm((current) => ({ ...current, source_url: event.target.value }))
            }
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-text-primary focus:border-white/20 focus:outline-none"
            placeholder="https://..."
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-text-muted">Benchmark Type</label>
          <select
            value={form.benchmark_type}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                benchmark_type: event.target.value as "internal" | "category" | "competitive",
              }))
            }
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-text-primary focus:border-white/20 focus:outline-none"
          >
            <option value="internal">Internal</option>
            <option value="category">Category</option>
            <option value="competitive">Competitive</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-text-muted">Direction</label>
          <select
            value={form.direction}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                direction: event.target.value as "higher" | "lower",
              }))
            }
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-text-primary focus:border-white/20 focus:outline-none"
          >
            <option value="higher">Higher is better</option>
            <option value="lower">Lower is better</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-text-muted">Unit</label>
          <select
            value={form.unit}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                unit: event.target.value as "percent" | "minutes" | "count",
              }))
            }
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-text-primary focus:border-white/20 focus:outline-none"
          >
            <option value="percent">Percent</option>
            <option value="minutes">Minutes</option>
            <option value="count">Count</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-text-muted">Target Value</label>
          <input
            type="number"
            value={form.target_value}
            onChange={(event) =>
              setForm((current) => ({ ...current, target_value: event.target.value }))
            }
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-text-primary focus:border-white/20 focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-text-muted">Warning Value</label>
          <input
            type="number"
            value={form.warning_value}
            onChange={(event) =>
              setForm((current) => ({ ...current, warning_value: event.target.value }))
            }
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-text-primary focus:border-white/20 focus:outline-none"
          />
        </div>
        <div className="lg:col-span-2 flex justify-end">
          <button
            onClick={createBenchmark}
            disabled={saving || !form.metric_key || !form.label.trim() || !form.source_name.trim()}
            className="rounded-lg bg-accent-purple px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-purple/80 disabled:opacity-40"
          >
            {saving ? "Saving..." : "Add Benchmark"}
          </button>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {data.benchmarks.map((benchmark) => (
          <div key={benchmark.id} className="rounded-xl border border-white/10 bg-surface p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] uppercase tracking-wide text-text-muted">
                    {benchmark.benchmark_type}
                  </span>
                  <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] uppercase tracking-wide text-text-muted">
                    {benchmark.metric_key}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] uppercase tracking-wide ${
                      benchmark.is_active
                        ? "bg-emerald-500/10 text-emerald-300"
                        : "bg-white/10 text-text-muted"
                    }`}
                  >
                    {benchmark.is_active ? "active" : "inactive"}
                  </span>
                </div>
                <p className="mt-2 text-lg font-semibold text-text-primary">{benchmark.label}</p>
                <p className="mt-1 text-sm text-text-muted">
                  {benchmark.description ?? "No description provided."}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold text-text-primary">{benchmark.source_name}</p>
                {benchmark.source_url && (
                  <a
                    href={benchmark.source_url}
                    className="text-xs text-cyan-300 hover:text-cyan-200"
                  >
                    source link
                  </a>
                )}
                <div className="mt-3 flex justify-end gap-2">
                  <button
                    onClick={() =>
                      updateBenchmark(
                        benchmark.id,
                        { is_active: !benchmark.is_active },
                        `Benchmark #${benchmark.id} ${benchmark.is_active ? "retired" : "reactivated"}.`
                      )
                    }
                    className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-text-primary transition hover:bg-white/10"
                  >
                    {benchmark.is_active ? "Retire" : "Reactivate"}
                  </button>
                  <button
                    onClick={() => deleteBenchmark(benchmark.id)}
                    className="rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-xs text-red-300 transition hover:bg-red-500/10"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <BenchMetric
                label="Current"
                value={benchmark.current_value == null ? "—" : String(benchmark.current_value)}
              />
              <BenchMetric label="Target" value={String(benchmark.target_value)} />
              <BenchMetric label="Warning" value={String(benchmark.warning_value)} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function BenchMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-3">
      <p className="text-xs uppercase tracking-wide text-text-muted">{label}</p>
      <p className="mt-1 text-sm font-medium text-text-primary">{value}</p>
    </div>
  );
}
