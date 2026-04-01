export type AdminGraphSurface = "command-center" | "strategy" | "health";

export interface AdminSignalGraphNode {
  id: string;
  label: string;
  kind:
    | "metric"
    | "action"
    | "decision"
    | "driver"
    | "forecast"
    | "opportunity"
    | "anomaly"
    | "incident"
    | "drift";
  tone: "good" | "watch" | "risk" | "neutral";
  href: string;
}

export interface AdminSignalGraphEdge {
  id: string;
  from: string;
  to: string;
  label: string;
}

export interface AdminSignalGraphPath {
  id: string;
  title: string;
  summary: string;
  confidence: "high" | "medium" | "low";
  href: string;
  nodeIds: string[];
}

export interface AdminSignalGraphSnapshot {
  generatedAt: string;
  surface: AdminGraphSurface;
  days: number;
  headline: string;
  nodes: AdminSignalGraphNode[];
  edges: AdminSignalGraphEdge[];
  focusPaths: AdminSignalGraphPath[];
}
