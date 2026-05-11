import { buildChannelEfficiencySnapshot } from "@/lib/admin/channel-efficiency";
import { buildCreativeIntelligenceSnapshot } from "@/lib/admin/creative-intelligence";
import type { ResearchIntelligenceSnapshot } from "@/lib/admin/research-intelligence";
import { buildResearchIntelligenceSnapshot } from "@/lib/admin/research-intelligence";
import { buildResearchTaxonomySnapshot } from "@/lib/admin/research-taxonomy";
import { clampDays } from "@/lib/admin/next-level";
import { buildValueRealizationSnapshot } from "@/lib/admin/value-realization";
import type {
  AdminIntelligenceDraft,
  AdminIntelligenceEvidence,
  AdminIntelligenceItem,
  AdminIntelligenceSection,
  AdminIntelligenceSnapshot,
  AdminIntelligenceSurface,
  AdminIntelligenceTone,
} from "@/lib/admin/intelligence-types";

type GrowthSignalSurface = Extract<AdminIntelligenceSurface, "growth" | "research">;

const SURFACES: GrowthSignalSurface[] = ["growth", "research"];
const RESEARCH_HREF = "/admin/research";

function ensureSurface(value: string | null | undefined): GrowthSignalSurface {
  return SURFACES.includes(value as GrowthSignalSurface)
    ? (value as GrowthSignalSurface)
    : "growth";
}

function ensureDays(value: number): number {
  return clampDays(Number.isFinite(value) ? Math.round(value) : 30, 7, 365);
}

function buildGrowthTabHref(tab: string) {
  return `/admin/growth?${new URLSearchParams({ tab }).toString()}`;
}

function tokenize(value: string | null | undefined): string[] {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3);
}

function overlap(left: string[], right: string[]): number {
  const set = new Set(left);
  return right.filter((token) => set.has(token)).length;
}

function confidenceFromCount(value: number): "high" | "medium" | "low" {
  if (value >= 30) return "high";
  if (value >= 12) return "medium";
  return "low";
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

function estimateWasteStarts(starts: number, efficiencyScore: number, paidRate: number): number {
  const efficiencyPenalty = Math.max(0, 55 - efficiencyScore) / 55;
  const monetizationPenalty = paidRate <= 0 ? 0.22 : Math.max(0, 3 - paidRate) / 10;
  return Math.max(1, Math.round(starts * Math.min(0.75, efficiencyPenalty + monetizationPenalty)));
}

function qualityBand(score: number): "durable" | "emerging" | "fragile" {
  if (score >= 62) return "durable";
  if (score >= 45) return "emerging";
  return "fragile";
}

function fitTone(score: number, starts: number): AdminIntelligenceTone {
  if (score >= 68 && starts >= 12) return "good";
  if (score < 45 && starts >= 12) return "risk";
  return "watch";
}

function questionOverlap(questionIds: string[], research: ResearchIntelligenceSnapshot): number {
  return research.painQuestions.filter((question) => questionIds.includes(question.questionId))
    .length;
}

function buildObjectionItems(input: {
  research: Awaited<ReturnType<typeof buildResearchIntelligenceSnapshot>>;
  taxonomy: Awaited<ReturnType<typeof buildResearchTaxonomySnapshot>>;
}): AdminIntelligenceItem[] {
  const activeTerms = input.taxonomy.terms.filter((term) => term.status === "active");

  const rankedThemes = input.research.themes
    .map((theme) => {
      const themeTokens = tokenize(
        [theme.theme, theme.leadingArchetype ?? "", ...theme.sampleExcerpts].join(" ")
      );
      const matchingTerms = activeTerms.filter((term) => {
        const termTokens = tokenize([term.label, ...term.exampleTerms].join(" "));
        return (
          term.linkedQuestionIds.some((questionId) => theme.questionIds.includes(questionId)) ||
          overlap(termTokens, themeTokens) > 0
        );
      });
      const painMatches = input.research.painQuestions.filter((question) =>
        theme.questionIds.includes(question.questionId)
      );
      const contradictionMatches = input.research.contradictions.filter((item) =>
        theme.questionIds.some((questionId) =>
          item.evidence.some((evidence) => evidence.includes(questionId))
        )
      );
      const score =
        theme.responses * 1.5 +
        painMatches.reduce((sum, question) => sum + question.severityScore, 0) * 0.7 +
        contradictionMatches.length * 18 +
        (matchingTerms.length === 0 ? 20 : 0);

      return { theme, matchingTerms, painMatches, contradictionMatches, score };
    })
    .sort((left, right) => right.score - left.score)
    .slice(0, 3);

  if (rankedThemes.length === 0) {
    return [
      makeItem({
        id: "growth-signals-objections-empty",
        title: "Objection taxonomy has no live objection clusters",
        detail:
          "Research themes are too sparse in the current window to rank live objections with confidence.",
        tone: "watch",
        confidence: "low",
        capabilities: ["objection taxonomy builder", "research synthesis", "growth messaging"],
        recommendation:
          "Widen the research window or add more linked questions before treating objection themes as stable targeting signals.",
        href: RESEARCH_HREF,
        evidence: [
          makeEvidence("Themes", String(input.research.themes.length), RESEARCH_HREF),
          makeEvidence("Active taxonomy terms", String(activeTerms.length), RESEARCH_HREF),
        ],
        draft: makeDraft(
          "investigation",
          "Review objection coverage",
          "Research themes are too thin to promote stable objections yet.",
          RESEARCH_HREF
        ),
      }),
    ];
  }

  return rankedThemes.map(({ theme, matchingTerms, painMatches, contradictionMatches }) =>
    makeItem({
      id: `growth-signals-objection-${theme.theme.toLowerCase()}`,
      title: `Objection cluster: ${theme.theme}`,
      detail: `${theme.responses} responses across ${theme.questions} questions point to ${theme.theme.toLowerCase()} as a live objection cluster${theme.leadingArchetype ? ` for ${theme.leadingArchetype}` : ""}.`,
      tone:
        contradictionMatches.length > 0 ||
        painMatches.some((question) => question.severityScore >= 70)
          ? "risk"
          : matchingTerms.length === 0
            ? "watch"
            : "good",
      confidence: confidenceFromCount(theme.responses),
      capabilities: ["objection taxonomy builder", "research synthesis", "growth messaging"],
      recommendation:
        matchingTerms.length === 0
          ? `Formalize ${theme.theme.toLowerCase()} as an active objection term, then align creative and onboarding copy against it instead of leaving it implicit.`
          : `Refresh the ${matchingTerms[0]!.label.toLowerCase()} taxonomy node with the current evidence and test whether copy that resolves it improves downstream quality.`,
      caveat:
        contradictionMatches.length > 0
          ? `${contradictionMatches.length} contradiction signal(s) hit the same question cluster, so the objection may reflect both expectation and product reality.`
          : null,
      href: RESEARCH_HREF,
      evidence: [
        makeEvidence("Responses", String(theme.responses), RESEARCH_HREF),
        makeEvidence(
          "Linked questions",
          theme.questionIds.slice(0, 3).join(", ") || "none",
          RESEARCH_HREF
        ),
        makeEvidence(
          "Pain questions",
          painMatches
            .map((question) => question.questionId)
            .slice(0, 2)
            .join(", ") || "none",
          RESEARCH_HREF
        ),
        makeEvidence(
          "Existing taxonomy",
          matchingTerms
            .map((term) => term.label)
            .slice(0, 2)
            .join(", ") || "none",
          RESEARCH_HREF
        ),
      ],
      draft: makeDraft(
        matchingTerms.length === 0 ? "action" : "hypothesis",
        `Resolve ${theme.theme.toLowerCase()} objection`,
        matchingTerms.length === 0
          ? `Create or activate a taxonomy term for ${theme.theme.toLowerCase()} and use it to align copy, onboarding, and experiment briefs.`
          : `Test whether directly resolving ${theme.theme.toLowerCase()} language improves completion and value-realization quality.`,
        RESEARCH_HREF
      ),
    })
  );
}

function buildPersonaFitItems(input: {
  creative: Awaited<ReturnType<typeof buildCreativeIntelligenceSnapshot>>;
  research: Awaited<ReturnType<typeof buildResearchIntelligenceSnapshot>>;
  value: Awaited<ReturnType<typeof buildValueRealizationSnapshot>>;
}): AdminIntelligenceItem[] {
  const creativeHref = buildGrowthTabHref("Creative Intelligence");

  const rankedFits = input.creative.messageThemes
    .map((theme) => {
      const researchTheme = input.research.themes.find(
        (item) => item.theme.toLowerCase() === theme.theme.toLowerCase()
      );
      const themeTokens = tokenize(theme.theme);
      const fallbackResearchTheme =
        researchTheme ??
        input.research.themes.find((item) => overlap(themeTokens, tokenize(item.theme)) > 0) ??
        null;
      const leadingArchetype =
        researchTheme?.leadingArchetype ??
        fallbackResearchTheme?.leadingArchetype ??
        input.value.archetypes[0]?.archetype ??
        "Unclear";
      const alignmentResponses = researchTheme?.responses ?? fallbackResearchTheme?.responses ?? 0;
      const fitScore =
        theme.paidRate * 6 +
        theme.completionRate * 0.35 +
        Math.min(theme.revenueTotal / Math.max(theme.starts, 1), 20) * 1.5 +
        Math.min(alignmentResponses, 40) * 0.5;

      return {
        theme,
        researchTheme: researchTheme ?? fallbackResearchTheme,
        leadingArchetype,
        fitScore,
      };
    })
    .sort((left, right) => right.fitScore - left.fitScore)
    .slice(0, 3);

  return rankedFits.map(({ theme, researchTheme, leadingArchetype, fitScore }) =>
    makeItem({
      id: `growth-signals-fit-${theme.theme.toLowerCase()}`,
      title: `Message-persona fit: ${theme.theme} -> ${leadingArchetype}`,
      detail: `${theme.theme} creatives produced ${theme.starts} starts with ${theme.paidRate}% paid rate${researchTheme ? ` while matching a live ${researchTheme.theme.toLowerCase()} research theme` : ""}.`,
      tone: fitTone(fitScore, theme.starts),
      confidence: confidenceFromCount(theme.starts + (researchTheme?.responses ?? 0)),
      capabilities: ["message-persona fit scorer", "creative intelligence", "persona targeting"],
      recommendation:
        fitScore >= 68
          ? `Use ${theme.theme.toLowerCase()} as the reference message for ${leadingArchetype.toLowerCase()} acquisition and onboarding paths.`
          : `Rewrite ${theme.theme.toLowerCase()} creative so it resolves the actual ${leadingArchetype.toLowerCase()} concern instead of only naming it.`,
      caveat:
        researchTheme == null
          ? "Persona fit is inferred from creative and downstream quality only because there is no direct live research theme match."
          : null,
      href: creativeHref,
      evidence: [
        makeEvidence("Starts", String(theme.starts), creativeHref),
        makeEvidence("Paid rate", `${theme.paidRate}%`, creativeHref),
        makeEvidence("Research responses", String(researchTheme?.responses ?? 0), RESEARCH_HREF),
        makeEvidence("Persona", leadingArchetype, RESEARCH_HREF),
      ],
      draft: makeDraft(
        "hypothesis",
        `Refine ${theme.theme.toLowerCase()} message for ${leadingArchetype.toLowerCase()}`,
        fitScore >= 68
          ? `Protect the ${theme.theme.toLowerCase()} message and test adjacent variants without changing the core persona promise.`
          : `Test copy that speaks directly to the ${leadingArchetype.toLowerCase()} objection rather than relying on broad ${theme.theme.toLowerCase()} framing.`,
        creativeHref
      ),
    })
  );
}

function buildWasteItems(input: {
  channels: Awaited<ReturnType<typeof buildChannelEfficiencySnapshot>>;
  creative: Awaited<ReturnType<typeof buildCreativeIntelligenceSnapshot>>;
}): AdminIntelligenceItem[] {
  const channelHref = buildGrowthTabHref("Channel Efficiency");

  const rankedChannels = input.channels.channels
    .filter(
      (channel) =>
        channel.starts >= 12 &&
        (channel.action === "fix" || channel.efficiencyScore < 45 || channel.paidRate <= 1.5)
    )
    .map((channel) => {
      const weakCreatives = input.creative.creatives.filter(
        (creative) =>
          creative.source === channel.source &&
          (creative.attention === "fix" || creative.attention === "blindspot")
      );
      const wasteStarts =
        weakCreatives.reduce((sum, creative) => sum + creative.starts, 0) ||
        estimateWasteStarts(channel.starts, channel.efficiencyScore, channel.paidRate);

      return { channel, weakCreatives, wasteStarts };
    })
    .sort((left, right) => right.wasteStarts - left.wasteStarts)
    .slice(0, 3);

  return rankedChannels.map(({ channel, weakCreatives, wasteStarts }) =>
    makeItem({
      id: `growth-signals-waste-${channel.source.toLowerCase()}`,
      title: `Paid waste risk: ${channel.source}`,
      detail: `${channel.starts} starts are flowing through ${channel.source}, but efficiency is ${channel.efficiencyScore} with ${channel.paidRate}% paid rate. Roughly ${wasteStarts} starts look low-value or badly tracked in this window.`,
      tone: channel.efficiencyScore < 35 || channel.paidRate === 0 ? "risk" : "watch",
      confidence: channel.confidence,
      capabilities: ["paid traffic waste detector", "channel efficiency", "creative diagnosis"],
      recommendation:
        weakCreatives.length > 0
          ? "Stop adding spend until the weakest creative or tracking blindspot is repaired. This source is leaking quality before monetization."
          : "Cap spend on this source until the start-to-paid path or tracking coverage improves.",
      caveat:
        weakCreatives.length === 0
          ? "Waste is inferred from channel quality alone because no specific weak creative was isolated."
          : null,
      href: channelHref,
      evidence: [
        makeEvidence("Starts", String(channel.starts), channelHref),
        makeEvidence("Efficiency", String(channel.efficiencyScore), channelHref),
        makeEvidence("Paid rate", `${channel.paidRate}%`, channelHref),
        makeEvidence(
          "Weak creatives",
          weakCreatives
            .map((creative) => creative.content)
            .slice(0, 2)
            .join(", ") || "none",
          buildGrowthTabHref("Creative Intelligence")
        ),
      ],
      draft: makeDraft(
        "investigation",
        `Audit ${channel.source} paid waste`,
        `Review channel quality, weak creatives, and tracking coverage before routing more paid volume through ${channel.source}.`,
        channelHref
      ),
    })
  );
}

function buildLtvItems(input: {
  value: Awaited<ReturnType<typeof buildValueRealizationSnapshot>>;
}): AdminIntelligenceItem[] {
  const valueHref = buildGrowthTabHref("Value Attribution");

  const rankedChannels = input.value.channels
    .filter((channel) => channel.starts >= 10)
    .sort((left, right) => right.valueRealizationScore - left.valueRealizationScore)
    .slice(0, 3);

  return rankedChannels.map((channel) => {
    const composite =
      channel.valueRealizationScore * 0.55 +
      channel.retentionLift * 4 +
      channel.referralLift * 2 +
      channel.upgradeIntentLift * 2 +
      channel.revenuePerStart * 3;
    const band = qualityBand(composite);

    return makeItem({
      id: `growth-signals-ltv-${channel.source.toLowerCase()}`,
      title: `LTV-quality forecast: ${channel.source}`,
      detail: `${channel.source} looks ${band} on proxy LTV quality: score ${channel.valueRealizationScore}, retention +${channel.retentionLift}pp, referral +${channel.referralLift}pp, revenue/start $${channel.revenuePerStart}.`,
      tone: band === "durable" ? "good" : band === "fragile" ? "risk" : "watch",
      confidence: confidenceFromCount(channel.starts),
      capabilities: ["LTV-quality forecaster", "value realization", "growth allocation"],
      recommendation:
        band === "durable"
          ? "Scale this source against channels that look similar on retention and referral, not just conversion volume."
          : band === "fragile"
            ? "Treat this source as low-quality demand until retention and referral improve; conversion alone is overstating its value."
            : "Hold volume steady while testing whether the source can graduate into durable downstream quality.",
      caveat:
        "This is a zero-cost LTV proxy built from retention, referral, upgrade-intent, and revenue-per-start signals, not a true long-horizon cashflow model.",
      href: valueHref,
      evidence: [
        makeEvidence("Starts", String(channel.starts), valueHref),
        makeEvidence("Retention lift", `${channel.retentionLift}pp`, valueHref),
        makeEvidence("Referral lift", `${channel.referralLift}pp`, valueHref),
        makeEvidence("Revenue/start", `$${channel.revenuePerStart}`, valueHref),
      ],
      draft: makeDraft(
        "brief",
        `Review ${channel.source} LTV-quality band`,
        `Current proxy LTV quality for ${channel.source} looks ${band}. Use retention and referral, not only conversions, when making budget decisions.`,
        valueHref
      ),
    });
  });
}

function buildGrowthSnapshot(input: {
  days: number;
  objections: AdminIntelligenceItem[];
  personaFit: AdminIntelligenceItem[];
  waste: AdminIntelligenceItem[];
  ltv: AdminIntelligenceItem[];
}): AdminIntelligenceSnapshot {
  return {
    generatedAt: new Date().toISOString(),
    days: input.days,
    surface: "growth",
    title: "Growth Signal Intelligence",
    headline: `${input.objections.length + input.personaFit.length + input.waste.length + input.ltv.length} signal-quality findings are ready for the current growth window.`,
    summary:
      "This layer closes the gap between traffic, messaging, and downstream quality. It identifies the objections users are carrying in, whether messages fit the right personas, where paid volume is being wasted, and which sources look durable instead of only high-converting.",
    prompts: [
      {
        label: "Main objection",
        query: "What objection is hurting growth quality most right now?",
      },
      { label: "Best fit", query: "Which message is best matched to a real persona today?" },
      { label: "Paid waste", query: "Where is paid traffic being wasted right now?" },
      {
        label: "LTV quality",
        query: "Which source looks durable on downstream quality, not just conversion?",
      },
    ],
    sections: filterSections([
      makeSection(
        "objections",
        "Objection Taxonomy",
        "Recurring objections grounded in research themes, pain questions, and live contradictions.",
        input.objections
      ),
      makeSection(
        "persona-fit",
        "Message-Persona Fit",
        "Which message themes are resonating with the right cohorts and which ones are mismatched.",
        input.personaFit
      ),
      makeSection(
        "paid-waste",
        "Paid Waste",
        "Where volume is being pushed through weak quality paths or tracking blindspots.",
        input.waste
      ),
      makeSection(
        "ltv",
        "LTV-Quality Forecasts",
        "Sources ranked by durable downstream quality rather than top-of-funnel conversion alone.",
        input.ltv
      ),
    ]),
  };
}

function buildResearchSnapshot(input: {
  days: number;
  objections: AdminIntelligenceItem[];
  personaFit: AdminIntelligenceItem[];
  ltv: AdminIntelligenceItem[];
}): AdminIntelligenceSnapshot {
  return {
    generatedAt: new Date().toISOString(),
    days: input.days,
    surface: "research",
    title: "Objection & Persona Intelligence",
    headline: `${input.objections.length + input.personaFit.length} research-linked message signals are ready for review.`,
    summary:
      "This view turns research into acquisition and lifecycle signal quality. It shows which objections are strong enough to become taxonomy anchors, how message themes align to real personas, and which downstream value patterns deserve research follow-up.",
    prompts: [
      { label: "Top objection", query: "What objection should research formalize next?" },
      {
        label: "Message fit",
        query: "Which message theme aligns best to a live persona right now?",
      },
      {
        label: "Value proxy",
        query: "Which source looks durable enough to study as a positive outlier?",
      },
    ],
    sections: filterSections([
      makeSection(
        "objections",
        "Objection Taxonomy",
        "Live objection clusters that should become or refresh explicit research taxonomy nodes.",
        input.objections
      ),
      makeSection(
        "persona-fit",
        "Message-Persona Fit",
        "Message themes mapped back to research personas so research can validate or correct the marketing story.",
        input.personaFit
      ),
      makeSection(
        "value",
        "Value Proxies",
        "Durable downstream quality signals worth turning into structured research follow-up.",
        input.ltv.slice(0, 2)
      ),
    ]),
  };
}

export async function buildGrowthSignalIntelligenceSnapshot(
  inputSurface: string | null | undefined,
  inputDays: number
): Promise<AdminIntelligenceSnapshot> {
  const surface = ensureSurface(inputSurface);
  const days = ensureDays(inputDays);

  const [channels, creative, research, taxonomy, value] = await Promise.all([
    buildChannelEfficiencySnapshot(days),
    buildCreativeIntelligenceSnapshot(days),
    buildResearchIntelligenceSnapshot(days),
    buildResearchTaxonomySnapshot(),
    buildValueRealizationSnapshot(days),
  ]);

  const objections = buildObjectionItems({ research, taxonomy });
  const personaFit = buildPersonaFitItems({ creative, research, value });
  const waste = buildWasteItems({ channels, creative });
  const ltv = buildLtvItems({ value });

  if (surface === "research") {
    return buildResearchSnapshot({ days, objections, personaFit, ltv });
  }

  return buildGrowthSnapshot({ days, objections, personaFit, waste, ltv });
}

export function parseGrowthSignalSurface(value: string | null | undefined): GrowthSignalSurface {
  return ensureSurface(value);
}
