"use client";

import { useState, useMemo, useCallback } from "react";
import { useAdminFetch } from "@/components/admin/hooks/useAdminFetch";
import StatCard from "@/components/admin/StatCard";

const ARCHETYPES = [
  "Spark Seeker",
  "Sensual Connector",
  "Exhibitionist Performer",
  "Explorer of Edges",
  "Curious Apprentice",
  "Quiet Withdrawer",
  "Romantic Idealist",
  "Power Orchestrator",
  "Fluid Adventurer",
  "Mindful Balancer",
  "Healing Journeyer",
  "Intimate Technician",
  "Nurturing Caregiver",
  "Erotic Intellectual",
] as const;

type SegmentType = "utm" | "dateRange" | "archetype" | "sessionState" | "savedSegment";
type SegmentOption = {
  id: number;
  name: string;
  match_count: number | null;
};
type SessionState = "fresh" | "resumed";

interface DateRange {
  since: string;
  until: string;
}

interface SegmentMetrics {
  total_submissions?: number;
  completed?: number;
  avg_duration_ms?: number | null;
  archetype_distribution?: Array<{ archetype: string; count: number }>;
}

interface SegmentResponse {
  segmentA: SegmentMetrics;
  segmentB: SegmentMetrics;
  trust?: {
    sampleSize?: number;
    segmentCount?: number;
    source?: string;
    refreshCadenceMinutes?: number;
  };
}

interface SavedSegmentsResponse {
  segments: SegmentOption[];
}

function formatDuration(ms: number | null | undefined): string {
  if (ms == null) return "--";
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.round((ms % 60_000) / 1000);
  return `${minutes}m ${seconds}s`;
}

function formatDelta(
  a: number | undefined,
  b: number | undefined
): {
  text: string;
  className: string;
} {
  if (a == null || b == null || a === 0) return { text: "--", className: "text-text-muted" };
  const diff = b - a;
  const pct = Math.round((diff / a) * 100);
  if (pct === 0) return { text: "0%", className: "text-text-muted" };
  if (pct > 0) return { text: `+${pct}%`, className: "text-green-400" };
  return { text: `${pct}%`, className: "text-red-400" };
}

export default function ABComparisonTab() {
  const [segmentType, setSegmentType] = useState<SegmentType>("utm");
  const [utmA, setUtmA] = useState("");
  const [utmB, setUtmB] = useState("");
  const [dateA, setDateA] = useState<DateRange>({ since: "", until: "" });
  const [dateB, setDateB] = useState<DateRange>({ since: "", until: "" });
  const [archetypeA, setArchetypeA] = useState("");
  const [archetypeB, setArchetypeB] = useState("");
  const [sessionStateA, setSessionStateA] = useState<SessionState>("fresh");
  const [sessionStateB, setSessionStateB] = useState<SessionState>("resumed");
  const [savedSegmentA, setSavedSegmentA] = useState("");
  const [savedSegmentB, setSavedSegmentB] = useState("");
  const [fetchKey, setFetchKey] = useState(0);

  const { data: savedSegmentsData } = useAdminFetch<SavedSegmentsResponse>("/api/admin/segments");
  const savedSegments = savedSegmentsData?.segments ?? [];

  const params = useMemo(() => {
    if (fetchKey === 0) return undefined;
    const p: Record<string, string> = {};
    if (segmentType === "utm") {
      if (utmA) p.utmA = utmA;
      if (utmB) p.utmB = utmB;
    } else if (segmentType === "dateRange") {
      if (dateA.since) p.sinceA = dateA.since;
      if (dateA.until) p.untilA = dateA.until;
      if (dateB.since) p.sinceB = dateB.since;
      if (dateB.until) p.untilB = dateB.until;
    } else if (segmentType === "archetype") {
      if (archetypeA) p.archetypeA = archetypeA;
      if (archetypeB) p.archetypeB = archetypeB;
    } else if (segmentType === "sessionState") {
      p.sessionStateA = sessionStateA;
      p.sessionStateB = sessionStateB;
    } else {
      if (savedSegmentA) p.savedSegmentA = savedSegmentA;
      if (savedSegmentB) p.savedSegmentB = savedSegmentB;
    }
    return p;
  }, [
    fetchKey,
    segmentType,
    utmA,
    utmB,
    dateA,
    dateB,
    archetypeA,
    archetypeB,
    sessionStateA,
    sessionStateB,
    savedSegmentA,
    savedSegmentB,
  ]);

  const { data, loading, error } = useAdminFetch<SegmentResponse>(
    "/api/admin/comparisons/segment",
    params
  );

  const compareDisabled = segmentType === "savedSegment" ? !savedSegmentA || !savedSegmentB : false;

  const handleCompare = useCallback(() => {
    setFetchKey((k) => k + 1);
  }, []);

  const segmentALabel = useMemo(() => {
    if (segmentType === "utm") return utmA || "Segment A";
    if (segmentType === "dateRange") {
      const parts = [dateA.since, dateA.until].filter(Boolean).join(" to ");
      return parts || "Segment A";
    }
    if (segmentType === "sessionState") {
      return sessionStateA === "resumed" ? "Resumed Sessions" : "Fresh Sessions";
    }
    if (segmentType === "savedSegment") {
      return (
        savedSegments.find((segment) => String(segment.id) === savedSegmentA)?.name || "Segment A"
      );
    }
    return archetypeA || "Segment A";
  }, [segmentType, utmA, dateA, archetypeA, sessionStateA, savedSegments, savedSegmentA]);

  const segmentBLabel = useMemo(() => {
    if (segmentType === "utm") return utmB || "Segment B";
    if (segmentType === "dateRange") {
      const parts = [dateB.since, dateB.until].filter(Boolean).join(" to ");
      return parts || "Segment B";
    }
    if (segmentType === "sessionState") {
      return sessionStateB === "resumed" ? "Resumed Sessions" : "Fresh Sessions";
    }
    if (segmentType === "savedSegment") {
      return (
        savedSegments.find((segment) => String(segment.id) === savedSegmentB)?.name || "Segment B"
      );
    }
    return archetypeB || "Segment B";
  }, [segmentType, utmB, dateB, archetypeB, sessionStateB, savedSegments, savedSegmentB]);

  // Compute the max archetype count across both segments for bar scaling
  const maxArchCount = useMemo(() => {
    if (!data) return 1;
    const allCounts = [
      ...(data.segmentA?.archetype_distribution ?? []).map((d) => d.count),
      ...(data.segmentB?.archetype_distribution ?? []).map((d) => d.count),
    ];
    return Math.max(1, ...allCounts);
  }, [data]);

  const lowSampleWarning = useMemo(() => {
    if (!data) return false;
    return (
      (data.segmentA?.total_submissions ?? 0) < 20 || (data.segmentB?.total_submissions ?? 0) < 20
    );
  }, [data]);

  return (
    <div className="space-y-6">
      {/* Segment configurator */}
      <div className="rounded-xl border border-white/10 bg-surface p-5">
        <h3 className="mb-4 text-sm font-semibold text-text-primary">Segment Configuration</h3>

        {/* Segment type selector */}
        <div className="mb-4 flex gap-4">
          {(["utm", "dateRange", "archetype", "sessionState", "savedSegment"] as const).map(
            (type) => (
              <label key={type} className="flex items-center gap-2 text-sm text-text-muted">
                <input
                  type="radio"
                  name="segmentType"
                  value={type}
                  checked={segmentType === type}
                  onChange={() => setSegmentType(type)}
                  className="accent-accent-purple"
                />
                {type === "utm"
                  ? "UTM Source"
                  : type === "dateRange"
                    ? "Date Range"
                    : type === "archetype"
                      ? "Archetype"
                      : type === "sessionState"
                        ? "Session State"
                        : "Saved Segment"}
              </label>
            )
          )}
        </div>

        {/* Inputs based on segment type */}
        <div className="grid gap-4 sm:grid-cols-2">
          {segmentType === "utm" && (
            <>
              <div>
                <label className="mb-1 block text-xs text-text-muted">UTM Source A</label>
                <input
                  type="text"
                  value={utmA}
                  onChange={(e) => setUtmA(e.target.value)}
                  placeholder="e.g. google"
                  className="w-full rounded-lg border border-white/10 bg-[#1a1025] px-3 py-2 text-sm text-text-primary outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-text-muted">UTM Source B</label>
                <input
                  type="text"
                  value={utmB}
                  onChange={(e) => setUtmB(e.target.value)}
                  placeholder="e.g. instagram"
                  className="w-full rounded-lg border border-white/10 bg-[#1a1025] px-3 py-2 text-sm text-text-primary outline-none"
                />
              </div>
            </>
          )}

          {segmentType === "dateRange" && (
            <>
              <div className="space-y-2">
                <p className="text-xs font-medium text-text-muted">Segment A</p>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="mb-1 block text-xs text-text-muted">From</label>
                    <input
                      type="date"
                      value={dateA.since}
                      onChange={(e) => setDateA((d) => ({ ...d, since: e.target.value }))}
                      className="w-full rounded-lg border border-white/10 bg-[#1a1025] px-3 py-2 text-sm text-text-primary outline-none"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="mb-1 block text-xs text-text-muted">To</label>
                    <input
                      type="date"
                      value={dateA.until}
                      onChange={(e) => setDateA((d) => ({ ...d, until: e.target.value }))}
                      className="w-full rounded-lg border border-white/10 bg-[#1a1025] px-3 py-2 text-sm text-text-primary outline-none"
                    />
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-xs font-medium text-text-muted">Segment B</p>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="mb-1 block text-xs text-text-muted">From</label>
                    <input
                      type="date"
                      value={dateB.since}
                      onChange={(e) => setDateB((d) => ({ ...d, since: e.target.value }))}
                      className="w-full rounded-lg border border-white/10 bg-[#1a1025] px-3 py-2 text-sm text-text-primary outline-none"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="mb-1 block text-xs text-text-muted">To</label>
                    <input
                      type="date"
                      value={dateB.until}
                      onChange={(e) => setDateB((d) => ({ ...d, until: e.target.value }))}
                      className="w-full rounded-lg border border-white/10 bg-[#1a1025] px-3 py-2 text-sm text-text-primary outline-none"
                    />
                  </div>
                </div>
              </div>
            </>
          )}

          {segmentType === "archetype" && (
            <>
              <div>
                <label className="mb-1 block text-xs text-text-muted">Archetype A</label>
                <select
                  value={archetypeA}
                  onChange={(e) => setArchetypeA(e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-[#1a1025] px-3 py-2 text-sm text-text-primary outline-none"
                >
                  <option value="">Select archetype</option>
                  {ARCHETYPES.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-text-muted">Archetype B</label>
                <select
                  value={archetypeB}
                  onChange={(e) => setArchetypeB(e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-[#1a1025] px-3 py-2 text-sm text-text-primary outline-none"
                >
                  <option value="">Select archetype</option>
                  {ARCHETYPES.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}

          {segmentType === "sessionState" && (
            <>
              <div>
                <label className="mb-1 block text-xs text-text-muted">Segment A</label>
                <select
                  value={sessionStateA}
                  onChange={(e) => setSessionStateA(e.target.value as SessionState)}
                  className="w-full rounded-lg border border-white/10 bg-[#1a1025] px-3 py-2 text-sm text-text-primary outline-none"
                >
                  <option value="fresh">Fresh Sessions</option>
                  <option value="resumed">Resumed Sessions</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-text-muted">Segment B</label>
                <select
                  value={sessionStateB}
                  onChange={(e) => setSessionStateB(e.target.value as SessionState)}
                  className="w-full rounded-lg border border-white/10 bg-[#1a1025] px-3 py-2 text-sm text-text-primary outline-none"
                >
                  <option value="fresh">Fresh Sessions</option>
                  <option value="resumed">Resumed Sessions</option>
                </select>
              </div>
            </>
          )}

          {segmentType === "savedSegment" && (
            <>
              <div>
                <label className="mb-1 block text-xs text-text-muted">Saved Segment A</label>
                <select
                  value={savedSegmentA}
                  onChange={(e) => setSavedSegmentA(e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-[#1a1025] px-3 py-2 text-sm text-text-primary outline-none"
                >
                  <option value="">Select saved segment</option>
                  {savedSegments.map((segment) => (
                    <option key={segment.id} value={String(segment.id)}>
                      {segment.name}
                      {segment.match_count != null ? ` (${segment.match_count})` : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-text-muted">Saved Segment B</label>
                <select
                  value={savedSegmentB}
                  onChange={(e) => setSavedSegmentB(e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-[#1a1025] px-3 py-2 text-sm text-text-primary outline-none"
                >
                  <option value="">Select saved segment</option>
                  {savedSegments.map((segment) => (
                    <option key={segment.id} value={String(segment.id)}>
                      {segment.name}
                      {segment.match_count != null ? ` (${segment.match_count})` : ""}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}
        </div>

        <button
          onClick={handleCompare}
          disabled={compareDisabled}
          className="mt-4 rounded-lg border border-white/10 bg-accent-purple/20 px-4 py-2 text-sm font-medium text-text-primary transition hover:bg-accent-purple/30"
        >
          Compare
        </button>

        {segmentType === "sessionState" && (
          <p className="mt-3 text-xs text-text-muted">
            Session state compares submissions that never hit a partial save against sessions that
            were resumed after a save event.
          </p>
        )}
        {segmentType === "savedSegment" && (
          <p className="mt-3 text-xs text-text-muted">
            Saved segment comparison evaluates the same DB-side rules defined in Segment Builder and
            runs against the refreshed analytics snapshot, so new submissions can take a few minutes
            to appear.
          </p>
        )}
        {segmentType === "savedSegment" && compareDisabled && (
          <p className="mt-2 text-xs text-amber-200">
            Select both saved segments before running the comparison.
          </p>
        )}
      </div>

      {/* Loading */}
      {loading && fetchKey > 0 && (
        <div className="flex items-center justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-accent-purple" />
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-center text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Empty state */}
      {fetchKey === 0 && !loading && (
        <div className="py-8 text-center text-sm text-text-muted">
          Configure your segments above and click Compare to see results.
        </div>
      )}

      {/* Results */}
      {data && !loading && (
        <div className="space-y-6">
          {(data.trust?.sampleSize != null || data.trust?.source === "materialized_snapshot") && (
            <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-text-muted">
              {data.trust?.source === "materialized_snapshot" ? (
                <>
                  Comparison uses a refreshed analytics snapshot.
                  {data.trust.refreshCadenceMinutes != null &&
                    ` Updates about every ${data.trust.refreshCadenceMinutes} minutes.`}
                </>
              ) : (
                <>
                  Comparison sample scanned: {data.trust.sampleSize?.toLocaleString()} submissions.
                </>
              )}
              {lowSampleWarning && (
                <span className="ml-2 text-amber-200">
                  Interpret the deltas directionally only.
                </span>
              )}
            </div>
          )}

          {/* Side-by-side stat cards */}
          <div className="grid gap-4 sm:grid-cols-2">
            {/* Segment A stats */}
            <div className="space-y-3">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-accent-purple">
                {segmentALabel}
              </h4>
              <div className="grid gap-3 sm:grid-cols-3">
                <StatCard label="Total Submissions" value={data.segmentA?.total_submissions ?? 0} />
                <StatCard
                  label="Completed"
                  value={data.segmentA?.completed ?? 0}
                  sub={
                    data.segmentA?.total_submissions
                      ? `${Math.round(((data.segmentA.completed ?? 0) / data.segmentA.total_submissions) * 100)}%`
                      : undefined
                  }
                />
                <StatCard
                  label="Avg Duration"
                  value={formatDuration(data.segmentA?.avg_duration_ms)}
                />
              </div>
            </div>

            {/* Segment B stats */}
            <div className="space-y-3">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-accent-purple">
                {segmentBLabel}
              </h4>
              <div className="grid gap-3 sm:grid-cols-3">
                <StatCard label="Total Submissions" value={data.segmentB?.total_submissions ?? 0} />
                <StatCard
                  label="Completed"
                  value={data.segmentB?.completed ?? 0}
                  sub={
                    data.segmentB?.total_submissions
                      ? `${Math.round(((data.segmentB.completed ?? 0) / data.segmentB.total_submissions) * 100)}%`
                      : undefined
                  }
                />
                <StatCard
                  label="Avg Duration"
                  value={formatDuration(data.segmentB?.avg_duration_ms)}
                />
              </div>
            </div>
          </div>

          {/* Delta summary */}
          <div className="rounded-xl border border-white/10 bg-surface p-5">
            <h4 className="mb-3 text-sm font-semibold text-text-primary">Delta (B vs A)</h4>
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <p className="text-xs text-text-muted">Submissions</p>
                <p
                  className={`mt-1 font-serif text-lg font-bold ${formatDelta(data.segmentA?.total_submissions, data.segmentB?.total_submissions).className}`}
                >
                  {
                    formatDelta(data.segmentA?.total_submissions, data.segmentB?.total_submissions)
                      .text
                  }
                </p>
              </div>
              <div>
                <p className="text-xs text-text-muted">Completed</p>
                <p
                  className={`mt-1 font-serif text-lg font-bold ${formatDelta(data.segmentA?.completed, data.segmentB?.completed).className}`}
                >
                  {formatDelta(data.segmentA?.completed, data.segmentB?.completed).text}
                </p>
              </div>
              <div>
                <p className="text-xs text-text-muted">Avg Duration</p>
                <p
                  className={`mt-1 font-serif text-lg font-bold ${formatDelta(data.segmentA?.avg_duration_ms ?? undefined, data.segmentB?.avg_duration_ms ?? undefined).className}`}
                >
                  {
                    formatDelta(
                      data.segmentA?.avg_duration_ms ?? undefined,
                      data.segmentB?.avg_duration_ms ?? undefined
                    ).text
                  }
                </p>
              </div>
            </div>
          </div>

          {/* Archetype distribution comparison */}
          {(data.segmentA?.archetype_distribution?.length ||
            data.segmentB?.archetype_distribution?.length) && (
            <div className="rounded-xl border border-white/10 bg-surface p-5">
              <h4 className="mb-4 text-sm font-semibold text-text-primary">
                Archetype Distribution
              </h4>
              <div className="space-y-2">
                {ARCHETYPES.map((archetype) => {
                  const countA =
                    data.segmentA?.archetype_distribution?.find((d) => d.archetype === archetype)
                      ?.count ?? 0;
                  const countB =
                    data.segmentB?.archetype_distribution?.find((d) => d.archetype === archetype)
                      ?.count ?? 0;
                  if (countA === 0 && countB === 0) return null;

                  const widthA = (countA / maxArchCount) * 100;
                  const widthB = (countB / maxArchCount) * 100;

                  return (
                    <div key={archetype} className="group">
                      <div className="mb-1 flex items-baseline justify-between">
                        <span className="truncate text-xs text-text-muted">{archetype}</span>
                        <span className="ml-2 shrink-0 text-xs text-text-muted">
                          {countA} / {countB}
                        </span>
                      </div>
                      <div className="flex gap-1">
                        <div className="h-4 flex-1 overflow-hidden rounded-l bg-white/5">
                          <div
                            className="h-full rounded-l bg-accent-purple/60 transition-all"
                            style={{ width: `${widthA}%` }}
                          />
                        </div>
                        <div className="h-4 flex-1 overflow-hidden rounded-r bg-white/5">
                          <div
                            className="h-full rounded-r bg-accent-orange/60 transition-all"
                            style={{ width: `${widthB}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div className="mt-2 flex justify-center gap-6 text-xs text-text-muted">
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block h-2.5 w-2.5 rounded bg-accent-purple/60" />
                    {segmentALabel}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block h-2.5 w-2.5 rounded bg-accent-orange/60" />
                    {segmentBLabel}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
