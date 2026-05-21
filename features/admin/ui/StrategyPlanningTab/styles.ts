// Tailwind-class lookup tables for StrategyPlanningTab. Extracted so the
// rendering logic and the style configuration evolve independently.

import type {
  BetConfidence,
  BetStatus,
  DependencyStrength,
  ImpactLevel,
  InitiativePriority,
  InitiativeStatus,
} from "@features/admin/server/strategy-planning";

export const initiativeTone: Record<InitiativeStatus, string> = {
  planned: "bg-white/10 text-text-muted",
  active: "bg-emerald-500/10 text-emerald-300",
  watch: "bg-amber-500/10 text-amber-200",
  blocked: "bg-red-500/10 text-red-300",
  completed: "bg-cyan-500/10 text-cyan-300",
};

export const priorityTone: Record<InitiativePriority, string> = {
  low: "bg-white/10 text-text-muted",
  medium: "bg-amber-500/10 text-amber-200",
  high: "bg-red-500/10 text-red-300",
};

export const betTone: Record<BetStatus, string> = {
  proposed: "bg-white/10 text-text-muted",
  active: "bg-emerald-500/10 text-emerald-300",
  validated: "bg-cyan-500/10 text-cyan-300",
  invalidated: "bg-red-500/10 text-red-300",
  parked: "bg-amber-500/10 text-amber-200",
};

export const confidenceTone: Record<BetConfidence, string> = {
  low: "bg-white/10 text-text-muted",
  medium: "bg-amber-500/10 text-amber-200",
  high: "bg-emerald-500/10 text-emerald-300",
};

export const impactTone: Record<ImpactLevel, string> = {
  low: "bg-white/10 text-text-muted",
  medium: "bg-cyan-500/10 text-cyan-300",
  high: "bg-amber-500/10 text-amber-200",
  critical: "bg-red-500/10 text-red-300",
};

export const dependencyTone: Record<DependencyStrength, string> = {
  weak: "bg-white/10 text-text-muted",
  medium: "bg-cyan-500/10 text-cyan-300",
  strong: "bg-emerald-500/10 text-emerald-300",
};

export const inputClassName =
  "w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-text-primary placeholder:text-text-muted/50 focus:border-white/20 focus:outline-none";
