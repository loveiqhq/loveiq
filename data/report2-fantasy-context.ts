/**
 * The three fantasy learnings that sit ABOVE the Fantasy vs. Reality graph.
 *
 * Mark's comment on the Spark Seeker source document, chapter 25: "I think we
 * should expand the section on fantasy. Maybe structure the top before the graph
 * into the top 3 learnings: 1. Relational container/environment 2. Safer with a
 * stranger -> integration, psychological distance, counter-balance how we
 * normally function 3. Living vs. Not Living Fantasies".
 *
 * The three groups below are exactly those three headings. Their paragraphs are
 * the green-highlighted paragraphs from chapters 25 and 26, verbatim and in
 * document order — nothing rewritten, nothing summarised, nothing stitched
 * together from two paragraphs.
 *
 * The titles ARE new text (the document has no heading for a "top 3 learnings"
 * block; they are Mark's own three labels from the comment, tidied into title
 * case). Everything under them is the document's.
 *
 * Universal copy — the fantasy mechanics are the same for every reader; only the
 * graph below them is per-archetype.
 */

export interface Report2FantasyLearning {
  /** Mark's own label for the learning, from his document comment. */
  title: string;
  /** Verbatim paragraphs from chapters 25/26, in document order. */
  paras: string[];
}

export const FANTASY_LEARNINGS: Report2FantasyLearning[] = [
  {
    title: "The relational container, not the content",
    paras: [
      "Fantasies are not simply expressions of want. They are context-sensitive psychological spaces where arousal, identity, safety, power, and meaning interact.",
      "The same fantasy placed in a long-term relationship carries very different psychological weight than when placed in anonymity, imagination, or distance. The content may be identical, but the context changes its function entirely.",
      "This is why fantasies cannot be interpreted without asking: In which relational container does this fantasy live?",
    ],
  },
  {
    title: "Why some fantasies feel safer with a stranger",
    paras: [
      "It is common for people to notice that certain fantasies feel easier to imagine with a stranger than with their partner. This is often deeply unsettling internally, especially for people who value honesty, depth, and emotional integrity.",
      "With a stranger, these fantasies can remain unintegrated. There is less fear of being judged tomorrow, less risk of redefining how one is seen. The fantasy stays contained, and therefore erotic.",
      "Some fantasies depend on separation rather than closeness. They draw their charge from anonymity, impermanence, lack of emotional responsibility, and the absence of repair or aftermath.",
      "This does not mean the fantasy competes with the relationship. It means fantasy serves a different internal function than intimacy.",
    ],
  },
  {
    title: "Living, or not living, a fantasy",
    paras: [
      "Contemporary sexuality science and clinical practice point to a more precise understanding: fantasies can be arousing without being desired, and desired without being pleasurable to enact. Arousal alone is not evidence of wanting, and wanting is not evidence that living something will feel good in reality. Recognizing this distinction is essential for reducing shame, preventing misinterpretation, and developing a mature relationship to one’s inner erotic world.",
      "Some fantasies persist not only as arousing imagery, but as a stable, grounded curiosity about lived experience. These fantasies tend to feel coherent with one's values and sense of self, create excitement without internal conflict or shame, remain appealing when imagined realistically rather than as an abstract scene, and evoke a sense of expansion rather than fragmentation.",
      "Sexual maturity is not measured by how many fantasies are enacted, but by how consciously one relates to them. Some fantasies want to be lived, carefully, consensually, and with awareness. Others want to remain internal, serving as imaginative spaces where the psyche can explore without consequence.",
    ],
  },
];
