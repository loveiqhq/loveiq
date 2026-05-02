"use client";

import { useState, type FormEvent } from "react";
import { getCsrfToken } from "@/lib/csrf-client";
import EmbeddedIntelligencePanel from "@/components/admin/EmbeddedIntelligencePanel";
import AdminKnowledgePanel from "@/components/admin/AdminKnowledgePanel";
import AdminSignalGraphPanel from "@/components/admin/AdminSignalGraphPanel";
import AdminSimulationPanel from "@/components/admin/AdminSimulationPanel";
import type {
  AdminActionItem,
  AdminActionPriority,
  AdminActionStatus,
  AdminDecisionReviewItem,
  AdminMetricOptionLite,
  AdminOsBrief,
  AdminOsMetricCard,
  AdminOsSnapshot,
  AdminOsTimelineItem,
  AdminOsTone,
  AdminOsTrustItem,
} from "@/lib/admin/os-types";
import { useAdminFetch } from "@/components/admin/hooks/useAdminFetch";
import StatCard from "@/components/admin/StatCard";
import TimeRangeSelector from "@/components/admin/TimeRangeSelector";
import WhatChangedOverlay from "@/components/admin/WhatChangedOverlay";

const ACTION_STATUSES: AdminActionStatus[] = ["open", "in-progress", "blocked", "done"];
const ACTION_PRIORITIES: AdminActionPriority[] = ["high", "medium", "low"];

function toneClasses(tone: AdminOsTone): string {
  if (tone === "good") return "border-emerald-500/25 bg-emerald-500/5 text-emerald-300";
  if (tone === "risk") return "border-red-500/25 bg-red-500/5 text-red-300";
  return "border-amber-500/25 bg-amber-500/5 text-amber-200";
}

function formatTimestamp(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
}

function QuickActionCard({
  item,
  savingId,
  onStatusChange,
}: {
  item: AdminActionItem;
  savingId: number | null;
  onStatusChange: (id: number, status: AdminActionStatus) => Promise<void>;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium text-text-primary">{item.title}</p>
          <p className="mt-1 text-xs text-text-muted">
            {item.ownerEmail ? item.ownerEmail : "Unassigned"}
            {item.dueDate ? ` | due ${item.dueDate}` : ""}
            {item.reviewDate ? ` | review ${item.reviewDate}` : ""}
          </p>
        </div>
        <span
          className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${toneClasses(
            item.priority === "high" ? "risk" : item.status === "done" ? "good" : "watch"
          )}`}
        >
          {item.priority}
        </span>
      </div>
      {item.description && <p className="mt-3 text-sm text-text-muted">{item.description}</p>}
      {(item.metricKey || item.expectedImpact || item.measuredOutcome) && (
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <ImpactMeta label="Metric" value={item.metricKey ?? "Not linked"} />
          <ImpactMeta label="Expected" value={item.expectedImpact ?? "Not set"} />
          <ImpactMeta label="Measured" value={item.measuredOutcome ?? "Monitoring"} />
        </div>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        {ACTION_STATUSES.map((status) => (
          <button
            key={status}
            disabled={savingId === item.id || item.status === status}
            onClick={() => void onStatusChange(item.id, status)}
            className={`rounded-lg border px-2.5 py-1.5 text-xs transition ${
              item.status === status
                ? "border-white/20 bg-white/10 text-text-primary"
                : "border-white/10 text-text-muted hover:bg-white/5 hover:text-text-primary"
            } disabled:cursor-not-allowed disabled:opacity-60`}
          >
            {status}
          </button>
        ))}
        {item.linkedHref && (
          <a
            href={item.linkedHref}
            className="rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-text-muted transition hover:bg-white/5 hover:text-text-primary"
          >
            Open linked view
          </a>
        )}
      </div>
    </div>
  );
}

export default function CommandCenterDashboard() {
  const [days, setDays] = useState(30);
  const [draft, setDraft] = useState({
    title: "",
    owner_email: "",
    metric_key: "",
    due_date: "",
    review_date: "",
    priority: "medium" as AdminActionPriority,
    description: "",
    expected_impact: "",
    measured_outcome: "",
  });
  const [savingId, setSavingId] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const { data, loading, error, refetch } = useAdminFetch<AdminOsSnapshot>("/api/admin/os", {
    days: String(days),
  });

  async function createAction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingId(-1);
    setMessage(null);

    const res = await fetch("/api/admin/actions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-csrf-token": getCsrfToken(),
      },
      body: JSON.stringify({
        title: draft.title,
        description: draft.description || null,
        owner_email: draft.owner_email || null,
        metric_key: draft.metric_key || null,
        source_type: draft.metric_key ? "metric" : "general",
        due_date: draft.due_date || null,
        review_date: draft.review_date || null,
        priority: draft.priority,
        expected_impact: draft.expected_impact || null,
        measured_outcome: draft.measured_outcome || null,
      }),
    });

    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    if (!res.ok) {
      setMessage(body?.error || "Unable to create action.");
      setSavingId(null);
      return;
    }

    setDraft({
      title: "",
      owner_email: "",
      metric_key: "",
      due_date: "",
      review_date: "",
      priority: "medium",
      description: "",
      expected_impact: "",
      measured_outcome: "",
    });
    setSavingId(null);
    setMessage("Action item created.");
    refetch();
  }

  async function updateActionStatus(id: number, status: AdminActionStatus) {
    setSavingId(id);
    setMessage(null);

    const res = await fetch(`/api/admin/actions/${id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-csrf-token": getCsrfToken(),
      },
      body: JSON.stringify({ status }),
    });

    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    if (!res.ok) {
      setMessage(body?.error || "Unable to update action.");
      setSavingId(null);
      return;
    }

    setSavingId(null);
    refetch();
  }

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
        {error || "Failed to load command center"}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-text-muted">
            Admin OS
          </p>
          <h2 className="mt-2 font-serif text-3xl font-bold text-text-primary">Command Center</h2>
          <p className="mt-2 max-w-3xl text-sm text-text-muted">
            Cross-functional operating view for strategy, product, growth, and tech. Updated{" "}
            {formatTimestamp(data.generatedAt)}.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <WhatChangedOverlay days={days} triggerLabel="What changed?" />
          <TimeRangeSelector value={days} onChange={setDays} />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Open Actions" value={data.actionBoard.summary.totalOpen} />
        <StatCard label="Blocked Actions" value={data.actionBoard.summary.blocked} />
        <StatCard label="Overdue Actions" value={data.actionBoard.summary.overdue} />
        <StatCard label="Done This Window" value={data.actionBoard.summary.doneThisWindow} />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        {data.briefs.map((brief) => (
          <div key={brief.title} className={`rounded-xl border p-5 ${toneClasses(brief.tone)}`}>
            <p className="text-xs font-semibold uppercase tracking-wide">{brief.title}</p>
            <p className="mt-3 text-sm leading-6">{brief.detail}</p>
            <a href={brief.href} className="mt-4 inline-flex text-sm font-medium text-text-primary">
              Open view
            </a>
          </div>
        ))}
      </div>

      <EmbeddedIntelligencePanel surface="command-center" days={days} />
      <EmbeddedIntelligencePanel
        surface="command-center"
        days={days}
        title="Leadership Decision Copilot"
        endpoint="/api/admin/decision-intelligence"
      />
      <AdminKnowledgePanel surface="command-center" days={days} title="Command Memory" />
      <AdminSignalGraphPanel surface="command-center" days={days} title="Operating Graph" />
      <AdminSimulationPanel surface="command-center" days={days} title="Operating Scenarios" />

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-serif text-xl font-semibold text-text-primary">Metric Board</h3>
          <a href="/admin/benchmarks" className="text-sm text-text-muted hover:text-text-primary">
            Metric registry
          </a>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data.metricBoard.map((metric: AdminOsMetricCard) => (
            <a
              key={metric.key}
              href={metric.href}
              className={`rounded-xl border p-5 transition hover:border-white/20 hover:bg-white/[0.03] ${toneClasses(metric.tone)}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm">{metric.label}</p>
                  <p className="mt-2 font-serif text-2xl font-bold text-text-primary">
                    {metric.value}
                  </p>
                  {(metric.statusLabel || metric.ownerEmail) && (
                    <p className="mt-2 text-xs text-text-muted">
                      {metric.statusLabel ? `status ${metric.statusLabel}` : ""}
                      {metric.statusLabel && metric.ownerEmail ? " | " : ""}
                      {metric.ownerEmail ? metric.ownerEmail : ""}
                    </p>
                  )}
                </div>
                {metric.delta != null && (
                  <span className="rounded-full bg-white/10 px-2 py-1 text-[10px] font-semibold text-text-primary">
                    {metric.delta > 0 ? "+" : ""}
                    {metric.delta}
                  </span>
                )}
              </div>
              <p className="mt-3 text-sm text-text-muted">{metric.detail}</p>
            </a>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-serif text-xl font-semibold text-text-primary">Leading Indicators</h3>
          <a href="/admin/benchmarks" className="text-sm text-text-muted hover:text-text-primary">
            Status & leading
          </a>
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          {data.leadingIndicators.map((item) => (
            <a
              key={`${item.metricKey}-${item.leadingMetricKey}`}
              href={item.href}
              className="rounded-xl border border-white/10 bg-surface p-4 transition hover:border-white/20"
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-wide text-text-muted">
                    {item.metricLabel}
                  </p>
                  <p className="mt-1 font-medium text-text-primary">{item.leadingMetricLabel}</p>
                </div>
                <span
                  className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${
                    item.signalState === "positive"
                      ? "bg-emerald-500/10 text-emerald-300"
                      : item.signalState === "negative"
                        ? "bg-red-500/10 text-red-300"
                        : "bg-amber-500/10 text-amber-200"
                  }`}
                >
                  {item.signalState}
                </span>
              </div>
              <p className="mt-3 text-sm text-text-muted">
                {item.leadingMetricValueLabel} | {item.detail}
              </p>
            </a>
          ))}
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.1fr,0.9fr]">
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-serif text-xl font-semibold text-text-primary">Action Tracker</h3>
            <span className="text-xs uppercase tracking-wide text-text-muted">
              light execution layer
            </span>
          </div>
          <form
            onSubmit={createAction}
            className="rounded-xl border border-white/10 bg-surface p-4"
          >
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <input
                value={draft.title}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, title: event.target.value }))
                }
                placeholder="Action title"
                className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-text-primary outline-none transition focus:border-white/20"
                required
              />
              <input
                value={draft.owner_email}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, owner_email: event.target.value }))
                }
                placeholder="Owner email"
                className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-text-primary outline-none transition focus:border-white/20"
              />
              <select
                value={draft.metric_key}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, metric_key: event.target.value }))
                }
                className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-text-primary outline-none transition focus:border-white/20"
              >
                <option value="">Metric link</option>
                {data.metricOptions.map((metric: AdminMetricOptionLite) => (
                  <option key={metric.key} value={metric.key}>
                    {metric.label}
                  </option>
                ))}
              </select>
              <select
                value={draft.priority}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    priority: event.target.value as AdminActionPriority,
                  }))
                }
                className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-text-primary outline-none transition focus:border-white/20"
              >
                {ACTION_PRIORITIES.map((priority) => (
                  <option key={priority} value={priority}>
                    {priority}
                  </option>
                ))}
              </select>
              <input
                type="date"
                value={draft.due_date}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, due_date: event.target.value }))
                }
                className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-text-primary outline-none transition focus:border-white/20"
              />
              <input
                type="date"
                value={draft.review_date}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, review_date: event.target.value }))
                }
                className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-text-primary outline-none transition focus:border-white/20"
              />
            </div>
            <textarea
              value={draft.description}
              onChange={(event) =>
                setDraft((current) => ({ ...current, description: event.target.value }))
              }
              rows={3}
              placeholder="Why this matters, context, or next step"
              className="mt-3 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-text-primary outline-none transition focus:border-white/20"
            />
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <textarea
                value={draft.expected_impact}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, expected_impact: event.target.value }))
                }
                rows={3}
                placeholder="Expected KPI movement"
                className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-text-primary outline-none transition focus:border-white/20"
              />
              <textarea
                value={draft.measured_outcome}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, measured_outcome: event.target.value }))
                }
                rows={3}
                placeholder="Measured outcome or monitoring note"
                className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-text-primary outline-none transition focus:border-white/20"
              />
            </div>
            <div className="mt-3 flex items-center justify-between gap-3">
              <p className="text-xs text-text-muted">
                Use this for follow-through, not project management.
              </p>
              <button
                disabled={savingId === -1}
                className="rounded-lg bg-white/10 px-4 py-2 text-sm font-medium text-text-primary transition hover:bg-white/15 disabled:opacity-60"
              >
                Create action
              </button>
            </div>
            {message && <p className="mt-3 text-sm text-text-muted">{message}</p>}
          </form>
          <div className="space-y-3">
            {data.actionBoard.items.length === 0 ? (
              <div className="rounded-xl border border-dashed border-white/10 p-6 text-sm text-text-muted">
                No action items tracked yet.
              </div>
            ) : (
              data.actionBoard.items.map((item) => (
                <QuickActionCard
                  key={item.id}
                  item={item}
                  savingId={savingId}
                  onStatusChange={updateActionStatus}
                />
              ))
            )}
          </div>
        </section>

        <section className="space-y-6">
          <div>
            <h3 className="font-serif text-xl font-semibold text-text-primary">Role Cockpits</h3>
            <div className="mt-3 grid gap-3">
              {data.roleSummaries.map((item) => (
                <a
                  key={item.role}
                  href={item.href}
                  className={`rounded-xl border p-4 transition hover:border-white/20 hover:bg-white/[0.03] ${toneClasses(item.tone)}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-medium text-text-primary">{item.label}</p>
                    <span className="text-[10px] font-semibold uppercase tracking-wide">
                      {item.tone}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-text-muted">{item.summary}</p>
                </a>
              ))}
            </div>
          </div>

          <div>
            <h3 className="font-serif text-xl font-semibold text-text-primary">Decision Review</h3>
            <div className="mt-3 space-y-3">
              {data.decisionBoard.map((item: AdminDecisionReviewItem) => (
                <a
                  key={item.id}
                  href={item.href}
                  className="block rounded-xl border border-white/10 bg-surface p-4 transition hover:border-white/20"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-text-primary">{item.title}</p>
                      <p className="mt-1 text-xs text-text-muted">
                        {item.entryType} | {item.status}
                        {item.ownerEmail ? ` | ${item.ownerEmail}` : ""}
                        {item.primaryMetricKey ? ` | ${item.primaryMetricKey}` : ""}
                      </p>
                    </div>
                    {item.reviewDate && (
                      <span className="rounded-full bg-white/10 px-2 py-1 text-[10px] font-semibold text-text-primary">
                        review {item.reviewDate}
                      </span>
                    )}
                  </div>
                  {item.expectedImpact && (
                    <p className="mt-3 text-sm text-text-muted">{item.expectedImpact}</p>
                  )}
                  {item.measuredOutcome && (
                    <p className="mt-2 text-xs text-text-muted">Observed: {item.measuredOutcome}</p>
                  )}
                </a>
              ))}
            </div>
          </div>
        </section>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <section>
          <h3 className="font-serif text-xl font-semibold text-text-primary">Trust Board</h3>
          <div className="mt-3 space-y-3">
            {data.trustBoard.map((item: AdminOsTrustItem) => (
              <a
                key={item.label}
                href={item.href}
                className={`block rounded-xl border p-4 transition hover:border-white/20 ${toneClasses(item.tone)}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium text-text-primary">{item.label}</p>
                  <span className="text-[10px] font-semibold uppercase tracking-wide">
                    {item.mode}
                  </span>
                </div>
                <p className="mt-2 text-sm text-text-muted">{item.detail}</p>
                <p className="mt-2 text-xs text-text-muted">
                  {item.lastUpdated
                    ? `Updated ${formatTimestamp(item.lastUpdated)}`
                    : "No recent sample"}
                </p>
              </a>
            ))}
          </div>
        </section>

        <section>
          <h3 className="font-serif text-xl font-semibold text-text-primary">Priority Watchlist</h3>
          <div className="mt-3 space-y-3">
            {data.watchlist.map((item: AdminOsBrief) => (
              <a
                key={item.title}
                href={item.href}
                className={`block rounded-xl border p-4 transition hover:border-white/20 ${toneClasses(item.tone)}`}
              >
                <p className="font-medium text-text-primary">{item.title}</p>
                <p className="mt-2 text-sm text-text-muted">{item.detail}</p>
              </a>
            ))}
          </div>
        </section>
      </div>

      <section>
        <h3 className="font-serif text-xl font-semibold text-text-primary">Operating Timeline</h3>
        <div className="mt-3 space-y-3">
          {data.timeline.map((item: AdminOsTimelineItem) => (
            <a
              key={item.id}
              href={item.href}
              className="flex flex-col gap-2 rounded-xl border border-white/10 bg-surface p-4 transition hover:border-white/20 md:flex-row md:items-center md:justify-between"
            >
              <div>
                <p className="font-medium text-text-primary">{item.title}</p>
                <p className="mt-1 text-sm text-text-muted">{item.detail}</p>
              </div>
              <div className="text-xs text-text-muted">
                <span className="uppercase tracking-wide">{item.kind}</span>
                <div className="mt-1">{formatTimestamp(item.timestamp)}</div>
              </div>
            </a>
          ))}
        </div>
      </section>
    </div>
  );
}

function ImpactMeta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-text-muted">{label}</p>
      <p className="mt-1 text-xs text-text-primary">{value}</p>
    </div>
  );
}
