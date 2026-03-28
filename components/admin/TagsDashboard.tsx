"use client";

import { useState } from "react";
import { useAdminFetch } from "@/components/admin/hooks/useAdminFetch";
import { getCsrfToken } from "@/lib/csrf-client";

interface Tag {
  id: number;
  name: string;
  color: string;
  createdBy: string;
  createdAt: string;
  usageCount: number;
}

interface Assignment {
  id: number;
  submissionId: number;
  tagId: number;
  assignedBy: string;
  assignedAt: string;
}

interface TagsData {
  tags: Tag[];
  assignments: Assignment[];
  submissionTags: Record<number, number[]>;
  totalTags: number;
  totalAssignments: number;
}

const TABS = ["Tags", "Create Tag", "Assign"] as const;
type Tab = (typeof TABS)[number];

const PRESET_COLORS = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#06b6d4",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#6b7280",
  "#f43f5e",
];

export default function TagsDashboard() {
  const [activeTab, setActiveTab] = useState<Tab>("Tags");
  const { data, loading, error, refetch } = useAdminFetch<TagsData>("/api/admin/tags");

  // Create tag form
  const [tagName, setTagName] = useState("");
  const [tagColor, setTagColor] = useState("#3b82f6");
  const [creating, setCreating] = useState(false);

  // Assign tag form
  const [submissionId, setSubmissionId] = useState("");
  const [selectedTagId, setSelectedTagId] = useState("");
  const [assigning, setAssigning] = useState(false);

  const [formMsg, setFormMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  async function handleCreateTag(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setFormMsg(null);
    try {
      const res = await fetch("/api/admin/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-csrf-token": getCsrfToken() },
        body: JSON.stringify({ name: tagName, color: tagColor }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error((body as { error?: string } | null)?.error || "Failed to create tag.");
      }
      setFormMsg({ type: "success", text: "Tag created." });
      setTagName("");
      refetch();
    } catch (err) {
      setFormMsg({ type: "error", text: err instanceof Error ? err.message : "Unknown error." });
    } finally {
      setCreating(false);
    }
  }

  async function handleAssign(e: React.FormEvent) {
    e.preventDefault();
    setAssigning(true);
    setFormMsg(null);
    try {
      const res = await fetch("/api/admin/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-csrf-token": getCsrfToken() },
        body: JSON.stringify({
          action: "assign",
          submissionId: parseInt(submissionId, 10),
          tagId: parseInt(selectedTagId, 10),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error((body as { error?: string } | null)?.error || "Failed to assign tag.");
      }
      setFormMsg({ type: "success", text: "Tag assigned." });
      setSubmissionId("");
      setSelectedTagId("");
      refetch();
    } catch (err) {
      setFormMsg({ type: "error", text: err instanceof Error ? err.message : "Unknown error." });
    } finally {
      setAssigning(false);
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
        {error || "Failed to load tags."}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-white/10 bg-surface p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-text-muted">Total Tags</p>
          <p className="mt-1 text-2xl font-bold text-text-primary">{data.totalTags}</p>
        </div>
        <div className="rounded-lg border border-white/10 bg-surface p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-text-muted">
            Total Assignments
          </p>
          <p className="mt-1 text-2xl font-bold text-text-primary">{data.totalAssignments}</p>
        </div>
        <div className="rounded-lg border border-white/10 bg-surface p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-text-muted">
            Tagged Submissions
          </p>
          <p className="mt-1 text-2xl font-bold text-text-primary">
            {Object.keys(data.submissionTags).length}
          </p>
        </div>
      </div>

      <div className="flex gap-1 rounded-lg border border-white/10 bg-surface p-1">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => {
              setActiveTab(tab);
              setFormMsg(null);
            }}
            className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition ${
              activeTab === tab
                ? "bg-white/10 text-text-primary"
                : "text-text-muted hover:bg-white/5 hover:text-text-primary"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {formMsg && (
        <div
          className={`rounded-lg border p-3 text-sm ${
            formMsg.type === "success"
              ? "border-green-500/20 bg-green-500/5 text-green-400"
              : "border-red-500/20 bg-red-500/5 text-red-400"
          }`}
        >
          {formMsg.text}
        </div>
      )}

      {activeTab === "Tags" && (
        <div className="space-y-3">
          {data.tags.length === 0 && (
            <p className="py-8 text-center text-sm text-text-muted">
              No tags yet. Create one from the &quot;Create Tag&quot; tab.
            </p>
          )}
          {data.tags.map((tag) => (
            <div
              key={tag.id}
              className="flex items-center justify-between rounded-lg border border-white/10 bg-surface px-4 py-3"
            >
              <div className="flex items-center gap-3">
                <span className="h-4 w-4 rounded-full" style={{ backgroundColor: tag.color }} />
                <span className="font-medium text-text-primary">{tag.name}</span>
              </div>
              <div className="flex items-center gap-4 text-xs text-text-muted">
                <span>{tag.usageCount} uses</span>
                <span>by {tag.createdBy}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === "Create Tag" && (
        <form onSubmit={handleCreateTag} className="mx-auto max-w-md space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium uppercase text-text-muted">
              Tag Name
            </label>
            <input
              type="text"
              value={tagName}
              onChange={(e) => setTagName(e.target.value)}
              required
              maxLength={50}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-text-primary placeholder-text-muted/50 focus:border-accent-purple focus:outline-none"
              placeholder="e.g. follow-up-needed"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium uppercase text-text-muted">
              Color
            </label>
            <div className="flex flex-wrap gap-2">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setTagColor(c)}
                  className={`h-8 w-8 rounded-full border-2 transition ${
                    tagColor === c ? "border-white" : "border-transparent"
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
          <button
            type="submit"
            disabled={creating || !tagName.trim()}
            className="w-full rounded-lg bg-accent-purple px-4 py-2.5 text-sm font-medium text-white transition hover:bg-accent-purple/80 disabled:opacity-50"
          >
            {creating ? "Creating..." : "Create Tag"}
          </button>
        </form>
      )}

      {activeTab === "Assign" && (
        <form onSubmit={handleAssign} className="mx-auto max-w-md space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium uppercase text-text-muted">
              Submission ID
            </label>
            <input
              type="number"
              value={submissionId}
              onChange={(e) => setSubmissionId(e.target.value)}
              required
              min={1}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-text-primary placeholder-text-muted/50 focus:border-accent-purple focus:outline-none"
              placeholder="e.g. 42"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium uppercase text-text-muted">Tag</label>
            <select
              value={selectedTagId}
              onChange={(e) => setSelectedTagId(e.target.value)}
              required
              className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-text-primary focus:border-accent-purple focus:outline-none"
            >
              <option value="">Select a tag...</option>
              {data.tags.map((tag) => (
                <option key={tag.id} value={String(tag.id)}>
                  {tag.name}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            disabled={assigning || !submissionId || !selectedTagId}
            className="w-full rounded-lg bg-accent-purple px-4 py-2.5 text-sm font-medium text-white transition hover:bg-accent-purple/80 disabled:opacity-50"
          >
            {assigning ? "Assigning..." : "Assign Tag"}
          </button>
        </form>
      )}
    </div>
  );
}
