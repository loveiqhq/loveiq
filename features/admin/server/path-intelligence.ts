import { buildChannelEfficiencySnapshot } from "@features/admin/server/channel-efficiency";
import { buildConversionLeakDebuggerSnapshot } from "@features/admin/server/conversion-leak-debugger";
import { clampDays } from "@features/admin/server/next-level";
import { buildProductExperienceHealthSnapshot } from "@features/admin/server/product-experience-health";
import { buildReplayPathClustersSnapshot } from "@features/admin/server/replay-paths";
import { buildValueRealizationSnapshot } from "@features/admin/server/value-realization";
import type {
  AdminIntelligenceConfidence,
  AdminIntelligenceDraft,
  AdminIntelligenceEvidence,
  AdminIntelligenceItem,
  AdminIntelligenceSection,
  AdminIntelligenceSnapshot,
  AdminIntelligenceTone,
} from "@features/admin/server/intelligence-types";

type AdminPathSurface = "product" | "growth";

const SURFACES: AdminPathSurface[] = ["product", "growth"];
const PRODUCT_REPLAY_HREF = "/admin/replay";

function buildGrowthTabHref(tab: string) {
  return `/admin/growth?${new URLSearchParams({ tab }).toString()}`;
}

const GROWTH_CHANNEL_HREF = buildGrowthTabHref("Channel Efficiency");
const GROWTH_RECOVERY_HREF = buildGrowthTabHref("Recovery & Cohorts");

function ensureSurface(value: string | null | undefined): AdminPathSurface {
  return SURFACES.includes(value as AdminPathSurface) ? (value as AdminPathSurface) : "product";
}

function ensureDays(value: number): number {
  return clampDays(Number.isFinite(value) ? Math.round(value) : 30, 7, 365);
}

function confidenceFromAudience(audience: number): AdminIntelligenceConfidence {
  if (audience >= 40) return "high";
  if (audience >= 15) return "medium";
  return "low";
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
  confidence: AdminIntelligenceConfidence;
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

function growthPathDetail(input: {
  source: string;
  starts: number;
  completionRate: number;
  reportViewRate: number;
  paidRate: number;
  efficiencyScore: number;
}): string {
  return `${input.source} drove ${input.starts} starts with ${input.completionRate}% completion, ${input.reportViewRate}% report view, and ${input.paidRate}% paid rate at ${input.efficiencyScore} efficiency.`;
}

function buildProductPathSnapshot(
  days: number,
  replay: Awaited<ReturnType<typeof buildReplayPathClustersSnapshot>>,
  experience: Awaited<ReturnType<typeof buildProductExperienceHealthSnapshot>>,
  value: Awaited<ReturnType<typeof buildValueRealizationSnapshot>>
): AdminIntelligenceSnapshot {
  const pathItems = replay.clusters.slice(0, 4).map((cluster, index) =>
    makeItem({
      id: `product-path-${cluster.label}-${index}`,
      title:
        cluster.label === "Completed Cleanly"
          ? "Winning product path: completed cleanly"
          : `Repeated friction path: ${cluster.label}`,
      detail: `${cluster.sessions} sessions, ${cluster.abandonmentRate}% abandonment, average duration ${Math.round(
        cluster.avgDurationMs / 1000
      )}s, max question ${cluster.maxQuestionReached}.`,
      tone:
        cluster.label === "Completed Cleanly"
          ? "good"
          : cluster.abandonmentRate >= 65
            ? "risk"
            : "watch",
      confidence: confidenceFromAudience(cluster.sessions),
      capabilities: ["funnel path mining", "session clustering", "journey diagnosis"],
      recommendation:
        cluster.label === "Completed Cleanly"
          ? "Treat this as the reference path and preserve it while fixing weaker paths around it."
          : `Inspect this path cluster first; the likely cause is ${cluster.likelyCause.toLowerCase()}.`,
      caveat:
        cluster.sessions < 10
          ? "This path cluster is directional because the session sample is still small."
          : null,
      href: PRODUCT_REPLAY_HREF,
      evidence: [
        makeEvidence("Sessions", String(cluster.sessions), PRODUCT_REPLAY_HREF),
        makeEvidence("Abandonment", `${cluster.abandonmentRate}%`, PRODUCT_REPLAY_HREF),
        makeEvidence("Likely cause", cluster.likelyCause, PRODUCT_REPLAY_HREF),
      ],
      draft:
        cluster.label === "Completed Cleanly"
          ? makeDraft(
              "brief",
              "Document winning product path",
              "Capture the completed-cleanly pattern as the baseline journey to protect.",
              PRODUCT_REPLAY_HREF
            )
          : makeDraft(
              "investigation",
              `Investigate ${cluster.label.toLowerCase()} path`,
              cluster.likelyCause,
              PRODUCT_REPLAY_HREF
            ),
    })
  );

  const ahaItems = value.signals.slice(0, 3).map((signal) =>
    makeItem({
      id: `product-aha-${signal.signal}`,
      title: `${signal.signal} looks like an aha moment`,
      detail: `${signal.strongestOutcome} lift is ${signal.strongestLift}pp across ${signal.audience} users.`,
      tone: signal.strongestLift >= 6 ? "good" : "watch",
      confidence: confidenceFromAudience(signal.audience),
      capabilities: ["aha-moment detector", "value realization", "product lifecycle"],
      recommendation:
        signal.signal === "Report Viewed"
          ? "Drive users into report view faster; this is the clearest observable moment where value becomes concrete."
          : `Design the journey so more users reach ${signal.signal.toLowerCase()} earlier and more reliably.`,
      caveat:
        signal.audience < 12
          ? "This aha signal is directional because the audience is still limited."
          : null,
      href: "/admin/growth",
      evidence: [
        makeEvidence("Audience", String(signal.audience), "/admin/growth"),
        makeEvidence("Strongest outcome", signal.strongestOutcome, "/admin/growth"),
        makeEvidence("Lift", `${signal.strongestLift}pp`, "/admin/growth"),
      ],
      draft: makeDraft(
        "hypothesis",
        `Reinforce ${signal.signal.toLowerCase()}`,
        `Users who reach ${signal.signal.toLowerCase()} show stronger downstream value. Test ways to get more users there earlier.`,
        "/admin/growth"
      ),
    })
  );

  const onboardingArea = experience.areas.find((area) => area.key === "onboarding");
  const completionArea = experience.areas.find((area) => area.key === "completion");
  const strongestFriction =
    replay.clusters
      .filter((cluster) => cluster.label !== "Completed Cleanly")
      .sort((left, right) => right.abandonmentRate - left.abandonmentRate)[0] ?? null;
  const strongestAha = value.signals[0] ?? null;
  const optimizerItems = [onboardingArea, completionArea].filter(Boolean).map((area) =>
    makeItem({
      id: `product-optimizer-${area!.key}`,
      title: `Optimize ${area!.label.toLowerCase()} path`,
      detail:
        area!.key === "onboarding" && strongestFriction
          ? `${area!.riskSummary} The clearest repeated path break is ${strongestFriction.label.toLowerCase()} at ${strongestFriction.abandonmentRate}% abandonment.`
          : area!.key === "completion" && strongestAha
            ? `${area!.riskSummary} The clearest milestone after completion is ${strongestAha.signal.toLowerCase()}, with ${strongestAha.strongestLift}pp downstream lift.`
            : area!.riskSummary,
      tone: area!.tone,
      confidence: area!.reviewState === "overdue" ? "medium" : "high",
      capabilities: ["onboarding path optimizer", "experience scorecard", "product copilot"],
      recommendation:
        area!.key === "onboarding" && strongestFriction
          ? `${area!.nextMove} Remove the ${strongestFriction.label.toLowerCase()} break before making broader onboarding changes.`
          : area!.key === "completion" && strongestAha
            ? `${area!.nextMove} Then pull ${strongestAha.signal.toLowerCase()} closer to completion so value arrives earlier.`
            : area!.nextMove,
      caveat: area!.ownerEmail ? null : "This area has no explicit owner attached yet.",
      href: area!.href,
      evidence: [
        makeEvidence("Area score", String(area!.score), area!.href),
        makeEvidence("Primary metric", area!.primaryMetricLabel, area!.href),
      ],
      draft: makeDraft(
        "action",
        `Optimize ${area!.label.toLowerCase()} path`,
        area!.nextMove,
        area!.href
      ),
    })
  );

  if (strongestAha) {
    optimizerItems.push(
      makeItem({
        id: `product-optimizer-milestone-${strongestAha.signal}`,
        title: `Accelerate the ${strongestAha.signal.toLowerCase()} milestone`,
        detail: `${strongestAha.signal} is the clearest downstream value milestone, lifting ${strongestAha.strongestOutcome.toLowerCase()} by ${strongestAha.strongestLift}pp across ${strongestAha.audience} users.`,
        tone: strongestAha.strongestLift >= 6 ? "good" : "watch",
        confidence: confidenceFromAudience(strongestAha.audience),
        capabilities: ["onboarding path optimizer", "aha-moment detector", "product lifecycle"],
        recommendation:
          "Reshape the first-run path so more users hit this milestone before asking them for deeper commitment or longer effort.",
        href: "/admin/growth",
        evidence: [
          makeEvidence("Audience", String(strongestAha.audience), "/admin/growth"),
          makeEvidence("Strongest outcome", strongestAha.strongestOutcome, "/admin/growth"),
          makeEvidence("Lift", `${strongestAha.strongestLift}pp`, "/admin/growth"),
        ],
        draft: makeDraft(
          "hypothesis",
          `Pull ${strongestAha.signal.toLowerCase()} earlier in onboarding`,
          `Users who reach ${strongestAha.signal.toLowerCase()} show better downstream value. Test a shorter path to that milestone.`,
          "/admin/growth"
        ),
      })
    );
  }

  return {
    generatedAt: new Date().toISOString(),
    days,
    surface: "product",
    title: "Product Path Intelligence",
    headline: `${pathItems.length} path patterns and ${ahaItems.length} aha signals are ready for the current product window.`,
    summary:
      "This layer mines real product paths instead of only reporting isolated metrics. It highlights the most repeated journey patterns, the clearest aha moments, and the strongest next path optimizations.",
    prompts: [
      { label: "Winning path", query: "What product path is working best right now?" },
      {
        label: "Main friction path",
        query: "Which product journey pattern is breaking most often?",
      },
      { label: "Aha moment", query: "What user behavior looks most like the product aha moment?" },
    ],
    sections: filterSections([
      makeSection(
        "paths",
        "Path Mining",
        "Repeated session patterns across product usage, from clean completions to concentrated friction loops.",
        pathItems
      ),
      makeSection(
        "aha",
        "Aha Moments",
        "Behaviors most associated with stronger downstream value, retention, or monetization.",
        ahaItems
      ),
      makeSection(
        "optimizers",
        "Path Optimizers",
        "The strongest next path changes suggested by the existing experience scorecard.",
        optimizerItems
      ),
    ]),
  };
}

function buildGrowthPathSnapshot(
  days: number,
  channels: Awaited<ReturnType<typeof buildChannelEfficiencySnapshot>>,
  leak: Awaited<ReturnType<typeof buildConversionLeakDebuggerSnapshot>>,
  value: Awaited<ReturnType<typeof buildValueRealizationSnapshot>>
): AdminIntelligenceSnapshot {
  const scaleOrFixChannels = channels.channels
    .filter((channel) => channel.action === "scale" || channel.action === "fix")
    .slice(0, 3)
    .map((channel) =>
      makeItem({
        id: `growth-path-channel-${channel.source}`,
        title:
          channel.action === "scale"
            ? `Winning growth path: ${channel.source}`
            : `Broken growth path: ${channel.source}`,
        detail: growthPathDetail(channel),
        tone: channel.action === "scale" ? "good" : "risk",
        confidence: channel.confidence,
        capabilities: ["funnel path mining", "channel quality", "growth copilot"],
        recommendation:
          channel.action === "scale"
            ? "Protect this path and scale it without breaking the downstream quality profile."
            : "Stop forcing more volume through this path until the conversion leak is repaired.",
        caveat:
          channel.action === "fix" && channel.starts < 20
            ? "This path is weak, but it is not yet large enough to dominate the business alone."
            : null,
        href: GROWTH_CHANNEL_HREF,
        evidence: [
          makeEvidence("Starts", String(channel.starts), GROWTH_CHANNEL_HREF),
          makeEvidence("Completion", `${channel.completionRate}%`, GROWTH_CHANNEL_HREF),
          makeEvidence("Paid rate", `${channel.paidRate}%`, GROWTH_CHANNEL_HREF),
        ],
        draft: makeDraft(
          channel.action === "scale" ? "action" : "investigation",
          `${channel.action === "scale" ? "Scale" : "Repair"} ${channel.source} path`,
          channel.action === "scale"
            ? "Increase investment while preserving downstream quality."
            : "Find the path break before raising volume again.",
          GROWTH_CHANNEL_HREF
        ),
      })
    );

  const leakPaths = leak.priorities.slice(0, 2).map((item) =>
    makeItem({
      id: `growth-path-leak-${item.dimension}-${item.label}`,
      title: `Leak path: ${item.dimension} -> ${item.label}`,
      detail: `${item.leakStageLabel} is losing ${item.leakCount} users at ${item.leakRate}% leakage.`,
      tone: item.leakRate >= 30 ? "risk" : "watch",
      confidence: item.confidence,
      capabilities: ["funnel path mining", "leak debugger", "journey diagnosis"],
      recommendation: item.explanation,
      href: item.href,
      evidence: [
        makeEvidence("Leak stage", item.leakStageLabel, item.href),
        makeEvidence("Leak rate", `${item.leakRate}%`, item.href),
      ],
      draft: makeDraft(
        "investigation",
        `Repair ${item.dimension} leak path`,
        item.explanation,
        item.href
      ),
    })
  );

  const ahaItems = value.signals.slice(0, 3).map((signal) =>
    makeItem({
      id: `growth-aha-${signal.signal}`,
      title: `${signal.signal} is a growth aha signal`,
      detail: `${signal.strongestOutcome} improves by ${signal.strongestLift}pp when users reach this behavior.`,
      tone: signal.strongestLift >= 6 ? "good" : "watch",
      confidence: confidenceFromAudience(signal.audience),
      capabilities: ["aha-moment detector", "value realization", "growth lifecycle"],
      recommendation:
        signal.signal === "Multi-Day Return"
          ? "Design lifecycle loops that deliberately create a second-day return; it is one of the strongest durable value signals."
          : `Use ${signal.signal.toLowerCase()} as a milestone for growth and lifecycle experiments.`,
      caveat:
        signal.audience < 12
          ? "Audience is still small, so treat this as a directional aha moment."
          : null,
      href: "/admin/growth",
      evidence: [
        makeEvidence("Audience", String(signal.audience), "/admin/growth"),
        makeEvidence("Strongest outcome", signal.strongestOutcome, "/admin/growth"),
        makeEvidence("Lift", `${signal.strongestLift}pp`, "/admin/growth"),
      ],
      draft: makeDraft(
        "hypothesis",
        `Test ${signal.signal.toLowerCase()} milestone`,
        `Treat ${signal.signal.toLowerCase()} as a milestone and test ways to get more users there earlier in the lifecycle.`,
        "/admin/growth"
      ),
    })
  );

  const recoveryPath = leak.summary.strongestLeak
    ? makeItem({
        id: "growth-optimizer-recovery",
        title: "Prioritize the strongest leaking path",
        detail: `${leak.summary.strongestLeak} is the clearest place to recover users before buying more traffic.`,
        tone: leak.summary.criticalLeaks > 0 ? "risk" : "watch",
        confidence: confidenceFromAudience(leak.summary.totalStarts),
        capabilities: ["onboarding path optimizer", "recovery design", "growth copilot"],
        recommendation:
          leak.summary.criticalLeaks > 0
            ? "Run recovery and path-fix work on the strongest leak before expanding volume."
            : "Use the recovery playbook to protect the current path while scaling.",
        href: GROWTH_RECOVERY_HREF,
        evidence: [
          makeEvidence("Critical leaks", String(leak.summary.criticalLeaks), GROWTH_RECOVERY_HREF),
          makeEvidence("Strongest leak", leak.summary.strongestLeak, GROWTH_RECOVERY_HREF),
        ],
        draft: makeDraft(
          "action",
          "Prioritize strongest leak recovery",
          "Use recovery and path fixes before pushing more acquisition volume through the leaking path.",
          GROWTH_RECOVERY_HREF
        ),
      })
    : null;

  const milestoneOptimizer = value.signals[0]
    ? makeItem({
        id: `growth-optimizer-milestone-${value.signals[0].signal}`,
        title: `Move users faster toward ${value.signals[0].signal.toLowerCase()}`,
        detail: `${value.signals[0].signal} is currently the strongest growth value milestone, improving ${value.signals[0].strongestOutcome.toLowerCase()} by ${value.signals[0].strongestLift}pp.`,
        tone: value.signals[0].strongestLift >= 6 ? "good" : "watch",
        confidence: confidenceFromAudience(value.signals[0].audience),
        capabilities: ["onboarding path optimizer", "aha-moment detector", "growth lifecycle"],
        recommendation:
          "Optimize landing, first-screen promise, and early path continuity around this milestone before testing more upper-funnel volume.",
        href: "/admin/growth",
        evidence: [
          makeEvidence("Audience", String(value.signals[0].audience), "/admin/growth"),
          makeEvidence("Strongest outcome", value.signals[0].strongestOutcome, "/admin/growth"),
          makeEvidence("Lift", `${value.signals[0].strongestLift}pp`, "/admin/growth"),
        ],
        draft: makeDraft(
          "hypothesis",
          `Reach ${value.signals[0].signal.toLowerCase()} earlier`,
          `Growth quality improves once users hit ${value.signals[0].signal.toLowerCase()}. Test a shorter path to that milestone.`,
          "/admin/growth"
        ),
      })
    : null;

  const channelOptimizer = scaleOrFixChannels[0]
    ? makeItem({
        id: `growth-optimizer-channel-${scaleOrFixChannels[0].id}`,
        title: `Sequence the ${scaleOrFixChannels[0].title.toLowerCase()} path correctly`,
        detail: scaleOrFixChannels[0].detail,
        tone: scaleOrFixChannels[0].tone,
        confidence: scaleOrFixChannels[0].confidence,
        capabilities: ["onboarding path optimizer", "channel sequencing", "growth copilot"],
        recommendation:
          scaleOrFixChannels[0].tone === "good"
            ? "Use this path as the onboarding reference model before scaling more marginal channels."
            : "Repair this source path before adding more acquisition pressure elsewhere.",
        href: scaleOrFixChannels[0].href,
        evidence: scaleOrFixChannels[0].evidence,
        draft: makeDraft(
          scaleOrFixChannels[0].tone === "good" ? "action" : "investigation",
          `Review ${scaleOrFixChannels[0].title.toLowerCase()} sequencing`,
          scaleOrFixChannels[0].recommendation,
          scaleOrFixChannels[0].href
        ),
      })
    : null;

  return {
    generatedAt: new Date().toISOString(),
    days,
    surface: "growth",
    title: "Growth Path Intelligence",
    headline: `${scaleOrFixChannels.length + leakPaths.length} mined path signals and ${ahaItems.length} growth aha moments are ready in the current window.`,
    summary:
      "This layer turns growth reporting into path-level intelligence: which paths are worth scaling, which ones are broken, and which user behaviors most clearly predict durable downstream value.",
    prompts: [
      { label: "Best path", query: "Which growth path is strongest right now?" },
      { label: "Main leak path", query: "Which growth path is losing the most users?" },
      { label: "Aha signal", query: "What behavior looks most like the growth aha moment?" },
    ],
    sections: filterSections([
      makeSection(
        "paths",
        "Path Mining",
        "Scale-ready and broken paths across acquisition, conversion, and monetization.",
        [...scaleOrFixChannels, ...leakPaths].slice(0, 5)
      ),
      makeSection(
        "aha",
        "Aha Moments",
        "Behaviors that most strongly predict durable value once users hit them.",
        ahaItems
      ),
      makeSection(
        "optimizers",
        "Path Optimizers",
        "The clearest next path-level move before increasing acquisition pressure.",
        [recoveryPath, milestoneOptimizer, channelOptimizer].filter(
          (item): item is AdminIntelligenceItem => Boolean(item)
        )
      ),
    ]),
  };
}

export async function buildAdminPathIntelligenceSnapshot(
  inputSurface: string | null | undefined,
  inputDays: number,
  adminEmail?: string
): Promise<AdminIntelligenceSnapshot> {
  const surface = ensureSurface(inputSurface);
  const days = ensureDays(inputDays);

  if (surface === "growth") {
    if (!adminEmail) {
      throw new Error("Admin email is required for growth path intelligence.");
    }

    const [channels, leak, value] = await Promise.all([
      buildChannelEfficiencySnapshot(days),
      buildConversionLeakDebuggerSnapshot(days, adminEmail),
      buildValueRealizationSnapshot(days),
    ]);

    return buildGrowthPathSnapshot(days, channels, leak, value);
  }

  const [replay, experience, value] = await Promise.all([
    buildReplayPathClustersSnapshot(days),
    buildProductExperienceHealthSnapshot(days),
    buildValueRealizationSnapshot(days),
  ]);

  return buildProductPathSnapshot(days, replay, experience, value);
}
