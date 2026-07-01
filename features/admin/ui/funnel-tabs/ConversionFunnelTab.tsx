"use client";

import { useMemo } from "react";
import { useAdminFetch } from "@features/admin/ui/hooks/useAdminFetch";
import FunnelChart from "@features/admin/ui/funnel-tabs/FunnelChart";

interface ConversionFunnelTabProps {
  days: number;
  utmFilter: string;
  onUtmFilterChange: (value: string) => void;
}

interface FunnelStage {
  name: string;
  count: number;
}

interface ConversionFunnelResponse {
  stages: FunnelStage[];
  previousStages: FunnelStage[];
  anomalies: Array<{
    stage: string;
    currentCount: number;
    previousCount: number;
    deltaPct: number;
    severity: "warning" | "positive" | "neutral";
  }>;
  trust: {
    sampleSize: number;
    warning: string | null;
    comparisonAvailable: boolean;
    comparisonMessage: string | null;
  };
}

// Fallback placeholder only (the RPC always returns populated stages). Kept in
// sync with get_conversion_funnel's real acquisition→purchase stages.
const DEFAULT_STAGES: FunnelStage[] = [
  { name: "unique_visitors", count: 0 },
  { name: "survey_started", count: 0 },
  { name: "survey_completed", count: 0 },
  { name: "report_viewed", count: 0 },
  { name: "purchased", count: 0 },
];

export default function ConversionFunnelTab({
  days,
  utmFilter,
  onUtmFilterChange,
}: ConversionFunnelTabProps) {
  const params = useMemo(() => {
    const nextParams: Record<string, string> = {};
    if (days > 0) nextParams.days = String(days);
    if (utmFilter.trim()) nextParams.utm = utmFilter.trim();
    return Object.keys(nextParams).length > 0 ? nextParams : undefined;
  }, [days, utmFilter]);

  const { data, loading, error } = useAdminFetch<ConversionFunnelResponse>(
    "/api/admin/funnels/conversion",
    params
  );

  const stages = useMemo(() => {
    if (!data?.stages || data.stages.length === 0) return DEFAULT_STAGES;
    return data.stages;
  }, [data]);
  const anomalies = useMemo(() => (Array.isArray(data?.anomalies) ? data.anomalies : []), [data]);
  const trust = useMemo(
    () => ({
      sampleSize: data?.trust?.sampleSize ?? 0,
      warning: data?.trust?.warning ?? null,
      comparisonAvailable: data?.trust?.comparisonAvailable ?? false,
      comparisonMessage:
        data?.trust?.comparisonMessage ??
        "No comparison data is available for this funnel window yet.",
    }),
    [data]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-accent-purple" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-center text-sm text-red-400">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-white/10 bg-surface p-4">
        <label className="mb-2 block text-xs font-medium text-text-muted">
          Filter by UTM Source
        </label>
        <input
          type="text"
          value={utmFilter}
          onChange={(event) => onUtmFilterChange(event.target.value)}
          placeholder="e.g. google, tiktok, newsletter"
          className="w-full max-w-xs rounded-lg border border-white/10 bg-[#1a1025] px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-muted/50 focus:border-accent-purple/50"
        />
      </div>

      <div className="rounded-xl border border-white/10 bg-surface p-6">
        <h3 className="mb-4 font-serif text-lg font-bold text-text-primary">Conversion Funnel</h3>
        <FunnelChart stages={stages} />
      </div>

      {trust.warning && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-100/90">
          {trust.warning}
        </div>
      )}

      <div className="rounded-xl border border-white/10 bg-surface p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-serif text-lg font-bold text-text-primary">Change Detection</h3>
          {trust.sampleSize > 0 && (
            <span className="text-xs text-text-muted">
              Current window sample: {trust.sampleSize.toLocaleString()}
            </span>
          )}
        </div>
        {!trust.comparisonAvailable && trust.comparisonMessage ? (
          <p className="text-sm text-text-muted">{trust.comparisonMessage}</p>
        ) : anomalies.length ? (
          <div className="space-y-2">
            {anomalies.map((item) => (
              <div
                key={item.stage}
                className="flex flex-col gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-3 md:flex-row md:items-center md:justify-between"
              >
                <div>
                  <p className="font-medium capitalize text-text-primary">
                    {item.stage.replaceAll("_", " ")}
                  </p>
                  <p className="text-xs text-text-muted">
                    {item.currentCount} now vs {item.previousCount} in the matched previous window
                  </p>
                </div>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    item.severity === "warning"
                      ? "bg-red-500/10 text-red-300"
                      : item.severity === "positive"
                        ? "bg-emerald-500/10 text-emerald-300"
                        : "bg-white/10 text-text-muted"
                  }`}
                >
                  {item.deltaPct > 0 ? "+" : ""}
                  {item.deltaPct}%
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-text-muted">
            No material funnel-stage movement detected for this window.
          </p>
        )}
      </div>
    </div>
  );
}
