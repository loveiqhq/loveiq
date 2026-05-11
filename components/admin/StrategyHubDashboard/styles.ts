// Tailwind-class lookup tables + tab list for StrategyHubDashboard. Extracted
// to keep style configuration separate from the rendering logic in the main
// dashboard file.

import type {
  BenchmarkStatus,
  Confidence,
  DecisionReviewState,
  OpportunityEffort,
  QueuePriority,
  StrategyData,
  TimeToSignal,
} from "./types";

export const TABS = [
  "North Star",
  "Work Queue",
  "Release Impact",
  "Opportunities",
  "Guardrails",
  "Decision Review",
  "Auto Briefs",
  "Strategy Planning",
] as const;

export const benchmarkStatusClasses: Record<BenchmarkStatus, string> = {
  good: "border-emerald-500/20 bg-emerald-500/10 text-emerald-300",
  watch: "border-amber-500/20 bg-amber-500/10 text-amber-200",
  risk: "border-red-500/20 bg-red-500/10 text-red-300",
};

export const goalStatusClasses: Record<StrategyData["goals"][number]["status"], string> = {
  "on-track": "bg-emerald-500/10 text-emerald-300",
  watch: "bg-amber-500/10 text-amber-200",
  "off-track": "bg-red-500/10 text-red-300",
};

export const queuePriorityClasses: Record<QueuePriority, string> = {
  high: "bg-red-500/10 text-red-300",
  medium: "bg-amber-500/10 text-amber-200",
  low: "bg-white/10 text-text-muted",
};

export const confidenceClasses: Record<Confidence, string> = {
  high: "bg-emerald-500/10 text-emerald-300",
  medium: "bg-amber-500/10 text-amber-200",
  low: "bg-white/10 text-text-muted",
};

export const effortClasses: Record<OpportunityEffort, string> = {
  low: "bg-emerald-500/10 text-emerald-300",
  medium: "bg-amber-500/10 text-amber-200",
  high: "bg-red-500/10 text-red-300",
};

export const timeToSignalClasses: Record<TimeToSignal, string> = {
  fast: "bg-emerald-500/10 text-emerald-300",
  medium: "bg-amber-500/10 text-amber-200",
  slow: "bg-white/10 text-text-muted",
};

export const decisionReviewClasses: Record<DecisionReviewState, string> = {
  due: "bg-amber-500/10 text-amber-200",
  upcoming: "bg-white/10 text-text-muted",
  stale: "bg-red-500/10 text-red-300",
  validated: "bg-emerald-500/10 text-emerald-300",
  "missing-outcome": "bg-cyan-500/10 text-cyan-300",
};

export const strategyRangeOptions = [
  { days: 7, label: "7d", ariaLabel: "Last 7 days" },
  { days: 30, label: "30d", ariaLabel: "Last 30 days" },
  { days: 90, label: "90d", ariaLabel: "Last 90 days" },
] as const;

export const deltaColor = (delta: number) =>
  delta > 0 ? "text-emerald-300" : delta < 0 ? "text-red-300" : "text-text-muted";

export const signed = (value: number, suffix = "") =>
  value === 0 ? `0${suffix}` : `${value > 0 ? "+" : ""}${value}${suffix}`;
