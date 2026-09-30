/**
 * The four deep dives — the chapters Report V4 has built out, each as the question it
 * answers and the line under it.
 *
 * Until 30.09 the V4 report showed them as its Snapshot (Figma 1:766, "A Snapshot of
 * what you will learn"). Now the pre-report wizard shows them as its map's tiles (Figma
 * 1049:1979 / 2092 / 2207 / 2322), so they live here, with no imports, where the
 * survey's bundle can read them without pulling in the report's page copy.
 *
 * The questions and lines are Sanjin's (review round 25.09, the all-open panel 712:243),
 * Challenges' line his polish of 26.09 (Mark 1942399260). The tiles' titles follow V4's
 * chapter titles: Challenges is plural, as V4 titles it (Fatih, 24.09), where the
 * wizard's frame still has the singular.
 *
 * The same for every archetype: each is a way into a chapter, not a finding.
 */
export interface ReportDeepDive {
  /** The chapter it opens — an id in REPORT_V4_CHAPTERS. */
  id: string;
  /** The chapter's V4 title. */
  title: string;
  /** Lora Medium; the question the chapter answers. */
  question: string;
  /** Plus Jakarta; the line under the question. */
  support: string;
}

export const REPORT_DEEP_DIVES: readonly ReportDeepDive[] = [
  {
    id: "typical_beliefs",
    title: "Typical Beliefs",
    question: "Which rules about sex did you never actually agree to?",
    support:
      "Discover the beliefs that are quietly shaping what sex means to you, and how they can influence your desire, behaviour, and relationships.",
  },
  {
    id: "typical_arousal_accelerators_turn_ons_of_the_core_archetype",
    title: "Accelerators & Brakes",
    question: "What turns your desire on, and what shuts you down?",
    support:
      "Understand what fuels your desire, what gets in the way, and how to better work with both.",
  },
  {
    id: "challenges_in_partnership",
    title: "Challenges in Partnerships",
    question: "What do your partners hear that you never said?",
    support:
      "Understand where your needs and habits can be misread by a partner, and how to navigate those differences with less friction and greater understanding.",
  },
  {
    id: "typical_sexual_fantasy_amp_practice_tendencies",
    title: "Fantasy vs. Reality",
    question: "What does your fantasy really say about what you want?",
    support:
      "Learn what makes a fantasy appealing, which parts should stay imaginary, and what may be worth exploring in real life.",
  },
];
