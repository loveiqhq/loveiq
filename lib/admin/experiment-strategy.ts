import { buildChannelEfficiencySnapshot } from "@/lib/admin/channel-efficiency";
import { buildGeoLanguageExpansionSnapshot } from "@/lib/admin/geo-language-expansion";
import { buildMetricStatusSnapshot } from "@/lib/admin/metric-status";
import { clampDays } from "@/lib/admin/next-level";
import { buildProductExperienceHealthSnapshot } from "@/lib/admin/product-experience-health";
import { buildReleaseImpactSnapshot } from "@/lib/admin/release-impact";
import {
  buildExperimentRegistrySnapshot,
  type ExperimentSnapshot,
} from "@/lib/admin/experiment-registry";
import type {
  AdminIntelligenceDraft,
  AdminIntelligenceEvidence,
  AdminIntelligenceItem,
  AdminIntelligenceSection,
  AdminIntelligenceSnapshot,
  AdminIntelligenceTone,
} from "@/lib/admin/intelligence-types";

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

function buildGrowthTabHref(tab: string) {
  return `/admin/growth?${new URLSearchParams({ tab }).toString()}`;
}

const CHANNEL_EFFICIENCY_HREF = buildGrowthTabHref("Channel Efficiency");
const GEO_LANGUAGE_HREF = buildGrowthTabHref("Geo & Language");

function confidenceFromSample(value: number | null | undefined): "high" | "medium" | "low" {
  const sample = value ?? 0;
  if (sample >= 100) return "high";
  if (sample >= 30) return "medium";
  return "low";
}

function draftDesign(input: {
  title: string;
  hypothesis: string;
  primaryMetric: string;
  guardrails: string[];
  segment?: string | null;
  durationDays?: number | null;
  sourceHref: string;
}) {
  const parts = [
    `Hypothesis: ${input.hypothesis}`,
    `Primary metric: ${input.primaryMetric}`,
    `Guardrails: ${input.guardrails.length > 0 ? input.guardrails.join(", ") : "completion_rate, report_view_rate"}`,
    input.segment ? `Suggested segment: ${input.segment}` : null,
    input.durationDays ? `Suggested duration: ${input.durationDays} days` : null,
  ].filter(Boolean);

  return makeDraft("experiment", input.title, parts.join(" | "), input.sourceHref);
}

function buildCannibalizationItems(input: {
  experiments: ExperimentSnapshot[];
  releases: Awaited<ReturnType<typeof buildReleaseImpactSnapshot>>["releases"];
  productAreas: Awaited<ReturnType<typeof buildProductExperienceHealthSnapshot>>["areas"];
}) {
  const experimentItems = input.experiments
    .filter(
      (experiment) =>
        (experiment.readout.significance === "significant-lift" ||
          experiment.decisionState === "ready") &&
        experiment.guardrailRiskCount > 0
    )
    .slice(0, 3)
    .map((experiment) =>
      makeItem({
        id: `cannibalization-experiment-${experiment.id}`,
        title: `Cannibalization risk: ${experiment.name}`,
        detail: `${experiment.readout.winnerLabel} on ${experiment.primary_metric_label}, but ${experiment.guardrailRiskCount} guardrail${experiment.guardrailRiskCount === 1 ? "" : "s"} is at risk.`,
        tone: "risk",
        confidence: experiment.confidence,
        capabilities: [
          "feature cannibalization detector",
          "guardrail analysis",
          "experiment governance",
        ],
        recommendation:
          "Do not scale this winner yet. Resolve the guardrail break and verify the improvement is not stealing from downstream value or core workflow quality.",
        href: "/admin/experiments",
        evidence: [
          makeEvidence("Primary metric", experiment.primary_metric_label, "/admin/experiments"),
          makeEvidence("Winner", experiment.readout.winnerLabel, "/admin/experiments"),
          makeEvidence(
            "Guardrail risk",
            String(experiment.guardrailRiskCount),
            "/admin/experiments"
          ),
        ],
        draft: draftDesign({
          title: `Guardrail-safe rerun: ${experiment.name}`,
          hypothesis:
            "The variant can preserve primary lift without degrading core workflow or value guardrails.",
          primaryMetric: experiment.primary_metric_key,
          guardrails: experiment.guardrails.map((guardrail) => guardrail.key),
          segment: experiment.segment_name,
          durationDays: 14,
          sourceHref: "/admin/experiments",
        }),
      })
    );

  const completionArea = input.productAreas.find((area) => area.key === "completion");
  const reportArea = input.productAreas.find((area) => area.key === "report-consumption");

  const releaseItems = input.releases
    .filter(
      (release) =>
        (release.deltaSubmissions > 0 || release.deltaWaitlist > 0) &&
        release.deltaCompletionRate <= -2
    )
    .slice(0, 2)
    .map((release) =>
      makeItem({
        id: `cannibalization-release-${release.id}`,
        title: `Cannibalization signal: ${release.title}`,
        detail: `Top-of-funnel moved up (+${release.deltaSubmissions} starts, +${release.deltaWaitlist} waitlist) while completion fell ${release.deltaCompletionRate}pp after the release.`,
        tone: "risk",
        confidence: "medium",
        capabilities: [
          "feature cannibalization detector",
          "release attribution",
          "workflow protection",
        ],
        recommendation:
          "Treat this as a likely tradeoff between demand generation and workflow quality. Re-evaluate the release against completion and report-consumption guardrails.",
        caveat:
          completionArea?.tone === "risk" || reportArea?.tone === "risk"
            ? `Current experience scores already show pressure in ${[
                completionArea?.tone === "risk" ? "completion" : null,
                reportArea?.tone === "risk" ? "report consumption" : null,
              ]
                .filter(Boolean)
                .join(" and ")}.`
            : null,
        href: "/admin/changelog",
        evidence: [
          makeEvidence(
            "Start delta",
            `${release.deltaSubmissions >= 0 ? "+" : ""}${release.deltaSubmissions}`,
            "/admin/changelog"
          ),
          makeEvidence(
            "Waitlist delta",
            `${release.deltaWaitlist >= 0 ? "+" : ""}${release.deltaWaitlist}`,
            "/admin/changelog"
          ),
          makeEvidence("Completion delta", `${release.deltaCompletionRate}pp`, "/admin/changelog"),
        ],
        draft: draftDesign({
          title: `Tradeoff test: ${release.title}`,
          hypothesis:
            "The release can preserve acquisition gains without degrading completion or report-consumption quality.",
          primaryMetric: release.primaryMetricKey ?? "waitlist_to_start_rate",
          guardrails: ["completion_rate", "report_view_rate"],
          durationDays: 14,
          sourceHref: "/admin/changelog",
        }),
      })
    );

  return [...experimentItems, ...releaseItems].slice(0, 5);
}

function buildSaturationItems(input: {
  channels: Awaited<ReturnType<typeof buildChannelEfficiencySnapshot>>["channels"];
  averageEfficiency: number;
  regions: Awaited<ReturnType<typeof buildGeoLanguageExpansionSnapshot>>["regions"];
}) {
  const channelItems = input.channels
    .filter(
      (channel) =>
        channel.starts >= 20 &&
        channel.action !== "scale" &&
        channel.efficiencyScore <= input.averageEfficiency
    )
    .slice(0, 3)
    .map((channel) =>
      makeItem({
        id: `saturation-channel-${channel.source}`,
        title: `Saturation signal: ${channel.source}`,
        detail: `${channel.starts} starts, ${channel.efficiencyScore} efficiency, ${channel.completionRate}% completion, ${channel.paidRate}% paid rate.`,
        tone: channel.action === "fix" ? "risk" : "watch",
        confidence: channel.confidence,
        capabilities: ["cohort saturation detector", "channel efficiency", "growth allocation"],
        recommendation:
          "This path looks volume-heavy but not quality-expanding. Shift testing toward adjacent channels or stronger cohorts instead of pushing more volume here.",
        href: CHANNEL_EFFICIENCY_HREF,
        evidence: [
          makeEvidence("Starts", String(channel.starts), CHANNEL_EFFICIENCY_HREF),
          makeEvidence("Efficiency", String(channel.efficiencyScore), CHANNEL_EFFICIENCY_HREF),
          makeEvidence("Paid rate", `${channel.paidRate}%`, CHANNEL_EFFICIENCY_HREF),
        ],
        draft: draftDesign({
          title: `Adjacent audience test: ${channel.source}`,
          hypothesis:
            "A narrower adjacent audience will outperform the current saturated acquisition path on downstream quality.",
          primaryMetric: "report_view_rate",
          guardrails: ["completion_rate", "revenue_total"],
          segment: channel.source,
          durationDays: 10,
          sourceHref: CHANNEL_EFFICIENCY_HREF,
        }),
      })
    );

  const regionItems = input.regions
    .filter(
      (region) => region.starts >= 12 && region.attention === "test" && region.readinessScore < 60
    )
    .slice(0, 2)
    .map((region) =>
      makeItem({
        id: `saturation-region-${region.region}`,
        title: `Market saturation watch: ${region.region}`,
        detail: `${region.starts} starts with readiness ${region.readinessScore} and friction score ${region.frictionScore}.`,
        tone: region.frictionScore >= 5 ? "risk" : "watch",
        confidence: confidenceFromSample(region.starts),
        capabilities: ["cohort saturation detector", "geo expansion", "growth planning"],
        recommendation:
          "This market has some demand but weak marginal quality. Improve localization or repositioning before spending harder into it.",
        href: GEO_LANGUAGE_HREF,
        evidence: [
          makeEvidence("Starts", String(region.starts), GEO_LANGUAGE_HREF),
          makeEvidence("Readiness", String(region.readinessScore), GEO_LANGUAGE_HREF),
          makeEvidence("Friction", String(region.frictionScore), GEO_LANGUAGE_HREF),
        ],
        draft: draftDesign({
          title: `Localization test: ${region.region}`,
          hypothesis:
            "Localized value framing will lift quality in this partially saturated market without requiring more raw volume.",
          primaryMetric: "completion_rate",
          guardrails: ["report_view_rate", "revenue_total"],
          segment: region.region,
          durationDays: 14,
          sourceHref: GEO_LANGUAGE_HREF,
        }),
      })
    );

  return [...channelItems, ...regionItems].slice(0, 5);
}

function buildConflictItems(input: {
  metricStatuses: Awaited<ReturnType<typeof buildMetricStatusSnapshot>>["statuses"];
  leadingIndicators: Awaited<ReturnType<typeof buildMetricStatusSnapshot>>["leadingIndicators"];
  releases: Awaited<ReturnType<typeof buildReleaseImpactSnapshot>>["releases"];
  experiments: ExperimentSnapshot[];
}) {
  const leadingConflicts = input.leadingIndicators
    .filter((item) => item.signalState === "negative")
    .slice(0, 2)
    .map((item) =>
      makeItem({
        id: `conflict-leading-${item.metricKey}`,
        title: `Narrative conflict: ${item.metricLabel}`,
        detail: `${item.metricLabel} is ${item.statusState}, but its leading signal ${item.leadingMetricLabel} is already negative.`,
        tone: item.statusState === "on-track" ? "watch" : "risk",
        confidence: "high",
        capabilities: [
          "metric narrative conflict detector",
          "leading indicators",
          "strategy hygiene",
        ],
        recommendation:
          "Do not rely on the lagging metric story alone. Reconcile the leading signal before you call the metric stable.",
        href: item.href,
        evidence: [
          makeEvidence("Metric state", item.statusState, item.href),
          makeEvidence("Leading signal", item.leadingMetricLabel, item.href),
          makeEvidence("Signal state", item.signalState, item.href),
        ],
        draft: makeDraft(
          "investigation",
          `Reconcile metric conflict: ${item.metricLabel}`,
          item.detail,
          item.href
        ),
      })
    );

  const releaseConflicts = input.releases
    .filter((release) => release.attention === "lift" && release.primaryMetricKey)
    .map((release) => {
      const status = input.metricStatuses.find(
        (item) => item.metricKey === release.primaryMetricKey
      );
      if (!status || (status.statusState !== "off-track" && status.statusState !== "critical")) {
        return null;
      }
      return makeItem({
        id: `conflict-release-${release.id}`,
        title: `Narrative conflict: ${release.title}`,
        detail: `Release impact looks positive, but the linked metric ${status.label} is still ${status.statusState}.`,
        tone: "watch",
        confidence: "medium",
        capabilities: ["metric narrative conflict detector", "release impact", "decision review"],
        recommendation:
          "Treat the release lift as provisional. The metric board still says the core KPI is off-track, so there is likely a timing or attribution mismatch.",
        href: "/admin/changelog",
        evidence: [
          makeEvidence("Release attention", release.attention, "/admin/changelog"),
          makeEvidence("Metric state", status.statusState, status.linkedHref),
          makeEvidence("Metric", status.label, status.linkedHref),
        ],
        draft: makeDraft(
          "investigation",
          `Reconcile release conflict: ${release.title}`,
          "Release impact and metric board are telling different stories; validate attribution and timing.",
          "/admin/changelog"
        ),
      });
    })
    .filter((item): item is AdminIntelligenceItem => Boolean(item))
    .slice(0, 2);

  const experimentConflicts = input.experiments
    .filter(
      (experiment) =>
        experiment.readout.significance === "significant-lift" &&
        experiment.primaryMetric.status === "risk"
    )
    .slice(0, 1)
    .map((experiment) =>
      makeItem({
        id: `conflict-experiment-${experiment.id}`,
        title: `Narrative conflict: ${experiment.name}`,
        detail: `The readout says variant winning, but the live primary metric ${experiment.primaryMetric.label} is currently risk-state.`,
        tone: "watch",
        confidence: experiment.confidence,
        capabilities: [
          "metric narrative conflict detector",
          "experiment readout",
          "live metric validation",
        ],
        recommendation:
          "Reconcile experiment lift with live metric posture before scaling. The test result may be real but not durable in production conditions.",
        href: "/admin/experiments",
        evidence: [
          makeEvidence("Winner", experiment.readout.winnerLabel, "/admin/experiments"),
          makeEvidence(
            "Live metric state",
            experiment.primaryMetric.status,
            experiment.primaryMetric.href
          ),
          makeEvidence("Confidence", `${experiment.confidenceScore}%`, "/admin/experiments"),
        ],
        draft: makeDraft(
          "investigation",
          `Validate live durability: ${experiment.name}`,
          "Readout and live metric posture disagree; validate whether the lift survives production reality.",
          "/admin/experiments"
        ),
      })
    );

  return [...leadingConflicts, ...releaseConflicts, ...experimentConflicts].slice(0, 5);
}

function buildDraftItems(input: {
  cannibalizationItems: AdminIntelligenceItem[];
  saturationItems: AdminIntelligenceItem[];
  conflictItems: AdminIntelligenceItem[];
}) {
  return [
    ...input.cannibalizationItems.slice(0, 2),
    ...input.saturationItems.slice(0, 2),
    ...input.conflictItems.slice(0, 1),
  ]
    .map((item, index) =>
      makeItem({
        id: `draft-${item.id}-${index}`,
        title: `Experiment draft: ${item.title}`,
        detail: item.draft?.detail ?? item.detail,
        tone: item.tone,
        confidence: item.confidence,
        capabilities: ["auto-generated experiment design drafts", ...item.capabilities.slice(0, 2)],
        recommendation:
          "Use this as a ready design stub: hypothesis, primary metric, guardrails, and suggested scope are already grounded from current evidence.",
        href: item.href,
        caveat: item.caveat,
        evidence: item.evidence,
        draft: item.draft,
      })
    )
    .slice(0, 5);
}

export async function buildExperimentStrategySnapshot(
  inputDays: number,
  adminEmail: string
): Promise<AdminIntelligenceSnapshot> {
  const days = ensureDays(inputDays);
  const [
    experimentRegistry,
    releaseImpact,
    metricStatus,
    productExperience,
    channels,
    geoExpansion,
  ] = await Promise.all([
    buildExperimentRegistrySnapshot(adminEmail),
    buildReleaseImpactSnapshot(days),
    buildMetricStatusSnapshot(days),
    buildProductExperienceHealthSnapshot(days),
    buildChannelEfficiencySnapshot(days),
    buildGeoLanguageExpansionSnapshot(days),
  ]);

  const cannibalizationItems = buildCannibalizationItems({
    experiments: experimentRegistry.experiments,
    releases: releaseImpact.releases,
    productAreas: productExperience.areas,
  });
  const saturationItems = buildSaturationItems({
    channels: channels.channels,
    averageEfficiency: channels.summary.avgEfficiencyScore,
    regions: geoExpansion.regions,
  });
  const conflictItems = buildConflictItems({
    metricStatuses: metricStatus.statuses,
    leadingIndicators: metricStatus.leadingIndicators,
    releases: releaseImpact.releases,
    experiments: experimentRegistry.experiments,
  });
  const draftItems = buildDraftItems({
    cannibalizationItems,
    saturationItems,
    conflictItems,
  });

  return {
    generatedAt: new Date().toISOString(),
    days,
    surface: "experiments",
    title: "Experiment Strategy Intelligence",
    headline: `${cannibalizationItems.length} cannibalization alerts, ${saturationItems.length} saturation alerts, and ${draftItems.length} grounded experiment drafts are ready now.`,
    summary:
      "This layer turns the experiments surface into a strategy console: it catches when wins are hurting something else, when cohorts are saturating, when admin stories disagree, and it turns those gaps into experiment-ready drafts.",
    prompts: [
      {
        label: "Cannibalization",
        query: "Which experiment or release is likely cannibalizing another KPI?",
      },
      { label: "Saturation", query: "Which cohort or channel looks saturated?" },
      { label: "Next test", query: "What experiment should we design next?" },
    ],
    sections: filterSections([
      makeSection(
        "cannibalization",
        "Cannibalization Alerts",
        "Signals that a win on one metric may be degrading another KPI or workflow.",
        cannibalizationItems
      ),
      makeSection(
        "saturation",
        "Saturation Alerts",
        "Signals that a cohort, market, or channel is taking more volume without proportionate downstream quality.",
        saturationItems
      ),
      makeSection(
        "conflicts",
        "Narrative Conflicts",
        "Cases where release impact, experiment readouts, and live metric posture are telling different stories.",
        conflictItems
      ),
      makeSection(
        "drafts",
        "Experiment Design Drafts",
        "Ready-to-run draft experiments generated directly from the strongest current risks and contradictions.",
        draftItems
      ),
    ]),
  };
}
