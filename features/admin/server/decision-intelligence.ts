import { buildAdminSignalGraphSnapshot } from "@features/admin/server/graph";
import type { AdminSignalGraphPath } from "@features/admin/server/graph-types";
import type {
  AdminIntelligenceDraft,
  AdminIntelligenceEvidence,
  AdminIntelligenceItem,
  AdminIntelligenceSection,
  AdminIntelligenceSnapshot,
  AdminIntelligenceSurface,
  AdminIntelligenceTone,
} from "@features/admin/server/intelligence-types";
import { buildAdminOsSnapshot, buildLeadCockpitSnapshot } from "@features/admin/server/os";
import type {
  AdminActionItem,
  AdminDecisionReviewItem,
  AdminOsBrief,
  LeadCockpitRole,
  LeadCockpitSnapshot,
} from "@features/admin/server/os-types";
import {
  buildAdminSimulationSnapshot,
  parseAdminSimulationSurface,
} from "@features/admin/server/simulations";
import type {
  AdminSimulationScenario,
  AdminSimulationSurface,
} from "@features/admin/server/simulation-types";

type DecisionSurface = Extract<
  AdminIntelligenceSurface,
  "command-center" | "product" | "growth" | "strategy" | "health"
>;

const SURFACES: DecisionSurface[] = ["command-center", "product", "growth", "strategy", "health"];

function ensureSurface(value: string | null | undefined): DecisionSurface {
  return SURFACES.includes(value as DecisionSurface)
    ? (value as DecisionSurface)
    : "command-center";
}

function ensureDays(value: number): number {
  if (!Number.isFinite(value)) return 30;
  return Math.min(Math.max(Math.round(value), 7), 365);
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

function mapSurfaceToRole(surface: DecisionSurface): LeadCockpitRole | null {
  if (surface === "strategy") return "strategy";
  if (surface === "product") return "product";
  if (surface === "growth") return "growth";
  if (surface === "health") return "tech";
  return null;
}

function mapSurfaceToSimulation(surface: DecisionSurface): AdminSimulationSurface {
  if (surface === "growth") return "growth";
  if (surface === "strategy") return "strategy";
  return "command-center";
}

function mapSurfaceToGraph(surface: DecisionSurface): "command-center" | "strategy" | "health" {
  if (surface === "strategy") return "strategy";
  if (surface === "health") return "health";
  return "command-center";
}

function surfaceLabel(surface: DecisionSurface): string {
  if (surface === "product") return "Product";
  if (surface === "growth") return "Growth";
  if (surface === "strategy") return "Strategy";
  if (surface === "health") return "Tech";
  return "Command";
}

function surfacePrompts(surface: DecisionSurface) {
  if (surface === "product") {
    return [
      {
        label: "Likely cause",
        query: "What is the most likely cause of product friction right now?",
      },
      { label: "Decision", query: "What product decision should happen next?" },
      { label: "Scenario", query: "Which product move has the best trade-off right now?" },
      { label: "Next action", query: "What should product do first today?" },
    ];
  }
  if (surface === "growth") {
    return [
      { label: "Leak cause", query: "What is the most likely cause of growth leakage right now?" },
      { label: "Decision", query: "What growth decision should happen next?" },
      { label: "Scenario", query: "Which growth move has the strongest upside?" },
      { label: "Next action", query: "What should growth do first today?" },
    ];
  }
  if (surface === "strategy") {
    return [
      { label: "Likely cause", query: "What is most likely driving strategy pressure right now?" },
      { label: "Decision", query: "What strategic decision should happen next?" },
      { label: "Scenario", query: "Which scenario should leadership plan around?" },
      { label: "Next action", query: "What should strategy do first today?" },
    ];
  }
  if (surface === "health") {
    return [
      { label: "Root cause", query: "What is the likely root cause of tech risk right now?" },
      { label: "Decision", query: "What technical decision should happen next?" },
      { label: "Scenario", query: "Which operating scenario needs preparation?" },
      { label: "Next action", query: "What should tech do first today?" },
    ];
  }
  return [
    { label: "Likely cause", query: "What is the most likely cause of pressure right now?" },
    { label: "Decision", query: "What leadership decision should happen next?" },
    { label: "Scenario", query: "Which scenario should leadership plan around?" },
    { label: "Next action", query: "What should leadership do first today?" },
  ];
}

function roleDecisionRecommendation(role: LeadCockpitRole, title: string): string {
  if (role === "strategy") {
    return `Decide whether ${title.toLowerCase()} should be funded, sequenced, or explicitly deferred in this review window.`;
  }
  if (role === "product") {
    return `Decide whether ${title.toLowerCase()} needs containment, a product fix, or an experiment before the next release cycle.`;
  }
  if (role === "growth") {
    return `Decide whether ${title.toLowerCase()} should be scaled, repaired, or deprioritized before more traffic is routed through it.`;
  }
  return `Decide whether ${title.toLowerCase()} needs containment, deeper instrumentation, or a direct ownership change before it compounds.`;
}

function actionRecommendation(item: AdminActionItem): string {
  if (item.status === "blocked") {
    return "Resolve the blocker first. Creating parallel work before the dependency clears will only widen execution noise.";
  }
  if (item.status === "done") {
    return "Capture the measured outcome so this action becomes reusable evidence instead of a closed checkbox.";
  }
  if (item.reviewDate) {
    return "Keep the review date intact and decide the next move against observed metric movement, not intuition alone.";
  }
  if (item.metricKey) {
    return "Tie this to a review date so the metric link turns into a real decision checkpoint.";
  }
  return "Link this action to a metric or explicit outcome before the next operating review.";
}

function scenarioRecommendation(scenario: AdminSimulationScenario): string {
  const topOutcome = scenario.outcomes[0];
  if (!topOutcome) {
    return "Use the scenario assumptions to decide whether this move is strong enough to fund in the next operating window.";
  }
  return `${topOutcome.label} currently sits at ${topOutcome.current}; base case is ${topOutcome.base}, best case is ${topOutcome.best}, and worst case is ${topOutcome.worst}.`;
}

function decisionTone(item: AdminDecisionReviewItem): AdminIntelligenceTone {
  if (item.reviewDate && item.reviewDate < new Date().toISOString().slice(0, 10)) return "risk";
  if (item.measuredOutcome) return "good";
  return "watch";
}

function buildCausalItems(input: {
  surface: DecisionSurface;
  leadingIndicators:
    | Array<{
        metricKey: string;
        metricLabel: string;
        leadingMetricKey: string;
        leadingMetricLabel: string;
        leadingMetricValueLabel: string;
        signalState: "positive" | "watch" | "negative";
        detail: string;
        href: string;
      }>
    | undefined;
  priorities: AdminOsBrief[];
  graphPaths: AdminSignalGraphPath[];
}): AdminIntelligenceItem[] {
  const items = (input.leadingIndicators ?? []).slice(0, 3).map((indicator) =>
    makeItem({
      id: `decision-causal-${indicator.metricKey}-${indicator.leadingMetricKey}`,
      title: `Likely cause: ${indicator.leadingMetricLabel} is shaping ${indicator.metricLabel}`,
      detail: indicator.detail,
      tone:
        indicator.signalState === "negative"
          ? "risk"
          : indicator.signalState === "positive"
            ? "good"
            : "watch",
      confidence: indicator.signalState === "watch" ? "medium" : "high",
      capabilities: ["causal inference studio", "driver decomposition", "decision support"],
      recommendation: `Validate ${indicator.leadingMetricLabel} before changing plans on ${indicator.metricLabel}.`,
      caveat:
        input.graphPaths.find((path) => path.title.includes(indicator.metricLabel))?.summary ??
        null,
      href: indicator.href,
      evidence: [
        makeEvidence("Leading metric", indicator.leadingMetricValueLabel, indicator.href),
        makeEvidence("Signal", indicator.signalState, indicator.href),
        makeEvidence("Lagging metric", indicator.metricLabel, indicator.href),
      ],
      draft: makeDraft(
        "investigation",
        `Validate driver for ${indicator.metricLabel}`,
        indicator.detail,
        indicator.href,
        indicator.metricKey
      ),
    })
  );

  if (items.length < 3) {
    for (const path of input.graphPaths.slice(0, 3 - items.length)) {
      items.push(
        makeItem({
          id: `decision-graph-${path.id}`,
          title: `Likely chain: ${path.title}`,
          detail: path.summary,
          tone: "watch",
          confidence: path.confidence,
          capabilities: ["causal inference studio", "root-cause graph", "evidence trail"],
          recommendation:
            "Use this path to validate the cause chain before escalating into broader reactive work.",
          href: path.href,
          evidence: [
            makeEvidence("Path nodes", String(path.nodeIds.length), path.href),
            makeEvidence("Confidence", path.confidence, path.href),
          ],
          draft: makeDraft("brief", `Review cause chain: ${path.title}`, path.summary, path.href),
        })
      );
    }
  }

  if (items.length === 0) {
    const fallback = input.priorities[0];
    if (fallback) {
      items.push(
        makeItem({
          id: "decision-causal-fallback",
          title: `Likely cause pressure: ${fallback.title}`,
          detail: fallback.detail,
          tone: fallback.tone,
          confidence: "medium",
          capabilities: ["causal inference studio", "priority analysis"],
          recommendation:
            "Use this live priority as the starting hypothesis until cleaner leading or graph evidence is available.",
          href: fallback.href,
          draft: makeDraft(
            "investigation",
            `Validate pressure: ${fallback.title}`,
            fallback.detail,
            fallback.href
          ),
        })
      );
    }
  }

  return items.slice(0, 3);
}

function buildCommandDecisionItems(input: {
  decisions: AdminDecisionReviewItem[];
  actions: AdminActionItem[];
}): AdminIntelligenceItem[] {
  const overdueDecisions = input.decisions.filter(
    (item) => item.reviewDate && item.reviewDate < new Date().toISOString().slice(0, 10)
  );
  const priority = [...overdueDecisions, ...input.decisions].slice(0, 2);
  const blockedAction = input.actions.find((item) => item.status === "blocked");
  const items = priority.map((item) =>
    makeItem({
      id: `decision-copilot-${item.id}`,
      title: `Decision review: ${item.title}`,
      detail:
        item.expectedImpact ||
        item.measuredOutcome ||
        `${item.entryType} is ${item.status}${item.primaryMetricKey ? ` on ${item.primaryMetricKey}` : ""}.`,
      tone: decisionTone(item),
      confidence: item.measuredOutcome ? "high" : "medium",
      capabilities: ["decision copilot", "decision memory", "review discipline"],
      recommendation: item.measuredOutcome
        ? "Use the measured outcome to decide whether this pattern should be repeated or retired."
        : item.reviewDate && item.reviewDate < new Date().toISOString().slice(0, 10)
          ? "This review is late. Decide now whether to validate, revise, or roll back the underlying change."
          : "Complete the review with an observed effect so this decision becomes reusable evidence.",
      caveat: item.reviewDate
        ? `Review date ${item.reviewDate}.`
        : "No review date is attached yet.",
      href: item.href,
      evidence: [
        makeEvidence("Type", item.entryType, item.href),
        makeEvidence("Status", item.status, item.href),
        makeEvidence("Metric", item.primaryMetricKey || "Unlinked", item.href),
      ],
      draft: makeDraft(
        "action",
        `Complete decision review: ${item.title}`,
        item.expectedImpact ||
          item.measuredOutcome ||
          "Record the observed effect and the next decision.",
        item.href,
        item.primaryMetricKey
      ),
    })
  );

  if (blockedAction) {
    items.push(
      makeItem({
        id: `decision-copilot-action-${blockedAction.id}`,
        title: `Decision blocker: ${blockedAction.title}`,
        detail:
          blockedAction.description || "A blocked action is slowing the current decision loop.",
        tone: "risk",
        confidence: blockedAction.metricKey ? "high" : "medium",
        capabilities: ["decision copilot", "execution unblock", "operating review"],
        recommendation:
          "Resolve the blocker or formally de-scope the action before more work accumulates around it.",
        caveat:
          blockedAction.dueDate != null
            ? `Due ${blockedAction.dueDate}.`
            : "No due date is attached.",
        href: blockedAction.linkedHref || "/admin",
        evidence: [
          makeEvidence("Priority", blockedAction.priority, blockedAction.linkedHref || "/admin"),
          makeEvidence(
            "Metric",
            blockedAction.metricKey || "Unlinked",
            blockedAction.linkedHref || "/admin"
          ),
          makeEvidence("Status", blockedAction.status, blockedAction.linkedHref || "/admin"),
        ],
        draft: makeDraft(
          "action",
          `Unblock action: ${blockedAction.title}`,
          blockedAction.description || "Resolve the blocking dependency before the next review.",
          blockedAction.linkedHref || "/admin",
          blockedAction.metricKey,
          blockedAction.expectedImpact
        ),
      })
    );
  }

  return items.slice(0, 3);
}

function buildRoleDecisionItems(input: {
  role: LeadCockpitRole;
  priorities: AdminOsBrief[];
  decisions: AdminDecisionReviewItem[];
}): AdminIntelligenceItem[] {
  const items = input.priorities.slice(0, 2).map((priority, index) =>
    makeItem({
      id: `role-decision-${input.role}-${index}`,
      title: priority.title,
      detail: priority.detail,
      tone: priority.tone,
      confidence: priority.tone === "risk" ? "high" : "medium",
      capabilities: ["decision copilot", "priority framing", "operating judgment"],
      recommendation: roleDecisionRecommendation(input.role, priority.title),
      href: priority.href,
      draft: makeDraft(
        "action",
        `Decide on ${priority.title.toLowerCase()}`,
        roleDecisionRecommendation(input.role, priority.title),
        priority.href
      ),
    })
  );

  const recentDecision = input.decisions[0];
  if (recentDecision) {
    items.push(
      makeItem({
        id: `role-decision-memory-${recentDecision.id}`,
        title: `Recent decision memory: ${recentDecision.title}`,
        detail:
          recentDecision.measuredOutcome ||
          recentDecision.expectedImpact ||
          `${recentDecision.entryType} is ${recentDecision.status}.`,
        tone: decisionTone(recentDecision),
        confidence: recentDecision.measuredOutcome ? "high" : "medium",
        capabilities: ["decision copilot", "decision memory", "review carryover"],
        recommendation: recentDecision.measuredOutcome
          ? "Reuse the measured effect before making an equivalent decision from scratch."
          : "This decision still needs a measured effect before it should shape more work.",
        href: recentDecision.href,
        evidence: [
          makeEvidence("Type", recentDecision.entryType, recentDecision.href),
          makeEvidence("Status", recentDecision.status, recentDecision.href),
        ],
        draft: makeDraft(
          "brief",
          `Review prior decision: ${recentDecision.title}`,
          recentDecision.measuredOutcome ||
            recentDecision.expectedImpact ||
            "Capture the observed effect.",
          recentDecision.href
        ),
      })
    );
  }

  return items.slice(0, 3);
}

function buildSimulationItems(
  scenarios: AdminSimulationScenario[],
  surface: DecisionSurface
): AdminIntelligenceItem[] {
  return scenarios.slice(0, 3).map((scenario) =>
    makeItem({
      id: `decision-sim-${scenario.id}`,
      title: scenario.title,
      detail: scenario.summary,
      tone: scenario.tone,
      confidence: scenario.confidence,
      capabilities: ["recommendation simulator", "scenario planning", "best-base-worst"],
      recommendation: scenarioRecommendation(scenario),
      caveat:
        scenario.assumptions.length > 0
          ? `Assumptions: ${scenario.assumptions.slice(0, 2).join(" | ")}`
          : null,
      href: scenario.href,
      evidence: scenario.outcomes
        .slice(0, 2)
        .flatMap((outcome) => [
          makeEvidence(`${outcome.label} current`, outcome.current, scenario.href),
          makeEvidence(`${outcome.label} base`, outcome.base, scenario.href),
          makeEvidence(`${outcome.label} best`, outcome.best, scenario.href),
        ]),
      draft: makeDraft(
        surface === "strategy" ? "brief" : "action",
        `Simulate move: ${scenario.title}`,
        scenarioRecommendation(scenario),
        scenario.href
      ),
    })
  );
}

function buildNextActionItems(input: {
  actions: AdminActionItem[];
  priorities: AdminOsBrief[];
  surface: DecisionSurface;
}): AdminIntelligenceItem[] {
  const openActions = input.actions.filter((item) => item.status !== "done").slice(0, 3);
  const items = openActions.map((item) =>
    makeItem({
      id: `decision-next-action-${item.id}`,
      title: item.title,
      detail: item.description || "Tracked action without additional context.",
      tone: item.status === "blocked" ? "risk" : item.priority === "high" ? "watch" : "neutral",
      confidence: item.metricKey ? "high" : "medium",
      capabilities: ["next-best-action engine", "execution loop", "decision follow-through"],
      recommendation: actionRecommendation(item),
      caveat: item.expectedImpact || (item.reviewDate ? `Review date ${item.reviewDate}.` : null),
      href: item.linkedHref || "/admin",
      evidence: [
        makeEvidence("Status", item.status, item.linkedHref || "/admin"),
        makeEvidence("Priority", item.priority, item.linkedHref || "/admin"),
        makeEvidence("Metric", item.metricKey || "Unlinked", item.linkedHref || "/admin"),
      ],
      draft: makeDraft(
        "action",
        item.title,
        actionRecommendation(item),
        item.linkedHref || "/admin",
        item.metricKey,
        item.expectedImpact
      ),
    })
  );

  if (items.length < 3) {
    for (const priority of input.priorities.slice(0, 3 - items.length)) {
      items.push(
        makeItem({
          id: `decision-next-priority-${priority.title}`,
          title: priority.title,
          detail: priority.detail,
          tone: priority.tone,
          confidence: priority.tone === "risk" ? "high" : "medium",
          capabilities: ["next-best-action engine", "priority queue", "follow-through"],
          recommendation:
            input.surface === "growth"
              ? "Turn this into a concrete traffic, channel, or message decision before the next acquisition window."
              : input.surface === "product"
                ? "Turn this into a concrete product, release, or instrumentation action before the next review."
                : input.surface === "health"
                  ? "Assign ownership and containment before this operating risk compounds."
                  : "Convert this into an owned action with an explicit review date.",
          href: priority.href,
          draft: makeDraft(
            "action",
            `Act on ${priority.title.toLowerCase()}`,
            priority.detail,
            priority.href
          ),
        })
      );
    }
  }

  return items.slice(0, 3);
}

function buildCommandSnapshot(input: {
  days: number;
  os: Awaited<ReturnType<typeof buildAdminOsSnapshot>>;
  graph: Awaited<ReturnType<typeof buildAdminSignalGraphSnapshot>>;
  simulations: Awaited<ReturnType<typeof buildAdminSimulationSnapshot>>;
}): AdminIntelligenceSnapshot {
  const causalItems = buildCausalItems({
    surface: "command-center",
    leadingIndicators: input.os.leadingIndicators,
    priorities: input.os.watchlist,
    graphPaths: input.graph.focusPaths,
  });
  const decisionItems = buildCommandDecisionItems({
    decisions: input.os.decisionBoard,
    actions: input.os.actionBoard.items,
  });
  const simulationItems = buildSimulationItems(input.simulations.scenarios, "command-center");
  const nextActionItems = buildNextActionItems({
    actions: input.os.actionBoard.items,
    priorities: input.os.watchlist,
    surface: "command-center",
  });

  return {
    generatedAt: new Date().toISOString(),
    days: input.days,
    surface: "command-center",
    title: "Decision Intelligence",
    headline: `${causalItems.length} causal signals, ${decisionItems.length} decision candidates, and ${nextActionItems.length} follow-through moves are ready for leadership review.`,
    summary:
      "This layer turns the admin OS into a decision system: likely causes, the next judgment call, scenario ranges, and the single best follow-through move.",
    prompts: surfacePrompts("command-center"),
    sections: filterSections([
      makeSection(
        "causal",
        "Causal Inference Studio",
        "Likely drivers ranked before leadership changes strategy or execution.",
        causalItems
      ),
      makeSection(
        "copilot",
        "Decision Copilot",
        "Live judgment calls that should be closed with evidence instead of left as ambient pressure.",
        decisionItems
      ),
      makeSection(
        "simulator",
        "Recommendation Simulator",
        "Best, base, and worst-case framing for the strongest operating moves.",
        simulationItems
      ),
      makeSection(
        "next-actions",
        "Next-Best Actions",
        "The clearest owned moves to execute before the next operating review.",
        nextActionItems
      ),
    ]),
  };
}

function buildRoleSnapshot(input: {
  surface: DecisionSurface;
  days: number;
  lead: LeadCockpitSnapshot;
  decisions: AdminDecisionReviewItem[];
  graph: Awaited<ReturnType<typeof buildAdminSignalGraphSnapshot>>;
  simulations: Awaited<ReturnType<typeof buildAdminSimulationSnapshot>>;
}): AdminIntelligenceSnapshot {
  const causalItems = buildCausalItems({
    surface: input.surface,
    leadingIndicators: input.lead.leadingIndicators,
    priorities: input.lead.priorities,
    graphPaths: input.graph.focusPaths,
  });
  const decisionItems = buildRoleDecisionItems({
    role: input.lead.role,
    priorities: input.lead.priorities,
    decisions: input.decisions,
  });
  const simulationItems = buildSimulationItems(input.simulations.scenarios, input.surface);
  const nextActionItems = buildNextActionItems({
    actions: input.lead.actions,
    priorities: input.lead.priorities,
    surface: input.surface,
  });

  return {
    generatedAt: new Date().toISOString(),
    days: input.days,
    surface: input.surface,
    title: `${input.lead.label} Decision Copilot`,
    headline: `${causalItems.length} likely causes, ${decisionItems.length} decision candidates, and ${nextActionItems.length} recommended follow-through moves for ${surfaceLabel(input.surface).toLowerCase()}.`,
    summary:
      "This role-aware layer converts the cockpit into a practical judgment surface: what is probably driving pressure, which choice matters next, what the scenarios imply, and what to do first.",
    prompts: surfacePrompts(input.surface),
    sections: filterSections([
      makeSection(
        "causal",
        "Causal Inference Studio",
        "The strongest live drivers behind the current role pressure.",
        causalItems
      ),
      makeSection(
        "copilot",
        "Decision Copilot",
        "Live decisions that should be closed before they turn into drift or unowned queue pressure.",
        decisionItems
      ),
      makeSection(
        "simulator",
        "Recommendation Simulator",
        "Best, base, and worst-case framing for the strongest moves available to this role.",
        simulationItems
      ),
      makeSection(
        "next-actions",
        "Next-Best Actions",
        "The clearest owned actions this role should execute next.",
        nextActionItems
      ),
    ]),
  };
}

export function parseDecisionIntelligenceSurface(
  value: string | null | undefined
): DecisionSurface {
  return ensureSurface(value);
}

export async function buildDecisionIntelligenceSnapshot(
  inputSurface: string | null | undefined,
  inputDays: number,
  adminEmail?: string
): Promise<AdminIntelligenceSnapshot> {
  const surface = ensureSurface(inputSurface);
  const days = ensureDays(inputDays);
  const role = mapSurfaceToRole(surface);

  if (role) {
    const simulationSurface = parseAdminSimulationSurface(mapSurfaceToSimulation(surface));
    const graphSurface = mapSurfaceToGraph(surface);
    const [lead, os, graph, simulations] = await Promise.all([
      buildLeadCockpitSnapshot(role, days),
      buildAdminOsSnapshot(days),
      buildAdminSignalGraphSnapshot(graphSurface, days, adminEmail),
      buildAdminSimulationSnapshot(simulationSurface, days, adminEmail),
    ]);

    return buildRoleSnapshot({
      surface,
      days,
      lead,
      decisions: os.decisionBoard,
      graph,
      simulations,
    });
  }

  const [os, graph, simulations] = await Promise.all([
    buildAdminOsSnapshot(days),
    buildAdminSignalGraphSnapshot("command-center", days, adminEmail),
    buildAdminSimulationSnapshot("command-center", days, adminEmail),
  ]);

  return buildCommandSnapshot({ days, os, graph, simulations });
}
