import { buildAnomalySnapshot } from "@/lib/admin/alerts";
import { buildCreativeIntelligenceSnapshot } from "@/lib/admin/creative-intelligence";
type CreativeIntelligenceSnapshot = Awaited<ReturnType<typeof buildCreativeIntelligenceSnapshot>>;
import type { ConversionLeakDebuggerSnapshot } from "@/lib/admin/conversion-leak-debugger";
import { buildConversionLeakDebuggerSnapshot } from "@/lib/admin/conversion-leak-debugger";
import { buildDriftDetectorSnapshot } from "@/lib/admin/drift-detector";
import { buildExperimentRegistrySnapshot } from "@/lib/admin/experiment-registry";
import type { ForecastSnapshot } from "@/lib/admin/forecasting";
import { buildForecastSnapshot } from "@/lib/admin/forecasting";
import { buildGrowthControlTowerSnapshot } from "@/lib/admin/growth-control-tower";
type GrowthControlTowerSnapshot = Awaited<ReturnType<typeof buildGrowthControlTowerSnapshot>>;
import { buildIncidentCorrelationSnapshot } from "@/lib/admin/incident-correlation";
import { buildAllAdminKnowledgeArtifacts } from "@/lib/admin/knowledge";
import { excerpt, semanticScore } from "@/lib/admin/next-level";
import { buildAdminOsSnapshot } from "@/lib/admin/os";
import type { ProductAdoptionSnapshot } from "@/lib/admin/product-adoption";
import { buildProductAdoptionSnapshot } from "@/lib/admin/product-adoption";
import type { ProductExperienceHealthSnapshot } from "@/lib/admin/product-experience-health";
import { buildProductExperienceHealthSnapshot } from "@/lib/admin/product-experience-health";
import { buildProductIssueRadarSnapshot } from "@/lib/admin/product-issue-radar";
import type { ProductIssueRadarSnapshot } from "@/lib/admin/product-issue-types";
import type { RecoveryPlaybookSnapshot } from "@/lib/admin/recovery-playbook";
import { buildRecoveryPlaybookSnapshot } from "@/lib/admin/recovery-playbook";
import type { ResearchIntelligenceSnapshot } from "@/lib/admin/research-intelligence";
import { buildResearchIntelligenceSnapshot } from "@/lib/admin/research-intelligence";
import type { StrategyPlanningSnapshot } from "@/lib/admin/strategy-planning";
import { buildStrategyPlanningSnapshot } from "@/lib/admin/strategy-planning";
import { buildStrategySnapshot } from "@/lib/admin/strategy";
type StrategySnapshot = Awaited<ReturnType<typeof buildStrategySnapshot>>;
import type { ValueRealizationSnapshot } from "@/lib/admin/value-realization";
import { buildValueRealizationSnapshot } from "@/lib/admin/value-realization";
import { buildWorkspaceMaturitySnapshot } from "@/lib/admin/workspace-maturity";
import type {
  AdminCommandAnswer,
  AdminIntelligenceConfidence,
  AdminIntelligenceDraft,
  AdminIntelligenceEvidence,
  AdminIntelligenceItem,
  AdminIntelligencePrompt,
  AdminIntelligenceSection,
  AdminIntelligenceSnapshot,
  AdminIntelligenceSurface,
  AdminIntelligenceTone,
} from "@/lib/admin/intelligence-types";
import {
  PRODUCT_ADOPTION_HREF,
  SURFACES,
  combineEvidence,
  ensureDays,
  ensureSurface,
  filterSections,
  makeDraft,
  makeEvidence,
  makeItem,
  makeSection,
  scoreAnswerConfidence,
  summarizeItems,
  surfacePrompts,
} from "@/lib/admin/intelligence/helpers";

// Surface-building helpers (ensureSurface, makeItem, makeSection, …) live in
// ./intelligence/helpers.ts. This file owns the per-surface snapshot builders
// and the public entry points (buildAdminIntelligenceSnapshot, etc.).

function buildCommandCenterSnapshot(
  days: number,
  os: Awaited<ReturnType<typeof buildAdminOsSnapshot>>,
  maturity: Awaited<ReturnType<typeof buildWorkspaceMaturitySnapshot>>
): AdminIntelligenceSnapshot {
  const driverItems = (os.leadingIndicators ?? []).slice(0, 4).map((indicator) =>
    makeItem({
      id: `leading-${indicator.metricKey}-${indicator.leadingMetricKey}`,
      title: `${indicator.leadingMetricLabel} is moving ${indicator.signalState} on ${indicator.metricLabel}`,
      detail: indicator.detail,
      tone:
        indicator.signalState === "negative"
          ? "risk"
          : indicator.signalState === "positive"
            ? "good"
            : "watch",
      confidence: indicator.signalState === "watch" ? "medium" : "high",
      capabilities: ["driver decomposition", "leading indicator", "next-best action"],
      recommendation: `Check ${indicator.leadingMetricLabel} before acting on the lagging KPI itself.`,
      href: indicator.href,
      evidence: [
        makeEvidence("Leading metric", indicator.leadingMetricValueLabel, indicator.href),
        makeEvidence("Lagging metric", indicator.metricLabel, indicator.href),
        makeEvidence("Signal", indicator.signalState, indicator.href),
      ],
      draft: makeDraft(
        "investigation",
        `Validate leading signal for ${indicator.metricLabel}`,
        indicator.detail,
        indicator.href
      ),
    })
  );

  const actionItems = (os.actionBoard?.items ?? []).slice(0, 4).map((item) =>
    makeItem({
      id: `action-${item.id}`,
      title: item.title,
      detail: item.description || "Action item without additional detail.",
      tone:
        item.status === "blocked" || item.priority === "high"
          ? "risk"
          : item.status === "done"
            ? "good"
            : "watch",
      confidence: item.metricKey ? "high" : "medium",
      capabilities: ["next best action", "execution loop", "decision copilot"],
      recommendation:
        item.status === "blocked"
          ? "Unblock owner, scope, or dependency before creating more parallel work."
          : item.status === "done"
            ? "Capture the measured outcome so the decision memory stays reusable."
            : "Keep this tied to a metric and review date so follow-through stays auditable.",
      caveat: item.metricKey ? null : "This action is not linked to a canonical metric yet.",
      href: item.linkedHref || "/admin",
      evidence: [
        makeEvidence("Priority", item.priority, item.linkedHref || "/admin"),
        makeEvidence("Status", item.status, item.linkedHref || "/admin"),
        makeEvidence("Metric", item.metricKey || "Not linked", item.linkedHref || "/admin"),
      ],
      draft: makeDraft(
        "action",
        item.title,
        item.expectedImpact ||
          item.description ||
          "Add expected KPI movement before the next review.",
        item.linkedHref || "/admin"
      ),
    })
  );

  const decisionItems = (os.decisionBoard ?? []).slice(0, 4).map((item) =>
    makeItem({
      id: `decision-${item.id}`,
      title: item.title,
      detail: item.expectedImpact || item.measuredOutcome || `${item.entryType} is ${item.status}.`,
      tone:
        item.reviewDate && item.reviewDate < new Date().toISOString().slice(0, 10)
          ? "risk"
          : item.measuredOutcome
            ? "good"
            : "watch",
      confidence: item.measuredOutcome ? "high" : "medium",
      capabilities: ["decision memory", "review pack", "operating narrative"],
      recommendation: item.measuredOutcome
        ? "Use this as a validated reference point before repeating the same change pattern."
        : "Tie a measured outcome to the review date so this decision can be reused instead of rediscovered.",
      caveat: item.measuredOutcome ? null : "Measured outcome is still missing.",
      href: item.href,
      evidence: [
        makeEvidence("Type", item.entryType, item.href),
        makeEvidence("Status", item.status, item.href),
        makeEvidence("Metric", item.primaryMetricKey || "Unlinked", item.href),
      ],
      draft: makeDraft(
        "brief",
        `Review decision: ${item.title}`,
        item.measuredOutcome ||
          item.expectedImpact ||
          "Capture the observed effect and next decision.",
        item.href
      ),
    })
  );

  return {
    generatedAt: new Date().toISOString(),
    days,
    surface: "command-center",
    title: "Admin Intelligence",
    headline: `${os.actionBoard?.summary?.totalOpen ?? 0} open actions, ${(os.watchlist ?? []).length} watchlist items, and a workspace maturity score of ${maturity.overallScore ?? 0}.`,
    summary:
      "This layer turns the command center into a grounded copilot: what moved first, what requires follow-through, and which decisions need to remain part of operating memory.",
    prompts: surfacePrompts("command-center"),
    sections: filterSections([
      makeSection(
        "drivers",
        "Driver Decomposition",
        "Early movement worth checking before lagging metrics harden into a weekly surprise.",
        driverItems
      ),
      makeSection(
        "actions",
        "Next Best Actions",
        "Execution items sorted into a leadership-ready follow-through view.",
        actionItems
      ),
      makeSection(
        "memory",
        "Decision Memory",
        "Recent decision records that should stay reusable, not disappear into chat history.",
        decisionItems
      ),
    ]),
  };
}

function buildProductSnapshot(
  days: number,
  issueRadar: ProductIssueRadarSnapshot,
  experience: ProductExperienceHealthSnapshot,
  adoption: ProductAdoptionSnapshot,
  research: ResearchIntelligenceSnapshot
): AdminIntelligenceSnapshot {
  const issueItems = (issueRadar.priorityIssues ?? []).slice(0, 4).map((issue) =>
    makeItem({
      id: issue.id,
      title: issue.title,
      detail: issue.summary,
      tone:
        issue.severity === "critical" ? "risk" : issue.severity === "high" ? "watch" : "neutral",
      confidence: issue.severity === "critical" ? "high" : "medium",
      capabilities: ["issue radar", "journey anomaly", "friction clustering"],
      recommendation: issue.recommendation,
      href: issue.href,
      evidence: [
        makeEvidence("Category", issue.category, issue.href),
        makeEvidence("Impact", String(issue.impactScore ?? 0), issue.href),
      ],
      draft: makeDraft(
        "hypothesis",
        `Fix product issue: ${issue.title}`,
        issue.recommendation,
        issue.href
      ),
    })
  );

  const adoptionItems = (adoption.launches ?? []).slice(0, 4).map((launch) =>
    makeItem({
      id: `launch-${launch.id}`,
      title: launch.title,
      detail: launch.adoptionDetail,
      tone: launch.adoptionTone === "neutral" ? "watch" : launch.adoptionTone,
      confidence: launch.confidence,
      capabilities: ["rollout risk", "blast radius", "release attribution"],
      recommendation:
        launch.adoptionState === "validated"
          ? "Use this launch as a positive reference pattern for future releases."
          : "Review metric posture and blindspots before calling this launch healthy.",
      caveat:
        launch.blindspotCount > 0
          ? `${launch.blindspotCount} blindspots still reduce confidence.`
          : null,
      href: PRODUCT_ADOPTION_HREF,
      evidence: [
        makeEvidence(
          "Metric",
          launch.metric?.label || launch.metric?.key || "Unknown",
          "/admin/product-kpis"
        ),
        makeEvidence("State", launch.adoptionState, "/admin/product-kpis"),
      ],
      draft: makeDraft(
        "investigation",
        `Review launch: ${launch.title}`,
        launch.adoptionDetail,
        "/admin/product-kpis"
      ),
    })
  );

  const healthItems = (experience.areas ?? []).slice(0, 3).map((area) =>
    makeItem({
      id: `area-${area.key}`,
      title: `${area.label} experience is ${area.tone}`,
      detail: area.summary,
      tone: area.tone,
      confidence: area.reviewState === "overdue" ? "medium" : "high",
      capabilities: ["experience scorecard", "operating health", "next move"],
      recommendation: area.nextMove,
      caveat: area.riskSummary,
      href: area.href,
      evidence: [
        makeEvidence("Primary metric", area.primaryMetricLabel, area.href),
        makeEvidence("Value", area.primaryMetricValue, area.href),
      ],
      draft: makeDraft("action", `Improve ${area.label.toLowerCase()}`, area.nextMove, area.href),
    })
  );

  const researchItems = (research.contradictions ?? []).slice(0, 2).map((item, index) =>
    makeItem({
      id: `research-contradiction-${index}`,
      title: item.title || "Behavior / research contradiction",
      detail: item.detail || "Research and behavior are pulling in different directions.",
      tone: "watch",
      confidence: "medium",
      capabilities: ["contradiction detector", "feedback-to-hypothesis", "research synthesis"],
      recommendation:
        item.recommendation || "Turn this contradiction into a testable product hypothesis.",
      href: item.href || "/admin/research",
      evidence: [makeEvidence("Surface", "Research intelligence", item.href || "/admin/research")],
      draft: makeDraft(
        "hypothesis",
        item.title || "Investigate contradiction",
        item.recommendation || item.detail || "Review research and behavior side by side.",
        item.href || "/admin/research"
      ),
    })
  );

  return {
    generatedAt: new Date().toISOString(),
    days,
    surface: "product",
    title: "Product Intelligence",
    headline: `${issueRadar.summary?.criticalQuestions ?? 0} critical question issues, ${adoption.summary?.attention ?? 0} launches needing attention, and ${experience.summary?.risk ?? 0} risky experience areas.`,
    summary:
      "This product layer ties friction, release adoption, experience-area health, and research contradictions into one grounded decision surface.",
    prompts: surfacePrompts("product"),
    sections: filterSections([
      makeSection(
        "issues",
        "Issue Radar",
        "The strongest product friction signals in the current window.",
        issueItems
      ),
      makeSection(
        "adoption",
        "Release Adoption",
        "Launches that need validation, containment, or follow-through.",
        adoptionItems
      ),
      makeSection(
        "health",
        "Experience Health",
        "Experience-area operating posture, not just isolated metrics.",
        healthItems
      ),
      makeSection(
        "research",
        "Research Hypotheses",
        "Signals from contradictions and research themes worth converting into tests.",
        researchItems
      ),
    ]),
  };
}

function buildGrowthSnapshot(
  days: number,
  control: GrowthControlTowerSnapshot,
  leak: ConversionLeakDebuggerSnapshot,
  creative: CreativeIntelligenceSnapshot,
  value: ValueRealizationSnapshot,
  recovery: RecoveryPlaybookSnapshot
): AdminIntelligenceSnapshot {
  const priorityItems = (control.priorities ?? []).slice(0, 4).map((priority, index) =>
    makeItem({
      id: `priority-${index}`,
      title: priority.title,
      detail: priority.detail,
      tone: priority.tone,
      confidence: priority.tone === "watch" ? "medium" : "high",
      capabilities: ["growth control tower", "next-best action", "driver summary"],
      recommendation: priority.detail,
      href: priority.href,
      evidence: [makeEvidence("Surface", "Growth control tower", priority.href)],
      draft: makeDraft("action", priority.title, priority.detail, priority.href),
    })
  );

  const leakItems = (leak.priorities ?? []).slice(0, 3).map((item, index) =>
    makeItem({
      id: `leak-${index}`,
      title: `${item.dimension}: ${item.label}`,
      detail: item.explanation,
      tone: item.leakRate >= 25 ? "risk" : "watch",
      confidence: item.confidence,
      capabilities: ["conversion leak debugger", "funnel diagnosis", "channel quality"],
      recommendation: "Inspect the leaking segment before scaling traffic into it.",
      href: item.href,
      evidence: [
        makeEvidence("Stage", item.leakStageLabel, item.href),
        makeEvidence("Leak rate", `${item.leakRate}%`, item.href),
      ],
      draft: makeDraft(
        "investigation",
        `Investigate ${item.dimension} leak: ${item.label}`,
        item.explanation,
        item.href
      ),
    })
  );

  const creativeItems = (creative.creatives ?? []).slice(0, 3).map((item, index) =>
    makeItem({
      id: `creative-${index}`,
      title: `${item.content} (${item.source})`,
      detail: `${item.theme} | ${item.starts} starts | ${item.paidRate}% paid`,
      tone: item.attention === "scale" ? "good" : item.attention === "fix" ? "risk" : "watch",
      confidence: item.starts >= 25 ? "high" : "medium",
      capabilities: ["creative intelligence", "message fit", "quality scoring"],
      recommendation:
        item.attention === "scale"
          ? "Clone this message into adjacent campaigns and monitor fatigue."
          : item.attention === "fix"
            ? "Fix promise mismatch before spending more distribution here."
            : "Keep this creative under watch while you gather more signal.",
      href: "/admin/growth",
      evidence: [
        makeEvidence("Theme", item.theme, "/admin/growth"),
        makeEvidence("Quality", String(item.qualityScore), "/admin/growth"),
      ],
      draft: makeDraft(
        "action",
        `Review creative: ${item.content}`,
        `Evaluate the ${item.theme} message cluster.`,
        "/admin/growth"
      ),
    })
  );

  const valueItems = (value.signals ?? []).slice(0, 2).map((item, index) =>
    makeItem({
      id: `value-${index}`,
      title: `Value signal: ${item.signal}`,
      detail: `${item.strongestOutcome} leads with ${item.strongestLift}pp lift on a ${item.audience}-user audience.`,
      tone: "good",
      confidence: item.audience >= 20 ? "high" : "medium",
      capabilities: ["value realization", "retention driver", "monetization insight"],
      recommendation: "Use this signal to prioritize quality cohorts, not just volume.",
      href: "/admin/growth",
      evidence: [
        makeEvidence("Audience", String(item.audience), "/admin/growth"),
        makeEvidence("Strongest lift", `${item.strongestLift}pp`, "/admin/growth"),
      ],
      draft: makeDraft(
        "action",
        `Use value signal: ${item.signal}`,
        `Turn the ${item.signal} signal into a tracked growth action.`,
        "/admin/growth"
      ),
    })
  );

  const recoveryItems = (recovery.playbookGroups ?? [])
    .flatMap((group) => group.items ?? [])
    .slice(0, 2)
    .map((item, index) =>
      makeItem({
        id: `recovery-${index}`,
        title: item.title,
        detail: item.intervention || item.summary,
        tone: item.attention === "risk" ? "risk" : item.attention === "scale" ? "good" : "watch",
        confidence: item.priority === "high" ? "high" : "medium",
        capabilities: ["recovery playbook", "churn rescue", "owner suggestion"],
        recommendation: item.intervention,
        href: item.linkedHref,
        evidence: [makeEvidence("Owner", item.ownerRole, item.linkedHref)],
        draft: makeDraft(
          "action",
          item.actionTitle || item.title,
          item.intervention || item.summary,
          item.linkedHref
        ),
      })
    );

  return {
    generatedAt: new Date().toISOString(),
    days,
    surface: "growth",
    title: "Growth Intelligence",
    headline: `${control.summary?.scaleChannels ?? 0} scale-ready channels, ${(control.priorities ?? []).length} growth priorities, and ${(control.trustWarnings ?? []).length} trust warnings in the current window.`,
    summary:
      "This growth layer combines control-tower priorities, leak diagnosis, message performance, recovery plays, and value signals in one explainable operating view.",
    prompts: surfacePrompts("growth"),
    sections: filterSections([
      makeSection(
        "priorities",
        "Control Tower Priorities",
        "The clearest growth moves to scale, fix, or monitor now.",
        priorityItems
      ),
      makeSection(
        "leaks",
        "Leak Diagnosis",
        "The strongest current leak candidates across source, campaign, segment, geography, or device.",
        leakItems
      ),
      makeSection(
        "creative",
        "Creative And Message",
        "Message-level quality and fit signals, not just topline acquisition volume.",
        creativeItems
      ),
      makeSection(
        "value",
        "Value And Recovery",
        "Signals tied to downstream value realization and recovery opportunities.",
        [...valueItems, ...recoveryItems].slice(0, 4)
      ),
    ]),
  };
}

function buildStrategySurfaceSnapshot(
  days: number,
  strategy: StrategySnapshot,
  planning: StrategyPlanningSnapshot,
  forecast: ForecastSnapshot
): AdminIntelligenceSnapshot {
  const opportunityItems = (strategy.opportunities?.backlog ?? []).slice(0, 4).map((item) =>
    makeItem({
      id: `opportunity-${item.title}`,
      title: item.title,
      detail: item.detail || item.impact,
      tone: item.confidence === "high" ? "good" : "watch",
      confidence: item.confidence,
      capabilities: ["opportunity scoring", "resource allocation", "strategy ranking"],
      recommendation: `Review this opportunity against ${item.impact} before lower-scoring work absorbs attention.`,
      href: item.href,
      evidence: [
        makeEvidence("Score", String(item.score), item.href),
        makeEvidence("Impact", item.impact, item.href),
        makeEvidence("Time to signal", item.timeToSignal, item.href),
      ],
      draft: makeDraft("brief", `Review opportunity: ${item.title}`, item.impact, item.href),
    })
  );

  const betItems = [
    ...(planning.bets ?? []).slice(0, 2).map((bet) =>
      makeItem({
        id: `bet-${bet.id}`,
        title: bet.title,
        detail: bet.hypothesis,
        tone: bet.status === "validated" ? "good" : bet.status === "invalidated" ? "risk" : "watch",
        confidence: bet.confidence,
        capabilities: ["strategic bet simulator", "scenario workbench", "decision memory"],
        recommendation:
          bet.status === "validated"
            ? "Use this as an evidence-backed strategic pattern."
            : "Stress test the upside, downside, and review date before broadening commitment.",
        caveat: bet.downsideNote || null,
        href: "/admin/strategy?tab=Strategy%20Planning",
        evidence: [
          makeEvidence("Status", bet.status, "/admin/strategy?tab=Strategy%20Planning"),
          makeEvidence(
            "Metric",
            bet.primaryMetricLabel || "Unlinked",
            "/admin/strategy?tab=Strategy%20Planning"
          ),
        ],
        draft: makeDraft(
          "brief",
          `Review strategic bet: ${bet.title}`,
          bet.upsideNote || bet.hypothesis,
          "/admin/strategy?tab=Strategy%20Planning"
        ),
      })
    ),
    ...(planning.competitiveWatch ?? []).slice(0, 2).map((move) =>
      makeItem({
        id: `competitive-${move.id}`,
        title: `${move.competitorName}: ${move.title}`,
        detail: move.detail,
        tone: move.impactLevel === "critical" || move.impactLevel === "high" ? "risk" : "watch",
        confidence: move.sourceHref ? "medium" : "low",
        capabilities: ["competitive response", "market watch", "scenario planning"],
        recommendation:
          move.recommendedResponse ||
          "Define an explicit response instead of leaving this as ambient awareness.",
        caveat: move.sourceHref ? null : "Source evidence is missing for this competitive signal.",
        href: "/admin/strategy?tab=Strategy%20Planning",
        evidence: [
          makeEvidence("Impact", move.impactLevel, "/admin/strategy?tab=Strategy%20Planning"),
          makeEvidence(
            "Metric",
            move.primaryMetricLabel || "Unlinked",
            "/admin/strategy?tab=Strategy%20Planning"
          ),
        ],
        draft: makeDraft(
          "brief",
          `Competitive response: ${move.competitorName}`,
          move.recommendedResponse || move.detail,
          "/admin/strategy?tab=Strategy%20Planning"
        ),
      })
    ),
  ];

  const forecastItems = (forecast.modules ?? []).slice(0, 4).map((module) =>
    makeItem({
      id: `forecast-${module.key}`,
      title: `${module.label} forecast is ${module.trend}`,
      detail: module.description,
      tone:
        module.confidence === "low" || module.deltaPct < -5
          ? "risk"
          : module.confidence === "high" && module.deltaPct > 2
            ? "good"
            : "watch",
      confidence: module.confidence,
      capabilities: ["forecast confidence", "dependency stress test", "scenario planning"],
      recommendation:
        module.confidence === "low"
          ? "Treat this as directional until the variance drivers are narrowed."
          : "Use this forecast with explicit assumptions and keep the lower bound visible in planning.",
      caveat:
        module.actualVsForecastPct == null
          ? "No actual-vs-forecast readback is available yet."
          : `Actual vs forecast gap: ${module.actualVsForecastPct}%`,
      href: module.href,
      evidence: [
        makeEvidence("Current", String(module.currentValue), module.href),
        makeEvidence("Forecast", String(module.forecastValue), module.href),
        makeEvidence("Band", `${module.lowerBound} to ${module.upperBound}`, module.href),
      ],
      draft: makeDraft(
        "brief",
        `Scenario review: ${module.label}`,
        `Stress test the ${module.label} forecast before locking resource decisions.`,
        module.href
      ),
    })
  );

  return {
    generatedAt: new Date().toISOString(),
    days,
    surface: "strategy",
    title: "Strategy Intelligence",
    headline: `${(strategy.opportunities?.backlog ?? []).length} ranked opportunities, ${(planning.bets ?? []).length} tracked bets, and ${(forecast.modules ?? []).filter((module) => module.confidence === "low").length} low-confidence forecasts.`,
    summary:
      "This strategy layer keeps ranked opportunities, strategic bets, and forecast confidence in one explainable decision surface.",
    prompts: surfacePrompts("strategy"),
    sections: filterSections([
      makeSection(
        "opportunities",
        "Portfolio Ranking",
        "Opportunities ranked with explicit impact, confidence, effort, and time-to-signal inputs.",
        opportunityItems
      ),
      makeSection(
        "bets",
        "Bets And Market Signals",
        "Strategic bets and competitive moves that should shape the next leadership review.",
        betItems
      ),
      makeSection(
        "forecast",
        "Forecast Pressure",
        "Forecasts kept visible with confidence and downside, rather than just point estimates.",
        forecastItems
      ),
    ]),
  };
}

function buildHealthSurfaceSnapshot(
  days: number,
  anomalies: Awaited<ReturnType<typeof buildAnomalySnapshot>>,
  incidents: Awaited<ReturnType<typeof buildIncidentCorrelationSnapshot>>,
  drift: Awaited<ReturnType<typeof buildDriftDetectorSnapshot>>,
  maturity: Awaited<ReturnType<typeof buildWorkspaceMaturitySnapshot>>
): AdminIntelligenceSnapshot {
  const anomalyItems = (anomalies.items ?? []).slice(0, 3).map((item) =>
    makeItem({
      id: `anomaly-${item.id}`,
      title: item.title,
      detail: item.detail,
      tone: item.severity === "risk" ? "risk" : "watch",
      confidence: item.matchedRules?.length > 0 ? "high" : "medium",
      capabilities: ["anomaly center", "root-cause assistant", "alert policy"],
      recommendation:
        item.severity === "risk"
          ? "Review the linked service, trust, or funnel surface before this turns into a downstream business incident."
          : "Validate whether this signal is isolated noise or a leading operational regression.",
      caveat: item.ownerEmail ? null : "No owner is attached to this anomaly yet.",
      href: item.href,
      evidence: [
        makeEvidence("Category", item.category, item.href),
        makeEvidence("Rules", String(item.matchedRules?.length ?? 0), item.href),
      ],
      draft: makeDraft(
        "investigation",
        `Investigate anomaly: ${item.title}`,
        item.detail,
        item.href
      ),
    })
  );

  const incidentItems = (incidents.entries ?? []).slice(0, 3).map((entry) =>
    makeItem({
      id: `incident-${entry.id}`,
      title: entry.title,
      detail: entry.currentSignal,
      tone: entry.severity === "risk" ? "risk" : "watch",
      confidence: entry.confidence,
      capabilities: ["incident correlation", "root-cause graph", "triage copilot"],
      recommendation: entry.recommendation,
      caveat:
        (entry.suspectedDrivers ?? []).length === 0
          ? "No correlated drivers were found for this incident yet."
          : null,
      href: "/admin/health",
      evidence: [
        makeEvidence("Category", entry.category, "/admin/health"),
        makeEvidence("Drivers", String((entry.suspectedDrivers ?? []).length), "/admin/health"),
      ],
      draft: makeDraft(
        "investigation",
        `Triage incident: ${entry.title}`,
        entry.recommendation,
        "/admin/health"
      ),
    })
  );

  const driftItems = (drift.findings ?? []).slice(0, 3).map((finding) =>
    makeItem({
      id: `drift-${finding.id}`,
      title: finding.title,
      detail: finding.detail,
      tone: finding.severity === "risk" ? "risk" : "watch",
      confidence: finding.affectedCount >= 3 ? "high" : "medium",
      capabilities: ["drift detector", "config-change risk", "policy drift"],
      recommendation: finding.recommendation,
      caveat:
        finding.signals?.length > 0 ? `Signals: ${finding.signals.slice(0, 3).join(" | ")}` : null,
      href: finding.href,
      evidence: [
        makeEvidence("Category", finding.categoryLabel, finding.href),
        makeEvidence("Affected", String(finding.affectedCount), finding.href),
      ],
      draft: makeDraft(
        "investigation",
        `Resolve drift: ${finding.title}`,
        finding.recommendation,
        finding.href
      ),
    })
  );

  const weakestDimension = [...(maturity.dimensions ?? [])].sort(
    (left, right) => left.score - right.score
  )[0];
  if (weakestDimension) {
    driftItems.push(
      makeItem({
        id: `maturity-${weakestDimension.key}`,
        title: `${weakestDimension.label} maturity is the current weak point`,
        detail: weakestDimension.detail,
        tone:
          weakestDimension.tone === "weak"
            ? "risk"
            : weakestDimension.tone === "medium"
              ? "watch"
              : "good",
        confidence: "medium",
        capabilities: ["workspace maturity", "policy drift", "governance coverage"],
        recommendation: weakestDimension.nextStep,
        caveat: weakestDimension.gaps?.[0] ?? null,
        href: "/admin/tools",
        evidence: [makeEvidence("Score", String(weakestDimension.score), "/admin/tools")],
        draft: makeDraft(
          "action",
          `Improve ${weakestDimension.label.toLowerCase()}`,
          weakestDimension.nextStep,
          "/admin/tools"
        ),
      })
    );
  }

  return {
    generatedAt: new Date().toISOString(),
    days,
    surface: "health",
    title: "Health Intelligence",
    headline: `${anomalies.summary?.total ?? 0} anomalies, ${incidents.summary?.highConfidence ?? 0} high-confidence incident links, and ${drift.summary?.categoriesAtRisk ?? 0} drift categories at risk.`,
    summary:
      "This health layer ties anomalies, likely drivers, drift, and governance weakness into one root-cause-first operational surface.",
    prompts: surfacePrompts("health"),
    sections: filterSections([
      makeSection(
        "anomalies",
        "Anomaly Pressure",
        "Active operational signals that need explanation before they harden into outages or bad decisions.",
        anomalyItems
      ),
      makeSection(
        "incidents",
        "Root-Cause Candidates",
        "Correlated drivers ranked ahead of broader investigation work.",
        incidentItems
      ),
      makeSection(
        "drift",
        "Drift And Governance",
        "Configuration, taxonomy, experiment, and governance drift that can quietly degrade decision quality.",
        driftItems
      ),
    ]),
  };
}

function experimentInterferenceItems(
  registry: Awaited<ReturnType<typeof buildExperimentRegistrySnapshot>>
): AdminIntelligenceItem[] {
  const experiments = (registry.experiments ?? []).filter((item) =>
    ["active", "paused"].includes(item.status)
  );
  const items: AdminIntelligenceItem[] = [];

  for (const [leftIndex, left] of experiments.entries()) {
    for (const right of experiments.slice(leftIndex + 1)) {
      const overlap = new Set<string>([
        ...(left.guardrail_metric_keys ?? []),
        left.primary_metric_key,
      ]);
      const shared = [right.primary_metric_key, ...(right.guardrail_metric_keys ?? [])].filter(
        (key: string | null) => key && overlap.has(key)
      );
      if (shared.length === 0) continue;

      items.push(
        makeItem({
          id: `interference-${left.id}-${right.id}`,
          title: `Possible interference: ${left.name} vs ${right.name}`,
          detail: `Shared metric coverage on ${shared.join(", ")} can contaminate readouts if both tests keep running without isolation.`,
          tone:
            shared.includes(left.primary_metric_key) && shared.includes(right.primary_metric_key)
              ? "risk"
              : "watch",
          confidence: shared.length >= 2 ? "high" : "medium",
          capabilities: ["interference detector", "guardrail collision", "decision copilot"],
          recommendation:
            "Separate scope, stagger rollout windows, or explicitly mark the readout as contaminated before calling a winner.",
          href: "/admin/experiments",
          evidence: [
            makeEvidence("Shared metrics", shared.join(", "), "/admin/experiments"),
            makeEvidence("Statuses", `${left.status} / ${right.status}`, "/admin/experiments"),
          ],
          draft: makeDraft(
            "brief",
            `Review interference: ${left.name} vs ${right.name}`,
            "Clarify scope overlap before trusting either experiment decision.",
            "/admin/experiments"
          ),
        })
      );
    }
  }

  return items.slice(0, 3);
}

function buildExperimentSurfaceSnapshot(
  days: number,
  registry: Awaited<ReturnType<typeof buildExperimentRegistrySnapshot>>
): AdminIntelligenceSnapshot {
  const readyItems = (registry.scorecard?.readyQueue ?? []).slice(0, 3).map((item) =>
    makeItem({
      id: `ready-${item.id}`,
      title: item.name,
      detail: item.readout?.summary || item.decisionDetail,
      tone: item.decisionTone === "good" ? "good" : item.decisionTone === "risk" ? "risk" : "watch",
      confidence: item.confidence,
      capabilities: ["winner confidence", "decision review", "experiment design"],
      recommendation:
        item.readout?.winnerDetail ||
        "Review the readout with guardrails and measured outcome before shipping.",
      caveat:
        item.overdueReviewCount > 0 ? `${item.overdueReviewCount} review items are overdue.` : null,
      href: "/admin/experiments",
      evidence: [
        makeEvidence("Metric", item.primary_metric_label, "/admin/experiments"),
        makeEvidence("Decision", item.decisionLabel, "/admin/experiments"),
        makeEvidence("Confidence", `${item.confidenceScore}%`, "/admin/experiments"),
      ],
      draft: makeDraft(
        "brief",
        `Decision review: ${item.name}`,
        item.readout?.winnerDetail || item.decisionDetail,
        "/admin/experiments"
      ),
    })
  );

  const riskItems = [
    ...(registry.scorecard?.riskQueue ?? []).slice(0, 3).map((item) =>
      makeItem({
        id: `risk-${item.id}`,
        title: item.name,
        detail: item.decisionDetail,
        tone: "risk",
        confidence: item.confidence === "low" ? "medium" : item.confidence,
        capabilities: ["guardrail risk", "blast radius", "triage"],
        recommendation:
          item.guardrailRiskCount > 0
            ? "Inspect breached guardrails before making any ship or stop decision."
            : "Resolve blindspots and weak instrumentation before trusting the result.",
        caveat:
          item.blindspotCount > 0 ? `${item.blindspotCount} blindspots still reduce rigor.` : null,
        href: "/admin/experiments",
        evidence: [
          makeEvidence("Guardrail risk", String(item.guardrailRiskCount), "/admin/experiments"),
          makeEvidence("Blindspots", String(item.blindspotCount), "/admin/experiments"),
        ],
        draft: makeDraft(
          "investigation",
          `Resolve experiment risk: ${item.name}`,
          item.decisionDetail,
          "/admin/experiments"
        ),
      })
    ),
    ...experimentInterferenceItems(registry),
  ].slice(0, 4);

  const weakSignalItems = (registry.scorecard?.weakSignalQueue ?? []).slice(0, 4).map((item) =>
    makeItem({
      id: `weak-${item.id}`,
      title: item.name,
      detail: item.confidenceDetail,
      tone: item.confidence === "low" ? "risk" : "watch",
      confidence: item.confidence,
      capabilities: ["weak-signal detection", "design draft", "instrumentation coverage"],
      recommendation: item.readout?.isReady
        ? "Rigor is still weak despite a readout. Tighten documentation before deciding."
        : "Add instrumentation, sample, or clearer guardrails before calling this experiment usable.",
      caveat:
        item.readout?.notes ||
        (item.openReviewCount > 0 ? `${item.openReviewCount} review items open.` : null),
      href: "/admin/experiments",
      evidence: [
        makeEvidence("Confidence", `${item.confidenceScore}%`, "/admin/experiments"),
        makeEvidence("Readout", item.readout?.methodLabel || "Not set", "/admin/experiments"),
      ],
      draft: makeDraft(
        "experiment",
        `Tighten experiment design: ${item.name}`,
        item.confidenceDetail,
        "/admin/experiments"
      ),
    })
  );

  return {
    generatedAt: new Date().toISOString(),
    days,
    surface: "experiments",
    title: "Experiment Intelligence",
    headline: `${registry.summary?.readyForDecision ?? 0} ready for decision, ${registry.summary?.guardrailRisks ?? 0} under guardrail risk, and ${registry.scorecard?.weakSignalQueue?.length ?? 0} weak-signal experiments.`,
    summary:
      "This experiment layer turns the registry into a decision surface: which tests are ready, risky, or too weak to trust, plus where interference may be corrupting readouts.",
    prompts: surfacePrompts("experiments"),
    sections: filterSections([
      makeSection(
        "ready",
        "Decision Ready",
        "Experiments with usable signal and enough rigor to support a real call.",
        readyItems
      ),
      makeSection(
        "risk",
        "Risk And Interference",
        "Guardrail failures and overlapping tests that can invalidate otherwise clean-looking readouts.",
        riskItems
      ),
      makeSection(
        "design",
        "Design Pressure",
        "Weak-signal experiments that still need instrumentation, sample, or clearer design.",
        weakSignalItems
      ),
    ]),
  };
}

function buildResearchSurfaceSnapshot(
  days: number,
  research: Awaited<ReturnType<typeof buildResearchIntelligenceSnapshot>>
): AdminIntelligenceSnapshot {
  const signalItems = (research.signals ?? []).slice(0, 3).map((item) =>
    makeItem({
      id: `research-signal-${item.title}`,
      title: item.title,
      detail: item.detail,
      tone:
        item.severity === "critical"
          ? "risk"
          : item.severity === "warning"
            ? "watch"
            : item.severity === "positive"
              ? "good"
              : "neutral",
      confidence: item.severity === "critical" ? "high" : "medium",
      capabilities: ["sentiment intensity", "research synthesis", "theme monitoring"],
      recommendation:
        item.severity === "critical"
          ? "Treat this as a strong emotional signal in the current response set and trace it to the exact questions or cohorts driving it."
          : "Keep this signal attached to the current research package so it can be validated against behavior and future responses.",
      href: item.href,
      evidence: [makeEvidence("Severity", item.severity, item.href)],
      draft: makeDraft(
        "investigation",
        `Validate research signal: ${item.title}`,
        item.detail,
        item.href
      ),
    })
  );

  const painItems = (research.painQuestions ?? []).slice(0, 3).map((question) =>
    makeItem({
      id: `research-pain-${question.questionId}`,
      title: `High-intensity sentiment: ${question.questionLabel}`,
      detail: `${question.painMentions} pain mentions across ${question.responseCount} responses with severity score ${question.severityScore}.`,
      tone:
        question.severityScore >= 70 ? "risk" : question.severityScore >= 50 ? "watch" : "neutral",
      confidence:
        question.responseCount >= 25 ? "high" : question.responseCount >= 10 ? "medium" : "low",
      capabilities: ["sentiment intensity", "pain severity", "question pressure"],
      recommendation:
        "Review wording, downstream friction, and affected archetypes before this emotional pressure distorts answer quality or completion.",
      caveat: question.sampleExcerpt,
      href: "/admin/research",
      evidence: [
        makeEvidence("Pain mentions", String(question.painMentions), "/admin/research"),
        makeEvidence("Responses", String(question.responseCount), "/admin/research"),
        makeEvidence("Severity", String(question.severityScore), "/admin/research"),
      ],
      draft: makeDraft(
        "investigation",
        `Review high-intensity research question: ${question.questionLabel}`,
        `This question is carrying elevated pain intensity in the current response window.`,
        "/admin/research"
      ),
    })
  );

  const contradictionItems = (research.contradictions ?? []).slice(0, 2).map((item) =>
    makeItem({
      id: `research-contradiction-${item.key}`,
      title: item.title,
      detail: item.detail,
      tone: item.severity === "critical" ? "risk" : "watch",
      confidence: item.coverage >= 15 ? "high" : "medium",
      capabilities: ["sentiment intensity", "contradiction detection", "research hygiene"],
      recommendation: item.recommendation,
      href: item.href,
      evidence: [
        makeEvidence("Coverage", `${item.coverage}%`, item.href),
        makeEvidence("Affected", String(item.affectedSubmissions), item.href),
      ],
      draft: makeDraft(
        "hypothesis",
        `Resolve contradiction: ${item.title}`,
        item.recommendation,
        item.href
      ),
    })
  );

  return {
    generatedAt: new Date().toISOString(),
    days,
    surface: "research",
    title: "Research Intelligence",
    headline: `${research.summary?.signals ?? 0} active signals, ${research.summary?.painQuestions ?? 0} pain-heavy questions, and ${research.summary?.contradictions ?? 0} contradiction patterns are shaping the current response window.`,
    summary:
      "This research layer surfaces the most emotionally intense response clusters, so product and growth can react to what users are actually feeling, not just what they selected.",
    prompts: surfacePrompts("research"),
    sections: filterSections([
      makeSection(
        "signals",
        "Signal Intensity",
        "High-importance research signals worth promoting into tracked work.",
        signalItems
      ),
      makeSection(
        "pain",
        "Pain And Sentiment Load",
        "Questions where free-text responses are carrying the strongest emotional intensity.",
        painItems
      ),
      makeSection(
        "contradictions",
        "Contradictions",
        "High-tension patterns where emotionally loaded answers likely reflect wording or expectation mismatches.",
        contradictionItems
      ),
    ]),
  };
}

export function parseAdminIntelligenceSurface(
  value: string | null | undefined
): AdminIntelligenceSurface {
  return ensureSurface(value);
}

export async function buildAdminIntelligenceSnapshot(
  inputSurface: string | null | undefined,
  inputDays: number,
  adminEmail?: string
): Promise<AdminIntelligenceSnapshot> {
  const surface = ensureSurface(inputSurface);
  const days = ensureDays(inputDays);

  if (surface === "product") {
    const [issueRadar, experience, adoption, research] = await Promise.all([
      buildProductIssueRadarSnapshot(days),
      buildProductExperienceHealthSnapshot(days),
      buildProductAdoptionSnapshot(days),
      buildResearchIntelligenceSnapshot(days),
    ]);
    return buildProductSnapshot(days, issueRadar, experience, adoption, research);
  }

  if (surface === "growth") {
    if (!adminEmail) throw new Error("Admin email is required for growth intelligence.");
    const [control, leak, creative, value, recovery] = await Promise.all([
      buildGrowthControlTowerSnapshot(days),
      buildConversionLeakDebuggerSnapshot(days, adminEmail),
      buildCreativeIntelligenceSnapshot(days),
      buildValueRealizationSnapshot(days),
      buildRecoveryPlaybookSnapshot(days),
    ]);
    return buildGrowthSnapshot(days, control, leak, creative, value, recovery);
  }

  if (surface === "strategy") {
    const [strategy, planning, forecast] = await Promise.all([
      buildStrategySnapshot(days),
      buildStrategyPlanningSnapshot(),
      buildForecastSnapshot(days),
    ]);
    return buildStrategySurfaceSnapshot(days, strategy, planning, forecast);
  }

  if (surface === "health") {
    if (!adminEmail) throw new Error("Admin email is required for health intelligence.");
    const [anomalies, incidents, drift, maturity] = await Promise.all([
      buildAnomalySnapshot(days),
      buildIncidentCorrelationSnapshot(days),
      buildDriftDetectorSnapshot(days, adminEmail),
      buildWorkspaceMaturitySnapshot(),
    ]);
    return buildHealthSurfaceSnapshot(days, anomalies, incidents, drift, maturity);
  }

  if (surface === "experiments") {
    if (!adminEmail) throw new Error("Admin email is required for experiment intelligence.");
    const registry = await buildExperimentRegistrySnapshot(adminEmail);
    return buildExperimentSurfaceSnapshot(days, registry);
  }

  if (surface === "research") {
    const research = await buildResearchIntelligenceSnapshot(days);
    return buildResearchSurfaceSnapshot(days, research);
  }

  const [os, maturity] = await Promise.all([
    buildAdminOsSnapshot(days),
    buildWorkspaceMaturitySnapshot(),
  ]);
  return buildCommandCenterSnapshot(days, os, maturity);
}

export interface AdminIntelligenceSearchEntry {
  surface: AdminIntelligenceSurface;
  sectionKey: string;
  sectionTitle: string;
  item: AdminIntelligenceItem;
}

export async function buildAllAdminIntelligenceEntries(
  inputDays: number,
  adminEmail?: string
): Promise<AdminIntelligenceSearchEntry[]> {
  const days = ensureDays(inputDays);
  const eligibleSurfaces = SURFACES.filter(
    (surface) => adminEmail || (surface !== "health" && surface !== "experiments")
  );
  const snapshots = await Promise.all(
    eligibleSurfaces.map((surface) => buildAdminIntelligenceSnapshot(surface, days, adminEmail))
  );

  return snapshots.flatMap((snapshot) =>
    snapshot.sections.flatMap((section) =>
      section.items.map((item) => ({
        surface: snapshot.surface,
        sectionKey: section.key,
        sectionTitle: section.title,
        item,
      }))
    )
  );
}

function summarizeKnowledgeArtifact(
  artifact: Awaited<ReturnType<typeof buildAllAdminKnowledgeArtifacts>>[number]
): string {
  return `${artifact.title}. ${artifact.summary}`;
}

export async function buildAdminCommandAnswer(
  query: string,
  inputSurface: string | null | undefined,
  inputDays: number,
  adminEmail?: string
): Promise<AdminCommandAnswer> {
  const surface = ensureSurface(inputSurface);
  const normalizedQuery = query.trim();
  const [snapshot, allEntries, knowledgeArtifacts] = await Promise.all([
    buildAdminIntelligenceSnapshot(surface, inputDays, adminEmail),
    buildAllAdminIntelligenceEntries(inputDays, adminEmail),
    adminEmail
      ? buildAllAdminKnowledgeArtifacts(inputDays, adminEmail, normalizedQuery)
      : Promise.resolve([]),
  ]);

  const rankedItems = allEntries
    .map((entry) => {
      const text = `${entry.sectionTitle} ${entry.item.title} ${entry.item.detail} ${entry.item.recommendation} ${entry.item.caveat ?? ""}`;
      const keywords = [
        ...entry.item.capabilities,
        ...entry.item.evidence.map((evidence) => evidence.value),
        entry.surface,
        entry.sectionTitle,
      ];
      const surfaceBonus = entry.surface === surface ? 8 : surface === "command-center" ? 4 : 0;
      const score = semanticScore(normalizedQuery, text, keywords) + surfaceBonus;
      return { entry, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, 6);

  const rankedArtifacts = knowledgeArtifacts
    .map((artifact) => {
      const text = [
        artifact.title,
        artifact.summary,
        ...artifact.evidence.map((evidence) => evidence.value),
      ]
        .filter(Boolean)
        .join(" ");
      const score = semanticScore(normalizedQuery, text, [artifact.type, "knowledge"]);
      return { artifact, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, 3);

  const supportingItems = [
    ...rankedItems.slice(0, 2).map(({ entry }) => ({
      title: entry.item.title,
      capability: entry.item.capabilities[0] || "intelligence",
      href: entry.item.href,
    })),
    ...rankedArtifacts.slice(0, 2).map(({ artifact }) => ({
      title: artifact.title,
      capability: artifact.type,
      href: artifact.href,
    })),
  ].slice(0, 4);

  const answerItems = rankedItems.slice(0, 2).map(({ entry }) =>
    makeItem({
      ...entry.item,
      detail: excerpt(entry.item.detail),
    })
  );
  const topArtifact = rankedArtifacts[0]?.artifact ?? null;

  const answer =
    answerItems.length > 0
      ? `${summarizeItems(answerItems)}${
          topArtifact ? ` Related memory: ${summarizeKnowledgeArtifact(topArtifact)}` : ""
        }`
      : topArtifact
        ? `Knowledge memory: ${summarizeKnowledgeArtifact(topArtifact)}`
        : "No grounded signal matched this query in the current intelligence snapshot.";

  const citations = [...combineEvidence(answerItems), ...(topArtifact?.evidence ?? [])].slice(0, 8);

  return {
    generatedAt: new Date().toISOString(),
    surface,
    query: normalizedQuery,
    answer,
    confidence: scoreAnswerConfidence(
      Math.max(rankedItems[0]?.score ?? 0, rankedArtifacts[0]?.score ?? 0)
    ),
    supportingItems,
    citations,
    suggestedPrompts: snapshot.prompts
      .filter((prompt) => prompt.query !== normalizedQuery)
      .slice(0, 3),
  };
}
