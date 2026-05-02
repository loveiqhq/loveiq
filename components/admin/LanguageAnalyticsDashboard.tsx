"use client";

import { useState } from "react";
import { useAdminFetch } from "@/components/admin/hooks/useAdminFetch";

interface LanguageBreakdown {
  language: string;
  totalSubmissions: number;
  completed: number;
  completionRate: number;
  avgDurationMin: number | null;
  topArchetype: string | null;
  archetypes: Record<string, number>;
}

interface LanguageData {
  languageDistribution: Record<string, number>;
  languageBreakdown: LanguageBreakdown[];
  locationByLanguage: Record<string, Record<string, number>>;
  totalProfiles: number;
  totalLanguages: number;
}

const TABS = ["Overview", "Breakdown", "Location"] as const;
type Tab = (typeof TABS)[number];

export default function LanguageAnalyticsDashboard() {
  const [activeTab, setActiveTab] = useState<Tab>("Overview");
  const { data, loading, error } = useAdminFetch<LanguageData>("/api/admin/language-analytics");

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
        {error || "Failed to load language data."}
      </div>
    );
  }

  const langEntries = Object.entries(data.languageDistribution).sort(([, a], [, b]) => b - a);
  const maxLang = langEntries[0]?.[1] || 1;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-white/10 bg-surface p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-text-muted">
            Total Profiles
          </p>
          <p className="mt-1 text-2xl font-bold text-text-primary">{data.totalProfiles}</p>
        </div>
        <div className="rounded-lg border border-white/10 bg-surface p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-text-muted">Languages</p>
          <p className="mt-1 text-2xl font-bold text-accent-purple">{data.totalLanguages}</p>
        </div>
        <div className="rounded-lg border border-white/10 bg-surface p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-text-muted">
            Top Language
          </p>
          <p className="mt-1 truncate text-lg font-bold text-text-primary">
            {langEntries[0]?.[0] || "—"}
          </p>
        </div>
      </div>

      <div className="flex gap-1 rounded-lg border border-white/10 bg-surface p-1">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition ${
              activeTab === tab
                ? "bg-white/10 text-text-primary"
                : "text-text-muted hover:bg-white/5 hover:text-text-primary"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === "Overview" && (
        <div className="rounded-xl border border-white/10 bg-surface p-5">
          <h3 className="mb-4 text-sm font-medium text-text-primary">Language Distribution</h3>
          <div className="space-y-2">
            {langEntries.map(([lang, count]) => (
              <div key={lang} className="flex items-center gap-3">
                <span className="w-32 truncate text-sm text-text-muted">{lang}</span>
                <div className="h-6 flex-1 rounded bg-white/5">
                  <div
                    className="h-full rounded bg-accent-purple/60"
                    style={{ width: `${(count / maxLang) * 100}%` }}
                  />
                </div>
                <span className="w-8 text-right text-sm text-text-muted">{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === "Breakdown" && (
        <div className="rounded-xl border border-white/10 bg-surface overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 text-xs uppercase tracking-wider text-text-muted">
                <th className="px-4 py-3">Language</th>
                <th className="px-4 py-3">Submissions</th>
                <th className="px-4 py-3">Completed</th>
                <th className="px-4 py-3">Completion %</th>
                <th className="px-4 py-3">Avg Duration</th>
                <th className="px-4 py-3">Top Archetype</th>
              </tr>
            </thead>
            <tbody>
              {data.languageBreakdown.map((lb) => (
                <tr key={lb.language} className="border-b border-white/5 hover:bg-white/5">
                  <td className="px-4 py-3 font-medium text-text-primary">{lb.language}</td>
                  <td className="px-4 py-3 text-text-muted">{lb.totalSubmissions}</td>
                  <td className="px-4 py-3 text-text-muted">{lb.completed}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`font-medium ${
                        lb.completionRate >= 50 ? "text-green-400" : "text-yellow-400"
                      }`}
                    >
                      {lb.completionRate}%
                    </span>
                  </td>
                  <td className="px-4 py-3 text-text-muted">
                    {lb.avgDurationMin != null ? `${lb.avgDurationMin}m` : "—"}
                  </td>
                  <td className="px-4 py-3">
                    {lb.topArchetype ? (
                      <span className="inline-flex rounded-full bg-accent-purple/20 px-2 py-0.5 text-xs font-medium text-accent-purple">
                        {lb.topArchetype}
                      </span>
                    ) : (
                      <span className="text-text-muted">—</span>
                    )}
                  </td>
                </tr>
              ))}
              {data.languageBreakdown.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-text-muted">
                    No submission data available for any language yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === "Location" && (
        <div className="space-y-4">
          {Object.entries(data.locationByLanguage)
            .sort(([, a], [, b]) => {
              const totalA = Object.values(a).reduce((s, c) => s + c, 0);
              const totalB = Object.values(b).reduce((s, c) => s + c, 0);
              return totalB - totalA;
            })
            .map(([lang, locations]) => {
              const total = Object.values(locations).reduce((s, c) => s + c, 0);
              const sorted = Object.entries(locations).sort(([, a], [, b]) => b - a);
              const maxLoc = sorted[0]?.[1] || 1;
              return (
                <div key={lang} className="rounded-xl border border-white/10 bg-surface p-5">
                  <h3 className="mb-3 text-sm font-medium text-text-primary">
                    {lang} <span className="text-xs text-text-muted">({total} profiles)</span>
                  </h3>
                  <div className="space-y-1.5">
                    {sorted.map(([loc, count]) => (
                      <div key={loc} className="flex items-center gap-3">
                        <span className="w-28 truncate text-xs text-text-muted">{loc}</span>
                        <div className="h-4 flex-1 rounded bg-white/5">
                          <div
                            className="h-full rounded bg-accent-purple/40"
                            style={{ width: `${(count / maxLoc) * 100}%` }}
                          />
                        </div>
                        <span className="w-6 text-right text-xs text-text-muted">{count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}
