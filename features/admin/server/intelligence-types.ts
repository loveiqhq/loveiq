export type AdminIntelligenceSurface =
  | "command-center"
  | "product"
  | "growth"
  | "strategy"
  | "health"
  | "experiments"
  | "research";

export type AdminIntelligenceTone = "good" | "watch" | "risk" | "neutral";
export type AdminIntelligenceConfidence = "high" | "medium" | "low";
export type AdminIntelligenceDraftKind =
  | "action"
  | "hypothesis"
  | "experiment"
  | "brief"
  | "investigation"
  | "segment";

export type AdminIntelligenceDraftActionSource =
  | "general"
  | "metric"
  | "decision"
  | "experiment"
  | "release"
  | "investigation";

export interface AdminIntelligenceEvidence {
  label: string;
  value: string;
  href: string;
}

export interface AdminIntelligenceDraft {
  kind: AdminIntelligenceDraftKind;
  title: string;
  detail: string;
  href: string;
  actionSeed: {
    title: string;
    description: string;
    sourceType: AdminIntelligenceDraftActionSource;
    metricKey: string | null;
    expectedImpact: string | null;
    linkedHref: string;
  } | null;
}

export interface AdminIntelligenceItem {
  id: string;
  title: string;
  detail: string;
  tone: AdminIntelligenceTone;
  confidence: AdminIntelligenceConfidence;
  capabilities: string[];
  recommendation: string;
  caveat: string | null;
  href: string;
  evidence: AdminIntelligenceEvidence[];
  draft: AdminIntelligenceDraft | null;
}

export interface AdminIntelligenceSection {
  key: string;
  title: string;
  summary: string;
  items: AdminIntelligenceItem[];
}

export interface AdminIntelligencePrompt {
  label: string;
  query: string;
}

export interface AdminIntelligenceSnapshot {
  generatedAt: string;
  days: number;
  surface: AdminIntelligenceSurface;
  title: string;
  headline: string;
  summary: string;
  prompts: AdminIntelligencePrompt[];
  sections: AdminIntelligenceSection[];
}

export interface AdminCommandAnswer {
  generatedAt: string;
  surface: AdminIntelligenceSurface;
  query: string;
  answer: string;
  confidence: AdminIntelligenceConfidence;
  supportingItems: Array<{
    title: string;
    capability: string;
    href: string;
  }>;
  citations: AdminIntelligenceEvidence[];
  suggestedPrompts: AdminIntelligencePrompt[];
}
