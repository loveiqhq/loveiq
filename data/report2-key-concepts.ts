/**
 * "Key Concepts" — the pill above each chapter's card.
 *
 * Replaces the matrix's `learn.eyebrow` ("What you will learn") and its one-line
 * `learn.body`. Mark's 2026-08-26 pass on the Spark Seeker source document
 * ("Copy of [OLD] Spark Seeker Report Template",
 * docs.google.com/document/d/1xCK5WIgxBrx3JgLFqskcCT0ZGpMhunUn6ntwrwnf3Xo)
 * marked the passages worth keeping in green highlight and asked for the first
 * one or two green paragraphs after each numbered chapter heading to become this
 * block.
 *
 * NOT in `copy-matrix-v2.csv` on purpose: the matrix is generated from the copy
 * sheet (`report2-copy.ts` carries a do-not-hand-edit banner), and this is a
 * document-sourced layer resolved on top of it — see the layering note in
 * `features/report/ui/sections/` and app/api/report/route.ts.
 *
 * Every string below is a verbatim paragraph from that document. They are not
 * paraphrased, re-punctuated or trimmed; where the source paragraph ended in a
 * colon introducing a question list (chapters 15, 16, 22) the NEXT green
 * paragraph was taken instead, because the colon has nothing to introduce here.
 *
 * Only `spark-seeker` is populated. Every other archetype keeps its matrix
 * `learn.body` and only picks up the new eyebrow.
 */
export const KEY_CONCEPTS_EYEBROW = "Key Concepts";

export interface Report2KeyConcepts {
  /** First green paragraph after the chapter heading. */
  p1: string;
  /** Second one, where the document had a second worth carrying. */
  p2?: string;
}

/** slug → report2 section id → the block. */
export const report2KeyConcepts: Record<string, Record<string, Report2KeyConcepts>> = {
  "spark-seeker": {
    beliefs: {
      // document paragraph 204
      p1: "Typical beliefs are the often unconscious ideas about sex, worth, safety, power, and connection that people absorb early in life, through family culture, religion, media, peers, and formative relationships. These beliefs shape why someone wants sex, what they think sex is for, and what feels allowed or forbidden.",
    },
    accel: {
      // Chapter 23 (accelerators) + chapter 24 (brakes) — one section in the report.
      // document paragraph 243
      p1: "For the Spark Seeker, arousal grows when there’s playful tension and something to chase. What turns them on are moments that feel alive, flirt-forward, and a little unpredictable.",
      // document paragraph 265
      p2: "Desire doesn’t disappear because attraction is gone. It disappears because novelty, tension, and play were removed. Remove these negative triggers, and arousal often returns naturally, without effort, persuasion, or technique.",
    },
    attachment: {
      // document paragraph 268
      p1: "Attachment style is not neediness, not independence, and not maturity. It reflects how the nervous system learned to regulate safety, connection, and threat and how desire organizes itself around those patterns.",
      // document paragraph 269
      p2: "Across archetypes, attachment style strongly shapes how desire emerges, how conflict affects libido, and how sex functions as reassurance, bonding, escape, or regulation.",
    },
    insecurities: {
      // document paragraph 310
      p1: "Core insecurities are the deep, often pre-verbal fears that organize how a person protects themselves in intimacy. They are not surface-level worries or conscious beliefs, but felt vulnerabilities shaped by early attachment experiences, nervous-system learning, and repeated relational patterns. In sexuality, these insecurities quietly determine when desire opens, when it collapses, and what kinds of erotic strategies emerge to manage emotional risk.",
      // document paragraph 312
      p2: "Sexual behavior is frequently a regulation strategy. People do not only seek pleasure; they also seek safety, reassurance, validation, control, or distance, often without knowing it. Core insecurities sit underneath these strategies, guiding arousal, fantasy, boundaries, and relational choices.",
    },
    confidence: {
      // document paragraph 348
      p1: "Sexual confidence is not bravado, not loudness, and not experience level. It reflects the degree to which a person feels at home in their erotic self, physically, emotionally, and relationally.",
    },
    reward: {
      // document paragraph 377
      p1: "Sexual desire is not driven by libido alone. It emerges from the interaction of several neurochemical systems: dopamine, associated with anticipation, novelty, pursuit, and motivation; oxytocin, associated with bonding, trust, safety, and emotional attunement; endorphins, associated with pleasure, soothing, and pain reduction; serotonin, associated with emotional regulation, contentment, and stability; and cortisol and adrenaline, which modulate stress, alertness, and threat.",
      // document paragraph 380
      p2: "Many sexual mismatches are not about attraction or skill, but about reward-system misalignment. Partners may engage in the same sexual behavior while receiving entirely different biochemical payoffs.",
    },
    energy: {
      // Chapter 13 (energy level) + chapter 14 (risk orientation) — one section, "Energy & Risk".
      // document paragraph 413
      p1: "Energy level is not libido and not motivation. Two people may value sex equally and want it just as much, but with very different energetic signatures.",
      // document paragraph 433
      p2: "Risk orientation describes how comfortable someone is with uncertainty, intensity, novelty, loss of control, and emotional or sexual exposure in sexuality. It answers questions like: How much risk do I need to feel alive? How much safety do I need to feel open?",
    },
    power: {
      // Chapter 15. The first green paragraph ends "It answers questions like:", so p459 is used.
      // document paragraph 459
      p1: "Power orientation is not dominance skill, not confidence, and not kink preference. Many people have strong erotic lives but struggle when power dynamics don’t align with their nervous system or attachment needs.",
    },
    curiosity: {
      // Chapter 16 (curiosity level) + chapter 17 (relationship form) — one section.
      // document paragraph 488
      p1: "Curiosity level is not risk orientation and not libido. Two people may desire sex equally, yet differ greatly in how much novelty, variation, or exploration they want within it.",
      // document paragraph 517
      p2: "Sexual desire is deeply sensitive to relational structure. Structure determines how much background uncertainty the nervous system must manage, and therefore how much capacity remains for pleasure, curiosity, and intimacy.",
    },
    lovelang: {
      // document paragraph 611
      p1: "The concept of love language describes the ways people most naturally give, perceive, and register love, care, and erotic affirmation. While popularized by Gary Chapman’s The Five Love Languages, contemporary psychology and sexuality research have refined the idea beyond surface-level behaviors. At its core, love language is not about preference alone, but about how the nervous system recognizes safety, bonding, and erotic permission.",
    },
    arousal: {
      // document paragraph 719
      p1: "Desire does not switch on through emotional depth, slow reassurance, or routine alone. It builds through anticipation, play, and a sense of fresh possibility. Feeling intrigued, free, and energetically engaged is the gateway to physical arousal.",
    },
    initiation: {
      // Chapter 22.
      // document paragraph 727
      p1: "Initiation style is not libido and not confidence. Many people desire sex deeply but struggle to initiate in ways that feel safe or authentic to them.",
    },
    fantasy: {
      // Chapter 25 (fantasies per context).
      // document paragraph 752
      p1: "Sexual fantasies do not exist in a vacuum. They are shaped by context: who we are with, how known we feel, what is at stake emotionally, what phase of life we are in, and how much of ourselves feels safe to express. The same fantasy can feel alive, distant, forbidden, comforting, or completely uninteresting depending on where it is imagined and with whom.",
      // document paragraph 753
      p2: "One of the most confusing experiences for many people is realizing that certain fantasies feel compelling in imagination, yet feel wrong, risky, or unappealing when considered within their primary relationship, while simultaneously feeling imaginable with a stranger or in a purely internal space. This does not indicate disloyalty, deception, or a lack of love. It reveals something fundamental about what fantasies actually do.",
    },
    libido: {
      // document paragraph 1223
      p1: "Libido challenges are among the most common and misunderstood issues in intimate relationships. Popular culture often frames them as mismatches in sex drive, one partner “wants more,” the other “wants less.” Contemporary sexology, attachment research, and neuroscience suggest a different picture.",
      // document paragraph 1224
      p2: "Desire is not a fixed internal resource. It is state-dependent and relationally regulated. Libido rises and falls based on nervous-system safety, emotional attunement, stress load, power dynamics, unresolved conflict, and the conditions under which arousal is allowed to emerge.",
    },
    partnership: {
      // document paragraph 1274
      p1: "For the Spark Seeker, “sustaining a partner” is rarely about effort, loyalty, or commitment. This archetype can bond deeply when the relationship stays alive and responsive. The challenge usually emerges somewhere else: in the erotic metabolism of long-term stability, how much play, novelty, pursuit, and freedom the nervous system needs in order to stay engaged, curious, and sexually lit up over time.",
    },
    growth: {
      // document paragraph 1288
      p1: "For the Spark Seeker, growth is rarely about becoming “more serious” or “more settled.” It’s about expanding range: staying true to the core erotic signature (spark, tension, play, novelty, freedom) while becoming less dependent on constant stimulation to access desire, speak needs, and stay connected when things feel ordinary.",
    },
  },
};

/** The block for this archetype + section, or null when the document had none. */
export function getKeyConcepts(slug: string, sectionId: string): Report2KeyConcepts | null {
  return report2KeyConcepts[slug]?.[sectionId] ?? null;
}
