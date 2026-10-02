/**
 * The report's heading rule, adopted at the 02.10 sync: ChatGPT's Title Case, which Mark
 * pasted into Figma (comment 1950585958). Capitalise the first and the last word and every
 * noun, verb, adjective, adverb and pronoun; keep in lower case the articles (a, an, the),
 * the coordinating conjunctions (and, but, or, nor, for) and the short prepositions (in,
 * on, at, to, by, of, for, with, and "as", which every style guide keeps small).
 *
 * - "so" and "yet" are on the rule's conjunction list, but the rule capitalises adverbs,
 *   and in the report's headings they are adverbs ("Can Feel So Different").
 * - "from", "into" and "up" are not on its list, so they are capitalised.
 * - A word after a colon starts a new phrase, and each part of a hyphenated word counts
 *   as a word ("Self-Knowledge", "14-Day Money-Back").
 * - Only a first letter is ever raised, so names and marks keep their own case (LoveIQ,
 *   Spark Seeker), and "vs." stays small.
 */
const MINOR = new Set([
  "a",
  "an",
  "the",
  "and",
  "but",
  "or",
  "nor",
  "for",
  "in",
  "on",
  "at",
  "to",
  "by",
  "of",
  "with",
  "as",
  "vs",
  "vs.",
]);

const raiseFirst = (part: string) =>
  part.replace(/^([^A-Za-z]*)([a-z])/, (_, lead: string, ch: string) => lead + ch.toUpperCase());

export function titleCase(text: string): string {
  const words = text.split(" ");
  const last = words.length - 1;
  let opensPhrase = true;
  return words
    .map((word, i) => {
      const bare = word.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9.]+$/g, "").toLowerCase();
      const small = MINOR.has(bare) && !opensPhrase && i !== last;
      opensPhrase = word.endsWith(":");
      return small ? word.toLowerCase() : word.split("-").map(raiseFirst).join("-");
    })
    .join(" ");
}
