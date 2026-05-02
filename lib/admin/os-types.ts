export type LeadCockpitRole = "strategy" | "product" | "growth" | "tech";
export type AdminOsTone = "good" | "watch" | "risk";
export type AdminActionStatus = "open" | "in-progress" | "blocked" | "done";
export type AdminActionPriority = "high" | "medium" | "low";
export type AdminActionSourceType =
  | "general"
  | "metric"
  | "decision"
  | "experiment"
  | "release"
  | "investigation";

export interface AdminMetricOptionLite {
  key: string;
  label: string;
  description: string;
  href: string;
}

export interface AdminActionItem {
  id: number;
  adminEmail: string;
  ownerEmail: string | null;
  title: string;
  description: string | null;
  status: AdminActionStatus;
  priority: AdminActionPriority;
  sourceType: AdminActionSourceType;
  sourceId: number | null;
  metricKey: string | null;
  expectedImpact: string | null;
  measuredOutcome: string | null;
  linkedHref: string | null;
  dueDate: string | null;
  reviewDate: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminOsMetricCard {
  key: string;
  label: string;
  value: string;
  detail: string;
  delta: number | null;
  tone: AdminOsTone;
  href: string;
  statusLabel?: string;
  ownerEmail?: string | null;
}

export interface AdminOsBrief {
  title: string;
  detail: string;
  tone: AdminOsTone;
  href: string;
}

export interface AdminDecisionReviewItem {
  id: number;
  title: string;
  entryType: "decision" | "scoring-change" | "memo";
  status: string;
  ownerEmail: string | null;
  primaryMetricKey: string | null;
  reviewDate: string | null;
  expectedImpact: string | null;
  measuredOutcome: string | null;
  updatedAt: string;
  href: string;
}

export interface AdminOsTimelineItem {
  id: string;
  kind: "release" | "decision" | "experiment" | "action";
  title: string;
  detail: string;
  tone: AdminOsTone;
  timestamp: string;
  href: string;
}

export interface AdminOsRoleSummary {
  role: LeadCockpitRole;
  label: string;
  summary: string;
  tone: AdminOsTone;
  href: string;
}

export interface AdminOsTrustItem {
  label: string;
  source: string;
  mode: "live" | "derived" | "sampled" | "materialized";
  sampleSize: number;
  lastUpdated: string | null;
  freshnessHours: number | null;
  tone: AdminOsTone;
  detail: string;
  href: string;
}

export interface AdminOsSnapshot {
  generatedAt: string;
  days: number;
  briefs: AdminOsBrief[];
  metricBoard: AdminOsMetricCard[];
  leadingIndicators: Array<{
    metricKey: string;
    metricLabel: string;
    statusState: string;
    leadingMetricKey: string;
    leadingMetricLabel: string;
    leadingMetricValueLabel: string;
    signalState: "positive" | "watch" | "negative";
    detail: string;
    href: string;
  }>;
  metricOptions: AdminMetricOptionLite[];
  decisionBoard: AdminDecisionReviewItem[];
  actionBoard: {
    summary: {
      totalOpen: number;
      blocked: number;
      overdue: number;
      doneThisWindow: number;
    };
    items: AdminActionItem[];
  };
  trustBoard: AdminOsTrustItem[];
  roleSummaries: AdminOsRoleSummary[];
  watchlist: AdminOsBrief[];
  timeline: AdminOsTimelineItem[];
}

export interface LeadCockpitSnapshot {
  role: LeadCockpitRole;
  label: string;
  generatedAt: string;
  days: number;
  summary: string;
  metrics: AdminOsMetricCard[];
  priorities: AdminOsBrief[];
  supporting: Array<{
    label: string;
    value: string;
    detail: string;
    href: string;
  }>;
  leadingIndicators?: Array<{
    metricKey: string;
    metricLabel: string;
    statusState: string;
    leadingMetricKey: string;
    leadingMetricLabel: string;
    leadingMetricValueLabel: string;
    signalState: "positive" | "watch" | "negative";
    detail: string;
    href: string;
  }>;
  actions: AdminActionItem[];
  timeline: AdminOsTimelineItem[];
}

export type AdminAlertTargetType = "guardrail" | "service" | "trust" | "action" | "decision";
export type AdminAlertComparator = "gte" | "lte" | "eq";

export interface AdminAlertRule {
  id: number;
  adminEmail: string;
  ownerEmail: string | null;
  label: string;
  targetType: AdminAlertTargetType;
  targetKey: string;
  comparator: AdminAlertComparator;
  thresholdNumeric: number;
  severity: AdminOsTone;
  linkedHref: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AdminAnomalyItem {
  id: string;
  title: string;
  category: AdminAlertTargetType;
  severity: AdminOsTone;
  targetKey: string;
  value: number;
  detail: string;
  href: string;
  ownerEmail: string | null;
  matchedRules: Array<{ id: number; label: string }>;
}

export interface AdminAnomalySnapshot {
  generatedAt: string;
  days: number;
  summary: {
    total: number;
    risk: number;
    watch: number;
    matchedRules: number;
  };
  items: AdminAnomalyItem[];
  activeRules: AdminAlertRule[];
}
