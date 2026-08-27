/**
 * Text the source document's comments ask for, placed where the comments say.
 *
 * Two rounds of Mark's feedback live here. The 2026-08-26 comments each anchored
 * on a passage and named its destination ("Add this to the Attachment Style
 * section just under the rectangle that reads 'The Key'"). The 2026-08-27 round
 * named more destinations in prose. Both are the same thing: document passages,
 * verbatim, keyed by where they go.
 *
 * HOW THE 2026-08-26 MAPPING WAS ESTABLISHED, since it is not machine-readable.
 * The Drive API returns comment threads newest-first and their anchors in document
 * order, with no shared id. Twelve of thirteen anchors were matched to a paragraph
 * range by their own text; the thirteenth spans a paragraph break and was found by
 * hand. The chronological order of the comments then matched the document order of
 * the anchors exactly, and every one landed in the section its own comment names.
 * That agreement is the check.
 *
 * Every string is verbatim. Where a field holds several, they are in document
 * order and the component decides the spacing between them (see `ProseGroup`).
 *
 * Per-archetype, so gated: `withKeyConcepts` in app/api/report/route.ts passes
 * each section's unlock flag and a locked reader receives null.
 */

export interface Report2DocInserts {
  accel: {
    /** Above the "What opens you" / "What shuts you down" columns. */
    aboveColumns: string;
    /** Under the accelerator-led / brake-led meter. */
    underMeter: string;
  };
  beliefs: {
    /** Above the two belief columns. */
    intro: string;
    /** After the list, replacing "Most of these formed where attention arrived...". */
    afterList: string[];
  };
  attachment: {
    /** Under the "The Key" panel. */
    underKey: string[];
    /** Under "The Map", replacing "one dot shows your baseline...". */
    underMap: string[];
  };
  insecurities: {
    /** Above the cue graph, over "Where your sensitivity sits". */
    aboveGraph: string;
  };
  confidence: {
    /** Replaces the "Each dot is one of the 14 archetypes..." note. */
    replaceStripNote: string[];
  };
  reward: {
    /** Above the ranked "01 Dopamine - the lead" list. */
    aboveChemicals: string;
    /** Under the statistical element (comment parts 1 and 2). */
    underStats: string[];
  };
  energy: {
    /** After the "Depth replaces speed" panel. p426 leads it in (2026-08-27). */
    afterDepth: string[];
    /** After the energy curve. Left aligned. */
    afterGraph: string[];
  };
  power: {
    /** Opens the card, before "Leading happens when momentum grabs you". */
    opener: string;
  };
  curiosity: {
    /** Under the curiosity scale. */
    underScale: string;
    /** Under the "Fit by relationship form" table. p568 leads it in. */
    underFit: string[];
  };
  arousal: {
    /** Before "The Reframe" block. */
    beforeReframe: string;
  };
  initiation: {
    /** After the initiation-style block. p745 follows on a line break. */
    afterVarieties: string[];
    /** Replaces the "what you sent / what arrived" pair. */
    standoff: string[];
  };
  fantasy: {
    /** Before the practice-tendency groups: what the scores are. */
    beforeTendencies: string[];
    /** The two metrics, as a labelled pair. */
    metrics: string[];
  };
  libido: {
    /** Under the "Its close cousin" block. */
    underCousin: string[];
  };
  partnership: {
    /** Under the loop visual, before the educational block. */
    underFlywheel: string;
  };
  growth: {
    /** Replaces the "Spark Seekers get called shallow..." opener. */
    replaceOpener: string;
  };
}

export const report2DocInserts: Record<string, Report2DocInserts> = {
  "spark-seeker": {
    accel: {
      // document paragraph 243
      aboveColumns:
        "For the Spark Seeker, arousal grows when there’s playful tension and something to chase. What turns them on are moments that feel alive, flirt-forward, and a little unpredictable.",
      // document paragraph 265
      underMeter:
        "Desire doesn’t disappear because attraction is gone. It disappears because novelty, tension, and play were removed. Remove these negative triggers, and arousal often returns naturally, without effort, persuasion, or technique.",
    },
    beliefs: {
      // document paragraph 216
      intro:
        "The Spark Seeker carries a belief system that formed around stimulation, novelty, and feeling energetically alive. These beliefs often originate in early environments where excitement, humor, freedom, or charisma were rewarded, or where boredom, rigidity, or emotional heaviness made aliveness feel rare and precious.",
      // document paragraphs 230, 232, 233
      afterList: [
        "These beliefs often come from early experiences where aliveness felt conditional, where attention, love, or belonging came through being fun, interesting, or “up.”",
        "None of these are wrong, but when held rigidly, they can limit depth, steadiness, and the ability to enjoy slow intimacy.",
        "Growth for the Spark Seeker is not about becoming less playful. It’s about expanding what desire can include.",
      ],
    },
    attachment: {
      // document paragraphs 284, 285
      underKey: [
        "The Spark Seeker has a primarily secure attachment style, with avoidant features under pressure, boredom, or perceived loss of freedom.",
        "At baseline, they are capable of closeness while maintaining independence. They value play, autonomy, and emotional lightness, and they generally believe that intimacy is best when it feels chosen rather than demanded. Desire flows most naturally when connection feels free, engaging, and full of possibility.",
      ],
      // document paragraphs 286, 287
      underMap: [
        "However, because their sexuality is tightly linked to stimulation and novelty, attachment and desire are intertwined with aliveness. When the bond feels open and energized, their nervous system activates and arousal becomes accessible. When the bond feels heavy, through emotional pressure, predictability, or a sense of being trapped, desire often drops quickly as a protective response.",
        "In moments of insecurity, avoidant patterns can emerge: they may detach or distract themselves, interpret seriousness as control, or minimize their needs to avoid being pinned down.",
      ],
    },
    insecurities: {
      // document paragraph 330
      aboveGraph:
        "The Spark Seeker’s core insecurities are primarily organized around fear of stagnation, containment, and loss of aliveness. Their system is exquisitely sensitive to monotony, pressure, and anything that makes desire feel like obligation.",
    },
    confidence: {
      // document paragraphs 361, 362, 363
      replaceStripNote: [
        "Their confidence is typically not rooted in emotional caretaking, long conversations about feelings, predictability or routine, slow stability without stimulation.",
        "Instead, it is anchored in chemistry, spontaneity, and feeling desired in the moment.",
        "When activated, the Spark Seeker tends to feel attractive through energy rather than depth, trust their ability to create excitement, express sensuality through teasing, boldness, and play, experience confidence as bright, fast, and flirtatious rather than slow.",
      ],
    },
    reward: {
      // document paragraph 397
      aboveChemicals:
        "The Spark Seeker is primarily dopamine-oriented, with adrenaline and novelty-sensitive arousal playing strong supporting roles, while oxytocin tends to be secondary rather than leading.",
      // document paragraphs 399, 400, 401
      underStats: [
        "Their system is optimized for activation. Dopamine rises through pursuit, flirtation, uncertainty, and newness, creating a “charge” that pulls desire forward. Adrenaline can amplify arousal by adding edge, speed, and intensity. Oxytocin may follow, but usually after the spark has already ignited.",
        "Unlike oxytocin-driven archetypes, the Spark Seeker is not primarily motivated by bonding as the starting point. Too much emphasis on emotional heaviness, slow pacing, or relational processing can actually disrupt their reward loop by reducing stimulation.",
        "Because of this reward profile, Spark Seekers are often misunderstood as: unable to commit, “only horny when it’s new”, emotionally avoidant, addicted to excitement.",
      ],
    },
    energy: {
      // document paragraphs 426, 427
      afterDepth: [
        "The Spark Seeker has a high, fast-activating energy level.",
        "Their sexuality is often explosive and quickly charged. Energy builds through novelty, flirtation, and anticipation, and they can arrive already “sparked”, especially when there is chemistry, play, and something new in the air. When conditions are right, their desire spikes quickly, feels bright and exciting, and thrives on momentum.",
      ],
      // document paragraphs 446, 447
      afterGraph: [
        "The Spark Seeker has a high risk orientation.",
        "Their desire thrives in novelty, uncertainty, and energetic stimulation, not in predictability, routine, or overly controlled intimacy. Sexual risk, whether emotional (spontaneity, uncertainty, “will they want me?” tension) or sexual (trying something new, playful boldness, pushing variety), tends to activate arousal rather than shut it down.",
      ],
    },
    power: {
      // document paragraph 478
      opener:
        "The Spark Seeker has a primarily freedom guided, playful switch orientation. They do not seek power for control or security. They seek stimulation and aliveness, and power grows out of play.",
    },
    curiosity: {
      // document paragraph 509
      underScale:
        "For the Spark Seeker, curiosity tends to turn outward rather than inward. They are interested in discovering new experiences, new dynamics, new settings, new “what ifs”: how novelty changes arousal, how surprise ignites desire, and how play keeps attraction awake.",
      // document paragraphs 568, 511
      underFit: [
        "The Spark Seeker is most naturally drawn to flexible, freedom preserving, and stimulation rich relationship forms, often monogamy with spaciousness, open leaning agreements, or relationships that prioritize novelty, autonomy, and play.",
        "When they feel free, desired, and unconfined, Spark Seekers can become surprisingly committed explorers. They may engage with fantasy, role play, new environments, or new sexual scripts, but typically in ways that preserve autonomy rather than deepen sameness. Rather than repeating one practice for years, they tend to rotate through experiences, finding depth through variety.",
      ],
    },
    arousal: {
      // document paragraph 719
      beforeReframe:
        "Desire does not switch on through emotional depth, slow reassurance, or routine alone. It builds through anticipation, play, and a sense of fresh possibility. Feeling intrigued, free, and energetically engaged is the gateway to physical arousal.",
    },
    initiation: {
      // document paragraphs 742, 743, 745
      afterVarieties: [
        "The Spark Seeker has a primarily active and playful initiation style.",
        "They rarely initiate through slow emotional build-up or careful relational checking first. Instead, they begin intimacy by creating charge through teasing, flirtation, novelty, and a sense of spontaneous invitation. Initiation often looks like play rather than seriousness.",
        "Because they associate sex with aliveness and freedom, they often initiate when they feel energized, curious, or turned on by possibility. If things feel routine, heavy, or emotionally demanding, initiation may stop entirely, not because desire is gone, but because the environment feels constricting.",
      ],
      // document paragraphs 747, 748
      standoff: [
        "The Spark Seeker waits to feel freedom and spark. The partner waits for emotional seriousness and reassurance. Desire exists on both sides, but no one moves.",
        "When the Spark Seeker feels spacious and desired, they can initiate more consistently, but still in a light, playful way, not a heavy or obligation-based one. Their growth lies in learning to stay present through quieter intimacy and to name needs for novelty without disappearing.",
      ],
    },
    fantasy: {
      // document paragraphs 838, 840
      beforeTendencies: [
        "These scores do not define you as an individual. They are probability-based estimates derived from aggregated research and observed patterns across archetypes.",
        "They reflect what is statistically more common, not what is fixed or deterministic for you individually. Every person is unique, and real-world preferences are shaped by personal experience, context, development, and the combination of multiple archetypes within you.",
      ],
      // document paragraphs 844, 845, 846
      metrics: [
        "We present two separate metrics on a 10-point scale:",
        "Fantasy Pull: how strongly a theme tends to appear in imagination, curiosity, or arousal",
        "Lived Pleasure:  how likely the same theme is to feel grounding, pleasurable, and genuinely good when experienced in real life",
      ],
    },
    libido: {
      // document paragraphs 1237, 1238
      underCousin: [
        "For the Spark Seeker, libido challenges are rarely about sex itself. They are about the level of spark, freedom, and aliveness in the relational atmosphere.",
        "Their desire is highly momentum-based. When the connection feels playful and charged, libido can be bright, fast, and persistent. When things feel routine or heavy, desire often drops suddenly, long before they can explain why.",
      ],
    },
    partnership: {
      // document paragraph 1278
      underFlywheel:
        "Can be perceived as restless, easily bored, or “always needing more” (especially when novelty and flirt energy drop) The Spark Seeker’s primary “fuel” is tension and aliveness: feeling wanted in a way that has play, chase, and surprise. When they don’t receive that consistently, they often don’t simply become mildly under-stimulated, they become disengaged. They may bring up the same theme repeatedly (“It feels so routine,” “I miss the spark,” “We never flirt anymore”), not to criticize, but because the issue doesn’t resolve internally until the relationship feels alive again. To a partner, especially someone more security-driven, routine-oriented, or emotionally serious, this can look like an impossible standard: “No matter what I do, it’s not enough.” The tragedy is that the Spark Seeker usually isn’t asking for more and more; they’re asking for the right kind (play, pursuit, novelty, freedom). When they don’t know how to translate that into clear, doable requests, it can come out as chronic dissatisfaction, creating partner insecurity and defensiveness over time.",
    },
    growth: {
      // document paragraph 1288
      replaceOpener:
        "For the Spark Seeker, growth is rarely about becoming “more serious” or “more settled.” It’s about expanding range: staying true to the core erotic signature (spark, tension, play, novelty, freedom) while becoming less dependent on constant stimulation to access desire, speak needs, and stay connected when things feel ordinary.",
    },
  },
};

/** Inserts for this archetype, or null when the document covers none. */
export function getDocInserts(slug: string): Report2DocInserts | null {
  return report2DocInserts[slug] ?? null;
}

/**
 * The trimmed opening of the Reward chapter.
 *
 * The document's paragraph runs on into the full list of five neurochemicals,
 * which the section then renders again as its ranked "01 Dopamine - the lead"
 * list. Mark asked to keep the sentence only as far as "neurochemical systems",
 * so the prose introduces the list instead of duplicating it.
 */
export const REWARD_OPENING =
  "Sexual desire is not driven by libido alone. It emerges from the interaction of several neurochemical systems.";
