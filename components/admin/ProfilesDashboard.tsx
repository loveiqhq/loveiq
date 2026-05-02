"use client";

import { useState } from "react";
import { useAdminFetch } from "@/components/admin/hooks/useAdminFetch";

interface Profile {
  id: number;
  email: string;
  firstName: string | null;
  gender: string | null;
  age: number | null;
  sexualOrientation: string | null;
  relationshipStatus: string | null;
  location: string | null;
  language: string | null;
  goals: string | null;
  challenges: string | null;
  createdAt: string;
  hasSubmission: boolean;
  archetype: string | null;
}

interface Demographics {
  genderDistribution: Record<string, number>;
  ageDistribution: Record<string, number>;
  orientationDistribution: Record<string, number>;
  relationshipDistribution: Record<string, number>;
  locationDistribution: Record<string, number>;
  totalProfiles: number;
  avgAge: number | null;
  withSubmission: number;
  topLocation: string;
}

interface ProfilesData {
  profiles: Profile[];
  demographics: Demographics;
  timelines: Array<{
    profileId: number;
    label: string;
    source: string;
    archetype: string | null;
    events: Array<{ label: string; at: string | null; detail: string }>;
  }>;
}

const TABS = ["Demographics", "Profiles", "Enrichment Timeline"] as const;
type Tab = (typeof TABS)[number];

function DistributionBars({
  title,
  distribution,
}: {
  title: string;
  distribution: Record<string, number>;
}) {
  const total = Object.values(distribution).reduce((s, c) => s + c, 0);
  const sorted = Object.entries(distribution).sort(([, a], [, b]) => b - a);
  return (
    <div className="rounded-xl border border-white/10 bg-surface p-5">
      <h3 className="mb-4 text-sm font-medium text-text-primary">{title}</h3>
      <div className="space-y-2">
        {sorted.map(([label, count]) => (
          <div key={label} className="flex items-center gap-3">
            <span className="w-32 truncate text-sm text-text-muted">{label}</span>
            <div className="h-6 flex-1 rounded bg-white/5">
              <div
                className="h-full rounded bg-accent-purple/60"
                style={{ width: `${total > 0 ? (count / total) * 100 : 0}%` }}
              />
            </div>
            <span className="w-8 text-right text-sm text-text-muted">{count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ProfilesDashboard() {
  const [activeTab, setActiveTab] = useState<Tab>("Demographics");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<number | null>(null);
  const { data, loading, error } = useAdminFetch<ProfilesData>("/api/admin/profiles");

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
        {error || "Failed to load profiles."}
      </div>
    );
  }

  const { demographics: d, profiles } = data;
  const filtered = profiles.filter(
    (p) =>
      !search ||
      (p.firstName || "").toLowerCase().includes(search.toLowerCase()) ||
      p.email.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
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

      {activeTab === "Demographics" && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border border-white/10 bg-surface p-4">
              <p className="text-xs font-medium uppercase tracking-wider text-text-muted">
                Total Profiles
              </p>
              <p className="mt-1 text-2xl font-bold text-text-primary">{d.totalProfiles}</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-surface p-4">
              <p className="text-xs font-medium uppercase tracking-wider text-text-muted">
                With Submission
              </p>
              <p className="mt-1 text-2xl font-bold text-green-400">{d.withSubmission}</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-surface p-4">
              <p className="text-xs font-medium uppercase tracking-wider text-text-muted">
                Avg Age
              </p>
              <p className="mt-1 text-2xl font-bold text-text-primary">{d.avgAge ?? "—"}</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-surface p-4">
              <p className="text-xs font-medium uppercase tracking-wider text-text-muted">
                Top Location
              </p>
              <p className="mt-1 truncate text-lg font-bold text-text-primary">{d.topLocation}</p>
            </div>
          </div>

          <DistributionBars title="Gender Distribution" distribution={d.genderDistribution} />
          <DistributionBars title="Age Distribution" distribution={d.ageDistribution} />
          <DistributionBars title="Sexual Orientation" distribution={d.orientationDistribution} />
          <DistributionBars title="Relationship Status" distribution={d.relationshipDistribution} />
          <DistributionBars title="Location" distribution={d.locationDistribution} />
        </div>
      )}

      {activeTab === "Profiles" && (
        <div className="space-y-4">
          <input
            type="text"
            placeholder="Search by name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-text-primary placeholder-text-muted/50 focus:border-accent-purple focus:outline-none"
          />
          <div className="rounded-xl border border-white/10 bg-surface overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 text-xs uppercase tracking-wider text-text-muted">
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Gender</th>
                  <th className="px-4 py-3">Age</th>
                  <th className="px-4 py-3">Location</th>
                  <th className="px-4 py-3">Archetype</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <>
                    <tr
                      key={p.id}
                      onClick={() => setExpanded(expanded === p.id ? null : p.id)}
                      className="cursor-pointer border-b border-white/5 hover:bg-white/5"
                    >
                      <td className="px-4 py-3 text-text-primary">{p.firstName || "—"}</td>
                      <td className="px-4 py-3 text-text-muted">{p.email}</td>
                      <td className="px-4 py-3 text-text-muted">{p.gender || "—"}</td>
                      <td className="px-4 py-3 text-text-muted">{p.age ?? "—"}</td>
                      <td className="px-4 py-3 text-text-muted">{p.location || "—"}</td>
                      <td className="px-4 py-3">
                        {p.archetype ? (
                          <span className="inline-flex rounded-full bg-accent-purple/20 px-2 py-0.5 text-xs font-medium text-accent-purple">
                            {p.archetype}
                          </span>
                        ) : (
                          <span className="text-text-muted">—</span>
                        )}
                      </td>
                    </tr>
                    {expanded === p.id && (
                      <tr key={`${p.id}-detail`} className="border-b border-white/5">
                        <td colSpan={6} className="bg-white/5 px-4 py-3">
                          <div className="grid gap-4 sm:grid-cols-2">
                            <div>
                              <p className="text-xs font-medium uppercase text-text-muted">Goals</p>
                              <p className="mt-1 text-sm text-text-primary">
                                {p.goals || "Not specified"}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs font-medium uppercase text-text-muted">
                                Challenges
                              </p>
                              <p className="mt-1 text-sm text-text-primary">
                                {p.challenges || "Not specified"}
                              </p>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === "Enrichment Timeline" && (
        <div className="space-y-4">
          {data.timelines.map((timeline) => (
            <div
              key={timeline.profileId}
              className="rounded-xl border border-white/10 bg-surface p-5"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-text-primary">{timeline.label}</p>
                  <p className="mt-1 text-xs text-text-muted">
                    {timeline.source} · {timeline.archetype || "No archetype"}
                  </p>
                </div>
              </div>
              <div className="mt-4 space-y-3">
                {timeline.events.map((event) => (
                  <div key={`${timeline.profileId}-${event.label}`} className="flex gap-3">
                    <div className="w-28 shrink-0 text-xs text-text-muted">
                      {event.at ? new Date(event.at).toLocaleDateString() : "Pending"}
                    </div>
                    <div className="flex-1 rounded-lg border border-white/10 bg-white/5 px-4 py-3">
                      <p className="text-sm font-medium text-text-primary">{event.label}</p>
                      <p className="mt-1 text-xs text-text-muted">{event.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
