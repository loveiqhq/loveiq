export type AdminSimulationSurface = "command-center" | "growth" | "strategy" | "experiments";

export interface AdminSimulationOutcome {
  label: string;
  current: string;
  base: string;
  best: string;
  worst: string;
}

export interface AdminSimulationScenario {
  id: string;
  title: string;
  summary: string;
  tone: "good" | "watch" | "risk";
  confidence: "high" | "medium" | "low";
  href: string;
  assumptions: string[];
  outcomes: AdminSimulationOutcome[];
}

export interface AdminSimulationSnapshot {
  generatedAt: string;
  surface: AdminSimulationSurface;
  days: number;
  headline: string;
  scenarios: AdminSimulationScenario[];
}
