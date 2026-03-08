"use client";

import { useState } from "react";
import { useAdminFetch } from "./hooks/useAdminFetch";
import AnswerDisplay from "./AnswerDisplay";
import ConfirmDialog from "./ConfirmDialog";

interface SubmissionData {
  submission: {
    id: number;
    email: string;
    first_name: string;
    status: string;
    started_at: string;
    completed_at: string;
    duration_ms: number | null;
  };
  answers: Array<{
    q_id: string;
    question_text?: string;
    answer_type?: string;
    answer_value: string | string[] | number | null;
  }>;
}

function getCsrfToken(): string {
  const cookie = document.cookie
    .split("; ")
    .find((row) => row.startsWith("__Host-csrf=") || row.startsWith("__csrf="));
  return cookie?.substring(cookie.indexOf("=") + 1) || "";
}

export default function SubmissionDetail({ id }: { id: string }) {
  const { data, loading, error, refetch } = useAdminFetch<SubmissionData>(
    `/api/admin/submissions/${id}`
  );
  const [showDelete, setShowDelete] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  async function updateStatus(status: string) {
    setActionLoading(true);
    try {
      await fetch(`/api/admin/submissions/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": getCsrfToken(),
        },
        body: JSON.stringify({ status }),
      });
      refetch();
    } finally {
      setActionLoading(false);
    }
  }

  async function handleDelete() {
    setShowDelete(false);
    setActionLoading(true);
    try {
      await fetch(`/api/admin/submissions/${id}`, {
        method: "DELETE",
        headers: { "x-csrf-token": getCsrfToken() },
      });
      window.location.href = "/admin/submissions";
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

  const { submission, answers } = data;

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
            <p className="text-sm text-text-primary">{submission.email}</p>
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
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => updateStatus("flagged")}
          disabled={actionLoading || submission.status === "flagged"}
          className="rounded-lg border border-yellow-500/20 px-3 py-1.5 text-sm text-yellow-400 transition hover:bg-yellow-500/10 disabled:opacity-40"
        >
          Flag
        </button>
        <button
          onClick={() => updateStatus("archived")}
          disabled={actionLoading || submission.status === "archived"}
          className="rounded-lg border border-white/10 px-3 py-1.5 text-sm text-text-muted transition hover:bg-white/5 disabled:opacity-40"
        >
          Archive
        </button>
        <button
          onClick={() => updateStatus("completed")}
          disabled={actionLoading || submission.status === "completed"}
          className="rounded-lg border border-green-500/20 px-3 py-1.5 text-sm text-green-400 transition hover:bg-green-500/10 disabled:opacity-40"
        >
          Restore
        </button>
        <button
          onClick={() => setShowDelete(true)}
          disabled={actionLoading}
          className="rounded-lg border border-red-500/20 px-3 py-1.5 text-sm text-red-400 transition hover:bg-red-500/10 disabled:opacity-40"
        >
          Delete
        </button>
      </div>

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
