import type {
  AdminIntelligenceConfidence,
  AdminIntelligencePrompt,
  AdminIntelligenceTone,
} from "@features/admin/server/intelligence-types";

export type AdminKnowledgeSurface = "command-center" | "strategy" | "health";

export interface AdminKnowledgeArtifact {
  id: string;
  type:
    | "meeting-pack"
    | "decision-memory"
    | "decision-graph"
    | "postmortem"
    | "postmortem-pack"
    | "graph-path"
    | "governance-gap";
  title: string;
  summary: string;
  tone: AdminIntelligenceTone;
  confidence: AdminIntelligenceConfidence;
  href: string;
  evidence: Array<{
    label: string;
    value: string;
    href: string;
  }>;
}

export interface AdminKnowledgeSnapshot {
  generatedAt: string;
  surface: AdminKnowledgeSurface;
  days: number;
  headline: string;
  summary: string;
  prompts: AdminIntelligencePrompt[];
  artifacts: AdminKnowledgeArtifact[];
}
