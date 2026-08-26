/**
 * The three "across the archetypes" style lists from the Spark Seeker source
 * document, restored to the report.
 *
 * Source: "Copy of [OLD] Spark Seeker Report Template" (Google Doc
 * 1xCK5WIgxBrx3JgLFqskcCT0ZGpMhunUn6ntwrwnf3Xo), chapters 16 ("Common Curiosity
 * Level Styles Across Archetypes"), 21 ("Arousal Style") and 22 ("Core
 * Initiation Style Varieties Across Archetypes"). Requested by Mark on
 * 2026-08-26: show the reader the pre-defined style their archetype is, name and
 * description, without rewriting either.
 *
 * Every `name` and `description` below is VERBATIM from that document, including
 * its own punctuation and spacing quirks (e.g. "selectively,not primarily" in
 * the instrumental curiosity entry). Nothing here is paraphrased.
 *
 * TWO THINGS TO KNOW BEFORE THIS SHIPS TO READERS
 *
 * 1. The document's "(e.g. …)" lists name archetypes from an EARLIER naming
 *    generation — "Exhibitionist Performer", "Approval Seeker" and "Power
 *    Orchestrator" are not among the current 14. They are kept verbatim here
 *    because the instruction was to copy, not to rewrite; whether a reader
 *    should see them is a copy decision, not a code one.
 * 2. `CURIOSITY_STYLE_BY_ARCHETYPE` and `INITIATION_STYLE_BY_ARCHETYPE` are
 *    read off the document's own "(e.g. …)" lists, so they are sourced, not
 *    guessed. `AROUSAL_STYLE_BY_ARCHETYPE` is NOT: chapter 21 lists eight
 *    arousal styles with no archetype examples at all, so the Spark Seeker
 *    mapping below is inferred from its own chapter text ("arousal is
 *    stimulation-led and novelty-dependent", "highly conditional, not shallow",
 *    "spontaneity rather than predictability") and is marked `inferred: true`.
 *    It needs a human decision before it is treated as settled.
 */

export interface Report2DocStyle {
  /** The style's name, as the document sets it in bold. */
  name: string;
  /** The paragraph under that name, verbatim. */
  description: string;
}

/** Chapter 16 — "Common Curiosity Level Styles Across Archetypes", in document order. */
export const CURIOSITY_STYLES: Report2DocStyle[] = [
  {
    name: "Low curiosity orientation",
    description:
      "These archetypes prefer familiarity, repetition, and known sexual scripts. Sexuality feels best when it is predictable, stable, and emotionally contained. Too much novelty can feel stressful, pressuring, or destabilizing rather than exciting. (e.g. Minimalist Companion, Quiet Withdrawer)",
  },
  {
    name: "Moderate curiosity orientation",
    description:
      "These archetypes are open to exploration, but only in measured and integrated ways. Curiosity activates slowly and is folded into existing relational dynamics. Novelty feels appealing when it supports safety, meaning, or bonding rather than disrupting it. (e.g. Sensual Connector, Loyal Ritualist, Approval Seeker, Power Orchestrator)",
  },
  {
    name: "High curiosity orientation",
    description:
      "These archetypes are energized by experimentation, variety, and new experiences. Desire is often sparked by difference, change, and expansion. Too much sameness can feel stagnant or deadening. (e.g. Exhibitionist Performer, Spiritual Lover, Analytical Sexualist, Relational Nurturer)",
  },
  {
    name: "Very high / exploration-driven curiosity",
    description:
      "Curiosity is central to sexual identity. These archetypes seek edges, extremes, transformation, or continual expansion. Familiarity alone often feels insufficient or dull. (e.g. Spark Seeker, Explorer of Edges, Curious Apprentice)",
  },
  {
    name: "Learning- and mastery-driven curiosity",
    description:
      "Curiosity is oriented toward understanding, skill-building, and refinement rather than novelty for its own sake. Exploration feels safest when it is structured, explainable, and improvable. Progress and competence are as motivating as the experience itself. (e.g. Curious Apprentice, Analytical Sexualist)",
  },
  {
    name: "Instrumental or strategic curiosity",
    description:
      "Exploration is used selectively,not primarily for pleasure or growth, but to gain control, validation, leverage, or advantage within relational or power dynamics. (e.g. Power Orchestrator)",
  },
];

/** Chapter 21 — the eight arousal styles, in document order. */
export const AROUSAL_STYLES: Report2DocStyle[] = [
  {
    name: "Body-first arousal",
    description:
      "Desire ignites quickly through physical stimulation, intensity, novelty, or sensation. Arousal often precedes emotional connection.",
  },
  {
    name: "Emotion-first arousal",
    description:
      "Desire emerges only after emotional safety, trust, or reassurance is present. Connection precedes physical excitement.",
  },
  {
    name: "Mind-led arousal",
    description:
      "Curiosity, fantasy, learning, imagination, or cognitive stimulation activate desire before the body follows.",
  },
  {
    name: "Power-based arousal",
    description: "Clear roles, control, surrender, or hierarchy create the conditions for desire.",
  },
  {
    name: "Validation-based arousal",
    description: "Being seen, admired, praised, or chosen activates desire and sustains arousal.",
  },
  {
    name: "Intensity-threshold arousal",
    description:
      "Desire appears only once stimulation, novelty, or psychological charge crosses a certain level.",
  },
  {
    name: "Rhythm-based arousal",
    description:
      "Familiarity, ritual, predictability, and steady pacing allow desire to warm up over time.",
  },
  {
    name: "Low-pressure arousal",
    description: "Desire arises only when expectations are minimal and autonomy is preserved.",
  },
];

/** Chapter 22 — "Core Initiation Style Varieties Across Archetypes", in document order. */
export const INITIATION_STYLES: Report2DocStyle[] = [
  {
    name: "Active / Direct initiation",
    description:
      "Desire is initiated clearly and overtly: through words, touch, or decisive action. (e.g. Spark Seeker, Exhibitionist Performer, Power Orchestrator, Explorer of Edges)",
  },
  {
    name: "Responsive initiation",
    description:
      "Desire awakens in response to a partner’s signal. The person may not start, but fully engages once invited. (e.g. Sensual Connector, Relational Nurturer, Spiritual Lover, Approval Seeker)",
  },
  {
    name: "Indirect / Invitational initiation",
    description:
      "Desire is signaled through atmosphere, hints, closeness, or mood-setting rather than explicit requests. (e.g. Sensual Connector, Exhibitionist Performer, Loyal Ritualist)",
  },
  {
    name: "Conditional initiation",
    description:
      "Initiation depends on specific conditions being met first: safety, emotional repair, structure, ritual, or intensity. (e.g. Sensual Connector, Explorer of Edges, Analytical Sexualist)",
  },
  {
    name: "Passive or Avoidant initiation",
    description:
      "Desire may exist internally, but initiation is rare due to fear, overwhelm, or shutdown. (e.g. Quiet Withdrawer, Emotional Voyeur, Approval Seeker)",
  },
  {
    name: "Strategic or Power-based initiation",
    description:
      "Initiation is used to shape dynamics, establish control, or gain leverage rather than simply express desire. (e.g. Power Orchestrator)",
  },
];

/** The closing line chapter 16 puts under the list. */
export const CURIOSITY_STYLES_OUTRO =
  "Across life stages, partners, and sexual phases, curiosity level can shift. What once felt exciting may later feel overwhelming, and what once felt boring may later feel grounding.";

/** The closing line chapter 21 puts under the list. */
export const AROUSAL_STYLES_OUTRO =
  "Most people carry more than one arousal style, and which one is dominant can shift with partners, stress, sexual stages, and personal development. Misunderstandings in relationships often arise not from “low libido,” but from mismatched arousal styles.";

/** The closing line chapter 22 puts under the list. */
export const INITIATION_STYLES_OUTRO =
  "Many people shift between styles depending on partner, context, safety, and sexual stage. Misunderstandings often arise when partners expect initiation in their style and miss signals expressed in another.";

/** A style the reader is shown: the entry plus whether it leads or supports. */
export interface Report2StyleMatch {
  name: string;
  role: "primary" | "secondary";
  /** True when the document did not name archetypes for this list. */
  inferred?: boolean;
}

/**
 * Curiosity styles per archetype, read off the document's own "(e.g. …)" lists.
 * Spark Seeker appears under "Very high / exploration-driven curiosity".
 */
export const CURIOSITY_STYLE_BY_ARCHETYPE: Record<string, Report2StyleMatch[]> = {
  "spark-seeker": [{ name: "Very high / exploration-driven curiosity", role: "primary" }],
};

/**
 * Initiation styles per archetype, read off the document's own "(e.g. …)" lists.
 * Spark Seeker appears under "Active / Direct initiation".
 */
export const INITIATION_STYLE_BY_ARCHETYPE: Record<string, Report2StyleMatch[]> = {
  "spark-seeker": [{ name: "Active / Direct initiation", role: "primary" }],
};

/**
 * Arousal styles per archetype. INFERRED — chapter 21 names no archetypes, so
 * this is read from the Spark Seeker's own arousal chapter rather than from a
 * list the document supplies. See the note at the top of this file.
 *
 * Spark Seeker: "arousal is stimulation-led and novelty-dependent" and "highly
 * conditional, not shallow" → intensity-threshold leads; "arousal can be fast,
 * bright, and highly responsive" → body-first supports; "desire often shuts down
 * quickly" under pressure, and "arousal requires aliveness and choice" →
 * low-pressure supports.
 */
export const AROUSAL_STYLE_BY_ARCHETYPE: Record<string, Report2StyleMatch[]> = {
  "spark-seeker": [
    { name: "Intensity-threshold arousal", role: "primary", inferred: true },
    { name: "Body-first arousal", role: "secondary", inferred: true },
    { name: "Low-pressure arousal", role: "secondary", inferred: true },
  ],
};

/** Resolve matches to the full entries, dropping any name that does not exist. */
export function resolveStyles(
  catalogue: Report2DocStyle[],
  matches: Report2StyleMatch[] | undefined
): (Report2DocStyle & Report2StyleMatch)[] {
  if (!matches) return [];
  return matches.flatMap((m) => {
    const entry = catalogue.find((s) => s.name === m.name);
    return entry ? [{ ...entry, ...m }] : [];
  });
}
