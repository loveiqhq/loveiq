/**
 * Confidence Level — per-archetype result word, definition tail and strip
 * position. Figma: `9108:557` (BASE, SCALE 1 OF 2), `9107:827` (VAR-D, SCALE 2 OF
 * 2) and the in-report strip `8427:1577`.
 *
 * The designer's own notes define the model: *"ALL 14 use this one layout; result
 * word + the three condition rows change"* and *"the strip and all 14 dots never
 * move — the You marker jumps to the archetype's dot, and the result word plus the
 * three condition rows swap."*
 *
 * WHY THIS FILE EXISTS: `confidence_strip` in `report2-archetype-config.json` holds
 * `{ you_dot_x, result_word }` for `spiritual-lover` ONLY, and the copy matrix's
 * `confidence` section is eight UNIVERSAL slots with no result and no rows. The
 * section therefore rendered no result word at all for 13 of 14 archetypes.
 *
 * The values below are derived from each archetype's OWN production prose in
 * `data/report-archetypes.ts` → `confidence`, which states a level and a
 * contingency for all 14 (e.g. Relational Nurturer: "moderate,
 * reciprocity-contingent confidence level" plus "emerges through appreciation,
 * emotional harmony, and felt reciprocity"). That derivation is verified against
 * the one authoritative value we had: `meaning-contingent` → "Meaning-Contingent",
 * exactly the config's word for Spiritual Lover.
 *
 * NOTE: Figma's SCALE 2 demo frame labels Radiant Performer "Reception-Anchored",
 * where the prose yields "Feedback-Contingent". The designer coined an alternative
 * name for that one demo; the prose-derived set is used here because it is
 * consistent across all 14 and matches the only config value that exists.
 *
 * The three condition rows (`risesWith` / `contractsWith` / `unmovedBy`) plus
 * `trap` and `wayOut` are the blocks Figma shows under the strip and the section
 * did not render at all. Same source and method: each is lifted from that
 * archetype's own `confidence` prose — "it emerges through …" (rises), "when …, it
 * can contract/drop/collapse" (contracts), "confidence is not rooted in …"
 * (unmoved), "recurring loop: …" (trap) and "Confidence strengthens when …" (way
 * out). Fragments carry no trailing period; `trap`/`wayOut` are whole sentences
 * with balanced quotes — all 70 values gated on exactly that. Figma's own copy is
 * a tighter editorial condensation of the same prose, so these read a little
 * longer while saying the same thing.
 *
 * VOICE: the v1 prose is third person ("Their confidence…", "they learn to…",
 * "The Relational Nurturer waits…"), but the report addresses the reader directly
 * and Figma's copy is second person. These values are converted accordingly —
 * they/their/them → you/your, the archetype's name → "you", a bare "the partner"
 * → "your partner" — with verb agreement fixed ("The Nurturer waits" → "You
 * wait", while "your partner waits" correctly keeps the -s).
 *
 * `dot` is the marker's position as a percentage of the strip's axis, taken from
 * the fourteen fixed dot centres in Figma `8427:1577`. Ordering runs low → high
 * confidence and is anchored on three things the design and data agree on: Quiet
 * Withdrawer is the only "low-to-moderate" and Figma labels it leftmost, Radiant
 * Performer is labelled rightmost, and the base frame highlights Spiritual Lover
 * on dot 6. Ordering WITHIN a tier is a judgement call — flagged, not hidden.
 */

export interface ConfidenceProfile {
  /** Big Lora word, e.g. "Meaning-Contingent". */
  resultWord: string;
  /** Completes "Yours …" in the definition line. */
  anchor: string;
  /** Marker position, % across the strip axis. */
  dot: number;
  /** "RISES WITH" row — what lifts this archetype's confidence. */
  risesWith: string;
  /** "CONTRACTS WITH" row — what pulls it back. */
  contractsWith: string;
  /** "UNMOVED BY" row — what simply does not move it. */
  unmovedBy: string;
  /** "THE TRAP" paragraph — the self-reinforcing loop. */
  trap: string;
  /** "THE WAY OUT" line — the resolution. */
  wayOut: string;
}

/** The fourteen fixed dot positions (% of axis), Figma 8427:1577. */
export const CONFIDENCE_DOTS: number[] = [
  7.27, 14.18, 22.54, 32.54, 44.73, 49.09, 54.73, 64.0, 71.09, 78.91, 83.64, 88.55, 92.91, 96.91,
];

/** Figma labels only the two extremes on the strip. */
export const CONFIDENCE_EXTREMES = {
  low: "Quiet Withdrawer",
  high: "Radiant Performer",
} as const;

export const CONFIDENCE_BY_SLUG: Record<string, ConfidenceProfile> = {
  "quiet-withdrawer": {
    resultWord: "Safety-Contingent",
    anchor: "emerges through low pressure, emotional calm, and feeling unthreatened by expectation",
    dot: 7.27,
    risesWith: "Low pressure, emotional calm, and feeling unthreatened by expectation",
    contractsWith: "You feel watched, rushed, or criticized",
    unmovedBy:
      "Bold initiation, sexual performance, high visibility or being the focus, or conflict-based intensity or pressure",
    trap: "You wait to feel completely safe before showing confidence, your partner waits for initiative or clarity, and desire exists on both sides without confidence ever fully activating.",
    wayOut:
      'You learn to name boundaries early to reduce pressure, take small initiations without committing to intensity, tolerate mild discomfort without shutting down completely, and separate "I feel overwhelmed" from "I am not desirable."',
  },

  "sensual-connector": {
    resultWord: "Emotional-Contingent",
    anchor: "emerges through emotional safety, relational attunement, and felt connection",
    dot: 14.18,
    risesWith: "Emotional safety, relational attunement, and felt connection",
    contractsWith: "Connection feels uncertain",
    unmovedBy:
      "Physical appearance alone, sexual performance or technique, dominance, assertiveness, or visual impact",
    trap: "You wait to feel emotionally affirmed before showing confidence, your partner waits for visible confidence or initiative, and desire exists on both sides without confidence ever fully activating.",
    wayOut:
      'You learn to generate erotic self-trust from your own body and sensations, name desires gently but clearly without waiting for perfect safety, tolerate brief emotional uncertainty without collapsing self-worth, and separate "I feel rejected" from "I am not desirable."',
  },

  "minimalist-companion": {
    resultWord: "Low-Pressure-Contingent",
    anchor: "emerges through comfort, simplicity, and feeling unpressured",
    dot: 22.54,
    risesWith: "Comfort, simplicity, and feeling unpressured",
    contractsWith: "There is pressure, intensity, or emotional demand",
    unmovedBy:
      "Dominance or bold initiation, high novelty or experimentation pressure, big emotional processing during sex, or performing to impress",
    trap: "You wait to feel unpressured before showing confidence, your partner waits for visible passion or initiative, and desire exists on both sides without confidence ever fully activating.",
    wayOut:
      'You learn to claim desire without needing high intensity, name boundaries and preferences early to reduce pressure, tolerate a partner\'s desire for "more" without shame, and separate "I feel pressured" from "I am not desirable."',
  },

  "loyal-ritualist": {
    resultWord: "Stability-Contingent",
    anchor: "emerges through consistency, familiarity, and feeling secure in the bond",
    dot: 32.54,
    risesWith: "Consistency, familiarity, and feeling secure in the bond",
    contractsWith: "There is sudden change or uncertainty",
    unmovedBy:
      "Constant novelty, high-risk experimentation, visual impact or seduction performance, or being the exciting one",
    trap: "You wait to feel secure before showing confidence, your partner waits for more spontaneity or experimentation, and desire exists on both sides without confidence ever fully expanding.",
    wayOut:
      'You learn to hold security internally rather than only through sameness, name needs and fears without clinging to routine, tolerate gentle change without collapsing into threat, and separate "things are shifting" from "I am not desirable."',
  },

  "emotional-voyeur": {
    resultWord: "Privacy-Contingent",
    anchor:
      "emerges through psychological safety, controlled exposure, and the ability to choose your level of visibility",
    dot: 44.73,
    risesWith:
      "Psychological safety, controlled exposure, and the ability to choose your level of visibility",
    contractsWith: "You feel put on the spot",
    unmovedBy:
      "Being the center of attention, explicit performance demands, dominance or bold initiation, or fast escalation or high visibility",
    trap: "You wait to feel safe before showing confidence, your partner waits for clearer initiation or directness, and desire exists on both sides without confidence ever fully activating.",
    wayOut:
      'You learn to build embodied self-trust alongside fantasy, name boundaries and desires in small, safe increments, tolerate being the focus without collapsing into shame, and separate "I feel exposed" from "I am not desirable."',
  },

  "spiritual-lover": {
    resultWord: "Meaning-Contingent",
    anchor: "emerges through emotional sincerity, presence, and a felt sense of sacred connection",
    dot: 49.09,
    risesWith: "Emotional sincerity, presence, and a felt sense of sacred connection",
    contractsWith: "Intimacy feels rushed or superficial",
    unmovedBy:
      "Visual impact alone, sexual technique as the main anchor, thrill or novelty for your own sake, or dominance and performative boldness",
    trap: "You wait to feel deep connection before showing confidence, your partner waits for lighter and easier sexuality, and desire exists on both sides without confidence ever fully activating.",
    wayOut:
      'You learn to stay embodied even when intimacy feels ordinary, name needs for depth without idealizing or pressuring, tolerate small ruptures without collapsing into spiritual disappointment, and separate "I feel disconnected" from "I am not desirable."',
  },

  "relational-nurturer": {
    resultWord: "Reciprocity-Contingent",
    anchor: "emerges through appreciation, emotional harmony, and felt reciprocity",
    dot: 54.73,
    risesWith: "Appreciation, emotional harmony, and felt reciprocity",
    contractsWith: "You feel taken for granted or emotionally burdened",
    unmovedBy:
      "Dominance or assertiveness, visual impact or seduction performance, novelty for novelty's sake, or high-intensity thrill",
    trap: "You wait to feel appreciated before showing confidence, your partner waits for clearer needs or initiation, and desire exists on both sides without confidence ever fully activating.",
    wayOut:
      'You learn to receive without guilt and trust your own worth, name desires clearly before resentment builds, tolerate a partner\'s discomfort without self-erasing, and separate "I feel unappreciated" from "I am not desirable."',
  },

  "tender-devotee": {
    resultWord: "Validation-Contingent",
    anchor: "emerges through reassurance, warmth, and feeling accepted",
    dot: 64.0,
    risesWith: "Reassurance, warmth, and feeling accepted",
    contractsWith: "Approval feels uncertain",
    unmovedBy:
      "Dominance or assertiveness, sexual performance as proof of worth, risk-taking or bold novelty, or being the one who leads without reassurance",
    trap: "You wait to feel affirmed before showing confidence, your partner waits for clearer desire or boundaries, and desire exists on both sides without confidence ever fully activating.",
    wayOut:
      'You learn to build internal self-worth independent of constant reassurance, name desires clearly without apologizing, tolerate small moments of ambiguity without spiraling, and separate "I feel rejected" from "I am not desirable."',
  },

  "curious-apprentice": {
    resultWord: "Feedback-Contingent",
    anchor: "emerges through encouragement, clarity, and feeling safe to learn",
    dot: 71.09,
    risesWith: "Encouragement, clarity, and feeling safe to learn",
    contractsWith: "You feel evaluated, rushed, or criticized",
    unmovedBy:
      'Dominance or bold initiation, already "knowing what to do," visual impact or seduction performance, or high-risk improvisation without guidance',
    trap: "You wait to feel confident before initiating, your partner waits for clearer desire or leadership, and desire exists on both sides without confidence ever fully activating.",
    wayOut:
      'You learn to build erotic self-trust through embodied practice, name desires and questions without apologizing, tolerate awkward moments without collapsing into shame, and separate "I made a mistake" from "I am undesirable."',
  },

  "analytical-sexualist": {
    resultWord: "Competence-Contingent",
    anchor: "emerges through clarity, understanding, and feeling capable",
    dot: 78.91,
    risesWith: "Clarity, understanding, and feeling capable",
    contractsWith: "Things feel ambiguous, chaotic, or evaluative",
    unmovedBy:
      "Pure spontaneity without communication, high emotional intensity without structure, performative seduction, or uncertainty and guesswork",
    trap: "You wait to feel certain before showing confidence, your partner waits for more spontaneity and feeling, and desire exists on both sides without confidence ever fully activating.",
    wayOut:
      'You learn to trust sensation without needing perfect understanding, name needs and questions without self-judgment, tolerate imperfect moments without shame, and separate "I feel uncertain" from "I am not desirable."',
  },

  "explorer-of-edges": {
    resultWord: "Edge-Contingent",
    anchor:
      "emerges through intensity, clear boundaries, and the permission to explore depth and taboo",
    dot: 83.64,
    risesWith: "Intensity, clear boundaries, and the permission to explore depth and taboo",
    contractsWith: "Things feel bland, overly contained, or judged",
    unmovedBy:
      'Soft reassurance as the main fuel, predictability without intensity, gentle pacing without charge, or performing to appear "normal."',
    trap: "You wait to feel permission before showing confidence, your partner waits for softness or less intensity, and desire exists on both sides without confidence ever fully aligning.",
    wayOut:
      'You learn to integrate tenderness without losing intensity, name desires and boundaries with more emotional transparency, tolerate calm intimacy without interpreting it as deprivation, and separate "I\'m not getting edge" from "I\'m not desired."',
  },

  "authority-conductor": {
    resultWord: "Control-Contingent",
    anchor: "emerges through clarity, leadership, and feeling in control of the frame",
    dot: 88.55,
    risesWith: "Clarity, leadership, and feeling in control of the frame",
    contractsWith: "Things feel ambiguous or disrespectful",
    unmovedBy:
      "Uncertainty or improvisation without structure, subtle hinting and guessing games, emotional vulnerability without agreements, or being led without choice",
    trap: "You wait to feel clarity before showing confidence, your partner waits for more softness or emotional openness, and desire exists on both sides without confidence ever fully integrating.",
    wayOut:
      'You learn to choose control rather than require it, communicate structure while also naming emotional needs, tolerate small uncertainty without shutting down intimacy, and separate "I feel disrespected" from "I am not desirable."',
  },

  "spark-seeker": {
    resultWord: "Activation-Contingent",
    anchor: "emerges through spark, playful chemistry, and a sense of freedom",
    dot: 92.91,
    risesWith: "Spark, playful chemistry, and a sense of freedom",
    contractsWith: "Things feel heavy, routine, or controlled",
    unmovedBy:
      "Emotional caretaking, long conversations about feelings, predictability or routine, or slow stability without stimulation",
    trap: "You wait to feel turned on before showing confidence, your partner waits for consistency and depth, and desire exists on both sides without confidence ever fully stabilizing.",
    wayOut:
      'You learn to generate erotic charge internally rather than only from novelty, name needs for play and variety without disappearing, tolerate calm intimacy without labeling it as "dead," and separate "I\'m not activated" from "I\'m not attracted."',
  },

  "radiant-performer": {
    resultWord: "Feedback-Contingent",
    anchor: "emerges through being seen, desired, and enthusiastically responded to",
    dot: 96.91,
    risesWith: "Being seen, desired, and enthusiastically responded to",
    contractsWith: "Attention is muted or inconsistent",
    unmovedBy:
      "Quiet subtlety, privacy without reaction, slow relational pacing without feedback, or emotional processing without erotic response",
    trap: "You wait to feel admired before showing confidence, your partner waits for softer vulnerability instead of performance, and desire exists on both sides without confidence ever fully settling.",
    wayOut:
      'You learn to generate self-worth without constant external feedback, ask for attention and reassurance directly without testing, tolerate quieter desire without assuming rejection, and separate "I\'m not being reacted to" from "I\'m not wanted."',
  },
};

export function getConfidenceProfile(slug: string | null | undefined): ConfidenceProfile | null {
  if (!slug) return null;
  return Object.prototype.hasOwnProperty.call(CONFIDENCE_BY_SLUG, slug)
    ? (CONFIDENCE_BY_SLUG[slug] ?? null)
    : null;
}
