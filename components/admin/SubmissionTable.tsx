"use client";

import { maskEmail } from "@/lib/admin/format";
import { isScoringPendingSubmission } from "@/lib/admin/submission-scoring";

interface Submission {
  id: number | string;
  record_type: "submission" | "partial";
  submission_id: number | null;
  session_id: string | null;
  detail_href: string;
  selectable: boolean;
  email: string;
  first_name: string;
  status: string;
  started_at: string;
  completed_at: string;
  saved_at: string;
  duration_ms: number | null;
  utm_source: string | null;
  primary_archetype: string | null;
  v5_primary_archetype?: string | null;
  priority_score: number;
  priority_label: "high" | "medium" | "low";
  review_reasons: string[];
  answer_count: number | null;
  current_index: number | null;
  recoverable: boolean;
  is_likely_test?: boolean;
  test_reasons?: string[];
}

export type SortField =
  | "priority"
  | "started_at"
  | "completed_at"
  | "email"
  | "first_name"
  | "status"
  | "archetype_v4"
  | "archetype_v5"
  | "duration_ms";

export type SortDir = "asc" | "desc";

export interface SortState {
  field: SortField;
  dir: SortDir;
}

interface SubmissionTableProps {
  submissions: Submission[];
  selectable?: boolean;
  selectedIds?: Set<number>;
  onSelectionChange?: (ids: Set<number>) => void;
  sort?: SortState;
  onSortChange?: (sort: SortState) => void;
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
  pending_completion: "bg-orange-500/10 text-orange-300",
  partial: "bg-blue-500/10 text-blue-300",
  flagged: "bg-yellow-500/10 text-yellow-400",
  archived: "bg-white/5 text-text-muted",
};

const priorityColors: Record<Submission["priority_label"], string> = {
  high: "bg-red-500/10 text-red-300",
  medium: "bg-yellow-500/10 text-yellow-300",
  low: "bg-emerald-500/10 text-emerald-300",
};

interface SortableHeaderProps {
  field: SortField | null;
  label: string;
  sort?: SortState;
  onSortChange?: (sort: SortState) => void;
  className?: string;
}

function SortableHeader({ field, label, sort, onSortChange, className }: SortableHeaderProps) {
  const baseTh = `px-4 py-3 font-medium ${className ?? ""}`;
  if (!field || !onSortChange) {
    return <th className={baseTh}>{label}</th>;
  }
  const activeField: SortField = field;
  const handleSort = onSortChange;

  const isActive = sort?.field === activeField;
  const ariaSort: "ascending" | "descending" | "none" = isActive
    ? sort?.dir === "asc"
      ? "ascending"
      : "descending"
    : "none";
  const arrow = isActive ? (sort?.dir === "asc" ? "▲" : "▼") : "↕";

  function toggle() {
    if (!isActive) {
      handleSort({ field: activeField, dir: "desc" });
      return;
    }
    handleSort({ field: activeField, dir: sort?.dir === "asc" ? "desc" : "asc" });
  }

  return (
    <th className={baseTh} aria-sort={ariaSort}>
      <button
        type="button"
        onClick={toggle}
        className={`group inline-flex items-center gap-1 outline-none transition ${
          isActive ? "text-text-primary" : "hover:text-text-primary"
        }`}
      >
        <span>{label}</span>
        <span
          aria-hidden="true"
          className={`text-[10px] transition ${
            isActive ? "opacity-100" : "opacity-30 group-hover:opacity-70"
          }`}
        >
          {arrow}
        </span>
      </button>
    </th>
  );
}

export default function SubmissionTable({
  submissions,
  selectable = false,
  selectedIds,
  onSelectionChange,
  sort,
  onSortChange,
}: SubmissionTableProps) {
  const allSelected =
    selectable &&
    submissions.some((submission) => submission.selectable && typeof submission.id === "number") &&
    submissions
      .filter((submission) => submission.selectable && typeof submission.id === "number")
      .every((submission) => selectedIds?.has(submission.id as number));

  function toggleAll() {
    if (!onSelectionChange) return;
    if (allSelected) {
      onSelectionChange(new Set());
    } else {
      onSelectionChange(
        new Set(
          submissions
            .filter((submission) => submission.selectable && typeof submission.id === "number")
            .map((submission) => submission.id as number)
        )
      );
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
            <SortableHeader field="email" label="Email" sort={sort} onSortChange={onSortChange} />
            <SortableHeader
              field="first_name"
              label="Name"
              sort={sort}
              onSortChange={onSortChange}
            />
            <SortableHeader field="status" label="Status" sort={sort} onSortChange={onSortChange} />
            <SortableHeader
              field="priority"
              label="Priority"
              sort={sort}
              onSortChange={onSortChange}
            />
            <SortableHeader
              field="archetype_v4"
              label="Archetype (V4)"
              sort={sort}
              onSortChange={onSortChange}
            />
            <SortableHeader
              field="archetype_v5"
              label="Archetype (V5)"
              sort={sort}
              onSortChange={onSortChange}
            />
            <SortableHeader field={null} label="Review Signals" />
            <SortableHeader
              field="started_at"
              label="Started"
              sort={sort}
              onSortChange={onSortChange}
            />
            <SortableHeader
              field="completed_at"
              label="Completed / Saved"
              sort={sort}
              onSortChange={onSortChange}
            />
            <SortableHeader field={null} label="Actions" />
          </tr>
        </thead>
        <tbody>
          {submissions.map((submission) => {
            const submissionId = typeof submission.id === "number" ? submission.id : null;
            const isSelectableSubmission = submission.selectable && submissionId !== null;
            const scoringPending = isScoringPendingSubmission({
              completedAt: submission.completed_at,
              primaryArchetype: submission.primary_archetype,
              recordType: submission.record_type,
              status: submission.status,
            });

            return (
              <tr
                key={submission.id}
                className={`border-b border-white/5 hover:bg-white/[0.02] ${
                  submission.is_likely_test ? "bg-red-500/[0.03]" : ""
                }`}
              >
                {selectable && (
                  <td className="px-4 py-3">
                    {isSelectableSubmission ? (
                      <input
                        type="checkbox"
                        checked={selectedIds?.has(submissionId) || false}
                        onChange={() => toggleOne(submissionId)}
                        className="h-4 w-4 rounded border-white/20 bg-transparent accent-accent-purple"
                        aria-label={`Select submission ${submissionId}`}
                      />
                    ) : (
                      <span className="text-xs text-text-muted">-</span>
                    )}
                  </td>
                )}
                <td className="px-4 py-3 text-text-primary">
                  <div className="flex items-center gap-2">
                    <span>{maskEmail(submission.email)}</span>
                    {submission.is_likely_test && (
                      <span
                        className="rounded-full border border-red-500/30 bg-red-500/10 px-1.5 py-px text-[10px] font-medium uppercase text-red-300"
                        title={`Test: ${submission.test_reasons?.join(", ") ?? "n/a"}`}
                      >
                        Test
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 text-text-primary">{submission.first_name}</td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[submission.status] || "bg-white/5 text-text-muted"}`}
                  >
                    {submission.status}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium uppercase ${priorityColors[submission.priority_label]}`}
                    >
                      {submission.priority_label}
                    </span>
                    <span className="text-xs text-text-muted">{submission.priority_score}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-text-muted">
                  {submission.primary_archetype ? (
                    <span className="rounded-full bg-accent-purple/10 px-2 py-0.5 text-xs font-medium text-accent-purple">
                      {submission.primary_archetype}
                    </span>
                  ) : scoringPending ? (
                    <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-xs font-medium text-text-muted">
                      Pending
                    </span>
                  ) : (
                    <span className="text-xs text-text-muted">&mdash;</span>
                  )}
                </td>
                <td className="px-4 py-3 text-text-muted">
                  {submission.v5_primary_archetype ? (
                    <span className="rounded-full bg-accent-orange/10 px-2 py-0.5 text-xs font-medium text-accent-orange">
                      {submission.v5_primary_archetype}
                    </span>
                  ) : (
                    <span className="text-xs text-text-muted">&mdash;</span>
                  )}
                </td>
                <td className="max-w-[260px] px-4 py-3">
                  {submission.review_reasons.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {submission.review_reasons.slice(0, 2).map((reason) => (
                        <span
                          key={reason}
                          className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] text-text-muted"
                        >
                          {reason}
                        </span>
                      ))}
                      {submission.review_reasons.length > 2 && (
                        <span className="text-[11px] text-text-muted">
                          +{submission.review_reasons.length - 2} more
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="text-xs text-text-muted">&mdash;</span>
                  )}
                </td>
                <td className="px-4 py-3 text-text-muted">{formatDate(submission.started_at)}</td>
                <td className="px-4 py-3 text-text-muted">
                  {formatDate(
                    submission.record_type === "partial"
                      ? submission.saved_at
                      : submission.completed_at
                  )}
                </td>
                <td className="px-4 py-3">
                  <a href={submission.detail_href} className="text-accent-purple hover:underline">
                    View
                  </a>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
