/**
 * Text the source document's comments ask for, placed where the comments say.
 *
 * Thirteen comments were added to "Copy of [OLD] Spark Seeker Report Template"
 * on 2026-08-26 between 19:20 and 20:29, each anchored on the passage it wants
 * moved and each naming its destination in the report ("Add this to the
 * Attachment Style section just under the rectangle that reads 'The Key'").
 * This module is those passages, verbatim, keyed by where they go.
 *
 * HOW THE MAPPING WAS ESTABLISHED, since it is not machine-readable. The Drive
 * API returns comment threads newest-first and their anchors in document order,
 * with no shared id. Twelve of the thirteen anchors were matched to a paragraph
 * range by their own text; the thirteenth (the risk-orientation one) spans a
 * paragraph break and was found by hand. The chronological order of the
 * comments then matched the document order of the anchors exactly, and every
 * one landed in the section its own comment names — thirteen for thirteen, with
 * section agreement on all of them. That agreement is the check.
 *
 * Universal vs per-archetype: every string here is Spark Seeker copy, so it is
 * keyed under that slug. Other archetypes get nothing and their sections render
 * as they do today.
 */

export interface Report2DocInserts {
  accel: {
    /**
     * The accelerator opening, above the "What opens you" / "What shuts you down"
     * columns, and the brakes conclusion, under the accelerator-led/brake-led
     * meter. Both were this chapter's Key Concepts until 2026-08-26, when Mark
     * asked for them to move into the card; they live here rather than in the
     * Key Concepts layer because that is what they now are — placed passages.
     */
    aboveColumns: string;
    underMeter: string;
  };
  beliefs: {
    /** Above the "Serve you / Box you in" columns. */
    intro: string;
    /** After the list, replacing "Most of these formed where attention arrived…". */
    afterList: string[];
  };
  attachment: {
    /** Under the "The Key" panel. */
    underKey: string[];
    /** Under "The Map", replacing "one dot shows your baseline…". */
    underMap: string[];
  };
  insecurities: {
    /** Above the cue graph, over "Where your sensitivity sits". */
    aboveGraph: string;
  };
  confidence: {
    /** Replaces the "Each dot is one of the 14 archetypes…" strip note. */
    replaceStripNote: string[];
  };
  reward: {
    /** Above the ranked "01 Dopamine · the lead" list. */
    aboveChemicals: string;
    /** Under the statistical element (comment parts 1 and 2). */
    underStats: string[];
  };
  energy: {
    /** Just after the "Depth replaces speed" panel. */
    afterDepth: string;
    /** Just after the energy curve. */
    afterGraph: string[];
  };
  curiosity: {
    /** Under the "Fit by relationship form" table of scores. */
    underFit: string;
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
      // document paragraphs 399, 400, 401 (comment parts 1 and 2)
      underStats: [
        "Their system is optimized for activation. Dopamine rises through pursuit, flirtation, uncertainty, and newness, creating a “charge” that pulls desire forward. Adrenaline can amplify arousal by adding edge, speed, and intensity. Oxytocin may follow, but usually after the spark has already ignited.",
        "Unlike oxytocin-driven archetypes, the Spark Seeker is not primarily motivated by bonding as the starting point. Too much emphasis on emotional heaviness, slow pacing, or relational processing can actually disrupt their reward loop by reducing stimulation.",
        "Because of this reward profile, Spark Seekers are often misunderstood as: unable to commit, “only horny when it’s new”, emotionally avoidant, addicted to excitement.",
      ],
    },
    energy: {
      // document paragraph 427
      afterDepth:
        "Their sexuality is often explosive and quickly charged. Energy builds through novelty, flirtation, and anticipation, and they can arrive already “sparked”, especially when there is chemistry, play, and something new in the air. When conditions are right, their desire spikes quickly, feels bright and exciting, and thrives on momentum.",
      // document paragraphs 446, 447
      afterGraph: [
        "The Spark Seeker has a high risk orientation.",
        "Their desire thrives in novelty, uncertainty, and energetic stimulation, not in predictability, routine, or overly controlled intimacy. Sexual risk, whether emotional (spontaneity, uncertainty, “will they want me?” tension) or sexual (trying something new, playful boldness, pushing variety), tends to activate arousal rather than shut it down.",
      ],
    },
    curiosity: {
      // document paragraph 511
      underFit:
        "When they feel free, desired, and unconfined, Spark Seekers can become surprisingly committed explorers. They may engage with fantasy, role play, new environments, or new sexual scripts, but typically in ways that preserve autonomy rather than deepen sameness. Rather than repeating one practice for years, they tend to rotate through experiences, finding depth through variety.",
    },
  },
};

/** Inserts for this archetype, or null when the document covers none. */
export function getDocInserts(slug: string): Report2DocInserts | null {
  return report2DocInserts[slug] ?? null;
}

/**
 * The four questions chapter 15 puts under "It answers questions like:".
 *
 * Carried because Mark asked for that sentence to open the Power chapter's Key
 * Concepts, and it ends on a colon. Without what the colon introduces it reads
 * as a broken sentence, so the document's own questions come with it.
 */
export const POWER_QUESTIONS: string[] = [
  "Do I feel most alive when leading or when yielding?",
  "Does desire grow through control, through surrender, or through mutual flow?",
  "Do I seek structure, responsiveness, safety, intensity, or exchange?",
  "Does power feel erotic, calming, threatening, or irrelevant?",
];

/**
 * The trimmed opening of the Reward chapter.
 *
 * The document's paragraph runs on into the full list of five neurochemicals,
 * which the section then renders again as its ranked "01 Dopamine · the lead"
 * list. Mark asked to keep the sentence only as far as "neurochemical systems",
 * so the prose introduces the list instead of duplicating it.
 */
export const REWARD_OPENING =
  "Sexual desire is not driven by libido alone. It emerges from the interaction of several neurochemical systems.";
