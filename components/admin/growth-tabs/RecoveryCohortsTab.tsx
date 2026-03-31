"use client";

import { useMemo, useState } from "react";
import BarChart from "@/components/admin/BarChart";
import { useAdminFetch } from "@/components/admin/hooks/useAdminFetch";
import KpiDataTable, { type Column } from "@/components/admin/kpi-tabs/KpiDataTable";
import StatCard from "@/components/admin/StatCard";
import type {
  RecoveryCohortRow,
  RecoveryPlaybookGroup,
  RecoveryPlaybookItem,
  RecoveryPlaybookSnapshot,
  RecoverySource,
} from "@/lib/admin/recovery-playbook";
import { getCsrfToken } from "@/lib/csrf-client";

const cohortColumns: Column<RecoveryCohortRow>[] = [
  { key: "week", label: "First-Touch Week" },
  { key: "qualityScore", label: "Quality", align: "right" },
  {
    key: "completionRate",
    label: "Completion",
    align: "right",
    format: (value) => `${value}%`,
  },
  {
    key: "scoredRate",
    label: "Scored",
    align: "right",
    format: (value) => `${value}%`,
  },
  {
    key: "resumedShare",
    label: "Resumed Share",
    align: "right",
    format: (value) => `${value}%`,
  },
  {
    key: "resumedCompletionRate",
    label: "Recovery Success",
    align: "right",
    format: (value) => `${value}%`,
  },
  { key: "totalSubmissions", label: "Subs", align: "right" },
];

const sourceColumns: Column<RecoverySource>[] = [
  { key: "source", label: "Source" },
  { key: "partialSaves", label: "Partial Saves", align: "right" },
  { key: "recovered", label: "Recovered", align: "right" },
  {
    key: "recoveryRate",
    label: "Recovery Rate",
    align: "right",
    format: (value) => `${value}%`,
  },
];

function attentionClasses(attention: RecoveryPlaybookItem["attention"]) {
  if (attention === "scale") return "bg-emerald-500/10 text-emerald-300";
  if (attention === "risk") return "bg-red-500/10 text-red-300";
  return "bg-amber-500/10 text-amber-200";
}

function priorityClasses(priority: RecoveryPlaybookItem["priority"]) {
  if (priority === "high") return "bg-red-500/10 text-red-300";
  if (priority === "medium") return "bg-amber-500/10 text-amber-200";
  return "bg-emerald-500/10 text-emerald-300";
}

function formatHours(value: number | null) {
  return value != null ? `${value}h` : "n/a";
}

function MetricTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-text-muted">{label}</p>
      <p className="mt-1 text-sm font-semibold text-text-primary">{value}</p>
    </div>
  );
}

function PlaybookCard({
  item,
  ownerEmail,
  saving,
  onOwnerChange,
  onCreateAction,
}: {
  item: RecoveryPlaybookItem;
  ownerEmail: string;
  saving: boolean;
  onOwnerChange: (value: string) => void;
  onCreateAction: () => void;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-surface p-5">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] uppercase tracking-wide ${attentionClasses(
            item.attention
          )}`}
        >
          {item.attention}
        </span>
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] uppercase tracking-wide ${priorityClasses(
            item.priority
          )}`}
        >
          {item.priority}
        </span>
        <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] uppercase tracking-wide text-text-muted">
          {item.cohortType}
        </span>
      </div>

      <div className="mt-3">
        <p className="text-lg font-semibold text-text-primary">{item.title}</p>
        <p className="mt-2 text-sm text-text-muted">{item.summary}</p>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <MetricTile label="Partial Saves" value={item.partialSaves.toLocaleString()} />
        <MetricTile label="Recovered" value={item.recovered.toLocaleString()} />
        <MetricTile label="Recovery Rate" value={`${item.recoveryRate}%`} />
        <MetricTile label="Median Hours" value={formatHours(item.medianHoursToRecover)} />
        <MetricTile label="Avg Hours" value={formatHours(item.avgHoursToRecover)} />
        <MetricTile
          label="Hotspot"
          value={
            item.topResumePoint != null ? `Q${item.topResumePoint}` : (item.topSource ?? "n/a")
          }
        />
      </div>

      <div className="mt-4 rounded-lg border border-white/10 bg-white/5 px-4 py-3">
        <p className="text-[11px] uppercase tracking-wide text-text-muted">Best intervention</p>
        <p className="mt-1 text-sm text-text-primary">{item.intervention}</p>
        <p className="mt-2 text-xs text-text-muted">Suggested owner: {item.ownerRole}</p>
      </div>

      <div className="mt-4 flex flex-col gap-3 xl:flex-row xl:items-end">
        <div className="flex-1">
          <label className="text-[11px] uppercase tracking-wide text-text-muted">
            Action Owner Email
          </label>
          <input
            value={ownerEmail}
            onChange={(event) => onOwnerChange(event.target.value)}
            placeholder="owner@loveiq.com"
            className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-text-primary placeholder:text-text-muted/50 focus:border-white/20 focus:outline-none"
          />
        </div>
        <div className="flex gap-2">
          <a
            href={item.linkedHref}
            className="rounded-lg border border-white/10 px-3 py-2 text-sm text-text-muted transition hover:bg-white/5 hover:text-text-primary"
          >
            Open growth view
          </a>
          <button
            onClick={onCreateAction}
            disabled={saving}
            className="rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-sm text-text-primary transition hover:border-white/20 hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? "Creating..." : "Create action"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function RecoveryCohortsTab({ days }: { days: number }) {
  const params = useMemo(() => ({ days: String(days > 0 ? days : 30) }), [days]);
  const { data, loading, error, refetch } = useAdminFetch<RecoveryPlaybookSnapshot>(
    "/api/admin/growth/recovery",
    params
  );
  const [ownerDrafts, setOwnerDrafts] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  async function createPlaybookAction(item: RecoveryPlaybookItem) {
    setSavingId(item.id);
    setMessage(null);

    try {
      const response = await fetch("/api/admin/actions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": getCsrfToken(),
        },
        body: JSON.stringify({
          title: item.actionTitle,
          description: `${item.summary}\n\nSuggested intervention: ${item.intervention}`,
          priority: item.priority,
          owner_email: ownerDrafts[item.id]?.trim() || null,
          source_type: "investigation",
          source_id: null,
          metric_key: null,
          expected_impact: item.intervention,
          measured_outcome: null,
          linked_href: item.linkedHref,
          due_date: item.dueDate,
          review_date: item.reviewDate,
        }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(
          (body as { error?: string } | null)?.error || "Failed to create recovery action."
        );
      }

      setMessage({
        type: "success",
        text: `Created action for ${item.title.toLowerCase()}.`,
      });
      refetch();
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Unknown error.",
      });
    } finally {
      setSavingId(null);
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
        {error || "Failed to load recovery playbook."}
      </div>
    );
  }

  const resumeItems = data.resumePoints.slice(0, 10).map((point) => ({
    label: `Q${point.currentIndex}`,
    value: point.count,
  }));
  const sourceItems = data.recoveryBySource.slice(0, 8).map((source) => ({
    label: `${source.source} (${source.recovered}/${source.partialSaves})`,
    value: source.recoveryRate,
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium text-text-primary">Recovery Playbook Center</h3>
          <p className="mt-1 max-w-4xl text-sm text-text-muted">
            Convert passive recovery reporting into explicit stage and source playbooks with
            intervention guidance and ownerable follow-up actions.
          </p>
        </div>
        <p className="text-xs text-text-muted">
          Updated {new Date(data.generatedAt).toLocaleString()}
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

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="Partial Saves" value={data.summary.totalPartialSaves} />
        <StatCard label="Recovered" value={data.summary.recoveredCount} />
        <StatCard label="Recovery Rate" value={`${data.summary.recoveryRate}%`} />
        <StatCard
          label="Median Hours"
          value={
            data.summary.medianHoursToRecover != null
              ? `${data.summary.medianHoursToRecover}h`
              : "n/a"
          }
        />
        <StatCard
          label="Avg Hours"
          value={
            data.summary.avgHoursToRecover != null ? `${data.summary.avgHoursToRecover}h` : "n/a"
          }
        />
      </div>

      {data.trust.warning && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-100/90">
          {data.trust.warning}
        </div>
      )}

      <div className="grid gap-3 xl:grid-cols-3">
        {data.trust.notes.map((note) => (
          <div
            key={note}
            className="rounded-xl border border-white/10 bg-surface p-4 text-sm text-text-muted"
          >
            {note}
          </div>
        ))}
      </div>

      {data.playbookGroups.map((group: RecoveryPlaybookGroup) => (
        <section key={group.key} className="space-y-4">
          <div>
            <h4 className="text-base font-semibold text-text-primary">{group.label}</h4>
            <p className="mt-1 text-sm text-text-muted">{group.description}</p>
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            {group.items.map((item) => (
              <PlaybookCard
                key={item.id}
                item={item}
                ownerEmail={ownerDrafts[item.id] ?? ""}
                saving={savingId === item.id}
                onOwnerChange={(value) =>
                  setOwnerDrafts((current) => ({
                    ...current,
                    [item.id]: value,
                  }))
                }
                onCreateAction={() => void createPlaybookAction(item)}
              />
            ))}
          </div>
        </section>
      ))}

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-surface p-5">
          <h3 className="mb-4 text-sm font-medium text-text-primary">Top Resume Points</h3>
          {resumeItems.length > 0 ? (
            <BarChart items={resumeItems} direction="horizontal" />
          ) : (
            <p className="text-sm text-text-muted">No recovery data in this window.</p>
          )}
        </div>

        <div className="rounded-xl border border-white/10 bg-surface p-5">
          <h3 className="mb-4 text-sm font-medium text-text-primary">Recovery By Source</h3>
          {sourceItems.length > 0 ? (
            <BarChart items={sourceItems} direction="horizontal" />
          ) : (
            <p className="text-sm text-text-muted">No source recovery data in this window.</p>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-white/10 bg-surface p-5">
        <h3 className="mb-4 text-sm font-medium text-text-primary">Source Recovery Table</h3>
        <KpiDataTable
          data={data.recoveryBySource}
          columns={sourceColumns}
          defaultSortKey="recoveryRate"
          defaultSortDir="desc"
        />
      </div>

      <div className="rounded-xl border border-white/10 bg-surface p-5">
        <h3 className="mb-4 text-sm font-medium text-text-primary">
          Cohort Quality By First-Touch Week
        </h3>
        {data.cohorts.length === 0 ? (
          <p className="text-sm text-text-muted">No cohort data available in this window.</p>
        ) : (
          <KpiDataTable
            data={data.cohorts}
            columns={cohortColumns}
            defaultSortKey="week"
            defaultSortDir="asc"
          />
        )}
      </div>
    </div>
  );
}
