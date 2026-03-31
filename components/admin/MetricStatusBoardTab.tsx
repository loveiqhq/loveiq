"use client";

import { useMemo, useState } from "react";
import AdminReviewRequestButton from "@/components/admin/AdminReviewRequestButton";
import StatCard from "@/components/admin/StatCard";
import { useAdminFetch } from "@/components/admin/hooks/useAdminFetch";
import { getCsrfToken } from "@/lib/csrf-client";
import type {
  MetricStatusBoardEntry,
  MetricStatusSnapshot,
  MetricStatusState,
} from "@/lib/admin/metric-status";

interface DraftState {
  status_state: MetricStatusState;
  status_reason: string;
  owner_email: string;
  review_due_at: string;
  leading_indicator_key: string;
  leading_indicator_note: string;
}

function statusClasses(state: MetricStatusState): string {
  if (state === "on-track") return "bg-emerald-500/10 text-emerald-300";
  if (state === "critical") return "bg-red-500/10 text-red-300";
  if (state === "off-track") return "bg-orange-500/10 text-orange-200";
  return "bg-amber-500/10 text-amber-200";
}

function reviewClasses(state: MetricStatusBoardEntry["reviewState"]): string {
  if (state === "fresh") return "bg-emerald-500/10 text-emerald-300";
  if (state === "overdue") return "bg-red-500/10 text-red-300";
  if (state === "due") return "bg-amber-500/10 text-amber-200";
  return "bg-white/10 text-text-muted";
}

function leadingSignalClasses(signalState: "positive" | "watch" | "negative"): string {
  if (signalState === "positive") return "bg-emerald-500/10 text-emerald-300";
  if (signalState === "negative") return "bg-red-500/10 text-red-300";
  return "bg-amber-500/10 text-amber-200";
}

function reviewImpactLevel(entry: MetricStatusBoardEntry): "medium" | "high" | "critical" {
  if (entry.statusState === "critical") return "critical";
  if (entry.statusState === "off-track") return "high";
  return "medium";
}

export default function MetricStatusBoardTab() {
  const { data, loading, error, refetch } = useAdminFetch<MetricStatusSnapshot>(
    "/api/admin/metric-status"
  );
  const [drafts, setDrafts] = useState<Record<string, DraftState>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const metricOptions = useMemo(() => {
    return (
      data?.statuses.map((entry) => ({
        key: entry.metricKey,
        label: entry.label,
      })) ?? []
    );
  }, [data]);

  function draftFor(entry: MetricStatusBoardEntry): DraftState {
    return (
      drafts[entry.metricKey] ?? {
        status_state: entry.statusState,
        status_reason: entry.statusReason,
        owner_email: entry.statusOwnerEmail ?? "",
        review_due_at: entry.reviewDueAt ?? "",
        leading_indicator_key: entry.leadingIndicatorKey ?? "",
        leading_indicator_note: entry.leadingIndicatorNote ?? "",
      }
    );
  }

  function updateDraft(metricKey: string, patch: Partial<DraftState>) {
    setDrafts((current) => ({
      ...current,
      [metricKey]: {
        ...(current[metricKey] ?? {
          status_state: "watch",
          status_reason: "",
          owner_email: "",
          review_due_at: "",
          leading_indicator_key: "",
          leading_indicator_note: "",
        }),
        ...patch,
      },
    }));
  }

  async function saveEntry(entry: MetricStatusBoardEntry) {
    const draft = draftFor(entry);
    setSavingKey(entry.metricKey);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/metric-status", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": getCsrfToken(),
        },
        body: JSON.stringify({
          action: "upsert",
          metric_key: entry.metricKey,
          ...draft,
          status_reason: draft.status_reason.trim() || null,
          owner_email: draft.owner_email.trim() || null,
          review_due_at: draft.review_due_at || null,
          leading_indicator_key: draft.leading_indicator_key || null,
          leading_indicator_note: draft.leading_indicator_note.trim() || null,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(
          (body as { error?: string } | null)?.error || "Failed to save metric status."
        );
      }

      setMessage({ type: "success", text: `Saved status for ${entry.label}.` });
      refetch();
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Unknown error." });
    } finally {
      setSavingKey(null);
    }
  }

  async function markReviewed(entry: MetricStatusBoardEntry) {
    setSavingKey(entry.metricKey);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/metric-status", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": getCsrfToken(),
        },
        body: JSON.stringify({
          action: "review",
          metric_key: entry.metricKey,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(
          (body as { error?: string } | null)?.error || "Failed to review metric status."
        );
      }

      setMessage({ type: "success", text: `Marked ${entry.label} as reviewed.` });
      refetch();
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Unknown error." });
    } finally {
      setSavingKey(null);
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
        {error || "Failed to load metric status board."}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-serif text-xl font-bold text-text-primary">Metric Status Board</h2>
        <p className="mt-1 text-sm text-text-muted">
          Canonical on-track status, explicit reasons, review dates, and mapped leading indicators
          for every governed metric.
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

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <StatCard label="Tracked Metrics" value={data.summary.totalMetrics} />
        <StatCard label="On Track" value={data.summary.onTrack} />
        <StatCard label="Watch" value={data.summary.watch} />
        <StatCard label="Off Track" value={data.summary.offTrack} />
        <StatCard label="Critical" value={data.summary.critical} />
        <StatCard label="Leading Signals At Risk" value={data.summary.leadingSignalsAtRisk} />
      </div>

      <div className="rounded-xl border border-white/10 bg-surface p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-medium text-text-primary">Leading Indicator Panel</h3>
            <p className="mt-1 text-xs text-text-muted">
              Earliest signal mapped to each lagging KPI, with threshold-based signal states.
            </p>
          </div>
          <span className="rounded-full bg-white/5 px-3 py-2 text-xs text-text-muted">
            {data.summary.reviewDue} reviews due
          </span>
        </div>

        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          {data.leadingIndicators.map((item) => (
            <a
              key={`${item.metricKey}-${item.leadingMetricKey}`}
              href={item.href}
              className="rounded-xl border border-white/10 bg-white/[0.03] p-4 transition hover:border-white/20"
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-wide text-text-muted">
                    {item.metricLabel}
                  </p>
                  <p className="mt-1 font-medium text-text-primary">{item.leadingMetricLabel}</p>
                </div>
                <span
                  className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${leadingSignalClasses(
                    item.signalState
                  )}`}
                >
                  {item.signalState}
                </span>
              </div>
              <p className="mt-3 text-sm text-text-muted">
                {item.leadingMetricValueLabel} | {item.detail}
              </p>
            </a>
          ))}
          {data.leadingIndicators.length === 0 && (
            <div className="rounded-xl border border-dashed border-white/10 p-6 text-sm text-text-muted">
              No leading indicators are mapped yet.
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {data.statuses.map((entry) => {
          const draft = draftFor(entry);
          return (
            <div key={entry.metricKey} className="rounded-xl border border-white/10 bg-surface p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] uppercase tracking-wide text-text-muted">
                      {entry.metricKey}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] uppercase tracking-wide ${statusClasses(
                        entry.statusState
                      )}`}
                    >
                      {entry.statusState}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] uppercase tracking-wide ${reviewClasses(
                        entry.reviewState
                      )}`}
                    >
                      {entry.reviewState}
                    </span>
                  </div>
                  <p className="mt-2 text-lg font-semibold text-text-primary">{entry.label}</p>
                  <p className="mt-1 text-sm text-text-muted">{entry.metricDescription}</p>
                </div>
                <div className="text-right">
                  <p className="font-serif text-2xl font-semibold text-text-primary">
                    {entry.currentValueLabel}
                  </p>
                  <p className="mt-1 text-xs text-text-muted">
                    {entry.statusOwnerEmail || "No status owner"}
                  </p>
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <MetaTile label="Target" value={entry.benchmarkTargetLabel ?? "—"} />
                <MetaTile label="Warning" value={entry.benchmarkWarningLabel ?? "—"} />
                <MetaTile
                  label="Review Due"
                  value={entry.reviewDueAt ? new Date(entry.reviewDueAt).toLocaleDateString() : "—"}
                />
              </div>

              <div className="mt-4 rounded-lg border border-white/10 bg-white/5 px-3 py-3">
                <p className="text-xs uppercase tracking-wide text-text-muted">Status reason</p>
                <p className="mt-1 text-sm text-text-primary">{entry.statusReason}</p>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs text-text-muted">Status</label>
                  <select
                    value={draft.status_state}
                    onChange={(event) =>
                      updateDraft(entry.metricKey, {
                        status_state: event.target.value as MetricStatusState,
                      })
                    }
                    className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-text-primary focus:border-white/20 focus:outline-none"
                  >
                    {(["on-track", "watch", "off-track", "critical"] as const).map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs text-text-muted">Status Owner</label>
                  <input
                    value={draft.owner_email}
                    onChange={(event) =>
                      updateDraft(entry.metricKey, { owner_email: event.target.value })
                    }
                    className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-text-primary focus:border-white/20 focus:outline-none"
                    placeholder="owner@loveiq.com"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-text-muted">Review Due</label>
                  <input
                    type="date"
                    value={draft.review_due_at}
                    onChange={(event) =>
                      updateDraft(entry.metricKey, { review_due_at: event.target.value })
                    }
                    className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-text-primary focus:border-white/20 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-text-muted">Leading Indicator</label>
                  <select
                    value={draft.leading_indicator_key}
                    onChange={(event) =>
                      updateDraft(entry.metricKey, { leading_indicator_key: event.target.value })
                    }
                    className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-text-primary focus:border-white/20 focus:outline-none"
                  >
                    <option value="">No mapped indicator</option>
                    {metricOptions
                      .filter((option) => option.key !== entry.metricKey)
                      .map((option) => (
                        <option key={option.key} value={option.key}>
                          {option.label}
                        </option>
                      ))}
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className="mb-1 block text-xs text-text-muted">Status Reason</label>
                  <textarea
                    value={draft.status_reason}
                    onChange={(event) =>
                      updateDraft(entry.metricKey, { status_reason: event.target.value })
                    }
                    className="min-h-20 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-text-primary focus:border-white/20 focus:outline-none"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="mb-1 block text-xs text-text-muted">
                    Leading Indicator Note
                  </label>
                  <textarea
                    value={draft.leading_indicator_note}
                    onChange={(event) =>
                      updateDraft(entry.metricKey, { leading_indicator_note: event.target.value })
                    }
                    className="min-h-20 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-text-primary focus:border-white/20 focus:outline-none"
                    placeholder="Why this signal should move before the lagging KPI."
                  />
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => void saveEntry(entry)}
                    disabled={savingKey === entry.metricKey}
                    className="rounded-lg bg-white/10 px-4 py-2 text-sm font-medium text-text-primary transition hover:bg-white/15 disabled:opacity-40"
                  >
                    {savingKey === entry.metricKey ? "Saving..." : "Save status"}
                  </button>
                  <button
                    onClick={() => void markReviewed(entry)}
                    disabled={savingKey === entry.metricKey}
                    className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-text-primary transition hover:bg-white/10 disabled:opacity-40"
                  >
                    Mark reviewed
                  </button>
                  <AdminReviewRequestButton
                    title={`Review metric status: ${entry.label}`}
                    description={entry.statusReason}
                    resourceType="general"
                    linkedMetricKey={entry.metricKey}
                    impactLevel={reviewImpactLevel(entry)}
                    reviewerEmail={draft.owner_email.trim() || entry.statusOwnerEmail || null}
                    sourceHref="/admin/benchmarks"
                    dueDate={draft.review_due_at || entry.reviewDueAt || null}
                    payloadSnapshot={{
                      metricKey: entry.metricKey,
                      statusState: draft.status_state,
                      statusReason: draft.status_reason || entry.statusReason,
                      ownerEmail: draft.owner_email || entry.statusOwnerEmail,
                      leadingIndicatorKey: draft.leading_indicator_key || entry.leadingIndicatorKey,
                      leadingIndicatorNote:
                        draft.leading_indicator_note || entry.leadingIndicatorNote,
                    }}
                    label="Request review"
                    busyLabel="Requesting..."
                    successLabel="Queued"
                    className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-text-primary transition hover:bg-white/10 disabled:opacity-40"
                  />
                </div>
                <a href={entry.linkedHref} className="text-sm text-cyan-300 hover:text-cyan-200">
                  Open metric view
                </a>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MetaTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-3">
      <p className="text-xs uppercase tracking-wide text-text-muted">{label}</p>
      <p className="mt-1 text-sm font-medium text-text-primary">{value}</p>
    </div>
  );
}
