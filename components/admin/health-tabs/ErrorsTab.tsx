"use client";

import { useAdminFetch } from "@/components/admin/hooks/useAdminFetch";
import KpiDataTable, { type Column } from "@/components/admin/kpi-tabs/KpiDataTable";

interface RateLimitHit {
  bucket: string;
  totalHits: number;
}

interface WebhookError {
  eventType: string;
  error: string;
  receivedAt: string;
}

interface LogsData {
  rateLimitHits: RateLimitHit[];
  webhookErrors: WebhookError[];
  period: string;
}

const rateLimitColumns: Column<RateLimitHit>[] = [
  { key: "bucket", label: "Bucket" },
  { key: "totalHits", label: "Hits (24h)", align: "right" },
];

const webhookColumns: Column<WebhookError>[] = [
  { key: "eventType", label: "Event Type" },
  { key: "error", label: "Error", sortable: false },
  {
    key: "receivedAt",
    label: "When",
    format: (v) => new Date(String(v)).toLocaleString(),
  },
];

export default function ErrorsTab() {
  const { data, loading, error } = useAdminFetch<LogsData>("/api/admin/health/logs");

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
        {error || "Failed to load error data."}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-white/10 bg-surface p-5">
        <h3 className="mb-4 text-sm font-medium text-text-primary">Rate Limit Hits (24h)</h3>
        {data.rateLimitHits.length > 0 ? (
          <KpiDataTable
            data={data.rateLimitHits}
            columns={rateLimitColumns}
            defaultSortKey="totalHits"
            defaultSortDir="desc"
          />
        ) : (
          <p className="text-sm text-text-muted">No rate limit hits in the last 24 hours.</p>
        )}
      </div>

      <div className="rounded-xl border border-white/10 bg-surface p-5">
        <h3 className="mb-4 text-sm font-medium text-text-primary">Webhook Processing Errors</h3>
        {data.webhookErrors.length > 0 ? (
          <KpiDataTable data={data.webhookErrors} columns={webhookColumns} />
        ) : (
          <p className="text-sm text-text-muted">No webhook errors.</p>
        )}
      </div>
    </div>
  );
}
