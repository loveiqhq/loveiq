"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { useAdminFetch } from "@features/admin/ui/hooks/useAdminFetch";
import Pagination from "@features/admin/ui/Pagination";

interface AuditEntry {
  id: number;
  admin_email: string;
  action: string;
  resource_type: string;
  resource_id: string | null;
  metadata: Record<string, unknown> | null;
  ip: string | null;
  created_at: string;
}

interface AuditResponse {
  entries: AuditEntry[];
  total: number;
  page: number;
  limit: number;
}

const ACTION_OPTIONS = [
  "",
  "create_note",
  "delete_note",
  "update_status",
  "bulk_update_status",
  "delete_submission",
  "export_csv",
  "toggle_survey",
] as const;

const RESOURCE_TYPE_OPTIONS = ["", "submission", "survey", "export"] as const;

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

function actionBadgeClass(action: string): string {
  switch (action) {
    case "create_note":
    case "export_csv":
      return "bg-green-500/10 text-green-400";
    case "update_status":
    case "bulk_update_status":
    case "toggle_survey":
      return "bg-blue-500/10 text-blue-400";
    case "delete_submission":
    case "delete_note":
      return "bg-red-500/10 text-red-400";
    default:
      return "bg-white/5 text-text-muted";
  }
}

export default function AuditLogTab() {
  const [page, setPage] = useState(1);
  const [adminFilter, setAdminFilter] = useState("");
  const [debouncedAdmin, setDebouncedAdmin] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [resourceTypeFilter, setResourceTypeFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());

  // Debounce admin email filter
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    timerRef.current = setTimeout(() => {
      setDebouncedAdmin(adminFilter);
      setPage(1);
    }, 300);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [adminFilter]);

  function resetPage() {
    setPage(1);
  }

  const params = useMemo(() => {
    const p: Record<string, string> = {
      page: String(page),
      limit: "50",
    };
    if (debouncedAdmin) p.admin = debouncedAdmin;
    if (actionFilter) p.action = actionFilter;
    if (resourceTypeFilter) p.resourceType = resourceTypeFilter;
    if (dateFrom) p.dateFrom = dateFrom;
    if (dateTo) p.dateTo = dateTo;
    return p;
  }, [page, debouncedAdmin, actionFilter, resourceTypeFilter, dateFrom, dateTo]);

  const { data, loading, error } = useAdminFetch<AuditResponse>("/api/admin/audit", params);

  const toggleExpanded = (id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const inputClass =
    "rounded-lg border border-white/10 bg-[#1a1025] px-3 py-2 text-sm text-text-primary outline-none";

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex flex-wrap gap-3">
        <input
          type="text"
          placeholder="Admin email"
          value={adminFilter}
          onChange={(e) => setAdminFilter(e.target.value)}
          className={`${inputClass} w-56`}
        />
        <select
          value={actionFilter}
          onChange={(e) => {
            setActionFilter(e.target.value);
            resetPage();
          }}
          className={inputClass}
        >
          <option value="">All actions</option>
          {ACTION_OPTIONS.filter(Boolean).map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        <select
          value={resourceTypeFilter}
          onChange={(e) => {
            setResourceTypeFilter(e.target.value);
            resetPage();
          }}
          className={inputClass}
        >
          <option value="">All resources</option>
          {RESOURCE_TYPE_OPTIONS.filter(Boolean).map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => {
            setDateFrom(e.target.value);
            resetPage();
          }}
          className={inputClass}
          aria-label="Date from"
        />
        <input
          type="date"
          value={dateTo}
          onChange={(e) => {
            setDateTo(e.target.value);
            resetPage();
          }}
          className={inputClass}
          aria-label="Date to"
        />
      </div>

      {/* Loading state */}
      {loading && (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-accent-purple" />
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-center text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && data && data.entries.length === 0 && (
        <p className="py-8 text-center text-sm text-text-muted">No audit log entries found.</p>
      )}

      {/* Entries list */}
      {!loading && !error && data && data.entries.length > 0 && (
        <div className="space-y-3">
          {data.entries.map((entry) => {
            const hasMetadata = entry.metadata && Object.keys(entry.metadata).length > 0;
            const isExpanded = expandedIds.has(entry.id);

            return (
              <div
                key={entry.id}
                className="rounded-lg border border-white/10 bg-surface p-4 space-y-2"
              >
                {/* Row 1: action badge + admin email + timestamp */}
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`inline-block rounded-md px-2 py-0.5 text-xs font-medium ${actionBadgeClass(entry.action)}`}
                  >
                    {entry.action}
                  </span>
                  <span className="text-sm text-text-primary">{entry.admin_email}</span>
                  <span className="text-xs text-text-muted">{relativeTime(entry.created_at)}</span>
                </div>

                {/* Row 2: resource type + resource id */}
                <div className="flex items-center gap-2 text-sm text-text-muted">
                  <span>{entry.resource_type}</span>
                  {entry.resource_id && (
                    <>
                      <span className="text-white/20">/</span>
                      <span className="font-mono text-xs">{entry.resource_id}</span>
                    </>
                  )}
                </div>

                {/* Row 3: metadata (expandable) */}
                {hasMetadata && (
                  <div>
                    <button
                      onClick={() => toggleExpanded(entry.id)}
                      className="text-xs text-accent-purple hover:underline"
                    >
                      {isExpanded ? "Hide details" : "Show details"}
                    </button>
                    {isExpanded && (
                      <pre className="mt-2 max-h-48 overflow-auto rounded-md bg-white/5 p-3 text-xs text-text-muted">
                        {JSON.stringify(entry.metadata, null, 2)}
                      </pre>
                    )}
                  </div>
                )}

                {/* Row 4: IP address */}
                {entry.ip && <p className="text-xs text-text-muted">IP: {entry.ip}</p>}
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {data && data.total > 0 && (
        <Pagination page={data.page} limit={data.limit} total={data.total} onPageChange={setPage} />
      )}
    </div>
  );
}
