"use client";

import { useMemo, useState } from "react";
import { useAdminFetch } from "@features/admin/ui/hooks/useAdminFetch";
import { getCsrfToken } from "@shared/http/csrf-client";

type CaseStatus =
  | "needs-review"
  | "root-cause-found"
  | "question-change-candidate"
  | "monitoring"
  | "closed";
type CasePriority = "low" | "medium" | "high";
type RootCause =
  | "question-friction"
  | "traffic-quality"
  | "scoring-mismatch"
  | "release-regression"
  | "report-engagement"
  | "data-quality"
  | "unknown";

interface InvestigationCase {
  id: number;
  title: string;
  summary: string | null;
  status: CaseStatus;
  priority: CasePriority;
  owner_email: string | null;
  due_date: string | null;
  submission_id: number | null;
  segment_id: number | null;
  root_cause: RootCause | null;
  linked_chart_key: string | null;
  action_taken: string | null;
  outcome_summary: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface InvestigationData {
  cases: InvestigationCase[];
  summary: {
    total: number;
    open: number;
    overdue: number;
    highPriority: number;
  };
}

const STATUS_OPTIONS: Array<{ value: CaseStatus; label: string }> = [
  { value: "needs-review", label: "Needs Review" },
  { value: "root-cause-found", label: "Root Cause Found" },
  { value: "question-change-candidate", label: "Question Change Candidate" },
  { value: "monitoring", label: "Monitoring" },
  { value: "closed", label: "Closed" },
];

const PRIORITY_OPTIONS: Array<{ value: CasePriority; label: string }> = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];

const ROOT_CAUSE_OPTIONS: Array<{ value: RootCause; label: string }> = [
  { value: "question-friction", label: "Question Friction" },
  { value: "traffic-quality", label: "Traffic Quality" },
  { value: "scoring-mismatch", label: "Scoring Mismatch" },
  { value: "release-regression", label: "Release Regression" },
  { value: "report-engagement", label: "Report Engagement" },
  { value: "data-quality", label: "Data Quality" },
  { value: "unknown", label: "Unknown" },
];

const statusClasses: Record<CaseStatus, string> = {
  "needs-review": "bg-red-500/10 text-red-300",
  "root-cause-found": "bg-blue-500/10 text-blue-300",
  "question-change-candidate": "bg-amber-500/10 text-amber-200",
  monitoring: "bg-emerald-500/10 text-emerald-300",
  closed: "bg-white/10 text-text-muted",
};

const priorityClasses: Record<CasePriority, string> = {
  low: "bg-white/10 text-text-muted",
  medium: "bg-amber-500/10 text-amber-200",
  high: "bg-red-500/10 text-red-300",
};

const rootCauseLabel: Record<RootCause, string> = {
  "question-friction": "Question friction",
  "traffic-quality": "Traffic quality",
  "scoring-mismatch": "Scoring mismatch",
  "release-regression": "Release regression",
  "report-engagement": "Report engagement",
  "data-quality": "Data quality",
  unknown: "Unknown",
};

export default function InvestigationCasesPanel() {
  const { data, loading, error, refetch } = useAdminFetch<InvestigationData>(
    "/api/admin/investigations"
  );
  const [showForm, setShowForm] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [creating, setCreating] = useState(false);
  const [savingId, setSavingId] = useState<number | null>(null);

  const [form, setForm] = useState({
    title: "",
    summary: "",
    status: "needs-review" as CaseStatus,
    priority: "medium" as CasePriority,
    owner_email: "",
    due_date: "",
    submission_id: "",
    segment_id: "",
    root_cause: "unknown" as RootCause,
    linked_chart_key: "",
    action_taken: "",
    outcome_summary: "",
  });

  const [edits, setEdits] = useState<
    Record<
      number,
      {
        status: CaseStatus;
        priority: CasePriority;
        owner_email: string;
        due_date: string;
        root_cause: RootCause;
        linked_chart_key: string;
        action_taken: string;
        outcome_summary: string;
      }
    >
  >({});

  const orderedCases = useMemo(() => {
    const cases = data?.cases ?? [];
    return [...cases].sort((a, b) => {
      if (a.status === "closed" && b.status !== "closed") return 1;
      if (a.status !== "closed" && b.status === "closed") return -1;
      return new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime() > 0 ? -1 : 1;
    });
  }, [data?.cases]);

  async function createCase() {
    if (!form.title.trim()) return;
    setCreating(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/investigations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": getCsrfToken(),
        },
        body: JSON.stringify({
          action: "create",
          title: form.title.trim(),
          summary: form.summary.trim() || null,
          status: form.status,
          priority: form.priority,
          owner_email: form.owner_email.trim() || null,
          due_date: form.due_date || null,
          submission_id: form.submission_id ? Number(form.submission_id) : null,
          segment_id: form.segment_id ? Number(form.segment_id) : null,
          root_cause: form.root_cause,
          linked_chart_key: form.linked_chart_key.trim() || null,
          action_taken: form.action_taken.trim() || null,
          outcome_summary: form.outcome_summary.trim() || null,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error((body as { error?: string } | null)?.error || "Failed to create case.");
      }

      setForm({
        title: "",
        summary: "",
        status: "needs-review",
        priority: "medium",
        owner_email: "",
        due_date: "",
        submission_id: "",
        segment_id: "",
        root_cause: "unknown",
        linked_chart_key: "",
        action_taken: "",
        outcome_summary: "",
      });
      setShowForm(false);
      setMessage({ type: "success", text: "Investigation case created." });
      refetch();
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Unknown error." });
    } finally {
      setCreating(false);
    }
  }

  async function saveCase(item: InvestigationCase) {
    const edit = edits[item.id] ?? {
      status: item.status,
      priority: item.priority,
      owner_email: item.owner_email ?? "",
      due_date: item.due_date ?? "",
      root_cause: item.root_cause ?? "unknown",
      linked_chart_key: item.linked_chart_key ?? "",
      action_taken: item.action_taken ?? "",
      outcome_summary: item.outcome_summary ?? "",
    };

    setSavingId(item.id);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/investigations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": getCsrfToken(),
        },
        body: JSON.stringify({
          action: "update",
          caseId: item.id,
          status: edit.status,
          priority: edit.priority,
          owner_email: edit.owner_email.trim() || null,
          due_date: edit.due_date || null,
          root_cause: edit.root_cause,
          linked_chart_key: edit.linked_chart_key.trim() || null,
          action_taken: edit.action_taken.trim() || null,
          outcome_summary: edit.outcome_summary.trim() || null,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error((body as { error?: string } | null)?.error || "Failed to update case.");
      }

      setMessage({ type: "success", text: `Updated case #${item.id}.` });
      refetch();
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Unknown error." });
    } finally {
      setSavingId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-accent-purple" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-400">
        {error}
      </div>
    );
  }

  const summary = {
    total: data?.summary?.total ?? 0,
    open: data?.summary?.open ?? 0,
    overdue: data?.summary?.overdue ?? 0,
    highPriority: data?.summary?.highPriority ?? 0,
  };

  return (
    <div className="space-y-5 rounded-xl border border-white/10 bg-surface p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h3 className="font-serif text-base text-text-primary">Investigation Cases</h3>
          <p className="mt-1 text-sm text-text-muted">
            First-class case objects with owner, due date, priority, and workflow status.
          </p>
        </div>
        <button
          onClick={() => {
            setShowForm((value) => !value);
            setMessage(null);
          }}
          className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-text-primary transition hover:bg-white/10"
        >
          {showForm ? "Cancel" : "New Case"}
        </button>
      </div>

      {message && (
        <div
          className={`rounded-lg border p-3 text-sm ${
            message.type === "success"
              ? "border-green-500/20 bg-green-500/5 text-green-400"
              : "border-red-500/20 bg-red-500/5 text-red-400"
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-text-muted">Total</p>
          <p className="mt-2 text-2xl font-bold text-text-primary">{summary.total}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-text-muted">Open</p>
          <p className="mt-2 text-2xl font-bold text-text-primary">{summary.open}</p>
        </div>
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-red-300">Overdue</p>
          <p className="mt-2 text-2xl font-bold text-text-primary">{summary.overdue}</p>
        </div>
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-amber-200">
            High Priority
          </p>
          <p className="mt-2 text-2xl font-bold text-text-primary">{summary.highPriority}</p>
        </div>
      </div>

      {showForm && (
        <div className="grid gap-4 rounded-xl border border-white/10 bg-white/5 p-4 lg:grid-cols-2">
          <div className="lg:col-span-2">
            <label className="mb-1 block text-xs text-text-muted">Title</label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm((current) => ({ ...current, title: e.target.value }))}
              className="w-full rounded-lg border border-white/10 bg-surface px-3 py-2 text-sm text-text-primary focus:border-white/20 focus:outline-none"
              placeholder="e.g. Chapter 4 completion drop after wording change"
            />
          </div>
          <div className="lg:col-span-2">
            <label className="mb-1 block text-xs text-text-muted">Summary</label>
            <textarea
              value={form.summary}
              onChange={(e) => setForm((current) => ({ ...current, summary: e.target.value }))}
              className="min-h-24 w-full rounded-lg border border-white/10 bg-surface px-3 py-2 text-sm text-text-primary focus:border-white/20 focus:outline-none"
              placeholder="Why this needs attention, what changed, and what to monitor next."
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-text-muted">Status</label>
            <select
              value={form.status}
              onChange={(e) =>
                setForm((current) => ({ ...current, status: e.target.value as CaseStatus }))
              }
              className="w-full rounded-lg border border-white/10 bg-surface px-3 py-2 text-sm text-text-primary focus:border-white/20 focus:outline-none"
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-text-muted">Priority</label>
            <select
              value={form.priority}
              onChange={(e) =>
                setForm((current) => ({ ...current, priority: e.target.value as CasePriority }))
              }
              className="w-full rounded-lg border border-white/10 bg-surface px-3 py-2 text-sm text-text-primary focus:border-white/20 focus:outline-none"
            >
              {PRIORITY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-text-muted">Root Cause</label>
            <select
              value={form.root_cause}
              onChange={(e) =>
                setForm((current) => ({ ...current, root_cause: e.target.value as RootCause }))
              }
              className="w-full rounded-lg border border-white/10 bg-surface px-3 py-2 text-sm text-text-primary focus:border-white/20 focus:outline-none"
            >
              {ROOT_CAUSE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-text-muted">Owner Email</label>
            <input
              type="email"
              value={form.owner_email}
              onChange={(e) => setForm((current) => ({ ...current, owner_email: e.target.value }))}
              className="w-full rounded-lg border border-white/10 bg-surface px-3 py-2 text-sm text-text-primary focus:border-white/20 focus:outline-none"
              placeholder="owner@example.com"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-text-muted">Due Date</label>
            <input
              type="date"
              value={form.due_date}
              onChange={(e) => setForm((current) => ({ ...current, due_date: e.target.value }))}
              className="w-full rounded-lg border border-white/10 bg-surface px-3 py-2 text-sm text-text-primary focus:border-white/20 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-text-muted">Submission ID</label>
            <input
              type="number"
              min={1}
              value={form.submission_id}
              onChange={(e) =>
                setForm((current) => ({ ...current, submission_id: e.target.value }))
              }
              className="w-full rounded-lg border border-white/10 bg-surface px-3 py-2 text-sm text-text-primary focus:border-white/20 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-text-muted">Segment ID</label>
            <input
              type="number"
              min={1}
              value={form.segment_id}
              onChange={(e) => setForm((current) => ({ ...current, segment_id: e.target.value }))}
              className="w-full rounded-lg border border-white/10 bg-surface px-3 py-2 text-sm text-text-primary focus:border-white/20 focus:outline-none"
            />
          </div>
          <div className="lg:col-span-2">
            <label className="mb-1 block text-xs text-text-muted">Linked Chart Key</label>
            <input
              type="text"
              value={form.linked_chart_key}
              onChange={(e) =>
                setForm((current) => ({ ...current, linked_chart_key: e.target.value }))
              }
              className="w-full rounded-lg border border-white/10 bg-surface px-3 py-2 text-sm text-text-primary focus:border-white/20 focus:outline-none"
              placeholder="e.g. dashboard.daily or pipeline.conversion"
            />
          </div>
          <div className="lg:col-span-2">
            <label className="mb-1 block text-xs text-text-muted">Action Taken</label>
            <textarea
              value={form.action_taken}
              onChange={(e) => setForm((current) => ({ ...current, action_taken: e.target.value }))}
              className="min-h-20 w-full rounded-lg border border-white/10 bg-surface px-3 py-2 text-sm text-text-primary focus:border-white/20 focus:outline-none"
              placeholder="What was changed, tested, escalated, or decided?"
            />
          </div>
          <div className="lg:col-span-2">
            <label className="mb-1 block text-xs text-text-muted">Outcome Summary</label>
            <textarea
              value={form.outcome_summary}
              onChange={(e) =>
                setForm((current) => ({ ...current, outcome_summary: e.target.value }))
              }
              className="min-h-20 w-full rounded-lg border border-white/10 bg-surface px-3 py-2 text-sm text-text-primary focus:border-white/20 focus:outline-none"
              placeholder="What happened, what was learned, and what should happen next?"
            />
          </div>
          <div className="lg:col-span-2 flex justify-end">
            <button
              onClick={createCase}
              disabled={creating || !form.title.trim()}
              className="rounded-lg bg-accent-purple px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-purple/80 disabled:opacity-40"
            >
              {creating ? "Creating..." : "Create Case"}
            </button>
          </div>
        </div>
      )}

      {orderedCases.length === 0 ? (
        <p className="text-sm text-text-muted">No investigation cases yet.</p>
      ) : (
        <div className="space-y-3">
          {orderedCases.map((item) => {
            const edit = edits[item.id] ?? {
              status: item.status,
              priority: item.priority,
              owner_email: item.owner_email ?? "",
              due_date: item.due_date ?? "",
              root_cause: item.root_cause ?? "unknown",
              linked_chart_key: item.linked_chart_key ?? "",
              action_taken: item.action_taken ?? "",
              outcome_summary: item.outcome_summary ?? "",
            };

            return (
              <div key={item.id} className="rounded-xl border border-white/10 bg-white/5 p-4">
                <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-text-primary">#{item.id}</span>
                      <span className="font-medium text-text-primary">{item.title}</span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] uppercase tracking-wider ${statusClasses[item.status]}`}
                      >
                        {item.status}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] uppercase tracking-wider ${priorityClasses[item.priority]}`}
                      >
                        {item.priority}
                      </span>
                      {item.root_cause && (
                        <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] uppercase tracking-wider text-text-muted">
                          {rootCauseLabel[item.root_cause]}
                        </span>
                      )}
                    </div>
                    {item.summary && (
                      <p className="max-w-3xl text-sm text-text-muted">{item.summary}</p>
                    )}
                    {(item.action_taken || item.outcome_summary) && (
                      <div className="grid gap-3 lg:grid-cols-2">
                        {item.action_taken && (
                          <div className="rounded-lg border border-white/10 bg-surface px-3 py-3">
                            <p className="text-[11px] uppercase tracking-wide text-text-muted">
                              Action Taken
                            </p>
                            <p className="mt-1 text-sm text-text-primary">{item.action_taken}</p>
                          </div>
                        )}
                        {item.outcome_summary && (
                          <div className="rounded-lg border border-white/10 bg-surface px-3 py-3">
                            <p className="text-[11px] uppercase tracking-wide text-text-muted">
                              Outcome
                            </p>
                            <p className="mt-1 text-sm text-text-primary">{item.outcome_summary}</p>
                          </div>
                        )}
                      </div>
                    )}
                    <div className="flex flex-wrap gap-3 text-xs text-text-muted">
                      <span>Created by {item.created_by}</span>
                      {item.submission_id && <span>Submission #{item.submission_id}</span>}
                      {item.segment_id && <span>Segment #{item.segment_id}</span>}
                      {item.linked_chart_key && <span>Chart {item.linked_chart_key}</span>}
                      <span>Updated {new Date(item.updated_at).toLocaleString()}</span>
                    </div>
                  </div>

                  <div className="grid gap-2 md:grid-cols-4 xl:w-[640px]">
                    <select
                      value={edit.status}
                      onChange={(e) =>
                        setEdits((current) => ({
                          ...current,
                          [item.id]: { ...edit, status: e.target.value as CaseStatus },
                        }))
                      }
                      className="rounded-lg border border-white/10 bg-surface px-3 py-2 text-sm text-text-primary focus:border-white/20 focus:outline-none"
                    >
                      {STATUS_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <select
                      value={edit.priority}
                      onChange={(e) =>
                        setEdits((current) => ({
                          ...current,
                          [item.id]: { ...edit, priority: e.target.value as CasePriority },
                        }))
                      }
                      className="rounded-lg border border-white/10 bg-surface px-3 py-2 text-sm text-text-primary focus:border-white/20 focus:outline-none"
                    >
                      {PRIORITY_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <select
                      value={edit.root_cause}
                      onChange={(e) =>
                        setEdits((current) => ({
                          ...current,
                          [item.id]: { ...edit, root_cause: e.target.value as RootCause },
                        }))
                      }
                      className="rounded-lg border border-white/10 bg-surface px-3 py-2 text-sm text-text-primary focus:border-white/20 focus:outline-none"
                    >
                      {ROOT_CAUSE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <input
                      type="email"
                      value={edit.owner_email}
                      onChange={(e) =>
                        setEdits((current) => ({
                          ...current,
                          [item.id]: { ...edit, owner_email: e.target.value },
                        }))
                      }
                      placeholder="Owner email"
                      className="rounded-lg border border-white/10 bg-surface px-3 py-2 text-sm text-text-primary focus:border-white/20 focus:outline-none"
                    />
                    <input
                      type="date"
                      value={edit.due_date}
                      onChange={(e) =>
                        setEdits((current) => ({
                          ...current,
                          [item.id]: { ...edit, due_date: e.target.value },
                        }))
                      }
                      className="rounded-lg border border-white/10 bg-surface px-3 py-2 text-sm text-text-primary focus:border-white/20 focus:outline-none"
                    />
                    <input
                      type="text"
                      value={edit.linked_chart_key}
                      onChange={(e) =>
                        setEdits((current) => ({
                          ...current,
                          [item.id]: { ...edit, linked_chart_key: e.target.value },
                        }))
                      }
                      placeholder="Chart key"
                      className="md:col-span-2 rounded-lg border border-white/10 bg-surface px-3 py-2 text-sm text-text-primary focus:border-white/20 focus:outline-none"
                    />
                    <textarea
                      value={edit.action_taken}
                      onChange={(e) =>
                        setEdits((current) => ({
                          ...current,
                          [item.id]: { ...edit, action_taken: e.target.value },
                        }))
                      }
                      placeholder="Action taken"
                      className="md:col-span-4 min-h-20 rounded-lg border border-white/10 bg-surface px-3 py-2 text-sm text-text-primary focus:border-white/20 focus:outline-none"
                    />
                    <textarea
                      value={edit.outcome_summary}
                      onChange={(e) =>
                        setEdits((current) => ({
                          ...current,
                          [item.id]: { ...edit, outcome_summary: e.target.value },
                        }))
                      }
                      placeholder="Outcome summary"
                      className="md:col-span-4 min-h-20 rounded-lg border border-white/10 bg-surface px-3 py-2 text-sm text-text-primary focus:border-white/20 focus:outline-none"
                    />
                    <div className="md:col-span-4 flex justify-end">
                      <button
                        onClick={() => saveCase(item)}
                        disabled={savingId === item.id}
                        className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-text-primary transition hover:bg-white/10 disabled:opacity-40"
                      >
                        {savingId === item.id ? "Saving..." : "Save Case"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
