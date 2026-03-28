"use client";

import { useState } from "react";
import { useAdminFetch } from "@/components/admin/hooks/useAdminFetch";
import { getCsrfToken } from "@/lib/csrf-client";

interface ChangelogEntry {
  id: number;
  title: string;
  description: string | null;
  category: string;
  adminEmail: string;
  eventDate: string;
  createdAt: string;
}

interface Annotation {
  id: number;
  chartKey: string;
  annotationDate: string;
  note: string;
  adminEmail: string;
  createdAt: string;
}

interface ChangelogData {
  changelog: ChangelogEntry[];
  annotations: Annotation[];
  totalEntries: number;
}

const TABS = ["Timeline", "Add Entry"] as const;
type Tab = (typeof TABS)[number];

const categoryColors: Record<string, string> = {
  "survey-change": "bg-purple-500/20 text-purple-400",
  "site-update": "bg-blue-500/20 text-blue-400",
  marketing: "bg-green-500/20 text-green-400",
  "bug-fix": "bg-red-500/20 text-red-400",
  feature: "bg-orange-500/20 text-orange-400",
  other: "bg-white/10 text-text-muted",
  annotation: "bg-cyan-500/20 text-cyan-400",
};

const CATEGORIES = ["survey-change", "site-update", "marketing", "bug-fix", "feature", "other"];

export default function ChangelogDashboard() {
  const [activeTab, setActiveTab] = useState<Tab>("Timeline");
  const { data, loading, error, refetch } = useAdminFetch<ChangelogData>("/api/admin/changelog");

  // Form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("other");
  const [eventDate, setEventDate] = useState(new Date().toISOString().slice(0, 10));
  const [submitting, setSubmitting] = useState(false);
  const [formMsg, setFormMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setFormMsg(null);
    try {
      const res = await fetch("/api/admin/changelog", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": getCsrfToken(),
        },
        body: JSON.stringify({ title, description: description || undefined, category, eventDate }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error((body as { error?: string } | null)?.error || "Failed to save.");
      }
      setFormMsg({ type: "success", text: "Entry added successfully." });
      setTitle("");
      setDescription("");
      setCategory("other");
      refetch();
    } catch (err) {
      setFormMsg({ type: "error", text: err instanceof Error ? err.message : "Unknown error." });
    } finally {
      setSubmitting(false);
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
        {error || "Failed to load changelog."}
      </div>
    );
  }

  // Merge changelog + annotations into a single timeline, sorted by date desc
  const timeline = [
    ...data.changelog.map((c) => ({
      type: "changelog" as const,
      date: c.eventDate,
      ...c,
    })),
    ...data.annotations.map((a) => ({
      type: "annotation" as const,
      date: a.annotationDate,
      id: a.id,
      title: a.note,
      description: null as string | null,
      category: "annotation",
      adminEmail: a.adminEmail,
      eventDate: a.annotationDate,
      createdAt: a.createdAt,
      chartKey: a.chartKey,
    })),
  ].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="space-y-6">
      <div className="flex gap-1 rounded-lg border border-white/10 bg-surface p-1">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
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

      {activeTab === "Timeline" && (
        <div className="space-y-0">
          {timeline.length === 0 && (
            <p className="py-12 text-center text-sm text-text-muted">
              No changelog entries yet. Add one from the &quot;Add Entry&quot; tab.
            </p>
          )}
          {timeline.map((item) => (
            <div
              key={`${item.type}-${item.id}`}
              className="flex gap-4 border-l-2 border-white/10 pb-6 pl-4"
            >
              <div className="w-24 shrink-0 text-xs text-text-muted">{item.eventDate}</div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${categoryColors[item.category] || categoryColors.other}`}
                  >
                    {item.category}
                  </span>
                  <span className="font-medium text-text-primary">{item.title}</span>
                </div>
                {item.description && (
                  <p className="mt-1 text-sm text-text-muted">{item.description}</p>
                )}
                <p className="mt-1 text-xs text-text-muted/60">Added by {item.adminEmail}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === "Add Entry" && (
        <form onSubmit={handleSubmit} className="mx-auto max-w-lg space-y-4">
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

          <div>
            <label className="mb-1 block text-xs font-medium uppercase text-text-muted">
              Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              maxLength={200}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-text-primary placeholder-text-muted/50 focus:border-accent-purple focus:outline-none"
              placeholder="e.g. Updated survey question Q12"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium uppercase text-text-muted">
              Description (optional)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={2000}
              rows={3}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-text-primary placeholder-text-muted/50 focus:border-accent-purple focus:outline-none"
              placeholder="More details about the change..."
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium uppercase text-text-muted">
                Category
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-text-primary focus:border-accent-purple focus:outline-none"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase text-text-muted">
                Event Date
              </label>
              <input
                type="date"
                value={eventDate}
                onChange={(e) => setEventDate(e.target.value)}
                required
                className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-text-primary focus:border-accent-purple focus:outline-none"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting || !title.trim()}
            className="w-full rounded-lg bg-accent-purple px-4 py-2.5 text-sm font-medium text-white transition hover:bg-accent-purple/80 disabled:opacity-50"
          >
            {submitting ? "Saving..." : "Add Changelog Entry"}
          </button>
        </form>
      )}
    </div>
  );
}
