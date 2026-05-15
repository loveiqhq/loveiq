import { buildExperimentRegistrySnapshot } from "@features/admin/server/experiment-registry";
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
import { buildResearchIntelligenceSnapshot } from "@features/admin/server/research-intelligence";
import { ADMIN_REVIEW_RESOURCE_TYPES } from "@features/admin/server/reviews";
import { supabaseFetch } from "@features/admin/server/supabase";
import { buildValueRealizationSnapshot } from "@features/admin/server/value-realization";
import { buildWorkspaceMaturitySnapshot } from "@features/admin/server/workspace-maturity";

type OptimizationSurface = Extract<
  AdminIntelligenceSurface,
  "growth" | "experiments" | "health" | "research"
>;

interface ReviewDriftRow {
  resource_type: string;
  status: string;
  due_date: string | null;
  impact_level: "low" | "medium" | "high" | "critical";
  updated_at: string;
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

function parseOptimizationSurface(value: string | null): OptimizationSurface {
  if (value === "experiments" || value === "health" || value === "research") return value;
  return "growth";
}

async function fetchReviewDriftRows(days: number): Promise<ReviewDriftRow[]> {
  const since = new Date(Date.now() - Math.max(days, 30) * 86_400_000).toISOString().slice(0, 10);
  const res = await supabaseFetch(
    `/rest/v1/admin_review_request?select=resource_type,status,due_date,impact_level,updated_at&updated_at=gte.${since}&order=updated_at.desc`,
    { headers: { Range: "0-499" } }
  );
  if (!res.ok) {
    throw new Error("Unable to load review drift inputs.");
  }
  return (await res.json()) as ReviewDriftRow[];
}

function confidenceFromCount(value: number): "high" | "medium" | "low" {
  if (value >= 30) return "high";
  if (value >= 10) return "medium";
  return "low";
}

function growthHref(tab: string) {
  return `/admin/growth?${new URLSearchParams({ tab }).toString()}`;
}

function overlap<T>(left: T[], right: T[]) {
  const set = new Set(left);
  return right.filter((item) => set.has(item));
}

function buildExperimentInterferenceItems(
  registry: Awaited<ReturnType<typeof buildExperimentRegistrySnapshot>>
): AdminIntelligenceItem[] {
  const active = registry.experiments.filter((experiment) =>
    ["active", "paused"].includes(experiment.status)
  );
  const pairs: Array<{
    left: (typeof active)[number];
    right: (typeof active)[number];
    sharedMetrics: string[];
    sameSegment: boolean;
    severity: "risk" | "watch";
    score: number;
  }> = [];

  for (const [index, left] of active.entries()) {
    for (const right of active.slice(index + 1)) {
      const sharedMetrics = overlap(
        [left.primary_metric_key, ...left.guardrail_metric_keys],
        [right.primary_metric_key, ...right.guardrail_metric_keys]
      );
      const sameSegment =
        left.segment_id != null && right.segment_id != null && left.segment_id === right.segment_id;
      if (!sameSegment && sharedMetrics.length === 0) continue;

      const severity =
        sameSegment &&
        (left.primary_metric_key === right.primary_metric_key || sharedMetrics.length >= 2)
          ? "risk"
          : "watch";
      const score =
        sharedMetrics.length * 10 +
        (sameSegment ? 12 : 0) +
        left.guardrailRiskCount +
        right.guardrailRiskCount +
        (left.decisionState === "ready" || right.decisionState === "ready" ? 8 : 0);

      pairs.push({ left, right, sharedMetrics, sameSegment, severity, score });
    }
  }

  return pairs
    .sort(
      (left, right) => right.score - left.score || left.left.name.localeCompare(right.left.name)
    )
    .slice(0, 4)
    .map(({ left, right, sharedMetrics, sameSegment, severity }) =>
      makeItem({
        id: `optimization-interference-${left.id}-${right.id}`,
        title: `Interference risk: ${left.name} vs ${right.name}`,
        detail: `${sameSegment ? "Shared audience segment" : "Parallel experiment scope"}${sharedMetrics.length > 0 ? ` with overlapping metrics ${sharedMetrics.join(", ")}` : ""}.`,
        tone: severity,
        confidence: sharedMetrics.length >= 2 || sameSegment ? "high" : "medium",
        capabilities: ["experiment interference detector", "scope overlap", "decision rigor"],
        recommendation:
          "Separate traffic, stagger the rollout window, or explicitly mark the readout as contaminated before using either result in a shipping decision.",
        caveat:
          left.guardrailRiskCount + right.guardrailRiskCount > 0
            ? `${left.guardrailRiskCount + right.guardrailRiskCount} combined guardrail risks already exist across the pair.`
            : null,
        href: "/admin/experiments",
        evidence: [
          makeEvidence(
            "Shared metrics",
            sharedMetrics.length > 0 ? sharedMetrics.join(", ") : "segment only",
            "/admin/experiments"
          ),
          makeEvidence(
            "Segments",
            `${left.segment_name ?? "All"} / ${right.segment_name ?? "All"}`,
            "/admin/experiments"
          ),
          makeEvidence(
            "States",
            `${left.decisionState} / ${right.decisionState}`,
            "/admin/experiments"
          ),
        ],
        draft: makeDraft(
          "brief",
          `Resolve experiment overlap: ${left.name} vs ${right.name}`,
          "Clarify traffic isolation and readout integrity before treating either experiment as independently valid.",
          "/admin/experiments"
        ),
      })
    );
}

function buildPricingSensitivityItems(
  value: Awaited<ReturnType<typeof buildValueRealizationSnapshot>>
): AdminIntelligenceItem[] {
  const valueHref = growthHref("Value Attribution");
  const channels = [...value.channels].filter((channel) => channel.starts >= 8);
  const archetypes = [...value.archetypes].filter((archetype) => archetype.starts >= 8);
  const likelySensitive = channels
    .filter(
      (channel) =>
        channel.monetizationLift >= 1 &&
        (channel.retentionLift <= 1 || channel.referralLift <= 0) &&
        channel.revenuePerStart > 0
    )
    .sort(
      (left, right) =>
        right.monetizationLift - left.monetizationLift ||
        left.retentionLift - right.retentionLift ||
        right.starts - left.starts
    )[0];
  const premiumTolerant = archetypes
    .filter(
      (archetype) =>
        archetype.monetizationLift >= 1 &&
        archetype.retentionLift >= 2 &&
        archetype.revenuePerStart > 0
    )
    .sort(
      (left, right) =>
        right.revenuePerStart - left.revenuePerStart ||
        right.valueRealizationScore - left.valueRealizationScore ||
        right.starts - left.starts
    )[0];
  const valueThreshold = [...value.signals].sort(
    (left, right) =>
      right.monetizationLift - left.monetizationLift ||
      right.upgradeIntentLift - left.upgradeIntentLift
  )[0];

  const items: AdminIntelligenceItem[] = [];

  if (likelySensitive) {
    items.push(
      makeItem({
        id: `pricing-sensitive-channel-${likelySensitive.source}`,
        title: `Price-sensitive channel: ${likelySensitive.source}`,
        detail: `${likelySensitive.monetizationLift}pp monetization lift, but only ${likelySensitive.retentionLift}pp retention lift and ${likelySensitive.referralLift}pp referral lift.`,
        tone:
          likelySensitive.retentionLift <= 0 && likelySensitive.referralLift <= 0
            ? "risk"
            : "watch",
        confidence: confidenceFromCount(likelySensitive.starts),
        capabilities: ["pricing sensitivity explorer", "channel quality", "growth margin"],
        recommendation:
          "This audience appears willing to convert without becoming durable value. Treat it as price-sensitive traffic and protect margin before scaling volume.",
        caveat: value.trust.warning,
        href: valueHref,
        evidence: [
          makeEvidence("Starts", String(likelySensitive.starts), valueHref),
          makeEvidence("Monetization lift", `${likelySensitive.monetizationLift}pp`, valueHref),
          makeEvidence("Retention lift", `${likelySensitive.retentionLift}pp`, valueHref),
          makeEvidence("Revenue/start", String(likelySensitive.revenuePerStart), valueHref),
        ],
        draft: makeDraft(
          "hypothesis",
          `Test premium messaging on ${likelySensitive.source}`,
          "Validate whether this channel converts on immediate price/value framing but fails to retain when the promise is too shallow.",
          valueHref
        ),
      })
    );
  }

  if (premiumTolerant) {
    items.push(
      makeItem({
        id: `pricing-tolerant-archetype-${premiumTolerant.archetype}`,
        title: `Premium-tolerant cohort: ${premiumTolerant.archetype}`,
        detail: `${premiumTolerant.monetizationLift}pp monetization lift, ${premiumTolerant.retentionLift}pp retention lift, and ${premiumTolerant.revenuePerStart} revenue per start.`,
        tone: premiumTolerant.retentionLift >= 4 ? "good" : "watch",
        confidence: confidenceFromCount(premiumTolerant.starts),
        capabilities: ["pricing sensitivity explorer", "cohort value", "premium tolerance"],
        recommendation:
          "This cohort behaves more like value-seeking than price-sensitive. Use it to test stronger premium framing or deeper product value articulation.",
        href: valueHref,
        evidence: [
          makeEvidence("Starts", String(premiumTolerant.starts), valueHref),
          makeEvidence("Monetization lift", `${premiumTolerant.monetizationLift}pp`, valueHref),
          makeEvidence("Retention lift", `${premiumTolerant.retentionLift}pp`, valueHref),
          makeEvidence("Revenue/start", String(premiumTolerant.revenuePerStart), valueHref),
        ],
        draft: makeDraft(
          "experiment",
          `Premium framing test: ${premiumTolerant.archetype}`,
          "Compare stronger value or premium framing against the current message for this durable cohort.",
          valueHref
        ),
      })
    );
  }

  if (valueThreshold) {
    items.push(
      makeItem({
        id: `pricing-threshold-${valueThreshold.signal}`,
        title: `Value proof threshold: ${valueThreshold.signal}`,
        detail: `${valueThreshold.signal} leads monetization by ${valueThreshold.monetizationLift}pp and upgrade intent by ${valueThreshold.upgradeIntentLift}pp.`,
        tone: valueThreshold.monetizationLift >= 3 ? "good" : "watch",
        confidence: confidenceFromCount(valueThreshold.audience),
        capabilities: ["pricing sensitivity explorer", "value realization", "purchase readiness"],
        recommendation:
          "Users appear less price-sensitive after this milestone. Move more traffic toward it before presenting heavier pricing or purchase prompts.",
        href: valueHref,
        evidence: [
          makeEvidence("Audience", String(valueThreshold.audience), valueHref),
          makeEvidence("Monetization lift", `${valueThreshold.monetizationLift}pp`, valueHref),
          makeEvidence("Upgrade lift", `${valueThreshold.upgradeIntentLift}pp`, valueHref),
        ],
        draft: makeDraft(
          "action",
          `Increase value-proof milestone: ${valueThreshold.signal}`,
          "Prioritize UX changes that help more users reach this high-intent milestone earlier.",
          valueHref
        ),
      })
    );
  }

  return items.slice(0, 3);
}

function buildSentimentIntensityItems(
  research: Awaited<ReturnType<typeof buildResearchIntelligenceSnapshot>>
): AdminIntelligenceItem[] {
  const researchHref = "/admin/research";
  const topPain = [...research.painQuestions].sort(
    (left, right) =>
      right.severityScore - left.severityScore || right.responseCount - left.responseCount
  )[0];
  const topTheme = [...research.themes].sort(
    (left, right) => right.responses - left.responses || right.questions - left.questions
  )[0];
  const topContradiction = [...research.contradictions].sort(
    (left, right) =>
      right.coverage - left.coverage || right.affectedSubmissions - left.affectedSubmissions
  )[0];

  const items: AdminIntelligenceItem[] = [];

  if (topPain) {
    items.push(
      makeItem({
        id: `sentiment-pain-${topPain.questionId}`,
        title: `Sentiment spike: ${topPain.questionLabel}`,
        detail: `${topPain.painMentions} pain-heavy responses across ${topPain.responseCount} responses with severity score ${topPain.severityScore}.`,
        tone:
          topPain.severityScore >= 70 ? "risk" : topPain.severityScore >= 50 ? "watch" : "neutral",
        confidence: confidenceFromCount(topPain.responseCount),
        capabilities: ["sentiment intensity scorer", "pain analysis", "research prioritization"],
        recommendation:
          "Treat this question as an emotional pressure point. Review whether the wording, surrounding flow, or user expectation is amplifying negative sentiment.",
        caveat: topPain.sampleExcerpt,
        href: researchHref,
        evidence: [
          makeEvidence("Pain mentions", String(topPain.painMentions), researchHref),
          makeEvidence("Responses", String(topPain.responseCount), researchHref),
          makeEvidence("Severity", String(topPain.severityScore), researchHref),
        ],
        draft: makeDraft(
          "investigation",
          `Review sentiment spike: ${topPain.questionLabel}`,
          "This question is carrying unusually intense emotional load in free-text responses.",
          researchHref
        ),
      })
    );
  }

  if (topTheme) {
    items.push(
      makeItem({
        id: `sentiment-theme-${topTheme.theme}`,
        title: `Emotion-heavy theme: ${topTheme.theme}`,
        detail: `${topTheme.responses} responses across ${topTheme.questions} questions, led by archetype ${topTheme.leadingArchetype ?? "mixed"}.`,
        tone: topTheme.responses >= 40 ? "watch" : "neutral",
        confidence: confidenceFromCount(topTheme.responses),
        capabilities: ["sentiment intensity scorer", "theme monitoring", "persona signal"],
        recommendation:
          "Use this theme as a live research lens across roadmap, copy, and lifecycle work instead of treating the current responses as isolated anecdotes.",
        caveat: topTheme.sampleExcerpts[0] ?? null,
        href: researchHref,
        evidence: [
          makeEvidence("Responses", String(topTheme.responses), researchHref),
          makeEvidence("Questions", String(topTheme.questions), researchHref),
          makeEvidence("Archetype", topTheme.leadingArchetype ?? "mixed", researchHref),
        ],
        draft: makeDraft(
          "brief",
          `Document theme intensity: ${topTheme.theme}`,
          "Capture this theme as a recurring emotional signal across the current research window.",
          researchHref
        ),
      })
    );
  }

  if (topContradiction) {
    items.push(
      makeItem({
        id: `sentiment-contradiction-${topContradiction.key}`,
        title: `High-tension contradiction: ${topContradiction.title}`,
        detail: `${topContradiction.affectedSubmissions} submissions and ${topContradiction.coverage}% coverage indicate strong mixed interpretation or conflicting emotional state.`,
        tone: topContradiction.severity === "critical" ? "risk" : "watch",
        confidence: topContradiction.coverage >= 20 ? "high" : "medium",
        capabilities: [
          "sentiment intensity scorer",
          "contradiction detection",
          "wording validation",
        ],
        recommendation: topContradiction.recommendation,
        href: topContradiction.href,
        evidence: [
          makeEvidence("Coverage", `${topContradiction.coverage}%`, topContradiction.href),
          makeEvidence(
            "Affected",
            String(topContradiction.affectedSubmissions),
            topContradiction.href
          ),
        ],
        draft: makeDraft(
          "hypothesis",
          `Resolve tension in ${topContradiction.title}`,
          topContradiction.recommendation,
          topContradiction.href
        ),
      })
    );
  }

  return items.slice(0, 3);
}

function buildComplianceDriftItems(input: {
  maturity: Awaited<ReturnType<typeof buildWorkspaceMaturitySnapshot>>;
  reviews: ReviewDriftRow[];
}): AdminIntelligenceItem[] {
  const toolsHref = "/admin/tools";
  const overdue = input.reviews.filter(
    (review) =>
      review.due_date != null &&
      review.due_date < new Date().toISOString().slice(0, 10) &&
      !["approved", "rejected"].includes(review.status)
  );
  const highImpactOpen = input.reviews.filter(
    (review) =>
      ["high", "critical"].includes(review.impact_level) &&
      ["requested", "in-review", "changes-requested"].includes(review.status)
  );
  const weakDimension = [...input.maturity.dimensions].sort(
    (left, right) => left.score - right.score
  )[0];
  const reviewedTypes = new Set(input.reviews.map((review) => review.resource_type));
  const requiredTypes = ADMIN_REVIEW_RESOURCE_TYPES.filter((type) => type !== "general");
  const missingTypes = requiredTypes.filter((type) => !reviewedTypes.has(type));

  const items: AdminIntelligenceItem[] = [];

  if (overdue.length > 0) {
    const hottestType = overdue.reduce<Record<string, number>>((acc, review) => {
      acc[review.resource_type] = (acc[review.resource_type] ?? 0) + 1;
      return acc;
    }, {});
    const topType =
      Object.entries(hottestType).sort((left, right) => right[1] - left[1])[0]?.[0] ?? "general";
    items.push(
      makeItem({
        id: "compliance-overdue-reviews",
        title: `Approval SLA drift: ${overdue.length} overdue reviews`,
        detail: `${highImpactOpen.length} high-impact reviews remain open, with the largest backlog on ${topType}.`,
        tone: overdue.length >= 5 || highImpactOpen.length >= 3 ? "risk" : "watch",
        confidence: confidenceFromCount(input.reviews.length),
        capabilities: ["compliance and policy drift monitor", "review SLA", "governance drift"],
        recommendation:
          "Close the overdue review backlog before allowing more policy-sensitive changes to accumulate on top of it.",
        href: toolsHref,
        evidence: [
          makeEvidence("Overdue", String(overdue.length), toolsHref),
          makeEvidence("High impact open", String(highImpactOpen.length), toolsHref),
          makeEvidence("Top backlog", topType, toolsHref),
        ],
        draft: makeDraft(
          "action",
          "Reduce overdue review backlog",
          "Review SLA is drifting on high-impact admin changes and needs active cleanup.",
          toolsHref
        ),
      })
    );
  }

  if (weakDimension) {
    items.push(
      makeItem({
        id: `compliance-maturity-${weakDimension.key}`,
        title: `Policy drift pressure: ${weakDimension.label}`,
        detail: `Maturity score ${weakDimension.score}. ${weakDimension.gaps[0] ?? weakDimension.detail}`,
        tone: weakDimension.tone === "weak" ? "risk" : "watch",
        confidence: "medium",
        capabilities: [
          "compliance and policy drift monitor",
          "workspace maturity",
          "control coverage",
        ],
        recommendation: weakDimension.nextStep,
        caveat: weakDimension.gaps.slice(1, 3).join(" | ") || null,
        href: toolsHref,
        evidence: [makeEvidence("Score", String(weakDimension.score), toolsHref)],
        draft: makeDraft(
          "investigation",
          `Stabilize policy coverage: ${weakDimension.label}`,
          weakDimension.nextStep,
          toolsHref
        ),
      })
    );
  }

  if (missingTypes.length > 0) {
    items.push(
      makeItem({
        id: "compliance-coverage-gaps",
        title: "Policy coverage gaps exist on sensitive resource types",
        detail: `${missingTypes.length} review-governed resource types saw no review activity in the current governance window.`,
        tone: missingTypes.length >= 4 ? "risk" : "watch",
        confidence: "medium",
        capabilities: [
          "compliance and policy drift monitor",
          "approval coverage",
          "governance hygiene",
        ],
        recommendation:
          "Review whether these surfaces are genuinely inactive or whether approval discipline is quietly bypassing them.",
        caveat: `Missing review activity on: ${missingTypes.slice(0, 5).join(", ")}${missingTypes.length > 5 ? "..." : ""}`,
        href: toolsHref,
        evidence: [
          makeEvidence("Missing types", String(missingTypes.length), toolsHref),
          makeEvidence("Tracked types", String(requiredTypes.length), toolsHref),
        ],
        draft: makeDraft(
          "brief",
          "Audit policy coverage gaps",
          "Confirm which sensitive resource types are bypassing or missing review coverage.",
          toolsHref
        ),
      })
    );
  }

  return items.slice(0, 3);
}

export async function buildOptimizationIntelligenceSnapshot(
  inputSurface: string | null,
  inputDays: number,
  adminEmail: string
): Promise<AdminIntelligenceSnapshot> {
  const surface = parseOptimizationSurface(inputSurface);
  const days = ensureDays(inputDays);

  if (surface === "experiments") {
    const registry = await buildExperimentRegistrySnapshot(adminEmail);
    return {
      generatedAt: new Date().toISOString(),
      days,
      surface,
      title: "Experiment Optimization Intelligence",
      headline:
        "Detect overlapping tests before they corrupt readouts or create false winners in the experiment queue.",
      summary:
        "This layer isolates active test collisions so experiment decisions reflect real lift instead of hidden overlap across audience or metrics.",
      prompts: [
        { label: "Interference", query: "Which experiments are overlapping right now?" },
        { label: "Shared metric", query: "Where are tests competing on the same metrics?" },
        {
          label: "Contamination risk",
          query: "Which active tests are least trustworthy because of overlap?",
        },
      ],
      sections: filterSections([
        makeSection(
          "interference",
          "Experiment Interference",
          "Active or paused tests that share audience or metric scope and may contaminate each other.",
          buildExperimentInterferenceItems(registry)
        ),
      ]),
    };
  }

  if (surface === "research") {
    const research = await buildResearchIntelligenceSnapshot(days);
    return {
      generatedAt: new Date().toISOString(),
      days,
      surface,
      title: "Research Sentiment Intelligence",
      headline:
        "Quantify where emotional intensity is highest so research and product act on user feeling, not just response counts.",
      summary:
        "This layer scores pain-heavy questions, emotion-heavy themes, and tension patterns to show where the response set is emotionally charged.",
      prompts: [
        { label: "Highest sentiment", query: "Where is sentiment intensity highest?" },
        { label: "Most pain", query: "Which question carries the most emotional load?" },
        { label: "Mixed signals", query: "Which contradiction suggests strong emotional tension?" },
      ],
      sections: filterSections([
        makeSection(
          "sentiment",
          "Sentiment Intensity",
          "Questions and themes carrying the heaviest emotional pressure in the current response window.",
          buildSentimentIntensityItems(research)
        ),
      ]),
    };
  }

  if (surface === "health") {
    const [maturity, reviews] = await Promise.all([
      buildWorkspaceMaturitySnapshot(),
      fetchReviewDriftRows(days),
    ]);
    return {
      generatedAt: new Date().toISOString(),
      days,
      surface,
      title: "Compliance Drift Intelligence",
      headline:
        "Track where review discipline and policy coverage are slipping before governance debt becomes a business-risk multiplier.",
      summary:
        "This layer turns review backlog, maturity weakness, and missing approval coverage into explicit governance signals instead of quiet process debt.",
      prompts: [
        { label: "Overdue reviews", query: "Where is approval SLA slipping?" },
        { label: "Weak coverage", query: "Which policy surface is weakest right now?" },
        { label: "Blindspots", query: "Which sensitive surfaces may be missing review coverage?" },
      ],
      sections: filterSections([
        makeSection(
          "compliance",
          "Compliance And Policy Drift",
          "Where governance process is weakening across approvals, reviews, and covered surfaces.",
          buildComplianceDriftItems({ maturity, reviews })
        ),
      ]),
    };
  }

  const value = await buildValueRealizationSnapshot(days);
  return {
    generatedAt: new Date().toISOString(),
    days,
    surface,
    title: "Growth Pricing Intelligence",
    headline:
      "Estimate who is price-sensitive versus value-seeking using behavior, monetization, retention, and referral patterns.",
    summary:
      "This layer infers pricing sensitivity from what users do after converting, so growth and product can test margin and premium framing more deliberately.",
    prompts: [
      { label: "Price sensitive", query: "Which channel looks most price-sensitive?" },
      { label: "Premium cohort", query: "Which cohort can tolerate premium framing?" },
      { label: "Value proof", query: "What milestone reduces price sensitivity?" },
    ],
    sections: filterSections([
      makeSection(
        "pricing",
        "Pricing Sensitivity",
        "Behavioral proxies for discount dependence, value proof, and premium tolerance.",
        buildPricingSensitivityItems(value)
      ),
    ]),
  };
}
