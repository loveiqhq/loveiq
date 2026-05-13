"use client";

import { useState, useCallback } from "react";

const ARCHETYPE_NAMES = [
  "Sensual Connector",
  "Spark Seeker",
  "Relational Nurturer",
  "Radiant Performer",
  "Explorer of Edges",
  "Curious Apprentice",
  "Spiritual Lover",
  "Minimalist Companion",
  "Emotional Voyeur",
  "Authority Conductor",
  "Loyal Ritualist",
  "Tender Devotee",
];

const CHART_COLORS = ["#9c7dff", "#f26d4f", "#22c55e", "#3b82f6"];

interface ArchetypeData {
  name: string;
  count: number;
  avgDuration: number;
  sessions: number;
  backtracks: number;
  abandonments: number;
  avgTimePerQuestion: number;
  scoring: {
    percentages: Record<string, number>;
  };
}

interface ComparisonData {
  archetypes: ArchetypeData[];
}

function RadarChart({ archetypes }: { archetypes: ArchetypeData[] }) {
  if (archetypes.length === 0) return null;

  const allDimensions = new Set<string>();
  for (const a of archetypes) {
    for (const key of Object.keys(a.scoring?.percentages || {})) {
      allDimensions.add(key);
    }
  }
  const dimensions = Array.from(allDimensions);
  if (dimensions.length < 3) return null;

  const cx = 150;
  const cy = 150;
  const radius = 110;
  const levels = 5;
  const angleSlice = (2 * Math.PI) / dimensions.length;

  function getPoint(dimIndex: number, value: number): [number, number] {
    const angle = angleSlice * dimIndex - Math.PI / 2;
    const r = (value / 100) * radius;
    return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)];
  }

  return (
    <div className="rounded-xl border border-white/10 bg-surface p-5">
      <h3 className="mb-4 font-serif text-base font-semibold text-text-primary">Scoring Radar</h3>
      <div className="flex justify-center">
        <svg viewBox="0 0 300 300" className="h-72 w-72">
          {Array.from({ length: levels }, (_, i) => {
            const r = (radius / levels) * (i + 1);
            return (
              <circle
                key={i}
                cx={cx}
                cy={cy}
                r={r}
                fill="none"
                stroke="rgba(255,255,255,0.08)"
                strokeWidth="1"
              />
            );
          })}

          {dimensions.map((_, i) => {
            const [x, y] = getPoint(i, 100);
            return (
              <line
                key={i}
                x1={cx}
                y1={cy}
                x2={x}
                y2={y}
                stroke="rgba(255,255,255,0.08)"
                strokeWidth="1"
              />
            );
          })}

          {dimensions.map((dim, i) => {
            const angle = angleSlice * i - Math.PI / 2;
            const labelR = radius + 18;
            const lx = cx + labelR * Math.cos(angle);
            const ly = cy + labelR * Math.sin(angle);
            const truncated = dim.length > 10 ? dim.slice(0, 9) + "…" : dim;
            return (
              <text
                key={dim}
                x={lx}
                y={ly}
                textAnchor="middle"
                dominantBaseline="middle"
                className="fill-text-muted"
                fontSize="7"
              >
                {truncated}
              </text>
            );
          })}

          {archetypes.map((arch, ai) => {
            const points = dimensions
              .map((dim, di) => {
                const val = arch.scoring?.percentages?.[dim] ?? 0;
                return getPoint(di, val).join(",");
              })
              .join(" ");
            return (
              <polygon
                key={arch.name}
                points={points}
                fill={CHART_COLORS[ai]}
                fillOpacity={0.15}
                stroke={CHART_COLORS[ai]}
                strokeWidth="2"
              />
            );
          })}
        </svg>
      </div>
      <div className="mt-4 flex flex-wrap justify-center gap-4">
        {archetypes.map((arch, i) => (
          <div key={arch.name} className="flex items-center gap-2 text-xs text-text-muted">
            <span
              className="inline-block h-3 w-3 rounded-full"
              style={{ backgroundColor: CHART_COLORS[i] }}
            />
            {arch.name}
          </div>
        ))}
      </div>
    </div>
  );
}

function SummaryTable({ archetypes }: { archetypes: ArchetypeData[] }) {
  return (
    <div className="rounded-xl border border-white/10 bg-surface p-5">
      <h3 className="mb-4 font-serif text-base font-semibold text-text-primary">Summary</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-white/10 text-xs text-text-muted">
              <th className="pb-3 pr-4 font-medium">Archetype</th>
              <th className="pb-3 pr-4 font-medium">Count</th>
              <th className="pb-3 pr-4 font-medium">Avg Duration</th>
              <th className="pb-3 pr-4 font-medium">Sessions</th>
              <th className="pb-3 pr-4 font-medium">Backtracks</th>
              <th className="pb-3 font-medium">Abandonments</th>
            </tr>
          </thead>
          <tbody>
            {archetypes.map((arch, i) => (
              <tr
                key={arch.name}
                className={`border-b border-white/5 ${i % 2 === 0 ? "bg-white/[0.02]" : ""}`}
              >
                <td className="py-3 pr-4 font-medium text-text-primary">
                  <span className="flex items-center gap-2">
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: CHART_COLORS[i] }}
                    />
                    {arch.name}
                  </span>
                </td>
                <td className="py-3 pr-4 text-text-muted">{arch.count}</td>
                <td className="py-3 pr-4 text-text-muted">{arch.avgDuration}m</td>
                <td className="py-3 pr-4 text-text-muted">{arch.sessions}</td>
                <td className="py-3 pr-4 text-text-muted">{arch.backtracks}</td>
                <td className="py-3 text-text-muted">{arch.abandonments}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BehaviorComparison({ archetypes }: { archetypes: ArchetypeData[] }) {
  const metrics = [
    { key: "avgTimePerQuestion" as const, label: "Avg Time / Question (s)" },
    { key: "backtracks" as const, label: "Backtracks" },
    { key: "abandonments" as const, label: "Abandonments" },
  ];

  return (
    <div className="rounded-xl border border-white/10 bg-surface p-5">
      <h3 className="mb-4 font-serif text-base font-semibold text-text-primary">
        Behavior Comparison
      </h3>
      <div className="space-y-6">
        {metrics.map((metric) => {
          const maxVal = Math.max(...archetypes.map((a) => a[metric.key] || 0), 1);
          return (
            <div key={metric.key}>
              <p className="mb-2 text-xs text-text-muted">{metric.label}</p>
              <div className="space-y-2">
                {archetypes.map((arch, i) => {
                  const val = arch[metric.key] || 0;
                  const pct = Math.max(4, (val / maxVal) * 100);
                  return (
                    <div key={arch.name} className="flex items-center gap-3">
                      <span className="w-36 shrink-0 truncate text-xs text-text-muted">
                        {arch.name}
                      </span>
                      <div className="flex-1">
                        <div className="h-6 w-full rounded bg-white/5">
                          <div
                            className="flex h-6 items-center justify-end rounded pr-2 text-[10px] font-semibold text-white"
                            style={{
                              width: `${pct}%`,
                              backgroundColor: CHART_COLORS[i],
                              opacity: 0.8,
                            }}
                          >
                            {val}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function ArchetypeComparison() {
  const [selected, setSelected] = useState<string[]>([]);
  const [data, setData] = useState<ComparisonData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleArchetype = useCallback((name: string) => {
    setSelected((prev) => {
      if (prev.includes(name)) return prev.filter((n) => n !== name);
      if (prev.length >= 4) return prev;
      return [...prev, name];
    });
  }, []);

  const handleCompare = useCallback(async () => {
    if (selected.length < 2) return;
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({ archetypes: selected.join(",") });
      const res = await fetch(`/api/admin/archetypes/compare?${params}`);
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(
          (body as { error?: string } | null)?.error || `Request failed: ${res.status}`
        );
      }
      setData(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load comparison.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [selected]);

  return (
    <div className="space-y-6">
      {/* Archetype Selector */}
      <div className="rounded-xl border border-white/10 bg-surface p-5">
        <h3 className="mb-3 font-serif text-base font-semibold text-text-primary">
          Select Archetypes to Compare
        </h3>
        <p className="mb-4 text-xs text-text-muted">Choose 2 to 4 archetypes</p>
        <div className="flex flex-wrap gap-2">
          {ARCHETYPE_NAMES.map((name) => {
            const isSelected = selected.includes(name);
            const isDisabled = !isSelected && selected.length >= 4;
            return (
              <button
                key={name}
                onClick={() => toggleArchetype(name)}
                disabled={isDisabled}
                className={`rounded-full border px-3 py-1.5 text-xs transition ${
                  isSelected
                    ? "border-accent-purple/40 bg-accent-purple/20 text-accent-purple"
                    : isDisabled
                      ? "cursor-not-allowed border-white/5 text-text-muted/40"
                      : "cursor-pointer border-white/10 text-text-muted hover:border-white/20 hover:text-text-primary"
                }`}
              >
                {name}
              </button>
            );
          })}
        </div>
        <div className="mt-4">
          <button
            onClick={handleCompare}
            disabled={selected.length < 2 || loading}
            className="rounded-lg bg-accent-purple px-5 py-2 text-sm font-medium text-white transition hover:bg-accent-purple/80 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {loading ? "Loading…" : "Compare"}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-center text-sm text-red-400">
          {error}
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-24">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-accent-purple" />
        </div>
      )}

      {data && !loading && (
        <div className="space-y-6">
          <SummaryTable archetypes={data.archetypes} />
          <RadarChart archetypes={data.archetypes} />
          <BehaviorComparison archetypes={data.archetypes} />
        </div>
      )}
    </div>
  );
}
