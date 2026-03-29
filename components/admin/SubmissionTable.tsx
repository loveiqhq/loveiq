"use client";

import { maskEmail } from "@/lib/admin/format";

interface Submission {
  id: number;
  email: string;
  first_name: string;
  status: string;
  started_at: string;
  completed_at: string;
  duration_ms: number | null;
  primary_archetype: string | null;
  v5_primary_archetype?: string | null;
  priority_score: number;
  priority_label: "high" | "medium" | "low";
  review_reasons: string[];
}

interface SubmissionTableProps {
  submissions: Submission[];
  selectable?: boolean;
  selectedIds?: Set<number>;
  onSelectionChange?: (ids: Set<number>) => void;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const statusColors: Record<string, string> = {
  completed: "bg-green-500/10 text-green-400",
  flagged: "bg-yellow-500/10 text-yellow-400",
  archived: "bg-white/5 text-text-muted",
};

const priorityColors: Record<Submission["priority_label"], string> = {
  high: "bg-red-500/10 text-red-300",
  medium: "bg-yellow-500/10 text-yellow-300",
  low: "bg-emerald-500/10 text-emerald-300",
};

export default function SubmissionTable({
  submissions,
  selectable = false,
  selectedIds,
  onSelectionChange,
}: SubmissionTableProps) {
  const allSelected =
    selectable && submissions.length > 0 && submissions.every((s) => selectedIds?.has(s.id));

  function toggleAll() {
    if (!onSelectionChange) return;
    if (allSelected) {
      onSelectionChange(new Set());
    } else {
      onSelectionChange(new Set(submissions.map((s) => s.id)));
    }
  }

  function toggleOne(id: number) {
    if (!onSelectionChange || !selectedIds) return;
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectionChange(next);
  }

  if (submissions.length === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-surface p-8 text-center text-sm text-text-muted">
        No submissions found
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-white/10 bg-surface">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-white/10 text-text-muted">
            {selectable && (
              <th className="px-4 py-3">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  className="h-4 w-4 rounded border-white/20 bg-transparent accent-accent-purple"
                  aria-label="Select all"
                />
              </th>
            )}
            <th className="px-4 py-3 font-medium">Email</th>
            <th className="px-4 py-3 font-medium">Name</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium">Priority</th>
            <th className="px-4 py-3 font-medium">Archetype (V4)</th>
            <th className="px-4 py-3 font-medium">Archetype (V5)</th>
            <th className="px-4 py-3 font-medium">Review Signals</th>
            <th className="px-4 py-3 font-medium">Started</th>
            <th className="px-4 py-3 font-medium">Completed</th>
            <th className="px-4 py-3 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {submissions.map((s) => (
            <tr key={s.id} className="border-b border-white/5 hover:bg-white/[0.02]">
              {selectable && (
                <td className="px-4 py-3">
                  <input
                    type="checkbox"
                    checked={selectedIds?.has(s.id) || false}
                    onChange={() => toggleOne(s.id)}
                    className="h-4 w-4 rounded border-white/20 bg-transparent accent-accent-purple"
                    aria-label={`Select submission ${s.id}`}
                  />
                </td>
              )}
              <td className="px-4 py-3 text-text-primary">{maskEmail(s.email)}</td>
              <td className="px-4 py-3 text-text-primary">{s.first_name}</td>
              <td className="px-4 py-3">
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[s.status] || "bg-white/5 text-text-muted"}`}
                >
                  {s.status}
                </span>
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium uppercase ${priorityColors[s.priority_label]}`}
                  >
                    {s.priority_label}
                  </span>
                  <span className="text-xs text-text-muted">{s.priority_score}</span>
                </div>
              </td>
              <td className="px-4 py-3 text-text-muted">
                {s.primary_archetype ? (
                  <span className="rounded-full bg-accent-purple/10 px-2 py-0.5 text-xs font-medium text-accent-purple">
                    {s.primary_archetype}
                  </span>
                ) : (
                  <span className="text-xs text-text-muted">&mdash;</span>
                )}
              </td>
              <td className="px-4 py-3 text-text-muted">
                {s.v5_primary_archetype ? (
                  <span className="rounded-full bg-accent-orange/10 px-2 py-0.5 text-xs font-medium text-accent-orange">
                    {s.v5_primary_archetype}
                  </span>
                ) : (
                  <span className="text-xs text-text-muted">&mdash;</span>
                )}
              </td>
              <td className="max-w-[260px] px-4 py-3">
                {s.review_reasons.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {s.review_reasons.slice(0, 2).map((reason) => (
                      <span
                        key={reason}
                        className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] text-text-muted"
                      >
                        {reason}
                      </span>
                    ))}
                    {s.review_reasons.length > 2 && (
                      <span className="text-[11px] text-text-muted">
                        +{s.review_reasons.length - 2} more
                      </span>
                    )}
                  </div>
                ) : (
                  <span className="text-xs text-text-muted">&mdash;</span>
                )}
              </td>
              <td className="px-4 py-3 text-text-muted">{formatDate(s.started_at)}</td>
              <td className="px-4 py-3 text-text-muted">{formatDate(s.completed_at)}</td>
              <td className="px-4 py-3">
                <a
                  href={`/admin/submissions/${s.id}`}
                  className="text-accent-purple hover:underline"
                >
                  View
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
