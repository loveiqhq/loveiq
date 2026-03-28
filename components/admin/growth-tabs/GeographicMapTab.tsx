"use client";

import { useMemo } from "react";
import { useAdminFetch } from "@/components/admin/hooks/useAdminFetch";
import StatCard from "@/components/admin/StatCard";
import BarChart from "@/components/admin/BarChart";

interface CountryEntry {
  country: string;
  count: number;
}

interface GeographyData {
  countries: CountryEntry[];
  total: number;
}

interface GeographicMapTabProps {
  days: number;
}

export default function GeographicMapTab({ days }: GeographicMapTabProps) {
  const params = useMemo(() => (days > 0 ? { days: String(days) } : undefined), [days]);
  const { data, loading, error } = useAdminFetch<GeographyData>(
    "/api/admin/growth/geography",
    params
  );

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
        {error || "Failed to load geography data."}
      </div>
    );
  }

  const top15 = data.countries.slice(0, 15);
  const barItems = top15.map((c) => ({ label: c.country, value: c.count }));
  const maxCount = data.countries.length > 0 ? data.countries[0].count : 1;

  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-2">
        <StatCard label="Total Responses" value={data.total.toLocaleString()} />
        <StatCard label="Unique Countries" value={data.countries.length.toLocaleString()} />
      </div>

      {/* Top 15 countries bar chart */}
      {barItems.length > 0 && (
        <div className="rounded-xl border border-white/10 bg-surface p-5">
          <h3 className="mb-4 text-sm font-medium text-text-primary">Top 15 Countries</h3>
          <BarChart items={barItems} direction="horizontal" />
        </div>
      )}

      {/* Country pills visual */}
      {data.countries.length > 0 && (
        <div className="rounded-xl border border-white/10 bg-surface p-5">
          <h3 className="mb-4 text-sm font-medium text-text-primary">All Countries</h3>
          <div className="flex flex-wrap gap-2">
            {data.countries.map((c) => {
              const opacity = Math.max(c.count / maxCount, 0.15);
              // Scale font size: higher count = larger text
              const ratio = c.count / maxCount;
              const fontSize = ratio > 0.6 ? "text-sm" : ratio > 0.3 ? "text-xs" : "text-[10px]";
              return (
                <span
                  key={c.country}
                  className={`rounded-full px-3 py-1 font-medium text-text-primary ${fontSize}`}
                  style={{ backgroundColor: `rgba(156, 125, 255, ${opacity})` }}
                  title={`${c.country}: ${c.count}`}
                >
                  {c.country}
                  <span className="ml-1.5 text-text-muted">{c.count}</span>
                </span>
              );
            })}
          </div>
        </div>
      )}

      {data.countries.length === 0 && (
        <div className="rounded-xl border border-white/10 bg-surface p-8 text-center text-sm text-text-muted">
          No geographic data available yet.
        </div>
      )}
    </div>
  );
}
