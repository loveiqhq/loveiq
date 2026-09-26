import { NextResponse } from "next/server";
import { getReport2Section } from "@/data/report2";
import { REPORT_V4_LEARN_MORE } from "@/data/report3-learn-more";
import { buildTypicalBeliefs } from "@/data/report3-typical-beliefs";
import { buildAccelerators } from "@/data/report3-accelerators";
import { buildPartnership } from "@/data/report3-partnership";
import { buildFantasy } from "@/data/report3-fantasy";
import {
  buildArchetypeContentForUser,
  buildPracticeTendenciesForUser,
  splitArticleForReader,
  stripLockedEduBodyFromPayload,
} from "@features/report/server/contentGating";
import { isSectionUnlockedForPlan, isReportPurchasePlan } from "@features/report/server/access";
import { buildPartnershipCopy } from "@features/report/server/partnershipCopy";
import { buildFantasyCopy } from "@features/report/server/fantasyCopy";
import type { ReportAccessPlan } from "@features/report/server/access";
import { KNOWN_ARCHETYPES } from "@features/report/server/archetypeSlug";
import { buildPreviewQuotes } from "@/app/report-v4-preview/previewQuotes";

/**
 * A report with no reader behind it — for looking at the design on a laptop.
 *
 * WHY THIS EXISTS. /api/report answers for a real person: it resolves a token or
 * session to a survey_submission, reads their scoring_result, and gates the copy
 * against what they bought. That makes it impossible to open the report on a
 * machine with no database — which is every developer machine, since staging got
 * its own Supabase on 2026-09-21 and .env.local is not pointed at it.
 *
 * It is also the wrong dependency for the job. Checking a layout at 360px does not
 * need anyone's real answers; it needs the page. The whole report body already
 * lives in this repository — report-practice-tendencies.ts alone is 9,015 lines —
 * and the database only supplies WHO you are. So this route invents the who and
 * lets every other line of the real report render itself.
 *
 * WHAT MAKES IT SAFE. It never touches the database, so it cannot read or write a
 * real person's answers, and there is no token to forge. It 404s on production by
 * the same NEXT_PUBLIC_SITE_URL check app/report-v4-preview/page.tsx uses. And it
 * is additive: /api/report is untouched, so a reader with a real report reaches
 * exactly the code they reached yesterday.
 *
 * WHAT IS FAKE. The archetype, the percentages and the name. Nothing else —
 * the copy, the gating, the prices and the components are the real ones, through
 * the same helpers the real route calls.
 */

/** Matches app/report-v4-preview/page.tsx. Staging and local yes, production no. */
function isProduction(): boolean {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  return /\/\/(www\.)?loveiq\.org\b/.test(siteUrl) && !siteUrl.includes("staging");
}

/**
 * The frame's own numbers for the top three (43.4 / 39.5 / 36.2), then a descending
 * tail for the other eleven. Every list that ranks all fourteen — 2.0's Other
 * Archetypes (review 24.09: "the larger list of other archetypes of the Report V2"),
 * V1's probabilities — then has all fourteen rows to draw, as a real report does;
 * with only three, staging drew a repeat of the top-three card. The requested
 * archetype takes the top value, so it is the reader's own and never a tie.
 */
const PREVIEW_LEADERS = ["Spark Seeker", "Explorer of Edges", "Emotional Voyeur"] as const;
const PREVIEW_ORDER: readonly string[] = [
  ...PREVIEW_LEADERS,
  ...KNOWN_ARCHETYPES.filter((name) => !(PREVIEW_LEADERS as readonly string[]).includes(name)),
];
const PREVIEW_VALUES: readonly number[] = [
  43.4, 39.5, 36.2, 33.1, 30.2, 27.6, 25.1, 22.9, 20.8, 18.9, 17.1, 15.4, 13.8, 12.3,
];

function previewPercentages(primary: string): Record<string, number> {
  const order = [primary, ...PREVIEW_ORDER.filter((name) => name !== primary)];
  return Object.fromEntries(order.map((name, i) => [name, PREVIEW_VALUES.at(i) ?? 0]));
}

export async function GET(request: Request) {
  if (isProduction()) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const url = new URL(request.url);

  const requested = url.searchParams.get("archetype") ?? "Spark Seeker";
  // ReportPage forwards the raw ?archetype= slug, so match on letters alone:
  // "spark-seeker" and "Spark Seeker" both reduce to "sparkseeker".
  const flatten = (v: string) => v.toLowerCase().replace(/[^a-z]/g, "");
  const archetype =
    KNOWN_ARCHETYPES.find((a) => flatten(a) === flatten(requested)) ?? "Spark Seeker";

  const planParam = url.searchParams.get("plan") ?? "";
  // As on the real route, V4's chapters go only to the V4 page (final review 26.09).
  const isV4Request = url.searchParams.get("v4") === "1";
  const accessPlan: ReportAccessPlan = isReportPurchasePlan(planParam) ? planParam : null;

  // A paid preview owns its own archetype, exactly as a real purchase does.
  const unlockedArchetypes = accessPlan ? [archetype] : [];
  const archetypeTiers: Record<string, "essentials" | "full_report"> = accessPlan
    ? { [archetype]: accessPlan === "essentials" ? "essentials" : "full_report" }
    : {};
  // eslint-disable-next-line security/detect-object-injection -- archetype is resolved from KNOWN_ARCHETYPES above, never raw input.
  const archetypeTier = archetypeTiers[archetype] ?? null;

  const unlocked = (sectionId: string, isPremium = true) =>
    isSectionUnlockedForPlan({ accessPlan, archetypeTier, isPremium, sectionId });

  const beliefsUnlocked = unlocked("typical_beliefs");
  const beliefsSection = getReport2Section(archetype, "beliefs");
  const accelUnlocked = unlocked("typical_arousal_accelerators_turn_ons_of_the_core_archetype");
  const accelSection = getReport2Section(archetype, "accel");
  const accelerators = isV4Request
    ? buildAccelerators(archetype, { locked: !accelUnlocked })
    : null;
  const accelArticle =
    REPORT_V4_LEARN_MORE.typical_arousal_accelerators_turn_ons_of_the_core_archetype;
  // Challenges in Partnership shares Libido's full-report gate, as on the real route.
  const partnershipUnlocked = unlocked("libido_challenges_in_relationships");
  const { partnershipCopy, partnershipLoop } = buildPartnershipCopy(archetype, partnershipUnlocked);
  // Fantasy vs. Reality — section 27, full report only, as on the real route.
  const fantasyUnlocked = unlocked("typical_sexual_fantasy_amp_practice_tendencies");
  const { fantasyCopy, fantasyDots } = buildFantasyCopy(archetype, fantasyUnlocked);
  const fantasy = isV4Request ? buildFantasy(archetype, { locked: !fantasyUnlocked }) : null;
  const fantasyArticle = REPORT_V4_LEARN_MORE.typical_sexual_fantasy_amp_practice_tendencies;

  const payload = stripLockedEduBodyFromPayload({
    submissionId: null,
    accessPlan,
    userName: "Preview",
    userEmail: null,
    ownerFirstName: null,
    ownerToken: null,
    viewMode: "owner" as const,
    primaryArchetype: archetype,
    contentArchetype: archetype,
    percentages: previewPercentages(archetype),
    // Every archetype's motto, exactly as app/api/report/route.ts builds them, so the
    // Other Archetypes rows carry their line under each name.
    constellationMottos: Object.fromEntries(
      KNOWN_ARCHETYPES.map((name) => [name, getReport2Section(name, "constellation").motto ?? null])
    ),
    reportDate: new Date().toISOString(),
    diagnostics: null,
    snapshotAnswers: { currentSexualSatisfaction: 3, importanceOfSex: 5 },
    pricingQuotes: buildPreviewQuotes(),
    unlockedArchetypes,
    archetypeTiers,

    // The report body, through the same two helpers the real route uses — so a
    // section that is gated here is gated there, for the same reason.
    archetypeContent: buildArchetypeContentForUser(accessPlan, unlockedArchetypes),
    practiceTendencies: buildPracticeTendenciesForUser(
      accessPlan,
      unlockedArchetypes,
      archetypeTiers
    ),

    beliefsCopy: {
      "edu.eyebrow": beliefsSection["edu.eyebrow"] ?? null,
      "edu.teaser": beliefsSection["edu.teaser"] ?? null,
      "edu.body.p1": beliefsSection["edu.body.p1"] ?? null,
      "edu.body.p2": beliefsSection["edu.body.p2"] ?? null,
      "edu.body.p3": beliefsSection["edu.body.p3"] ?? null,
      "body.p1": beliefsUnlocked ? (beliefsSection["body.p1"] ?? null) : null,
      keep: Array.from(
        { length: beliefsUnlocked ? 9 : 5 },
        (_, i) => beliefsSection[`keep.${i + 1}`] ?? null
      ),
      loosen: Array.from({ length: beliefsUnlocked ? 10 : 3 }, (_, i) => ({
        belief: beliefsSection[`loosen.${i + 1}.belief`] ?? null,
        shift: beliefsSection[`loosen.${i + 1}.shift`] ?? null,
      })),
      "learn.eyebrow": beliefsSection["learn.eyebrow"] ?? null,
      "learn.body": beliefsSection["learn.body"] ?? null,
      locked: !beliefsUnlocked,
    },

    // Report 3.0, gated identically to the chapter it replaces.
    typicalBeliefs: isV4Request
      ? buildTypicalBeliefs(archetype, { locked: !beliefsUnlocked })
      : null,
    typicalBeliefsArticle:
      isV4Request && REPORT_V4_LEARN_MORE.typical_beliefs
        ? {
            article: splitArticleForReader(REPORT_V4_LEARN_MORE.typical_beliefs, !beliefsUnlocked),
            locked: !beliefsUnlocked,
          }
        : null,

    // V2's Accelerators & Brakes copy, exactly as the real route builds it. Without
    // it the V2 section rendered nothing under ?preview=1, leaving the chapter an
    // empty head for every archetype still on V2.
    accelCopy: {
      "edu.eyebrow": accelSection["edu.eyebrow"] ?? null,
      "edu.teaser": accelSection["edu.teaser"] ?? null,
      "edu.body.p1": accelSection["edu.body.p1"] ?? null,
      "edu.body.p2": accelSection["edu.body.p2"] ?? null,
      "edu.body.p3": accelSection["edu.body.p3"] ?? null,
      takeaway: accelUnlocked ? (accelSection.takeaway ?? null) : null,
      "learn.eyebrow": accelSection["learn.eyebrow"] ?? null,
      "learn.body": accelSection["learn.body"] ?? null,
      locked: !accelUnlocked,
    },

    // Report 3.0's Accelerator & Brakes, gated identically to the chapter it
    // replaces, and its article only alongside it.
    accelerators,
    acceleratorsArticle:
      accelerators && accelArticle
        ? { article: splitArticleForReader(accelArticle, !accelUnlocked), locked: !accelUnlocked }
        : null,

    // V2's Challenges in Partnership copy and loop, through the real route's own
    // builder. Without them the V2 section rendered nothing under ?preview=1 — the
    // chapter an empty head for every archetype still on V2, V4's fallback included.
    partnershipCopy,
    partnershipLoop,

    // Report 3.0's Challenges in Partnerships, gated identically to the chapter it
    // replaces.
    partnership: isV4Request ? buildPartnership(archetype, { locked: !partnershipUnlocked }) : null,

    // V2's Fantasy vs. Reality copy and map dots, through the real route's own
    // builder, so V4's fallback for the thirteen archetypes still on V2 is not an
    // empty head in the preview.
    fantasyCopy,
    fantasyDots,

    // Report 3.0's Fantasy vs. Reality, gated identically to the chapter it
    // replaces, and its article only alongside it.
    fantasy,
    fantasyArticle:
      fantasy && fantasyArticle
        ? {
            article: splitArticleForReader(fantasyArticle, !fantasyUnlocked),
            locked: !fantasyUnlocked,
          }
        : null,
  });

  // No caching: the answer changes with every ?archetype= and ?plan=, and it is
  // never worth a CDN hop on a route that does no work.
  return NextResponse.json(payload, {
    headers: { "Cache-Control": "no-store" },
  });
}
