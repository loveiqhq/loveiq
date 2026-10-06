/**
 * Report V4 — the teaser a closed chapter shows under its head (Figma 1:862, the
 * "Collapsed Chapter H1 + Copy" rows of Parts III-VI).
 *
 * Sanjin wrote them (Google Doc "Teaser_Text_Chapters", 25.09) and Mark set them in
 * every collapsed chapter: "Teaser Texts for all closed Chapters are in Figma now"
 * (Figma comment 1942042395, answering his own "All collapsed chapters should look
 * like this", 1940086244). Transcribed from the frames, which match the doc word for
 * word; two frames carry a stray trailing line feed, left out here.
 *
 * FREE COPY. Each is the same for every reader and archetype — what the chapter is
 * about, never what it says about the reader — so it ships to locked readers too and
 * this module stays out of the premium list.
 *
 * Review 30.09: Mark asked Sanjin to "update Teaser Texts" (28.09), and Sanjin cut
 * every one down in the same frames, most to its "This chapter…" sentence; only the
 * Other Archetypes teaser stands. His review of 30.09: "The teaser text is not
 * updated". Two frames carry a stray trailing line feed and two a doubled space, left
 * out here.
 *
 * Keyed by section id. The four chapters V4 opens by default have none (Figma draws
 * them open). Reward System came last: review 26.09, Mark put it back into Part 4
 * (1:1017, "We missed this chapter", 1942400765) and Sanjin wrote its teaser in 1:1026.
 */
export const REPORT_V4_CHAPTER_TEASERS: Readonly<Record<string, string>> = {
  // Part III — 1:871 / 1:882 / 1:893
  core_insecurities:
    "This chapter explores how your fears about rejection, inadequacy or abandonment can quietly influence when you open up, pull away, overthink, or seek reassurance in sex and relationships.",
  confidence_level:
    "This chapter explores where your confidence feels solid, where it wavers, and how that may shape how you express desire, handle uncertainty and vulnerability, and your sexual experience as a whole.",
  power_orientation:
    "This chapter explores the balance of dominance, submission, and equality that feels most natural to you, and how that shows up in your sexual experiences.",
  // Part IV — 1:1004 / 1:1026 / 792:6965 / 1:1037 / 1:1048
  libido_challenges_in_relationships:
    "This chapter helps you understand what may be influencing your libido and why your desire can change across different moments and relationships.",
  biochemical_reward_system_dynamics:
    "This chapter helps you understand how your reward system shapes what draws you in, why some experiences develop a stronger pull than others, and how those patterns can influence your sexuality.",
  arousal_style:
    "Your arousal style is the way sexual excitement tends to begin, build, and respond to different kinds of stimulation. This chapter explores the conditions that tend to bring your arousal to life and what can make it fade.",
  initiation_style:
    "This chapter explores the patterns behind how you start and respond to sexual connection, and what those moments can reveal about how you experience desire, interest, and mutual attraction.",
  energy_level:
    "This chapter explores how much novelty, excitement, and risk tend to add to your sexual experience, and when they begin to take away from it.",
  // Part V — 38:1529 / 38:1551 / 38:1692
  attachment_style:
    "This chapter explores your attachment style and how it can shape the way you seek connection, protect yourself, and experience emotional intimacy with a partner.",
  love_language:
    "This chapter explores the kinds of gestures, attention, and connection that make love feel most meaningful to you, and why some forms of care may reach you more deeply than others.",
  curiosity_level:
    "This chapter helps you understand your openness to new experiences, your comfort with different relationship structures, and where your personal boundaries around freedom, exclusivity, and commitment tend to lie.",
  // Part VI — 1:1159 / 1:1170 / 1:1181
  typical_growth_potentials_for_the_core_archetype:
    "This chapter highlights the areas where you may have the most room to grow and what that growth could look like in your intimate life.",
  recommendations:
    "This chapter brings together books, research, and other resources selected to deepen your understanding of the patterns, questions, and areas of growth most relevant to you.",
  constellation:
    "You may have one primary archetype, but parts of you can still overlap with many others. This chapter shows how closely you match each archetype, giving you a broader picture of where you fit across the full LoveIQ spectrum.",
};
