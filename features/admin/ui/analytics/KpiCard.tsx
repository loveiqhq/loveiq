"use client";

import { useState } from "react";

export type KpiFormat = "currency" | "percent" | "minutes" | "number" | "multiple" | "raw";

interface KpiCardProps {
  label: string;
  value: number | string | null;
  format: KpiFormat;
  formula?: string;
  definition?: string;
  whyItMatters?: string;
  delta?: number | null;
  emptyHint?: string;
  sub?: string;
}

function formatValue(value: number | string | null, format: KpiFormat): string {
  if (value == null) return "—";
  if (typeof value === "string") return value;
  switch (format) {
    case "currency":
      return `€${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    case "percent":
      return `${value.toFixed(1)}%`;
    case "minutes":
      return `${value.toFixed(1)} min`;
    case "multiple":
      return `${value.toFixed(2)}×`;
    case "number":
      return value.toLocaleString("en-US");
    case "raw":
    default:
      return String(value);
  }
}

export default function KpiCard({
  label,
  value,
  format,
  formula,
  definition,
  whyItMatters,
  delta,
  emptyHint,
  sub,
}: KpiCardProps) {
  const [open, setOpen] = useState(false);
  const isEmpty = value == null;
  const display = formatValue(value, format);
  const hasDelta = delta != null && isFinite(delta);
  const hasInfo = Boolean(formula || definition || whyItMatters);

  return (
    <div
      className={`group relative rounded-xl border p-5 transition ${
        isEmpty
          ? "border-dashed border-white/10 bg-surface/40"
          : "border-white/10 bg-surface hover:border-white/20"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm text-text-muted">{label}</p>
        {hasInfo && (
          <button
            type="button"
            aria-label={`Show formula and context for ${label}`}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="shrink-0 rounded-full border border-white/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-text-muted transition hover:border-white/30 hover:text-text-primary"
          >
            i
          </button>
        )}
      </div>

      <div className="mt-1 flex items-baseline gap-2">
        <p
          className={`font-serif text-2xl font-bold ${isEmpty ? "text-text-muted" : "text-text-primary"}`}
        >
          {display}
        </p>
        {hasDelta && !isEmpty && (
          <span
            className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
              delta > 0
                ? "bg-emerald-500/10 text-emerald-400"
                : delta < 0
                  ? "bg-red-500/10 text-red-400"
                  : "bg-white/5 text-text-muted"
            }`}
          >
            {delta > 0 ? "↑" : delta < 0 ? "↓" : "→"}
            {Math.abs(delta)}%
          </span>
        )}
      </div>

      {isEmpty && emptyHint && <p className="mt-1 text-xs text-text-muted/70">{emptyHint}</p>}
      {!isEmpty && sub && <p className="mt-1 text-xs text-text-muted">{sub}</p>}

      {open && hasInfo && (
        <div className="mt-3 space-y-2 rounded-lg border border-white/10 bg-page/60 p-3 text-xs">
          {definition && (
            <div>
              <p className="font-semibold uppercase tracking-wider text-text-muted text-[10px]">
                Definition
              </p>
              <p className="mt-0.5 text-text-primary">{definition}</p>
            </div>
          )}
          {formula && (
            <div>
              <p className="font-semibold uppercase tracking-wider text-text-muted text-[10px]">
                Formula
              </p>
              <p className="mt-0.5 font-mono text-accent-purple">{formula}</p>
            </div>
          )}
          {whyItMatters && (
            <div>
              <p className="font-semibold uppercase tracking-wider text-text-muted text-[10px]">
                Why it matters
              </p>
              <p className="mt-0.5 text-text-primary">{whyItMatters}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
