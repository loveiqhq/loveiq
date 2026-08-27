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

/**
 * "Final Reflection", verbatim — one entry per LINE.
 *
 * The document sets these as five lines across two paragraphs, using soft line
 * breaks inside each. Read as <w:t> alone they concatenate into "…you do not
 * want.You may want…", so the breaks are honoured here and each line is its own
 * entry.
 */
export const KNOWHOW_FINAL = [
  "Your body may react to things you do not want.",
  "You may want things your body is slow to follow.",
  "And pleasure only emerges when choice, safety, and presence align.",
  "This is not dysfunction.",
  "This is being human.",
];

/**
 * The educational expander for this chapter, added 2026-08-27.
 *
 * Mark: "Lets add an educational piece to this section. What parts of the Google
 * Doc around Arousal, Desire and Pleasure could we copy paste into it? Build it
 * with your best choice."
 *
 * The choice is arousal non-concordance, from the paragraphs of chapter 20 the
 * open section does not use: the laboratory findings, the line that names what
 * they show, and the evolutionary reason. It is the chapter's hardest idea and the
 * one a reader is most likely to need explained, which is what an expander is for.
 *
 * DELIBERATELY NOT INCLUDED: the sexual-violence passage (chapter 20's "When the
 * Systems Do Not Align"). It is the most important writing in the chapter and it
 * belongs in the open section, not folded behind a "read the full explanation" —
 * a reader who needs it should not have to click. `KNOWHOW_VERDICT`, the line it
 * builds to, already renders there.
 */
export const KNOWHOW_EDU_EYEBROW = "Learn: arousal non-concordance";

export const KNOWHOW_EDU: string[] = [
  "This is why arousal can occur in situations that feel confusing, unwanted, or even disturbing. In laboratory studies, researchers have repeatedly shown that people can exhibit clear physiological arousal to stimuli they do not desire, do not enjoy, and would never choose in real life. Participants have shown genital arousal to non-preferred genders, non-human sexual imagery (such as animals), or abstract sexual cues that carried no personal meaning whatsoever.",
  "In these cases, the body reacts while the mind does not want, and the experience is not pleasurable.",
  "Sexuality science refers to this mismatch as arousal non-concordance, the lack of alignment between physiological arousal and subjective experience. This phenomenon is not a flaw or pathology. It is a predictable consequence of how the nervous system is designed to operate.",
  "From an evolutionary perspective, arousal systems are intentionally broad, fast, and imprecise. They evolved to reduce missed reproductive opportunities, not to reflect modern identity, consent, morality, or emotional truth. Meaning is added later, if at all.",
];
