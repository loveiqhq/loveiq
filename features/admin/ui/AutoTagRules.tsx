"use client";

import { useState } from "react";
import { useAdminFetch } from "@features/admin/ui/hooks/useAdminFetch";
import { getCsrfToken } from "@/lib/csrf-client";

interface TagRule {
  id: number;
  tag_id: number;
  field: string;
  operator: string;
  value: string;
  is_active: boolean;
  created_by: string;
  created_at: string;
}

interface RulesData {
  rules: TagRule[];
}

interface Tag {
  id: number;
  name: string;
  color: string;
  createdBy: string;
  createdAt: string;
  usageCount: number;
}

interface TagsData {
  tags: Tag[];
}

const FIELD_OPTIONS = [
  { value: "duration_ms", label: "Duration (ms)" },
  { value: "backtrack_count", label: "Backtrack Count" },
  { value: "revision_count", label: "Revision Count" },
  { value: "status", label: "Status" },
];

const OPERATOR_OPTIONS = [
  { value: "gt", label: ">" },
  { value: "gte", label: ">=" },
  { value: "lt", label: "<" },
  { value: "lte", label: "<=" },
  { value: "eq", label: "=" },
  { value: "contains", label: "contains" },
];

export default function AutoTagRules() {
  const { data, loading, error, refetch } = useAdminFetch<RulesData>("/api/admin/tag-rules");
  const { data: tagsData } = useAdminFetch<TagsData>("/api/admin/tags");

  const [tagId, setTagId] = useState("");
  const [field, setField] = useState("duration_ms");
  const [operator, setOperator] = useState("gt");
  const [value, setValue] = useState("");
  const [creating, setCreating] = useState(false);
  const [running, setRunning] = useState(false);

  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const tags = tagsData?.tags || [];

  function getTagName(id: number) {
    return tags.find((t) => t.id === id)?.name || `Tag #${id}`;
  }

  function getTagColor(id: number) {
    return tags.find((t) => t.id === id)?.color || "#6b7280";
  }

  function getFieldLabel(f: string) {
    return FIELD_OPTIONS.find((o) => o.value === f)?.label || f;
  }

  function getOperatorLabel(op: string) {
    return OPERATOR_OPTIONS.find((o) => o.value === op)?.label || op;
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/tag-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-csrf-token": getCsrfToken() },
        body: JSON.stringify({
          tag_id: parseInt(tagId, 10),
          field,
          operator,
          value,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error((body as { error?: string } | null)?.error || "Failed to create rule.");
      }
      setMsg({ type: "success", text: "Rule created." });
      setTagId("");
      setValue("");
      refetch();
    } catch (err) {
      setMsg({ type: "error", text: err instanceof Error ? err.message : "Unknown error." });
    } finally {
      setCreating(false);
    }
  }

  async function handleToggle(ruleId: number) {
    setMsg(null);
    try {
      const res = await fetch("/api/admin/tag-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-csrf-token": getCsrfToken() },
        body: JSON.stringify({ action: "toggle", ruleId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error((body as { error?: string } | null)?.error || "Failed to toggle rule.");
      }
      refetch();
    } catch (err) {
      setMsg({ type: "error", text: err instanceof Error ? err.message : "Unknown error." });
    }
  }

  async function handleDelete(ruleId: number) {
    setMsg(null);
    try {
      const res = await fetch("/api/admin/tag-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-csrf-token": getCsrfToken() },
        body: JSON.stringify({ action: "delete", ruleId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error((body as { error?: string } | null)?.error || "Failed to delete rule.");
      }
      setMsg({ type: "success", text: "Rule deleted." });
      refetch();
    } catch (err) {
      setMsg({ type: "error", text: err instanceof Error ? err.message : "Unknown error." });
    }
  }

  async function handleRunAll() {
    setRunning(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/tag-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-csrf-token": getCsrfToken() },
        body: JSON.stringify({ action: "run" }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error((body as { error?: string } | null)?.error || "Failed to run rules.");
      }
      const result = (await res.json()) as { newAssignments: number };
      setMsg({
        type: "success",
        text: `Done — ${result.newAssignments} new tag assignment${result.newAssignments === 1 ? "" : "s"} created.`,
      });
    } catch (err) {
      setMsg({ type: "error", text: err instanceof Error ? err.message : "Unknown error." });
    } finally {
      setRunning(false);
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
      <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-center text-sm text-red-400">
        {error || "Failed to load tag rules."}
      </div>
    );
  }

  const rules = data.rules;

  return (
    <div className="space-y-6">
      {/* Header with Run All button */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-text-muted">
            {rules.length} rule{rules.length === 1 ? "" : "s"} configured
            {" · "}
            {rules.filter((r) => r.is_active).length} active
          </p>
        </div>
        <button
          onClick={handleRunAll}
          disabled={running || rules.filter((r) => r.is_active).length === 0}
          className="rounded-lg bg-accent-purple px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-purple/80 disabled:opacity-50"
        >
          {running ? "Running..." : "Run All Rules"}
        </button>
      </div>

      {/* Toast / message */}
      {msg && (
        <div
          className={`rounded-lg border p-3 text-sm ${
            msg.type === "success"
              ? "border-green-500/20 bg-green-500/5 text-green-400"
              : "border-red-500/20 bg-red-500/5 text-red-400"
          }`}
        >
          {msg.text}
        </div>
      )}

      {/* Rules list */}
      <div className="space-y-3">
        {rules.length === 0 && (
          <p className="py-8 text-center text-sm text-text-muted">
            No auto-tag rules yet. Create one below.
          </p>
        )}
        {rules.map((rule) => (
          <div
            key={rule.id}
            className={`rounded-xl border p-4 transition ${
              rule.is_active
                ? "border-white/10 bg-surface"
                : "border-white/5 bg-surface/50 opacity-60"
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium text-white"
                  style={{ backgroundColor: getTagColor(rule.tag_id) }}
                >
                  {getTagName(rule.tag_id)}
                </span>
                <span className="text-sm text-text-secondary">
                  where{" "}
                  <span className="font-medium text-text-primary">{getFieldLabel(rule.field)}</span>{" "}
                  <span className="font-mono text-accent-purple">
                    {getOperatorLabel(rule.operator)}
                  </span>{" "}
                  <span className="font-medium text-text-primary">{rule.value}</span>
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleToggle(rule.id)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                    rule.is_active
                      ? "bg-green-500/15 text-green-400 hover:bg-green-500/25"
                      : "bg-white/5 text-text-muted hover:bg-white/10"
                  }`}
                >
                  {rule.is_active ? "Active" : "Inactive"}
                </button>
                <button
                  onClick={() => handleDelete(rule.id)}
                  className="rounded-lg bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-400 transition hover:bg-red-500/20"
                >
                  Delete
                </button>
              </div>
            </div>
            <p className="mt-2 text-xs text-text-muted">
              Created by {rule.created_by} on {new Date(rule.created_at).toLocaleDateString()}
            </p>
          </div>
        ))}
      </div>

      {/* Create rule form */}
      <div className="rounded-xl border border-white/10 bg-surface p-5">
        <h3 className="mb-4 font-serif text-lg font-semibold text-text-primary">Create Rule</h3>
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-text-muted">
                Tag
              </label>
              <select
                value={tagId}
                onChange={(e) => setTagId(e.target.value)}
                required
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-text-primary focus:border-accent-purple focus:outline-none"
              >
                <option value="">Select a tag...</option>
                {tags.map((tag) => (
                  <option key={tag.id} value={String(tag.id)}>
                    {tag.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-text-muted">
                Field
              </label>
              <select
                value={field}
                onChange={(e) => setField(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-text-primary focus:border-accent-purple focus:outline-none"
              >
                {FIELD_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-text-muted">
                Operator
              </label>
              <select
                value={operator}
                onChange={(e) => setOperator(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-text-primary focus:border-accent-purple focus:outline-none"
              >
                {OPERATOR_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-text-muted">
                Value
              </label>
              <input
                type="text"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                required
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-text-primary placeholder-text-muted/50 focus:border-accent-purple focus:outline-none"
                placeholder="e.g. 1800000"
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={creating || !tagId || !value.trim()}
            className="rounded-lg bg-accent-purple px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-purple/80 disabled:opacity-50"
          >
            {creating ? "Creating..." : "Create Rule"}
          </button>
        </form>
      </div>
    </div>
  );
}
