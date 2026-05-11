// Type contract for the data the strategy dashboard receives from
// /api/admin/strategy. Extracted from StrategyHubDashboard.tsx so the schema
// can be referenced from sibling files without re-importing the whole
// component module.

export type BenchmarkStatus = "good" | "watch" | "risk";
export type QueuePriority = "high" | "medium" | "low";
export type Confidence = "high" | "medium" | "low";
export type OpportunityEffort = "low" | "medium" | "high";
export type TimeToSignal = "fast" | "medium" | "slow";
export type DecisionReviewState = "due" | "upcoming" | "stale" | "validated" | "missing-outcome";

export interface StrategyData {
  days: number;
  generatedAt: string;
  northStar: Array<{
    key: string;
    label: string;
    delta: number;
    description: string;
    href: string;
    displayValue: string;
    drilldowns: Array<{ label: string; value: string; href: string }>;
  }>;
  northStarTree: Array<{
    label: string;
    href: string;
    drivers: Array<{ label: string; value: string; href: string }>;
  }>;
  goals: Array<{
    id: number;
    label: string;
    metricLabel: string;
    currentValue: number | null;
    targetValue: number;
    progressPct: number;
    deadline: string | null;
    status: "on-track" | "watch" | "off-track";
    href: string;
    drivers: Array<{ label: string; value: string; href: string }>;
  }>;
  benchmarks: Array<{
    key: string;
    label: string;
    description: string;
    referenceLabel: string;
    href: string;
    currentLabel: string;
    targetLabel: string;
    status: BenchmarkStatus;
  }>;
  workQueue: {
    summary: {
      openCases: number;
      overdueCases: number;
      highPriorityCases: number;
      flaggedSubmissions: number;
      scoringDisagreements: number;
      ambiguousCases: number;
      recentNotes: number;
      workflowCoverage: number;
    };
    items: Array<{
      title: string;
      detail: string;
      priority: QueuePriority;
      type: string;
      href: string;
      updatedAt: string;
    }>;
  };
  releaseImpact: {
    entries: Array<{
      id: number;
      title: string;
      category: string;
      eventDate: string;
      deltaSubmissions: number;
      deltaCompletionRate: number;
      deltaWaitlist: number;
      linkedChartCount: number;
      notes: string[];
      href: string;
    }>;
    annotations: Array<{ id: number; chartKey: string; annotationDate: string; note: string }>;
  };
  opportunities: {
    backlog: Array<{
      title: string;
      source: string;
      confidence: Confidence;
      effort: OpportunityEffort;
      timeToSignal: TimeToSignal;
      score: number;
      impact: string;
      detail: string;
      scoreInputs: {
        impact: number;
        confidence: number;
        effort: number;
        timeToSignal: number;
        formula: string;
      };
      href: string;
    }>;
    funnelLeakage: Array<{
      from: string;
      to: string;
      lossCount: number;
      lossRate: number;
      likelyCause: string;
      href: string;
    }>;
    archetypeMomentum: Array<{
      archetype: string;
      currentCount: number;
      previousCount: number;
      delta: number;
      href: string;
    }>;
    leaderboards: {
      channels: Array<{
        source: string;
        total: number;
        completed: number;
        conversionRate: number;
      }>;
      archetypes: Array<{ archetype: string; count: number; delta: number }>;
      workflow: Array<{ stage: string; submissions: number; color: string }>;
    };
  };
  forecasts: {
    generatedAt: string;
    modules: Array<{
      key: string;
      label: string;
      forecastValue: number;
      lowerBound: number;
      upperBound: number;
      confidence: Confidence;
      href: string;
    }>;
  };
  experiments: {
    summary: {
      total: number;
      active: number;
      pendingDecision: number;
    };
    items: Array<{
      id: number;
      name: string;
      status: string;
      primaryMetricKey: string;
      ownerEmail: string | null;
      decisionDate: string | null;
      href: string;
    }>;
  };
  decisionReview: {
    summary: {
      total: number;
      due: number;
      stale: number;
      awaitingOutcome: number;
      openReviews: number;
    };
    items: Array<{
      id: number;
      title: string;
      entryType: "decision" | "scoring-change" | "memo";
      status: "draft" | "approved" | "monitoring" | "validated" | "rolled-back";
      primaryMetricKey: string | null;
      ownerEmail: string | null;
      reviewDate: string | null;
      daysUntilReview: number | null;
      daysSinceUpdate: number;
      openReviewCount: number;
      expectedImpact: string | null;
      measuredOutcome: string | null;
      comparisonLabel: string;
      detail: string;
      reviewState: DecisionReviewState;
      href: string;
    }>;
  };
  briefGenerator: {
    generatedAt: string;
    packs: Array<{
      audience: "Executive" | "Strategy" | "Product" | "Growth" | "Tech";
      tone: BenchmarkStatus;
      headline: string;
      summary: string;
      bullets: string[];
      actions: string[];
      href: string;
      copyText: string;
    }>;
  };
  narrative: string[];
  analyst: {
    briefs: Array<{ role: string; summary: string }>;
  };
  guardrails: {
    healthy: number;
    breached: number;
    items: Array<{
      label: string;
      current: number;
      target: number;
      status: BenchmarkStatus;
      detail: string;
      href: string;
    }>;
  };
  triage: Array<{
    title: string;
    cause: string;
    confidence: Confidence;
    evidence: string;
    href: string;
  }>;
}
