/**
 * Report V4 — page copy that is not per-archetype, and the free Part II summary each
 * archetype has (REPORT_V4_SUMMARY).
 *
 * Figma: "Report V4 — MOBILE" (1:165). Everything here is transcribed verbatim from
 * the frame, including its own typos, because this is a fidelity build and the copy
 * is Mark's to correct — see NOTE markers below.
 *
 * Per-archetype card copy lives separately in `data/report3-archetype-card.ts`.
 * Chapter teasers live in `data/report4-chapter-teasers.ts` (Sanjin's, 25.09); a
 * preview row with none still shows the frame's `[Teaser Text]`, whose single source
 * is `TEASER_PLACEHOLDER`.
 */

import { KNOWN_ARCHETYPES } from "@features/report/server/archetypeSlug";

/** The frame's own placeholder for the 17 unwritten chapter teasers (e.g. 1:871). */
export const TEASER_PLACEHOLDER = "[Teaser Text]";

export interface Report3PartHeading {
  /**
   * "Part 1" … "Part 6" — the part as the Snapshot's chips name it. Arabic since Mark's
   * 29.09 rework (1945090190; "Parts now dont have a roman number"), as the nav's.
   */
  eyebrow: string;
  /** The number the heading sets beside "Part", in Lora Bold and the brand gradient. */
  number: string;
  /** Upright serif segment. Empty when the whole title is the accent (Part 1). */
  lead: string;
  /** Italic segment. Violet on Parts 2–6, near-black on Part 1. */
  accent: string;
  /** Part 1 renders its accent in near-black rather than violet — 1:174. */
  tone?: "violet" | "ink";
  /** Part 1's is upright too: 1:174 sets "Welcome" in Lora Regular. */
  upright?: true;
  /**
   * Set the lead in italic as well. Only Part 2 does this: 1:486 draws "Your" in
   * italic ink beside the violet "Constellation", where Part 3's 1:852 keeps "How
   * your archetype" upright.
   */
  leadItalic?: true;
  /**
   * Parts 3–6 sit in a 185px box (1:852, 1:985, 38:1510, 1:1140) where Parts 1–2 use
   * the 148px stage (1:169, 1:486). The box once held a lede, "[Part Introductory
   * Text]"; the 01.10 sync dropped part introductions ("go straight into the
   * content") and Figma's boxes now hold only the heading.
   */
  tall?: true;
}

export const REPORT_V4_PARTS: readonly Report3PartHeading[] = [
  // 1:169 — no introduction paragraph; "Welcome" upright and near-black, not violet.
  { eyebrow: "Part 1", number: "1", lead: "", accent: "Welcome", tone: "ink", upright: true },
  // 1:486
  { eyebrow: "Part 2", number: "2", lead: "Your ", accent: "Constellation", leadItalic: true },
  // 1:852. Parts 3–6 are typed in lower case in their frames; the 02.10 sync's heading
  // rule (logic/titleCase.ts) capitalises them, and Figma keeps its old case.
  { eyebrow: "Part 3", number: "3", lead: "How Your Archetype ", accent: "Works", tall: true },
  // 1:990 — "Your " upright in ink, "Erotic Engine" in the accent.
  { eyebrow: "Part 4", number: "4", lead: "Your ", accent: "Erotic Engine", tall: true },
  // 38:1515
  { eyebrow: "Part 5", number: "5", lead: "How You ", accent: "Connect", tall: true },
  { eyebrow: "Part 6", number: "6", lead: "Your ", accent: "Edges", tall: true },
];

/**
 * The part headings the live report draws under `?v4=1`, keyed by the first section
 * of each part — the same keys as `REPORT_V3_PART_DIVIDER_BY_SECTION`.
 *
 * V4 puts "Welcome" in front as Part I, so everything V3 called Part I is Part II
 * here, and so on down. Borrowing the V3 map left the report with two Part I's.
 *
 * Part III is keyed on Typical Beliefs and Part IV on Accelerators & Brakes, because
 * V4 moves each of those chapters to the front of its part (REPORT_V4_CHAPTERS;
 * Fatih's calls on 2026-09-23, as Figma 1:849 and 334:521 draw them). The rest of
 * Figma's Parts III–VI regrouping is not done, so the other keys still follow V3's
 * order.
 */
export const REPORT_V4_PART_DIVIDER_BY_SECTION: Readonly<Record<string, Report3PartHeading>> = {
  core_archetype: REPORT_V4_PARTS[1]!,
  typical_beliefs: REPORT_V4_PARTS[2]!,
  typical_arousal_accelerators_turn_ons_of_the_core_archetype: REPORT_V4_PARTS[3]!,
  attachment_style: REPORT_V4_PARTS[4]!,
  typical_sexual_fantasy_amp_practice_tendencies: REPORT_V4_PARTS[5]!,
};

/**
 * How each part opens, as its frame draws it (review 26.09, "standardise the space
 * between things/sections"): the fading hairline "Seperator - Horizontal Line" (19px,
 * the line 18px down) above the heading, and the 44px "Seperator" under it before the
 * part's first block. Keyed like REPORT_V4_PART_DIVIDER_BY_SECTION; the values are the
 * frames' node ids, which ride on the rendered elements.
 */
export const REPORT_V4_PART_FRAME_BY_SECTION: Readonly<
  Record<string, { readonly rule: string; readonly sep: string }>
> = {
  core_archetype: { rule: "1:484", sep: "1:491" },
  typical_beliefs: { rule: "1:850", sep: "1:858" },
  typical_arousal_accelerators_turn_ons_of_the_core_archetype: { rule: "1:983", sep: "1:991" },
  attachment_style: { rule: "38:1508", sep: "38:1516" },
  typical_sexual_fantasy_amp_practice_tendencies: { rule: "1:1138", sep: "1:1146" },
};

/*
 * Part I copy — re-read from the frame on 2026-09-23, after Mark rewrote all three
 * blocks and added bold runs. A "\n" inside a run is a line break the frame sets
 * mid-paragraph; `V4Runs` renders it as <br>.
 */

/** Part 1 · Introduction — 1:175 / 1:184. */
export const REPORT_V4_INTRODUCTION: readonly (readonly Report3Run[])[] = [
  [
    { text: "Thank you for your trust and " },
    { weight: 700, text: "congratulations on having the courage to look inward." },
  ],
  [
    {
      text: "Many people grow up absorbing narratives about sexuality that create shame, confusion, or a sense of being “wrong.”\nWe offer you a different lens, with evidence-based insights rooted in compassion, context, and self-acceptance.",
    },
  ],
  [
    {
      text: "This report will help you understand why certain patterns feel familiar, why certain challenges keep repeating, ",
    },
    { weight: 700, text: "and what you can do, starting today, to improve." },
  ],
];

/** Part 1 · "What shaped this report" — 1:185 / 1:194. */
export const REPORT_V4_WHAT_SHAPED: readonly Report3Run[] = [
  { text: "To support self-understanding, we combine " },
  { weight: 700, text: "insights from multiple disciplines" },
  {
    text: " such as neuroscience, psychology, and relationship research, alongside decades of therapeutic experience.",
  },
];

/**
 * Part 1 · closing paragraph after the science deck — 1:479 / 1:480.
 *
 * `V3Methodology` renders this under `chrome="deck"`. It used to reuse its own V3
 * outro there, stripped of bold, because the frame drew these three paragraphs plain
 * with V3's wording; the frame now carries its own wording AND bold runs, so V4
 * keeps its own copy and the live V3 outro is untouched.
 *
 * The line once read "clear clear and understandable patterns" — a duplicated word
 * copied faithfully out of the frame with a note beside it. Mark found it on his
 * phone and fixed the frame himself (Figma comment 1937155741). Copying a typo out
 * of a design and writing a note about it is not the same as asking, so: ask, or fix.
 */
export const REPORT_V4_CLOSING: readonly (readonly Report3Run[])[] = [
  [
    {
      text: "We translate this knowledge into clear, understandable patterns that people can recognise in themselves.",
    },
  ],
  [
    { text: "This report is a " },
    { weight: 700, text: "psychometric approximation" },
    { text: ". It does not describe you in a fixed or absolute way, but highlights " },
    {
      weight: 700,
      text: "tendencies, patterns, and possible directions in your personality and sexual identity.",
    },
  ],
  [
    { text: "With that in mind, it's time to dive into your " },
    { weight: 700, text: "personalised report" },
    { text: "." },
  ],
];

/* ───────────────────────── Part II ───────────────────────── */

/** A weighted run inside a summary paragraph. The frame mixes 400 / 700 / 800
 * within single paragraphs (1:742), so runs are the only faithful model. */
export interface Report3Run {
  text: string;
  weight?: 400 | 700 | 800;
  /** Plus Jakarta Sans Italic. The learn-more article (153:2277) sets quoted
   * beliefs in italic, which weight alone cannot express. */
  italic?: true;
  /** Scrambled stand-in text: the tail of a paywall's ramp paragraph (splitRamp).
   * The page finds it so the fade band never shows it lightly blurred (useRampFit). */
  veiled?: true;
}

export interface Report3Summary {
  /** 1:742 — five or six paragraphs, the first opening on an extra-bold lead. */
  paragraphs: readonly (readonly Report3Run[])[];
  /** 1:744 — an extra-bold closing line. The frame dropped it on 2026-09-24. */
  closer?: string;
}

/**
 * Part II · "Summary of the <Archetype>" — 1:736.
 *
 * Spark Seeker's is the frame's; the other 13 are Sanjin's summary docs (03.10). Free copy:
 * no doc marks a Paywall in it, so it may live in this client-imported module.
 * `missingReport3Summary()` names any archetype without one, the same way
 * `missingReport3Blurbs()` and `missingReport3CardCopy()` do, so a gap closes loudly.
 */
export const REPORT_V4_SUMMARY: Readonly<Record<string, Report3Summary>> = {
  // Re-read from 1:741 on 2026-09-24, after Mark updated the text and moved its
  // emphasis ("We have updated this text. Please push to staging", 1939884155). The
  // frame no longer draws the closing line 1:744.
  "Spark Seeker": {
    paragraphs: [
      [
        {
          weight: 800,
          text: "The Spark Seeker experiences sexuality primarily as a space for aliveness, chemistry, and playful charge.",
        },
        {
          text: " For them, desire begins in anticipation, energy, and the feeling that something exciting is unfolding. When there is flirtation, novelty, and a sense of “spark,” their erotic system ignites quickly and vividly.",
        },
      ],
      [
        { text: "They are " },
        { weight: 700, text: "lively, charismatic, and pleasure-forward lovers" },
        { text: " who value " },
        { weight: 700, text: "teasing, spontaneity, and emotional lightness" },
        {
          text: " over heaviness or routine. Sexuality is meaningful to them not as reassurance or devotion, but as a way to feel energized, wanted, and fully awake in the moment. Fun, novelty, and momentum are central to their arousal.",
        },
      ],
      [
        { text: "At their best, Spark Seekers create intimacy that feels " },
        { weight: 700, text: "electric, playful, and creatively alive for both partners." },
        {
          text: " Their presence invites laughter, confidence, and erotic adventure. However, because their desire is closely tied to stimulation and freshness, they ",
        },
        {
          weight: 700,
          text: "may struggle when sex becomes predictable, duty-like, or emotionally dense.",
        },
        {
          text: " In such moments, arousal can drop quickly, not because attraction is gone, but because their system stops feeling “charged.”",
        },
      ],
      [
        { text: "Spark Seekers may " },
        {
          weight: 800,
          text: "hesitate to slow down or go deeper emotionally, fearing it will dull the spark or trap them in expectations.",
        },
        {
          text: " This can lead to repeated cycles of intensity followed by restlessness, or to disconnection when a partner asks for more consistency than they naturally offer. They may also worry that if they are not exciting, they will lose desirability or feel bored and stuck.",
        },
      ],
      [
        {
          weight: 800,
          text: "Growth for the Spark Seeker lies in learning to sustain desire beyond novelty,",
        },
        {
          text: " building depth without losing play, communicating needs for variety without shame, and developing the capacity to enjoy calm intimacy without interpreting it as “dead.”",
        },
      ],
      [
        {
          text: "When supported and understood, the Spark Seeker’s sexuality becomes a powerful source of joy, creativity, and lasting erotic vitality that can keep relationships feeling bright over time.",
        },
      ],
    ],
  },
  // Sanjin's summary docs (03.10), one per archetype. They mark bold only: each first
  // paragraph's opening bold run takes Spark Seeker's lead weight (800), every other 700.
  "Analytical Sexualist": {
    paragraphs: [
      [
        {
          weight: 800,
          text: "The Analytical Sexualist experiences sexuality as something that becomes more rewarding through understanding, learning, and refinement.",
        },
        {
          text: " Desire is often strengthened by clarity: knowing what works, why it works, and how pleasure can be created more intentionally. Curiosity, feedback, and the sense of becoming more skilled can themselves become part of the erotic experience.",
        },
      ],
      [
        { text: "They tend to be " },
        { weight: 700, text: "thoughtful, observant, and improvement-oriented lovers" },
        {
          text: " who pay close attention to technique, patterns, and their partner’s responses. Rather than relying entirely on instinct, they may enjoy asking questions, exploring new methods, and making precise adjustments. Sexuality becomes a space where curiosity and competence can translate into real pleasure.",
        },
      ],
      [
        { text: "At their best, Analytical Sexualists bring " },
        { weight: 700, text: "attention, openness, and a genuine willingness to learn" },
        {
          text: " into intimacy. They can become exceptionally attuned partners because they notice details and take feedback seriously. However, the same mind that helps them understand pleasure can sometimes interfere with experiencing it. When attention shifts toward evaluating performance or figuring out what should happen next, they may become mentally busy instead of physically absorbed.",
        },
      ],
      [
        {
          text: "This becomes especially difficult when sex feels ambiguous or unpredictable. Without clear signals, they may search for explanations, worry about doing something incorrectly, or retreat further into analysis. ",
        },
        {
          weight: 700,
          text: "Underneath the drive to understand can be a deeper concern about getting it wrong",
        },
        { text: ", appearing inexperienced, or not being naturally intuitive enough." },
      ],
      [
        {
          text: "Their deeper challenge is therefore not thinking itself, but the belief that understanding must come before surrender. Pleasure does not always provide clear instructions, and intimacy cannot always be solved in advance.",
        },
      ],
      [
        {
          weight: 700,
          text: "Growth for the Analytical Sexualist lies in allowing knowledge and instinct to work together.",
        },
        {
          text: " As the pressure to perform correctly softens, their curiosity can remain a strength without becoming constant evaluation, creating sexuality that feels both intelligently attuned and genuinely lived.",
        },
      ],
    ],
  },
  "Authority Conductor": {
    paragraphs: [
      [
        {
          weight: 800,
          text: "The Authority Conductor experiences sexuality primarily as a space for power, direction, and intentional control.",
        },
        {
          text: " Desire comes alive when there is a clear dynamic to shape: tension to build, a rhythm to set, and a partner who willingly responds to their lead. Knowing where the interaction is going, and having influence over how it unfolds, creates much of the erotic charge.",
        },
      ],
      [
        { text: "They are " },
        { weight: 700, text: "decisive, commanding, and highly intentional lovers" },
        {
          text: " who often enjoy structure, anticipation, and clearly defined roles. Rather than waiting for chemistry to happen, they prefer to create it through timing, instructions, restraint, rewards, or carefully negotiated power dynamics. Sexuality becomes a place where confidence and authority can be expressed directly.",
        },
      ],
      [
        { text: "At their best, Authority Conductors can create intimacy that feels " },
        { weight: 700, text: "focused, intense, and deeply containing" },
        {
          text: ". Their certainty can help a partner relax into surrender because someone else is confidently holding the structure. The same strength can become limiting, however, when control stops being part of the erotic experience and starts feeling necessary for safety.",
        },
      ],
      [
        {
          text: "Underneath this preference for authority may be a deeper discomfort with being exposed, dependent, or unsure. ",
        },
        { weight: 700, text: "Leading can feel safer than needing." },
        {
          text: " When vulnerability begins to feel like losing status or giving someone else too much power, they may tighten control, become less flexible, or struggle to receive without first managing the conditions.",
        },
      ],
      [
        {
          text: "The deeper pattern is not simply a desire to dominate, but a desire to remain secure while desire becomes intense. Growth lies in ",
        },
        {
          weight: 700,
          text: "keeping power transparent and consensual while becoming less dependent on control for emotional protection",
        },
        {
          text: ". As trust deepens, authority can remain a genuine source of pleasure without having to defend against softness, uncertainty, or receiving. This allows them to lead from desire rather than self-protection, while leaving more room for their partner’s needs, reactions, and influence to shape the experience too.",
        },
      ],
    ],
  },
  "Curious Apprentice": {
    paragraphs: [
      [
        {
          weight: 800,
          text: "The Curious Apprentice experiences sexuality primarily as a space for discovery, learning, and growth.",
        },
        {
          text: " Desire is often strongest when there is something new to understand, practice, or explore together. Clear feedback, patient guidance, and the feeling of making progress can turn uncertainty itself into excitement.",
        },
      ],
      [
        { text: "They tend to be " },
        { weight: 700, text: "curious, open, and highly receptive lovers" },
        {
          text: ", willing to ask questions and experiment rather than pretend they already know everything. Sexuality becomes a process of learning what works, both for themselves and for a partner. They often thrive when exploration feels collaborative: trying something, noticing the response, talking about it, and adjusting together.",
        },
      ],
      [
        { text: "At their best, Curious Apprentices bring " },
        { weight: 700, text: "humility, attentiveness, and genuine willingness to grow" },
        {
          text: " into intimacy. They can become remarkably skilled partners because they pay attention and remain open to feedback. But the same desire to learn can become self-consciousness when they feel they are supposed to already know what to do. Instead of experiencing the moment, attention can shift toward ",
        },
        { italic: true, text: "“Am I doing this right?”" },
      ],
      [
        {
          text: "This vulnerability can make criticism, impatience, or comparison especially disruptive. When sexuality starts to feel like a test of competence, they may hesitate to initiate, rely heavily on a partner for direction, or avoid experiences where they fear getting something wrong. ",
        },
        { weight: 700, text: "Curiosity can quietly turn into performance pressure." },
      ],
      [
        {
          text: "Underneath this pattern is often a tension between wanting guidance and wanting to feel capable in their own right. Learning feels safe when mistakes are allowed; it becomes threatening when not knowing is interpreted as inadequacy.",
        },
      ],
      [
        { text: "Growth for the Curious Apprentice lies in " },
        { weight: 700, text: "moving from student to co-creator" },
        {
          text: ", keeping their openness to learning while developing greater trust in their own preferences, instincts, and initiative. Over time, sexuality can become not only something they are learning how to do, but something they increasingly feel confident shaping for themselves.",
        },
      ],
    ],
  },
  "Emotional Voyeur": {
    paragraphs: [
      [
        {
          weight: 800,
          text: "The Emotional Voyeur experiences sexuality primarily through imagination, observation, and the emotional tension of being close without being fully exposed.",
        },
        {
          text: " Desire often begins before direct participation, in watching, anticipating, imagining, or quietly absorbing what is unfolding. The space between themselves and the action can intensify arousal rather than diminish it.",
        },
      ],
      [
        { text: "They tend to be " },
        { weight: 700, text: "reserved, observant, and inwardly imaginative lovers" },
        {
          text: " who may feel more sexually expressive in fantasy than through direct initiation. Watching a partner experience pleasure, building an erotic scenario in their mind, or feeling invited into something without pressure can create a strong sense of intimacy. For them, distance is not necessarily disconnection. It can be part of what makes desire feel safe and compelling.",
        },
      ],
      [
        { text: "At their best, Emotional Voyeurs bring " },
        { weight: 700, text: "attentiveness, sensitivity, and a rich inner erotic world" },
        {
          text: " into intimacy. Their ability to notice subtle reactions and become absorbed in another person’s pleasure can make sexuality feel emotionally charged even without constant action or intensity.",
        },
      ],
      [
        {
          text: "The same sensitivity can become difficult when attention turns directly toward them. Being watched, evaluated, expected to perform, or pushed into immediate participation may make self-consciousness replace arousal. Retreating into fantasy can then feel easier than remaining present in a situation where they feel exposed.",
        },
      ],
      [
        { text: "Over time, this can create a deeper pattern: " },
        {
          weight: 700,
          text: "desire feels strongest when vulnerability can be experienced from a protected distance.",
        },
        {
          text: " Fantasy and observation offer erotic closeness while preserving control over how visible they become. The challenge is not voyeurism itself, but when safety becomes so dependent on remaining outside the experience that shared intimacy becomes harder to enter.",
        },
      ],
      [
        { text: "Growth lies in discovering that " },
        { weight: 700, text: "being involved does not have to mean being put on display." },
        {
          text: " As safety and confidence deepen, observation and fantasy can remain genuine sources of pleasure while becoming bridges into shared experience, rather than places they need to disappear into.",
        },
      ],
    ],
  },
  "Explorer of Edges": {
    paragraphs: [
      [
        {
          weight: 800,
          text: "The Explorer of Edges experiences sexuality as a space for intensity, transformation, and discovering what lies beyond the familiar.",
        },
        {
          text: " Desire often comes alive when an experience carries psychological charge: something new, powerful, taboo, demanding, or immersive enough to pull them fully into the moment. For them, erotic intensity is not simply about stimulation. It can create a sense of expansion, release, and access to parts of themselves that ordinary life rarely reaches.",
        },
      ],
      [
        { text: "They tend to be " },
        {
          weight: 700,
          text: "direct, curious, adventurous, and unusually open to exploring the edges of desire.",
        },
        {
          text: " Power exchange, strong sensation, darker aesthetics, elaborate roleplay, or unfamiliar experiences may appeal because they create total engagement. When trust is strong, they can bring remarkable honesty and courage to sexuality, naming desires others might hide and creating experiences that feel deeply intentional rather than merely conventional.",
        },
      ],
      [
        { text: "At their best, Explorers of Edges combine " },
        {
          weight: 700,
          text: "bold experimentation with presence, trust, and psychological depth.",
        },
        {
          text: " They can make sexuality feel like a place where both partners discover something new about themselves. Yet the same appetite for intensity can make gentler or more predictable experiences feel comparatively muted. Over time, they may need increasingly strong psychological or sensory charge to reach the same level of engagement.",
        },
      ],
      [
        { text: "Beneath this can sit a more vulnerable question: " },
        { weight: 700, text: "Will the full intensity of who I am be accepted?" },
        {
          text: " Fear of being judged, restricted, or seen as “too much” can make compatible spaces feel especially important. At the same time, when intensity becomes the main route to feeling fully alive, calm can begin to register as emptiness rather than simply a different kind of experience.",
        },
      ],
      [
        { text: "Growth lies not in becoming less intense, but in " },
        {
          weight: 700,
          text: "making intensity something they can choose rather than something they must continually escalate.",
        },
        {
          text: " When exploration exists alongside emotional grounding, clear boundaries, accountability, and an ability to remain engaged outside the peak, their sexuality can stay adventurous without needing every experience to push further than the last.",
        },
      ],
    ],
  },
  "Loyal Ritualist": {
    paragraphs: [
      [
        {
          weight: 800,
          text: "The Loyal Ritualist experiences sexuality primarily as a space for stability, familiarity, and dependable connection.",
        },
        {
          text: " Desire grows through trust, repetition, and the comfort of knowing what to expect. Familiar touch, shared routines, and a steady rhythm allow their erotic system to relax into pleasure rather than having to constantly adapt to something new.",
        },
      ],
      [
        { text: "They are " },
        { weight: 700, text: "grounded, consistent, and deeply loyal lovers" },
        {
          text: " who often find meaning in the rituals a couple builds together. A familiar sequence, a regular night for intimacy, or simply knowing how a partner likes to be touched can become more valuable with time, not less. For them, repetition can create depth because each return strengthens the sense of ",
        },
        { italic: true, text: "“this is ours.”" },
      ],
      [
        { text: "At their best, Loyal Ritualists create intimacy that feels " },
        { weight: 700, text: "safe, reliable, and quietly devoted" },
        {
          text: ". They bring continuity to a sexual relationship and can make a partner feel deeply known. However, the same preference for stability can make unfamiliar experiences feel disruptive rather than exciting. Pressure to constantly experiment may create anxiety or self-consciousness instead of curiosity.",
        },
      ],
      [
        { text: "Beneath this resistance can be a deeper fear that " },
        { weight: 700, text: "change means something is wrong with what already works" },
        {
          text: ". They may worry that preferring familiarity makes them boring, outdated, or less sexually capable than more adventurous partners. This can make them hold more tightly to established patterns precisely when a relationship begins asking for flexibility.",
        },
      ],
      [
        { text: "Growth lies not in abandoning ritual, but in discovering that " },
        { weight: 700, text: "security and change do not have to compete" },
        {
          text: ". Small variations can exist inside a trusted structure, allowing curiosity to grow without sacrificing the stability that makes desire possible.",
        },
      ],
      [
        {
          text: "When this balance develops, the Loyal Ritualist can preserve what they value most while allowing intimacy to evolve, creating a sexual connection that feels ",
        },
        { weight: 700, text: "both dependable and alive over time." },
      ],
    ],
  },
  "Minimalist Companion": {
    paragraphs: [
      [
        {
          weight: 800,
          text: "The Minimalist Companion experiences sexuality primarily as a space for comfort, closeness, and quiet connection.",
        },
        {
          text: " Desire tends to emerge when life feels calm, expectations are low, and there is enough familiarity to simply be present with another person. Rather than being pulled toward intensity or novelty, their erotic system responds to safety, ease, and the feeling that nothing needs to be performed.",
        },
      ],
      [
        { text: "They are " },
        { weight: 700, text: "gentle, undemanding, and low-pressure lovers" },
        {
          text: " who often prefer simple affection, familiar rhythms, and intimacy that fits naturally into everyday life. Sex does not need to be elaborate to feel meaningful. A soft touch that becomes more, an unhurried evening together, or familiar sex in a comfortable setting may offer exactly what they value: ",
        },
        { weight: 700, text: "connection without complication" },
        { text: "." },
      ],
      [
        {
          text: "At their best, Minimalist Companions bring a sense of steadiness and acceptance into intimacy. There is little need to chase the next experience or turn sex into a performance. However, because their desire is often quieter and less novelty-driven, they may begin to question themselves when surrounded by expectations that sexuality should be frequent, adventurous, or intensely passionate.",
        },
      ],
      [
        { weight: 700, text: "Pressure tends to make desire retreat rather than grow." },
        {
          text: " When a partner repeatedly asks for more excitement, more initiation, or more experimentation, sex can start to feel like a test they are failing. They may accommodate for a while rather than explain their limits, eventually becoming depleted and withdrawing further.",
        },
      ],
      [
        { text: "The deeper challenge is therefore not simplicity itself, but " },
        { weight: 700, text: "allowing simplicity to become silence or resignation" },
        {
          text: ". Growth lies in trusting that a quieter erotic style is valid while becoming more able to express what feels good, name what does not, and remain open to small expansions that feel genuinely inviting rather than imposed.",
        },
      ],
      [
        {
          text: "When this balance develops, the Minimalist Companion can create sexuality that is ",
        },
        {
          weight: 700,
          text: "calm without becoming stagnant, familiar without becoming disconnected, and simple without feeling like less.",
        },
      ],
    ],
  },
  "Quiet Withdrawer": {
    paragraphs: [
      [
        {
          weight: 800,
          text: "The Quiet Withdrawer experiences sexuality primarily through the need for safety, spaciousness, and freedom from pressure.",
        },
        {
          text: " Desire is most likely to emerge when nothing is being demanded of them and they feel certain that they can slow down, stop, or say no without disappointing their partner. Gentle affection, calm presence, and low-intensity environments give their erotic system room to open.",
        },
      ],
      [
        { text: "They tend to be " },
        { weight: 700, text: "reserved, cautious, and receptive rather than initiating" },
        {
          text: ", often preferring closeness that develops gradually instead of explicit pursuit or high sexual intensity. Affection, companionship, and simply spending time together may feel more natural than actively expressing sexual wants. When desire does appear, it can be subtle and easily disrupted by feeling watched, evaluated, hurried, or expected to perform.",
        },
      ],
      [
        { text: "At their best, Quiet Withdrawers bring a " },
        { weight: 700, text: "soft, undemanding quality to intimacy" },
        {
          text: ". They can appreciate tenderness, patience, quiet physical connection, and forms of closeness that do not need to constantly become more intense. However, because pressure so easily activates withdrawal, even ordinary expectations around sex, communication, or initiation can make desire disappear before it has had time to develop.",
        },
      ],
      [
        {
          text: "When overwhelmed, they may become quiet, retreat internally, avoid sexual conversations, or distance themselves from situations that could lead to expectations. ",
        },
        {
          weight: 700,
          text: "What looks like disinterest can sometimes be a protective response to feeling that engagement will create demands they are unsure they can meet.",
        },
        {
          text: " Over time, this can leave partners feeling rejected while the Quiet Withdrawer feels increasingly scrutinized and hesitant to engage.",
        },
      ],
      [
        { text: "The deeper pattern is often one of " },
        { weight: 700, text: "protecting safety by becoming less visible" },
        {
          text: ". Expressing desire, boundaries, or discomfort can feel risky, so withdrawal becomes easier than revealing what is happening internally. Yet the same strategy that reduces pressure can also make genuine wants harder for both partners to recognize.",
        },
      ],
      [
        { text: "Growth lies in developing a stronger sense that " },
        { weight: 700, text: "closeness does not require surrendering agency" },
        {
          text: ". As safety, self-expression, and confidence in boundaries increase, sexuality can become less about avoiding what feels overwhelming and more about recognizing, expressing, and acting on what they genuinely want.",
        },
      ],
    ],
  },
  "Radiant Performer": {
    paragraphs: [
      [
        {
          weight: 800,
          text: "The Radiant Performer experiences sexuality primarily as a space for expression, admiration, and feeling vividly desired.",
        },
        {
          text: " For them, desire often comes alive through attention: the look in a partner’s eyes, an enthusiastic reaction, a compliment, or the feeling of being captivating. When they feel seen and wanted, their erotic confidence can rise quickly.",
        },
      ],
      [
        { text: "They are " },
        { weight: 700, text: "expressive, charismatic, and visually oriented lovers" },
        {
          text: " who often enjoy turning sexuality into an experience. Seduction, presentation, playful performance, and strong reactions can all intensify arousal. Sexuality is not only something they feel internally; part of its charge comes from seeing their effect on another person and feeling that their desirability is being reflected back to them.",
        },
      ],
      [
        { text: "At their best, Radiant Performers bring " },
        { weight: 700, text: "confidence, creativity, and magnetic presence" },
        {
          text: " into intimacy. They can make a partner feel swept into something exciting and memorable. Yet the same responsiveness to admiration can become vulnerable when feedback grows quieter. A distracted partner, subtle reactions, or the familiarity of a long-term relationship may feel less like ordinary variation and more like no longer being seen.",
        },
      ],
      [
        {
          text: "Because sexual confidence can become closely tied to the response they receive, ",
        },
        { weight: 700, text: "performing well may sometimes compete with simply feeling." },
        {
          text: " Attention can shift toward appearance, impact, or whether the other person seems impressed, making awkwardness, vulnerability, or quieter pleasure harder to relax into.",
        },
      ],
      [
        { text: "The deeper pattern is not simply a desire for attention. " },
        { weight: 700, text: "Being visibly desired can become evidence of sexual worth." },
        {
          text: " When admiration is abundant, confidence expands; when it disappears, self-doubt can enter quickly.",
        },
      ],
      [
        {
          text: "Growth lies in keeping the Radiant Performer’s expressive spark while learning that sexuality does not always have to be ",
        },
        { weight: 700, text: "something they perform well or use to prove their desirability." },
        {
          text: " The more they can stay connected to their own pleasure even when the reaction is quieter, the less their confidence depends on constant applause, and the more freely their natural expressiveness can come through.",
        },
      ],
    ],
  },
  "Relational Nurturer": {
    paragraphs: [
      [
        {
          weight: 800,
          text: "The Relational Nurturer experiences sexuality primarily as a space for care, emotional closeness, and mutual safety.",
        },
        {
          text: " For them, desire often grows through feeling connected, trusted, and emotionally attuned to a partner. Warmth, vulnerability, affectionate touch, and the sense that both people are genuinely caring for one another can open the door to arousal.",
        },
      ],
      [
        { text: "They tend to be " },
        { weight: 700, text: "gentle, attentive, and deeply responsive lovers" },
        {
          text: " who naturally notice what helps a partner relax, feel valued, and open up. Sexuality can become an extension of that care: a way to soothe, reconnect, repair, and communicate affection through the body. Giving pleasure can be especially rewarding because their partner’s enjoyment and emotional softening reinforce their own sense of connection.",
        },
      ],
      [
        { text: "At their best, Relational Nurturers create intimacy that feels " },
        { weight: 700, text: "safe, generous, emotionally present, and deeply restorative" },
        {
          text: ". Their patience and sensitivity can make partners feel remarkably seen and accepted. Yet the same instinct to care can become a vulnerability when attention consistently flows in one direction. They may focus so strongly on a partner’s feelings or pleasure that their own desire becomes difficult to notice, express, or receive.",
        },
      ],
      [
        { text: "Over time, sexuality can quietly become tied to being needed. " },
        {
          weight: 700,
          text: "If being caring becomes the main way they experience their value in a relationship, receiving can feel more vulnerable than giving.",
        },
        {
          text: " They may overextend themselves, hesitate to voice frustration, or remain in the caretaker role even when it leaves them depleted. Desire can then fade beneath emotional labor rather than disappearing because closeness no longer matters.",
        },
      ],
      [
        { text: "Growth lies in allowing intimacy to become more mutual: " },
        { weight: 700, text: "remaining caring without making care the price of being loved." },
        {
          text: " As giving and receiving become more balanced, the Relational Nurturer can discover a sexuality in which they are not only a source of safety and pleasure, but someone equally free to want, receive, and be cared for.",
        },
      ],
    ],
  },
  "Sensual Connector": {
    paragraphs: [
      [
        {
          weight: 800,
          text: "The Sensual Connector experiences sexuality primarily as a space for closeness, presence, and deep sensory connection.",
        },
        {
          text: " Desire tends to emerge when they feel emotionally safe, cared for, and genuinely connected to the person they are with. Rather than switching on instantly, their arousal often builds through anticipation, affectionate touch, trust, and the feeling that both people are fully present.",
        },
      ],
      [
        { text: "They are " },
        { weight: 700, text: "warm, attentive, and deeply embodied lovers" },
        {
          text: " who value slowness, tenderness, and emotional attunement. Extended touch, kissing, eye contact, shared vulnerability, and simply taking time can matter as much as any particular sexual act. For them, pleasure often becomes richer when physical sensation and emotional connection reinforce one another.",
        },
      ],
      [
        { text: "At their best, Sensual Connectors create intimacy that feels " },
        { weight: 700, text: "safe, immersive, affectionate, and deeply connected" },
        {
          text: ". Their sensitivity to a partner’s emotions and body can make sex feel unusually attentive and mutual. However, the same sensitivity means that conflict, emotional distance, pressure, or distraction can quickly interrupt desire. When connection feels unsettled, their body may struggle to open sexually even when attraction remains.",
        },
      ],
      [
        {
          text: "Because closeness carries so much erotic weight, moments of distance can sometimes feel larger than they are. A partner being withdrawn, less affectionate, or temporarily less available may be experienced not only as distance, but as a sign that the bond itself is weakening. This can lead to overthinking, waiting for reassurance, or suppressing needs to preserve harmony.",
        },
      ],
      [
        {
          weight: 700,
          text: "Growth lies in keeping emotional depth without making connection the sole condition for desire.",
        },
        {
          text: " Developing greater erotic autonomy, expressing needs more directly, and allowing room for play or novelty can make sexuality more flexible without sacrificing the closeness that matters.",
        },
      ],
      [
        {
          text: "When this balance develops, the Sensual Connector’s sexuality becomes a powerful capacity for ",
        },
        { weight: 700, text: "pleasure, trust, tenderness, and deeply felt intimacy" },
        { text: ", where connection supports desire without having to carry its entire weight." },
      ],
    ],
  },
  "Spiritual Lover": {
    paragraphs: [
      [
        {
          weight: 800,
          text: "The Spiritual Lover experiences sexuality primarily as a space for meaning, connection, and transcendence.",
        },
        {
          text: " Desire comes alive when sex feels emotionally significant, deeply present, and connected to something larger than physical pleasure alone. When there is trust, vulnerability, and a sense of genuine union, their erotic system can open slowly but powerfully.",
        },
      ],
      [
        { text: "They are " },
        { weight: 700, text: "reflective, emotionally attuned, and depth-oriented lovers" },
        {
          text: " who are often drawn to slow touch, eye contact, breath, ritual, and sustained presence. Sexuality is meaningful not simply because of what happens physically, but because of what the experience seems to express: ",
        },
        { italic: true, text: "we are truly here with each other." },
        {
          text: " Their desire is therefore especially sensitive to emotional and relational alignment.",
        },
      ],
      [
        { text: "At their best, Spiritual Lovers create intimacy that feels " },
        { weight: 700, text: "tender, immersive, and profoundly connected" },
        {
          text: ". They can bring patience, vulnerability, and unusual presence into sex, allowing an encounter to become more than a sequence of sexual acts. Yet the same sensitivity to meaning can make ordinary, playful, or purely physical sex feel less compelling.",
        },
      ],
      [
        {
          text: "Because depth matters so much, they may begin to expect sex to feel significant before they can fully surrender to it. Routine, unresolved tension, emotional distance, or a partner who approaches sex more casually can weaken desire. They may also idealize complete union, making normal moments of distraction, awkwardness, or difference feel more disappointing than they need to.",
        },
      ],
      [
        { text: "The deeper pattern is a tendency to " },
        {
          weight: 700,
          text: "link meaningful sex with meaningful connection so closely that simple pleasure can become undervalued",
        },
        {
          text: ". Growth lies in expanding rather than abandoning this depth: allowing sexuality to be sacred without always needing to feel profound, and making room for humor, raw physical desire, and everyday pleasure alongside emotional and spiritual connection. When these sides come together, ",
        },
        {
          weight: 700,
          text: "sex can remain deeply meaningful without carrying the burden of having to transcend ordinary life every time.",
        },
      ],
    ],
  },
  "Tender Devotee": {
    paragraphs: [
      [
        {
          weight: 800,
          text: "The Tender Devotee experiences sexuality primarily as a space for reassurance, acceptance, and feeling deeply wanted.",
        },
        {
          text: " Desire tends to open when they feel emotionally safe, appreciated, and certain that they are pleasing their partner. Warm praise, affectionate touch, and clear signs of approval can quiet self-doubt and allow them to relax into intimacy.",
        },
      ],
      [
        { text: "They are often " },
        { weight: 700, text: "gentle, attentive, and deeply responsive lovers" },
        {
          text: " who naturally tune into a partner’s preferences and reactions. Rather than pushing their own agenda, they may find pleasure in giving, adapting, and being guided. Sex can feel especially meaningful when it communicates, ",
        },
        { italic: true, text: "“You are wanted. You are enough. I am happy with you.”" },
      ],
      [
        { text: "At their best, Tender Devotees bring " },
        { weight: 700, text: "care, devotion, sensitivity, and emotional generosity" },
        {
          text: " into intimacy. They notice subtle shifts in a partner and often work hard to create an experience the other person will enjoy. Yet this same sensitivity can become difficult when attention moves away from their own body and toward constant monitoring: ",
        },
        {
          italic: true,
          text: "Am I doing this right? Are they enjoying it? Have I disappointed them?",
        },
      ],
      [
        {
          text: "Because approval carries so much emotional weight, criticism, ambiguity, or withdrawal can quickly affect desire. They may hide preferences, struggle to say no, or agree to experiences they do not genuinely want because rejection feels more threatening than self-silencing. Over time, ",
        },
        {
          weight: 700,
          text: "the wish to feel loved can become entangled with the need to perform loveability",
        },
        {
          text: ", making it harder to distinguish genuine desire from the urge to secure reassurance.",
        },
      ],
      [
        { text: "Growth lies in allowing intimacy to become a place where " },
        { weight: 700, text: "their own desire matters as much as their partner’s response" },
        {
          text: ". As self-worth becomes less dependent on constant approval, tenderness no longer has to be earned through pleasing. The Tender Devotee can remain caring and responsive while becoming more honest about what they want, what they do not want, and what actually feels good to them.",
        },
      ],
    ],
  },
};

/** Archetypes still waiting on a Part II summary. Asserted by a test. */
export function missingReport3Summary(): string[] {
  return KNOWN_ARCHETYPES.filter((name) => !REPORT_V4_SUMMARY[name]);
}

/** Part II · the Core Archetype heading's lede — 1:580. */
export const REPORT_V4_CORE_ARCHETYPE_LEDE: readonly Report3Run[] = [
  { text: "The following archetype is your " },
  { weight: 700, text: "core archetype " },
  { text: "- the highest probability match of all 14. " },
];

/**
 * Part II · the three highest-scoring archetypes — 1:493.
 *
 * The frame draws 43.4 / 39.5 / 36.2. `V3TopThree` already renders this section and
 * takes exactly this shape, so it is reused rather than rebuilt.
 */
export const REPORT_V4_TOP_THREE: Readonly<Record<string, number>> = {
  "Spark Seeker": 43.4,
  "Explorer of Edges": 39.5,
  "Emotional Voyeur": 36.2,
};

/** Part II · the top-three section's heading — 1:494 (Lora 20/24, -0.8px). Mark
 * capitalised "Highest" and "Scoring" on 2026-09-24 (comment 1939883544). */
export const REPORT_V4_TOP_THREE_HEADING = "3 Highest Scoring Archetypes";

/** Part II · its lede — 1:496. Two paragraphs, one bold run. */
export const REPORT_V4_TOP_THREE_LEDE: readonly (readonly Report3Run[])[] = [
  [{ text: "No one fits a single sexual personality or archetype." }],
  [
    { text: "These are your " },
    { weight: 700, text: "top 3 archetypes out of 14," },
    { text: " ranked by how closely they match your profile." },
  ],
];

/* ───────────────────────── Parts III–VI ───────────────────────── */

/** The frame's placeholder for an expanded chapter's body — 1:860, distinct from
 * the collapsed rows' `[Teaser Text]`. Also unwritten. */
export const CHAPTER_COPY_PLACEHOLDER = "[Chapter Copy]";

export interface Report3Chapter {
  title: string;
  /**
   * The section id this chapter maps to in `data/report-general.ts`, taken from
   * REPORT_V3_CHAPTERS (reportV3Nav.ts:30-75) rather than re-derived. Absent only
   * where the frame draws a chapter that has no section row at all.
   */
  id?: string;
  /**
   * Gate against a DIFFERENT section, for chapters with no premium row of their
   * own. Same indirection as ReportV3NavPart.items (reportV3Nav.ts:141, :168-170).
   */
  gateId?: string;
  /** Which of the frame's two placeholders this row carries. */
  body: "teaser" | "chapter";
  /**
   * Most rows read "<Chapter> / of the <Archetype>", but three do not: Your Sexual
   * Stage (1:1050), Reading Recommendations (1:1161) and Other Archetypes (1:1172)
   * are drawn as a plain title. Verified against 1:1161's own design context.
   */
  suffix?: false;
}

/**
 * Part III · "How your archetype works" — 1:849.
 *
 * Every body is a placeholder in the frame, so every body is a placeholder here.
 * `1:860` is the one instance of the component's default variant and carries
 * `[Chapter Copy]`; the other four are overridden frames carrying `[Teaser Text]`.
 * Visually they are identical — same chevron rotation, same serif body.
 */
export const REPORT_V4_PART3_CHAPTERS: readonly Report3Chapter[] = [
  { title: "Typical Beliefs", id: "typical_beliefs", body: "chapter" }, // 1:860
  { title: "Core Insecurities", id: "core_insecurities", body: "teaser" }, // 1:862
  { title: "Confidence Level", id: "confidence_level", body: "teaser" }, // 1:873
  { title: "Power Orientation", id: "power_orientation", body: "teaser" }, // 1:884
  { title: "Importance of Sexuality", id: "the_importance_of_sexuality", body: "teaser" }, // 1:895
];

/** Part IV · "Your Erotic Engine" — 1:982. */
export const REPORT_V4_PART4_CHAPTERS: readonly Report3Chapter[] = [
  // 1:993. The frame reads "Accelerator & Brakes" (singular) here; the 24.09 review
  // asked for the "s" everywhere, matching the science deck and reportV3Nav.
  {
    title: "Accelerators & Brakes",
    id: "typical_arousal_accelerators_turn_ons_of_the_core_archetype",
    body: "chapter",
  },
  { title: "Libido Challenges", id: "libido_challenges_in_relationships", body: "teaser" }, // 1:995
  {
    title: "Arousal, Desire & Pleasure",
    id: "background_know_how_arousal_desire_and_pleasure",
    body: "teaser",
  }, // 1:1006
  { title: "Arousal Style", id: "arousal_style", body: "teaser" }, // 1:1017
  { title: "Initiation Style", id: "initiation_style", body: "teaser" }, // 1:1028
  { title: "Energy & Risk", id: "energy_level", body: "teaser" }, // 1:1039
  { title: "Your Sexual Stage", id: "sexual_stage", body: "teaser", suffix: false }, // 1:1050
];

/** Part V · "How You connect" — 38:1507, opening on Challenges in Partnerships (38:1672) expanded. */
export const REPORT_V4_PART5_CHAPTERS: readonly Report3Chapter[] = [
  {
    // 38:1675 draws the plural; V4 follows it (Fatih, 2026-09-24).
    title: "Challenges in Partnerships",
    id: "challenges_in_partnership",
    gateId: "libido_challenges_in_relationships",
    body: "chapter",
  }, // 38:1672
  { title: "Attachment Style", id: "attachment_style", body: "teaser" }, // 38:1520
  { title: "Love Language", id: "love_language", body: "teaser" }, // 38:1542
  {
    title: "Curiosity & Relationship Form",
    id: "curiosity_level",
    body: "teaser",
  }, // 38:1683
];

/** Part VI · "Your edges" — 1:1137. */
export const REPORT_V4_PART6_CHAPTERS: readonly Report3Chapter[] = [
  {
    title: "Fantasy vs. Reality",
    id: "typical_sexual_fantasy_amp_practice_tendencies",
    body: "chapter",
  }, // 1:1148
  {
    title: "Growth Potentials",
    id: "typical_growth_potentials_for_the_core_archetype",
    body: "teaser",
  }, // 1:1150
  { title: "Reading Recommendations", id: "recommendations", body: "teaser", suffix: false }, // 1:1161
  {
    // `constellation` has no row in reportSections. ReportPage.tsx:794 records the
    // rule for this class of nav id: free by construction.
    title: "Other Archetypes",
    id: "constellation",
    body: "teaser",
    suffix: false,
  }, // 1:1172
];

/**
 * The chapters the frames draw as a plain title, without "- of the <Archetype>"
 * (`suffix: false` above). The live report sets its V3 chapters' heads from this, so
 * a chapter that gains or loses its suffix in Figma changes in one place.
 */
export const REPORT_V4_UNSUFFIXED_CHAPTER_IDS: ReadonlySet<string> = new Set(
  [
    ...REPORT_V4_PART3_CHAPTERS,
    ...REPORT_V4_PART4_CHAPTERS,
    ...REPORT_V4_PART5_CHAPTERS,
    ...REPORT_V4_PART6_CHAPTERS,
  ].flatMap((c) => (c.suffix === false && c.id ? [c.id] : []))
);

/**
 * The chapters Figma has designed — its expanded rows (`body: "chapter"`): Typical
 * Beliefs, Accelerators & Brakes, Challenges in Partnerships and Fantasy vs. Reality.
 * Under V4 they never lock outright (review 26.09, V4ChapterLock): a locked reader
 * gets their paywalled designs, or V2's previews for a name with no V4 copy, so
 * Part II's nudges never point at a chapter that will not open.
 */
export const REPORT_V4_DESIGNED_CHAPTER_IDS: ReadonlySet<string> = new Set(
  [
    ...REPORT_V4_PART3_CHAPTERS,
    ...REPORT_V4_PART4_CHAPTERS,
    ...REPORT_V4_PART5_CHAPTERS,
    ...REPORT_V4_PART6_CHAPTERS,
  ].flatMap((c) => (c.body === "chapter" && c.id ? [c.id] : []))
);

/**
 * Review 02.10, Mark (Notion, mobile unlocked): "The right shows how Report 2.0 looked like
 * on mobile. Please adapt". Report 2.0's phone Reward card (Figma 8632:1455) opens on these
 * two lines before the ranked list; its desktop card (8427:1758) has none. Universal copy:
 * the same for every archetype.
 */
export const REPORT_V4_REWARD_INTRO: readonly string[] = [
  "The four currencies sexual chemistry can pay in — and how your system weighs each.",
  "This ranking differs sharply between archetypes.",
];
