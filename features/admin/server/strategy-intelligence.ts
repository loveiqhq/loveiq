import { buildForecastSnapshot } from "@features/admin/server/forecasting";
import type { ForecastModule } from "@features/admin/server/forecasting";
import { buildStrategyPlanningSnapshot } from "@features/admin/server/strategy-planning";
import { buildStrategySnapshot } from "@features/admin/server/strategy";
import type {
  AdminIntelligenceDraft,
  AdminIntelligenceEvidence,
  AdminIntelligenceItem,
  AdminIntelligenceSection,
  AdminIntelligenceSnapshot,
  AdminIntelligenceSurface,
  AdminIntelligenceTone,
} from "@features/admin/server/intelligence-types";
import { clampDays } from "@features/admin/server/next-level";

type StrategyIntelligenceSurface = Extract<AdminIntelligenceSurface, "strategy">;

function ensureSurface(): StrategyIntelligenceSurface {
  return "strategy";
}

function ensureDays(value: number): number {
  return clampDays(Number.isFinite(value) ? Math.round(value) : 30, 7, 365);
}

function makeEvidence(label: string, value: string, href: string): AdminIntelligenceEvidence {
  return { label, value, href };
}

function makeDraft(
  kind: AdminIntelligenceDraft["kind"],
  title: string,
  detail: string,
  href: string,
  metricKey: string | null = null,
  expectedImpact: string | null = null
): AdminIntelligenceDraft {
  const sourceType =
    kind === "experiment"
      ? "experiment"
      : kind === "hypothesis" || kind === "investigation"
        ? "investigation"
        : kind === "brief"
          ? "decision"
          : "general";

  return {
    kind,
    title,
    detail,
    href,
    actionSeed:
      kind === "brief" || kind === "segment"
        ? null
        : {
            title,
            description: detail,
            sourceType,
            metricKey,
            expectedImpact,
            linkedHref: href,
          },
  };
}

function makeItem(input: {
  id: string;
  title: string;
  detail: string;
  tone: AdminIntelligenceTone;
  confidence: "high" | "medium" | "low";
  capabilities: string[];
  recommendation: string;
  href: string;
  caveat?: string | null;
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

function makeSection(
  key: string,
  title: string,
  summary: string,
  items: AdminIntelligenceItem[]
): AdminIntelligenceSection | null {
  if (items.length === 0) return null;
  return { key, title, summary, items };
}

function filterSections(
  sections: Array<AdminIntelligenceSection | null>
): AdminIntelligenceSection[] {
  return sections.filter((section): section is AdminIntelligenceSection => Boolean(section));
}

function impactWeight(level: "low" | "medium" | "high" | "critical") {
  if (level === "critical") return 4;
  if (level === "high") return 3;
  if (level === "medium") return 2;
  return 1;
}

function confidenceWeight(level: "low" | "medium" | "high") {
  if (level === "high") return 3;
  if (level === "medium") return 2;
  return 1;
}

function strengthWeight(level: "weak" | "medium" | "strong") {
  if (level === "strong") return 3;
  if (level === "medium") return 2;
  return 1;
}

function safeDate(value: string | null | undefined): number {
  if (!value) return 0;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

function bandWidth(module: ForecastModule): number {
  return Math.round((module.upperBound - module.lowerBound) * 10) / 10;
}

function dueState(date: string | null | undefined): "overdue" | "soon" | "later" | "none" {
  if (!date) return "none";
  const dueAt = new Date(`${date}T00:00:00.000Z`).getTime();
  if (Number.isNaN(dueAt)) return "none";
  const diff = dueAt - Date.now();
  if (diff < 0) return "overdue";
  if (diff <= 14 * 86_400_000) return "soon";
  return "later";
}

function metricHref(metricKey: string | null): string {
  return metricKey
    ? `/admin/benchmarks?metric=${encodeURIComponent(metricKey)}`
    : "/admin/benchmarks";
}

function buildStrategyTabHref(tab: string): string {
  return `/admin/strategy?${new URLSearchParams({ tab }).toString()}`;
}

function scoreInitiative(
  initiative: Awaited<ReturnType<typeof buildStrategyPlanningSnapshot>>["initiatives"][number]
): number {
  const statusScore =
    initiative.status === "active"
      ? 85
      : initiative.status === "watch"
        ? 65
        : initiative.status === "planned"
          ? 55
          : initiative.status === "blocked"
            ? 25
            : 40;
  const priorityScore =
    initiative.priority === "high" ? 85 : initiative.priority === "medium" ? 60 : 35;
  const reviewScore =
    dueState(initiative.reviewDate) === "overdue"
      ? 35
      : dueState(initiative.reviewDate) === "soon"
        ? 55
        : 75;
  const impactScore = initiative.expectedImpact ? 75 : 45;
  return Math.round(
    statusScore * 0.35 + priorityScore * 0.25 + reviewScore * 0.15 + impactScore * 0.25
  );
}

function buildBetSimulatorItems(input: {
  planning: Awaited<ReturnType<typeof buildStrategyPlanningSnapshot>>;
  strategy: Awaited<ReturnType<typeof buildStrategySnapshot>>;
}): AdminIntelligenceItem[] {
  const topBacklog = input.strategy.opportunities.backlog[0] ?? null;

  return input.planning.bets
    .filter(
      (bet) => bet.status === "active" || bet.status === "proposed" || bet.status === "parked"
    )
    .sort((left, right) => {
      const leftScore =
        confidenceWeight(left.confidence) * 10 - (dueState(left.reviewDate) === "overdue" ? 5 : 0);
      const rightScore =
        confidenceWeight(right.confidence) * 10 -
        (dueState(right.reviewDate) === "overdue" ? 5 : 0);
      return rightScore - leftScore || safeDate(right.updatedAt) - safeDate(left.updatedAt);
    })
    .slice(0, 3)
    .map((bet) => {
      const tone: AdminIntelligenceTone =
        bet.status === "parked"
          ? "watch"
          : bet.confidence === "high"
            ? "good"
            : dueState(bet.reviewDate) === "overdue"
              ? "risk"
              : "watch";
      const linkedOpportunity =
        topBacklog && topBacklog.href === metricHref(bet.primaryMetricKey)
          ? topBacklog
          : topBacklog;
      return makeItem({
        id: `strategy-intelligence-bet-${bet.id}`,
        title: `Bet simulator: ${bet.title}`,
        detail: `${bet.status} bet on ${bet.primaryMetricLabel ?? "an unlabeled metric"} with ${bet.confidence} confidence.${bet.upsideNote ? ` Upside: ${bet.upsideNote}.` : ""}${bet.downsideNote ? ` Downside: ${bet.downsideNote}.` : ""}`,
        tone,
        confidence: bet.confidence,
        capabilities: ["strategic bet simulator", "decision support", "portfolio planning"],
        recommendation:
          bet.confidence === "high"
            ? "Model this as a funded bet with explicit downside guardrails and a fixed review date, rather than leaving it as a narrative idea."
            : "Do not increase commitment until the upside or downside is tightened into something measurable against a linked metric.",
        caveat:
          dueState(bet.reviewDate) === "overdue"
            ? "Bet review is overdue, so the current confidence may be stale."
            : linkedOpportunity
              ? `${linkedOpportunity.title} is the strongest current scored move near this bet.`
              : null,
        href: buildStrategyTabHref("Strategy Planning"),
        evidence: [
          makeEvidence("Status", bet.status, buildStrategyTabHref("Strategy Planning")),
          makeEvidence("Confidence", bet.confidence, buildStrategyTabHref("Strategy Planning")),
          makeEvidence(
            "Metric",
            bet.primaryMetricLabel ?? "none",
            metricHref(bet.primaryMetricKey)
          ),
          makeEvidence("Review", bet.reviewDate ?? "none", buildStrategyTabHref("Decision Review")),
        ],
        draft: makeDraft(
          "hypothesis",
          `Simulate ${bet.title.toLowerCase()}`,
          `Turn the ${bet.title.toLowerCase()} bet into a best/base/worst operating plan with explicit review criteria.`,
          buildStrategyTabHref("Strategy Planning"),
          bet.primaryMetricKey,
          bet.upsideNote
        ),
      });
    });
}

function buildScenarioWorkbenchItems(input: {
  strategy: Awaited<ReturnType<typeof buildStrategySnapshot>>;
  forecast: Awaited<ReturnType<typeof buildForecastSnapshot>>;
}): AdminIntelligenceItem[] {
  const topOpportunity = input.strategy.opportunities.backlog[0] ?? null;
  const weakestForecast = [...input.forecast.modules].sort((left, right) => {
    const leftRank = confidenceWeight(left.confidence);
    const rightRank = confidenceWeight(right.confidence);
    return leftRank - rightRank || bandWidth(right) - bandWidth(left);
  })[0];

  const items: AdminIntelligenceItem[] = [];

  if (topOpportunity) {
    items.push(
      makeItem({
        id: "strategy-intelligence-scenario-opportunity",
        title: `Scenario workbench: ${topOpportunity.title}`,
        detail: `${topOpportunity.source} is the top scored opportunity at ${topOpportunity.score}. Inputs: impact ${topOpportunity.scoreInputs.impact}, confidence ${topOpportunity.scoreInputs.confidence}, effort ${topOpportunity.scoreInputs.effort}, time-to-signal ${topOpportunity.scoreInputs.timeToSignal}.`,
        tone: topOpportunity.confidence === "high" ? "good" : "watch",
        confidence: topOpportunity.confidence,
        capabilities: ["scenario planning workbench", "opportunity modeling", "resource planning"],
        recommendation: `Use ${topOpportunity.title.toLowerCase()} as the base-case scenario, then compare a delayed path and a downsized path before funding the next cycle.`,
        caveat:
          topOpportunity.timeToSignal === "slow"
            ? "This scenario has slower feedback, so the best/base/worst range will stay wide longer."
            : null,
        href: topOpportunity.href,
        evidence: [
          makeEvidence("Score", String(topOpportunity.score), topOpportunity.href),
          makeEvidence("Impact", topOpportunity.impact, topOpportunity.href),
          makeEvidence("Effort", topOpportunity.effort, topOpportunity.href),
          makeEvidence("Time to signal", topOpportunity.timeToSignal, topOpportunity.href),
        ],
        draft: makeDraft(
          "brief",
          `Model ${topOpportunity.title.toLowerCase()} scenarios`,
          "Compare best, base, and worst execution paths before committing budget or people.",
          topOpportunity.href
        ),
      })
    );
  }

  if (weakestForecast) {
    items.push(
      makeItem({
        id: `strategy-intelligence-scenario-forecast-${weakestForecast.key}`,
        title: `Scenario workbench: ${weakestForecast.label}`,
        detail: `Current ${weakestForecast.currentValue}, forecast ${weakestForecast.forecastValue}, range ${weakestForecast.lowerBound}-${weakestForecast.upperBound}.`,
        tone: weakestForecast.confidence === "low" ? "risk" : "watch",
        confidence: weakestForecast.confidence,
        capabilities: [
          "scenario planning workbench",
          "forecast confidence decomposition",
          "planning sensitivity",
        ],
        recommendation:
          "Use this forecast as the stress-test anchor for best/base/worst planning because its confidence is currently the weakest or most volatile.",
        caveat:
          weakestForecast.actualVsForecastPct != null
            ? `Recent actual-vs-forecast drift is ${weakestForecast.actualVsForecastPct}%`
            : null,
        href: weakestForecast.href,
        evidence: [
          makeEvidence("Current", String(weakestForecast.currentValue), weakestForecast.href),
          makeEvidence("Forecast", String(weakestForecast.forecastValue), weakestForecast.href),
          makeEvidence("Band width", String(bandWidth(weakestForecast)), weakestForecast.href),
          makeEvidence("Confidence", weakestForecast.confidence, weakestForecast.href),
        ],
        draft: makeDraft(
          "investigation",
          `Stress-test ${weakestForecast.label.toLowerCase()} forecast`,
          "Treat the widest or weakest forecast as a planning sensitivity checkpoint before finalizing strategy assumptions.",
          weakestForecast.href
        ),
      })
    );
  }

  return items;
}

function buildResourceAllocationItems(input: {
  planning: Awaited<ReturnType<typeof buildStrategyPlanningSnapshot>>;
  strategy: Awaited<ReturnType<typeof buildStrategySnapshot>>;
}): AdminIntelligenceItem[] {
  const rankedInitiatives = [...input.planning.initiatives]
    .filter((initiative) => initiative.status !== "completed")
    .map((initiative) => ({ initiative, score: scoreInitiative(initiative) }))
    .sort((left, right) => right.score - left.score)
    .slice(0, 3);

  return rankedInitiatives.map(({ initiative, score }) =>
    makeItem({
      id: `strategy-intelligence-allocation-${initiative.id}`,
      title: `Resource allocation: ${initiative.title}`,
      detail: `${initiative.priority} priority, ${initiative.status} status, allocation score ${score}.${initiative.expectedImpact ? ` Expected impact: ${initiative.expectedImpact}.` : ""}`,
      tone: score >= 72 ? "good" : score < 45 || initiative.status === "blocked" ? "risk" : "watch",
      confidence:
        initiative.priority === "high"
          ? "high"
          : initiative.priority === "medium"
            ? "medium"
            : "low",
      capabilities: [
        "resource allocation optimizer",
        "initiative sequencing",
        "operating allocation",
      ],
      recommendation:
        score >= 72
          ? "Allocate people and review time here before funding lower-confidence strategy work."
          : score < 45 || initiative.status === "blocked"
            ? "Do not allocate more capacity until the block or proof gap is resolved."
            : "Keep this funded, but behind the highest-scoring active initiative.",
      caveat:
        dueState(initiative.reviewDate) === "overdue"
          ? "Review is overdue, so allocation confidence is lower than the headline score suggests."
          : initiative.goalLabel
            ? `Linked to goal: ${initiative.goalLabel}.`
            : "This initiative is not yet explicitly linked to a goal.",
      href: initiative.linkedHref ?? buildStrategyTabHref("Strategy Planning"),
      evidence: [
        makeEvidence(
          "Score",
          String(score),
          initiative.linkedHref ?? buildStrategyTabHref("Strategy Planning")
        ),
        makeEvidence(
          "Priority",
          initiative.priority,
          initiative.linkedHref ?? buildStrategyTabHref("Strategy Planning")
        ),
        makeEvidence(
          "Status",
          initiative.status,
          initiative.linkedHref ?? buildStrategyTabHref("Strategy Planning")
        ),
        makeEvidence(
          "Metric",
          initiative.primaryMetricLabel ?? "none",
          metricHref(initiative.primaryMetricKey)
        ),
      ],
      draft: makeDraft(
        "action",
        `Review allocation for ${initiative.title.toLowerCase()}`,
        "Use the allocation score to decide whether this initiative should be funded, sequenced, or paused.",
        initiative.linkedHref ?? buildStrategyTabHref("Strategy Planning"),
        initiative.primaryMetricKey,
        initiative.expectedImpact
      ),
    })
  );
}

function buildPortfolioItems(input: {
  planning: Awaited<ReturnType<typeof buildStrategyPlanningSnapshot>>;
}): AdminIntelligenceItem[] {
  const candidates = [
    ...input.planning.bets.map((bet) => ({
      kind: "bet" as const,
      id: bet.id,
      title: bet.title,
      score:
        confidenceWeight(bet.confidence) * 20 +
        (bet.status === "active" ? 20 : 0) -
        (dueState(bet.reviewDate) === "overdue" ? 10 : 0),
      tone:
        bet.status === "validated"
          ? ("good" as const)
          : bet.status === "parked" || dueState(bet.reviewDate) === "overdue"
            ? ("watch" as const)
            : ("watch" as const),
      recommendation:
        bet.status === "validated"
          ? "Scale this bet into a formal initiative or rollout plan."
          : bet.status === "parked"
            ? "Either revive with new evidence or leave it parked instead of keeping it in strategic limbo."
            : "Keep, validate fast, or explicitly kill it. Do not let it stay unreviewed.",
      href: buildStrategyTabHref("Strategy Planning"),
      metricKey: bet.primaryMetricKey,
      impact: bet.upsideNote ?? bet.decisionNote ?? bet.hypothesis,
      caveat: bet.downsideNote,
    })),
    ...input.planning.initiatives.map((initiative) => ({
      kind: "initiative" as const,
      id: initiative.id,
      title: initiative.title,
      score: scoreInitiative(initiative),
      tone:
        initiative.status === "completed"
          ? ("good" as const)
          : initiative.status === "blocked"
            ? ("risk" as const)
            : ("watch" as const),
      recommendation:
        initiative.status === "completed"
          ? "Scale or codify what worked instead of leaving the result as one completed line item."
          : initiative.status === "blocked"
            ? "Kill, unblock, or explicitly downscope this initiative before it keeps consuming attention."
            : "Rank this against the rest of the portfolio and avoid carrying too many medium-value items in parallel.",
      href: initiative.linkedHref ?? buildStrategyTabHref("Strategy Planning"),
      metricKey: initiative.primaryMetricKey,
      impact:
        initiative.expectedImpact ?? initiative.description ?? "No explicit expected impact yet.",
      caveat: initiative.goalLabel ? `Linked goal: ${initiative.goalLabel}` : null,
    })),
  ]
    .sort((left, right) => right.score - left.score)
    .slice(0, 3);

  return candidates.map((entry) =>
    makeItem({
      id: `strategy-intelligence-portfolio-${entry.kind}-${entry.id}`,
      title: `Portfolio ${entry.score >= 72 ? "scale" : entry.score < 45 ? "kill" : "review"}: ${entry.title}`,
      detail: `${entry.kind} portfolio score ${entry.score}. ${entry.impact}`,
      tone: entry.tone,
      confidence: entry.score >= 72 ? "high" : entry.score >= 50 ? "medium" : "low",
      capabilities: [
        "portfolio kill/scale recommendations",
        "portfolio hygiene",
        "strategy operating system",
      ],
      recommendation: entry.recommendation,
      caveat: entry.caveat,
      href: entry.href,
      evidence: [
        makeEvidence("Portfolio score", String(entry.score), entry.href),
        makeEvidence("Type", entry.kind, entry.href),
        makeEvidence("Metric", entry.metricKey ?? "none", metricHref(entry.metricKey)),
      ],
      draft: makeDraft(
        entry.score >= 72 ? "action" : "investigation",
        `Review portfolio status for ${entry.title.toLowerCase()}`,
        entry.recommendation,
        entry.href,
        entry.metricKey,
        null
      ),
    })
  );
}

function buildMarketShiftItems(input: {
  planning: Awaited<ReturnType<typeof buildStrategyPlanningSnapshot>>;
  strategy: Awaited<ReturnType<typeof buildStrategySnapshot>>;
  forecast: Awaited<ReturnType<typeof buildForecastSnapshot>>;
}): AdminIntelligenceItem[] {
  const topMove = [...input.planning.competitiveWatch].sort(
    (left, right) =>
      impactWeight(right.impactLevel) - impactWeight(left.impactLevel) ||
      safeDate(right.observedAt) - safeDate(left.observedAt)
  )[0];
  const topArchetype = [...input.strategy.opportunities.archetypeMomentum].sort(
    (left, right) => Math.abs(right.delta) - Math.abs(left.delta)
  )[0];
  const fastestShiftingForecast = [...input.forecast.mixForecasts].sort(
    (left, right) => Math.abs(right.deltaShare) - Math.abs(left.deltaShare)
  )[0];

  const items: AdminIntelligenceItem[] = [];

  if (topMove) {
    items.push(
      makeItem({
        id: `strategy-intelligence-market-move-${topMove.id}`,
        title: `Market shift watch: ${topMove.competitorName}`,
        detail: `${topMove.competitorName} made a ${topMove.moveType} move with ${topMove.impactLevel} expected impact. ${topMove.detail}`,
        tone:
          topMove.impactLevel === "critical" || topMove.impactLevel === "high" ? "risk" : "watch",
        confidence: impactWeight(topMove.impactLevel) >= 3 ? "high" : "medium",
        capabilities: [
          "market-shift early-warning model",
          "competitive response simulator",
          "strategy monitoring",
        ],
        recommendation:
          topMove.recommendedResponse ??
          "Do not wait for lagging KPI movement. Decide now whether this move changes positioning, sequencing, or messaging in the next review window.",
        caveat: topMove.primaryMetricLabel
          ? `This move is most likely to pressure ${topMove.primaryMetricLabel}.`
          : null,
        href: topMove.sourceHref ?? "/admin/strategy?tab=Strategy+Planning",
        evidence: [
          makeEvidence(
            "Impact",
            topMove.impactLevel,
            topMove.sourceHref ?? buildStrategyTabHref("Strategy Planning")
          ),
          makeEvidence(
            "Move type",
            topMove.moveType,
            topMove.sourceHref ?? buildStrategyTabHref("Strategy Planning")
          ),
          makeEvidence(
            "Metric",
            topMove.primaryMetricLabel ?? "none",
            metricHref(topMove.primaryMetricKey)
          ),
          makeEvidence(
            "Observed",
            topMove.observedAt,
            topMove.sourceHref ?? buildStrategyTabHref("Strategy Planning")
          ),
        ],
        draft: makeDraft(
          "brief",
          `Review ${topMove.competitorName.toLowerCase()} market move`,
          "Turn this competitive move into an explicit scenario and response decision instead of leaving it as passive market context.",
          topMove.sourceHref ?? buildStrategyTabHref("Strategy Planning"),
          topMove.primaryMetricKey
        ),
      })
    );
  }

  if (topArchetype) {
    items.push(
      makeItem({
        id: `strategy-intelligence-market-archetype-${topArchetype.archetype}`,
        title: `Demand shift: ${topArchetype.archetype}`,
        detail: `${topArchetype.archetype} moved by ${topArchetype.delta > 0 ? "+" : ""}${topArchetype.delta} submissions in the current window.`,
        tone: Math.abs(topArchetype.delta) >= 8 ? "watch" : "neutral",
        confidence: Math.abs(topArchetype.delta) >= 12 ? "high" : "medium",
        capabilities: ["market-shift early-warning model", "demand sensing", "cohort direction"],
        recommendation:
          "Check whether this shift is a real market move, a channel mix effect, or a temporary acquisition artifact before changing roadmap assumptions.",
        caveat: fastestShiftingForecast
          ? `Forecast mix shift is also strongest around ${fastestShiftingForecast.archetype}.`
          : null,
        href: topArchetype.href,
        evidence: [
          makeEvidence("Current count", String(topArchetype.currentCount), topArchetype.href),
          makeEvidence("Previous count", String(topArchetype.previousCount), topArchetype.href),
          makeEvidence("Delta", String(topArchetype.delta), topArchetype.href),
        ],
        draft: makeDraft(
          "investigation",
          `Validate ${topArchetype.archetype.toLowerCase()} demand shift`,
          "Confirm whether the archetype change reflects a real market shift or only a temporary acquisition mix change.",
          topArchetype.href
        ),
      })
    );
  }

  return items;
}

function buildDependencyItems(input: {
  planning: Awaited<ReturnType<typeof buildStrategyPlanningSnapshot>>;
  strategy: Awaited<ReturnType<typeof buildStrategySnapshot>>;
  forecast: Awaited<ReturnType<typeof buildForecastSnapshot>>;
}): AdminIntelligenceItem[] {
  const riskMetrics = new Set(
    input.strategy.goals
      .filter((goal) => goal.status !== "on-track")
      .map((goal) => goal.metricLabel.toLowerCase())
  );
  const lowConfidenceForecasts = new Set(
    input.forecast.modules
      .filter((module) => module.confidence === "low")
      .map((module) => module.label.toLowerCase())
  );

  const dependencyItems = [...input.planning.dependencies]
    .map((dependency) => {
      const score =
        strengthWeight(dependency.relationshipStrength) * 20 +
        (riskMetrics.has(dependency.childMetricLabel.toLowerCase()) ? 18 : 0) +
        (riskMetrics.has(dependency.parentMetricLabel.toLowerCase()) ? 12 : 0) +
        (lowConfidenceForecasts.has(dependency.childMetricLabel.toLowerCase()) ? 10 : 0);
      return { dependency, score };
    })
    .sort((left, right) => right.score - left.score)
    .slice(0, 3)
    .map(({ dependency, score }) =>
      makeItem({
        id: `strategy-intelligence-dependency-${dependency.id}`,
        title: `Dependency stress: ${dependency.parentMetricLabel} -> ${dependency.childMetricLabel}`,
        detail: `${dependency.relationshipStrength} dependency link with stress score ${score}.${dependency.hypothesisNote ? ` Hypothesis: ${dependency.hypothesisNote}` : ""}`,
        tone: score >= 65 ? "risk" : score >= 45 ? "watch" : "neutral",
        confidence:
          dependency.relationshipStrength === "strong"
            ? "high"
            : dependency.relationshipStrength === "medium"
              ? "medium"
              : "low",
        capabilities: [
          "metric dependency stress testing",
          "strategy sensitivity",
          "linked metric risk",
        ],
        recommendation:
          "Stress-test this dependency before making planning commitments that assume the downstream metric will move independently.",
        caveat: dependency.evidenceNote ?? null,
        href: buildStrategyTabHref("Strategy Planning"),
        evidence: [
          makeEvidence(
            "Strength",
            dependency.relationshipStrength,
            buildStrategyTabHref("Strategy Planning")
          ),
          makeEvidence(
            "Parent",
            dependency.parentMetricLabel,
            metricHref(dependency.parentMetricKey)
          ),
          makeEvidence("Child", dependency.childMetricLabel, metricHref(dependency.childMetricKey)),
        ],
        draft: makeDraft(
          "investigation",
          `Stress-test ${dependency.parentMetricLabel.toLowerCase()} -> ${dependency.childMetricLabel.toLowerCase()}`,
          "Run a planning sensitivity review on this dependency before treating the child metric as independently controllable.",
          buildStrategyTabHref("Strategy Planning"),
          dependency.childMetricKey
        ),
      })
    );

  const confidenceItems = [...input.forecast.modules]
    .sort((left, right) => {
      const leftRank = confidenceWeight(left.confidence);
      const rightRank = confidenceWeight(right.confidence);
      return leftRank - rightRank || bandWidth(right) - bandWidth(left);
    })
    .slice(0, 2)
    .map((module) =>
      makeItem({
        id: `strategy-intelligence-forecast-${module.key}`,
        title: `Forecast confidence: ${module.label}`,
        detail: `${module.confidence} confidence with forecast ${module.forecastValue} and band width ${bandWidth(module)}.`,
        tone: module.confidence === "low" ? "risk" : "watch",
        confidence: module.confidence,
        capabilities: [
          "forecast confidence decomposition",
          "forecast sensitivity",
          "strategy planning",
        ],
        recommendation:
          "Decompose this forecast before using it as a planning anchor. The range is wide enough that one narrative number would hide too much uncertainty.",
        caveat:
          module.actualVsForecastPct != null
            ? `Recent actual-vs-forecast drift: ${module.actualVsForecastPct}%.`
            : null,
        href: module.href,
        evidence: [
          makeEvidence("Current", String(module.currentValue), module.href),
          makeEvidence("Forecast", String(module.forecastValue), module.href),
          makeEvidence("Lower bound", String(module.lowerBound), module.href),
          makeEvidence("Upper bound", String(module.upperBound), module.href),
        ],
        draft: makeDraft(
          "brief",
          `Review ${module.label.toLowerCase()} forecast confidence`,
          "Break this forecast into key assumptions before using it as a leadership planning input.",
          module.href
        ),
      })
    );

  return [...dependencyItems, ...confidenceItems];
}

export async function buildStrategyIntelligenceSnapshot(
  _inputSurface: string | null | undefined,
  inputDays: number
): Promise<AdminIntelligenceSnapshot> {
  const surface = ensureSurface();
  const days = ensureDays(inputDays);

  const [strategy, planning, forecast] = await Promise.all([
    buildStrategySnapshot(days),
    buildStrategyPlanningSnapshot(),
    buildForecastSnapshot(days),
  ]);

  const betItems = buildBetSimulatorItems({ planning, strategy });
  const scenarioItems = buildScenarioWorkbenchItems({ strategy, forecast });
  const allocationItems = buildResourceAllocationItems({ planning, strategy });
  const portfolioItems = buildPortfolioItems({ planning });
  const marketItems = buildMarketShiftItems({ planning, strategy, forecast });
  const dependencyItems = buildDependencyItems({ planning, strategy, forecast });

  return {
    generatedAt: new Date().toISOString(),
    days,
    surface,
    title: "Strategy Intelligence",
    headline: `${betItems.length + scenarioItems.length + allocationItems.length + portfolioItems.length + marketItems.length + dependencyItems.length} strategy-intelligence decisions are ready for the current planning window.`,
    summary:
      "This layer turns strategy planning into an explicit operating system for bets, scenarios, allocation, portfolio pruning, market-shift detection, dependency stress, and forecast confidence. It is still zero-cost and grounded on your own operating data.",
    prompts: [
      { label: "Best bet", query: "Which strategic bet is strongest right now?" },
      { label: "Main scenario", query: "Which scenario should leadership plan around first?" },
      { label: "Allocation", query: "Where should strategy allocate attention and capacity now?" },
      { label: "Weak forecast", query: "Which forecast is too weak to anchor planning safely?" },
    ],
    sections: filterSections([
      makeSection(
        "bets",
        "Strategic Bet Simulation",
        "High-leverage bets translated into explicit operating decisions instead of staying as narrative hypotheses.",
        betItems
      ),
      makeSection(
        "scenarios",
        "Scenario Workbench",
        "Best/base/worst planning anchors for the strongest opportunity and weakest forecast.",
        scenarioItems
      ),
      makeSection(
        "allocation",
        "Resource Allocation",
        "Active initiatives ranked for funding, sequencing, or delay using explicit operating signals.",
        allocationItems
      ),
      makeSection(
        "portfolio",
        "Portfolio Kill / Scale",
        "Portfolio hygiene recommendations so the strategy stack does not drift into unowned medium-value work.",
        portfolioItems
      ),
      makeSection(
        "market",
        "Market Shift Warnings",
        "Early-warning signals from competitor moves and changing demand patterns before lagging metrics fully move.",
        marketItems
      ),
      makeSection(
        "dependencies",
        "Dependency & Forecast Stress",
        "Linked-metric stress testing and forecast confidence decomposition for planning safety.",
        dependencyItems
      ),
    ]),
  };
}
