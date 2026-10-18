import { REPORT_DEEP_DIVES } from "@/data/report-deep-dives";
import { PAY_TO_START_WIZARD_SLIDES } from "@features/pay-to-start/logic/journey";

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
 * Which wizard a reader gets. `pay_to_start`: a reader who paid before the survey (Figma
 * Report-3.0 1477:3920), whose report opens fully unlocked, sees slides 1, 4, 5 and 6 of
 * the six; the report map ("your free chapters") and "Unlocking your report is fully risk
 * free" have nothing left to say to them. Figma draws those four with the six-slide bar
 * and counters (1/6, 2/6, 3/6, 5/6); the bar here has four segments, "n / 4" (Fatih,
 * 18.10).
 */
export type WizardVariant = "standard" | "pay_to_start";

const STANDARD_ORDER: readonly number[] = Array.from({ length: WIZARD_SLIDE_COUNT }, (_, i) => i);

/** The slides a variant shows, by their index in the six (what the analytics record). */
export function wizardSlideOrder(variant: WizardVariant): readonly number[] {
  return variant === "pay_to_start" ? PAY_TO_START_WIZARD_SLIDES : STANDARD_ORDER;
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
  /** FREE chip, the brand-gradient open lock (the four deep dives), or the grey lock. */
  badge: WizardDrawerBadge;
}

export interface WizardDrawerPart {
  part: string;
  label: string;
  rows: readonly WizardDrawerRow[];
}

const FREE_ROWS: ReadonlySet<string> = new Set([
  "introduction",
  "what_shaped_this_report",
  "top_archetypes",
  "core_archetype",
]);
const DEEP_DIVE_IDS: ReadonlySet<string> = new Set(REPORT_DEEP_DIVES.map((d) => d.id));

const row = (id: string, label: string): WizardDrawerRow => ({
  id,
  label,
  badge: FREE_ROWS.has(id) ? "free" : DEEP_DIVE_IDS.has(id) ? "open" : "locked",
});

/**
 * The report's chapter drawer as the map draws it (1049:1831, a cropped instance of the
 * drawer 856:243): the report's V4 nav, part for part and row for row, less the
 * Snapshot row, whose four chapters left the report for this slide. Written out here
 * rather than imported, so the survey does not load the report's nav and page copy; a
 * test holds it to REPORT_V4_NAV_PARTS.
 */
export const WIZARD_DRAWER: readonly WizardDrawerPart[] = [
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
      row("core_insecurities", "Core Insecurities"),
      row("confidence_level", "Confidence Level"),
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
      row("arousal_style", "Arousal Style"),
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
