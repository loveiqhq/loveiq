export type ProductIssueSeverity = "critical" | "high" | "medium" | "watch";
export type ProductIssueCategory = "abandonment" | "confusion" | "signal" | "quality" | "pain";
export type ProductIssueDimension =
  | "question"
  | "chapter"
  | "source"
  | "device"
  | "browser"
  | "placement";
export type ProductPortfolioStatus = "critical" | "action" | "watch" | "healthy";

export interface ProductIssueCluster {
  id: string;
  category: ProductIssueCategory;
  dimension: ProductIssueDimension;
  severity: ProductIssueSeverity;
  subject: string;
  title: string;
  summary: string;
  impactScore: number;
  confidence: "high" | "medium" | "low";
  recommendation: string;
  evidence: string[];
  href: string;
}

export interface ProductIssueHotspot {
  label: string;
  score: number;
  affectedQuestions: number;
  dominantReason: string;
  href: string;
}

export interface ProductContextHotspotGroup {
  dimension: Extract<ProductIssueDimension, "source" | "device" | "browser" | "placement">;
  items: ProductIssueHotspot[];
}

export interface ProductIssueCategorySummary {
  category: ProductIssueCategory;
  count: number;
  topSeverity: ProductIssueSeverity | null;
  topLabel: string | null;
}

export interface QuestionPortfolioItem {
  rank: number;
  qId: string;
  chapterId: string;
  questionText: string;
  portfolioStatus: ProductPortfolioStatus;
  attentionScore: number;
  signalScore: number;
  effectivenessScore: number;
  completionRate: number;
  skipRate: number;
  backtrackRate: number;
  avgActiveTimeS: number;
  dropoffN: number;
  regressionScore: number;
  lifecycleAction: "keep" | "revise" | "replace" | "retire";
  lifecyclePriority: number;
  discriminationIndex: number;
  qualityScore: number | null;
  lowInfoRate: number | null;
  fillerRate: number | null;
  duplicateRate: number | null;
  painMentions: number;
  painSeverityScore: number | null;
  wordingIssueCount: number;
  dominantContext: string | null;
  reasons: string[];
  recommendation: string;
  hrefs: {
    effectiveness: string;
    scorecard: string;
    research: string;
    lifecycle: string;
  };
}

export interface ProductIssueRadarSnapshot {
  generatedAt: string;
  days: number;
  summary: {
    priorityIssues: number;
    criticalQuestions: number;
    chapterHotspots: number;
    contextHotspots: number;
    lowQualityQuestions: number;
    actionQuestions: number;
  };
  categorySummary: ProductIssueCategorySummary[];
  priorityIssues: ProductIssueCluster[];
  chapterHotspots: ProductIssueHotspot[];
  contextHotspots: ProductContextHotspotGroup[];
  portfolio: QuestionPortfolioItem[];
}
