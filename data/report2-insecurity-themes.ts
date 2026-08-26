/**
 * The five recurring insecurity themes from chapter 9 of the Spark Seeker source
 * document, rendered as the Core Insecurities chapter's educational expander.
 *
 * Mark's comment on the document, anchored on exactly these five paragraphs:
 * "Instead of a practical piece, we could use an educational piece for this
 * section and use this text". Core Insecurities was the one chapter with a
 * practical (yellow) expander and no educational (purple) one, so this is added
 * BENEATH the practical block rather than in place of it.
 *
 * Verbatim from the document. `term` is the phrase the document sets in bold
 * inside each paragraph — carried separately so the renderer can bold the same
 * words rather than guessing at a "Label: description" split, which these
 * paragraphs do not have.
 *
 * Universal copy: the themes are the same for every archetype, like the other
 * `edu.*` blocks.
 */

export interface Report2InsecurityTheme {
  /** The bolded insecurity name inside the paragraph. */
  term: string;
  /** The whole paragraph, verbatim. */
  text: string;
}

/** The paragraph chapter 9 puts above the list. */
export const INSECURITY_THEMES_INTRO =
  "Across the LoveIQ archetypes, several recurring insecurity themes appear. These are not diagnoses, but organizing fears that shape erotic strategy and relational behavior.";

/** The paragraph chapter 9 puts below it. */
export const INSECURITY_THEMES_OUTRO =
  "These insecurities interact strongly with attachment style (secure, anxious, avoidant, or disorganized), risk orientation, power orientation, and the biochemical reward systems that govern what sex is trying to regulate.";

export const INSECURITY_THEMES: Report2InsecurityTheme[] = [
  {
    term: "abandonment insecurity",
    text: "Some archetypes are primarily organized around abandonment insecurity. Their deepest fear is being left, replaced, or emotionally withdrawn from. Sexuality may become a way to secure closeness, reassurance, or proof of being wanted.",
  },
  {
    term: "engulfment or loss-of-self insecurity",
    text: "Others are shaped by engulfment or loss-of-self insecurity. Their fear is being consumed, controlled, or losing autonomy. Desire may spike at distance and disappear with closeness.",
  },
  {
    term: "inadequacy or performance insecurity",
    text: "A third pattern centers on inadequacy or performance insecurity. Here, sexuality becomes linked to validation, competence, or worth. Arousal is often tied to being impressive, skilled, or desired.",
  },
  {
    term: "unworthiness or shame-based insecurity",
    text: "Some archetypes carry unworthiness or shame-based insecurity. They fear being “too much,” “not enough,” or fundamentally unlovable. Sexuality may oscillate between craving connection and avoiding exposure.",
  },
  {
    term: "trust and safety insecurity",
    text: "Others are shaped by trust and safety insecurity. Their system expects unpredictability, emotional rupture, or misuse of vulnerability. Desire becomes highly conditional and easily shut down by subtle threat cues.",
  },
];

/** The expander's own label, in the voice of the other twelve. */
export const INSECURITY_THEMES_EYEBROW = "Learn: the five insecurity themes";
