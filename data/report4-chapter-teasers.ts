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
 * Keyed by section id. The four chapters V4 opens by default have none (Figma draws
 * them open). Reward System came last: review 26.09, Mark put it back into Part 4
 * (1:1017, "We missed this chapter", 1942400765) and Sanjin wrote its teaser in 1:1026.
 */
export const REPORT_V4_CHAPTER_TEASERS: Readonly<Record<string, string>> = {
  // Part III — 1:871 / 1:882 / 1:893
  core_insecurities:
    "Some of your strongest reactions in intimacy may be shaped by deeper fears about rejection, inadequacy, abandonment, or not being wanted. This chapter explores how those insecurities can quietly influence when you open up, pull away, overthink, or seek reassurance in sex and relationships.",
  confidence_level:
    "Sexual confidence is not simply about how attractive or experienced you feel. It shapes how easily you express desire, communicate what you want, handle uncertainty, and stay present when intimacy feels vulnerable. This chapter explores where your confidence feels solid, where it wavers, and how that may shape your sexual experiences.",
  power_orientation:
    "Power can shape intimacy in subtle ways, from who takes the lead to how comfortable you feel giving up control, setting the pace, or being guided by someone else. This chapter explores the balance of dominance, submission, and equality that feels most natural to you, and how that shows up in your sexual experiences.",
  // Part IV — 1:1004 / 1:1026 / 792:6965 / 1:1037 / 1:1048
  libido_challenges_in_relationships:
    "Low or inconsistent desire rarely has a single cause. Stress, health, hormones, medications, relationship dynamics, and even the way desire naturally works for you can all play a role. This chapter helps you understand what may be influencing your libido and why your desire can change across different moments and relationships.",
  biochemical_reward_system_dynamics:
    "Sexual desire is shaped not only by what feels good, but by what your brain learns to seek out and repeat. This chapter helps you understand how rewarding experiences shape sexual motivation, why some develop a stronger pull than others, and how those patterns can change over time.",
  arousal_style:
    "Your arousal style is the way sexual excitement tends to begin, build, and respond to different kinds of stimulation. Some people are easily sparked by novelty or intensity, while others need more time, emotional connection, anticipation, or the right context. This chapter explores the conditions that tend to bring your arousal to life and what can make it fade.",
  initiation_style:
    "Initiation style is about how you tend to start sexual connection and how you respond when someone else makes the first move. This chapter explores the patterns behind those moments and what they can reveal about how you experience desire, interest, and mutual attraction.",
  energy_level:
    "Some people are most drawn to sexuality that feels intense, spontaneous, or a little unpredictable, while others feel more desire when things are familiar and grounded. This chapter explores how much novelty, excitement, and risk tend to add to your sexual experience, and when they begin to take away from it.",
  // Part V — 38:1529 / 38:1551 / 38:1692
  attachment_style:
    "The way you respond to closeness, distance, and uncertainty in relationships often follows a recognizable pattern. This chapter explores your attachment style and how it can shape the way you seek connection, protect yourself, and experience emotional intimacy with a partner.",
  love_language:
    "Feeling loved is not only about how much affection is there, but how that affection is expressed and received. This chapter explores the kinds of gestures, attention, and connection that make love feel most meaningful to you, and why some forms of care may reach you more deeply than others.",
  curiosity_level:
    "Curiosity can shape not only what you want to explore, but also what kind of relationship feels right for you. This chapter helps you understand your openness to new experiences, your comfort with different relationship structures, and where your personal boundaries around freedom, exclusivity, and commitment tend to lie.",
  // Part VI — 1:1159 / 1:1170 / 1:1181
  typical_growth_potentials_for_the_core_archetype:
    "Growth does not mean changing who you are. It means understanding where your usual patterns may limit you and where small shifts could create more freedom, confidence, and satisfaction. This chapter highlights the areas where you may have the most room to grow and what that growth could look like in your intimate life.",
  recommendations:
    "Some ideas are worth exploring beyond the report itself. This chapter brings together books, research, and other resources selected to deepen your understanding of the patterns, questions, and areas of growth most relevant to you.",
  constellation:
    "You may have one primary archetype, but parts of you can still overlap with many others. This chapter shows how closely you match each archetype, giving you a broader picture of where you fit across the full LoveIQ spectrum.",
};
