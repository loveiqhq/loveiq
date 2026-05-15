"use client";

import { useAdminFetch } from "@features/admin/ui/hooks/useAdminFetch";
import StatCard from "@features/admin/ui/StatCard";

interface OrgAsset {
  key: string;
  label: string;
  href: string;
  description: string;
  volume: number;
  owner: string | null;
  lastUpdated: string | null;
  freshnessHours: number | null;
  status: "healthy" | "watch" | "risk";
  flags: string[];
  trust: {
    source: string;
    mode: string;
    sampleSize: number;
    lastUpdated: string | null;
    freshnessHours: number | null;
    warning: string | null;
  };
}

interface OrgData {
  generatedAt: string;
  summary: {
    totalAssets: number;
    healthy: number;
    watch: number;
    risk: number;
    staleAssets: number;
    ownerGaps: number;
  };
  highlights: Array<{
    label: string;
    href: string;
    status: "healthy" | "watch" | "risk";
    note: string;
  }>;
  assets: OrgAsset[];
}

const statusClasses: Record<OrgAsset["status"], string> = {
  healthy: "border-emerald-500/20 bg-emerald-500/10 text-emerald-300",
  watch: "border-amber-500/20 bg-amber-500/10 text-amber-200",
  risk: "border-red-500/20 bg-red-500/10 text-red-300",
};

export default function OrgAdminDirectory() {
  const { data, loading, error } = useAdminFetch<OrgData>("/api/admin/org");

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-accent-purple" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-6 text-center text-sm text-red-400">
        {error || "Failed to load org directory."}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <StatCard label="Assets" value={data.summary.totalAssets} />
        <StatCard label="Healthy" value={data.summary.healthy} />
        <StatCard label="Watch" value={data.summary.watch} />
        <StatCard label="Risk" value={data.summary.risk} />
        <StatCard label="Stale" value={data.summary.staleAssets} />
        <StatCard label="Owner Gaps" value={data.summary.ownerGaps} />
      </div>

      <div className="rounded-xl border border-white/10 bg-surface p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-text-primary">Org Watchlist</h2>
          <p className="text-xs text-text-muted">
            Generated {new Date(data.generatedAt).toLocaleString()}
          </p>
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {data.highlights.length === 0 && (
            <p className="text-sm text-text-muted">No elevated org-level issues detected.</p>
          )}
          {data.highlights.map((highlight) => (
            <a
              key={`${highlight.label}-${highlight.note}`}
              href={highlight.href}
              className="rounded-lg border border-white/10 bg-white/5 p-4 transition hover:border-white/20 hover:bg-white/10"
            >
              <div className="flex items-center gap-2">
                <span
                  className={`rounded-full border px-2 py-0.5 text-[11px] uppercase tracking-wide ${statusClasses[highlight.status]}`}
                >
                  {highlight.status}
                </span>
                <p className="text-sm font-semibold text-text-primary">{highlight.label}</p>
              </div>
              <p className="mt-2 text-sm text-text-muted">{highlight.note}</p>
            </a>
          ))}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {data.assets.map((asset) => (
          <a
            key={asset.key}
            href={asset.href}
            className="rounded-xl border border-white/10 bg-surface p-5 transition hover:border-white/20 hover:bg-white/5"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-text-primary">{asset.label}</h3>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[11px] uppercase tracking-wide ${statusClasses[asset.status]}`}
                  >
                    {asset.status}
                  </span>
                </div>
                <p className="mt-2 text-sm text-text-muted">{asset.description}</p>
              </div>
              <p className="text-lg font-semibold text-text-primary">{asset.volume}</p>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-3">
                <p className="text-[11px] uppercase tracking-wide text-text-muted">Owner</p>
                <p className="mt-1 text-sm text-text-primary">{asset.owner ?? "Unassigned"}</p>
              </div>
              <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-3">
                <p className="text-[11px] uppercase tracking-wide text-text-muted">Freshness</p>
                <p className="mt-1 text-sm text-text-primary">
                  {asset.freshnessHours != null ? `${asset.freshnessHours}h` : "Unknown"}
                </p>
              </div>
              <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-3">
                <p className="text-[11px] uppercase tracking-wide text-text-muted">Trust Mode</p>
                <p className="mt-1 text-sm text-text-primary">{asset.trust.mode}</p>
              </div>
            </div>

            {asset.flags.length > 0 && (
              <div className="mt-4 space-y-2">
                {asset.flags.map((flag) => (
                  <div
                    key={flag}
                    className="rounded-lg border border-white/10 bg-page px-3 py-2 text-sm text-text-muted"
                  >
                    {flag}
                  </div>
                ))}
              </div>
            )}
          </a>
        ))}
      </div>
    </div>
  );
}
