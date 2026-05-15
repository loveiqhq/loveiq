import { buildChannelEfficiencySnapshot } from "@features/admin/server/channel-efficiency";
import { buildConversionLeakDebuggerSnapshot } from "@features/admin/server/conversion-leak-debugger";
import { buildGeoLanguageExpansionSnapshot } from "@features/admin/server/geo-language-expansion";
import { clampDays } from "@features/admin/server/next-level";
import { buildReplayPathClustersSnapshot } from "@features/admin/server/replay-paths";
import { buildValueRealizationSnapshot } from "@features/admin/server/value-realization";
import type {
  AdminIntelligenceDraft,
  AdminIntelligenceEvidence,
  AdminIntelligenceItem,
  AdminIntelligenceSection,
  AdminIntelligenceSnapshot,
  AdminIntelligenceTone,
} from "@features/admin/server/intelligence-types";

const RETENTION_HREF = "/admin/retention";
const SEGMENTS_HREF = "/admin/segments";

function buildGrowthTabHref(tab: string) {
  return `/admin/growth?${new URLSearchParams({ tab }).toString()}`;
}

const GEO_HREF = buildGrowthTabHref("Geo & Language");

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
      kind === "brief" || kind === "segment"
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

function replayHref(sessionId: string | null) {
  return sessionId
    ? `/admin/replay?${new URLSearchParams({ sessionId }).toString()}`
    : "/admin/replay";
}

function ruleSummary(parts: string[]) {
  return parts.join(" AND ");
}

export async function buildGrowthOpportunitySnapshot(
  inputDays: number,
  adminEmail: string
): Promise<AdminIntelligenceSnapshot> {
  const days = ensureDays(inputDays);
  const [replay, value, geo, channels, leak] = await Promise.all([
    buildReplayPathClustersSnapshot(days),
    buildValueRealizationSnapshot(days),
    buildGeoLanguageExpansionSnapshot(days),
    buildChannelEfficiencySnapshot(days),
    buildConversionLeakDebuggerSnapshot(days, adminEmail),
  ]);

  const frictionItems = replay.clusters
    .filter((cluster) => cluster.label !== "Completed Cleanly")
    .slice(0, 3)
    .map((cluster) =>
      makeItem({
        id: `growth-friction-${cluster.label}`,
        title: `Friction cluster: ${cluster.label}`,
        detail: `${cluster.sessions} sessions cluster here with ${cluster.abandonmentRate}% abandonment. Likely cause: ${cluster.likelyCause}.`,
        tone: cluster.abandonmentRate >= 65 ? "risk" : "watch",
        confidence: cluster.sessions >= 30 ? "high" : cluster.sessions >= 12 ? "medium" : "low",
        capabilities: ["session-friction clustering", "replay linking", "growth journey diagnosis"],
        recommendation:
          "Open the representative replay session and validate whether the friction is messaging, path continuity, or product comprehension before changing traffic mix.",
        href: replayHref(cluster.sampleSessionId),
        caveat:
          cluster.sampleSessionId == null
            ? "This cluster is aggregated only; there is no representative replay session available."
            : null,
        evidence: [
          makeEvidence("Sessions", String(cluster.sessions), replayHref(cluster.sampleSessionId)),
          makeEvidence(
            "Abandonment",
            `${cluster.abandonmentRate}%`,
            replayHref(cluster.sampleSessionId)
          ),
          makeEvidence("Likely cause", cluster.likelyCause, replayHref(cluster.sampleSessionId)),
        ],
        draft: makeDraft(
          "investigation",
          `Review ${cluster.label.toLowerCase()} friction cluster`,
          cluster.likelyCause,
          replayHref(cluster.sampleSessionId)
        ),
      })
    );

  const strongestLeak = leak.priorities[0];
  if (strongestLeak) {
    frictionItems.push(
      makeItem({
        id: `growth-friction-leak-${strongestLeak.dimension}-${strongestLeak.label}`,
        title: `Leak-linked cluster: ${strongestLeak.label}`,
        detail: `${strongestLeak.leakStageLabel} is losing ${strongestLeak.leakCount} users at ${strongestLeak.leakRate}% leakage.`,
        tone: strongestLeak.leakRate >= 30 ? "risk" : "watch",
        confidence: strongestLeak.confidence,
        capabilities: ["session-friction clustering", "leak debugger", "growth diagnosis"],
        recommendation: strongestLeak.explanation,
        href: strongestLeak.href,
        evidence: [
          makeEvidence("Dimension", strongestLeak.dimension, strongestLeak.href),
          makeEvidence("Leak rate", `${strongestLeak.leakRate}%`, strongestLeak.href),
        ],
        draft: makeDraft(
          "investigation",
          `Inspect ${strongestLeak.dimension} leak cluster`,
          strongestLeak.explanation,
          strongestLeak.href
        ),
      })
    );
  }

  const retentionSignal = [...value.signals]
    .sort(
      (left, right) => right.retentionLift - left.retentionLift || right.audience - left.audience
    )
    .slice(0, 2);
  const retentionChannel = [...value.channels]
    .filter((channel) => channel.starts >= 10)
    .sort(
      (left, right) =>
        right.retentionLift - left.retentionLift ||
        right.valueRealizationScore - left.valueRealizationScore
    )[0];
  const retentionArchetype = [...value.archetypes]
    .filter((archetype) => archetype.starts >= 8)
    .sort(
      (left, right) =>
        right.retentionLift - left.retentionLift ||
        right.valueRealizationScore - left.valueRealizationScore
    )[0];

  const retentionItems = [
    ...retentionSignal.map((signal) =>
      makeItem({
        id: `growth-retention-signal-${signal.signal}`,
        title: `Retention driver: ${signal.signal}`,
        detail: `${signal.retentionLift}pp retention lift across ${signal.audience} users.`,
        tone: signal.retentionLift >= 6 ? "good" : signal.retentionLift >= 3 ? "watch" : "neutral",
        confidence: signal.audience >= 30 ? "high" : signal.audience >= 12 ? "medium" : "low",
        capabilities: ["retention driver model", "value realization", "growth lifecycle"],
        recommendation:
          signal.signal === "Multi-Day Return"
            ? "Make second-day return an explicit lifecycle milestone and optimize toward it."
            : `Design the funnel so more users reach ${signal.signal.toLowerCase()} earlier.`,
        href: RETENTION_HREF,
        evidence: [
          makeEvidence("Audience", String(signal.audience), RETENTION_HREF),
          makeEvidence("Retention lift", `${signal.retentionLift}pp`, RETENTION_HREF),
          makeEvidence("Upgrade lift", `${signal.upgradeIntentLift}pp`, RETENTION_HREF),
        ],
        draft: makeDraft(
          "hypothesis",
          `Strengthen ${signal.signal.toLowerCase()}`,
          `Users who reach ${signal.signal.toLowerCase()} retain better. Test ways to bring that behavior forward in the lifecycle.`,
          RETENTION_HREF
        ),
      })
    ),
    ...(retentionChannel
      ? [
          makeItem({
            id: `growth-retention-channel-${retentionChannel.source}`,
            title: `Retention-leading channel: ${retentionChannel.source}`,
            detail: `${retentionChannel.retentionLift}pp retention lift with ${retentionChannel.starts} starts and score ${retentionChannel.valueRealizationScore}.`,
            tone:
              retentionChannel.retentionLift >= 5
                ? "good"
                : retentionChannel.retentionLift >= 2
                  ? "watch"
                  : "neutral",
            confidence:
              retentionChannel.starts >= 25
                ? "high"
                : retentionChannel.starts >= 12
                  ? "medium"
                  : "low",
            capabilities: ["retention driver model", "channel quality", "growth allocation"],
            recommendation:
              "Use this source as the retention-quality benchmark before scaling weaker channels.",
            href: buildGrowthTabHref("Channel Efficiency"),
            evidence: [
              makeEvidence(
                "Starts",
                String(retentionChannel.starts),
                buildGrowthTabHref("Channel Efficiency")
              ),
              makeEvidence(
                "Retention lift",
                `${retentionChannel.retentionLift}pp`,
                buildGrowthTabHref("Channel Efficiency")
              ),
              makeEvidence(
                "Paid lift",
                `${retentionChannel.monetizationLift}pp`,
                buildGrowthTabHref("Channel Efficiency")
              ),
            ],
            draft: makeDraft(
              "brief",
              `Document retention benchmark: ${retentionChannel.source}`,
              "Use this channel as the benchmark when evaluating weaker acquisition paths.",
              buildGrowthTabHref("Channel Efficiency")
            ),
          }),
        ]
      : []),
    ...(retentionArchetype
      ? [
          makeItem({
            id: `growth-retention-archetype-${retentionArchetype.archetype}`,
            title: `Retention-leading archetype: ${retentionArchetype.archetype}`,
            detail: `${retentionArchetype.retentionLift}pp retention lift with ${retentionArchetype.starts} starts and score ${retentionArchetype.valueRealizationScore}.`,
            tone:
              retentionArchetype.retentionLift >= 5
                ? "good"
                : retentionArchetype.retentionLift >= 2
                  ? "watch"
                  : "neutral",
            confidence:
              retentionArchetype.starts >= 20
                ? "high"
                : retentionArchetype.starts >= 10
                  ? "medium"
                  : "low",
            capabilities: ["retention driver model", "cohort intelligence", "growth quality"],
            recommendation:
              "Use this cohort to learn what durable value looks like before broadening acquisition targeting.",
            href: "/admin/archetypes",
            evidence: [
              makeEvidence("Starts", String(retentionArchetype.starts), "/admin/archetypes"),
              makeEvidence(
                "Retention lift",
                `${retentionArchetype.retentionLift}pp`,
                "/admin/archetypes"
              ),
              makeEvidence(
                "Referral lift",
                `${retentionArchetype.referralLift}pp`,
                "/admin/archetypes"
              ),
            ],
            draft: makeDraft(
              "brief",
              `Profile durable cohort: ${retentionArchetype.archetype}`,
              "Capture what this cohort does differently and turn it into acquisition and lifecycle guidance.",
              "/admin/archetypes"
            ),
          }),
        ]
      : []),
  ].slice(0, 4);

  const topRegion = geo.regions.find(
    (region) => region.attention === "expand" || region.attention === "test"
  );
  const topArchetype = value.archetypes.find((archetype) => archetype.starts >= 8);
  const topSignal = retentionSignal[0];
  const segmentItems: AdminIntelligenceItem[] = [];

  if (topArchetype) {
    const rules = ruleSummary([`archetype eq ${topArchetype.archetype}`]);
    segmentItems.push(
      makeItem({
        id: `growth-segment-archetype-${topArchetype.archetype}`,
        title: `Segment candidate: ${topArchetype.archetype}`,
        detail: `Rule: ${rules}. This cohort shows ${topArchetype.retentionLift}pp retention lift and ${topArchetype.monetizationLift}pp monetization lift.`,
        tone: topArchetype.valueRealizationScore >= 60 ? "good" : "watch",
        confidence:
          topArchetype.starts >= 20 ? "high" : topArchetype.starts >= 10 ? "medium" : "low",
        capabilities: ["segment creation copilot", "cohort intelligence", "growth targeting"],
        recommendation:
          "Save this segment and compare new experiments against it instead of treating all retained users as one cohort.",
        href: SEGMENTS_HREF,
        evidence: [
          makeEvidence("Starts", String(topArchetype.starts), SEGMENTS_HREF),
          makeEvidence("Retention lift", `${topArchetype.retentionLift}pp`, SEGMENTS_HREF),
          makeEvidence("Value score", String(topArchetype.valueRealizationScore), SEGMENTS_HREF),
        ],
        draft: makeDraft(
          "segment",
          `Create segment: ${topArchetype.archetype}`,
          rules,
          SEGMENTS_HREF
        ),
      })
    );
  }

  if (topRegion && topRegion.region !== "Unknown") {
    const rules = ruleSummary([`country contains ${topRegion.region}`]);
    segmentItems.push(
      makeItem({
        id: `growth-segment-region-${topRegion.region}`,
        title: `Segment candidate: ${topRegion.region}`,
        detail: `Rule: ${rules}. Region readiness is ${topRegion.readinessScore} with ${topRegion.starts} starts.`,
        tone: topRegion.attention === "expand" ? "good" : "watch",
        confidence: topRegion.starts >= 20 ? "high" : topRegion.starts >= 10 ? "medium" : "low",
        capabilities: ["segment creation copilot", "geo expansion", "growth targeting"],
        recommendation:
          "Save this region as its own segment before running broader localization or spend changes.",
        href: SEGMENTS_HREF,
        evidence: [
          makeEvidence("Starts", String(topRegion.starts), GEO_HREF),
          makeEvidence("Readiness", String(topRegion.readinessScore), GEO_HREF),
          makeEvidence("Dominant language", topRegion.dominantLanguage, GEO_HREF),
        ],
        draft: makeDraft("segment", `Create segment: ${topRegion.region}`, rules, SEGMENTS_HREF),
      })
    );
  }

  if (topSignal) {
    const rules = ruleSummary(["has_report eq true", "has_payment eq false"]);
    segmentItems.push(
      makeItem({
        id: "growth-segment-engaged-non-paying",
        title: "Segment candidate: engaged non-payers",
        detail: `Rule: ${rules}. This is the cleanest lifecycle segment for testing value reinforcement because ${topSignal.signal} currently leads retention.`,
        tone: "watch",
        confidence: topSignal.audience >= 20 ? "high" : "medium",
        capabilities: ["segment creation copilot", "lifecycle targeting", "growth experiments"],
        recommendation:
          "Save this segment and use it for recovery, pricing, and value-clarity experiments before widening acquisition changes.",
        href: SEGMENTS_HREF,
        evidence: [
          makeEvidence("Lead signal", topSignal.signal, RETENTION_HREF),
          makeEvidence("Retention lift", `${topSignal.retentionLift}pp`, RETENTION_HREF),
          makeEvidence("Audience", String(topSignal.audience), RETENTION_HREF),
        ],
        draft: makeDraft("segment", "Create segment: engaged non-payers", rules, SEGMENTS_HREF),
      })
    );
  }

  const expansionItems: AdminIntelligenceItem[] = [];
  const adjacentChannel = channels.channels.find(
    (channel) => channel.action === "scale" && channel.starts < 25 && channel.starts >= 8
  );
  if (adjacentChannel) {
    expansionItems.push(
      makeItem({
        id: `growth-audience-channel-${adjacentChannel.source}`,
        title: `Expand adjacent audience from ${adjacentChannel.source}`,
        detail: `${adjacentChannel.source} has strong downstream quality at moderate volume: ${adjacentChannel.completionRate}% completion, ${adjacentChannel.paidRate}% paid rate, ${adjacentChannel.efficiencyScore} efficiency.`,
        tone: "good",
        confidence: adjacentChannel.confidence,
        capabilities: [
          "audience expansion recommender",
          "channel intelligence",
          "growth allocation",
        ],
        recommendation:
          "Scale into adjacent audiences around this source before increasing spend on weaker high-volume channels.",
        href: buildGrowthTabHref("Channel Efficiency"),
        evidence: [
          makeEvidence(
            "Starts",
            String(adjacentChannel.starts),
            buildGrowthTabHref("Channel Efficiency")
          ),
          makeEvidence(
            "Efficiency",
            String(adjacentChannel.efficiencyScore),
            buildGrowthTabHref("Channel Efficiency")
          ),
          makeEvidence(
            "Paid rate",
            `${adjacentChannel.paidRate}%`,
            buildGrowthTabHref("Channel Efficiency")
          ),
        ],
        draft: makeDraft(
          "action",
          `Expand adjacent audience from ${adjacentChannel.source}`,
          "Use the strongest moderate-volume source to test adjacent audiences before scaling weaker paths.",
          buildGrowthTabHref("Channel Efficiency")
        ),
      })
    );
  }

  if (topRegion && topRegion.attention === "expand") {
    expansionItems.push(
      makeItem({
        id: `growth-audience-region-${topRegion.region}`,
        title: `Expand into ${topRegion.region}`,
        detail: `${topRegion.region} leads the current expansion view with readiness ${topRegion.readinessScore} and friction score ${topRegion.frictionScore}.`,
        tone: "good",
        confidence: topRegion.starts >= 15 ? "high" : "medium",
        capabilities: ["audience expansion recommender", "geo expansion", "growth planning"],
        recommendation:
          "Test broader acquisition and clearer localization in this market before opening lower-readiness regions.",
        href: GEO_HREF,
        evidence: [
          makeEvidence("Starts", String(topRegion.starts), GEO_HREF),
          makeEvidence("Readiness", String(topRegion.readinessScore), GEO_HREF),
          makeEvidence("Paid rate", `${topRegion.paidRate}%`, GEO_HREF),
        ],
        draft: makeDraft(
          "action",
          `Expand ${topRegion.region}`,
          "This market is showing the strongest readiness for deeper testing and broader acquisition.",
          GEO_HREF
        ),
      })
    );
  }

  if (topArchetype) {
    expansionItems.push(
      makeItem({
        id: `growth-audience-archetype-${topArchetype.archetype}`,
        title: `Expand around ${topArchetype.archetype}`,
        detail: `${topArchetype.archetype} combines ${topArchetype.retentionLift}pp retention lift and ${topArchetype.referralLift}pp referral lift.`,
        tone: topArchetype.valueRealizationScore >= 60 ? "good" : "watch",
        confidence:
          topArchetype.starts >= 20 ? "high" : topArchetype.starts >= 10 ? "medium" : "low",
        capabilities: [
          "audience expansion recommender",
          "archetype intelligence",
          "growth targeting",
        ],
        recommendation:
          "Use this cohort as the next adjacent audience to target, not just as a reporting cohort.",
        href: "/admin/archetypes",
        evidence: [
          makeEvidence("Starts", String(topArchetype.starts), "/admin/archetypes"),
          makeEvidence("Retention lift", `${topArchetype.retentionLift}pp`, "/admin/archetypes"),
          makeEvidence("Referral lift", `${topArchetype.referralLift}pp`, "/admin/archetypes"),
        ],
        draft: makeDraft(
          "hypothesis",
          `Target more users like ${topArchetype.archetype}`,
          "This cohort looks like a strong adjacent audience for growth targeting.",
          "/admin/archetypes"
        ),
      })
    );
  }

  return {
    generatedAt: new Date().toISOString(),
    days,
    surface: "growth",
    title: "Growth Opportunity Intelligence",
    headline: `${frictionItems.length} friction clusters, ${retentionItems.length} retention drivers, and ${segmentItems.length + expansionItems.length} audience opportunities are ready in the current window.`,
    summary:
      "This layer ranks the next growth opportunities directly from existing behavior: where sessions cluster into friction, what most strongly drives retention, which cohorts deserve to become saved segments, and which adjacent audiences look most ready to expand.",
    prompts: [
      {
        label: "Main friction cluster",
        query: "Which growth friction cluster should we inspect first?",
      },
      { label: "Retention driver", query: "What is the strongest retention driver right now?" },
      { label: "Next audience", query: "Which audience should we expand into next?" },
    ],
    sections: filterSections([
      makeSection(
        "friction",
        "Friction Clusters",
        "Replay-backed session clusters and leak-linked friction patterns that deserve direct inspection.",
        frictionItems.slice(0, 4)
      ),
      makeSection(
        "retention",
        "Retention Drivers",
        "Behaviors, channels, and cohorts most associated with durable return and downstream value.",
        retentionItems
      ),
      makeSection(
        "segments",
        "Segment Copilot",
        "High-signal cohorts that should be promoted into saved admin segments.",
        segmentItems
      ),
      makeSection(
        "audiences",
        "Audience Expansion",
        "Adjacent audiences with enough quality signal to justify deeper testing or broader spend.",
        expansionItems
      ),
    ]),
  };
}
