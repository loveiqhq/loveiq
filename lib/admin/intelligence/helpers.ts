// Stateless helpers for the admin Intelligence module. Extracted from
// intelligence.ts so the surface-builder functions in the main file are easier
// to scan and so future per-surface splits don't all have to re-import deep
// from the monolith.

import type {
  AdminIntelligenceConfidence,
  AdminIntelligenceDraft,
  AdminIntelligenceEvidence,
  AdminIntelligenceItem,
  AdminIntelligencePrompt,
  AdminIntelligenceSection,
  AdminIntelligenceSurface,
  AdminIntelligenceTone,
} from "@/lib/admin/intelligence-types";

export const SURFACES: AdminIntelligenceSurface[] = [
  "command-center",
  "product",
  "growth",
  "strategy",
  "health",
  "experiments",
  "research",
];

export const PRODUCT_ADOPTION_HREF = `/admin/product-kpis?tab=${encodeURIComponent(
  "Feature Adoption"
)}`;

export function ensureSurface(value: string | null | undefined): AdminIntelligenceSurface {
  return SURFACES.includes(value as AdminIntelligenceSurface)
    ? (value as AdminIntelligenceSurface)
    : "command-center";
}

export function ensureDays(value: number): number {
  if (!Number.isFinite(value)) return 30;
  return Math.min(Math.max(Math.round(value), 7), 365);
}

export function makeEvidence(
  label: string,
  value: string,
  href: string
): AdminIntelligenceEvidence {
  return { label, value, href };
}

export function makeDraft(
  kind: AdminIntelligenceDraft["kind"],
  title: string,
  detail: string,
  href: string
): AdminIntelligenceDraft {
  const sourceType =
    kind === "experiment"
      ? "experiment"
      : kind === "hypothesis" || kind === "investigation"
        ? "investigation"
        : "general";

  return {
    kind,
    title,
    detail,
    href,
    actionSeed:
      kind === "brief"
        ? null
        : {
            title,
            description: detail,
            sourceType,
            metricKey: null,
            expectedImpact: null,
            linkedHref: href,
          },
  };
}

export function makeItem(input: {
  id: string;
  title: string;
  detail: string;
  tone: AdminIntelligenceTone;
  confidence: AdminIntelligenceConfidence;
  capabilities: string[];
  recommendation: string;
  caveat?: string | null;
  href: string;
  evidence?: AdminIntelligenceEvidence[];
  draft?: AdminIntelligenceDraft | null;
}): AdminIntelligenceItem {
  return {
    id: input.id,
    title: input.title,
    detail: input.detail,
    tone: input.tone,
    confidence: input.confidence,
    capabilities: input.capabilities,
    recommendation: input.recommendation,
    caveat: input.caveat ?? null,
    href: input.href,
    evidence: input.evidence ?? [],
    draft: input.draft ?? null,
  };
}

export function makeSection(
  key: string,
  title: string,
  summary: string,
  items: AdminIntelligenceItem[]
): AdminIntelligenceSection | null {
  if (items.length === 0) return null;
  return { key, title, summary, items };
}

export function filterSections(
  sections: Array<AdminIntelligenceSection | null>
): AdminIntelligenceSection[] {
  return sections.filter((section): section is AdminIntelligenceSection => Boolean(section));
}

export function surfacePrompts(surface: AdminIntelligenceSurface): AdminIntelligencePrompt[] {
  if (surface === "product") {
    return [
      { label: "Why did completion drop?", query: "Why is completion dropping?" },
      { label: "Top friction", query: "What is the biggest product friction right now?" },
      { label: "Launch risk", query: "Which launch needs attention first?" },
      { label: "Hypothesis", query: "What product hypothesis should we test next?" },
    ];
  }
  if (surface === "growth") {
    return [
      { label: "Leak source", query: "Where is the biggest conversion leak?" },
      { label: "Paid waste", query: "Which channels are wasting quality traffic?" },
      { label: "Recovery move", query: "What recovery play should we run next?" },
      { label: "Creative fit", query: "Which message best fits high-quality users?" },
    ];
  }
  if (surface === "strategy") {
    return [
      { label: "Best bet", query: "Which strategic bet should we scale next?" },
      { label: "Market risk", query: "What market move needs a response?" },
      { label: "Forecast risk", query: "Which forecast is weakest right now?" },
      { label: "Opportunity", query: "What is the highest-value opportunity now?" },
    ];
  }
  if (surface === "health") {
    return [
      { label: "Root cause", query: "What is the most likely root cause of risk right now?" },
      { label: "Trust risk", query: "Which trust issue affects business decisions most?" },
      { label: "Drift", query: "What drift needs intervention first?" },
      { label: "Policy", query: "Where is governance slipping?" },
    ];
  }
  if (surface === "experiments") {
    return [
      { label: "Decision ready", query: "Which experiment is ready for a decision?" },
      { label: "Interference", query: "Which experiments may be interfering?" },
      { label: "Weak signal", query: "Which experiment is weakest on rigor?" },
      { label: "Next test", query: "What experiment should we design next?" },
    ];
  }
  if (surface === "research") {
    return [
      { label: "Strongest emotion", query: "Where is sentiment intensity highest right now?" },
      { label: "Top pain", query: "Which research theme carries the most pain?" },
      { label: "Contradictions", query: "Which contradiction needs review first?" },
      { label: "Emerging concern", query: "What new sentiment trend is emerging?" },
    ];
  }
  return [
    { label: "What matters now?", query: "What matters most right now?" },
    { label: "Next action", query: "What should leadership do next?" },
    { label: "Main risk", query: "What is the biggest risk right now?" },
    { label: "Decision memory", query: "Which decision needs a review?" },
  ];
}

export function combineEvidence(
  items: AdminIntelligenceItem[],
  limit = 6
): AdminIntelligenceEvidence[] {
  const seen = new Set<string>();
  const output: AdminIntelligenceEvidence[] = [];
  for (const item of items) {
    for (const evidence of item.evidence) {
      const key = `${evidence.label}|${evidence.value}|${evidence.href}`;
      if (seen.has(key)) continue;
      seen.add(key);
      output.push(evidence);
      if (output.length >= limit) return output;
    }
  }
  return output;
}

export function scoreAnswerConfidence(score: number): AdminIntelligenceConfidence {
  if (score >= 48) return "high";
  if (score >= 24) return "medium";
  return "low";
}

export function summarizeItems(items: AdminIntelligenceItem[]): string {
  if (items.length === 0) {
    return "No grounded signal matched this query in the current intelligence snapshot.";
  }
  // Length checks above guarantee items[0] (and items[1] in the final branch) are defined.
  if (items.length === 1) {
    return `${items[0]!.title}. ${items[0]!.recommendation}`;
  }
  return `${items[0]!.title}. ${items[0]!.recommendation} Next strongest signal: ${items[1]!.title}. ${items[1]!.recommendation}`;
}
