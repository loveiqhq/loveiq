"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { useAdminFetch } from "./hooks/useAdminFetch";
import { isScoringPendingSubmission } from "@/lib/admin/submission-scoring";
import FilterBar from "./FilterBar";
import SubmissionTable from "./SubmissionTable";
import Pagination from "./Pagination";
import BulkActionBar from "./BulkActionBar";
import SavedViewsBar from "./SavedViewsBar";
import ExportPresetsBar from "./ExportPresetsBar";

const PENDING_SCORING_REFRESH_MS = 5000;

interface SubmissionsData {
  submissions: Array<{
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
    v5_primary_archetype: string | null;
    priority_score: number;
    priority_label: "high" | "medium" | "low";
    review_reasons: string[];
    answer_count: number | null;
    current_index: number | null;
    recoverable: boolean;
  }>;
  total: number;
  page: number;
  limit: number;
}

export default function SubmissionBrowser() {
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({
    status: "",
    email: "",
    archetype: "",
    dateFrom: "",
    dateTo: "",
  });
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [filterKey, setFilterKey] = useState(0);

  const params = useMemo(() => {
    const p: Record<string, string> = { page: String(page), limit: "20" };
    if (filters.status) p.status = filters.status;
    if (filters.email) p.email = filters.email;
    if (filters.archetype) p.archetype = filters.archetype;
    if (filters.dateFrom) p.dateFrom = filters.dateFrom;
    if (filters.dateTo) p.dateTo = filters.dateTo;
    return p;
  }, [page, filters]);

  const { data, loading, error, refetch } = useAdminFetch<SubmissionsData>(
    "/api/admin/submissions",
    params
  );

  const handleFilterChange = useCallback((newFilters: typeof filters) => {
    setFilters(newFilters);
    setPage(1);
    setSelectedIds(new Set());
  }, []);

  const handleApplyView = useCallback((viewFilters: typeof filters) => {
    setFilters(viewFilters);
    setPage(1);
    setSelectedIds(new Set());
    setFilterKey((k) => k + 1);
  }, []);

  function handleBulkComplete() {
    setSelectedIds(new Set());
    refetch();
  }

  const hasPendingScoring = useMemo(
    () =>
      (data?.submissions ?? []).some((submission) =>
        isScoringPendingSubmission({
          completedAt: submission.completed_at,
          primaryArchetype: submission.primary_archetype,
          recordType: submission.record_type,
          status: submission.status,
        })
      ),
    [data]
  );

  useEffect(() => {
    if (loading || !hasPendingScoring) {
      return;
    }

    const timer = window.setTimeout(() => {
      refetch();
    }, PENDING_SCORING_REFRESH_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [hasPendingScoring, loading, refetch]);

  const visibleSummary = useMemo(() => {
    const submissions = data?.submissions ?? [];
    const high = submissions.filter((submission) => submission.priority_label === "high").length;
    const medium = submissions.filter(
      (submission) => submission.priority_label === "medium"
    ).length;
    const flagged = submissions.filter((submission) => submission.status === "flagged").length;

    return {
      high,
      medium,
      flagged,
      avgPriority:
        submissions.length > 0
          ? Math.round(
              submissions.reduce((sum, submission) => sum + submission.priority_score, 0) /
                submissions.length
            )
          : 0,
    };
  }, [data]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-serif text-xl font-bold text-text-primary">Submissions</h2>
        <a
          href={`/api/admin/export?${new URLSearchParams(
            Object.fromEntries(
              Object.entries(params).filter(([k, v]) => v && k !== "page" && k !== "limit")
            )
          ).toString()}`}
          className="rounded-lg border border-white/10 px-3 py-1.5 text-sm text-text-muted transition hover:bg-white/5"
        >
          Export CSV
        </a>
      </div>

      <SavedViewsBar filters={filters} onApplyView={handleApplyView} />

      <ExportPresetsBar filters={filters} onApplyPreset={handleApplyView} />

      <FilterBar key={filterKey} onFilterChange={handleFilterChange} initialFilters={filters} />

      {!loading && !error && data && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-red-300">
              High-Priority Review
            </p>
            <p className="mt-2 text-2xl font-bold text-text-primary">{visibleSummary.high}</p>
            <p className="mt-1 text-xs text-text-muted">
              Visible submissions ranked for manual review
            </p>
          </div>
          <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/5 p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-yellow-300">
              Medium Priority
            </p>
            <p className="mt-2 text-2xl font-bold text-text-primary">{visibleSummary.medium}</p>
            <p className="mt-1 text-xs text-text-muted">Borderline or watchlist candidates</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-surface p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-text-muted">
              Flagged Status
            </p>
            <p className="mt-2 text-2xl font-bold text-text-primary">{visibleSummary.flagged}</p>
            <p className="mt-1 text-xs text-text-muted">
              Already marked flagged in the current page
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-surface p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-text-muted">
              Avg Priority Score
            </p>
            <p className="mt-2 text-2xl font-bold text-text-primary">
              {visibleSummary.avgPriority}
            </p>
            <p className="mt-1 text-xs text-text-muted">Sorted by review urgency before recency</p>
          </div>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-accent-purple" />
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-center text-sm text-red-400">
          {error}
        </div>
      )}

      {!loading && !error && data && (
        <>
          <SubmissionTable
            submissions={data.submissions}
            selectable
            selectedIds={selectedIds}
            onSelectionChange={setSelectedIds}
          />
          {selectedIds.size > 0 && (
            <BulkActionBar
              selectedIds={selectedIds}
              onClear={() => setSelectedIds(new Set())}
              onComplete={handleBulkComplete}
            />
          )}
          <Pagination
            page={data.page}
            limit={data.limit}
            total={data.total}
            onPageChange={setPage}
          />
        </>
      )}
    </div>
  );
}
