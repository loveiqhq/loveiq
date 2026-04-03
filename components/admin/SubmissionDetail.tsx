"use client";

import { useState } from "react";
import { useAdminFetch } from "./hooks/useAdminFetch";
import AnswerDisplay from "./AnswerDisplay";
import BarChart from "./BarChart";
import ConfirmDialog from "./ConfirmDialog";
import JourneyTimeline from "./JourneyTimeline";
import NotesSection from "./NotesSection";
import { getCsrfToken } from "@/lib/csrf-client";
import { maskEmail } from "@/lib/admin/format";

interface SubmissionData {
  submission: {
    id: number;
    email: string;
    first_name: string;
    status: string;
    started_at: string;
    completed_at: string;
    duration_ms: number | null;
    utm_source: string | null;
  };
  answers: Array<{
    q_id: string;
    question_text?: string;
    answer_type?: string;
    answer_value: string | string[] | number | null;
    time_spent_seconds?: number | null;
    revision_count?: number | null;
    was_skipped?: boolean;
  }>;
  scoring: {
    primary_archetype: string;
    percentages: Record<string, number>;
    raw_scores: Record<string, number>;
    engine_version: string;
    scored_at: string;
    v5_primary_archetype: string | null;
    v5_percentages: Record<string, number> | null;
    v5_raw_scores: Record<string, number> | null;
  } | null;
}

export default function SubmissionDetail({ id }: { id: string }) {
  const { data, loading, error, refetch } = useAdminFetch<SubmissionData>(
    `/api/admin/submissions/${id}`
  );
  const [showDelete, setShowDelete] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  async function updateStatus(status: string) {
    setActionLoading(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/admin/submissions/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": getCsrfToken(),
        },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setActionError((body as { error?: string } | null)?.error || "Action failed.");
        return;
      }
      refetch();
    } catch {
      setActionError("Network error. Please try again.");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleDelete() {
    setShowDelete(false);
    setActionLoading(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/admin/submissions/${id}`, {
        method: "DELETE",
        headers: { "x-csrf-token": getCsrfToken() },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setActionError((body as { error?: string } | null)?.error || "Delete failed.");
        return;
      }
      window.location.href = "/admin/submissions";
    } catch {
      setActionError("Network error. Please try again.");
    } finally {
      setActionLoading(false);
    }
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
        {error || "Submission not found"}
      </div>
    );
  }

  const { submission, answers, scoring } = data;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <a href="/admin/submissions" className="text-sm text-text-muted hover:text-text-primary">
          &larr; Back
        </a>
        <h2 className="font-serif text-xl font-bold text-text-primary">
          Submission #{submission.id}
        </h2>
      </div>

      {/* Info card */}
      <div className="rounded-xl border border-white/10 bg-surface p-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-xs text-text-muted">Email</p>
            <p className="text-sm text-text-primary">{maskEmail(submission.email)}</p>
          </div>
          <div>
            <p className="text-xs text-text-muted">Name</p>
            <p className="text-sm text-text-primary">{submission.first_name}</p>
          </div>
          <div>
            <p className="text-xs text-text-muted">Status</p>
            <p className="text-sm text-text-primary">{submission.status}</p>
          </div>
          <div>
            <p className="text-xs text-text-muted">Completed</p>
            <p className="text-sm text-text-primary">
              {new Date(submission.completed_at).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          </div>
          {submission.duration_ms != null && (
            <div>
              <p className="text-xs text-text-muted">Duration</p>
              <p className="text-sm text-text-primary">
                {(() => {
                  const totalSec = Math.round(submission.duration_ms / 1000);
                  const min = Math.floor(totalSec / 60);
                  const sec = totalSec % 60;
                  return min > 0 ? `${min} min ${sec} sec` : `${sec} sec`;
                })()}
              </p>
            </div>
          )}
          <div>
            <p className="text-xs text-text-muted">UTM Source</p>
            <p className="text-sm text-text-primary">{submission.utm_source || "Direct"}</p>
          </div>
        </div>
      </div>

      {/* Journey Timeline */}
      <JourneyTimeline id={id} />

      {/* Scoring Result — V4 */}
      <div className="rounded-xl border border-white/10 bg-surface p-5">
        <h3 className="mb-4 text-sm font-semibold text-text-primary">
          {scoring ? "Scoring Result (V4 — Probability %)" : "Not Scored"}
        </h3>
        {scoring ? (
          <>
            <div className="mb-4 flex items-baseline gap-3">
              <span className="font-serif text-lg font-bold text-accent-purple">
                {scoring.primary_archetype}
              </span>
              <span className="text-xs text-text-muted">
                {scoring.engine_version} (V6Q) &middot;{" "}
                {new Date(scoring.scored_at).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </div>
            <BarChart
              items={Object.entries(scoring.percentages)
                .sort(([, a], [, b]) => b - a)
                .map(([label, value]) => ({
                  label,
                  value: Math.round(value * 10) / 10,
                }))}
              direction="horizontal"
            />
          </>
        ) : (
          <p className="text-sm text-text-muted">No scoring data available for this submission.</p>
        )}
      </div>

      {/* Scoring Result — V5 */}
      {scoring?.v5_percentages && (
        <div className="rounded-xl border border-white/10 bg-surface p-5">
          <h3 className="mb-4 text-sm font-semibold text-text-primary">
            Scoring Result (V5 — Match %)
          </h3>
          <div className="mb-4 flex items-baseline gap-3">
            <span className="font-serif text-lg font-bold text-accent-orange">
              {scoring.v5_primary_archetype}
            </span>
            <span className="text-xs text-text-muted">Independent scores (do not sum to 100)</span>
          </div>
          <BarChart
            items={Object.entries(scoring.v5_percentages)
              .sort(([, a], [, b]) => b - a)
              .map(([label, value]) => ({
                label,
                value: Math.round(value * 10) / 10,
              }))}
            direction="horizontal"
          />
        </div>
      )}

      {/* Actions */}
      {actionError && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-400">
          {actionError}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => updateStatus("flagged")}
          disabled={actionLoading || submission.status === "flagged"}
          aria-label="Flag submission"
          className="rounded-lg border border-yellow-500/20 px-3 py-1.5 text-sm text-yellow-400 transition hover:bg-yellow-500/10 disabled:opacity-40"
        >
          Flag
        </button>
        <button
          onClick={() => updateStatus("archived")}
          disabled={actionLoading || submission.status === "archived"}
          aria-label="Archive submission"
          className="rounded-lg border border-white/10 px-3 py-1.5 text-sm text-text-muted transition hover:bg-white/5 disabled:opacity-40"
        >
          Archive
        </button>
        <button
          onClick={() => updateStatus("completed")}
          disabled={actionLoading || submission.status === "completed"}
          aria-label="Restore submission"
          className="rounded-lg border border-green-500/20 px-3 py-1.5 text-sm text-green-400 transition hover:bg-green-500/10 disabled:opacity-40"
        >
          Restore
        </button>
        <button
          onClick={() => setShowDelete(true)}
          disabled={actionLoading}
          aria-label="Delete submission"
          className="rounded-lg border border-red-500/20 px-3 py-1.5 text-sm text-red-400 transition hover:bg-red-500/10 disabled:opacity-40"
        >
          Delete
        </button>
      </div>

      {/* Notes */}
      <NotesSection submissionId={id} />

      {/* Answers */}
      <div className="rounded-xl border border-white/10 bg-surface p-5">
        <h3 className="mb-4 text-sm font-semibold text-text-primary">Answers ({answers.length})</h3>
        {answers.length === 0 ? (
          <p className="text-sm text-text-muted">No answers recorded</p>
        ) : (
          answers.map((a) => <AnswerDisplay key={a.q_id} answer={a} />)
        )}
      </div>

      <ConfirmDialog
        open={showDelete}
        title="Delete Submission"
        message="This will permanently delete this submission and all its answers. This cannot be undone."
        confirmLabel="Delete permanently"
        onConfirm={handleDelete}
        onCancel={() => setShowDelete(false)}
      />
    </div>
  );
}
