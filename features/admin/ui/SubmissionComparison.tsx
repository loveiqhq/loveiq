"use client";

import Link from "next/link";
import { useState, useMemo, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { useAdminFetch } from "./hooks/useAdminFetch";
import BarChart from "./BarChart";
import { maskEmail } from "@features/admin/server/format";

interface SubmissionData {
  submission: {
    id: number;
    email: string;
    first_name: string;
    status: string;
    started_at: string;
    completed_at: string;
    duration_ms: number | null;
    utm_source: string | null;
  };
  answers: Array<{
    q_id: string;
    question_text?: string;
    answer_type?: string;
    answer_value: string | string[] | number | null;
    time_spent_seconds?: number | null;
    revision_count?: number | null;
    was_skipped?: boolean;
  }>;
  scoring: {
    primary_archetype: string;
    percentages: Record<string, number>;
    engine_version: string;
    v5_primary_archetype: string | null;
    v5_percentages: Record<string, number> | null;
  } | null;
}

function formatDuration(ms: number | null): string {
  if (!ms) return "—";
  const sec = Math.round(ms / 1000);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s}s`;
}

function formatAnswer(val: string | string[] | number | null): string {
  if (val === null || val === undefined) return "—";
  if (Array.isArray(val)) return val.join(", ");
  return String(val);
}

export default function SubmissionComparison() {
  const searchParams = useSearchParams();
  const [idA, setIdA] = useState(searchParams.get("a") || "");
  const [idB, setIdB] = useState(searchParams.get("b") || "");
  const [fetchKey, setFetchKey] = useState(searchParams.get("a") && searchParams.get("b") ? 1 : 0);

  const paramsA = useMemo(() => {
    if (fetchKey === 0 || !idA) return undefined;
    return {};
  }, [fetchKey, idA]);

  const paramsB = useMemo(() => {
    if (fetchKey === 0 || !idB) return undefined;
    return {};
  }, [fetchKey, idB]);

  const {
    data: dataA,
    loading: loadingA,
    error: errorA,
  } = useAdminFetch<SubmissionData>(
    fetchKey > 0 && idA ? `/api/admin/submissions/${idA}` : "",
    paramsA
  );
  const {
    data: dataB,
    loading: loadingB,
    error: errorB,
  } = useAdminFetch<SubmissionData>(
    fetchKey > 0 && idB ? `/api/admin/submissions/${idB}` : "",
    paramsB
  );

  const handleCompare = useCallback(() => {
    if (idA && idB) setFetchKey((k) => k + 1);
  }, [idA, idB]);

  const loading = loadingA || loadingB;
  const error = errorA || errorB;

  // Build answer comparison pairs
  const answerPairs = useMemo(() => {
    if (!dataA?.answers || !dataB?.answers) return [];
    const mapB = new Map(dataB.answers.map((a) => [a.q_id, a]));
    return dataA.answers.map((a) => ({
      q_id: a.q_id,
      question: a.question_text || a.q_id,
      type: a.answer_type || "",
      valA: a.answer_value,
      valB: mapB.get(a.q_id)?.answer_value ?? null,
      divergent:
        formatAnswer(a.answer_value) !== formatAnswer(mapB.get(a.q_id)?.answer_value ?? null),
    }));
  }, [dataA, dataB]);

  return (
    <div className="space-y-6">
      <Link
        href="/admin/submissions"
        className="inline-flex items-center gap-1 text-sm text-text-muted transition hover:text-text-primary"
      >
        ← Back to Submissions
      </Link>

      {/* ID Inputs */}
      <div className="rounded-xl border border-white/10 bg-surface p-5">
        <h3 className="mb-4 text-sm font-semibold text-text-primary">Compare Two Submissions</h3>
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="mb-1 block text-xs text-text-muted">Submission A (ID)</label>
            <input
              type="text"
              value={idA}
              onChange={(e) => setIdA(e.target.value)}
              placeholder="e.g. 42"
              className="w-32 rounded-lg border border-white/10 bg-[#1a1025] px-3 py-2 text-sm text-text-primary outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-text-muted">Submission B (ID)</label>
            <input
              type="text"
              value={idB}
              onChange={(e) => setIdB(e.target.value)}
              placeholder="e.g. 57"
              className="w-32 rounded-lg border border-white/10 bg-[#1a1025] px-3 py-2 text-sm text-text-primary outline-none"
            />
          </div>
          <button
            onClick={handleCompare}
            disabled={!idA || !idB || loading}
            className="rounded-lg bg-accent-purple/20 px-4 py-2 text-sm font-medium text-accent-purple transition hover:bg-accent-purple/30 disabled:opacity-40"
          >
            Compare
          </button>
        </div>
      </div>

      {/* Loading */}
      {loading && fetchKey > 0 && (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-accent-purple" />
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-center text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Empty */}
      {fetchKey === 0 && (
        <p className="py-8 text-center text-sm text-text-muted">
          Enter two submission IDs and click Compare.
        </p>
      )}

      {/* Results */}
      {dataA && dataB && !loading && (
        <div className="space-y-6">
          {/* Info Cards Side-by-Side */}
          <div className="grid gap-4 lg:grid-cols-2">
            {[dataA, dataB].map((d, i) => (
              <div key={i} className="rounded-xl border border-white/10 bg-surface p-5">
                <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-text-muted">
                  Submission {i === 0 ? "A" : "B"} — #{d.submission.id}
                </h4>
                <div className="grid gap-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-text-muted">Email</span>
                    <span className="text-text-primary">{maskEmail(d.submission.email)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-muted">Name</span>
                    <span className="text-text-primary">{d.submission.first_name || "—"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-muted">Status</span>
                    <span className="text-text-primary">{d.submission.status}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-muted">Duration</span>
                    <span className="text-text-primary">
                      {formatDuration(d.submission.duration_ms)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-muted">Archetype (V4)</span>
                    <span className="text-accent-purple">
                      {d.scoring?.primary_archetype || "—"}
                    </span>
                  </div>
                  {d.scoring?.v5_primary_archetype && (
                    <div className="flex justify-between">
                      <span className="text-text-muted">Archetype (V5)</span>
                      <span className="text-accent-orange">{d.scoring.v5_primary_archetype}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Scoring Comparison */}
          {dataA.scoring && dataB.scoring && (
            <div className="grid gap-4 lg:grid-cols-2">
              {[dataA, dataB].map((d, i) => {
                const pcts = d.scoring?.percentages || {};
                const sorted = Object.entries(pcts)
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 7);
                return (
                  <div key={i} className="rounded-xl border border-white/10 bg-surface p-5">
                    <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-text-muted">
                      Scoring {i === 0 ? "A" : "B"}
                    </h4>
                    <BarChart
                      items={sorted.map(([label, value]) => ({
                        label: label.length > 20 ? label.slice(0, 20) + "..." : label,
                        value: Math.round(value * 10) / 10,
                      }))}
                      direction="horizontal"
                    />
                  </div>
                );
              })}
            </div>
          )}

          {/* Answers Comparison */}
          <div className="rounded-xl border border-white/10 bg-surface p-5">
            <h4 className="mb-4 text-sm font-semibold text-text-primary">
              Answer Comparison ({answerPairs.filter((p) => p.divergent).length} differences)
            </h4>
            <div className="space-y-1">
              {answerPairs.map((pair) => (
                <div
                  key={pair.q_id}
                  className={`grid grid-cols-[120px_1fr_1fr] gap-3 rounded-lg px-3 py-2 text-sm ${
                    pair.divergent
                      ? "border border-yellow-500/20 bg-yellow-500/5"
                      : "border border-transparent hover:bg-white/[0.02]"
                  }`}
                >
                  <div className="text-text-muted" title={pair.question}>
                    {pair.q_id}
                  </div>
                  <div className="text-text-primary truncate">{formatAnswer(pair.valA)}</div>
                  <div className="text-text-primary truncate">{formatAnswer(pair.valB)}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
