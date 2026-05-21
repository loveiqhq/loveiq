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
import { buildProductAdoptionSnapshot } from "@features/admin/server/product-adoption";
import { buildRecoveryPlaybookSnapshot } from "@features/admin/server/recovery-playbook";
import { buildReleaseImpactSnapshot } from "@features/admin/server/release-impact";
import { buildResearchIntelligenceSnapshot } from "@features/admin/server/research-intelligence";
import { buildResearchTaxonomySnapshot } from "@features/admin/server/research-taxonomy";
import { buildValueRealizationSnapshot } from "@features/admin/server/value-realization";

type LifecycleSurface = Extract<AdminIntelligenceSurface, "product" | "growth" | "research">;

const SURFACES: LifecycleSurface[] = ["product", "growth", "research"];

function ensureSurface(value: string | null | undefined): LifecycleSurface {
  return SURFACES.includes(value as LifecycleSurface) ? (value as LifecycleSurface) : "product";
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

function confidenceFromCount(value: number): "high" | "medium" | "low" {
  if (value >= 25) return "high";
  if (value >= 10) return "medium";
  return "low";
}

function tokenize(value: string | null | undefined): string[] {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map((part) => part.trim())
    .filter((part) => part.length >= 3);
}

function overlap(left: string[], right: string[]) {
  const set = new Set(left);
  return right.filter((entry) => set.has(entry));
}

function productKpisHref(tab: string) {
  return `/admin/product-kpis?${new URLSearchParams({ tab }).toString()}`;
}

function growthHref(tab: string) {
  return `/admin/growth?${new URLSearchParams({ tab }).toString()}`;
}

function buildIntentMemoryItems(input: {
  taxonomy: Awaited<ReturnType<typeof buildResearchTaxonomySnapshot>>;
  research: Awaited<ReturnType<typeof buildResearchIntelligenceSnapshot>>;
}): AdminIntelligenceItem[] {
  const researchHref = "/admin/research";
  const activeTerms = input.taxonomy.terms.filter((term) => term.status === "active");
  const rankedTerms = activeTerms
    .map((term) => {
      const termTokens = tokenize([term.label, ...term.exampleTerms].join(" "));
      const relatedThemes = input.research.themes.filter((theme) => {
        const themeTokens = tokenize(
          [theme.theme, theme.leadingArchetype ?? "", ...theme.sampleExcerpts].join(" ")
        );
        return (
          theme.questionIds.some((questionId) => term.linkedQuestionIds.includes(questionId)) ||
          overlap(termTokens, themeTokens).length > 0
        );
      });
      const relatedUnknowns = input.research.unknownUnknowns.filter((item) => {
        const unknownTokens = tokenize(
          [item.term, item.whyItMatters, ...item.sampleExcerpts].join(" ")
        );
        return (
          item.questionIds.some((questionId) => term.linkedQuestionIds.includes(questionId)) ||
          overlap(termTokens, unknownTokens).length > 0
        );
      });
      const relatedContradictions = input.research.contradictions.filter((item) =>
        term.linkedQuestionIds.some((questionId) =>
          item.evidence.some((evidence) => evidence.includes(questionId))
        )
      );
      const connectionScore =
        term.linkedQuestionIds.length * 8 +
        relatedThemes.length * 12 +
        relatedUnknowns.length * 10 +
        relatedContradictions.length * 9 +
        term.exampleTerms.length * 3;

      return {
        term,
        relatedThemes,
        relatedUnknowns,
        relatedContradictions,
        connectionScore,
      };
    })
    .sort((left, right) => right.connectionScore - left.connectionScore)
    .slice(0, 3);

  if (rankedTerms.length === 0) {
    return [
      makeItem({
        id: "intent-memory-empty",
        title: "Intent memory graph is still empty",
        detail:
          "No active intent, motivation, or theme terms are currently curated in the research taxonomy.",
        tone: "watch",
        confidence: "low",
        capabilities: ["customer intent memory graph", "taxonomy continuity", "research memory"],
        recommendation:
          "Curate the first persistent intent and motivation terms so research can accumulate memory instead of staying session-based.",
        href: researchHref,
        evidence: [
          makeEvidence("Active terms", String(activeTerms.length), researchHref),
          makeEvidence("Themes", String(input.research.themes.length), researchHref),
        ],
        draft: makeDraft(
          "action",
          "Seed customer intent memory graph",
          "Add the first active intent and motivation terms tied to live question evidence.",
          researchHref
        ),
      }),
    ];
  }

  return rankedTerms.map(({ term, relatedThemes, relatedUnknowns, relatedContradictions }) =>
    makeItem({
      id: `intent-memory-${term.id}`,
      title: `Intent memory: ${term.label}`,
      detail: `${term.taxonomyType} term linked to ${term.linkedQuestionIds.length} question${term.linkedQuestionIds.length === 1 ? "" : "s"}, ${relatedThemes.length} live theme cluster${relatedThemes.length === 1 ? "" : "s"}, and ${relatedUnknowns.length} emergent signal${relatedUnknowns.length === 1 ? "" : "s"}.`,
      tone:
        term.reviewState === "overdue"
          ? "risk"
          : relatedUnknowns.length > 0 || relatedContradictions.length > 0
            ? "watch"
            : "good",
      confidence: confidenceFromCount(
        term.linkedQuestionIds.length + relatedThemes.length + relatedUnknowns.length
      ),
      capabilities: ["customer intent memory graph", "research memory", "taxonomy continuity"],
      recommendation:
        relatedUnknowns.length > 0
          ? "This intent node is evolving. Review the linked emergent language and decide whether the taxonomy term should expand or split."
          : "Use this node as a persistent memory anchor across product, growth, and research decisions instead of re-deriving the same user intent each cycle.",
      caveat:
        relatedContradictions.length > 0
          ? `${relatedContradictions.length} contradiction pattern(s) touch the same memory node.`
          : term.reviewState === "overdue"
            ? "Taxonomy review is overdue."
            : null,
      href: researchHref,
      evidence: [
        makeEvidence("Type", term.taxonomyType, researchHref),
        makeEvidence(
          "Linked questions",
          term.linkedQuestionIds.length > 0 ? term.linkedQuestionIds.join(", ") : "none",
          researchHref
        ),
        makeEvidence(
          "Live themes",
          relatedThemes
            .map((theme) => theme.theme)
            .slice(0, 2)
            .join(", ") || "none",
          researchHref
        ),
        makeEvidence(
          "Emergent terms",
          relatedUnknowns
            .map((item) => item.term)
            .slice(0, 2)
            .join(", ") || "none",
          researchHref
        ),
      ],
      draft: makeDraft(
        "brief",
        `Review intent memory: ${term.label}`,
        `Validate whether ${term.label.toLowerCase()} is still the right persistent memory node across the linked questions and live themes.`,
        researchHref
      ),
    })
  );
}

function buildRolloutRiskItems(
  adoption: Awaited<ReturnType<typeof buildProductAdoptionSnapshot>>
): AdminIntelligenceItem[] {
  return [...adoption.launches]
    .map((launch) => {
      const overduePenalty = launch.daysToReview != null && launch.daysToReview < 0 ? 18 : 0;
      const riskScore =
        launch.blindspotCount * 18 +
        (launch.metric.status === "risk" ? 18 : launch.metric.status === "watch" ? 10 : 0) +
        launch.openReviewCount * 8 +
        launch.blockedActionCount * 10 +
        overduePenalty +
        Math.max(0, 100 - launch.confidenceScore) * 0.45;

      return { launch, riskScore };
    })
    .sort((left, right) => right.riskScore - left.riskScore)
    .slice(0, 3)
    .map(({ launch, riskScore }) =>
      makeItem({
        id: `rollout-risk-${launch.id}`,
        title: `Rollout risk: ${launch.title}`,
        detail: `${launch.adoptionDetail} Confidence ${launch.confidenceScore} with ${launch.blindspotCount} blindspots, ${launch.openReviewCount} open reviews, and ${launch.blockedActionCount} blocked actions.`,
        tone:
          riskScore >= 60 || launch.adoptionState === "attention"
            ? "risk"
            : launch.adoptionState === "blindspot"
              ? "watch"
              : "neutral",
        confidence: launch.confidence,
        capabilities: ["rollout risk predictor", "launch governance", "release safety"],
        recommendation:
          launch.adoptionState === "blindspot"
            ? "Do not trust this rollout yet. Close instrumentation and governance blindspots before widening exposure."
            : "Treat this rollout as exposed until the linked metric, open reviews, and blocked actions stabilize.",
        caveat:
          launch.daysToReview != null && launch.daysToReview < 0
            ? `Review is overdue by ${Math.abs(launch.daysToReview)} day(s).`
            : launch.metric.trustNote,
        href: productKpisHref("Feature Adoption"),
        evidence: [
          makeEvidence("Metric", launch.metric.label, productKpisHref("Feature Adoption")),
          makeEvidence(
            "Confidence",
            `${launch.confidenceScore}%`,
            productKpisHref("Feature Adoption")
          ),
          makeEvidence(
            "Blindspots",
            String(launch.blindspotCount),
            productKpisHref("Feature Adoption")
          ),
          makeEvidence(
            "Review state",
            launch.reviewDate || "missing",
            productKpisHref("Feature Adoption")
          ),
        ],
        draft: makeDraft(
          "investigation",
          `Contain rollout risk: ${launch.title}`,
          launch.adoptionDetail,
          productKpisHref("Feature Adoption"),
          launch.metric.key,
          launch.expectedImpact
        ),
      })
    );
}

function buildBlastRadiusItems(
  releaseImpact: Awaited<ReturnType<typeof buildReleaseImpactSnapshot>>
): AdminIntelligenceItem[] {
  return [...releaseImpact.releases]
    .map((release) => {
      const blastRadius =
        Math.abs(release.deltaSubmissions) * 1.2 +
        Math.abs(release.deltaCompletionRate) * 6 +
        Math.abs(release.deltaWaitlist) * 0.9 +
        release.linkedDecisionCount * 8 +
        release.linkedExperimentCount * 6 +
        release.linkedAnnotationCount * 2;
      const surfaces = [
        Math.abs(release.deltaWaitlist) >= 5 ? "demand" : null,
        Math.abs(release.deltaSubmissions) >= 5 ? "starts" : null,
        Math.abs(release.deltaCompletionRate) >= 2 ? "completion" : null,
        release.linkedExperimentCount > 0 ? "experiments" : null,
        release.linkedDecisionCount > 0 ? "governance" : null,
      ].filter(Boolean) as string[];
      return { release, blastRadius, surfaces };
    })
    .sort((left, right) => right.blastRadius - left.blastRadius)
    .slice(0, 3)
    .map(({ release, blastRadius, surfaces }) =>
      makeItem({
        id: `blast-radius-${release.id}`,
        title: `Blast radius: ${release.title}`,
        detail: `${release.deltaSubmissions >= 0 ? "+" : ""}${release.deltaSubmissions} starts, ${release.deltaCompletionRate >= 0 ? "+" : ""}${release.deltaCompletionRate}pp completion, and ${release.deltaWaitlist >= 0 ? "+" : ""}${release.deltaWaitlist} waitlist change in the immediate window.`,
        tone: release.attention === "regression" ? "risk" : blastRadius >= 45 ? "watch" : "neutral",
        confidence:
          release.completionSignal.significance === "significant-lift" ||
          release.completionSignal.significance === "significant-regression" ||
          release.submissionsSignal.significance === "significant-lift" ||
          release.submissionsSignal.significance === "significant-regression"
            ? "high"
            : "medium",
        capabilities: ["release blast-radius estimator", "release impact", "containment planning"],
        recommendation:
          surfaces.length > 0
            ? `Treat this release as affecting ${surfaces.join(", ")} and verify the observed movement before making unrelated roadmap or growth changes.`
            : "Keep this release under observation until the surrounding metrics either normalize or confirm the initial movement.",
        caveat:
          release.reviewDate != null
            ? `Review date ${release.reviewDate}.`
            : "No review date is attached.",
        href: "/admin/changelog",
        evidence: [
          makeEvidence("Attention", release.attention, "/admin/changelog"),
          makeEvidence(
            "Surface reach",
            surfaces.length > 0 ? surfaces.join(", ") : "narrow",
            "/admin/changelog"
          ),
          makeEvidence("Completion signal", release.completionSignal.summary, "/admin/changelog"),
          makeEvidence("Start signal", release.submissionsSignal.summary, "/admin/changelog"),
        ],
        draft: makeDraft(
          "brief",
          `Review blast radius: ${release.title}`,
          `Validate whether ${release.title} is causally affecting ${surfaces.join(", ") || "the tracked surface"} before broader follow-through.`,
          "/admin/changelog",
          release.primaryMetricKey,
          release.expectedImpact
        ),
      })
    );
}

function buildChurnRescueItems(
  recovery: Awaited<ReturnType<typeof buildRecoveryPlaybookSnapshot>>
): AdminIntelligenceItem[] {
  const candidates = recovery.playbookGroups
    .flatMap((group) => group.items)
    .map((item) => {
      const recoverabilityWindow =
        item.recoveryRate <= 60 ? 60 - Math.abs(40 - item.recoveryRate) : 30;
      const speedBonus =
        item.avgHoursToRecover == null
          ? 0
          : item.avgHoursToRecover <= 24
            ? 12
            : item.avgHoursToRecover <= 72
              ? 6
              : 0;
      const rescueScore = item.partialSaves * 3 + recoverabilityWindow + speedBonus;
      return { item, rescueScore };
    });

  return candidates
    .sort((left, right) => right.rescueScore - left.rescueScore)
    .slice(0, 3)
    .map(({ item, rescueScore }) =>
      makeItem({
        id: `churn-rescue-${item.id}`,
        title: `Rescue score: ${item.title}`,
        detail: `${item.partialSaves} partial saves, ${item.recoveryRate}% recovery, and ${item.avgHoursToRecover ?? "?"}h average recovery window produce rescue score ${Math.round(rescueScore)}.`,
        tone: item.priority === "high" ? "risk" : item.recoveryRate >= 35 ? "watch" : "risk",
        confidence: confidenceFromCount(item.partialSaves),
        capabilities: ["churn rescue scorer", "recovery prioritization", "lifecycle intervention"],
        recommendation: item.intervention,
        caveat: item.topResumePoint != null ? `Top resume point is Q${item.topResumePoint}.` : null,
        href: growthHref("Recovery & Cohorts"),
        evidence: [
          makeEvidence("Recovery rate", `${item.recoveryRate}%`, growthHref("Recovery & Cohorts")),
          makeEvidence(
            "Partial saves",
            String(item.partialSaves),
            growthHref("Recovery & Cohorts")
          ),
          makeEvidence("Owner", item.ownerRole, growthHref("Recovery & Cohorts")),
          makeEvidence("Priority", item.priority, growthHref("Recovery & Cohorts")),
        ],
        draft: makeDraft(
          "action",
          `Run rescue playbook: ${item.title}`,
          item.intervention,
          growthHref("Recovery & Cohorts")
        ),
      })
    );
}

function buildMonetizationOpportunityItems(
  value: Awaited<ReturnType<typeof buildValueRealizationSnapshot>>
): AdminIntelligenceItem[] {
  const channelCandidate = [...value.channels]
    .filter((channel) => channel.starts >= 8)
    .sort((left, right) => {
      const leftScore =
        left.valueRealizationScore + left.monetizationLift * 4 + left.retentionLift * 3;
      const rightScore =
        right.valueRealizationScore + right.monetizationLift * 4 + right.retentionLift * 3;
      return rightScore - leftScore;
    })[0];
  const archetypeCandidate = [...value.archetypes]
    .filter((archetype) => archetype.starts >= 8)
    .sort((left, right) => {
      const leftScore =
        left.valueRealizationScore + left.monetizationLift * 4 + left.upgradeIntentLift * 2;
      const rightScore =
        right.valueRealizationScore + right.monetizationLift * 4 + right.upgradeIntentLift * 2;
      return rightScore - leftScore;
    })[0];
  const signalCandidate = [...value.signals].sort(
    (left, right) =>
      right.monetizationLift - left.monetizationLift ||
      right.upgradeIntentLift - left.upgradeIntentLift
  )[0];

  const items: AdminIntelligenceItem[] = [];

  if (channelCandidate) {
    items.push(
      makeItem({
        id: `monetization-opportunity-channel-${channelCandidate.source}`,
        title: `Monetization opportunity: ${channelCandidate.source}`,
        detail: `${channelCandidate.monetizationLift}pp monetization lift, ${channelCandidate.retentionLift}pp retention lift, and value score ${channelCandidate.valueRealizationScore}.`,
        tone:
          channelCandidate.monetizationLift >= 3 && channelCandidate.retentionLift >= 1
            ? "good"
            : "watch",
        confidence: confidenceFromCount(channelCandidate.starts),
        capabilities: ["monetization opportunity scorer", "channel quality", "value expansion"],
        recommendation:
          "This channel is producing downstream value, not just starts. Treat it as a monetization expansion lane before chasing lower-quality volume elsewhere.",
        caveat: value.trust.warning,
        href: growthHref("Value Attribution"),
        evidence: [
          makeEvidence("Starts", String(channelCandidate.starts), growthHref("Value Attribution")),
          makeEvidence(
            "Revenue/start",
            String(channelCandidate.revenuePerStart),
            growthHref("Value Attribution")
          ),
          makeEvidence(
            "Value score",
            String(channelCandidate.valueRealizationScore),
            growthHref("Value Attribution")
          ),
        ],
        draft: makeDraft(
          "action",
          `Scale value lane: ${channelCandidate.source}`,
          "Use this channel as a priority monetization lane while keeping quality guardrails in place.",
          growthHref("Value Attribution")
        ),
      })
    );
  }

  if (archetypeCandidate) {
    items.push(
      makeItem({
        id: `monetization-opportunity-archetype-${archetypeCandidate.archetype}`,
        title: `High-value cohort: ${archetypeCandidate.archetype}`,
        detail: `${archetypeCandidate.monetizationLift}pp monetization lift, ${archetypeCandidate.upgradeIntentLift}pp upgrade-intent lift, and ${archetypeCandidate.revenuePerStart} revenue per start.`,
        tone: archetypeCandidate.valueRealizationScore >= 55 ? "good" : "watch",
        confidence: confidenceFromCount(archetypeCandidate.starts),
        capabilities: ["monetization opportunity scorer", "cohort value", "growth prioritization"],
        recommendation:
          "Use this cohort as a pricing, premium framing, or lifecycle expansion target before spending effort on weaker-value audiences.",
        href: growthHref("Value Attribution"),
        evidence: [
          makeEvidence(
            "Starts",
            String(archetypeCandidate.starts),
            growthHref("Value Attribution")
          ),
          makeEvidence(
            "Value score",
            String(archetypeCandidate.valueRealizationScore),
            growthHref("Value Attribution")
          ),
          makeEvidence(
            "Upgrade lift",
            `${archetypeCandidate.upgradeIntentLift}pp`,
            growthHref("Value Attribution")
          ),
        ],
        draft: makeDraft(
          "hypothesis",
          `Expand high-value cohort: ${archetypeCandidate.archetype}`,
          "Test stronger monetization or premium framing on the highest-value cohort before broadening it site-wide.",
          growthHref("Value Attribution")
        ),
      })
    );
  }

  if (signalCandidate) {
    items.push(
      makeItem({
        id: `monetization-opportunity-signal-${signalCandidate.signal}`,
        title: `Value milestone: ${signalCandidate.signal}`,
        detail: `${signalCandidate.strongestOutcome} leads by ${signalCandidate.strongestLift}pp once users hit this milestone.`,
        tone: signalCandidate.strongestLift >= 5 ? "good" : "watch",
        confidence: confidenceFromCount(signalCandidate.audience),
        capabilities: ["monetization opportunity scorer", "milestone design", "value realization"],
        recommendation:
          "Move more users toward this milestone earlier. It is a stronger monetization lever than raw traffic expansion alone.",
        href: growthHref("Value Attribution"),
        evidence: [
          makeEvidence(
            "Audience",
            String(signalCandidate.audience),
            growthHref("Value Attribution")
          ),
          makeEvidence(
            "Outcome",
            signalCandidate.strongestOutcome,
            growthHref("Value Attribution")
          ),
          makeEvidence(
            "Lift",
            `${signalCandidate.strongestLift}pp`,
            growthHref("Value Attribution")
          ),
        ],
        draft: makeDraft(
          "action",
          `Increase milestone reach: ${signalCandidate.signal}`,
          "Prioritize product or lifecycle changes that get more users to this high-value milestone.",
          growthHref("Value Attribution")
        ),
      })
    );
  }

  return items.slice(0, 3);
}

function buildWinBackItems(input: {
  recovery: Awaited<ReturnType<typeof buildRecoveryPlaybookSnapshot>>;
  value: Awaited<ReturnType<typeof buildValueRealizationSnapshot>>;
}): AdminIntelligenceItem[] {
  const sourceItems = input.recovery.recoveryBySource
    .map((source) => {
      const valueChannel = input.value.channels.find((channel) => channel.source === source.source);
      if (!valueChannel) return null;
      const score =
        source.partialSaves * 3 +
        Math.max(0, 100 - source.recoveryRate) +
        valueChannel.valueRealizationScore +
        valueChannel.retentionLift * 3 +
        valueChannel.revenuePerStart * 2;
      return { source, valueChannel, score };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .sort((left, right) => right.score - left.score)
    .slice(0, 3);

  if (sourceItems.length === 0) {
    return [
      makeItem({
        id: "winback-empty",
        title: "No strong win-back target is visible yet",
        detail:
          "Recovery cohorts and value channels are not overlapping strongly enough in the current window.",
        tone: "watch",
        confidence: "low",
        capabilities: ["win-back target recommender", "recovery targeting", "value filtering"],
        recommendation:
          "Wait for more overlap between recovery volume and downstream value before pushing a targeted win-back program.",
        href: growthHref("Recovery & Cohorts"),
        evidence: [
          makeEvidence(
            "Recovery sources",
            String(input.recovery.recoveryBySource.length),
            growthHref("Recovery & Cohorts")
          ),
          makeEvidence(
            "Value channels",
            String(input.value.channels.length),
            growthHref("Value Attribution")
          ),
        ],
        draft: null,
      }),
    ];
  }

  return sourceItems.map(({ source, valueChannel, score }) =>
    makeItem({
      id: `winback-${source.source}`,
      title: `Win-back target: ${source.source}`,
      detail: `${source.partialSaves} partial saves with only ${source.recoveryRate}% recovery, but value score ${valueChannel.valueRealizationScore} and ${valueChannel.revenuePerStart} revenue per start.`,
      tone: source.recoveryRate < 25 && valueChannel.valueRealizationScore >= 50 ? "risk" : "watch",
      confidence: confidenceFromCount(source.partialSaves),
      capabilities: ["win-back target recommender", "recovery targeting", "value-aware rescue"],
      recommendation:
        "This audience is worth rescuing. It under-recovers today but shows enough downstream value to justify a targeted win-back intervention.",
      caveat: `Win-back score ${Math.round(score)}.`,
      href: growthHref("Recovery & Cohorts"),
      evidence: [
        makeEvidence(
          "Partial saves",
          String(source.partialSaves),
          growthHref("Recovery & Cohorts")
        ),
        makeEvidence("Recovery rate", `${source.recoveryRate}%`, growthHref("Recovery & Cohorts")),
        makeEvidence(
          "Value score",
          String(valueChannel.valueRealizationScore),
          growthHref("Value Attribution")
        ),
        makeEvidence(
          "Revenue/start",
          String(valueChannel.revenuePerStart),
          growthHref("Value Attribution")
        ),
      ],
      draft: makeDraft(
        "action",
        `Run win-back on ${source.source}`,
        "Launch a source-specific win-back flow for this high-value but under-recovered audience.",
        growthHref("Recovery & Cohorts")
      ),
    })
  );
}

function buildResearchSnapshot(input: {
  days: number;
  taxonomy: Awaited<ReturnType<typeof buildResearchTaxonomySnapshot>>;
  research: Awaited<ReturnType<typeof buildResearchIntelligenceSnapshot>>;
}): AdminIntelligenceSnapshot {
  const intentItems = buildIntentMemoryItems(input);

  return {
    generatedAt: new Date().toISOString(),
    days: input.days,
    surface: "research",
    title: "Customer Intent Memory",
    headline: `${intentItems.length} intent-memory nodes are grounded in taxonomy, live research themes, and emergent language.`,
    summary:
      "This layer turns research into durable memory. It keeps intent, motivation, and theme structures alive across windows instead of re-learning them from scratch every time.",
    prompts: [
      { label: "Intent memory", query: "Which customer intent node is strongest right now?" },
      { label: "Emerging intent", query: "Which intent is evolving and needs taxonomy review?" },
      {
        label: "Persistent motif",
        query: "What user motivation keeps recurring across questions?",
      },
    ],
    sections: filterSections([
      makeSection(
        "intent-memory",
        "Customer Intent Memory Graph",
        "Persistent intent and motivation nodes tied to live themes, emergent language, and contradictions.",
        intentItems
      ),
    ]),
  };
}

function buildProductSnapshot(input: {
  days: number;
  adoption: Awaited<ReturnType<typeof buildProductAdoptionSnapshot>>;
  releaseImpact: Awaited<ReturnType<typeof buildReleaseImpactSnapshot>>;
}): AdminIntelligenceSnapshot {
  const rolloutItems = buildRolloutRiskItems(input.adoption);
  const blastRadiusItems = buildBlastRadiusItems(input.releaseImpact);

  return {
    generatedAt: new Date().toISOString(),
    days: input.days,
    surface: "product",
    title: "Product Lifecycle Intelligence",
    headline: `${rolloutItems.length} rollout risks and ${blastRadiusItems.length} release blast-radius estimates are active in the current window.`,
    summary:
      "This layer focuses on launch safety and release consequences: which rollouts are too exposed, and which recent releases are shaping more of the system than their change size suggests.",
    prompts: [
      { label: "Launch risk", query: "Which rollout is riskiest right now?" },
      { label: "Blast radius", query: "Which release has the widest blast radius?" },
      { label: "Containment", query: "Which launch needs containment first?" },
    ],
    sections: filterSections([
      makeSection(
        "rollout-risk",
        "Rollout Risk Predictor",
        "Launches whose coverage, confidence, or governance posture make them unsafe to trust at face value.",
        rolloutItems
      ),
      makeSection(
        "blast-radius",
        "Release Blast-Radius Estimator",
        "Recent releases ranked by how broadly they appear to influence demand, starts, completion, experiments, and governance.",
        blastRadiusItems
      ),
    ]),
  };
}

function buildGrowthSnapshot(input: {
  days: number;
  recovery: Awaited<ReturnType<typeof buildRecoveryPlaybookSnapshot>>;
  value: Awaited<ReturnType<typeof buildValueRealizationSnapshot>>;
}): AdminIntelligenceSnapshot {
  const churnItems = buildChurnRescueItems(input.recovery);
  const monetizationItems = buildMonetizationOpportunityItems(input.value);
  const winBackItems = buildWinBackItems(input);

  return {
    generatedAt: new Date().toISOString(),
    days: input.days,
    surface: "growth",
    title: "Growth Lifecycle Intelligence",
    headline: `${churnItems.length} rescue targets, ${monetizationItems.length} monetization opportunities, and ${winBackItems.length} win-back recommendations are active in the current window.`,
    summary:
      "This layer converts recovery and value signals into concrete lifecycle priorities: who is recoverable, where monetization upside is concentrated, and which audiences deserve a targeted win-back motion.",
    prompts: [
      { label: "Rescue target", query: "Which churn cohort is most recoverable?" },
      { label: "Monetization", query: "Where is the strongest monetization opportunity now?" },
      { label: "Win-back", query: "Which audience should growth win back first?" },
    ],
    sections: filterSections([
      makeSection(
        "churn-rescue",
        "Churn Rescue Scorer",
        "Recovery cohorts ranked by urgency and recoverability instead of passive recovery reporting.",
        churnItems
      ),
      makeSection(
        "monetization",
        "Monetization Opportunity Scorer",
        "Channels, cohorts, and milestones with the strongest value upside.",
        monetizationItems
      ),
      makeSection(
        "win-back",
        "Win-Back Target Recommender",
        "High-value audiences that are under-recovering and worth targeted rescue.",
        winBackItems
      ),
    ]),
  };
}

export function parseLifecycleIntelligenceSurface(
  value: string | null | undefined
): LifecycleSurface {
  return ensureSurface(value);
}

export async function buildLifecycleIntelligenceSnapshot(
  inputSurface: string | null | undefined,
  inputDays: number
): Promise<AdminIntelligenceSnapshot> {
  const surface = ensureSurface(inputSurface);
  const days = ensureDays(inputDays);

  if (surface === "growth") {
    const [recovery, value] = await Promise.all([
      buildRecoveryPlaybookSnapshot(days),
      buildValueRealizationSnapshot(days),
    ]);
    return buildGrowthSnapshot({ days, recovery, value });
  }

  if (surface === "research") {
    const [taxonomy, research] = await Promise.all([
      buildResearchTaxonomySnapshot(),
      buildResearchIntelligenceSnapshot(days),
    ]);
    return buildResearchSnapshot({ days, taxonomy, research });
  }

  const [adoption, releaseImpact] = await Promise.all([
    buildProductAdoptionSnapshot(days),
    buildReleaseImpactSnapshot(days),
  ]);
  return buildProductSnapshot({ days, adoption, releaseImpact });
}
