"use client";

import { useAdminFetch } from "./hooks/useAdminFetch";

interface ShareEntry {
  method: "email" | "link" | "share";
  channel: string;
  recipient_email: string | null;
  shared_at: string;
  plan_at_share: string | null;
}

interface FunnelData {
  submission_id: number;
  user: { id: number | null; email_masked: string | null; first_name: string | null };
  funnel: {
    started_at: string | null;
    landing_page_view: boolean;
    start_survey_at: string | null;
    progress_25_at: string | null;
    progress_50_at: string | null;
    progress_75_at: string | null;
    survey_completed_at: string | null;
    report_viewed_at: string | null;
    engagement_1min_at: string | null;
    engagement_5min_at: string | null;
    engagement_10min_at: string | null;
    paywall_initiated_at: string | null;
    paywall_unlocked_at: string | null;
  };
  pricing: {
    bucket: string | null;
    price_shown_full_report_eur: number | null;
    currency: string;
  };
  conversion: {
    plan: string | null;
    value_eur: number | null;
    currency: string;
    transaction_id: string | null;
  };
  shares: ShareEntry[];
  context: {
    session_id: string | null;
    utm_source: string | null;
    utm_tracker: string | null;
  };
}

const COLUMNS: Array<{ key: keyof FunnelData["funnel"]; label: string }> = [
  { key: "landing_page_view", label: "Landing" },
  { key: "start_survey_at", label: "Start" },
  { key: "progress_25_at", label: "25%" },
  { key: "progress_50_at", label: "50%" },
  { key: "progress_75_at", label: "75%" },
  { key: "survey_completed_at", label: "Completed" },
  { key: "report_viewed_at", label: "Report" },
  { key: "engagement_1min_at", label: "1 min" },
  { key: "engagement_5min_at", label: "5 min" },
  { key: "engagement_10min_at", label: "10 min" },
  { key: "paywall_initiated_at", label: "Paywall" },
];

const BUCKET_BADGE: Record<string, string> = {
  A: "bg-accent-purple/20 text-accent-purple border-accent-purple/40",
  B: "bg-accent-orange/20 text-accent-orange border-accent-orange/40",
  C: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
};

function formatShortDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatPrice(value: number | null, currency: string): string {
  if (value === null) return "—";
  try {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: currency || "EUR",
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `€${value.toFixed(2)}`;
  }
}

function FunnelCell({
  label,
  active,
  timestamp,
}: {
  label: string;
  active: boolean;
  timestamp: string | null;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 px-2 py-3">
      <span className="text-[10px] uppercase tracking-wide text-text-muted">{label}</span>
      <span
        className={`text-base font-semibold ${active ? "text-emerald-300" : "text-text-muted/40"}`}
        title={timestamp ?? undefined}
      >
        {active ? "✓" : "—"}
      </span>
      {timestamp && (
        <span className="text-[10px] text-text-muted">{formatShortDateTime(timestamp)}</span>
      )}
    </div>
  );
}

export default function UserFunnelCard({ id }: { id: string }) {
  const { data, loading, error } = useAdminFetch<FunnelData>(`/api/admin/submissions/${id}/funnel`);

  if (loading) {
    return (
      <div className="rounded-xl border border-white/10 bg-surface p-5">
        <div className="flex items-center gap-2">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-accent-purple" />
          <span className="text-sm text-text-muted">Loading funnel…</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-white/10 bg-surface p-5">
        <p className="text-sm text-text-muted">Funnel unavailable</p>
      </div>
    );
  }

  // Guard against shape drift (e.g. stale cache, swapped mock in tests).
  // The funnel card is purely informational — silently skip if the response
  // doesn't carry the expected sections rather than crashing the page.
  if (!data || !data.funnel || !data.user || !data.pricing || !data.conversion) {
    return null;
  }

  const f = data.funnel;
  const userIdLabel = data.user.id ? `#${data.user.id}` : `#${data.submission_id}`;
  const startedAt = f.started_at ?? f.start_survey_at;
  const bucketBadge = data.pricing.bucket
    ? (BUCKET_BADGE[data.pricing.bucket] ?? "bg-white/10 text-text-primary border-white/20")
    : null;

  const cellActive: Record<keyof FunnelData["funnel"], boolean> = {
    started_at: Boolean(f.started_at),
    landing_page_view: f.landing_page_view,
    start_survey_at: Boolean(f.start_survey_at),
    progress_25_at: Boolean(f.progress_25_at),
    progress_50_at: Boolean(f.progress_50_at),
    progress_75_at: Boolean(f.progress_75_at),
    survey_completed_at: Boolean(f.survey_completed_at),
    report_viewed_at: Boolean(f.report_viewed_at),
    engagement_1min_at: Boolean(f.engagement_1min_at),
    engagement_5min_at: Boolean(f.engagement_5min_at),
    engagement_10min_at: Boolean(f.engagement_10min_at),
    paywall_initiated_at: Boolean(f.paywall_initiated_at),
    paywall_unlocked_at: Boolean(f.paywall_unlocked_at),
  };

  return (
    <div className="rounded-xl border border-white/10 bg-surface p-5">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-text-primary">User Session Funnel</h3>
          <p className="mt-0.5 text-xs text-text-muted">
            One-row tracking sheet: landing → completion → conversion
          </p>
        </div>
        <div className="flex items-baseline gap-3 text-xs text-text-muted">
          <span>
            <span className="text-text-primary">{userIdLabel}</span>
            {data.user.email_masked && <span className="ml-1">{data.user.email_masked}</span>}
          </span>
          <span>{formatShortDateTime(startedAt)}</span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="grid min-w-[760px] grid-cols-11 divide-x divide-white/10 rounded-lg border border-white/10">
          {COLUMNS.map((col) => {
            const value = f[col.key];
            const timestamp = typeof value === "string" ? value : null;
            return (
              <FunnelCell
                key={col.key}
                label={col.label}
                active={cellActive[col.key]}
                timestamp={timestamp}
              />
            );
          })}
        </div>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-white/10 bg-page p-3">
          <p className="text-[10px] uppercase tracking-wide text-text-muted">Pricing bucket</p>
          {bucketBadge ? (
            <div className="mt-1 flex items-baseline gap-2">
              <span
                className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${bucketBadge}`}
              >
                {data.pricing.bucket}
              </span>
              <span className="text-sm text-text-primary">
                Full: {formatPrice(data.pricing.price_shown_full_report_eur, data.pricing.currency)}
              </span>
            </div>
          ) : (
            <p className="mt-1 text-sm text-text-muted">No quote issued yet</p>
          )}
        </div>

        <div className="rounded-lg border border-white/10 bg-page p-3">
          <p className="text-[10px] uppercase tracking-wide text-text-muted">Conversion</p>
          {data.funnel.paywall_unlocked_at ? (
            <div className="mt-1">
              <p className="text-sm text-emerald-300">
                {formatPrice(data.conversion.value_eur, data.conversion.currency)}
                {data.conversion.plan && (
                  <span className="ml-2 text-text-muted">· {data.conversion.plan}</span>
                )}
              </p>
              <p className="mt-0.5 text-[10px] text-text-muted">
                Unlocked {formatShortDateTime(data.funnel.paywall_unlocked_at)}
              </p>
            </div>
          ) : (
            <p className="mt-1 text-sm text-text-muted">Not yet</p>
          )}
        </div>

        <div className="rounded-lg border border-white/10 bg-page p-3">
          <p className="text-[10px] uppercase tracking-wide text-text-muted">
            Shared with ({data.shares.length})
          </p>
          {data.shares.length === 0 ? (
            <p className="mt-1 text-sm text-text-muted">No shares</p>
          ) : (
            <ul className="mt-1 space-y-0.5 text-xs">
              {data.shares.slice(0, 4).map((s, i) => (
                <li key={`${s.shared_at}-${i}`} className="flex items-baseline gap-1">
                  <span
                    className={`inline-flex items-center rounded-full px-1.5 text-[9px] uppercase ${
                      s.method === "email"
                        ? "bg-blue-400/20 text-blue-300"
                        : s.method === "share"
                          ? "bg-pink-400/20 text-pink-300"
                          : "bg-orange-400/20 text-orange-300"
                    }`}
                  >
                    {s.channel}
                  </span>
                  <span className="text-text-primary">{s.recipient_email ?? "—"}</span>
                  {s.plan_at_share && <span className="text-text-muted">· {s.plan_at_share}</span>}
                </li>
              ))}
              {data.shares.length > 4 && (
                <li className="text-text-muted">+ {data.shares.length - 4} more</li>
              )}
            </ul>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[11px] text-text-muted">
        {data.context.utm_source && (
          <span>
            utm: <span className="text-text-primary">{data.context.utm_source}</span>
          </span>
        )}
        {data.context.session_id && (
          <span>
            session: <span className="text-text-primary">{data.context.session_id}</span>
          </span>
        )}
      </div>
    </div>
  );
}
