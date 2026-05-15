"use client";

import { useCallback, useEffect, useState } from "react";
import {
  type AdminCommentResourceType,
  type AdminResourceComment,
} from "@features/admin/server/comments";
import { getCsrfToken } from "@/lib/csrf-client";
import { maskEmail } from "@features/admin/server/format";

interface CommentsResponse {
  comments: AdminResourceComment[];
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function AdminCommentsThread({
  resourceType,
  resourceId,
  title = "Discussion",
}: {
  resourceType: AdminCommentResourceType;
  resourceId: number;
  title?: string;
}) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [comments, setComments] = useState<AdminResourceComment[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [newContent, setNewContent] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editContent, setEditContent] = useState("");

  const fetchComments = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const params = new URLSearchParams({
        resourceType,
        resourceId: String(resourceId),
      });
      const res = await fetch(`/api/admin/comments?${params.toString()}`);
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error((body as { error?: string } | null)?.error || "Failed to load discussion.");
      }
      const json = (await res.json()) as CommentsResponse;
      setComments(json.comments);
      setLoaded(true);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load discussion.");
    } finally {
      setLoading(false);
    }
  }, [resourceId, resourceType]);

  useEffect(() => {
    if (open && !loaded && !loading) {
      void fetchComments();
    }
  }, [fetchComments, loaded, loading, open]);

  async function createComment() {
    if (!newContent.trim()) return;
    setActionLoading(true);
    setActionError(null);
    try {
      const res = await fetch("/api/admin/comments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": getCsrfToken(),
        },
        body: JSON.stringify({
          resourceType,
          resourceId,
          content: newContent.trim(),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error((body as { error?: string } | null)?.error || "Failed to save comment.");
      }
      setNewContent("");
      await fetchComments();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to save comment.");
    } finally {
      setActionLoading(false);
    }
  }

  async function updateComment(commentId: number) {
    if (!editContent.trim()) return;
    setActionLoading(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/admin/comments/${commentId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": getCsrfToken(),
        },
        body: JSON.stringify({ content: editContent.trim() }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error((body as { error?: string } | null)?.error || "Failed to update comment.");
      }
      setEditingId(null);
      setEditContent("");
      await fetchComments();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to update comment.");
    } finally {
      setActionLoading(false);
    }
  }

  async function deleteComment(commentId: number) {
    setActionLoading(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/admin/comments/${commentId}`, {
        method: "DELETE",
        headers: {
          "x-csrf-token": getCsrfToken(),
        },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error((body as { error?: string } | null)?.error || "Failed to delete comment.");
      }
      await fetchComments();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to delete comment.");
    } finally {
      setActionLoading(false);
    }
  }

  return (
    <div className="mt-4 rounded-xl border border-white/10 bg-surface px-4 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-text-muted">{title}</p>
          <p className="mt-1 text-sm text-text-muted">
            Use this thread to capture context, pushback, and follow-up.
          </p>
        </div>
        <button
          onClick={() => setOpen((current) => !current)}
          className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-text-primary transition hover:bg-white/10"
        >
          {open ? "Hide Thread" : loaded ? `Open Thread (${comments.length})` : "Open Thread"}
        </button>
      </div>

      {open && (
        <div className="mt-4 space-y-4">
          <div className="flex gap-2">
            <textarea
              value={newContent}
              onChange={(event) => setNewContent(event.target.value)}
              rows={2}
              placeholder="Add context, evidence, or a challenge..."
              className="flex-1 resize-none rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-text-primary placeholder:text-text-muted/50 focus:border-white/20 focus:outline-none"
            />
            <button
              onClick={() => void createComment()}
              disabled={actionLoading || !newContent.trim()}
              className="self-end rounded-lg bg-accent-purple px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-purple/80 disabled:opacity-40"
            >
              Post
            </button>
          </div>

          {actionError && <p className="text-xs text-red-400">{actionError}</p>}
          {loadError && <p className="text-xs text-red-400">{loadError}</p>}
          {loading && (
            <div className="flex justify-center py-4">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/20 border-t-accent-purple" />
            </div>
          )}

          {!loading && comments.length === 0 && !loadError && (
            <p className="py-4 text-center text-sm text-text-muted">No comments yet.</p>
          )}

          {!loading && comments.length > 0 && (
            <div className="space-y-3">
              {comments.map((comment) => (
                <div key={comment.id} className="rounded-lg border border-white/10 bg-white/5 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent-purple/20 text-[10px] font-bold text-accent-purple">
                        {comment.admin_email.charAt(0).toUpperCase()}
                      </span>
                      <span className="text-xs text-text-muted">
                        {maskEmail(comment.admin_email)}
                      </span>
                      <span className="text-xs text-text-muted">
                        {relativeTime(comment.created_at)}
                      </span>
                    </div>
                    {comment.is_mine && editingId !== comment.id && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            setEditingId(comment.id);
                            setEditContent(comment.content);
                            setActionError(null);
                          }}
                          disabled={actionLoading}
                          className="text-xs text-text-muted transition hover:text-text-primary"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => void deleteComment(comment.id)}
                          disabled={actionLoading}
                          className="text-xs text-red-400/70 transition hover:text-red-400"
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </div>

                  {editingId === comment.id ? (
                    <div className="mt-3 flex gap-2">
                      <textarea
                        value={editContent}
                        onChange={(event) => setEditContent(event.target.value)}
                        rows={2}
                        className="flex-1 resize-none rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-text-primary focus:border-white/20 focus:outline-none"
                      />
                      <div className="flex flex-col gap-2 self-end">
                        <button
                          onClick={() => void updateComment(comment.id)}
                          disabled={actionLoading || !editContent.trim()}
                          className="rounded px-2 py-1 text-xs text-accent-purple transition hover:bg-accent-purple/10 disabled:opacity-40"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => {
                            setEditingId(null);
                            setEditContent("");
                          }}
                          className="rounded px-2 py-1 text-xs text-text-muted transition hover:bg-white/5"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="mt-3 whitespace-pre-wrap text-sm text-text-primary">
                      {comment.content}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
