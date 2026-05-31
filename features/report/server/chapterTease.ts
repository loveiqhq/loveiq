/**
 * Chapter-by-chapter nudge logic (server-only, no React).
 *
 * Powers `/api/cron/chapter-nudge`: a long-tail drip that teases ONE locked,
 * archetype-specific report chapter per send. The actual paywalled prose lives
 * in `data/report-archetypes.ts` (`archetypeContent[blockId][archetypeName]`);
 * here we decide which chapters are still locked for a given user, pick the
 * next one in a stable per-user random order, and cut ~150 words of its prose
 * into a "start reading then it stops" tease.
 *
 * Pure functions only — no DB, no Resend, no env reads. The cron route wires
 * these into candidate selection + sending.
 */

import { createHash } from "node:crypto";

import { archetypeContent } from "@/data/report-archetypes";
import { reportSections, type ReportSection } from "@/data/report-general";
import { getReportBlockText, normalizeReportHtml } from "@features/report/ui/reportContent";
import { resolveReportNavTitle } from "@features/report/sectionTitles";
import {
  isSectionIncludedInEssentials,
  type ReportAccessPlan,
} from "@features/report/server/access";
import {
  fromArchetypeSlug,
  isArchetypeName,
  toArchetypeSlug,
  type ArchetypeName,
} from "@features/report/server/archetypeSlug";

export interface ChapterNudgeEntry {
  sectionId: string;
  blockId: string;
}

/**
 * Sections excluded from the drip even though they are premium + archetype-keyed:
 *   - the practice-tendencies TABLE (scores, not prose — gated differently and
 *     does not read as a 150-word narrative tease)
 *   - recommendations (a book/citation list with external links)
 */
const EXCLUDED_SECTION_IDS = new Set<string>([
  "typical_sexual_fantasy_amp_practice_tendencies",
  "recommendations",
]);

/**
 * The drip pool: every premium section that has archetype-specific prose,
 * minus the excluded ones. Derived once from `reportSections` so adding a new
 * premium chapter to the report automatically makes it eligible (its prose +
 * a one-liner still need to exist — see CHAPTER_LEARN_ONELINERS + the
 * presence guard in `computeLockedChapters`).
 */
export const CHAPTER_NUDGE_POOL: ChapterNudgeEntry[] = reportSections
  .filter(
    (section) =>
      section.isPremium && section.archetypeBlockId && !EXCLUDED_SECTION_IDS.has(section.id)
  )
  .map((section) => ({ sectionId: section.id, blockId: section.archetypeBlockId as string }));

const SECTION_BY_ID = new Map<string, ReportSection>(
  reportSections.map((section) => [section.id, section])
);

/**
 * "What you'll learn" one-liner per chapter (editorial copy — reviewed before
 * launch). Keyed by section id. A missing key falls back to DEFAULT_ONELINER.
 */
export const CHAPTER_LEARN_ONELINERS: Record<string, string> = {
  core_motivation: "What your desire is really chasing — and why that changes everything.",
  attachment_style: "How your nervous system turns closeness into either fuel or threat.",
  core_insecurities: "The hidden fear quietly steering when your desire opens or shuts down.",
  confidence_level: "Where your sexual confidence actually comes from — and what erodes it.",
  typical_beliefs: "The early stories about sex you didn't choose but still live by.",
  biochemical_reward_system_dynamics: "Which brain chemistry makes sex feel worth wanting for you.",
  energy_level: "The pace and intensity your desire naturally runs at.",
  risk_orientation: "How much edge you need to feel alive — versus safe.",
  power_orientation: "Whether desire grows through leading, yielding, or flowing between.",
  curiosity_level: "How much novelty feeds you — and how much overwhelms you.",
  relationship_form_preference: "The relationship shape your desire can actually breathe in.",
  communication_style: "How you signal wanting — and why partners keep missing it.",
  love_language: "The signals your body reads as 'I'm safe, I'm wanted.'",
  arousal_style: "What has to happen, inside and out, for desire to switch on.",
  initiation_style: "How you start sex — or wait for the conditions to be right.",
  typical_arousal_accelerators_turn_ons_of_the_core_archetype:
    "The specific accelerators that reliably spark your arousal.",
  typical_arousal_brakes_turn_offs_of_the_core_archetype:
    "The quiet brakes that shut your desire down without warning.",
  libido_challenges_in_relationships: "Why desire fades in relationships — and what revives it.",
  typical_challenges_to_enjoy_sex_for_the_core_archetype:
    "What gets in the way of you actually enjoying sex.",
  typical_challenges_to_sustain_partner_for_the_core_archetype:
    "Where long-term desire tends to slip for your type.",
  typical_growth_potentials_for_the_core_archetype:
    "Your clearest path to a richer, more confident erotic life.",
};

const DEFAULT_ONELINER = "A part of your report written specifically for your archetype.";

// A chapter must have at least this many words of prose to enter the drip, so
// the 60%-cap tease (see extractTease) always leaves content behind the paywall
// — a chapter is never emailed in full. The shortest real chapter is ~144
// words, so this only ever excludes degenerate / near-empty content.
const MIN_CHAPTER_WORDS = 40;

/**
 * Normalize a stored archetype string to a current (V9) archetype name so it
 * matches the keys in `archetypeContent`. Handles legacy renames (e.g.
 * "Approval Seeker" → "Tender Devotee"). Returns null for anything unknown.
 */
export function normalizeArchetypeName(raw: string | null | undefined): ArchetypeName | null {
  if (!raw) return null;
  if (isArchetypeName(raw)) return raw;
  const slug = toArchetypeSlug(raw);
  return slug ? fromArchetypeSlug(slug) : null;
}

/**
 * Read the `chapterNudgesSent` section-id list out of a quote's metadata blob.
 * Tolerates missing / malformed metadata (returns []).
 */
export function getChapterNudgesSentFromMetadata(
  metadata: Record<string, unknown> | null | undefined
): string[] {
  const raw = metadata?.chapterNudgesSent;
  return Array.isArray(raw)
    ? raw.filter((value): value is string => typeof value === "string")
    : [];
}

/**
 * The chapters still locked for `primaryArchetype` given the user's access.
 *
 *   - all_reports          → nothing locked (everything unlocked)
 *   - full_report (primary)→ nothing locked (every premium section unlocked)
 *   - essentials (primary) → the 5 essentials sections drop; the rest stay locked
 *   - free (no tier)       → every pool chapter is locked
 *
 * Per-archetype tier is read from `archetype_tiers[primary]`, with a legacy
 * fallback to `unlocked_archetypes` (a primary in that array implies a full
 * unlock, matching the pre-`archetype_tiers` data model). The global
 * `accessPlan` is only consulted for the `all_reports` case — a full_report /
 * essentials purchase made for a DIFFERENT archetype must not unlock the
 * primary's chapters.
 *
 * Chapters whose prose is missing for this archetype are dropped so the picker
 * never selects an un-teasable chapter (which would stall the campaign).
 */
export function computeLockedChapters({
  accessPlan,
  archetypeTiers,
  unlockedArchetypes,
  primaryArchetype,
}: {
  accessPlan: ReportAccessPlan;
  archetypeTiers: Record<string, string> | null | undefined;
  unlockedArchetypes: string[] | null | undefined;
  primaryArchetype: string;
}): ChapterNudgeEntry[] {
  if (accessPlan === "all_reports") return [];

  // eslint-disable-next-line security/detect-object-injection -- primaryArchetype is a validated archetype name, not user input.
  const tierRaw = archetypeTiers?.[primaryArchetype];
  let primaryTier: "essentials" | "full_report" | null =
    tierRaw === "essentials" || tierRaw === "full_report" ? tierRaw : null;
  if (!primaryTier && unlockedArchetypes?.includes(primaryArchetype)) {
    primaryTier = "full_report";
  }
  if (primaryTier === "full_report") return [];

  return CHAPTER_NUDGE_POOL.filter((chapter) => {
    const block = archetypeContent[chapter.blockId];
    // eslint-disable-next-line security/detect-object-injection -- primaryArchetype is a validated archetype name.
    const html = block?.[primaryArchetype];
    if (!html) return false;
    // Count words on the SAME normalized pipeline extractTease uses, so any
    // chapter admitted here is guaranteed to yield a non-empty tease (≥
    // MIN_CHAPTER_WORDS after footnote/ref stripping). Counting on raw HTML
    // could admit a chapter that buildChapterContent can't tease → it would be
    // re-picked every run and stall the campaign.
    if (
      getReportBlockText(normalizeReportHtml(html)).split(/\s+/).filter(Boolean).length <
      MIN_CHAPTER_WORDS
    ) {
      return false;
    }
    if (primaryTier === "essentials" && isSectionIncludedInEssentials(chapter.sectionId)) {
      return false; // already unlocked by the essentials tier
    }
    return true;
  });
}

/**
 * Deterministic per-user shuffle, keyed on item IDENTITY (not array position).
 * Same email always yields the same relative order for a given chapter, and —
 * crucially — that order is stable even when the input set changes (an
 * essentials purchase removes chapters mid-campaign, or a new premium section
 * is added later): the remaining chapters keep their order, so "Chapter X of N"
 * stays coherent run-to-run and no chapter is ever re-sent out of order.
 * Different emails get different orders. Pure + reproducible (no Math.random),
 * matching the `ab-variant` hashing pattern.
 */
export function seededShuffle<T>(
  items: readonly T[],
  seedKey: string,
  keyOf: (item: T) => string
): T[] {
  if (items.length < 2) return items.slice();

  const key = `chapter-nudge:${(seedKey || "").trim().toLowerCase()}`;
  // Rank each item by SHA-256(user seed : item identity), sort by the hex rank.
  // A 256-bit rank makes ties astronomically unlikely.
  return items
    .map((item) => ({
      item,
      rank: createHash("sha256")
        .update(`${key}:${keyOf(item)}`)
        .digest("hex"),
    }))
    .sort((a, b) => (a.rank < b.rank ? -1 : a.rank > b.rank ? 1 : 0))
    .map((decorated) => decorated.item);
}

/**
 * Pick the next chapter to send: the first chapter in the user's stable
 * shuffled order that hasn't been sent yet. `index` is its 1-based position in
 * the shuffled locked set; `total` is the current locked-chapter count.
 * Returns null when every locked chapter has already been sent (campaign done).
 */
export function pickNextChapter({
  lockedChapters,
  alreadySent,
  email,
}: {
  lockedChapters: ChapterNudgeEntry[];
  alreadySent: string[];
  email: string;
}): { entry: ChapterNudgeEntry; index: number; total: number } | null {
  if (lockedChapters.length === 0) return null;
  const order = seededShuffle(lockedChapters, email, (chapter) => chapter.sectionId);
  const sent = new Set(alreadySent);
  for (const [position, chapter] of order.entries()) {
    if (!sent.has(chapter.sectionId)) {
      return { entry: chapter, index: position + 1, total: order.length };
    }
  }
  return null;
}

export interface TeaseResult {
  /** Entity-decoded plain text (tags + footnotes stripped). No HTML. */
  text: string;
  /** True when the prose was longer than `targetWords` and got cut. */
  wasTruncated: boolean;
}

const TRAILING_PUNCTUATION = /[\s.,;:!?'"()–—‘’“”-]+$/;

// A tease must never reveal a whole chapter — even a short one. We cap the cut
// at this fraction of the chapter so there is always paywalled prose left to
// pull the reader to /report.
const MAX_TEASE_FRACTION = 0.6;

/**
 * Cut a word-limited slice of plain text out of a chapter's archetype prose,
 * ending mid-thought. The slice is `min(targetWords, 60% of the chapter)` so a
 * short chapter is never given away in full. Footnote anchors / `<sup>` refs /
 * trailing reference digits are stripped first via `normalizeReportHtml`; all
 * tags are removed via `getReportBlockText`, so the result is safe plain text
 * (the email template escapes it). Returns empty text when there is no
 * meaningful prose.
 */
export function extractTease(html: string | null | undefined, targetWords = 150): TeaseResult {
  const plain = getReportBlockText(normalizeReportHtml(html ?? ""));
  if (!plain) return { text: "", wasTruncated: false };

  const words = plain.split(/\s+/).filter(Boolean);
  const cap = Math.min(targetWords, Math.max(1, Math.floor(words.length * MAX_TEASE_FRACTION)));
  if (words.length <= cap) {
    return { text: plain, wasTruncated: false };
  }

  const sliced = words.slice(0, cap).join(" ").replace(TRAILING_PUNCTUATION, "");
  return { text: sliced, wasTruncated: true };
}

export interface ChapterContent {
  sectionId: string;
  chapterTitle: string;
  whatYoullLearn: string;
  teaseText: string;
  wasTruncated: boolean;
}

/**
 * Assemble everything the email template needs for one chapter: a clean
 * (archetype-injected, entity-decoded) title, the "what you'll learn"
 * one-liner, and the ~150-word tease. Returns null when the chapter has no
 * usable prose for this archetype.
 */
export function buildChapterContent(
  entry: ChapterNudgeEntry,
  primaryArchetype: string
): ChapterContent | null {
  const section = SECTION_BY_ID.get(entry.sectionId);
  if (!section) return null;

  const block = archetypeContent[entry.blockId];
  // eslint-disable-next-line security/detect-object-injection -- primaryArchetype is a validated archetype name.
  const html = block?.[primaryArchetype];
  const { text, wasTruncated } = extractTease(html);
  if (!text) return null;

  return {
    sectionId: entry.sectionId,
    chapterTitle: resolveReportNavTitle(section, primaryArchetype),
    whatYoullLearn: CHAPTER_LEARN_ONELINERS[entry.sectionId] ?? DEFAULT_ONELINER,
    teaseText: text,
    wasTruncated,
  };
}
