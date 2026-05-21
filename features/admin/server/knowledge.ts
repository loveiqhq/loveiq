import { buildAnomalySnapshot } from "@features/admin/server/alerts";
import { buildForecastSnapshot } from "@features/admin/server/forecasting";
import { buildIncidentCorrelationSnapshot } from "@features/admin/server/incident-correlation";
import { excerpt, semanticScore } from "@features/admin/server/next-level";
import { buildAdminOsSnapshot } from "@features/admin/server/os";
import { buildWhatChangedSnapshot } from "@features/admin/server/release-impact";
import { buildStrategyPlanningSnapshot } from "@features/admin/server/strategy-planning";
import { buildStrategySnapshot } from "@features/admin/server/strategy";
import { buildDriftDetectorSnapshot } from "@features/admin/server/drift-detector";
import { buildWorkspaceMaturitySnapshot } from "@features/admin/server/workspace-maturity";
import type {
  AdminKnowledgeArtifact,
  AdminKnowledgeSnapshot,
  AdminKnowledgeSurface,
} from "@features/admin/server/knowledge-types";

const KNOWLEDGE_SURFACES: AdminKnowledgeSurface[] = ["command-center", "strategy", "health"];

function ensureSurface(value: string | null | undefined): AdminKnowledgeSurface {
  return KNOWLEDGE_SURFACES.includes(value as AdminKnowledgeSurface)
    ? (value as AdminKnowledgeSurface)
    : "command-center";
}

function ensureDays(value: number): number {
  if (!Number.isFinite(value)) return 30;
  return Math.min(Math.max(Math.round(value), 7), 365);
}

function makeArtifact(input: AdminKnowledgeArtifact): AdminKnowledgeArtifact {
  return input;
}

function filterArtifacts(
  artifacts: AdminKnowledgeArtifact[],
  query: string | null | undefined
): AdminKnowledgeArtifact[] {
  const needle = query?.trim();
  if (!needle) return artifacts;
  return artifacts
    .map((artifact) => ({
      artifact,
      score: semanticScore(
        needle,
        `${artifact.title} ${artifact.summary}`,
        artifact.evidence.map((entry) => entry.value)
      ),
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score)
    .map((entry) => entry.artifact)
    .slice(0, 8);
}

function relatedChangeForMetric(
  items: Array<{ metricKey: string | null; title: string; kind: string; href: string }>,
  metricKey: string | null | undefined
) {
  if (!metricKey) return null;
  return items.find((item) => item.metricKey === metricKey) ?? null;
}

function dedupeArtifacts(artifacts: AdminKnowledgeArtifact[]): AdminKnowledgeArtifact[] {
  const seen = new Set<string>();
  return artifacts.filter((artifact) => {
    if (seen.has(artifact.id)) return false;
    seen.add(artifact.id);
    return true;
  });
}

export function parseAdminKnowledgeSurface(
  value: string | null | undefined
): AdminKnowledgeSurface {
  return ensureSurface(value);
}

export async function buildAdminKnowledgeSnapshot(
  inputSurface: string | null | undefined,
  inputDays: number,
  adminEmail?: string,
  query?: string | null
): Promise<AdminKnowledgeSnapshot> {
  const surface = ensureSurface(inputSurface);
  const days = ensureDays(inputDays);

  if (surface === "strategy") {
    const [strategy, planning, forecast, changes] = await Promise.all([
      buildStrategySnapshot(days),
      buildStrategyPlanningSnapshot(),
      buildForecastSnapshot(days),
      buildWhatChangedSnapshot(days),
    ]);

    const topForecast = (forecast.modules ?? [])[0];
    const topDecision = (strategy.decisionReview?.items ?? [])[0];
    const topDependency = (planning.dependencies ?? [])[0];
    const relatedDecisionChange = relatedChangeForMetric(
      changes.items,
      topDecision?.primaryMetricKey
    );

    return {
      generatedAt: new Date().toISOString(),
      surface,
      days,
      headline: `${(planning.initiatives ?? []).length} initiatives, ${(planning.bets ?? []).length} bets, and ${(strategy.decisionReview?.items ?? []).length} decision reviews in memory.`,
      summary:
        "Knowledge artifacts turn strategy snapshots into reusable operating memory: what was decided, what is forecast, and where dependencies create leverage.",
      prompts: [
        {
          label: "Review narrative",
          query: "What should leadership remember from strategy this week?",
        },
        { label: "Weak forecast", query: "Which forecast is weakest right now?" },
        { label: "Dependency", query: "What dependency matters most?" },
      ],
      artifacts: filterArtifacts(
        [
          makeArtifact({
            id: "strategy-meeting-pack",
            type: "meeting-pack",
            title: "Strategy review pack",
            summary: excerpt((strategy.narrative ?? []).join(" ")),
            tone: "watch",
            confidence: "high",
            href: "/admin/strategy",
            evidence: [
              {
                label: "Narrative lines",
                value: String((strategy.narrative ?? []).length),
                href: "/admin/strategy",
              },
              {
                label: "Opportunities",
                value: String((strategy.opportunities?.backlog ?? []).length),
                href: "/admin/strategy",
              },
            ],
          }),
          topDecision
            ? makeArtifact({
                id: `strategy-decision-${topDecision.id}`,
                type: "decision-memory",
                title: topDecision.title,
                summary: excerpt(
                  topDecision.detail || topDecision.expectedImpact || "Decision review item."
                ),
                tone:
                  topDecision.reviewState === "validated"
                    ? "good"
                    : topDecision.reviewState === "stale"
                      ? "risk"
                      : "watch",
                confidence: topDecision.measuredOutcome ? "high" : "medium",
                href: topDecision.href,
                evidence: [
                  { label: "Review state", value: topDecision.reviewState, href: topDecision.href },
                  {
                    label: "Metric",
                    value: topDecision.primaryMetricKey || "Unlinked",
                    href: topDecision.href,
                  },
                ],
              })
            : null,
          topDecision
            ? makeArtifact({
                id: `strategy-decision-graph-${topDecision.id}`,
                type: "decision-graph",
                title: `${topDecision.title} decision graph`,
                summary: excerpt(
                  [
                    topDecision.comparisonLabel,
                    topDecision.expectedImpact,
                    relatedDecisionChange
                      ? `${relatedDecisionChange.kind}: ${relatedDecisionChange.title}`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" -> ") || "Decision graph path unavailable."
                ),
                tone:
                  topDecision.reviewState === "validated"
                    ? "good"
                    : topDecision.reviewState === "stale"
                      ? "risk"
                      : "watch",
                confidence: topDecision.measuredOutcome ? "high" : "medium",
                href: topDecision.href,
                evidence: [
                  { label: "Review state", value: topDecision.reviewState, href: topDecision.href },
                  {
                    label: "Related change",
                    value: relatedDecisionChange?.title || "none",
                    href: relatedDecisionChange?.href || topDecision.href,
                  },
                ],
              })
            : null,
          topDependency
            ? makeArtifact({
                id: `strategy-dependency-${topDependency.id}`,
                type: "graph-path",
                title: `${topDependency.parentMetricLabel} -> ${topDependency.childMetricLabel}`,
                summary: excerpt(
                  topDependency.hypothesisNote ||
                    topDependency.evidenceNote ||
                    "Tracked dependency between two strategic metrics."
                ),
                tone: topDependency.relationshipStrength === "strong" ? "watch" : "neutral",
                confidence: topDependency.evidenceNote ? "high" : "medium",
                href: "/admin/strategy?tab=Strategy%20Planning",
                evidence: [
                  {
                    label: "Strength",
                    value: topDependency.relationshipStrength,
                    href: "/admin/strategy?tab=Strategy%20Planning",
                  },
                  {
                    label: "Parent",
                    value: topDependency.parentMetricLabel,
                    href: "/admin/strategy?tab=Strategy%20Planning",
                  },
                ],
              })
            : null,
          topForecast
            ? makeArtifact({
                id: `strategy-forecast-${topForecast.key}`,
                type: "governance-gap",
                title: `${topForecast.label} forecast confidence`,
                summary: excerpt(
                  topForecast.description ||
                    "Forecast confidence should stay explicit in planning decisions."
                ),
                tone: topForecast.confidence === "low" ? "risk" : "watch",
                confidence: topForecast.confidence,
                href: topForecast.href,
                evidence: [
                  {
                    label: "Forecast",
                    value: String(topForecast.forecastValue),
                    href: topForecast.href,
                  },
                  {
                    label: "Band",
                    value: `${topForecast.lowerBound} to ${topForecast.upperBound}`,
                    href: topForecast.href,
                  },
                ],
              })
            : null,
        ].filter((artifact): artifact is AdminKnowledgeArtifact => Boolean(artifact)),
        query
      ),
    };
  }

  if (surface === "health") {
    if (!adminEmail) throw new Error("Admin email is required for health knowledge.");
    const [anomalies, incidents, drift, maturity, changes] = await Promise.all([
      buildAnomalySnapshot(days),
      buildIncidentCorrelationSnapshot(days),
      buildDriftDetectorSnapshot(days, adminEmail),
      buildWorkspaceMaturitySnapshot(),
      buildWhatChangedSnapshot(days),
    ]);

    const topIncident = (incidents.entries ?? [])[0];
    const topAnomaly = (anomalies.items ?? [])[0];
    const topDrift = (drift.findings ?? [])[0];
    const weakDimension = [...(maturity.dimensions ?? [])].sort(
      (left, right) => left.score - right.score
    )[0];
    const topIncidentChange = relatedChangeForMetric(changes.items, topIncident?.metricKey);

    return {
      generatedAt: new Date().toISOString(),
      surface,
      days,
      headline: `${anomalies.summary?.total ?? 0} anomalies and ${drift.summary?.totalFindings ?? 0} drift findings are available for triage memory.`,
      summary:
        "Health knowledge artifacts turn incidents and drift into reusable diagnosis memory instead of one-off troubleshooting.",
      prompts: [
        { label: "Postmortem", query: "What should we learn from the latest incident?" },
        { label: "Driver path", query: "What driver path looks most plausible?" },
        { label: "Governance gap", query: "Where is health governance weakest?" },
      ],
      artifacts: filterArtifacts(
        [
          topIncident
            ? makeArtifact({
                id: `health-postmortem-${topIncident.id}`,
                type: "postmortem",
                title: topIncident.title,
                summary: excerpt(topIncident.recommendation),
                tone: topIncident.severity === "risk" ? "risk" : "watch",
                confidence: topIncident.confidence,
                href: "/admin/health",
                evidence: [
                  { label: "Severity", value: topIncident.severity, href: "/admin/health" },
                  {
                    label: "Drivers",
                    value: String((topIncident.suspectedDrivers ?? []).length),
                    href: "/admin/health",
                  },
                ],
              })
            : null,
          topIncident
            ? makeArtifact({
                id: `health-postmortem-pack-${topIncident.id}`,
                type: "postmortem-pack",
                title: `${topIncident.title} postmortem synthesis`,
                summary: excerpt(
                  [
                    topIncident.recommendation,
                    topIncident.suspectedDrivers?.[0]
                      ? `Top driver: ${topIncident.suspectedDrivers[0].title}`
                      : null,
                    topIncidentChange ? `Nearby change: ${topIncidentChange.title}` : null,
                    topDrift ? `Drift: ${topDrift.title}` : null,
                  ]
                    .filter(Boolean)
                    .join(" ")
                ),
                tone: topIncident.severity === "risk" ? "risk" : "watch",
                confidence: topIncident.confidence,
                href: "/admin/health",
                evidence: [
                  {
                    label: "Driver",
                    value: topIncident.suspectedDrivers?.[0]?.title || "none",
                    href: "/admin/health",
                  },
                  {
                    label: "Nearby change",
                    value: topIncidentChange?.title || "none",
                    href: topIncidentChange?.href || "/admin/health",
                  },
                  {
                    label: "Metric",
                    value: topIncident.metricKey || "Unlinked",
                    href: "/admin/health",
                  },
                ],
              })
            : null,
          topIncident
            ? makeArtifact({
                id: `health-graph-${topIncident.id}`,
                type: "graph-path",
                title: "Likely incident driver path",
                summary: excerpt(
                  (topIncident.suspectedDrivers ?? [])
                    .map((driver) => `${driver.kind}: ${driver.title}`)
                    .join(" -> ") || "No suspected drivers recorded."
                ),
                tone: "watch",
                confidence: topIncident.confidence,
                href: "/admin/health",
                evidence: [
                  {
                    label: "Metric",
                    value: topIncident.metricKey || "Unlinked",
                    href: "/admin/health",
                  },
                  { label: "Category", value: topIncident.category, href: "/admin/health" },
                ],
              })
            : null,
          topDrift
            ? makeArtifact({
                id: `health-drift-${topDrift.id}`,
                type: "governance-gap",
                title: topDrift.title,
                summary: excerpt(topDrift.recommendation),
                tone: topDrift.severity === "risk" ? "risk" : "watch",
                confidence: topDrift.affectedCount >= 3 ? "high" : "medium",
                href: topDrift.href,
                evidence: [
                  { label: "Category", value: topDrift.categoryLabel, href: topDrift.href },
                  { label: "Affected", value: String(topDrift.affectedCount), href: topDrift.href },
                ],
              })
            : null,
          weakDimension
            ? makeArtifact({
                id: `health-maturity-${weakDimension.key}`,
                type: "governance-gap",
                title: `${weakDimension.label} maturity gap`,
                summary: excerpt(weakDimension.nextStep),
                tone: weakDimension.tone === "weak" ? "risk" : "watch",
                confidence: "medium",
                href: "/admin/tools",
                evidence: [
                  { label: "Score", value: String(weakDimension.score), href: "/admin/tools" },
                  {
                    label: "Gap",
                    value: weakDimension.gaps?.[0] || "Coverage gap",
                    href: "/admin/tools",
                  },
                ],
              })
            : null,
          topAnomaly
            ? makeArtifact({
                id: `health-anomaly-${topAnomaly.id}`,
                type: "decision-memory",
                title: topAnomaly.title,
                summary: excerpt(topAnomaly.detail),
                tone: topAnomaly.severity === "risk" ? "risk" : "watch",
                confidence: topAnomaly.matchedRules?.length > 0 ? "high" : "medium",
                href: topAnomaly.href,
                evidence: [
                  { label: "Category", value: topAnomaly.category, href: topAnomaly.href },
                  {
                    label: "Rules",
                    value: String(topAnomaly.matchedRules?.length ?? 0),
                    href: topAnomaly.href,
                  },
                ],
              })
            : null,
        ].filter((artifact): artifact is AdminKnowledgeArtifact => Boolean(artifact)),
        query
      ),
    };
  }

  const [os, maturity, incidents, changes] = await Promise.all([
    buildAdminOsSnapshot(days),
    buildWorkspaceMaturitySnapshot(),
    adminEmail
      ? buildIncidentCorrelationSnapshot(days)
      : Promise.resolve({
          generatedAt: new Date().toISOString(),
          days,
          summary: {
            incidents: 0,
            highConfidence: 0,
            releaseLinked: 0,
            trackingOrService: 0,
          },
          entries: [],
        } as Awaited<ReturnType<typeof buildIncidentCorrelationSnapshot>>),
    buildWhatChangedSnapshot(days),
  ]);
  const topDecision = (os.decisionBoard ?? [])[0];
  const topAction = (os.actionBoard?.items ?? [])[0];
  const topIndicator = (os.leadingIndicators ?? [])[0];
  const weakDimension = [...(maturity.dimensions ?? [])].sort(
    (left, right) => left.score - right.score
  )[0];
  const topIncident = (incidents.entries ?? [])[0];
  const relatedDecisionChange = relatedChangeForMetric(
    changes.items,
    topDecision?.primaryMetricKey
  );

  return {
    generatedAt: new Date().toISOString(),
    surface,
    days,
    headline: `${(os.briefs ?? []).length} briefs, ${(os.decisionBoard ?? []).length} decision records, and ${maturity.overallScore} maturity score in command memory.`,
    summary:
      "Command knowledge artifacts keep the operating system reusable across weekly reviews, action follow-through, and decision recall.",
    prompts: [
      { label: "Meeting pack", query: "What should the leadership meeting cover?" },
      { label: "Decision memory", query: "Which decision should we revisit?" },
      { label: "Governance gap", query: "What governance gap needs attention?" },
    ],
    artifacts: filterArtifacts(
      [
        makeArtifact({
          id: "command-meeting-pack",
          type: "meeting-pack",
          title: "Leadership meeting pack",
          summary: excerpt((os.briefs ?? []).map((brief) => brief.detail).join(" ")),
          tone: "watch",
          confidence: "high",
          href: "/admin/operating-review",
          evidence: [
            {
              label: "Briefs",
              value: String((os.briefs ?? []).length),
              href: "/admin/operating-review",
            },
            { label: "Watchlist", value: String((os.watchlist ?? []).length), href: "/admin" },
          ],
        }),
        topDecision
          ? makeArtifact({
              id: `command-decision-${topDecision.id}`,
              type: "decision-memory",
              title: topDecision.title,
              summary: excerpt(
                topDecision.measuredOutcome ||
                  topDecision.expectedImpact ||
                  `${topDecision.entryType} is ${topDecision.status}.`
              ),
              tone: topDecision.measuredOutcome ? "good" : "watch",
              confidence: topDecision.measuredOutcome ? "high" : "medium",
              href: topDecision.href,
              evidence: [
                { label: "Status", value: topDecision.status, href: topDecision.href },
                {
                  label: "Metric",
                  value: topDecision.primaryMetricKey || "Unlinked",
                  href: topDecision.href,
                },
              ],
            })
          : null,
        topDecision
          ? makeArtifact({
              id: `command-decision-graph-${topDecision.id}`,
              type: "decision-graph",
              title: `${topDecision.title} operating graph`,
              summary: excerpt(
                [
                  topDecision.expectedImpact,
                  topAction ? `action: ${topAction.title}` : null,
                  relatedDecisionChange
                    ? `${relatedDecisionChange.kind}: ${relatedDecisionChange.title}`
                    : null,
                ]
                  .filter(Boolean)
                  .join(" -> ") || "Decision graph path unavailable."
              ),
              tone: topDecision.measuredOutcome ? "good" : "watch",
              confidence: topDecision.measuredOutcome ? "high" : "medium",
              href: topDecision.href,
              evidence: [
                {
                  label: "Action",
                  value: topAction?.title || "none",
                  href: topAction?.linkedHref || topDecision.href,
                },
                {
                  label: "Related change",
                  value: relatedDecisionChange?.title || "none",
                  href: relatedDecisionChange?.href || topDecision.href,
                },
              ],
            })
          : null,
        topIndicator
          ? makeArtifact({
              id: `command-graph-${topIndicator.metricKey}-${topIndicator.leadingMetricKey}`,
              type: "graph-path",
              title: `${topIndicator.leadingMetricLabel} -> ${topIndicator.metricLabel}`,
              summary: excerpt(topIndicator.detail),
              tone: topIndicator.signalState === "negative" ? "risk" : "watch",
              confidence: "high",
              href: topIndicator.href,
              evidence: [
                { label: "Signal", value: topIndicator.signalState, href: topIndicator.href },
                {
                  label: "Lagging metric",
                  value: topIndicator.metricLabel,
                  href: topIndicator.href,
                },
              ],
            })
          : null,
        weakDimension
          ? makeArtifact({
              id: `command-gap-${weakDimension.key}`,
              type: "governance-gap",
              title: `${weakDimension.label} governance gap`,
              summary: excerpt(weakDimension.nextStep),
              tone: weakDimension.tone === "weak" ? "risk" : "watch",
              confidence: "medium",
              href: "/admin/tools",
              evidence: [
                { label: "Score", value: String(weakDimension.score), href: "/admin/tools" },
                {
                  label: "Gap",
                  value: weakDimension.gaps?.[0] || "Coverage gap",
                  href: "/admin/tools",
                },
              ],
            })
          : null,
        topAction
          ? makeArtifact({
              id: `command-action-${topAction.id}`,
              type: "decision-memory",
              title: topAction.title,
              summary: excerpt(
                topAction.description || "Open action that should stay visible in operating memory."
              ),
              tone:
                topAction.status === "blocked"
                  ? "risk"
                  : topAction.status === "done"
                    ? "good"
                    : "watch",
              confidence: topAction.metricKey ? "high" : "medium",
              href: topAction.linkedHref || "/admin",
              evidence: [
                {
                  label: "Priority",
                  value: topAction.priority,
                  href: topAction.linkedHref || "/admin",
                },
                {
                  label: "Status",
                  value: topAction.status,
                  href: topAction.linkedHref || "/admin",
                },
              ],
            })
          : null,
        topIncident
          ? makeArtifact({
              id: `command-postmortem-${topIncident.id}`,
              type: "postmortem-pack",
              title: `${topIncident.title} postmortem pack`,
              summary: excerpt(
                [
                  topIncident.recommendation,
                  topIncident.suspectedDrivers?.[0]
                    ? `Driver: ${topIncident.suspectedDrivers[0].title}`
                    : null,
                  topIncident.metricKey ? `Metric: ${topIncident.metricKey}` : null,
                ]
                  .filter(Boolean)
                  .join(" ")
              ),
              tone: topIncident.severity === "risk" ? "risk" : "watch",
              confidence: topIncident.confidence,
              href: "/admin/health",
              evidence: [
                { label: "Severity", value: topIncident.severity, href: "/admin/health" },
                {
                  label: "Drivers",
                  value: String(topIncident.suspectedDrivers?.length ?? 0),
                  href: "/admin/health",
                },
              ],
            })
          : null,
      ].filter((artifact): artifact is AdminKnowledgeArtifact => Boolean(artifact)),
      query
    ),
  };
}

export async function buildAllAdminKnowledgeArtifacts(
  inputDays: number,
  adminEmail: string,
  query?: string | null
): Promise<AdminKnowledgeArtifact[]> {
  const snapshots = await Promise.all([
    buildAdminKnowledgeSnapshot("command-center", inputDays, adminEmail, query),
    buildAdminKnowledgeSnapshot("strategy", inputDays, adminEmail, query),
    buildAdminKnowledgeSnapshot("health", inputDays, adminEmail, query),
  ]);

  return dedupeArtifacts(
    snapshots.flatMap((snapshot) =>
      snapshot.artifacts.map((artifact) => ({
        ...artifact,
        id: `${snapshot.surface}-${artifact.id}`,
      }))
    )
  );
}
