import {
  buildQuestionEffectivenessSnapshot,
  buildQuestionLifecycleSnapshot,
  type QuestionEffectivenessSnapshot,
} from "@features/admin/server/question-effectiveness";
import { buildResearchIntelligenceSnapshot } from "@features/admin/server/research-intelligence";
import { buildProductKpiHref, buildScorecardHref } from "@features/admin/server/drilldowns";
import type {
  ProductContextHotspotGroup,
  ProductIssueCategory,
  ProductIssueCategorySummary,
  ProductIssueCluster,
  ProductIssueHotspot,
  ProductIssueRadarSnapshot,
  ProductIssueSeverity,
  ProductPortfolioStatus,
  QuestionPortfolioItem,
} from "@features/admin/server/product-issue-types";

type ContextDimension = ProductContextHotspotGroup["dimension"];

interface ContextAccumulator {
  label: string;
  score: number;
  affectedQuestions: Set<string>;
  reasons: Map<string, number>;
  href: string;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function severityRank(severity: ProductIssueSeverity) {
  if (severity === "critical") return 4;
  if (severity === "high") return 3;
  if (severity === "medium") return 2;
  return 1;
}

function statusRank(status: ProductPortfolioStatus) {
  if (status === "critical") return 4;
  if (status === "action") return 3;
  if (status === "watch") return 2;
  return 1;
}

function makeDays(rawDays: number, effectiveness: QuestionEffectivenessSnapshot) {
  return effectiveness.summary.comparisonWindowDays || Math.min(Math.max(rawDays || 30, 7), 90);
}

function dominantContextLabel(
  question: QuestionEffectivenessSnapshot["dropoffDeepView"]["questions"][number] | undefined
) {
  if (!question) return null;
  const candidates = [
    ...question.sourceSplit.map((entry) => ({
      label: `source · ${entry.label}`,
      count: entry.count,
    })),
    ...question.deviceSplit.map((entry) => ({
      label: `device · ${entry.label}`,
      count: entry.count,
    })),
    ...question.browserSplit.map((entry) => ({
      label: `browser · ${entry.label}`,
      count: entry.count,
    })),
    ...question.embedSplit.map((entry) => ({
      label: `placement · ${entry.label}`,
      count: entry.count,
    })),
  ].sort((left, right) => right.count - left.count);

  return candidates[0]?.count && candidates[0].count >= 4 ? candidates[0].label : null;
}

function severityFromAttention(
  attentionScore: number,
  lifecycleAction: QuestionPortfolioItem["lifecycleAction"]
): ProductIssueSeverity {
  if (lifecycleAction === "replace" || lifecycleAction === "retire" || attentionScore >= 82) {
    return "critical";
  }
  if (attentionScore >= 68) return "high";
  if (attentionScore >= 50) return "medium";
  return "watch";
}

function statusFromPortfolio(
  attentionScore: number,
  lifecycleAction: QuestionPortfolioItem["lifecycleAction"],
  qualityScore: number | null,
  wordingIssueCount: number
): ProductPortfolioStatus {
  if (
    lifecycleAction === "replace" ||
    lifecycleAction === "retire" ||
    attentionScore >= 82 ||
    (qualityScore != null && qualityScore < 45)
  ) {
    return "critical";
  }
  if (lifecycleAction === "revise" || attentionScore >= 60 || wordingIssueCount >= 3) {
    return "action";
  }
  if (attentionScore >= 38 || wordingIssueCount >= 1) return "watch";
  return "healthy";
}

function buildCategorySet(item: QuestionPortfolioItem) {
  const categories = new Set<ProductIssueCategory>();
  if (item.completionRate < 84 || item.dropoffN >= 12) categories.add("abandonment");
  if (item.skipRate >= 10 || item.backtrackRate >= 7 || item.wordingIssueCount > 0) {
    categories.add("confusion");
  }
  if (item.discriminationIndex <= 0.06 || item.signalScore < 55) categories.add("signal");
  if (
    (item.qualityScore != null && item.qualityScore < 70) ||
    (item.lowInfoRate != null && item.lowInfoRate >= 30) ||
    (item.duplicateRate != null && item.duplicateRate >= 25)
  ) {
    categories.add("quality");
  }
  if (item.painMentions > 0 || (item.painSeverityScore ?? 0) >= 35) categories.add("pain");
  return categories;
}

function addContextItems(
  accumulator: Map<ContextDimension, Map<string, ContextAccumulator>>,
  dimension: ContextDimension,
  items: Array<{ label: string; count: number }>,
  questionId: string,
  questionLabel: string,
  weight: number,
  href: string
) {
  const dimensionMap = accumulator.get(dimension) ?? new Map<string, ContextAccumulator>();

  for (const item of items) {
    if (!item.label || item.label.toLowerCase() === "unknown" || item.count < 3) continue;
    const current = dimensionMap.get(item.label) ?? {
      label: item.label,
      score: 0,
      affectedQuestions: new Set<string>(),
      reasons: new Map<string, number>(),
      href,
    };
    current.score += item.count * weight;
    current.affectedQuestions.add(questionId);
    current.reasons.set(questionLabel, (current.reasons.get(questionLabel) ?? 0) + item.count);
    dimensionMap.set(item.label, current);
  }

  accumulator.set(dimension, dimensionMap);
}

export async function buildProductIssueRadarSnapshot(
  rawDays: number
): Promise<ProductIssueRadarSnapshot> {
  const effectiveness = await buildQuestionEffectivenessSnapshot(rawDays);
  const [lifecycle, research] = await Promise.all([
    buildQuestionLifecycleSnapshot(rawDays, effectiveness),
    buildResearchIntelligenceSnapshot(rawDays, effectiveness),
  ]);

  const days = makeDays(rawDays, effectiveness);
  const dropoffMap = new Map(
    effectiveness.dropoffDeepView.questions.map((question) => [question.qId, question])
  );
  const wordingMap = new Map(research.wordingDiagnostics.map((item) => [item.questionId, item]));
  const qualityMap = new Map(
    research.answerQuality.questions.map((item) => [item.questionId, item])
  );
  const painMap = new Map(research.painQuestions.map((item) => [item.questionId, item]));

  const portfolioBase = lifecycle.questions.map((question) => {
    const wording = wordingMap.get(question.qId);
    const quality = qualityMap.get(question.qId);
    const pain = painMap.get(question.qId);
    const dropoffContext = dropoffMap.get(question.qId);

    const attentionScore = clamp(
      Math.round(
        question.lifecyclePriority * 0.58 +
          Math.max(0, 70 - question.effectivenessScore) * 0.5 +
          Math.max(0, 0.08 - question.discriminationIndex) * 140 +
          (wording ? wording.issueCount * 4 + wording.behaviorRisk * 0.28 : 0) +
          (quality
            ? Math.max(0, 75 - quality.qualityScore) * 0.42 +
              quality.lowInfoRate * 0.22 +
              quality.duplicateRate * 0.12
            : 0) +
          (pain ? pain.severityScore * 0.14 : 0)
      ),
      0,
      100
    );

    const signalScore = clamp(
      Math.round(
        question.effectivenessScore * 0.38 +
          clamp((question.discriminationIndex / 0.15) * 100, 0, 100) * 0.34 +
          (quality?.qualityScore ?? 70) * 0.18 +
          Math.max(0, 100 - (wording?.behaviorRisk ?? 18)) * 0.1
      ),
      0,
      100
    );

    const reasons = [
      ...question.lifecycleReasons,
      ...question.regressionReasons,
      ...(wording?.issues ?? []),
      ...(quality
        ? [
            quality.lowInfoRate >= 30 ? `${quality.lowInfoRate}% low-info responses` : null,
            quality.duplicateRate >= 25 ? `${quality.duplicateRate}% duplicate responses` : null,
          ].filter((value): value is string => Boolean(value))
        : []),
      ...(pain
        ? [`${pain.painMentions} pain mentions across ${pain.responseCount} responses`]
        : []),
    ].filter((value, index, values) => value && values.indexOf(value) === index);

    const portfolioStatus = statusFromPortfolio(
      attentionScore,
      question.lifecycleAction,
      quality?.qualityScore ?? null,
      wording?.issueCount ?? 0
    );

    const recommendation =
      quality && quality.qualityScore < 60
        ? quality.recommendation
        : wording && wording.issueCount >= 2
          ? wording.recommendation
          : question.recommendation;

    return {
      qId: question.qId,
      chapterId: question.chapterId,
      questionText: question.questionText,
      portfolioStatus,
      attentionScore,
      signalScore,
      effectivenessScore: question.effectivenessScore,
      completionRate: question.completionRate,
      skipRate: question.skipRate,
      backtrackRate: question.backtrackRate,
      avgActiveTimeS: question.avgActiveTimeS,
      dropoffN: question.dropoffN,
      regressionScore: question.regressionScore,
      lifecycleAction: question.lifecycleAction,
      lifecyclePriority: question.lifecyclePriority,
      discriminationIndex: round2(question.discriminationIndex),
      qualityScore: quality?.qualityScore ?? null,
      lowInfoRate: quality?.lowInfoRate ?? null,
      fillerRate: quality?.fillerRate ?? null,
      duplicateRate: quality?.duplicateRate ?? null,
      painMentions: pain?.painMentions ?? 0,
      painSeverityScore: pain?.severityScore ?? null,
      wordingIssueCount: wording?.issueCount ?? 0,
      dominantContext: dominantContextLabel(dropoffContext),
      reasons: reasons.slice(0, 5),
      recommendation,
      hrefs: {
        effectiveness: "/admin/question-effectiveness",
        scorecard: buildScorecardHref({ days, question: question.qId }),
        research: "/admin/research",
        lifecycle: "/admin/question-lifecycle",
      },
    };
  });

  const portfolio = portfolioBase
    .sort((left, right) => {
      return (
        statusRank(right.portfolioStatus) - statusRank(left.portfolioStatus) ||
        right.attentionScore - left.attentionScore ||
        left.signalScore - right.signalScore ||
        left.qId.localeCompare(right.qId)
      );
    })
    .map((item, index) => ({ ...item, rank: index + 1 }));

  const chapterAccumulator = new Map<
    string,
    {
      label: string;
      score: number;
      affectedQuestions: number;
      reasons: Map<string, number>;
      href: string;
    }
  >();
  for (const item of portfolio) {
    const current = chapterAccumulator.get(item.chapterId) ?? {
      label: `Chapter ${item.chapterId}`,
      score: 0,
      affectedQuestions: 0,
      reasons: new Map<string, number>(),
      href: buildProductKpiHref({ days, tab: "Question Portfolio", chapter: item.chapterId }),
    };
    current.score += item.attentionScore;
    if (item.portfolioStatus !== "healthy") current.affectedQuestions += 1;
    for (const category of buildCategorySet(item)) {
      current.reasons.set(category, (current.reasons.get(category) ?? 0) + 1);
    }
    chapterAccumulator.set(item.chapterId, current);
  }

  const chapterHotspots: ProductIssueHotspot[] = [...chapterAccumulator.values()]
    .filter((item) => item.affectedQuestions > 0)
    .map((item) => ({
      label: item.label,
      score: Math.round(item.score),
      affectedQuestions: item.affectedQuestions,
      dominantReason:
        [...item.reasons.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? "mixed",
      href: item.href,
    }))
    .sort(
      (left, right) => right.score - left.score || right.affectedQuestions - left.affectedQuestions
    )
    .slice(0, 6);

  function chapterCategory(value: string): ProductIssueCategory {
    return value === "abandonment" ||
      value === "confusion" ||
      value === "signal" ||
      value === "quality" ||
      value === "pain"
      ? value
      : "confusion";
  }

  const contextAccumulator = new Map<ContextDimension, Map<string, ContextAccumulator>>();
  for (const question of effectiveness.dropoffDeepView.questions) {
    const weight =
      question.dropoffRate * 0.45 +
      question.bounceAfterQuestionRate * 0.35 +
      (question.medianDwellS ?? 0) * 0.2;
    const label = `${question.qId} · ${question.questionText}`;
    addContextItems(
      contextAccumulator,
      "source",
      question.sourceSplit,
      question.qId,
      label,
      weight,
      "/admin/question-effectiveness"
    );
    addContextItems(
      contextAccumulator,
      "device",
      question.deviceSplit,
      question.qId,
      label,
      weight,
      "/admin/question-effectiveness"
    );
    addContextItems(
      contextAccumulator,
      "browser",
      question.browserSplit,
      question.qId,
      label,
      weight,
      "/admin/question-effectiveness"
    );
    addContextItems(
      contextAccumulator,
      "placement",
      question.embedSplit,
      question.qId,
      label,
      weight,
      "/admin/question-effectiveness"
    );
  }

  const contextHotspots: ProductContextHotspotGroup[] = (
    ["source", "device", "browser", "placement"] as const
  )
    .map((dimension) => {
      const dimensionMap =
        contextAccumulator.get(dimension) ?? new Map<string, ContextAccumulator>();
      const items = [...dimensionMap.values()]
        .map((item) => ({
          label: item.label,
          score: Math.round(item.score),
          affectedQuestions: item.affectedQuestions.size,
          dominantReason:
            [...item.reasons.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ??
            "mixed",
          href: item.href,
        }))
        .sort(
          (left, right) =>
            right.score - left.score || right.affectedQuestions - left.affectedQuestions
        )
        .slice(0, 5);
      return { dimension, items };
    })
    .filter((group) => group.items.length > 0);

  const priorityIssues: ProductIssueCluster[] = [
    ...portfolio
      .filter((item) => item.portfolioStatus === "critical" || item.portfolioStatus === "action")
      .slice(0, 4)
      .map(
        (item) =>
          ({
            id: `question-${item.qId}`,
            category: [...buildCategorySet(item)][0] ?? "confusion",
            dimension: "question" as const,
            severity: severityFromAttention(item.attentionScore, item.lifecycleAction),
            subject: item.qId,
            title: `${item.qId} needs ${item.lifecycleAction === "keep" ? "review" : item.lifecycleAction}`,
            summary: `${item.questionText} is showing ${item.portfolioStatus} risk across friction, signal, and quality.`,
            impactScore: item.attentionScore,
            confidence:
              item.lifecyclePriority >= 70
                ? "high"
                : item.lifecyclePriority >= 45
                  ? "medium"
                  : "low",
            recommendation: item.recommendation,
            evidence: item.reasons.slice(0, 4),
            href: buildProductKpiHref({ days, tab: "Question Portfolio", chapter: item.chapterId }),
          }) satisfies ProductIssueCluster
      ),
    ...chapterHotspots.slice(0, 2).map(
      (item) =>
        ({
          id: `chapter-${item.label}`,
          category: chapterCategory(item.dominantReason),
          dimension: "chapter" as const,
          severity: item.score >= 260 ? "high" : "medium",
          subject: item.label,
          title: `${item.label} is accumulating issue debt`,
          summary: `${item.affectedQuestions} questions in this chapter need action or closer monitoring.`,
          impactScore: item.score,
          confidence: item.affectedQuestions >= 4 ? "high" : "medium",
          recommendation:
            "Re-sequence or simplify the highest-risk questions before adding more product changes here.",
          evidence: [
            `${item.affectedQuestions} questions affected`,
            `Dominant issue: ${item.dominantReason}`,
          ],
          href: item.href,
        }) satisfies ProductIssueCluster
    ),
    ...contextHotspots.flatMap((group) =>
      group.items.slice(0, 1).map(
        (item) =>
          ({
            id: `${group.dimension}-${item.label}`,
            category: "abandonment" as const,
            dimension: group.dimension,
            severity: item.score >= 320 ? "high" : "medium",
            subject: item.label,
            title: `${group.dimension} hotspot: ${item.label}`,
            summary: `${item.affectedQuestions} questions show concentrated product friction in this ${group.dimension}.`,
            impactScore: item.score,
            confidence: item.affectedQuestions >= 3 ? "high" : "medium",
            recommendation: `Check the top affected questions for ${item.label} before assuming the issue is universal.`,
            evidence: [
              `Top driver: ${item.dominantReason}`,
              `${item.affectedQuestions} affected questions`,
            ],
            href: item.href,
          }) satisfies ProductIssueCluster
      )
    ),
  ]
    .sort((left, right) => {
      return (
        severityRank(right.severity) - severityRank(left.severity) ||
        right.impactScore - left.impactScore
      );
    })
    .slice(0, 8);

  const categorySummary: ProductIssueCategorySummary[] = (
    ["abandonment", "confusion", "signal", "quality", "pain"] as const
  ).map((category) => {
    const relevant = portfolio.filter((item) => buildCategorySet(item).has(category));
    const top = relevant[0];
    return {
      category,
      count: relevant.length,
      topSeverity: top ? severityFromAttention(top.attentionScore, top.lifecycleAction) : null,
      topLabel: top ? `${top.qId} · ${top.chapterId}` : null,
    };
  });

  const lowQualityQuestions = portfolio.filter(
    (item) => item.qualityScore != null && item.qualityScore < 70
  ).length;
  const criticalQuestions = portfolio.filter((item) => item.portfolioStatus === "critical").length;
  const actionQuestions = portfolio.filter(
    (item) => item.portfolioStatus === "critical" || item.portfolioStatus === "action"
  ).length;

  return {
    generatedAt: new Date().toISOString(),
    days,
    summary: {
      priorityIssues: priorityIssues.length,
      criticalQuestions,
      chapterHotspots: chapterHotspots.length,
      contextHotspots: contextHotspots.reduce((sum, group) => sum + group.items.length, 0),
      lowQualityQuestions,
      actionQuestions,
    },
    categorySummary,
    priorityIssues,
    chapterHotspots,
    contextHotspots,
    portfolio,
  };
}
