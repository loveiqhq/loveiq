import { buildCreativeIntelligenceSnapshot } from "@/lib/admin/creative-intelligence";
import { buildConversionLeakDebuggerSnapshot } from "@/lib/admin/conversion-leak-debugger";
import { buildProductKpiHref } from "@/lib/admin/drilldowns";
import { buildGrowthControlTowerSnapshot } from "@/lib/admin/growth-control-tower";
import { buildProductAdoptionSnapshot } from "@/lib/admin/product-adoption";
import { buildProductExperienceHealthSnapshot } from "@/lib/admin/product-experience-health";
import { buildProductIssueRadarSnapshot } from "@/lib/admin/product-issue-radar";
import { buildRecoveryPlaybookSnapshot } from "@/lib/admin/recovery-playbook";
import { buildResearchIntelligenceSnapshot } from "@/lib/admin/research-intelligence";
import { buildValueRealizationSnapshot } from "@/lib/admin/value-realization";
import type {
  AdminIntelligenceDraft,
  AdminIntelligenceEvidence,
  AdminIntelligenceItem,
  AdminIntelligenceSection,
  AdminIntelligenceSnapshot,
  AdminIntelligenceTone,
} from "@/lib/admin/intelligence-types";

type AdminExplanationSurface = "product" | "growth";

const SURFACES: AdminExplanationSurface[] = ["product", "growth"];
const PRODUCT_ADOPTION_HREF = buildProductKpiHref({ tab: "Feature Adoption" });

function ensureSurface(value: string | null | undefined): AdminExplanationSurface {
  return SURFACES.includes(value as AdminExplanationSurface)
    ? (value as AdminExplanationSurface)
    : "product";
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
  caveat?: string | null;
  href: string;
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

function toneFromScore(score: number): AdminIntelligenceTone {
  if (score >= 78) return "risk";
  if (score >= 58) return "watch";
  return "neutral";
}

function confidenceFromScore(score: number): "high" | "medium" | "low" {
  if (score >= 78) return "high";
  if (score >= 56) return "medium";
  return "low";
}

function buildProductExplanationSnapshot(
  days: number,
  issueRadar: any,
  experience: any,
  adoption: any,
  research: any
): AdminIntelligenceSnapshot {
  const driverItems = [
    ...(issueRadar.priorityIssues ?? []).slice(0, 3).map((issue: any) => ({
      score: issue.impactScore ?? 50,
      item: makeItem({
        id: `product-driver-issue-${issue.id}`,
        title: issue.title,
        detail: issue.summary,
        tone:
          issue.severity === "critical" ? "risk" : issue.severity === "high" ? "watch" : "neutral",
        confidence: issue.confidence,
        capabilities: ["driver decomposition", "issue radar", "product copilot"],
        recommendation: issue.recommendation,
        href: issue.href,
        evidence: [
          makeEvidence("Category", issue.category, issue.href),
          makeEvidence("Impact", String(issue.impactScore ?? 0), issue.href),
        ],
        draft: makeDraft(
          "investigation",
          `Decompose driver: ${issue.title}`,
          issue.recommendation,
          issue.href
        ),
      }),
    })),
    ...(experience.areas ?? []).slice(0, 3).map((area: any) => ({
      score: 100 - (area.score ?? 60),
      item: makeItem({
        id: `product-driver-area-${area.key}`,
        title: `${area.label} experience is likely dragging product health`,
        detail: area.riskSummary || area.summary,
        tone: area.tone,
        confidence: area.reviewState === "overdue" ? "medium" : "high",
        capabilities: ["driver decomposition", "experience scorecard", "product copilot"],
        recommendation: area.nextMove,
        caveat: area.ownerEmail ? null : "No explicit owner is attached to this area.",
        href: area.href,
        evidence: [
          makeEvidence("Area score", String(area.score), area.href),
          makeEvidence("Primary metric", area.primaryMetricLabel, area.href),
        ],
        draft: makeDraft(
          "action",
          `Resolve ${area.label.toLowerCase()} friction`,
          area.nextMove,
          area.href
        ),
      }),
    })),
    ...(adoption.launches ?? [])
      .filter((launch: any) => launch.adoptionState !== "validated")
      .slice(0, 2)
      .map((launch: any) => ({
        score:
          launch.adoptionState === "attention"
            ? 84
            : launch.adoptionState === "blindspot"
              ? 72
              : 60,
        item: makeItem({
          id: `product-driver-launch-${launch.id}`,
          title: `${launch.title} is still shaping current product KPI posture`,
          detail: launch.adoptionDetail,
          tone: launch.adoptionTone === "neutral" ? "watch" : launch.adoptionTone,
          confidence: launch.confidence,
          capabilities: ["driver decomposition", "rollout risk", "launch analysis"],
          recommendation:
            launch.adoptionState === "blindspot"
              ? "Close launch blindspots before treating this KPI movement as trustworthy."
              : "Review the launch against the linked metric before opening a broader investigation.",
          caveat:
            launch.blindspotCount > 0
              ? `${launch.blindspotCount} blindspots still reduce clarity.`
              : null,
          href: PRODUCT_ADOPTION_HREF,
          evidence: [
            makeEvidence("Launch state", launch.adoptionState, PRODUCT_ADOPTION_HREF),
            makeEvidence(
              "Metric",
              launch.metric?.label || launch.metric?.key || "Unknown",
              PRODUCT_ADOPTION_HREF
            ),
          ],
          draft: makeDraft(
            "investigation",
            `Review launch driver: ${launch.title}`,
            launch.adoptionDetail,
            PRODUCT_ADOPTION_HREF
          ),
        }),
      })),
  ]
    .sort((left, right) => right.score - left.score)
    .slice(0, 5)
    .map((entry) => entry.item);

  const journeyItems = [
    ...(issueRadar.contextHotspots ?? []).flatMap((group: any) =>
      (group.items ?? []).slice(0, 2).map((item: any) =>
        makeItem({
          id: `product-journey-${group.dimension}-${item.label}`,
          title: `${group.dimension} hotspot: ${item.label}`,
          detail: `${item.affectedQuestions} questions are affected. Dominant reason: ${item.dominantReason}.`,
          tone: toneFromScore(item.score),
          confidence: confidenceFromScore(item.score),
          capabilities: ["journey anomaly explainer", "friction clustering", "context hotspot"],
          recommendation: `Inspect the ${group.dimension} path first; this looks like concentrated journey friction, not a uniform regression.`,
          href: item.href,
          evidence: [
            makeEvidence("Score", String(item.score), item.href),
            makeEvidence("Affected questions", String(item.affectedQuestions), item.href),
          ],
          draft: makeDraft(
            "investigation",
            `Inspect ${group.dimension} hotspot: ${item.label}`,
            item.dominantReason,
            item.href
          ),
        })
      )
    ),
    ...(issueRadar.chapterHotspots ?? []).slice(0, 2).map((item: any) =>
      makeItem({
        id: `product-journey-chapter-${item.label}`,
        title: `Chapter hotspot: ${item.label}`,
        detail: `${item.affectedQuestions} questions are affected. Dominant reason: ${item.dominantReason}.`,
        tone: toneFromScore(item.score),
        confidence: confidenceFromScore(item.score),
        capabilities: ["journey anomaly explainer", "chapter hotspot", "path diagnosis"],
        recommendation:
          "Treat this as a clustered chapter-level anomaly before revising isolated questions in random order.",
        href: item.href,
        evidence: [
          makeEvidence("Score", String(item.score), item.href),
          makeEvidence("Affected questions", String(item.affectedQuestions), item.href),
        ],
        draft: makeDraft(
          "investigation",
          `Review chapter hotspot: ${item.label}`,
          item.dominantReason,
          item.href
        ),
      })
    ),
  ].slice(0, 5);

  const hypothesisItems = [
    ...(research.contradictions ?? []).slice(0, 2).map((item: any, index: number) =>
      makeItem({
        id: `product-hypothesis-contradiction-${index}`,
        title: item.title || "Behavior and research contradiction",
        detail:
          item.summary ||
          item.detail ||
          "Research and behavior are moving in different directions.",
        tone: "watch",
        confidence: "medium",
        capabilities: ["feedback-to-hypothesis", "contradiction detector", "product experiment"],
        recommendation:
          item.recommendation ||
          "Turn this contradiction into a scoped product hypothesis before adding more reporting.",
        href: item.href || "/admin/research",
        evidence: [
          makeEvidence("Surface", "Research intelligence", item.href || "/admin/research"),
        ],
        draft: makeDraft(
          "hypothesis",
          item.title || "Investigate contradiction",
          item.recommendation || item.summary || "Compare user claims with observed behavior.",
          item.href || "/admin/research"
        ),
      })
    ),
    ...(research.themes ?? []).slice(0, 2).map((theme: any) =>
      makeItem({
        id: `product-hypothesis-theme-${theme.theme}`,
        title: `Theme-led hypothesis: ${theme.theme}`,
        detail: `${theme.responses} responses across ${theme.questions} questions are clustering around this theme.`,
        tone: theme.responses >= 8 ? "watch" : "neutral",
        confidence: theme.responses >= 8 ? "high" : "medium",
        capabilities: ["feedback-to-hypothesis", "theme synthesis", "product experiment"],
        recommendation: `Test whether surfacing ${theme.theme.toLowerCase()} value earlier reduces hesitation and improves completion or report engagement.`,
        caveat: theme.leadingArchetype ? `Leading archetype: ${theme.leadingArchetype}.` : null,
        href: "/admin/research",
        evidence: [
          makeEvidence("Responses", String(theme.responses), "/admin/research"),
          makeEvidence("Questions", String(theme.questions), "/admin/research"),
        ],
        draft: makeDraft(
          "hypothesis",
          `Test ${theme.theme.toLowerCase()} framing`,
          `Users are repeatedly signaling ${theme.theme.toLowerCase()}; test whether making that value explicit earlier changes downstream behavior.`,
          "/admin/research"
        ),
      })
    ),
    ...(research.answerQuality?.questions ?? []).slice(0, 1).map((question: any) =>
      makeItem({
        id: `product-hypothesis-quality-${question.questionId}`,
        title: `Low-information hypothesis: ${question.questionLabel}`,
        detail: `${question.lowInfoRate}% low-info and ${question.duplicateRate}% duplicate responses suggest the question is not pulling enough usable signal.`,
        tone: question.qualityScore < 55 ? "risk" : "watch",
        confidence: "high",
        capabilities: ["feedback-to-hypothesis", "answer quality", "question refinement"],
        recommendation: question.recommendation,
        href: question.href,
        evidence: [
          makeEvidence("Quality score", String(question.qualityScore), question.href),
          makeEvidence("Low-info rate", `${question.lowInfoRate}%`, question.href),
        ],
        draft: makeDraft(
          "hypothesis",
          `Refine question ${question.questionId}`,
          question.recommendation,
          question.href
        ),
      })
    ),
  ].slice(0, 5);

  return {
    generatedAt: new Date().toISOString(),
    days,
    surface: "product",
    title: "Product Explanations",
    headline: `${driverItems.length} product drivers, ${journeyItems.length} journey anomalies, and ${hypothesisItems.length} grounded hypotheses are ready in the current window.`,
    summary:
      "This explanation layer moves product from passive reporting to diagnosis: what is actually driving KPI movement, where the journey is breaking, and which testable hypotheses deserve the next decision.",
    prompts: [
      { label: "Main driver", query: "What is the strongest product driver right now?" },
      { label: "Journey break", query: "Where is the product journey breaking most clearly?" },
      { label: "Next hypothesis", query: "What product hypothesis should we test next?" },
    ],
    sections: filterSections([
      makeSection(
        "drivers",
        "Driver Decomposition",
        "Ranked factors most likely contributing to current product KPI movement.",
        driverItems
      ),
      makeSection(
        "journey",
        "Journey Anomalies",
        "Clustered path breakpoints that look concentrated enough to deserve direct inspection.",
        journeyItems
      ),
      makeSection(
        "hypotheses",
        "Feedback To Hypotheses",
        "Research, quality, and contradiction signals transformed into concrete product hypotheses.",
        hypothesisItems
      ),
    ]),
  };
}

function buildGrowthExplanationSnapshot(
  days: number,
  control: any,
  leak: any,
  creative: any,
  recovery: any,
  value: any
): AdminIntelligenceSnapshot {
  const driverItems = [
    ...(control.priorities ?? []).slice(0, 3).map((priority: any, index: number) => ({
      score: priority.tone === "risk" ? 82 : priority.tone === "good" ? 68 : 56,
      item: makeItem({
        id: `growth-driver-priority-${index}`,
        title: priority.title,
        detail: priority.detail,
        tone: priority.tone,
        confidence: priority.tone === "watch" ? "medium" : "high",
        capabilities: ["driver decomposition", "growth control tower", "growth copilot"],
        recommendation: priority.detail,
        href: priority.href,
        evidence: [makeEvidence("Surface", "Growth control tower", priority.href)],
        draft: makeDraft("action", priority.title, priority.detail, priority.href),
      }),
    })),
    ...(leak.priorities ?? []).slice(0, 2).map((item: any) => ({
      score: item.leakRate + item.leakCount,
      item: makeItem({
        id: `growth-driver-leak-${item.dimension}-${item.label}`,
        title: `${item.dimension} is likely driving leakage: ${item.label}`,
        detail: `${item.leakCount} users leak at ${item.leakStageLabel} with ${item.leakRate}% loss.`,
        tone: item.leakRate >= 30 ? "risk" : "watch",
        confidence: item.confidence,
        capabilities: ["driver decomposition", "leak debugger", "channel diagnosis"],
        recommendation: item.explanation,
        href: item.href,
        evidence: [
          makeEvidence("Leak stage", item.leakStageLabel, item.href),
          makeEvidence("Leak rate", `${item.leakRate}%`, item.href),
        ],
        draft: makeDraft(
          "investigation",
          `Investigate ${item.dimension} leak: ${item.label}`,
          item.explanation,
          item.href
        ),
      }),
    })),
    ...(value.signals ?? []).slice(0, 1).map((signal: any) => ({
      score: Math.max(
        signal.monetizationLift,
        signal.retentionLift,
        signal.referralLift,
        signal.upgradeIntentLift
      ),
      item: makeItem({
        id: `growth-driver-value-${signal.signal}`,
        title: `Downstream quality is clustering around ${signal.signal}`,
        detail: `${signal.strongestOutcome} leads by ${signal.strongestLift}pp in the current window.`,
        tone: signal.strongestLift >= 6 ? "good" : "watch",
        confidence: signal.audience >= 20 ? "high" : "medium",
        capabilities: ["driver decomposition", "value realization", "quality signal"],
        recommendation:
          "Use this downstream signal to prioritize quality growth, not just acquisition volume.",
        href: "/admin/growth",
        evidence: [
          makeEvidence("Audience", String(signal.audience), "/admin/growth"),
          makeEvidence("Strongest lift", `${signal.strongestLift}pp`, "/admin/growth"),
        ],
        draft: makeDraft(
          "action",
          `Operationalize ${signal.signal}`,
          "Use this signal in growth prioritization and lifecycle design.",
          "/admin/growth"
        ),
      }),
    })),
  ]
    .sort((left, right) => right.score - left.score)
    .slice(0, 5)
    .map((entry) => entry.item);

  const recoveryItems = (recovery.playbookGroups ?? [])
    .flatMap((group: any) => group.items ?? [])
    .filter((item: any) => item.priority === "high" || item.attention === "risk")
    .slice(0, 2)
    .map((item: any) =>
      makeItem({
        id: `growth-journey-recovery-${item.id}`,
        title: item.title,
        detail: item.summary,
        tone: item.attention === "risk" ? "risk" : "watch",
        confidence: item.partialSaves >= 6 ? "high" : "medium",
        capabilities: ["journey anomaly explainer", "recovery playbook", "lifecycle diagnosis"],
        recommendation: item.intervention,
        caveat:
          item.medianHoursToRecover != null
            ? `Median recovery time is ${item.medianHoursToRecover}h.`
            : null,
        href: item.linkedHref,
        evidence: [
          makeEvidence("Recovery rate", `${item.recoveryRate}%`, item.linkedHref),
          makeEvidence("Partial saves", String(item.partialSaves), item.linkedHref),
        ],
        draft: makeDraft(
          "investigation",
          `Explain recovery anomaly: ${item.title}`,
          item.intervention,
          item.linkedHref
        ),
      })
    );

  const journeyItems = [
    ...(leak.priorities ?? []).slice(0, 3).map((item: any) =>
      makeItem({
        id: `growth-journey-leak-${item.dimension}-${item.label}`,
        title: `${item.dimension} anomaly: ${item.label}`,
        detail: `${item.leakStageLabel} is the main break. ${item.explanation}`,
        tone: item.leakRate >= 30 ? "risk" : "watch",
        confidence: item.confidence,
        capabilities: ["journey anomaly explainer", "leak debugger", "path diagnosis"],
        recommendation: "Fix the leaking path before pushing more traffic into this cohort.",
        href: item.href,
        evidence: [
          makeEvidence("Leak count", String(item.leakCount), item.href),
          makeEvidence("Leak rate", `${item.leakRate}%`, item.href),
        ],
        draft: makeDraft(
          "investigation",
          `Explain ${item.dimension} journey leak`,
          item.explanation,
          item.href
        ),
      })
    ),
    ...recoveryItems,
  ].slice(0, 5);

  const hypothesisItems = [
    ...(creative.messageThemes ?? []).slice(0, 2).map((theme: any) =>
      makeItem({
        id: `growth-hypothesis-theme-${theme.theme}`,
        title: `Message hypothesis: ${theme.theme}`,
        detail: `${theme.starts} starts across ${theme.creatives} creatives with ${theme.paidRate}% paid rate.`,
        tone: theme.paidRate >= 4 ? "good" : "watch",
        confidence: theme.confidence,
        capabilities: ["feedback-to-hypothesis", "message strategy", "creative experiment"],
        recommendation: `Test whether leaning harder into ${theme.theme.toLowerCase()} messaging improves quality traffic, not just starts.`,
        caveat: theme.topCreative ? `Top creative: ${theme.topCreative}.` : null,
        href: "/admin/growth",
        evidence: [
          makeEvidence("Starts", String(theme.starts), "/admin/growth"),
          makeEvidence("Paid rate", `${theme.paidRate}%`, "/admin/growth"),
        ],
        draft: makeDraft(
          "hypothesis",
          `Test ${theme.theme.toLowerCase()} message cluster`,
          `The ${theme.theme} theme is showing enough traction to justify a growth test.`,
          "/admin/growth"
        ),
      })
    ),
    ...(leak.priorities ?? []).slice(0, 1).map((item: any) =>
      makeItem({
        id: `growth-hypothesis-leak-${item.dimension}-${item.label}`,
        title: `Leak hypothesis: ${item.dimension} -> ${item.label}`,
        detail: item.explanation,
        tone: item.leakRate >= 30 ? "risk" : "watch",
        confidence: item.confidence,
        capabilities: ["feedback-to-hypothesis", "journey diagnosis", "growth experiment"],
        recommendation: `Test a targeted intervention on ${item.dimension} for ${item.label} instead of broad channel changes.`,
        href: item.href,
        evidence: [
          makeEvidence("Stage", item.leakStageLabel, item.href),
          makeEvidence("Leak rate", `${item.leakRate}%`, item.href),
        ],
        draft: makeDraft(
          "hypothesis",
          `Test fix for ${item.dimension}: ${item.label}`,
          item.explanation,
          item.href
        ),
      })
    ),
    ...(value.signals ?? []).slice(0, 1).map((signal: any) =>
      makeItem({
        id: `growth-hypothesis-value-${signal.signal}`,
        title: `Value hypothesis: encourage ${signal.signal}`,
        detail: `${signal.signal} is linked to ${signal.strongestOutcome.toLowerCase()} lift of ${signal.strongestLift}pp.`,
        tone: signal.strongestLift >= 6 ? "good" : "watch",
        confidence: signal.audience >= 20 ? "high" : "medium",
        capabilities: ["feedback-to-hypothesis", "value realization", "lifecycle experiment"],
        recommendation: `Test nudges or flow changes that get more users to ${signal.signal.toLowerCase()} earlier.`,
        href: "/admin/growth",
        evidence: [
          makeEvidence("Audience", String(signal.audience), "/admin/growth"),
          makeEvidence("Strongest outcome", signal.strongestOutcome, "/admin/growth"),
        ],
        draft: makeDraft(
          "hypothesis",
          `Encourage ${signal.signal.toLowerCase()} earlier`,
          "Use this value signal as an explicit lifecycle or product-growth experiment.",
          "/admin/growth"
        ),
      })
    ),
  ].slice(0, 4);

  return {
    generatedAt: new Date().toISOString(),
    days,
    surface: "growth",
    title: "Growth Explanations",
    headline: `${driverItems.length} growth drivers, ${journeyItems.length} journey anomalies, and ${hypothesisItems.length} testable hypotheses are ready in the current window.`,
    summary:
      "This explanation layer translates growth reporting into diagnosis: what is actually driving movement, where the user journey breaks, and which growth hypotheses are grounded enough to test next.",
    prompts: [
      { label: "Main driver", query: "What is driving growth movement most right now?" },
      { label: "Journey break", query: "Where is the growth journey leaking most clearly?" },
      { label: "Next hypothesis", query: "What growth hypothesis should we test next?" },
    ],
    sections: filterSections([
      makeSection(
        "drivers",
        "Driver Decomposition",
        "Ranked factors most likely contributing to current growth KPI movement.",
        driverItems
      ),
      makeSection(
        "journey",
        "Journey Anomalies",
        "The clearest breakpoints in the acquisition-to-value path right now.",
        journeyItems
      ),
      makeSection(
        "hypotheses",
        "Feedback To Hypotheses",
        "Observed growth signals converted into concrete, evidence-backed hypotheses.",
        hypothesisItems
      ),
    ]),
  };
}

export async function buildAdminExplanationSnapshot(
  inputSurface: string | null | undefined,
  inputDays: number,
  adminEmail?: string
): Promise<AdminIntelligenceSnapshot> {
  const surface = ensureSurface(inputSurface);
  const days = ensureDays(inputDays);

  if (surface === "growth") {
    if (!adminEmail) throw new Error("Admin email is required for growth explanations.");
    const [control, leak, creative, recovery, value] = await Promise.all([
      buildGrowthControlTowerSnapshot(days),
      buildConversionLeakDebuggerSnapshot(days, adminEmail),
      buildCreativeIntelligenceSnapshot(days),
      buildRecoveryPlaybookSnapshot(days),
      buildValueRealizationSnapshot(days),
    ]);
    return buildGrowthExplanationSnapshot(days, control, leak, creative, recovery, value);
  }

  const [issueRadar, experience, adoption, research] = await Promise.all([
    buildProductIssueRadarSnapshot(days),
    buildProductExperienceHealthSnapshot(days),
    buildProductAdoptionSnapshot(days),
    buildResearchIntelligenceSnapshot(days),
  ]);
  return buildProductExplanationSnapshot(days, issueRadar, experience, adoption, research);
}
