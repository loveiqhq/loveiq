/**
 * Report V4 — page copy that is not per-archetype.
 *
 * Figma: "Report V4 — MOBILE" (1:165). Everything here is transcribed verbatim from
 * the frame, including its own typos, because this is a fidelity build and the copy
 * is Mark's to correct — see NOTE markers below.
 *
 * Per-archetype card copy lives separately in `data/report3-archetype-card.ts`.
 * Chapter teasers are NOT here: the frame draws all seventeen as a literal
 * `[Teaser Text]` placeholder, so they are rendered as that placeholder rather than
 * invented. `TEASER_PLACEHOLDER` is the single source of that string.
 */

import { KNOWN_ARCHETYPES } from "@features/report/server/archetypeSlug";

/** The frame's own placeholder for the 17 unwritten chapter teasers (e.g. 1:871). */
export const TEASER_PLACEHOLDER = "[Teaser Text]";

/** The frame's own placeholder for the 4 unwritten part introductions (1:855). */
export const PART_INTRO_PLACEHOLDER = "[Part Introductory Text]";

export interface Report3PartHeading {
  /** "Part I" … "Part VI" — 1:173 / 1:856. */
  eyebrow: string;
  /** Upright serif segment. Empty when the whole title is the accent (Part I). */
  lead: string;
  /** Italic segment. Violet on the part+intro blocks, near-black on Part I. */
  accent: string;
  /** Part I renders its accent in near-black rather than violet — 1:174. */
  tone?: "violet" | "ink";
  /**
   * Set the lead in italic as well. Only Part II does this: 1:486 draws "Your" in
   * italic ink beside the violet "Constellation", where Part III's 1:852 keeps "How
   * your archetype" upright.
   */
  leadItalic?: true;
}

export const REPORT_V4_PARTS: readonly Report3PartHeading[] = [
  // 1:169 — no introduction paragraph, and the accent is near-black, not violet.
  { eyebrow: "Part I", lead: "", accent: "Welcome", tone: "ink" },
  // 1:486
  { eyebrow: "Part II", lead: "Your ", accent: "Constellation", leadItalic: true },
  // 1:856 / 1:857
  { eyebrow: "Part III", lead: "How your archetype ", accent: "works" },
  // 1:990 — "Your " upright in ink, "erotic engine" in the accent, lower-case.
  { eyebrow: "Part IV", lead: "Your ", accent: "erotic engine" },
  { eyebrow: "Part V", lead: "How You ", accent: "connect" },
  { eyebrow: "Part VI", lead: "Your ", accent: "edges" },
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
  /** 1:742 — seven paragraphs, each opening on a bold or extra-bold lead. */
  paragraphs: readonly (readonly Report3Run[])[];
  /** 1:744 — an extra-bold closing line. The frame dropped it on 2026-09-24. */
  closer?: string;
}

/**
 * Part II · "Summary of the <Archetype>" — 1:736.
 *
 * Only Spark Seeker is drawn in the frame, so only Spark Seeker is transcribed.
 * `missingReport3Summary()` names the rest, the same way `missingReport3Blurbs()`
 * and `missingReport3CardCopy()` do, so the gap closes loudly.
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
 * Part II · "What you will discover" — Figma 1:763: the H2 1:766 over the chapter
 * nudges panel 663:1089, which replaced the Snapshot's five claims (316:250).
 *
 * One row per chapter the report leads with, in the frame's order. The copy is the
 * same for every archetype — each row is a way into a chapter, not a finding — so it
 * renders for all fourteen. The questions are 663:1089's; the support lines are
 * 663:1126's (Typical Beliefs, the one row the frame draws open) and the hidden
 * all-open state 662:233's for the other three. Each row's part, number and title
 * come from V4's chapter order (V4ChapterNudges), so they follow it if it moves.
 */
export interface Report3Nudge {
  /** The chapter it opens — an id in REPORT_V4_CHAPTERS. */
  id: string;
  /** Lora Medium 18.5/26.5, shown open or closed. */
  question: string;
  /** Plus Jakarta 14/22.4, shown with "Read full chapter" when the row is open. */
  support: string;
}

export const REPORT_V4_NUDGES_HEADING = "What you will discover";

export const REPORT_V4_NUDGES: readonly Report3Nudge[] = [
  {
    id: "typical_beliefs",
    question: "Which of your rules about sex did you never actually agree to?",
    support:
      "A short list of the beliefs most people are carrying, and a way to check which ones are yours.",
  },
  {
    id: "typical_arousal_accelerators_turn_ons_of_the_core_archetype",
    question: "What switches your desire off fastest?",
    support:
      "The conditions that shut you down, and which of them you can change before the weekend.",
  },
  {
    id: "challenges_in_partnership",
    question: "What do your partners hear that you never said?",
    support:
      "How your usual way of asking lands on the other side, and one sentence that makes it clearer.",
  },
  {
    id: "typical_sexual_fantasy_amp_practice_tendencies",
    question: "Why does the thing you fantasise about lose its heat in real life?",
    support:
      "How to tell which fantasies are built for your head and which are worth trying out loud.",
  },
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
   * Most rows read "<Chapter> - of the <Archetype>", but three do not: Your Sexual
   * Stage (1:1050), Reading Recommendations (1:1161) and Other Archetypes (1:1172)
   * are drawn as a plain title. Verified against 1:1161's own design context.
   */
  suffix?: false;
  /**
   * The frame puts the "- of the <Archetype>" suffix on a line of its own, whatever
   * the width: a U+2028 line separator in 38:1675 and 38:1686, a line feed in 1:1028.
   */
  suffixBreak?: true;
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
  { title: "Initiation Style", id: "initiation_style", body: "teaser", suffixBreak: true }, // 1:1028
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
    suffixBreak: true,
  }, // 38:1672
  { title: "Attachment Style", id: "attachment_style", body: "teaser" }, // 38:1520
  { title: "Love Language", id: "love_language", body: "teaser" }, // 38:1542
  {
    title: "Curiosity & Relationship Form",
    id: "curiosity_level",
    body: "teaser",
    suffixBreak: true,
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

/** The chapters whose head breaks before its suffix (`suffixBreak` above). */
export const REPORT_V4_SUFFIX_BREAK_IDS: ReadonlySet<string> = new Set(
  [
    ...REPORT_V4_PART3_CHAPTERS,
    ...REPORT_V4_PART4_CHAPTERS,
    ...REPORT_V4_PART5_CHAPTERS,
    ...REPORT_V4_PART6_CHAPTERS,
  ].flatMap((c) => (c.suffixBreak && c.id ? [c.id] : []))
);
