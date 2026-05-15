"use client";

import { useState } from "react";
import AdminCommentsThread from "@features/admin/ui/AdminCommentsThread";
import { useAdminFetch } from "@features/admin/ui/hooks/useAdminFetch";
import type { AdminReviewResourceType } from "@features/admin/server/reviews";
import { getCsrfToken } from "@shared/http/csrf-client";

type ReviewStatus = "requested" | "in-review" | "approved" | "changes-requested" | "rejected";
type ImpactLevel = "low" | "medium" | "high" | "critical";
type ReviewResourceType = AdminReviewResourceType;

interface ReviewItem {
  id: number;
  admin_email: string;
  title: string;
  description: string | null;
  resource_type: ReviewResourceType;
  resource_id: number | null;
  linked_metric_key: string | null;
  impact_level: ImpactLevel;
  status: ReviewStatus;
  reviewer_email: string | null;
  decision_note: string | null;
  source_href: string | null;
  due_date: string | null;
  requested_at: string;
  reviewed_at: string | null;
  updated_at: string;
}

interface ReviewQueueResponse {
  summary: {
    total: number;
    requested: number;
    inReview: number;
    approved: number;
    changesRequested: number;
    overdue: number;
  };
  items: ReviewItem[];
}

const REVIEW_STATUSES: ReviewStatus[] = [
  "requested",
  "in-review",
  "approved",
  "changes-requested",
  "rejected",
];
const IMPACT_LEVELS: ImpactLevel[] = ["low", "medium", "high", "critical"];
const RESOURCE_TYPES: ReviewResourceType[] = [
  "metric-registry",
  "alert-policy",
  "decision-entry",
  "release-entry",
  "experiment",
  "benchmark",
  "general",
];

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-surface p-4">
      <p className="text-xs uppercase tracking-wide text-text-muted">{label}</p>
      <p className="mt-2 font-serif text-2xl font-semibold text-text-primary">{value}</p>
    </div>
  );
}

export default function ReviewQueueTab() {
  const { data, loading, error, refetch } =
    useAdminFetch<ReviewQueueResponse>("/api/admin/reviews");
  const [message, setMessage] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [draft, setDraft] = useState({
    title: "",
    description: "",
    resource_type: "general" as ReviewResourceType,
    resource_id: "",
    linked_metric_key: "",
    impact_level: "medium" as ImpactLevel,
    reviewer_email: "",
    source_href: "",
    due_date: "",
  });
  const [reviewDrafts, setReviewDrafts] = useState<
    Record<
      number,
      {
        status: ReviewStatus;
        reviewer_email: string;
        decision_note: string;
        due_date: string;
        impact_level: ImpactLevel;
      }
    >
  >({});

  async function createReview(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingId(-1);
    setMessage(null);

    const res = await fetch("/api/admin/reviews", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-csrf-token": getCsrfToken(),
      },
      body: JSON.stringify({
        title: draft.title,
        description: draft.description || null,
        resource_type: draft.resource_type,
        resource_id: draft.resource_id ? Number(draft.resource_id) : null,
        linked_metric_key: draft.linked_metric_key || null,
        impact_level: draft.impact_level,
        reviewer_email: draft.reviewer_email || null,
        source_href: draft.source_href || null,
        due_date: draft.due_date || null,
      }),
    });

    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    if (!res.ok) {
      setMessage(body?.error || "Unable to create review request.");
      setSavingId(null);
      return;
    }

    setDraft({
      title: "",
      description: "",
      resource_type: "general",
      resource_id: "",
      linked_metric_key: "",
      impact_level: "medium",
      reviewer_email: "",
      source_href: "",
      due_date: "",
    });
    setSavingId(null);
    setMessage("Review request created.");
    refetch();
  }

  async function saveReview(item: ReviewItem) {
    const draftState = reviewDrafts[item.id] ?? {
      status: item.status,
      reviewer_email: item.reviewer_email ?? "",
      decision_note: item.decision_note ?? "",
      due_date: item.due_date ?? "",
      impact_level: item.impact_level,
    };
    setSavingId(item.id);
    setMessage(null);

    const res = await fetch(`/api/admin/reviews/${item.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-csrf-token": getCsrfToken(),
      },
      body: JSON.stringify({
        status: draftState.status,
        reviewer_email: draftState.reviewer_email || null,
        decision_note: draftState.decision_note || null,
        due_date: draftState.due_date || null,
        impact_level: draftState.impact_level,
      }),
    });

    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    if (!res.ok) {
      setMessage(body?.error || "Unable to update review request.");
      setSavingId(null);
      return;
    }

    setSavingId(null);
    setMessage(`Updated review #${item.id}.`);
    refetch();
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-accent-purple" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-center text-sm text-red-400">
        {error || "Failed to load review queue."}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <SummaryTile label="Total" value={String(data.summary.total)} />
        <SummaryTile label="Requested" value={String(data.summary.requested)} />
        <SummaryTile label="In Review" value={String(data.summary.inReview)} />
        <SummaryTile label="Changes Requested" value={String(data.summary.changesRequested)} />
        <SummaryTile label="Overdue" value={String(data.summary.overdue)} />
      </div>

      <form onSubmit={createReview} className="rounded-xl border border-white/10 bg-surface p-5">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-medium text-text-primary">Create review request</h3>
          <span className="text-xs uppercase tracking-wide text-text-muted">governance</span>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <input
            value={draft.title}
            onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
            placeholder="Review title"
            className="rounded-lg border border-white/10 bg-[#1a1025] px-3 py-2 text-sm text-text-primary outline-none"
            required
          />
          <select
            value={draft.resource_type}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                resource_type: event.target.value as ReviewResourceType,
              }))
            }
            className="rounded-lg border border-white/10 bg-[#1a1025] px-3 py-2 text-sm text-text-primary outline-none"
          >
            {RESOURCE_TYPES.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <input
            value={draft.resource_id}
            onChange={(event) =>
              setDraft((current) => ({ ...current, resource_id: event.target.value }))
            }
            placeholder="Resource ID"
            className="rounded-lg border border-white/10 bg-[#1a1025] px-3 py-2 text-sm text-text-primary outline-none"
          />
          <input
            value={draft.linked_metric_key}
            onChange={(event) =>
              setDraft((current) => ({ ...current, linked_metric_key: event.target.value }))
            }
            placeholder="Metric key"
            className="rounded-lg border border-white/10 bg-[#1a1025] px-3 py-2 text-sm text-text-primary outline-none"
          />
          <select
            value={draft.impact_level}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                impact_level: event.target.value as ImpactLevel,
              }))
            }
            className="rounded-lg border border-white/10 bg-[#1a1025] px-3 py-2 text-sm text-text-primary outline-none"
          >
            {IMPACT_LEVELS.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <input
            type="date"
            value={draft.due_date}
            onChange={(event) =>
              setDraft((current) => ({ ...current, due_date: event.target.value }))
            }
            className="rounded-lg border border-white/10 bg-[#1a1025] px-3 py-2 text-sm text-text-primary outline-none"
          />
          <input
            value={draft.reviewer_email}
            onChange={(event) =>
              setDraft((current) => ({ ...current, reviewer_email: event.target.value }))
            }
            placeholder="Reviewer email"
            className="rounded-lg border border-white/10 bg-[#1a1025] px-3 py-2 text-sm text-text-primary outline-none"
          />
          <input
            value={draft.source_href}
            onChange={(event) =>
              setDraft((current) => ({ ...current, source_href: event.target.value }))
            }
            placeholder="/admin/..."
            className="rounded-lg border border-white/10 bg-[#1a1025] px-3 py-2 text-sm text-text-primary outline-none"
          />
          <textarea
            value={draft.description}
            onChange={(event) =>
              setDraft((current) => ({ ...current, description: event.target.value }))
            }
            rows={3}
            placeholder="Why this needs review"
            className="md:col-span-2 xl:col-span-3 rounded-lg border border-white/10 bg-[#1a1025] px-3 py-2 text-sm text-text-primary outline-none"
          />
        </div>
        <div className="mt-4 flex items-center justify-between gap-3">
          <p className="text-xs text-text-muted">
            Use this queue for risky config changes, scoring decisions, and benchmark governance.
          </p>
          <button
            disabled={savingId === -1}
            className="rounded-lg border border-white/10 px-4 py-2 text-sm text-text-primary transition hover:bg-white/5 disabled:opacity-60"
          >
            Create request
          </button>
        </div>
        {message && <p className="mt-3 text-sm text-text-muted">{message}</p>}
      </form>

      <div className="space-y-3">
        {data.items.length === 0 ? (
          <p className="rounded-xl border border-dashed border-white/10 p-6 text-sm text-text-muted">
            No review requests created yet.
          </p>
        ) : (
          data.items.map((item) => {
            const draftState = reviewDrafts[item.id] ?? {
              status: item.status,
              reviewer_email: item.reviewer_email ?? "",
              decision_note: item.decision_note ?? "",
              due_date: item.due_date ?? "",
              impact_level: item.impact_level,
            };

            return (
              <div key={item.id} className="rounded-xl border border-white/10 bg-surface p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] uppercase tracking-wide text-text-muted">
                        {item.resource_type}
                      </span>
                      <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] uppercase tracking-wide text-text-muted">
                        {item.impact_level}
                      </span>
                      <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] uppercase tracking-wide text-text-muted">
                        {item.status}
                      </span>
                      {item.linked_metric_key && (
                        <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] uppercase tracking-wide text-text-muted">
                          {item.linked_metric_key}
                        </span>
                      )}
                    </div>
                    <p className="mt-2 font-medium text-text-primary">{item.title}</p>
                    <p className="mt-1 text-xs text-text-muted">
                      Requested by {item.admin_email}
                      {item.resource_id != null ? ` | resource #${item.resource_id}` : ""}
                      {item.due_date ? ` | due ${item.due_date}` : ""}
                    </p>
                    {item.description && (
                      <p className="mt-2 text-sm text-text-muted">{item.description}</p>
                    )}
                  </div>
                  {item.source_href && (
                    <a
                      href={item.source_href}
                      className="rounded-lg border border-white/10 px-3 py-2 text-xs text-text-muted transition hover:bg-white/5 hover:text-text-primary"
                    >
                      Open source
                    </a>
                  )}
                </div>

                <div className="mt-4 grid gap-3 lg:grid-cols-[180px_200px_160px_minmax(0,1fr)_auto]">
                  <select
                    value={draftState.status}
                    onChange={(event) =>
                      setReviewDrafts((current) => ({
                        ...current,
                        [item.id]: { ...draftState, status: event.target.value as ReviewStatus },
                      }))
                    }
                    className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-text-primary outline-none"
                  >
                    {REVIEW_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                  <select
                    value={draftState.impact_level}
                    onChange={(event) =>
                      setReviewDrafts((current) => ({
                        ...current,
                        [item.id]: {
                          ...draftState,
                          impact_level: event.target.value as ImpactLevel,
                        },
                      }))
                    }
                    className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-text-primary outline-none"
                  >
                    {IMPACT_LEVELS.map((level) => (
                      <option key={level} value={level}>
                        {level}
                      </option>
                    ))}
                  </select>
                  <input
                    type="date"
                    value={draftState.due_date}
                    onChange={(event) =>
                      setReviewDrafts((current) => ({
                        ...current,
                        [item.id]: { ...draftState, due_date: event.target.value },
                      }))
                    }
                    className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-text-primary outline-none"
                  />
                  <input
                    value={draftState.reviewer_email}
                    onChange={(event) =>
                      setReviewDrafts((current) => ({
                        ...current,
                        [item.id]: { ...draftState, reviewer_email: event.target.value },
                      }))
                    }
                    placeholder="Reviewer email"
                    className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-text-primary outline-none"
                  />
                  <button
                    onClick={() => void saveReview(item)}
                    disabled={savingId === item.id}
                    className="rounded-lg bg-accent-purple px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-purple/80 disabled:opacity-50"
                  >
                    {savingId === item.id ? "Saving..." : "Save"}
                  </button>
                </div>

                <textarea
                  value={draftState.decision_note}
                  onChange={(event) =>
                    setReviewDrafts((current) => ({
                      ...current,
                      [item.id]: { ...draftState, decision_note: event.target.value },
                    }))
                  }
                  rows={2}
                  placeholder="Decision note or requested changes"
                  className="mt-3 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-text-primary outline-none"
                />

                <AdminCommentsThread
                  resourceType="review-request"
                  resourceId={item.id}
                  title="Review Discussion"
                />
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
