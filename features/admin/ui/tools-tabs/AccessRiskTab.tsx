"use client";

import { useState } from "react";
import TimeRangeSelector from "@features/admin/ui/TimeRangeSelector";
import { useAdminFetch } from "@features/admin/ui/hooks/useAdminFetch";

interface AccessRiskData {
  summary: {
    admins: number;
    staleAdmins: number;
    highRiskActions7d: number;
    uniqueIps30d: number;
    adminOnlyRoutes: number;
    openReviews: number;
  };
  adminRoster: Array<{
    email: string;
    role: "viewer" | "editor" | "admin";
    actionCount: number;
    highRiskCount: number;
    riskScore: number;
    lastActive: string | null;
    uniqueIps: number;
    topActions: Array<{ action: string; count: number }>;
    stale: boolean;
  }>;
  highRiskActions: Array<{
    id: number;
    adminEmail: string;
    action: string;
    resourceType: string;
    resourceId: string | null;
    ip: string | null;
    createdAt: string;
    risk: "critical" | "high" | "medium" | "low";
    metadataSummary: string;
  }>;
  routeMatrix: Array<{
    role: "viewer" | "editor" | "admin";
    routes: number;
    examples: string[];
  }>;
  topRiskResources: Array<{
    resourceType: string;
    count: number;
    lastTouched: string;
    uniqueAdmins: number;
  }>;
  days: number;
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-surface p-4">
      <p className="text-xs uppercase tracking-wide text-text-muted">{label}</p>
      <p className="mt-2 font-serif text-2xl font-semibold text-text-primary">{value}</p>
    </div>
  );
}

function roleTone(role: "viewer" | "editor" | "admin"): string {
  if (role === "admin") return "bg-red-500/10 text-red-300";
  if (role === "editor") return "bg-amber-500/10 text-amber-200";
  return "bg-white/10 text-text-muted";
}

function riskTone(level: "critical" | "high" | "medium" | "low"): string {
  if (level === "critical") return "bg-red-500/10 text-red-300";
  if (level === "high") return "bg-amber-500/10 text-amber-200";
  if (level === "medium") return "bg-cyan-500/10 text-cyan-300";
  return "bg-white/10 text-text-muted";
}

export default function AccessRiskTab() {
  const [days, setDays] = useState(30);
  const { data, loading, error } = useAdminFetch<AccessRiskData>("/api/admin/access-risk", {
    days: String(days),
  });

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
        {error || "Failed to load access and risk."}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="font-serif text-xl font-bold text-text-primary">Access & Risk</h2>
          <p className="mt-1 max-w-3xl text-sm text-text-muted">
            Review admin role coverage, stale accounts, high-risk changes, and protected route
            exposure.
          </p>
        </div>
        <TimeRangeSelector value={days} onChange={setDays} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <SummaryTile label="Admins" value={String(data.summary.admins)} />
        <SummaryTile label="Stale Access" value={String(data.summary.staleAdmins)} />
        <SummaryTile label="High-Risk 7d" value={String(data.summary.highRiskActions7d)} />
        <SummaryTile label="Unique IPs" value={String(data.summary.uniqueIps30d)} />
        <SummaryTile label="Admin-Only Routes" value={String(data.summary.adminOnlyRoutes)} />
        <SummaryTile label="Open Reviews" value={String(data.summary.openReviews)} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr,0.8fr]">
        <section>
          <h3 className="font-serif text-lg font-semibold text-text-primary">Admin Roster</h3>
          <div className="mt-3 grid gap-4">
            {data.adminRoster.map((entry) => (
              <div key={entry.email} className="rounded-2xl border border-white/10 bg-surface p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] uppercase tracking-wide ${roleTone(entry.role)}`}
                      >
                        {entry.role}
                      </span>
                      {entry.stale && (
                        <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] uppercase tracking-wide text-amber-200">
                          stale
                        </span>
                      )}
                    </div>
                    <p className="mt-2 text-lg font-semibold text-text-primary">{entry.email}</p>
                    <p className="mt-1 text-sm text-text-muted">
                      Last active{" "}
                      {entry.lastActive ? new Date(entry.lastActive).toLocaleString() : "never"}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-serif text-2xl font-semibold text-text-primary">
                      {entry.riskScore}
                    </p>
                    <p className="mt-1 text-xs text-text-muted">risk score</p>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-4">
                  <SummaryTile label="Actions" value={String(entry.actionCount)} />
                  <SummaryTile label="High-Risk" value={String(entry.highRiskCount)} />
                  <SummaryTile label="IPs" value={String(entry.uniqueIps)} />
                  <SummaryTile label="Top Actions" value={String(entry.topActions.length)} />
                </div>

                {entry.topActions.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {entry.topActions.map((action) => (
                      <span
                        key={`${entry.email}-${action.action}`}
                        className="rounded-full bg-white/10 px-3 py-1 text-xs text-text-muted"
                      >
                        {action.action} x{action.count}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-6">
          <div>
            <h3 className="font-serif text-lg font-semibold text-text-primary">
              Permission Matrix
            </h3>
            <div className="mt-3 space-y-3">
              {data.routeMatrix.map((group) => (
                <div key={group.role} className="rounded-2xl border border-white/10 bg-surface p-5">
                  <div className="flex items-center justify-between gap-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] uppercase tracking-wide ${roleTone(group.role)}`}
                    >
                      {group.role}
                    </span>
                    <span className="font-serif text-xl font-semibold text-text-primary">
                      {group.routes}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {group.examples.map((route) => (
                      <code
                        key={route}
                        className="rounded bg-white/5 px-2 py-1 text-[11px] text-text-muted"
                      >
                        {route}
                      </code>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h3 className="font-serif text-lg font-semibold text-text-primary">Risk Hotspots</h3>
            <div className="mt-3 space-y-3">
              {data.topRiskResources.map((resource) => (
                <div
                  key={resource.resourceType}
                  className="rounded-2xl border border-white/10 bg-surface p-5"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-medium text-text-primary">{resource.resourceType}</p>
                    <span className="text-sm text-text-muted">{resource.count} changes</span>
                  </div>
                  <p className="mt-2 text-sm text-text-muted">
                    {resource.uniqueAdmins} admins touched this surface. Last change{" "}
                    {new Date(resource.lastTouched).toLocaleString()}.
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>

      <section>
        <h3 className="font-serif text-lg font-semibold text-text-primary">
          High-Risk Action Feed
        </h3>
        <div className="mt-3 space-y-3">
          {data.highRiskActions.length === 0 && (
            <div className="rounded-xl border border-white/10 bg-surface p-6 text-sm text-text-muted">
              No high-risk actions were logged in the selected window.
            </div>
          )}
          {data.highRiskActions.map((entry) => (
            <div key={entry.id} className="rounded-2xl border border-white/10 bg-surface p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] uppercase tracking-wide ${riskTone(entry.risk)}`}
                    >
                      {entry.risk}
                    </span>
                    <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] uppercase tracking-wide text-text-muted">
                      {entry.resourceType}
                    </span>
                  </div>
                  <p className="mt-2 text-base font-semibold text-text-primary">{entry.action}</p>
                  <p className="mt-1 text-sm text-text-muted">
                    {entry.adminEmail}
                    {entry.resourceId ? ` | ${entry.resourceId}` : ""}
                    {entry.ip ? ` | ${entry.ip}` : ""}
                  </p>
                </div>
                <p className="text-xs text-text-muted">
                  {new Date(entry.createdAt).toLocaleString()}
                </p>
              </div>
              <div className="mt-3 rounded-lg border border-white/10 bg-white/5 px-3 py-3 text-sm text-text-muted">
                {entry.metadataSummary}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
