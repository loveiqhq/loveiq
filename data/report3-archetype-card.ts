/**
 * Report V4 — archetype card copy.
 *
 * Figma: "Report V4 — MOBILE" (1:165), Archetype card 15:815, and the
 * "Archetype dimension deck" component 15:1136 / 15:1236 / 15:1336.
 *
 * Every string here is NEW. None of it exists anywhere else in the repo:
 * `archetypePresentation.tagline` holds a first-person motto, `report-archetypes.ts`
 * holds long HTML prose, and the copy matrix has no slot for a core motivation, a
 * per-dimension verdict, or a risk/confidence level. Only Spark Seeker is authored,
 * because only Spark Seeker is drawn in the frames.
 *
 * The remaining 13 need authoring by Mark before this ships — they are deliberately
 * absent rather than invented, and the card omits what is missing. `missingReport3CardCopy()`
 * is asserted by a test so the gap closes loudly rather than shipping blank rows.
 *
 * Keyed by the display name used in `archetypePresentation` / `archetypeSlug`.
 */
import { KNOWN_ARCHETYPES } from "@features/report/server/archetypeSlug";

/** The four dimensions of the deck, in the fixed order the frames draw them. */
export type Report3DimensionKey = "communication" | "initiation" | "attachment" | "power";

/** Three-step meters ("Risk orientation", "Typical confidence"). The level sets both
 * how many of the three segments fill and which label is highlighted. */
export type Report3MeterLevel = "low" | "medium" | "high";

export interface Report3Dimension {
  key: Report3DimensionKey;
  /** Eyebrow, e.g. "Communication". */
  title: string;
  /** Second eyebrow line, e.g. "how desire gets spoken". */
  subtitle: string;
  /** The verdict, set in Lora, e.g. "Charming". */
  value: string;
  body: string;
  /** Chapter the peeking card points at. `id` must exist in `reportV3Nav`. */
  chapterLabel: string;
  chapterId: string;
}

export interface Report3CardCopy {
  /**
   * The card's pull-quote. NOTE: this is NOT `archetypePresentation.tagline` — that
   * is a first-person motto ("Tease me, surprise me, chase me a little...") and the
   * frame shows a different, third-person line. Both now exist; Mark needs to say
   * whether this replaces the motto or is a second slot.
   *
   * The frame opens this with U+201D (a RIGHT double quote) on both sides, which is
   * a typo in the file; it is written correctly here as U+201C ... U+201D.
   */
  tagline: string;
  coreMotivation: { value: string; body: string };
  dimensions: readonly Report3Dimension[];
  meters: readonly { label: string; level: Report3MeterLevel }[];
}

export const report3ArchetypeCard: Readonly<Record<string, Report3CardCopy>> = {
  "Spark Seeker": {
    tagline: "\u201CFind the spark. Fuel the fire. Keep the heat\u201D",
    coreMotivation: {
      value: "Pleasure & play",
      body: "Sex is about a sense of aliveness, not milestones. The moment it starts feeling like a duty, sex loses its point.",
    },
    dimensions: [
      {
        key: "communication",
        title: "Communication",
        subtitle: "how desire gets spoken",
        value: "Charming",
        body: "Words are part of the foreplay and so is a little tease. Charm and whit are ways attraction is built and intimacy is initiated.",
        chapterLabel: "Love Language",
        chapterId: "love_language",
      },
      {
        key: "initiation",
        title: "Initiation",
        subtitle: "who makes the first move",
        value: "Active",
        body: "You make the first move often, and the move itself is part of the pleasure. Being wanted back is the reward, not the goal.",
        chapterLabel: "Initiation Style",
        chapterId: "initiation_style",
      },
      {
        key: "attachment",
        title: "Attachment",
        subtitle: "how closeness is held",
        value: "Avoidant / secure",
        body: "Closeness is comfortable while it stays voluntary. When it starts to feel owed, you get light on your feet and slip sideways.",
        chapterLabel: "Attachment Style",
        chapterId: "attachment_style",
      },
      {
        key: "power",
        title: "Power",
        subtitle: "who takes the lead",
        value: "Switch",
        body: "You will take the lead or hand it over, and the choosing is the turn-on. What you avoid is a position that never moves.",
        chapterLabel: "Power Orientation",
        chapterId: "power_orientation",
      },
    ],
    meters: [
      { label: "Risk orientation", level: "high" },
      { label: "Typical confidence", level: "high" },
    ],
  },
};

/** Archetypes still waiting on V4 card copy. Asserted by a test so the gap closes
 * loudly rather than silently shipping a card with holes in it. */
export function missingReport3CardCopy(): string[] {
  return KNOWN_ARCHETYPES.filter((name) => !report3ArchetypeCard[name]);
}
