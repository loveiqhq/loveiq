import { buildConversionLeakDebuggerSnapshot } from "@features/admin/server/conversion-leak-debugger";
import { buildExperimentRegistrySnapshot } from "@features/admin/server/experiment-registry";
import { buildForecastSnapshot } from "@features/admin/server/forecasting";
import { buildGrowthControlTowerSnapshot } from "@features/admin/server/growth-control-tower";
import { buildAdminOsSnapshot } from "@features/admin/server/os";
import { buildStrategySnapshot } from "@features/admin/server/strategy";
import { buildValueRealizationSnapshot } from "@features/admin/server/value-realization";
import type {
  AdminSimulationScenario,
  AdminSimulationSnapshot,
  AdminSimulationSurface,
} from "@features/admin/server/simulation-types";

const SURFACES: AdminSimulationSurface[] = ["command-center", "growth", "strategy", "experiments"];

function ensureSurface(value: string | null | undefined): AdminSimulationSurface {
  return SURFACES.includes(value as AdminSimulationSurface)
    ? (value as AdminSimulationSurface)
    : "command-center";
}

function ensureDays(value: number): number {
  if (!Number.isFinite(value)) return 30;
  return Math.min(Math.max(Math.round(value), 7), 365);
}

function scenario(input: AdminSimulationScenario): AdminSimulationScenario {
  return input;
}

export function parseAdminSimulationSurface(
  value: string | null | undefined
): AdminSimulationSurface {
  return ensureSurface(value);
}

export async function buildAdminSimulationSnapshot(
  inputSurface: string | null | undefined,
  inputDays: number,
  adminEmail?: string
): Promise<AdminSimulationSnapshot> {
  const surface = ensureSurface(inputSurface);
  const days = ensureDays(inputDays);

  if (surface === "growth") {
    if (!adminEmail) throw new Error("Admin email is required for growth simulations.");
    const [control, leak, value] = await Promise.all([
      buildGrowthControlTowerSnapshot(days),
      buildConversionLeakDebuggerSnapshot(days, adminEmail),
      buildValueRealizationSnapshot(days),
    ]);
    const topChannel = (control.topChannels ?? [])[0];
    const topLeak = (leak.priorities ?? [])[0];
    const topValue = (value.signals ?? [])[0];

    return {
      generatedAt: new Date().toISOString(),
      surface,
      days,
      headline: `${(control.priorities ?? []).length} growth priorities translated into scenario planning for scale, leakage, and value quality.`,
      scenarios: [
        topChannel
          ? scenario({
              id: "growth-scale-channel",
              title: `Scale ${topChannel.source}`,
              summary:
                "Projected upside if the current strongest source gets incremental budget and operational focus.",
              tone: "good",
              confidence: topChannel.action === "scale" ? "high" : "medium",
              href: "/admin/growth",
              assumptions: [
                "Channel mix remains similar over the next operating window.",
                "Creative/message quality does not materially degrade during scale.",
              ],
              outcomes: [
                {
                  label: "Paid rate",
                  current: `${topChannel.paidRate}%`,
                  base: `${Math.max(0, topChannel.paidRate + 1)}%`,
                  best: `${Math.max(0, topChannel.paidRate + 3)}%`,
                  worst: `${Math.max(0, topChannel.paidRate - 2)}%`,
                },
                {
                  label: "Revenue per start",
                  current: `$${topChannel.revenuePerStart}`,
                  base: `$${Math.max(0, topChannel.revenuePerStart + 1)}`,
                  best: `$${Math.max(0, topChannel.revenuePerStart + 3)}`,
                  worst: `$${Math.max(0, topChannel.revenuePerStart - 2)}`,
                },
              ],
            })
          : null,
        topLeak
          ? scenario({
              id: "growth-fix-leak",
              title: "Fix strongest leak",
              summary:
                topLeak.explanation ||
                "Projected effect of repairing the strongest current leak segment.",
              tone: "watch",
              confidence: "medium",
              href: topLeak.href || "/admin/growth",
              assumptions: [
                "Leak diagnosis is causal enough to justify intervention.",
                "Traffic mix does not shift materially during the fix window.",
              ],
              outcomes: [
                {
                  label: "Leak severity",
                  current: topLeak.leakStageLabel,
                  base: "Reduced",
                  best: "Contained",
                  worst: "Unchanged",
                },
                {
                  label: "Completion posture",
                  current: "Current",
                  base: "Slightly improved",
                  best: "Meaningfully improved",
                  worst: "Flat",
                },
              ],
            })
          : null,
        topValue
          ? scenario({
              id: "growth-value-signal",
              title: topValue.signal,
              summary:
                "Projected downstream quality if the strongest value-realization behavior is reinforced.",
              tone: "good",
              confidence: "medium",
              href: "/admin/growth",
              assumptions: [
                "The observed value signal remains predictive in the next window.",
                "Behavior change is operationally teachable through product or messaging.",
              ],
              outcomes: [
                {
                  label: "Monetization lift",
                  current: `${topValue.monetizationLift}pp`,
                  base: `${Math.max(0, topValue.monetizationLift)}pp`,
                  best: `${Math.max(0, topValue.monetizationLift + 3)}pp`,
                  worst: `${Math.max(0, topValue.monetizationLift - 2)}pp`,
                },
                {
                  label: "Retention lift",
                  current: `${topValue.retentionLift}pp`,
                  base: `${Math.max(0, topValue.retentionLift)}pp`,
                  best: `${Math.max(0, topValue.retentionLift + 3)}pp`,
                  worst: `${Math.max(0, topValue.retentionLift - 2)}pp`,
                },
              ],
            })
          : null,
      ].filter((entry): entry is AdminSimulationScenario => Boolean(entry)),
    };
  }

  if (surface === "strategy") {
    const [strategy, forecast] = await Promise.all([
      buildStrategySnapshot(days),
      buildForecastSnapshot(days),
    ]);
    const topOpportunity = (strategy.opportunities?.backlog ?? [])[0];
    const weakestForecast = [...(forecast.modules ?? [])].sort((left, right) =>
      left.confidence.localeCompare(right.confidence)
    )[0];

    return {
      generatedAt: new Date().toISOString(),
      surface,
      days,
      headline: `${(strategy.opportunities?.backlog ?? []).length} strategy opportunities and ${(forecast.modules ?? []).length} forecasts translated into scenario planning.`,
      scenarios: [
        topOpportunity
          ? scenario({
              id: "strategy-opportunity",
              title: topOpportunity.title,
              summary:
                "Scenario range if the current highest-scoring opportunity is prioritized first.",
              tone: topOpportunity.confidence === "high" ? "good" : "watch",
              confidence: topOpportunity.confidence,
              href: topOpportunity.href,
              assumptions: [
                `Effort remains ${topOpportunity.effort}.`,
                `Time to signal remains ${topOpportunity.timeToSignal}.`,
              ],
              outcomes: [
                {
                  label: "Opportunity score",
                  current: String(topOpportunity.score),
                  base: String(topOpportunity.score),
                  best: String(topOpportunity.score + 10),
                  worst: String(Math.max(0, topOpportunity.score - 8)),
                },
                {
                  label: "Planning posture",
                  current: "Backlog",
                  base: "Prioritized",
                  best: "Funded and reviewed",
                  worst: "Stalled",
                },
              ],
            })
          : null,
        weakestForecast
          ? scenario({
              id: `strategy-forecast-${weakestForecast.key}`,
              title: `${weakestForecast.label} forecast stress test`,
              summary:
                "Scenario range around the currently weakest or most sensitive forecast module.",
              tone: weakestForecast.confidence === "low" ? "risk" : "watch",
              confidence: weakestForecast.confidence,
              href: weakestForecast.href,
              assumptions: [
                "No external demand shock beyond the current model assumptions.",
                "Input signal quality remains comparable to the selected window.",
              ],
              outcomes: [
                {
                  label: weakestForecast.label,
                  current: String(weakestForecast.currentValue),
                  base: String(weakestForecast.forecastValue),
                  best: String(weakestForecast.upperBound),
                  worst: String(weakestForecast.lowerBound),
                },
              ],
            })
          : null,
      ].filter((entry): entry is AdminSimulationScenario => Boolean(entry)),
    };
  }

  if (surface === "experiments") {
    if (!adminEmail) throw new Error("Admin email is required for experiment simulations.");
    const registry = await buildExperimentRegistrySnapshot(adminEmail);
    const ready = (registry.scorecard?.readyQueue ?? [])[0];
    const risk = (registry.scorecard?.riskQueue ?? [])[0];

    return {
      generatedAt: new Date().toISOString(),
      surface,
      days,
      headline: `${registry.summary?.readyForDecision ?? 0} ready experiments and ${registry.summary?.guardrailRisks ?? 0} risk experiments translated into scenario planning.`,
      scenarios: [
        ready
          ? scenario({
              id: `experiment-ship-${ready.id}`,
              title: `Ship decision: ${ready.name}`,
              summary:
                "Scenario range if the current strongest experiment is shipped instead of kept running.",
              tone: ready.decisionTone === "good" ? "good" : "watch",
              confidence: ready.confidence,
              href: "/admin/experiments",
              assumptions: [
                "Readout signal remains representative after rollout.",
                "Guardrails stay inside acceptable bounds after exposure increases.",
              ],
              outcomes: [
                {
                  label: "Winner confidence",
                  current: `${ready.readout?.winnerConfidenceScore ?? 0}%`,
                  base: `${ready.readout?.winnerConfidenceScore ?? 0}%`,
                  best: `${Math.min(100, (ready.readout?.winnerConfidenceScore ?? 0) + 10)}%`,
                  worst: `${Math.max(0, (ready.readout?.winnerConfidenceScore ?? 0) - 15)}%`,
                },
                {
                  label: "Decision posture",
                  current: ready.decisionLabel,
                  base: "Ship with monitoring",
                  best: "Ship and scale",
                  worst: "Hold after rollout",
                },
              ],
            })
          : null,
        risk
          ? scenario({
              id: `experiment-risk-${risk.id}`,
              title: `Contain risk: ${risk.name}`,
              summary:
                "Scenario range if the current risky experiment is contained before more exposure accumulates.",
              tone: "risk",
              confidence: risk.confidence,
              href: "/admin/experiments",
              assumptions: [
                "Guardrail pressure is genuinely causal, not sampling noise.",
                "Stopping or narrowing the test is operationally possible this window.",
              ],
              outcomes: [
                {
                  label: "Guardrail risk count",
                  current: String(risk.guardrailRiskCount),
                  base: String(Math.max(0, risk.guardrailRiskCount - 1)),
                  best: "0",
                  worst: String(risk.guardrailRiskCount + 1),
                },
                {
                  label: "Exposure posture",
                  current: risk.decisionLabel,
                  base: "Narrowed",
                  best: "Contained",
                  worst: "Escalated",
                },
              ],
            })
          : null,
      ].filter((entry): entry is AdminSimulationScenario => Boolean(entry)),
    };
  }

  const os = await buildAdminOsSnapshot(days);
  return {
    generatedAt: new Date().toISOString(),
    surface,
    days,
    headline: `${os.actionBoard?.summary?.totalOpen ?? 0} open actions and ${(os.watchlist ?? []).length} watchlist items translated into operating scenarios.`,
    scenarios: [
      scenario({
        id: "command-unblock",
        title: "Unblock high-friction execution",
        summary: "Scenario range if blocked actions are cleared before the next operating review.",
        tone: "watch",
        confidence: "medium",
        href: "/admin",
        assumptions: [
          "Blocked actions are resolved by dependency or owner clarification, not scope deletion.",
          "No new critical issues are added faster than blockers are removed.",
        ],
        outcomes: [
          {
            label: "Blocked actions",
            current: String(os.actionBoard?.summary?.blocked ?? 0),
            base: String(Math.max(0, (os.actionBoard?.summary?.blocked ?? 0) - 1)),
            best: "0",
            worst: String((os.actionBoard?.summary?.blocked ?? 0) + 1),
          },
          {
            label: "Overdue actions",
            current: String(os.actionBoard?.summary?.overdue ?? 0),
            base: String(Math.max(0, (os.actionBoard?.summary?.overdue ?? 0) - 1)),
            best: "0",
            worst: String((os.actionBoard?.summary?.overdue ?? 0) + 2),
          },
        ],
      }),
      scenario({
        id: "command-watchlist",
        title: "Resolve watchlist before escalation",
        summary:
          "Scenario range if current watchlist items are handled before they convert into risk.",
        tone: (os.watchlist ?? []).length > 0 ? "watch" : "good",
        confidence: "medium",
        href: "/admin",
        assumptions: [
          "Watchlist items are acted on in the same decision window.",
          "No large exogenous shift changes the operating baseline.",
        ],
        outcomes: [
          {
            label: "Watchlist items",
            current: String((os.watchlist ?? []).length),
            base: String(Math.max(0, (os.watchlist ?? []).length - 1)),
            best: "0",
            worst: String((os.watchlist ?? []).length + 2),
          },
        ],
      }),
    ],
  };
}
