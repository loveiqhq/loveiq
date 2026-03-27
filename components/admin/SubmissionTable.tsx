"use client";

import { maskEmail } from "@/lib/admin/format";

interface Submission {
  id: number;
  email: string;
  first_name: string;
  status: string;
  started_at: string;
  completed_at: string;
  primary_archetype: string | null;
  v5_primary_archetype?: string | null;
}

interface SubmissionTableProps {
  submissions: Submission[];
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

export default function SubmissionTable({ submissions }: SubmissionTableProps) {
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
            <th className="px-4 py-3 font-medium">Email</th>
            <th className="px-4 py-3 font-medium">Name</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium">Archetype (V4)</th>
            <th className="px-4 py-3 font-medium">Archetype (V5)</th>
            <th className="px-4 py-3 font-medium">Started</th>
            <th className="px-4 py-3 font-medium">Completed</th>
            <th className="px-4 py-3 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {submissions.map((s) => (
            <tr key={s.id} className="border-b border-white/5 hover:bg-white/[0.02]">
              <td className="px-4 py-3 text-text-primary">{maskEmail(s.email)}</td>
              <td className="px-4 py-3 text-text-primary">{s.first_name}</td>
              <td className="px-4 py-3">
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[s.status] || "bg-white/5 text-text-muted"}`}
                >
                  {s.status}
                </span>
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
