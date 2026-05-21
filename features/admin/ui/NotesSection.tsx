"use client";

import { useState } from "react";
import { useAdminFetch } from "./hooks/useAdminFetch";
import { getCsrfToken } from "@shared/http/csrf-client";
import { maskEmail } from "@features/admin/server/format";

interface Note {
  id: number;
  admin_email: string;
  content: string;
  created_at: string;
  updated_at: string;
  is_mine: boolean;
}

interface NotesData {
  notes: Note[];
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function NotesSection({ submissionId }: { submissionId: string }) {
  const { data, loading, error, refetch } = useAdminFetch<NotesData>(
    `/api/admin/submissions/${submissionId}/notes`
  );
  const [newContent, setNewContent] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editContent, setEditContent] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  async function handlePost() {
    if (!newContent.trim()) return;
    setActionLoading(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/admin/submissions/${submissionId}/notes`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": getCsrfToken(),
        },
        body: JSON.stringify({ content: newContent.trim() }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setActionError((body as { error?: string } | null)?.error || "Failed to post note.");
        return;
      }
      setNewContent("");
      refetch();
    } catch {
      setActionError("Network error.");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleEdit(noteId: number) {
    if (!editContent.trim()) return;
    setActionLoading(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/admin/submissions/${submissionId}/notes/${noteId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": getCsrfToken(),
        },
        body: JSON.stringify({ content: editContent.trim() }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setActionError((body as { error?: string } | null)?.error || "Failed to update note.");
        return;
      }
      setEditingId(null);
      refetch();
    } catch {
      setActionError("Network error.");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleDelete(noteId: number) {
    setActionLoading(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/admin/submissions/${submissionId}/notes/${noteId}`, {
        method: "DELETE",
        headers: { "x-csrf-token": getCsrfToken() },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setActionError((body as { error?: string } | null)?.error || "Failed to delete note.");
        return;
      }
      refetch();
    } catch {
      setActionError("Network error.");
    } finally {
      setActionLoading(false);
    }
  }

  return (
    <div className="rounded-xl border border-white/10 bg-surface p-5">
      <h3 className="mb-4 text-sm font-semibold text-text-primary">Notes</h3>

      {/* New note input */}
      <div className="mb-4 flex gap-2">
        <textarea
          value={newContent}
          onChange={(e) => setNewContent(e.target.value)}
          placeholder="Add a note..."
          rows={2}
          className="flex-1 resize-none rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-accent-purple/40"
        />
        <button
          onClick={handlePost}
          disabled={actionLoading || !newContent.trim()}
          className="self-end rounded-lg bg-accent-purple/20 px-4 py-2 text-sm font-medium text-accent-purple transition hover:bg-accent-purple/30 disabled:opacity-40"
        >
          Post
        </button>
      </div>

      {actionError && <p className="mb-3 text-xs text-red-400">{actionError}</p>}

      {/* Loading */}
      {loading && (
        <div className="flex justify-center py-4">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/20 border-t-accent-purple" />
        </div>
      )}

      {/* Error */}
      {error && <p className="py-4 text-center text-sm text-red-400">{error}</p>}

      {/* Notes list */}
      {!loading && !error && data?.notes && (
        <div className="space-y-3">
          {data.notes.length === 0 && (
            <p className="py-4 text-center text-sm text-text-muted">No notes yet</p>
          )}
          {data.notes.map((note) => (
            <div key={note.id} className="rounded-lg border border-white/5 bg-white/[0.02] p-3">
              <div className="mb-1 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent-purple/20 text-[10px] font-bold text-accent-purple">
                    {note.admin_email.charAt(0).toUpperCase()}
                  </span>
                  <span className="text-xs text-text-muted">{maskEmail(note.admin_email)}</span>
                  <span className="text-xs text-text-muted">{relativeTime(note.created_at)}</span>
                </div>
                {note.is_mine && editingId !== note.id && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setEditingId(note.id);
                        setEditContent(note.content);
                      }}
                      disabled={actionLoading}
                      className="text-xs text-text-muted transition hover:text-text-primary"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(note.id)}
                      disabled={actionLoading}
                      className="text-xs text-red-400/70 transition hover:text-red-400"
                    >
                      Delete
                    </button>
                  </div>
                )}
              </div>

              {editingId === note.id ? (
                <div className="mt-2 flex gap-2">
                  <textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    rows={2}
                    className="flex-1 resize-none rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-text-primary outline-none"
                  />
                  <div className="flex flex-col gap-1 self-end">
                    <button
                      onClick={() => handleEdit(note.id)}
                      disabled={actionLoading}
                      className="rounded px-2 py-1 text-xs text-accent-purple transition hover:bg-accent-purple/10"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="rounded px-2 py-1 text-xs text-text-muted transition hover:bg-white/5"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-text-primary whitespace-pre-wrap">{note.content}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
