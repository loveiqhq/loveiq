import { REPORT_DEEP_DIVES } from "@/data/report-deep-dives";
import {
  PAY_TO_START_INITIAL_WIZARD_SLIDES,
  PAY_TO_START_WIZARD_SLIDES,
  type PayToStartWizard,
} from "@features/pay-to-start/logic/journey";

/**
 * Content of the pre-report wizard — Figma 1071:2092, "Pre Report Wizard — Mobile
 * (production, 393)", 30.09.
 *
 * Six slides. The second is the report map; its overview opens onto the four deep
 * dives (Figma drew those as a seventh "Slide NEW", but they stay inside slide 2 so
 * wizard_slide_advanced keeps counting 0-5, as the admin digests read it).
 */
export const WIZARD_SLIDE_COUNT = 6;

/**
 * Which wizard a reader gets. A reader who paid before the survey gets their offer's:
 * - `pay_to_start`, the full report (Figma Report-3.0 1477:3920), opens unlocked: slides 1,
 *   4, 5 and 6 of the six. The report map ("your opening chapters") and "Unlocking your report
 *   is fully risk free" are left out. Figma draws those four with the six-slide bar and
 *   counters (1/6, 2/6, 3/6, 5/6); the bar here has four segments, "n / 4" (Fatih, 18.10).
 * - `pay_to_start_initial`, the initial report (EUR 1.99), opens only partly: the map too,
 *   slides 1, 2, 4, 5 and 6, "n / 5" (Marcus, 20.10; Figma 1899:5255 on board 1741:5587).
 */
export type WizardVariant = "standard" | PayToStartWizard;

const STANDARD_ORDER: readonly number[] = Array.from({ length: WIZARD_SLIDE_COUNT }, (_, i) => i);

/** The slides a variant shows, by their index in the six (what the analytics record). */
export function wizardSlideOrder(variant: WizardVariant): readonly number[] {
  switch (variant) {
    case "pay_to_start":
      return PAY_TO_START_WIZARD_SLIDES;
    case "pay_to_start_initial":
      return PAY_TO_START_INITIAL_WIZARD_SLIDES;
    case "standard":
      return STANDARD_ORDER;
  }
}

/** Slide 1's three research tiles (1049:1191). The report's methodology has its own. */
export const WIZARD_PROOF_CARDS: readonly { title: string; body: string; icon: string }[] = [
  {
    title: "100+ research papers",
    body: "peer-reviewed, across several scientific fields",
    icon: "source-papers",
  },
  {
    title: "Clinical models",
    body: "the frameworks therapists use, and their pointers",
    icon: "source-models",
  },
  {
    title: "Foundational books",
    body: "the texts experts return to, and their key insights",
    icon: "source-books",
  },
];

export type WizardDrawerBadge = "free" | "open" | "locked";

export interface WizardDrawerRow {
  /** The chapter's anchor in the report, as the report's own nav names it. */
  id: string;
  label: string;
  /**
   * The IN FULL chip (FREE until sync 26.10: the EUR 1.99 gate follows the map, so nothing
   * on it is free; the kind keeps its name), the brand-gradient open lock (the four deep
   * dives), or the grey lock.
   */
  badge: WizardDrawerBadge;
}

export interface WizardDrawerPart {
  part: string;
  label: string;
  rows: readonly WizardDrawerRow[];
}

/**
 * The rows every reader has in full, as the report's nav marks them. Other Archetypes
 * (`constellation`) is among them: the report gives it to every reader, and the map drew it
 * locked until sync 26.10 (Fatih: "say five, everywhere").
 */
const IN_FULL_ROWS: ReadonlySet<string> = new Set([
  "introduction",
  "what_shaped_this_report",
  "top_archetypes",
  "constellation",
]);
const CORE_ARCHETYPE_ROW = "core_archetype";
const DEEP_DIVE_IDS: ReadonlySet<string> = new Set(REPORT_DEEP_DIVES.map((d) => d.id));

/**
 * A row's badge on a variant's map. The Core Archetype is in full only once it is bought:
 * before the EUR 1.99 (or a plan) its card is half veiled and its Summary locked, gate on or
 * off (review 26.10), so a free reader's map draws it partly open, and a paid wizard's in
 * full. A EUR 1.99 buyer's map then reads as the gate's map: gateChapterCounts.test.ts.
 */
function badgeOf(id: string, variant: WizardVariant): WizardDrawerBadge {
  if (IN_FULL_ROWS.has(id)) return "free";
  if (id === CORE_ARCHETYPE_ROW) return variant === "standard" ? "open" : "free";
  return DEEP_DIVE_IDS.has(id) ? "open" : "locked";
}

const row = (id: string, label: string): Omit<WizardDrawerRow, "badge"> => ({ id, label });

/**
 * The report's chapter drawer as the map draws it (1049:1831, a cropped instance of the
 * drawer 856:243): the report's V4 nav, part for part and row for row, less the
 * Snapshot row, whose four chapters left the report for this slide. Written out here
 * rather than imported, so the survey does not load the report's nav and page copy; a
 * test holds it to REPORT_V4_NAV_PARTS.
 */
const DRAWER_PARTS: ReadonlyArray<
  Omit<WizardDrawerPart, "rows"> & { rows: ReadonlyArray<Omit<WizardDrawerRow, "badge">> }
> = [
  {
    part: "Part 1",
    label: "Welcome",
    rows: [
      row("introduction", "Introduction"),
      row("what_shaped_this_report", "What Shaped This Report"),
    ],
  },
  {
    part: "Part 2",
    label: "Your Constellation",
    rows: [
      row("top_archetypes", "3 Highest Scoring Archetypes"),
      row("core_archetype", "Core Archetype"),
    ],
  },
  {
    part: "Part 3",
    label: "How Your Archetype Works",
    rows: [
      row("typical_beliefs", "Typical Beliefs"),
      row("power_orientation", "Power Orientation"),
    ],
  },
  {
    part: "Part 4",
    label: "Your Erotic Engine",
    rows: [
      row("typical_arousal_accelerators_turn_ons_of_the_core_archetype", "Accelerators & Brakes"),
      row("libido_challenges_in_relationships", "Libido Challenges"),
      row("biochemical_reward_system_dynamics", "Reward System"),
      row("initiation_style", "Initiation Style"),
      row("energy_level", "Energy & Risk"),
    ],
  },
  {
    part: "Part 5",
    label: "How You Connect",
    rows: [
      row("challenges_in_partnership", "Challenges in Partnerships"),
      row("attachment_style", "Attachment Style"),
      row("love_language", "Love Language"),
      row("curiosity_level", "Curiosity & Relationship Form"),
    ],
  },
  {
    part: "Part 6",
    label: "Your Edges",
    rows: [
      row("typical_sexual_fantasy_amp_practice_tendencies", "Fantasy vs. Reality"),
      row("typical_growth_potentials_for_the_core_archetype", "Growth Potentials"),
      row("recommendations", "Reading Recommendations"),
      row("constellation", "Other Archetypes"),
    ],
  },
];

/** The drawer as a variant's reader sees it: the rows, each with its badge (badgeOf). */
export function wizardDrawer(variant: WizardVariant): readonly WizardDrawerPart[] {
  return DRAWER_PARTS.map((part) => ({
    ...part,
    rows: part.rows.map((r) => ({ ...r, badge: badgeOf(r.id, variant) })),
  }));
}

/** A free reader's drawer, the one whose rows and order the readers in AP-Analytics walk. */
export const WIZARD_DRAWER: readonly WizardDrawerPart[] = wizardDrawer("standard");

/**
 * The map's pitch, "6 Parts, 17 Chapters" (1049:1637): the parts, and the chapters as
 * the report counts them, every row from Part 2 on (Part 1 is its welcome). Derived, so
 * the pitch follows the drawer: the frame's 20 went to 17 when the slimmed report took
 * out Core Insecurities, Confidence Level and Arousal Style (16.10).
 */
export const WIZARD_PART_COUNT: number = WIZARD_DRAWER.length;
export const WIZARD_CHAPTER_COUNT: number = WIZARD_DRAWER.slice(1).reduce(
  (count, part) => count + part.rows.length,
  0
);
