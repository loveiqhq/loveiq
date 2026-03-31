"use client";

import { useMemo } from "react";
import StatCard from "@/components/admin/StatCard";
import { useAdminFetch } from "@/components/admin/hooks/useAdminFetch";
import type { ProductExperienceHealthSnapshot } from "@/lib/admin/product-experience-health";

function toneClasses(tone: "good" | "watch" | "risk") {
  if (tone === "good") return "border-emerald-500/20 bg-emerald-500/10 text-emerald-300";
  if (tone === "watch") return "border-amber-500/20 bg-amber-500/10 text-amber-200";
  return "border-red-500/20 bg-red-500/10 text-red-300";
}

function signalToneClasses(tone: "good" | "watch" | "risk" | "neutral") {
  if (tone === "good") return "border-emerald-500/20 bg-emerald-500/5 text-emerald-300";
  if (tone === "watch") return "border-amber-500/20 bg-amber-500/5 text-amber-200";
  if (tone === "risk") return "border-red-500/20 bg-red-500/5 text-red-300";
  return "border-white/10 bg-white/5 text-text-primary";
}

function reviewLabel(value: ProductExperienceHealthSnapshot["areas"][number]["reviewState"]) {
  if (value === "fresh") return "review fresh";
  if (value === "due") return "review due";
  if (value === "overdue") return "review overdue";
  return "review not planned";
}

export default function ExperienceHealthTab({ days }: { days: number }) {
  const params = useMemo(() => ({ days: String(days) }), [days]);
  const { data, loading, error } = useAdminFetch<ProductExperienceHealthSnapshot>(
    "/api/admin/product-kpis/experience-health",
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
        {error || "Failed to load experience health scorecard."}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="font-serif text-xl font-semibold text-text-primary">Experience Health</h3>
          <p className="mt-1 max-w-4xl text-sm text-text-muted">
            One scorecard for the product experience areas that matter most: onboarding, completion,
            report consumption, referrals, and monetization.
          </p>
        </div>
        <p className="text-xs text-text-muted">
          Updated {new Date(data.generatedAt).toLocaleString()}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <StatCard label="Areas" value={data.summary.areas} />
        <StatCard label="Healthy" value={data.summary.good} />
        <StatCard label="Watch" value={data.summary.watch} />
        <StatCard label="Risk" value={data.summary.risk} />
        <StatCard label="Avg Score" value={data.summary.averageScore} />
        <StatCard label="Reviews Due" value={data.summary.reviewsDue} />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {data.areas.map((area) => (
          <section key={area.key} className="rounded-2xl border border-white/10 bg-surface p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[11px] uppercase tracking-wide ${toneClasses(
                      area.tone
                    )}`}
                  >
                    {area.tone}
                  </span>
                  <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] uppercase tracking-wide text-text-muted">
                    {reviewLabel(area.reviewState)}
                  </span>
                </div>
                <p className="mt-3 text-lg font-semibold text-text-primary">{area.label}</p>
                <p className="mt-2 text-sm text-text-muted">{area.summary}</p>
              </div>
              <div className="text-right">
                <p className="text-xs uppercase tracking-wide text-text-muted">Health score</p>
                <p className="mt-1 font-serif text-3xl font-semibold text-text-primary">
                  {area.score}
                </p>
                <p className="mt-1 text-xs text-text-muted">
                  {area.ownerEmail ?? "No owner mapped"}
                </p>
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <p className="text-xs uppercase tracking-wide text-text-muted">Primary metric</p>
                <p className="mt-2 text-sm font-semibold text-text-primary">
                  {area.primaryMetricLabel}
                </p>
                <p className="mt-1 text-xs text-text-muted">{area.primaryMetricValue}</p>
              </div>
              {area.signals.map((signal) => (
                <div
                  key={`${area.key}-${signal.label}`}
                  className={`rounded-xl border p-4 ${signalToneClasses(signal.tone)}`}
                >
                  <p className="text-xs uppercase tracking-wide opacity-80">{signal.label}</p>
                  <p className="mt-2 text-sm font-semibold">{signal.value}</p>
                </div>
              ))}
            </div>

            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              <NarrativeCard label="Current risk" value={area.riskSummary} />
              <NarrativeCard label="Next move" value={area.nextMove} />
            </div>

            <div className="mt-4">
              <a
                href={area.href}
                className="inline-flex rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-text-primary transition hover:bg-white/10"
              >
                Open area view
              </a>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function NarrativeCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
      <p className="text-xs uppercase tracking-wide text-text-muted">{label}</p>
      <p className="mt-2 text-sm text-text-primary">{value}</p>
    </div>
  );
}
