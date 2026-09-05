/**
 * Report V3 chapter structure — Figma 10392:18451.
 *
 * V3 is NOT just a restyle of V1: it regroups the report into FIVE parts and
 * moves chapters between them. Differences from `reportNav.ts`:
 *   - Attachment Style      Part II  -> Part IV (4.1)
 *   - Power Orientation     Part III -> Part II (2.5)
 *   - Libido Challenges     Part IV  -> Part III (3.1)
 *   - Constellation / Importance / Sexual Stage
 *                           Part I   -> Part V (5.4 / 5.5 / 5.6)
 *   - Challenges in Partnership is its own chapter (4.4) instead of rendering
 *     inline underneath Libido
 *   - "Arousal, Desire & Pleasure" (3.3) is UN-RETIRED — V1 has it in
 *     `RETIRED_REPORT_SECTION_IDS`, V3 gives it a numbered chapter
 *   - Insight Map and "What this means for you" do NOT appear in V3
 *
 * Chapter numbers are the designer's own ("Chapter 2.1" … "Chapter 5.6") and
 * render in the eyebrow above each chapter title.
 */

export interface ReportV3Chapter {
  /** Section id in `data/report-general.ts` (the DOM anchor). */
  id: string;
  /** "2.1" … "5.6" — rendered as "Chapter 2.1". */
  number: string;
  /** Chapter title exactly as Figma types it. */
  title: string;
}

export const REPORT_V3_CHAPTERS: readonly ReportV3Chapter[] = [
  // Part II — How the {archetype} works
  {
    id: "typical_arousal_accelerators_turn_ons_of_the_core_archetype",
    number: "2.1",
    title: "Accelerators & Brakes",
  },
  { id: "typical_beliefs", number: "2.2", title: "Typical Beliefs" },
  { id: "core_insecurities", number: "2.3", title: "Core Insecurities" },
  { id: "confidence_level", number: "2.4", title: "Confidence Level" },
  { id: "power_orientation", number: "2.5", title: "Power Orientation" },

  // Part III — The {archetype}'s erotic engine
  { id: "libido_challenges_in_relationships", number: "3.1", title: "Libido Challenges" },
  { id: "biochemical_reward_system_dynamics", number: "3.2", title: "Reward System" },
  {
    id: "background_know_how_arousal_desire_and_pleasure",
    number: "3.3",
    title: "Arousal, Desire & Pleasure",
  },
  { id: "arousal_style", number: "3.4", title: "Arousal Style" },
  { id: "initiation_style", number: "3.5", title: "Initiation Style" },
  { id: "energy_level", number: "3.6", title: "Energy & Risk" },

  // Part IV — How the {archetype} connects
  { id: "attachment_style", number: "4.1", title: "Attachment Style" },
  { id: "love_language", number: "4.2", title: "Love Language" },
  { id: "curiosity_level", number: "4.3", title: "Curiosity & Relationship Form" },
  { id: "challenges_in_partnership", number: "4.4", title: "Challenges in Partnership" },

  // Part V — The {archetype}'s edges
  {
    id: "typical_sexual_fantasy_amp_practice_tendencies",
    number: "5.1",
    title: "Fantasy vs. Reality",
  },
  {
    id: "typical_growth_potentials_for_the_core_archetype",
    number: "5.2",
    title: "Growth Potentials",
  },
  { id: "recommendations", number: "5.3", title: "Reading Recommendations" },
  { id: "constellation", number: "5.4", title: "Other Archetypes" },
  { id: "the_importance_of_sexuality", number: "5.5", title: "Importance of Sexuality" },
  { id: "sexual_stage", number: "5.6", title: "Your Sexual Stage" },
];

/** Body order for V3 — Part I's `core_archetype` first, then the 21 chapters. */
export const REPORT_V3_SECTION_ORDER: readonly string[] = [
  "core_archetype",
  ...REPORT_V3_CHAPTERS.map((c) => c.id),
];

export const REPORT_V3_CHAPTER_BY_ID: ReadonlyMap<string, ReportV3Chapter> = new Map(
  REPORT_V3_CHAPTERS.map((c) => [c.id, c])
);

export interface ReportV3PartDivider {
  /** "Part I" … "Part V". */
  part: string;
  lead: string;
  /** Violet italic segment. */
  accent: string;
  tail?: string;
}

/**
 * Part dividers keyed by the FIRST chapter of each part.
 *
 * These titles do NOT interpolate the archetype. They did until 2026-09-05,
 * when the designer replaced "How the Spark Seeker works" / "The Spark Seeker's
 * erotic engine" / "…connects" / "…edges" with archetype-neutral wording.
 * Re-read live from the frames (10392:19333 / 20417 / 21106 / 21684), not from
 * a cached dump.
 *
 * `lead` renders upright, `accent` italic violet — the split is the designer's
 * and is NOT simply the last word ("Your " + "erotic engine").
 */
export const REPORT_V3_PART_DIVIDER_BY_SECTION: Readonly<
  Record<string, ReportV3PartDivider>
> = {
  core_archetype: { part: "Part I", lead: "Your ", accent: "Constellation" },
  typical_arousal_accelerators_turn_ons_of_the_core_archetype: {
    part: "Part II",
    lead: "How your archetype ",
    accent: "works",
  },
  libido_challenges_in_relationships: {
    part: "Part III",
    lead: "Your ",
    accent: "erotic engine",
  },
  attachment_style: { part: "Part IV", lead: "How you ", accent: "connect" },
  typical_sexual_fantasy_amp_practice_tendencies: {
    part: "Part V",
    lead: "Your ",
    accent: "edges",
  },
};
/**
 * Sidebar / chapter-drawer navigation for V3, derived from the chapter list so
 * the nav can never drift from the body order the way V1's did.
 *
 * The part LABELS here are generic ("How you work") rather than the frame's
 * archetype-interpolated headings ("How the Spark Seeker works"): the nav is
 * rendered by components that have no archetype in scope, and the designer's
 * links do not include the V3 chapter drawer, so its wording is unspecified.
 */
export interface ReportV3NavPart {
  part: string;
  label: string;
  items: { label: string; id: string; gateId?: string }[];
}

const V3_PART_LABELS: Record<string, string> = {
  "2": "How your archetype works",
  "3": "Your erotic engine",
  "4": "How you connect",
  "5": "Your edges",
};

export const REPORT_V3_NAV_PARTS: readonly ReportV3NavPart[] = [
  {
    part: "Part I",
    label: "Your constellation",
    items: [
      { label: "Core Archetype", id: "core_archetype" },
      { label: "Your Snapshot", id: "snapshot", gateId: "core_archetype" },
    ],
  },
  ...["2", "3", "4", "5"].map((p) => ({
    part: `Part ${{ "2": "II", "3": "III", "4": "IV", "5": "V" }[p]}`,
    label: V3_PART_LABELS[p] as string,
    items: REPORT_V3_CHAPTERS.filter((c) => c.number.startsWith(`${p}.`)).map((c) => ({
      label: c.title,
      id: c.id,
      // Partnership has no row of its own in report-general.ts; it shares
      // Libido's gate, exactly as it does in V1.
      ...(c.id === "challenges_in_partnership"
        ? { gateId: "libido_challenges_in_relationships" }
        : {}),
    })),
  })),
];
