// Small presentational pieces used inside StrategyHubDashboard. Extracted so
// the main dashboard file is easier to scan; these subcomponents are stateless
// and depend only on tone tables imported here.

import type { ReactNode } from "react";

import type { DecisionReviewState } from "./types";
import { decisionReviewClasses } from "./styles";

export function ScoreInputPill({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-white/10 bg-surface px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-text-muted">{label}</p>
      <p className="mt-1 text-sm font-medium text-text-primary">{Math.round(value)}</p>
    </div>
  );
}

export function ReviewStateBadge({ state }: { state: DecisionReviewState }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[11px] uppercase tracking-wide ${decisionReviewClasses[state]}`}
    >
      {state.replace("-", " ")}
    </span>
  );
}

export function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-surface px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-text-muted">{label}</p>
      <p className="mt-1 text-sm text-text-primary">{value}</p>
    </div>
  );
}

export function NarrativeCard({
  label,
  value,
}: {
  label: string;
  value: string | null;
}): ReactNode {
  if (!value) return null;

  return (
    <div className="rounded-lg border border-white/10 bg-surface px-3 py-3">
      <p className="text-[10px] uppercase tracking-wide text-text-muted">{label}</p>
      <p className="mt-2 text-sm text-text-primary">{value}</p>
    </div>
  );
}
