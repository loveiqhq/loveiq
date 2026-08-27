/**
 * "Key Concepts" — the pill above each chapter's card.
 *
 * Replaces the matrix's `learn.eyebrow` ("What you will learn") and its one-line
 * `learn.body`. Mark's 2026-08-26 pass on the Spark Seeker source document
 * (docs.google.com/document/d/1xCK5WIgxBrx3JgLFqskcCT0ZGpMhunUn6ntwrwnf3Xo)
 * marked the passages worth keeping in green highlight and asked for the first
 * one or two green paragraphs after each numbered chapter heading to become this
 * block.
 *
 * NOT in `copy-matrix-v2.csv` on purpose: the matrix is generated from the copy
 * sheet (`report2-copy.ts` carries a do-not-hand-edit banner), and this is a
 * document-sourced layer resolved on top of it.
 *
 * Every string is a verbatim paragraph from that document. Two deliberate
 * departures, both marked at the entry that makes them:
 *   - where the first green paragraph ended in a colon introducing a question
 *     list (chapters 15, 16, 22) the NEXT green paragraph was taken instead;
 *   - the Sexual Stage entry uses one paragraph's GREEN RUN rather than the whole
 *     paragraph, with its first letter capitalised.
 *
 * `lead` is a second kind of addition: five chapters open with a one-sentence
 * definition of the dimension ("Energy level describes the baseline intensity,
 * pace, and activation a person brings into sexuality"), which Mark asked to sit
 * in front of the green paragraph rather than replace it. It renders as the first
 * sentence of the same paragraph.
 *
 * Only `spark-seeker` is populated. Every other archetype keeps its matrix
 * `learn.body` and only picks up the new eyebrow.
 */
export const KEY_CONCEPTS_EYEBROW = "Key Concepts";

export interface Report2KeyConcepts {
  /** Chapter-opening definition, rendered in front of `p1` in the same paragraph. */
  lead?: string;
  /** First green paragraph after the chapter heading. */
  p1: string;
  /** Second one, where the document had a second worth carrying. */
  p2?: string;
  /** What a `lead` ending in a colon introduces. */
  questions?: string[];
}

/** slug → report2 section id → the block. */
export const report2KeyConcepts: Record<string, Record<string, Report2KeyConcepts>> = {
  "spark-seeker": {
    constellation: {
      // Chapter "4 Probability of Other Archetypes" — the constellation block.
      // document paragraph 137
      p1: "Sexual archetypes are not fixed identities. They are changing patterns shaped by experience, safety, attachment, stress, healing and growth. As those influences shift, the way your sexuality organizes itself can change as well.",
      // document paragraph 198
      p2: "Most people carry a constellation of archetypes rather than a single dominant one. One archetype may guide how you connect emotionally, another how you explore desire, and another how you express power or curiosity. Which archetype becomes active usually depends on context: who you are with, how safe you feel, the sexual stage you are in, and what your nervous system needs in the moment.",
    },
    importance: {
      // Chapter 7. Only p131 is fully green; p130 and p132 are part-green and their green
      // runs both stop mid-sentence, so they are left out.
      // document paragraph 131
      p1: "The importance of sexuality answers a different question than motivation. It is not why someone has sex, but how central sexuality is to their sense of aliveness, relationship satisfaction, and personal well-being at a given point in time.",
    },
    stage: {
      // Chapter 4. p1 is the GREEN RUN of p41, not the whole paragraph: the green
      // starts mid-sentence after "point to the same truth: ", so its first letter is
      // capitalised and nothing else is touched. It is used because it is the passage
      // that says what a stage IS, which is what the 2026-08-25 comment on this
      // chapter asked for ("Jumps straight into the Stages without explaining what
      // they are").
      // green run of document paragraph 41, first letter capitalised
      p1: "Sexuality unfolds in stages. These stages are not fixed identities or personality types. They are states. Dynamic patterns in how desire, intimacy, and sexual energy express themselves at a given moment in time.",
      // document paragraph 43
      p2: "Importantly, no sexual stage is better or worse than another. Each stage is adaptive. Each exists for a reason. Some protect us. Some invite exploration. Some deepen connection. Some open the door to meaning and transcendence. Difficulty usually arises not because someone is “in the wrong stage,” but because a stage is misunderstood, unsupported, or mismatched with a partner’s.",
    },
    knowhow: {
      // Chapter 20. Moved out of the open section into the pill on 2026-08-27
      // ("Move the 'One of the most common,...' until 'disturbing sexual reactions'
      // into a Key concept section that you need to build for this section").
      // document paragraph 643
      p1: "One of the most common, and most damaging, misunderstandings about sexuality is the belief that arousal, desire, and pleasure are the same thing. They are not. Modern sexuality science shows clearly that these are three distinct systems, each governed by different mechanisms in the brain and body. They often interact, but they do not reliably align. Learning to distinguish them is one of the most important steps toward self-understanding, sexual confidence, and healing.",
      // document paragraph 644
      p2: "This distinction matters not only for better sex, but for dissolving shame, understanding fantasies, navigating mismatched desire in relationships, and making sense of confusing or even disturbing sexual reactions.",
    },
    beliefs: {
      // document paragraph 204
      p1: "Typical beliefs are the often unconscious ideas about sex, worth, safety, power, and connection that people absorb early in life, through family culture, religion, media, peers, and formative relationships. These beliefs shape why someone wants sex, what they think sex is for, and what feels allowed or forbidden.",
    },
    accel: {
      // Chapter 23 (accelerators) + chapter 24 (brakes) — one section.
      // document paragraph 255
      p1: "For the Spark Seeker, desire doesn’t disappear randomly. It collapses when sex feels predictable, overly serious, or like a scheduled responsibility. These triggers don’t just reduce arousal, they often create boredom, irritation, or emotional distancing.",
    },
    attachment: {
      // document paragraph 268
      p1: "Attachment style is not neediness, not independence, and not maturity. It reflects how the nervous system learned to regulate safety, connection, and threat and how desire organizes itself around those patterns.",
      // document paragraph 269
      p2: "Across archetypes, attachment style strongly shapes how desire emerges, how conflict affects libido, and how sex functions as reassurance, bonding, escape, or regulation.",
    },
    insecurities: {
      // Chapter 9. Second paragraph removed 2026-08-27 ("Key Concepts are too long").
      // document paragraph 310
      p1: "Core insecurities are the deep, often pre-verbal fears that organize how a person protects themselves in intimacy. They are not surface-level worries or conscious beliefs, but felt vulnerabilities shaped by early attachment experiences, nervous-system learning, and repeated relational patterns. In sexuality, these insecurities quietly determine when desire opens, when it collapses, and what kinds of erotic strategies emerge to manage emotional risk.",
    },
    confidence: {
      // lead: document paragraph 347, first sentence
      lead: "Confidence level describes how secure a person feels in their body, desirability, expression, and right to want what they want.",
      // document paragraph 348
      p1: "Sexual confidence is not bravado, not loudness, and not experience level. It reflects the degree to which a person feels at home in their erotic self, physically, emotionally, and relationally.",
    },
    reward: {
      // Chapter 12. p1 is the TRIMMED opening — see REWARD_OPENING in
      // report2-doc-inserts.ts for why the neurochemical list comes off the end.
      // lead: document paragraph 376, first sentence
      lead: "Biochemical reward system dynamics refer to the neurochemical patterns through which sexuality becomes motivating, satisfying, calming, or compelling.",
      // document paragraph 377, trimmed at "neurochemical systems"
      p1: "Sexual desire is not driven by libido alone. It emerges from the interaction of several neurochemical systems.",
    },
    energy: {
      // Chapter 13 (energy) + chapter 14 (risk orientation) — one section.
      // lead: document paragraph 412, first sentence
      lead: "Energy level describes the baseline intensity, pace, and activation a person brings into sexuality.",
      // document paragraph 413
      p1: "Energy level is not libido and not motivation. Two people may value sex equally and want it just as much, but with very different energetic signatures.",
      // document paragraph 433
      p2: "Risk orientation describes how comfortable someone is with uncertainty, intensity, novelty, loss of control, and emotional or sexual exposure in sexuality. It answers questions like: How much risk do I need to feel alive? How much safety do I need to feel open?",
    },
    power: {
      // Chapter 15. The lead ends on a colon, so the questions it introduces come with
      // it (POWER_QUESTIONS in report2-doc-inserts.ts).
      // lead: document paragraph 454, first sentence
      lead: "Power orientation describes how a person relates to agency, control, surrender, and influence in sexual and intimate contexts.",
      // document paragraph 459
      p1: "Power orientation is not dominance skill, not confidence, and not kink preference. Many people have strong erotic lives but struggle when power dynamics don’t align with their nervous system or attachment needs.",
    },
    curiosity: {
      // Chapter 16 (curiosity) + chapter 17 (relationship form) — one section.
      // lead: document paragraph 487, first sentence
      lead: "Curiosity level describes how strongly a person is oriented toward sexual exploration, experimentation, learning, and growth.",
      // document paragraph 488
      p1: "Curiosity level is not risk orientation and not libido. Two people may desire sex equally, yet differ greatly in how much novelty, variation, or exploration they want within it.",
      // document paragraph 517
      p2: "Sexual desire is deeply sensitive to relational structure. Structure determines how much background uncertainty the nervous system must manage, and therefore how much capacity remains for pleasure, curiosity, and intimacy.",
    },
    lovelang: {
      // Chapter 19.
      // document paragraph 611, with the Gary Chapman sentence removed
      p1: "The concept of love language describes the ways people most naturally give, perceive, and register love, care, and erotic affirmation. At its core, love language is not about preference alone, but about how the nervous system recognizes safety, bonding, and erotic permission.",
    },
    arousal: {
      // document paragraph 719
      p1: "Desire does not switch on through emotional depth, slow reassurance, or routine alone. It builds through anticipation, play, and a sense of fresh possibility. Feeling intrigued, free, and energetically engaged is the gateway to physical arousal.",
    },
    initiation: {
      // Chapter 22.
      // lead: document paragraph 726, first sentence
      lead: "Initiation style describes how a person tends to start sexual contact, or signal readiness for it.",
      // document paragraph 727
      p1: "Initiation style is not libido and not confidence. Many people desire sex deeply but struggle to initiate in ways that feel safe or authentic to them.",
    },
    fantasy: {
      // document paragraph 752, with the "same fantasy can feel alive" sentence removed
      p1: "Sexual fantasies do not exist in a vacuum. They are shaped by context: who we are with, how known we feel, what is at stake emotionally, what phase of life we are in, and how much of ourselves feels safe to express.",
      // p2: p753 rewritten shorter at Mark's request - NOT verbatim
      p2: "A fantasy can feel compelling in imagination and wrong inside your own relationship, yet imaginable with a stranger. That is not disloyalty or a lack of love. It reveals what fantasies actually do.",
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
