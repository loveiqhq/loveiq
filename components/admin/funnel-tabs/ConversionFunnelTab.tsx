"use client";

import { useState, useMemo } from "react";
import { useAdminFetch } from "@/components/admin/hooks/useAdminFetch";
import FunnelChart from "@/components/admin/funnel-tabs/FunnelChart";

interface ConversionFunnelTabProps {
  days: number;
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

const DEFAULT_STAGES: FunnelStage[] = [
  { name: "waitlist_signups", count: 0 },
  { name: "survey_started", count: 0 },
  { name: "survey_completed", count: 0 },
  { name: "invite_sent", count: 0 },
];

export default function ConversionFunnelTab({ days }: ConversionFunnelTabProps) {
  const [utmFilter, setUtmFilter] = useState("");

  const params = useMemo(() => {
    const p: Record<string, string> = {};
    if (days > 0) p.days = String(days);
    if (utmFilter.trim()) p.utm = utmFilter.trim();
    return Object.keys(p).length > 0 ? p : undefined;
  }, [days, utmFilter]);

  const { data, loading, error } = useAdminFetch<ConversionFunnelResponse>(
    "/api/admin/funnels/conversion",
    params
  );

  const stages = useMemo(() => {
    if (!data?.stages || data.stages.length === 0) return DEFAULT_STAGES;
    return data.stages;
  }, [data]);

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
      {/* UTM filter */}
      <div className="rounded-xl border border-white/10 bg-surface p-4">
        <label className="mb-2 block text-xs font-medium text-text-muted">
          Filter by UTM Source
        </label>
        <input
          type="text"
          value={utmFilter}
          onChange={(e) => setUtmFilter(e.target.value)}
          placeholder="e.g. google, tiktok, newsletter"
          className="w-full max-w-xs rounded-lg border border-white/10 bg-[#1a1025] px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-muted/50 focus:border-accent-purple/50"
        />
      </div>

      {/* Funnel visualization */}
      <div className="rounded-xl border border-white/10 bg-surface p-6">
        <h3 className="mb-4 font-serif text-lg font-bold text-text-primary">Conversion Funnel</h3>
        <FunnelChart stages={stages} />
      </div>

      {data?.trust.warning && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-100/90">
          {data.trust.warning}
        </div>
      )}

      <div className="rounded-xl border border-white/10 bg-surface p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-serif text-lg font-bold text-text-primary">Change Detection</h3>
          {data?.trust.sampleSize != null && (
            <span className="text-xs text-text-muted">
              Current window sample: {data.trust.sampleSize.toLocaleString()}
            </span>
          )}
        </div>
        {!data?.trust.comparisonAvailable && data?.trust.comparisonMessage ? (
          <p className="text-sm text-text-muted">{data.trust.comparisonMessage}</p>
        ) : data?.anomalies.length ? (
          <div className="space-y-2">
            {data.anomalies.map((item) => (
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
