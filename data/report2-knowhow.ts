/**
 * Chapter 20 — "Background Know-How: Arousal, Desire, and Pleasure (Three
 * Different Systems of Human Sexuality)".
 *
 * The chapter was retired from Report 2.0 (`RETIRED_REPORT_SECTION_IDS` in
 * `features/report/ui/reportNav.ts` listed it under "dropped outright"). Mark
 * asked for it back on 2026-08-26 as its own section, summarised rather than
 * reproduced in full: "do not reinvent, rewrite text. Just use sentences that
 * you find most fitting."
 *
 * So: every string here is a VERBATIM sentence or paragraph from chapter 20. The
 * editing done is selection and nothing else — the chapter runs 48 paragraphs
 * and this carries the ones that make the three systems and their mismatch
 * legible. Chapter 20 carries NO green highlight, which is why selection was the
 * instruction here and not the green pass.
 *
 * Universal copy: the three systems are not per-archetype.
 */

export interface Report2KnowHowLayer {
  /** "The Body (Arousal)" — the document's own label for the layer. */
  label: string;
  /** "fast, automatic, non-moral" — the document's own descriptor. */
  descriptor: string;
  /** The question the document says this system answers. */
  question: string;
  /** One verbatim paragraph placing the system. */
  body: string;
}

/** The chapter's opening, verbatim. */
export const KNOWHOW_INTRO =
  "One of the most common, and most damaging, misunderstandings about sexuality is the belief that arousal, desire, and pleasure are the same thing. They are not. Modern sexuality science shows clearly that these are three distinct systems, each governed by different mechanisms in the brain and body. They often interact, but they do not reliably align. Learning to distinguish them is one of the most important steps toward self-understanding, sexual confidence, and healing.";

/** The second opening paragraph — why the distinction earns its place. */
export const KNOWHOW_WHY =
  "This distinction matters not only for better sex, but for dissolving shame, understanding fantasies, navigating mismatched desire in relationships, and making sense of confusing or even disturbing sexual reactions.";

/**
 * The three layers, in the document's own order. `label` and `descriptor` are
 * split off the chapter's "A Clear Mental Model" list ("The Body (Arousal):
 * fast, automatic, non-moral"); `question` is the question each system's own
 * subsection says it answers; `body` is one verbatim paragraph from it.
 */
export const KNOWHOW_LAYERS: Report2KnowHowLayer[] = [
  {
    label: "The Body (Arousal)",
    descriptor: "fast, automatic, non-moral",
    question: "“Has something triggered my sexual response system?”",
    body: "Arousal is physiological. It is the body’s automatic reaction to certain stimuli, visual, tactile, contextual, or symbolic, that activate the sexual response system. This process is largely governed by the autonomic nervous system and by subcortical brain structures that evolved long before conscious reasoning, ethics, or relationship meaning.",
  },
  {
    label: "The Mind (Desire)",
    descriptor: "intentional, meaning-based, selective",
    question: "“Do I want to move toward this?”",
    body: "Unlike arousal, desire is deeply contextual. It can increase or vanish depending on trust, stress, exhaustion, relational dynamics, novelty, or emotional connection. This is why desire can exist without arousal (for example, wanting closeness while the body is slow to respond), and why arousal can exist without desire (for example, bodily reaction without any wish to continue).",
  },
  {
    label: "The Experience (Pleasure)",
    descriptor: "subjective, integrative, safety-dependent",
    question: "“Does this feel good to me, overall?”",
    body: "Pleasure is experiential. It describes how something actually feels once it is happening. Pleasure integrates the body, emotions, meaning, and nervous system state into a subjective sense of enjoyment, or lack thereof.",
  },
];

/** Non-concordance, named. The chapter's own definition. */
export const KNOWHOW_NONCONCORDANCE =
  "Sexuality science refers to this mismatch as arousal non-concordance, the lack of alignment between physiological arousal and subjective experience. This phenomenon is not a flaw or pathology. It is a predictable consequence of how the nervous system is designed to operate.";

/** What the chapter is unequivocal about, set as its own line in the document. */
export const KNOWHOW_VERDICT =
  "Physiological arousal is not a measure of desire, pleasure, or consent.";

/** Why separating the three helps — the chapter's "Why This Knowledge Is Liberating". */
export const KNOWHOW_LIBERATING = [
  "When these systems are collapsed into one idea, people may judge themselves for intrusive arousal, misinterpret fantasies as hidden wishes, feel broken when desire and arousal don't align, misread partners' signals, or carry unnecessary guilt or fear.",
  "You can acknowledge your body’s reactions without identifying with them. You can honor your desires without forcing performance. You can pursue pleasure without confusing it with obligation.",
];

/** The line the chapter closes the mental model with. */
export const KNOWHOW_MODEL_CLOSE =
  "Healthy sexuality does not require perfect alignment between these layers. It requires understanding mismatches, such as arousal non-concordance, without shame.";

/** "Final Reflection", verbatim. */
export const KNOWHOW_FINAL = [
  "Your body may react to things you do not want.You may want things your body is slow to follow.And pleasure only emerges when choice, safety, and presence align.",
  "This is not dysfunction.This is being human.",
];
