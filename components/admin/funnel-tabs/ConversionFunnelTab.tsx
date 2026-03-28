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

  const { data, loading, error } = useAdminFetch<FunnelStage[]>(
    "/api/admin/funnels/conversion",
    params
  );

  const stages = useMemo(() => {
    if (!data || !Array.isArray(data) || data.length === 0) return DEFAULT_STAGES;
    return data;
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
    </div>
  );
}
