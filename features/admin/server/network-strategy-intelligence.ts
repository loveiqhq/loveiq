import { buildGrowthControlTowerSnapshot } from "@features/admin/server/growth-control-tower";
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
import { buildReferralIntelligenceSnapshot } from "@features/admin/server/referral-intelligence";
import { buildStrategyPlanningSnapshot } from "@features/admin/server/strategy-planning";

type NetworkStrategySurface = Extract<AdminIntelligenceSurface, "growth" | "strategy">;

function ensureDays(value: number): number {
  return clampDays(Number.isFinite(value) ? Math.round(value) : 30, 7, 365);
}

function parseSurface(value: string | null): NetworkStrategySurface {
  return value === "strategy" ? "strategy" : "growth";
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

function confidenceFromCount(value: number): "high" | "medium" | "low" {
  if (value >= 30) return "high";
  if (value >= 10) return "medium";
  return "low";
}

function growthHref(tab: string) {
  return `/admin/growth?${new URLSearchParams({ tab }).toString()}`;
}

function impactWeight(level: "low" | "medium" | "high" | "critical") {
  if (level === "critical") return 4;
  if (level === "high") return 3;
  if (level === "medium") return 2;
  return 1;
}

function thresholdScore(input: {
  totalInvites: number;
  uniqueReferrers: number;
  viralCoefficient: number;
  avgChainDepth: number;
  highQualityReferrers: number;
  blindspotInvites: number;
  suspiciousReferrers: number;
}): number {
  const inviteScale = Math.min(input.totalInvites / 30, 1) * 20;
  const referralBase =
    input.uniqueReferrers > 0
      ? Math.min(input.highQualityReferrers / input.uniqueReferrers, 1) * 15
      : 0;
  const viral = Math.min(input.viralCoefficient / 1, 1) * 35;
  const depth = Math.min(input.avgChainDepth / 1.5, 1) * 20;
  const blindspotPenalty =
    input.totalInvites > 0 ? Math.min(input.blindspotInvites / input.totalInvites, 1) * 10 : 0;
  const suspiciousPenalty = Math.min(input.suspiciousReferrers * 4, 10);
  return Math.max(
    0,
    Math.min(
      100,
      Math.round(inviteScale + referralBase + viral + depth - blindspotPenalty - suspiciousPenalty)
    )
  );
}

function buildNetworkEffectItems(input: {
  referral: Awaited<ReturnType<typeof buildReferralIntelligenceSnapshot>>;
  tower: Awaited<ReturnType<typeof buildGrowthControlTowerSnapshot>>;
}): AdminIntelligenceItem[] {
  const referralHref = growthHref("Referral Chains");
  const score = thresholdScore(input.referral.summary);
  const thresholdState =
    score >= 75
      ? { title: "Network effect threshold reached", tone: "good" as const }
      : score >= 50
        ? { title: "Network effect threshold is approaching", tone: "watch" as const }
        : { title: "Network effect threshold is not reached", tone: "risk" as const };

  const items: AdminIntelligenceItem[] = [
    makeItem({
      id: "network-threshold-state",
      title: thresholdState.title,
      detail: `Threshold score ${score}. Viral coefficient ${input.referral.summary.viralCoefficient}, average chain depth ${input.referral.summary.avgChainDepth}, and ${input.referral.summary.highQualityReferrers} high-quality referrers across ${input.referral.summary.uniqueReferrers}.`,
      tone: thresholdState.tone,
      confidence: confidenceFromCount(input.referral.summary.totalInvites),
      capabilities: [
        "network-effect threshold tracker",
        "referral compounding",
        "growth durability",
      ],
      recommendation:
        score >= 75
          ? "The referral loop is close to self-sustaining. Protect quality and reduce avoidable friction before adding more volume."
          : score >= 50
            ? "The loop is getting close, but compounding is still fragile. Focus on second-hop propagation and clean attribution before calling it self-sustaining."
            : "Referral remains a useful channel, not a self-sustaining loop. Improve propagation and attribution before treating it like a network effect.",
      caveat: input.referral.trust.warning ?? input.tower.trustWarnings[0] ?? null,
      href: referralHref,
      evidence: [
        makeEvidence("Threshold score", String(score), referralHref),
        makeEvidence(
          "Viral coefficient",
          String(input.referral.summary.viralCoefficient),
          referralHref
        ),
        makeEvidence("Avg chain depth", String(input.referral.summary.avgChainDepth), referralHref),
        makeEvidence(
          "High-quality referrers",
          String(input.referral.summary.highQualityReferrers),
          referralHref
        ),
      ],
      draft: makeDraft(
        "brief",
        "Review network-effect readiness",
        "Capture whether the referral loop is truly compounding yet or still depends on manual seeding.",
        referralHref
      ),
    }),
  ];

  const bestSegment = [...input.referral.segments].sort(
    (left, right) =>
      right.avgChainDepth - left.avgChainDepth ||
      right.avgQualityScore - left.avgQualityScore ||
      right.invites - left.invites
  )[0];
  if (bestSegment) {
    items.push(
      makeItem({
        id: `network-threshold-segment-${bestSegment.segmentLabel}`,
        title: `Loop seed segment: ${bestSegment.segmentLabel}`,
        detail: `${bestSegment.invites} invites, ${bestSegment.avgChainDepth} average chain depth, ${bestSegment.avgQualityScore} average quality, ${bestSegment.flaggedReferrers} flagged referrers.`,
        tone:
          bestSegment.avgChainDepth >= 1.2 && bestSegment.flaggedReferrers === 0
            ? "good"
            : bestSegment.avgChainDepth >= 0.8
              ? "watch"
              : "risk",
        confidence: confidenceFromCount(bestSegment.invites),
        capabilities: ["network-effect threshold tracker", "loop seeding", "segment quality"],
        recommendation:
          bestSegment.avgChainDepth >= 1.2
            ? "Use this segment as the reference pattern for referral-led growth. It is the closest thing to a loop engine right now."
            : "This segment is the best current seed, but it still lacks enough second-hop depth to behave like a durable network effect.",
        href: referralHref,
        evidence: [
          makeEvidence("Invites", String(bestSegment.invites), referralHref),
          makeEvidence("Avg chain depth", String(bestSegment.avgChainDepth), referralHref),
          makeEvidence("Quality", String(bestSegment.avgQualityScore), referralHref),
        ],
        draft: makeDraft(
          "hypothesis",
          `Strengthen referral seed in ${bestSegment.segmentLabel}`,
          "Test whether improving invite flow for the best current segment can push the loop over the self-sustaining threshold.",
          referralHref
        ),
      })
    );
  }

  return items.slice(0, 2);
}

function buildViralityDebuggerItems(
  referral: Awaited<ReturnType<typeof buildReferralIntelligenceSnapshot>>
): AdminIntelligenceItem[] {
  const referralHref = growthHref("Referral Chains");
  const coverageRate = referral.trust.recipientCoverageRate;
  const bottlenecks: AdminIntelligenceItem[] = [];

  if (coverageRate < 60) {
    bottlenecks.push(
      makeItem({
        id: "virality-bottleneck-coverage",
        title: "Loop blindspot: recipient attribution",
        detail: `${coverageRate}% recipient coverage leaves ${referral.summary.blindspotInvites} invites without clean downstream linkage.`,
        tone: coverageRate < 40 ? "risk" : "watch",
        confidence: confidenceFromCount(referral.summary.totalInvites),
        capabilities: ["virality loop debugger", "attribution hygiene", "loop observability"],
        recommendation:
          "Capture more recipient identity and invite completion links before diagnosing viral quality from aggregate invite counts alone.",
        href: referralHref,
        evidence: [
          makeEvidence("Recipient coverage", `${coverageRate}%`, referralHref),
          makeEvidence(
            "Blindspot invites",
            String(referral.summary.blindspotInvites),
            referralHref
          ),
        ],
        draft: makeDraft(
          "action",
          "Fix referral attribution coverage",
          "Recipient capture is too weak to trust the current virality diagnosis.",
          referralHref
        ),
      })
    );
  }

  if (referral.summary.avgChainDepth < 1) {
    bottlenecks.push(
      makeItem({
        id: "virality-bottleneck-depth",
        title: "Loop break: second-hop propagation",
        detail: `Average chain depth is ${referral.summary.avgChainDepth}, which means most invitees are not becoming referrers themselves.`,
        tone: referral.summary.avgChainDepth < 0.5 ? "risk" : "watch",
        confidence: confidenceFromCount(referral.summary.totalInvites),
        capabilities: ["virality loop debugger", "propagation analysis", "growth loop design"],
        recommendation:
          "The main break is after first conversion. Improve post-conversion invite prompts or the perceived shareable value before adding more top-of-loop traffic.",
        href: referralHref,
        evidence: [
          makeEvidence("Avg chain depth", String(referral.summary.avgChainDepth), referralHref),
          makeEvidence("Unique referrers", String(referral.summary.uniqueReferrers), referralHref),
        ],
        draft: makeDraft(
          "investigation",
          "Diagnose second-hop referral failure",
          "Users are accepting invites but not propagating the loop further.",
          referralHref
        ),
      })
    );
  }

  if (referral.summary.suspiciousReferrers > 0) {
    bottlenecks.push(
      makeItem({
        id: "virality-bottleneck-trust",
        title: "Loop drag: risky referral quality",
        detail: `${referral.summary.suspiciousReferrers} referrers are flagged as suspicious, which contaminates loop quality and trust.`,
        tone: referral.summary.suspiciousReferrers >= 3 ? "risk" : "watch",
        confidence: confidenceFromCount(referral.summary.uniqueReferrers),
        capabilities: ["virality loop debugger", "loop trust", "fraud pressure"],
        recommendation:
          "Reduce suspicious invite behavior before calling any viral lift durable. A contaminated loop creates false confidence and weak downstream quality.",
        href: referralHref,
        evidence: [
          makeEvidence(
            "Suspicious referrers",
            String(referral.summary.suspiciousReferrers),
            referralHref
          ),
          makeEvidence("Unique referrers", String(referral.summary.uniqueReferrers), referralHref),
        ],
        draft: makeDraft(
          "investigation",
          "Review suspicious referral patterns",
          "Risky invite behavior is reducing confidence in the loop’s real compounding quality.",
          referralHref
        ),
      })
    );
  }

  if (bottlenecks.length === 0) {
    bottlenecks.push(
      makeItem({
        id: "virality-bottleneck-none",
        title: "No dominant virality bottleneck",
        detail:
          "Attribution, second-hop depth, and referral quality all cleared the current debugging thresholds.",
        tone: "good",
        confidence: "medium",
        capabilities: ["virality loop debugger", "growth loop health"],
        recommendation:
          "The referral loop looks mechanically healthy. Focus next on scaling the strongest seed segments without breaking quality.",
        href: referralHref,
        evidence: [
          makeEvidence(
            "Viral coefficient",
            String(referral.summary.viralCoefficient),
            referralHref
          ),
          makeEvidence("Avg chain depth", String(referral.summary.avgChainDepth), referralHref),
        ],
        draft: null,
      })
    );
  }

  return bottlenecks.slice(0, 3);
}

function competitiveResponseTemplate(moveType: string, metricLabel: string | null): string {
  if (moveType === "pricing") {
    return `Protect ${metricLabel ?? "core monetization"} by tightening value proof before matching competitor pricing directly.`;
  }
  if (moveType === "feature") {
    return `Counter with sharper differentiation on ${metricLabel ?? "the affected workflow"} rather than reactive feature parity.`;
  }
  if (moveType === "distribution") {
    return `Defend ${metricLabel ?? "acquisition quality"} by improving channel reach or partner coverage before volume shifts away.`;
  }
  if (moveType === "positioning") {
    return `Respond with clearer category framing and stronger proof around ${metricLabel ?? "the affected metric cluster"}.`;
  }
  if (moveType === "partnership") {
    return `Address the partnership move by protecting owned distribution and measuring spillover on ${metricLabel ?? "adjacent metrics"}.`;
  }
  if (moveType === "brand") {
    return `Counter the brand move with stronger trust, proof, and narrative control around ${metricLabel ?? "the most exposed metric"}.`;
  }
  return `Define the response path and the metric to protect before this competitor move shapes your roadmap by default.`;
}

function buildCompetitiveResponseItems(
  planning: Awaited<ReturnType<typeof buildStrategyPlanningSnapshot>>
): AdminIntelligenceItem[] {
  const strategyHref = "/admin/strategy";
  return [...planning.competitiveWatch]
    .sort(
      (left, right) =>
        impactWeight(right.impactLevel) - impactWeight(left.impactLevel) ||
        right.observedAt.localeCompare(left.observedAt)
    )
    .slice(0, 3)
    .map((move) => {
      const linkedInitiatives = planning.initiatives.filter(
        (initiative) =>
          move.primaryMetricKey != null &&
          (initiative.primaryMetricKey === move.primaryMetricKey ||
            initiative.goalMetricKey === move.primaryMetricKey)
      );
      const linkedBets = planning.bets.filter(
        (bet) => move.primaryMetricKey != null && bet.primaryMetricKey === move.primaryMetricKey
      );
      const dependencyCount = planning.dependencies.filter(
        (dependency) =>
          move.primaryMetricKey != null &&
          (dependency.parentMetricKey === move.primaryMetricKey ||
            dependency.childMetricKey === move.primaryMetricKey)
      ).length;
      const responseCoverage =
        linkedInitiatives.length + linkedBets.length + (move.recommendedResponse ? 1 : 0);

      return makeItem({
        id: `competitive-response-${move.id}`,
        title: `Competitive response: ${move.competitorName} ${move.title}`,
        detail: `${move.moveType} move at ${move.impactLevel} impact${move.primaryMetricLabel ? ` against ${move.primaryMetricLabel}` : ""}. Current response coverage: ${responseCoverage}.`,
        tone:
          impactWeight(move.impactLevel) >= 3 && responseCoverage === 0
            ? "risk"
            : impactWeight(move.impactLevel) >= 3
              ? "watch"
              : responseCoverage > 0
                ? "good"
                : "watch",
        confidence: impactWeight(move.impactLevel) >= 3 ? "high" : "medium",
        capabilities: ["competitive response simulator", "strategy planning", "market defense"],
        recommendation:
          move.recommendedResponse ||
          competitiveResponseTemplate(move.moveType, move.primaryMetricLabel),
        caveat:
          dependencyCount > 0
            ? `${dependencyCount} metric dependency links suggest this move could cascade beyond the directly affected metric.`
            : null,
        href: strategyHref,
        evidence: [
          makeEvidence("Impact", move.impactLevel, strategyHref),
          makeEvidence("Metric", move.primaryMetricLabel ?? "unlinked", strategyHref),
          makeEvidence("Linked initiatives", String(linkedInitiatives.length), strategyHref),
          makeEvidence("Linked bets", String(linkedBets.length), strategyHref),
        ],
        draft: makeDraft(
          responseCoverage === 0 ? "action" : "brief",
          `Respond to ${move.competitorName}: ${move.title}`,
          move.recommendedResponse ||
            competitiveResponseTemplate(move.moveType, move.primaryMetricLabel),
          strategyHref
        ),
      });
    });
}

export async function buildNetworkStrategyIntelligenceSnapshot(
  inputSurface: string | null,
  inputDays: number,
  adminEmail: string
): Promise<AdminIntelligenceSnapshot> {
  const surface = parseSurface(inputSurface);
  const days = ensureDays(inputDays);

  if (surface === "strategy") {
    const planning = await buildStrategyPlanningSnapshot();
    return {
      generatedAt: new Date().toISOString(),
      days,
      surface,
      title: "Competitive Response Intelligence",
      headline:
        "Simulate how competitor moves should change your response priority before they quietly redirect roadmap and growth decisions.",
      summary:
        "This layer ranks live competitor moves by impact, checks whether you already have response coverage, and turns missing coverage into explicit strategic pressure.",
      prompts: [
        { label: "Top response", query: "Which competitor move needs a response first?" },
        {
          label: "Coverage gap",
          query: "Which competitive threat has no active response coverage?",
        },
        { label: "Metric pressure", query: "Which metric is most exposed to competitor moves?" },
      ],
      sections: filterSections([
        makeSection(
          "responses",
          "Competitive Response Simulation",
          "High-impact competitor moves translated into concrete response pressure and coverage gaps.",
          buildCompetitiveResponseItems(planning)
        ),
      ]),
    };
  }

  const [referral, tower] = await Promise.all([
    buildReferralIntelligenceSnapshot(days, adminEmail),
    buildGrowthControlTowerSnapshot(days),
  ]);

  return {
    generatedAt: new Date().toISOString(),
    days,
    surface,
    title: "Network Intelligence",
    headline:
      "Track whether referral behavior is becoming self-sustaining and isolate the exact bottleneck when the loop still fails to compound.",
    summary:
      "This layer turns invite volume, second-hop depth, referral quality, and attribution coverage into explicit network-effect readiness and loop-debugging signals.",
    prompts: [
      { label: "Threshold", query: "Have we reached network-effect threshold?" },
      { label: "Loop break", query: "Where is the virality loop breaking?" },
      { label: "Seed segment", query: "Which segment is closest to compounding growth?" },
    ],
    sections: filterSections([
      makeSection(
        "threshold",
        "Network-Effect Threshold",
        "Whether referral quality and propagation are strong enough to behave like a self-sustaining loop.",
        buildNetworkEffectItems({ referral, tower })
      ),
      makeSection(
        "debugger",
        "Virality Loop Debugger",
        "The biggest bottlenecks preventing invite behavior from compounding into real network effects.",
        buildViralityDebuggerItems(referral)
      ),
    ]),
  };
}
