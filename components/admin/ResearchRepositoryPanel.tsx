"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import AdminCommentsThread from "@/components/admin/AdminCommentsThread";
import { useAdminFetch } from "@/components/admin/hooks/useAdminFetch";
import { getCsrfToken } from "@/lib/csrf-client";

export type ResearchRepositoryDraftInput = {
  title: string;
  summary: string;
  entry_type:
    | "signal"
    | "theme"
    | "pain-point"
    | "contradiction"
    | "wording"
    | "answer-quality"
    | "custom";
  status?: "draft" | "active" | "validated" | "archived";
  priority?: "low" | "medium" | "high";
  owner_email?: string;
  primary_metric_key?: string;
  question_id?: string;
  theme?: string;
  source_key?: string;
  source_href?: string;
  evidence?: string[];
  recommendation?: string;
  review_date?: string;
};

interface ResearchRepositoryMetricOption {
  key: string;
  label: string;
  href: string;
  description: string;
}

interface ResearchRepositoryEntry {
  id: number;
  title: string;
  summary: string | null;
  entry_type: ResearchRepositoryDraftInput["entry_type"];
  status: "draft" | "active" | "validated" | "archived";
  priority: "low" | "medium" | "high";
  owner_email: string | null;
  primary_metric_key: string | null;
  primary_metric_label: string | null;
  primary_metric_href: string | null;
  question_id: string | null;
  question_label: string | null;
  theme: string | null;
  source_key: string | null;
  source_href: string | null;
  evidence: string[];
  recommendation: string | null;
  review_date: string | null;
  review_state: "fresh" | "due" | "overdue" | "none";
  open_review_count: number;
  latest_review_status:
    | "requested"
    | "in-review"
    | "approved"
    | "changes-requested"
    | "rejected"
    | null;
  linked_action: {
    id: number;
    title: string;
    status: string;
    owner_email: string | null;
    review_date: string | null;
  } | null;
  created_at: string;
  updated_at: string;
}

interface ResearchRepositoryData {
  generatedAt: string;
  summary: {
    total: number;
    active: number;
    validated: number;
    overdueReviews: number;
    highPriority: number;
    linkedActions: number;
  };
  metricOptions: ResearchRepositoryMetricOption[];
  entries: ResearchRepositoryEntry[];
}

interface RepositoryFormState {
  title: string;
  summary: string;
  entry_type: ResearchRepositoryDraftInput["entry_type"];
  status: "draft" | "active" | "validated" | "archived";
  priority: "low" | "medium" | "high";
  owner_email: string;
  primary_metric_key: string;
  question_id: string;
  theme: string;
  source_key: string;
  source_href: string;
  recommendation: string;
  review_date: string;
  evidenceText: string;
}

const INPUT_CLASS =
  "w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-text-primary placeholder:text-text-muted/50 focus:border-white/20 focus:outline-none";

const STATUS_TONE: Record<ResearchRepositoryEntry["status"], string> = {
  draft: "bg-white/10 text-text-muted",
  active: "bg-cyan-500/10 text-cyan-300",
  validated: "bg-emerald-500/10 text-emerald-300",
  archived: "bg-white/10 text-text-muted",
};

const PRIORITY_TONE: Record<ResearchRepositoryEntry["priority"], string> = {
  low: "bg-white/10 text-text-muted",
  medium: "bg-amber-500/10 text-amber-200",
  high: "bg-red-500/10 text-red-300",
};

const REVIEW_TONE: Record<ResearchRepositoryEntry["review_state"], string> = {
  fresh: "bg-emerald-500/10 text-emerald-300",
  due: "bg-amber-500/10 text-amber-200",
  overdue: "bg-red-500/10 text-red-300",
  none: "bg-white/10 text-text-muted",
};

const REVIEW_LABEL: Record<ResearchRepositoryEntry["review_state"], string> = {
  fresh: "review fresh",
  due: "review due",
  overdue: "review overdue",
  none: "no review",
};

function emptyForm(): RepositoryFormState {
  return {
    title: "",
    summary: "",
    entry_type: "custom",
    status: "draft",
    priority: "medium",
    owner_email: "",
    primary_metric_key: "",
    question_id: "",
    theme: "",
    source_key: "",
    source_href: "",
    recommendation: "",
    review_date: "",
    evidenceText: "",
  };
}

function toFormState(draft?: ResearchRepositoryDraftInput | null): RepositoryFormState {
  if (!draft) return emptyForm();
  return {
    title: draft.title,
    summary: draft.summary,
    entry_type: draft.entry_type,
    status: draft.status ?? "draft",
    priority: draft.priority ?? "medium",
    owner_email: draft.owner_email ?? "",
    primary_metric_key: draft.primary_metric_key ?? "",
    question_id: draft.question_id ?? "",
    theme: draft.theme ?? "",
    source_key: draft.source_key ?? "",
    source_href: draft.source_href ?? "",
    recommendation: draft.recommendation ?? "",
    review_date: draft.review_date ?? "",
    evidenceText: (draft.evidence ?? []).join("\n"),
  };
}

function fromEntry(entry: ResearchRepositoryEntry): RepositoryFormState {
  return {
    title: entry.title,
    summary: entry.summary ?? "",
    entry_type: entry.entry_type,
    status: entry.status,
    priority: entry.priority,
    owner_email: entry.owner_email ?? "",
    primary_metric_key: entry.primary_metric_key ?? "",
    question_id: entry.question_id ?? "",
    theme: entry.theme ?? "",
    source_key: entry.source_key ?? "",
    source_href: entry.source_href ?? "",
    recommendation: entry.recommendation ?? "",
    review_date: entry.review_date ?? "",
    evidenceText: entry.evidence.join("\n"),
  };
}

function isoDate(daysFromNow: number) {
  return new Date(Date.now() + daysFromNow * 86_400_000).toISOString().slice(0, 10);
}

function buildEvidence(text: string) {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 8);
}

function impactLevel(priority: ResearchRepositoryEntry["priority"]) {
  if (priority === "high") return "high";
  if (priority === "medium") return "medium";
  return "low";
}

function entryTypeLabel(value: ResearchRepositoryEntry["entry_type"]) {
  return value.replace(/-/g, " ");
}

function SummaryTile({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "good" | "watch" | "risk" | "info";
}) {
  const classes =
    tone === "good"
      ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
      : tone === "watch"
        ? "border-amber-500/20 bg-amber-500/10 text-amber-200"
        : tone === "risk"
          ? "border-red-500/20 bg-red-500/10 text-red-300"
          : tone === "info"
            ? "border-cyan-500/20 bg-cyan-500/10 text-cyan-300"
            : "border-white/10 bg-white/5 text-text-primary";

  return (
    <div className={`rounded-xl border p-4 ${classes}`}>
      <p className="text-xs uppercase tracking-wide">{label}</p>
      <p className="mt-2 text-2xl font-bold">{value}</p>
    </div>
  );
}

function FormField({
  label,
  children,
  className = "",
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="mb-1 block text-xs text-text-muted">{label}</label>
      {children}
    </div>
  );
}

function Badge({ className, children }: { className: string; children: ReactNode }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] uppercase tracking-wide ${className}`}>
      {children}
    </span>
  );
}

function MetaCard({ label, value, meta }: { label: string; value: string; meta?: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-3">
      <p className="text-xs uppercase tracking-wide text-text-muted">{label}</p>
      <p className="mt-1 text-sm font-medium text-text-primary">{value}</p>
      {meta && <p className="mt-2 text-xs text-text-muted">{meta}</p>}
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

export default function ResearchRepositoryPanel({
  draft,
  onDraftConsumed,
}: {
  draft: ResearchRepositoryDraftInput | null;
  onDraftConsumed: () => void;
}) {
  const { data, loading, error, refetch } = useAdminFetch<ResearchRepositoryData>(
    "/api/admin/research-repository"
  );

  const [form, setForm] = useState<RepositoryFormState>(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    if (!draft) return;
    setEditingId(null);
    setForm(toFormState(draft));
    setMessage(null);
    onDraftConsumed();
    requestAnimationFrame(() => {
      document.getElementById("research-repository")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }, [draft, onDraftConsumed]);

  const entryCount = data?.entries.length ?? 0;
  const latestUpdateLabel = useMemo(() => {
    if (!data) return null;
    return new Date(data.generatedAt).toLocaleString();
  }, [data]);

  function resetForm() {
    setForm(emptyForm());
    setEditingId(null);
  }

  async function submitForm() {
    if (!form.title.trim()) return;
    setSaving(true);
    setMessage(null);

    const payload = {
      title: form.title.trim(),
      summary: form.summary.trim() || null,
      entry_type: form.entry_type,
      status: form.status,
      priority: form.priority,
      owner_email: form.owner_email.trim() || null,
      primary_metric_key: form.primary_metric_key || null,
      question_id: form.question_id.trim() || null,
      theme: form.theme.trim() || null,
      source_key: form.source_key.trim() || null,
      source_href: form.source_href.trim() || null,
      recommendation: form.recommendation.trim() || null,
      review_date: form.review_date || null,
      evidence: buildEvidence(form.evidenceText),
    };

    try {
      const res = await fetch(
        editingId == null
          ? "/api/admin/research-repository"
          : `/api/admin/research-repository/${editingId}`,
        {
          method: editingId == null ? "POST" : "PATCH",
          headers: {
            "Content-Type": "application/json",
            "x-csrf-token": getCsrfToken(),
          },
          body: JSON.stringify(payload),
        }
      );

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(
          (body as { error?: string } | null)?.error || "Failed to save repository entry."
        );
      }

      setMessage({
        type: "success",
        text:
          editingId == null
            ? "Saved research repository entry."
            : `Updated repository entry #${editingId}.`,
      });
      resetForm();
      refetch();
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to save repository entry.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function createAction(entry: ResearchRepositoryEntry) {
    setSaving(true);
    setMessage(null);
    try {
      const actionResponse = await fetch("/api/admin/actions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": getCsrfToken(),
        },
        body: JSON.stringify({
          title: `Research follow-up: ${entry.title}`,
          description:
            entry.recommendation ??
            entry.summary ??
            `Follow up research repository entry ${entry.id}.`,
          priority: entry.priority,
          owner_email: entry.owner_email,
          source_type: "investigation",
          source_id: entry.id,
          metric_key: entry.primary_metric_key,
          expected_impact: entry.summary ?? entry.recommendation,
          measured_outcome: null,
          linked_href: entry.source_href ?? "/admin/research",
          due_date: entry.review_date ?? isoDate(14),
          review_date: entry.review_date ?? isoDate(21),
        }),
      });

      if (!actionResponse.ok) {
        const body = await actionResponse.json().catch(() => null);
        throw new Error(
          (body as { error?: string } | null)?.error || "Failed to create action item."
        );
      }

      const actionJson = (await actionResponse.json().catch(() => null)) as { id?: number } | null;
      if (actionJson?.id) {
        const linkResponse = await fetch(`/api/admin/research-repository/${entry.id}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "x-csrf-token": getCsrfToken(),
          },
          body: JSON.stringify({
            linked_action_id: actionJson.id,
            owner_email: entry.owner_email,
          }),
        });

        if (!linkResponse.ok) {
          const body = await linkResponse.json().catch(() => null);
          throw new Error(
            (body as { error?: string } | null)?.error ||
              "Action was created, but the repository link failed."
          );
        }
      }

      setMessage({
        type: "success",
        text: `Created follow-up action for repository entry #${entry.id}.`,
      });
      refetch();
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to create follow-up action.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function queueReview(entry: ResearchRepositoryEntry) {
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
          title: `Review research entry: ${entry.title}`,
          description: entry.summary ?? entry.recommendation ?? null,
          resource_type: "research-entry",
          resource_id: entry.id,
          linked_metric_key: entry.primary_metric_key,
          impact_level: impactLevel(entry.priority),
          source_href: entry.source_href ?? "/admin/research",
          due_date: entry.review_date ?? isoDate(14),
          payload_snapshot: {
            entry_type: entry.entry_type,
            question_id: entry.question_id,
            theme: entry.theme,
            source_key: entry.source_key,
          },
        }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(
          (body as { error?: string } | null)?.error || "Failed to queue review request."
        );
      }

      setMessage({
        type: "success",
        text: `Queued review for repository entry #${entry.id}.`,
      });
      refetch();
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to queue review request.",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <section
      id="research-repository"
      className="rounded-3xl border border-white/10 bg-surface/80 p-5"
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h3 className="font-serif text-xl font-semibold text-text-primary">
            Research Repository
          </h3>
          <p className="mt-1 max-w-4xl text-sm text-text-muted">
            Turn raw research signals into durable entries with owners, reviews, evidence, and
            follow-through.
          </p>
        </div>
        <p className="text-xs text-text-muted">
          {latestUpdateLabel ? `Updated ${latestUpdateLabel}` : `${entryCount} entries`}
        </p>
      </div>

      {message && (
        <div
          className={`mt-4 rounded-xl border p-4 text-sm ${
            message.type === "success"
              ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-300"
              : "border-red-500/20 bg-red-500/5 text-red-300"
          }`}
        >
          {message.text}
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-10">
          <div className="h-7 w-7 animate-spin rounded-full border-2 border-white/20 border-t-accent-purple" />
        </div>
      )}

      {error && !loading && (
        <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-300">
          {error}
        </div>
      )}

      {!loading && !error && data && (
        <div className="mt-5 space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
            <SummaryTile label="Entries" value={String(data.summary.total)} />
            <SummaryTile label="Active" value={String(data.summary.active)} tone="info" />
            <SummaryTile label="Validated" value={String(data.summary.validated)} tone="good" />
            <SummaryTile
              label="Overdue Reviews"
              value={String(data.summary.overdueReviews)}
              tone="risk"
            />
            <SummaryTile
              label="High Priority"
              value={String(data.summary.highPriority)}
              tone="watch"
            />
            <SummaryTile label="Linked Actions" value={String(data.summary.linkedActions)} />
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/10 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h4 className="text-sm font-semibold text-text-primary">
                  {editingId == null ? "Capture Repository Entry" : `Edit Entry #${editingId}`}
                </h4>
                <p className="mt-1 text-sm text-text-muted">
                  Promote research signals into a persistent operating record.
                </p>
              </div>
              {(editingId != null || form.title || form.summary || form.evidenceText) && (
                <button
                  onClick={resetForm}
                  className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-text-primary transition hover:bg-white/10"
                >
                  Reset form
                </button>
              )}
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <FormField label="Title">
                <input
                  value={form.title}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, title: event.target.value }))
                  }
                  className={INPUT_CLASS}
                  placeholder="e.g. Contradiction spike in desire-style answers"
                />
              </FormField>
              <FormField label="Owner Email">
                <input
                  type="email"
                  value={form.owner_email}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, owner_email: event.target.value }))
                  }
                  className={INPUT_CLASS}
                  placeholder="owner@loveiq.com"
                />
              </FormField>
              <FormField label="Entry Type">
                <select
                  value={form.entry_type}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      entry_type: event.target.value as RepositoryFormState["entry_type"],
                    }))
                  }
                  className={INPUT_CLASS}
                >
                  <option value="signal">Signal</option>
                  <option value="theme">Theme</option>
                  <option value="pain-point">Pain point</option>
                  <option value="contradiction">Contradiction</option>
                  <option value="wording">Wording</option>
                  <option value="answer-quality">Answer quality</option>
                  <option value="custom">Custom</option>
                </select>
              </FormField>
              <FormField label="Primary Metric">
                <select
                  value={form.primary_metric_key}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      primary_metric_key: event.target.value,
                    }))
                  }
                  className={INPUT_CLASS}
                >
                  <option value="">No linked metric</option>
                  {data.metricOptions.map((metric) => (
                    <option key={metric.key} value={metric.key}>
                      {metric.label}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField label="Status">
                <select
                  value={form.status}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      status: event.target.value as RepositoryFormState["status"],
                    }))
                  }
                  className={INPUT_CLASS}
                >
                  <option value="draft">Draft</option>
                  <option value="active">Active</option>
                  <option value="validated">Validated</option>
                  <option value="archived">Archived</option>
                </select>
              </FormField>
              <FormField label="Priority">
                <select
                  value={form.priority}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      priority: event.target.value as RepositoryFormState["priority"],
                    }))
                  }
                  className={INPUT_CLASS}
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </FormField>
              <FormField label="Question ID">
                <input
                  value={form.question_id}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, question_id: event.target.value }))
                  }
                  className={INPUT_CLASS}
                  placeholder="e.g. 01003"
                />
              </FormField>
              <FormField label="Theme">
                <input
                  value={form.theme}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, theme: event.target.value }))
                  }
                  className={INPUT_CLASS}
                  placeholder="e.g. communication"
                />
              </FormField>
              <FormField label="Source Key">
                <input
                  value={form.source_key}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, source_key: event.target.value }))
                  }
                  className={INPUT_CLASS}
                  placeholder="stable source id or rule key"
                />
              </FormField>
              <FormField label="Review Date">
                <input
                  type="date"
                  value={form.review_date}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, review_date: event.target.value }))
                  }
                  className={INPUT_CLASS}
                />
              </FormField>
              <FormField label="Source Href" className="lg:col-span-2">
                <input
                  value={form.source_href}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, source_href: event.target.value }))
                  }
                  className={INPUT_CLASS}
                  placeholder="/admin/research or another admin route"
                />
              </FormField>
              <FormField label="Summary" className="lg:col-span-2">
                <textarea
                  value={form.summary}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, summary: event.target.value }))
                  }
                  className={`${INPUT_CLASS} min-h-24`}
                  placeholder="Short explanation of why this research entry matters."
                />
              </FormField>
              <FormField label="Recommendation" className="lg:col-span-2">
                <textarea
                  value={form.recommendation}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, recommendation: event.target.value }))
                  }
                  className={`${INPUT_CLASS} min-h-24`}
                  placeholder="Recommended next action, review, or question change."
                />
              </FormField>
              <FormField label="Evidence (one line per note)" className="lg:col-span-2">
                <textarea
                  value={form.evidenceText}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, evidenceText: event.target.value }))
                  }
                  className={`${INPUT_CLASS} min-h-32`}
                  placeholder="Paste excerpts, issues, or behavioral evidence here."
                />
              </FormField>
            </div>

            <div className="mt-4 flex flex-wrap justify-end gap-3">
              <button
                onClick={resetForm}
                className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-text-primary transition hover:bg-white/10"
              >
                Cancel
              </button>
              <button
                onClick={() => void submitForm()}
                disabled={saving || !form.title.trim()}
                className="rounded-lg bg-accent-purple px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-purple/80 disabled:opacity-40"
              >
                {saving ? "Saving..." : editingId == null ? "Save entry" : "Update entry"}
              </button>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h4 className="text-sm font-semibold text-text-primary">Repository Backlog</h4>
                <p className="mt-1 text-sm text-text-muted">
                  Durable research entries with evidence, owner, review posture, and execution
                  hooks.
                </p>
              </div>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-text-muted">
                {data.entries.length} entries
              </span>
            </div>

            {data.entries.length === 0 && (
              <div className="rounded-xl border border-dashed border-white/10 p-6 text-sm text-text-muted">
                No repository entries yet. Promote a research signal or create one manually above.
              </div>
            )}

            <div className="grid gap-4 xl:grid-cols-2">
              {data.entries.map((entry) => (
                <div key={entry.id} className="rounded-2xl border border-white/10 bg-black/10 p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge className={STATUS_TONE[entry.status]}>{entry.status}</Badge>
                        <Badge className={PRIORITY_TONE[entry.priority]}>{entry.priority}</Badge>
                        <Badge className="bg-white/10 text-text-muted">
                          {entryTypeLabel(entry.entry_type)}
                        </Badge>
                        <Badge className={REVIEW_TONE[entry.review_state]}>
                          {REVIEW_LABEL[entry.review_state]}
                        </Badge>
                      </div>
                      <p className="mt-2 text-lg font-semibold text-text-primary">{entry.title}</p>
                      {entry.summary && (
                        <p className="mt-2 text-sm text-text-muted">{entry.summary}</p>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => {
                          setEditingId(entry.id);
                          setForm(fromEntry(entry));
                          setMessage(null);
                        }}
                        className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-text-primary transition hover:bg-white/10"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => void createAction(entry)}
                        disabled={saving}
                        className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-text-primary transition hover:bg-white/10 disabled:opacity-40"
                      >
                        {entry.linked_action ? "Refresh action link" : "Create action"}
                      </button>
                      <button
                        onClick={() => void queueReview(entry)}
                        disabled={saving}
                        className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-text-primary transition hover:bg-white/10 disabled:opacity-40"
                      >
                        Queue review
                      </button>
                      {entry.source_href && (
                        <a
                          href={entry.source_href}
                          className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-text-primary transition hover:bg-white/10"
                        >
                          Open source
                        </a>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <MetaCard label="Metric" value={entry.primary_metric_label ?? "Unlinked"} />
                    <MetaCard
                      label="Question"
                      value={entry.question_label ?? entry.theme ?? "N/A"}
                    />
                    <MetaCard label="Owner" value={entry.owner_email ?? "Unassigned"} />
                    <MetaCard
                      label="Review Date"
                      value={entry.review_date ?? "Not scheduled"}
                      meta={
                        entry.open_review_count > 0
                          ? `${entry.open_review_count} open review${entry.open_review_count === 1 ? "" : "s"}`
                          : (entry.latest_review_status ?? undefined)
                      }
                    />
                  </div>

                  {(entry.recommendation || entry.linked_action) && (
                    <div className="mt-4 grid gap-3 lg:grid-cols-2">
                      <NarrativeCard label="Recommendation" value={entry.recommendation} />
                      <NarrativeCard
                        label="Linked Action"
                        value={
                          entry.linked_action
                            ? `${entry.linked_action.title} (${entry.linked_action.status})`
                            : null
                        }
                      />
                    </div>
                  )}

                  {entry.evidence.length > 0 && (
                    <div className="mt-4 space-y-2">
                      <p className="text-xs uppercase tracking-wide text-text-muted">Evidence</p>
                      {entry.evidence.map((item, index) => (
                        <div
                          key={`${entry.id}-evidence-${index}`}
                          className="rounded-lg border border-white/10 bg-white/5 px-3 py-3 text-sm text-text-muted"
                        >
                          {item}
                        </div>
                      ))}
                    </div>
                  )}

                  {entry.primary_metric_href && (
                    <div className="mt-4">
                      <a
                        href={entry.primary_metric_href}
                        className="text-sm text-accent-purple transition hover:text-accent-purple/80"
                      >
                        Open linked metric
                      </a>
                    </div>
                  )}

                  <AdminCommentsThread
                    resourceType="research-entry"
                    resourceId={entry.id}
                    title="Repository Discussion"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
