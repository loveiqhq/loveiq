"use client";

import { useState, useCallback, useMemo } from "react";
import { useAdminFetch } from "./hooks/useAdminFetch";
import FilterBar from "./FilterBar";
import SubmissionTable from "./SubmissionTable";
import Pagination from "./Pagination";
import BulkActionBar from "./BulkActionBar";
import SavedViewsBar from "./SavedViewsBar";

interface SubmissionsData {
  submissions: Array<{
    id: number;
    email: string;
    first_name: string;
    status: string;
    started_at: string;
    completed_at: string;
    primary_archetype: string | null;
    v5_primary_archetype: string | null;
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

      <FilterBar key={filterKey} onFilterChange={handleFilterChange} initialFilters={filters} />

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
