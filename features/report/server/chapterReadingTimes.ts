import { buildAccelerators } from "@/data/report3-accelerators";
import { buildFantasy } from "@/data/report3-fantasy";
import type { Report3Block } from "@/data/report3-learn-more";
import { buildPartnership } from "@/data/report3-partnership";
import { buildTypicalBeliefs } from "@/data/report3-typical-beliefs";
import { getReport2Section } from "@/data/report2";
import { KNOWN_ARCHETYPES } from "@features/report/server/archetypeSlug";
import type { Report3GatedCopy } from "@features/report/server/gatedCopy";
import { REPORT_V4_CHAPTERS } from "@features/report/ui/v3/reportV3Nav";

/**
 * "Reading time: ~5 min." over every chapter's title — the slimmed report (16.10; Figma
 * 1686:10030, and over each closed row, 1709:1799). Marcus, 14.10: reading time is the
 * strongest sign a reader will pay, so the page says up front how short each chapter is.
 *
 * Counted, not set by hand: Figma writes Spark Seeker's alone (Typical Beliefs ~5,
 * Accelerators & Brakes ~3, Challenges in Partnerships ~4, Fantasy vs. Reality ~5), and
 * the page has fourteen archetypes. The rate is the one the designed chapters' own
 * "Reading time" eyebrows were set at: their three articles read ~15, ~12 and ~13 min.
 * for 3,394, 2,694 and 2,926 words, each exactly its words over 225, rounded. Spark
 * Seeker's chapters then read 5, 3, 5 and 5 against Figma's 5, 3, 4 and 5.
 *
 * What is counted is the chapter's own text, everything a reader who has paid reads in
 * it: not its Try this card, which prints its practice time, nor its Learn more article,
 * which prints its own reading time. The same number for every plan, since it describes
 * the chapter, not what the reader has unlocked.
 *
 * Server-only: it reads every chapter's full copy to count it, so the page receives the
 * numbers and never the words (premium-content-bundle.test.ts guards it).
 */

export const READING_WORDS_PER_MINUTE = 225;

/** Whole minutes, rounded, never under one: the designed articles' own rounding. */
export const readingMinutes = (words: number): number =>
  Math.max(1, Math.round(words / READING_WORDS_PER_MINUTE));

const wordsIn = (text: string | null | undefined): number =>
  text ? text.split(/\s+/).filter(Boolean).length : 0;

const blockText = (block: Report3Block): string =>
  block.kind === "heading"
    ? block.text
    : block.kind === "para"
      ? block.runs.map((run) => run.text).join("")
      : block.items.map((runs) => runs.map((run) => run.text).join("")).join(" ");

const blocksWords = (blocks: readonly Report3Block[] | null | undefined): number =>
  (blocks ?? []).reduce((sum, block) => sum + wordsIn(blockText(block)), 0);

/** Every block of a passage built for a reader who has paid: `free` holds them all. */
const passageWords = (gated: Report3GatedCopy | null | undefined): number =>
  gated
    ? blocksWords(gated.free) +
      (gated.ramp ? blocksWords([gated.ramp]) : 0) +
      blocksWords(gated.rest)
    : 0;

/**
 * The four chapters V4 designed, from the views a reader who has paid receives: their
 * prose, panels, cards, loop and table, without the practice and the article.
 */
const DESIGNED: Readonly<Record<string, (archetype: string) => number | null>> = {
  typical_beliefs: (archetype) => {
    const view = buildTypicalBeliefs(archetype);
    if (!view) return null;
    return (
      blocksWords(view.intro) +
      blocksWords(view.sunShadow) +
      blocksWords(view.lede) +
      view.panels.turns.reduce((sum, turn) => sum + wordsIn(turn.shadow) + wordsIn(turn.shift), 0) +
      view.panels.sun.reduce((sum, belief) => sum + wordsIn(belief), 0) +
      blocksWords(view.afterPanels) +
      passageWords(view.challenges)
    );
  },
  typical_arousal_accelerators_turn_ons_of_the_core_archetype: (archetype) => {
    const view = buildAccelerators(archetype);
    if (!view) return null;
    return (
      blocksWords(view.intro) +
      blocksWords(view.archetypeIntro) +
      wordsIn(view.brakesLead) +
      wordsIn(view.acceleratorsLead) +
      [...view.brakes, ...view.accelerators].reduce(
        (sum, row) => sum + wordsIn(row.label) + wordsIn(row.subtext),
        0
      ) +
      blocksWords(view.afterCards) +
      passageWords(view.challenges)
    );
  },
  challenges_in_partnership: (archetype) => {
    const view = buildPartnership(archetype);
    if (!view) return null;
    return (
      blocksWords(view.intro) +
      passageWords(view.archetypeBody) +
      passageWords(view.challenges) +
      view.loop.reduce(
        (sum, stage) => sum + wordsIn(stage.happens) + wordsIn(stage.underneath),
        0
      ) +
      blocksWords([view.result]) +
      blocksWords(view.tail)
    );
  },
  // The table's face: each category and fantasy by name. A fantasy's note opens behind
  // its info button, so it is not counted, as a reader passing the table does not read it.
  typical_sexual_fantasy_amp_practice_tendencies: (archetype) => {
    const view = buildFantasy(archetype);
    if (!view) return null;
    return (
      blocksWords(view.intro) +
      view.table.categories.reduce(
        (sum, category) =>
          sum +
          wordsIn(category.title) +
          category.rows.reduce((rows, row) => rows + wordsIn(row.practice), 0),
        0
      ) +
      passageWords(view.challenges)
    );
  },
};

/**
 * The chapters V4 opens onto a Report 2.0 section, by that section's copy key. The copy
 * counts whole but for what never reaches a V4 page or is counted elsewhere: the "Learn:"
 * panel (`edu.*`, now the Learn more card), the practical panel (`practical.*`, now the
 * Try this card), "What you will learn" (`learn.*`, taken out on 28.09) and the locked
 * section's hook (`gate.*`).
 */
const REPORT2_SECTIONS: Readonly<Record<string, string>> = {
  power_orientation: "power",
  libido_challenges_in_relationships: "libido",
  biochemical_reward_system_dynamics: "reward",
  initiation_style: "initiation",
  energy_level: "energy",
  attachment_style: "attachment",
  love_language: "lovelang",
  curiosity_level: "curiosity",
  typical_growth_potentials_for_the_core_archetype: "growth",
  recommendations: "reading",
};

const NOT_THE_CHAPTERS_OWN = /^(edu|practical|learn|gate)\./;

const report2Words = (archetype: string, section: string): number => {
  const copy = getReport2Section(archetype, section);
  return Object.entries(copy).reduce(
    (sum, [key, value]) => (NOT_THE_CHAPTERS_OWN.test(key) ? sum : sum + wordsIn(value)),
    0
  );
};

/** Other Archetypes: the fourteen, each by name and motto, the same for every reader. */
const otherArchetypesWords = (): number =>
  KNOWN_ARCHETYPES.reduce(
    (sum, name) => sum + wordsIn(name) + wordsIn(getReport2Section(name, "constellation").motto),
    0
  );

/**
 * Minutes for each chapter V4 draws, keyed by its section id. A chapter whose copy is not
 * written for the archetype is left out, and its head shows no time.
 */
export function buildChapterReadingTimes(archetype: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const { id } of REPORT_V4_CHAPTERS) {
    const designed = DESIGNED[id];
    const section = REPORT2_SECTIONS[id];
    const words = designed
      ? designed(archetype)
      : section
        ? report2Words(archetype, section)
        : id === "constellation"
          ? otherArchetypesWords()
          : null;
    if (words) out[id] = readingMinutes(words);
  }
  return out;
}
