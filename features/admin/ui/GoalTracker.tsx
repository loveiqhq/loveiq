"use client";

import { useMemo, useState } from "react";
import { useAdminFetch } from "./hooks/useAdminFetch";
import { useAdminQueryState } from "./hooks/useAdminQueryState";
import { buildMetricDrilldownHref } from "@features/admin/server/drilldowns";
import { getCsrfToken } from "@shared/http/csrf-client";

interface Goal {
  id: number;
  label: string;
  metricKey: string;
  targetValue: number;
  currentValue: number | null;
  status: string;
  deadline: string | null;
  createdBy: string;
  createdAt: string;
}

interface GoalsData {
  goals: Goal[];
}

const METRIC_OPTIONS = [
  { value: "total_submissions", label: "Total Submissions" },
  { value: "completion_rate", label: "Completion Rate (%)" },
  { value: "waitlist_signups", label: "Waitlist Signups" },
  { value: "scored_count", label: "Scored Count" },
  { value: "workflow_needs_review", label: "Needs Review Queue" },
  { value: "workflow_root_cause_found", label: "Root Cause Found" },
  { value: "workflow_question_change_candidate", label: "Question Change Candidates" },
  { value: "workflow_monitoring", label: "Monitoring Queue" },
];

function metricLabel(key: string): string {
  return METRIC_OPTIONS.find((o) => o.value === key)?.label ?? key;
}

function progressPercent(current: number | null, target: number): number {
  if (current === null || target <= 0) return 0;
  return Math.min(Math.round((current / target) * 100), 100);
}

function progressColor(pct: number): string {
  if (pct >= 100) return "bg-green-500";
  if (pct >= 60) return "bg-yellow-500";
  return "bg-red-500";
}

function statusBadge(status: string) {
  const styles: Record<string, string> = {
    active: "bg-accent-purple/20 text-accent-purple",
    achieved: "bg-green-500/20 text-green-400",
    cancelled: "bg-white/10 text-text-muted",
  };
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${styles[status] || "bg-white/10 text-text-muted"}`}
    >
      {status}
    </span>
  );
}

function daysRemaining(deadline: string | null): string | null {
  if (!deadline) return null;
  const diff = Math.ceil((new Date(deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  if (diff < 0) return `${Math.abs(diff)}d overdue`;
  if (diff === 0) return "Due today";
  return `${diff}d remaining`;
}

export default function GoalTracker() {
  const { data, loading, error, refetch } = useAdminFetch<GoalsData>("/api/admin/goals");
  const { searchParams, setQueryState } = useAdminQueryState();
  const [showForm, setShowForm] = useState(false);
  const [formLabel, setFormLabel] = useState("");
  const [formMetric, setFormMetric] = useState(METRIC_OPTIONS[0]!.value);
  const [formTarget, setFormTarget] = useState("");
  const [formDeadline, setFormDeadline] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const statusFilter = (() => {
    const value = searchParams.get("status");
    return value === "active" || value === "achieved" || value === "cancelled" ? value : "all";
  })();
  const metricFilter = searchParams.get("metric") || "all";
  const highlightedGoalId = Number.parseInt(searchParams.get("goal") || "", 10);

  async function handleCreate() {
    if (!formLabel.trim() || !formTarget) return;
    setSubmitting(true);
    setActionError(null);
    try {
      const res = await fetch("/api/admin/goals", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": getCsrfToken(),
        },
        body: JSON.stringify({
          label: formLabel.trim(),
          metric_key: formMetric,
          target_value: Number(formTarget),
          ...(formDeadline ? { deadline: formDeadline } : {}),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setActionError((body as { error?: string } | null)?.error || "Failed to create goal.");
        return;
      }
      setFormLabel("");
      setFormTarget("");
      setFormDeadline("");
      setShowForm(false);
      refetch();
    } catch {
      setActionError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleStatusChange(goalId: number, status: string) {
    setActionError(null);
    try {
      const res = await fetch("/api/admin/goals", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": getCsrfToken(),
        },
        body: JSON.stringify({ action: "update_status", goalId, status }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setActionError((body as { error?: string } | null)?.error || "Failed to update goal.");
        return;
      }
      refetch();
    } catch {
      setActionError("Network error. Please try again.");
    }
  }

  const filteredGoals = useMemo(() => {
    const goals = data?.goals ?? [];
    return goals.filter((goal) => {
      if (statusFilter !== "all" && goal.status !== statusFilter) return false;
      if (metricFilter !== "all" && goal.metricKey !== metricFilter) return false;
      return true;
    });
  }, [data?.goals, metricFilter, statusFilter]);

  const activeGoals = filteredGoals.filter((g) => g.status === "active");
  const completedGoals = filteredGoals.filter(
    (g) => g.status === "achieved" || g.status === "cancelled"
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-accent-purple" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-6 text-center text-sm text-red-400">
        {error || "Failed to load goals"}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="font-serif text-xl font-bold text-text-primary">Goals & Targets</h2>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="rounded-lg bg-accent-purple px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-purple/80"
        >
          {showForm ? "Cancel" : "Add Goal"}
        </button>
      </div>

      <div className="grid gap-3 rounded-xl border border-white/10 bg-surface p-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div>
          <label className="mb-1 block text-xs font-medium text-text-muted">Status Filter</label>
          <select
            value={statusFilter}
            onChange={(event) =>
              setQueryState({
                status: event.target.value === "all" ? null : event.target.value,
                goal: null,
              })
            }
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-text-primary focus:border-white/20 focus:outline-none"
          >
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="achieved">Achieved</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-text-muted">Metric Filter</label>
          <select
            value={metricFilter}
            onChange={(event) =>
              setQueryState({
                metric: event.target.value === "all" ? null : event.target.value,
                goal: null,
              })
            }
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-text-primary focus:border-white/20 focus:outline-none"
          >
            <option value="all">All metrics</option>
            {METRIC_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {actionError && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-400">
          {actionError}
        </div>
      )}

      {showForm && (
        <div className="rounded-xl border border-white/10 bg-surface p-5 space-y-4">
          <h3 className="font-serif text-base font-semibold text-text-primary">New Goal</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-text-muted">Label</label>
              <input
                type="text"
                value={formLabel}
                onChange={(e) => setFormLabel(e.target.value)}
                maxLength={100}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-text-primary placeholder:text-text-muted/50 focus:border-white/20 focus:outline-none"
                placeholder="e.g. Reach 500 survey submissions"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-text-muted">Metric</label>
              <select
                value={formMetric}
                onChange={(e) => setFormMetric(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-text-primary focus:border-white/20 focus:outline-none"
              >
                {METRIC_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-text-muted">Target Value</label>
              <input
                type="number"
                value={formTarget}
                onChange={(e) => setFormTarget(e.target.value)}
                min={1}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-text-primary placeholder:text-text-muted/50 focus:border-white/20 focus:outline-none"
                placeholder="500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-text-muted">
                Deadline (optional)
              </label>
              <input
                type="date"
                value={formDeadline}
                onChange={(e) => setFormDeadline(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-text-primary focus:border-white/20 focus:outline-none"
              />
            </div>
          </div>
          <div className="flex justify-end">
            <button
              onClick={handleCreate}
              disabled={submitting || !formLabel.trim() || !formTarget}
              className="rounded-lg bg-accent-purple px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-purple/80 disabled:opacity-40"
            >
              {submitting ? "Creating…" : "Create Goal"}
            </button>
          </div>
        </div>
      )}

      {activeGoals.length === 0 && !showForm && (
        <div className="rounded-xl border border-white/10 bg-surface p-10 text-center text-sm text-text-muted">
          No active goals yet. Create one to start tracking progress.
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {activeGoals.map((goal) => {
          const pct = progressPercent(goal.currentValue, goal.targetValue);
          const days = daysRemaining(goal.deadline);
          return (
            <div
              key={goal.id}
              className={`rounded-xl border bg-surface p-5 space-y-3 ${
                goal.id === highlightedGoalId
                  ? "border-accent-purple/40 shadow-[0_0_0_1px_rgba(169,96,255,0.2)]"
                  : "border-white/10"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="font-serif text-base font-semibold text-text-primary truncate">
                    {goal.label}
                  </h3>
                  <p className="text-xs text-text-muted">{metricLabel(goal.metricKey)}</p>
                </div>
                {statusBadge(goal.status)}
              </div>

              <div className="space-y-1.5">
                <div className="flex items-baseline justify-between text-sm">
                  <span className="text-text-primary font-medium">
                    {goal.currentValue !== null ? goal.currentValue.toLocaleString() : "—"}
                    <span className="text-text-muted font-normal">
                      {" "}
                      / {goal.targetValue.toLocaleString()}
                    </span>
                  </span>
                  <span className="text-xs text-text-muted">{pct}%</span>
                </div>
                <div className="h-2 w-full rounded-full bg-white/10">
                  <div
                    className={`h-full rounded-full transition-all ${progressColor(pct)}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>

              {days && (
                <p
                  className={`text-xs ${days.includes("overdue") ? "text-red-400" : "text-text-muted"}`}
                >
                  {goal.deadline && (
                    <span className="mr-1">{new Date(goal.deadline).toLocaleDateString()}</span>
                  )}
                  · {days}
                </p>
              )}

              <div className="flex gap-2 pt-1">
                <a
                  href={buildMetricDrilldownHref(goal.metricKey)}
                  className="rounded-lg border border-accent-purple/20 bg-accent-purple/10 px-3 py-1.5 text-xs font-medium text-accent-purple transition hover:bg-accent-purple/20"
                >
                  Open Drilldown
                </a>
                <button
                  onClick={() => handleStatusChange(goal.id, "achieved")}
                  className="rounded-lg border border-green-500/30 px-3 py-1.5 text-xs font-medium text-green-400 transition hover:bg-green-500/10"
                >
                  Mark Achieved
                </button>
                <button
                  onClick={() => handleStatusChange(goal.id, "cancelled")}
                  className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-text-muted transition hover:bg-white/5"
                >
                  Cancel
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {completedGoals.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-serif text-base font-semibold text-text-muted">
            Completed & Cancelled
          </h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {completedGoals.map((goal) => {
              const pct = progressPercent(goal.currentValue, goal.targetValue);
              return (
                <div
                  key={goal.id}
                  className={`rounded-xl border bg-surface/50 p-4 opacity-70 space-y-2 ${
                    goal.id === highlightedGoalId ? "border-accent-purple/30" : "border-white/5"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="font-serif text-sm font-semibold text-text-muted truncate">
                      {goal.label}
                    </h4>
                    {statusBadge(goal.status)}
                  </div>
                  <div className="flex items-baseline gap-2 text-xs text-text-muted">
                    <span>
                      {goal.currentValue !== null ? goal.currentValue.toLocaleString() : "—"} /{" "}
                      {goal.targetValue.toLocaleString()}
                    </span>
                    <span>· {pct}%</span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-white/10">
                    <div
                      className={`h-full rounded-full ${progressColor(pct)}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="pt-1">
                    <a
                      href={buildMetricDrilldownHref(goal.metricKey)}
                      className="text-xs font-medium text-accent-purple transition hover:text-accent-purple/80"
                    >
                      Open Drilldown
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
