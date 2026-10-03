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
 * - A word after a colon starts a new phrase.
 * - Each part of a hyphenated word counts as a word ("Self-Knowledge", "One-on-One"), and
 *   so does each half of a pair joined by a slash or a dash ("Push/Pull").
 * - Only a first letter is ever raised, and never one that follows a digit ("2nd"), so
 *   names and marks keep their own case (LoveIQ, Spark Seeker), and "vs." stays small.
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

/** A hyphen, a slash, an en dash or an em dash: kept, and each side cased on its own. */
const JOINERS = /([-/–—])/;

const raiseFirst = (part: string) =>
  part.replace(/^([^A-Za-z0-9]*)([a-z])/, (_, lead: string, ch: string) => lead + ch.toUpperCase());

export function titleCase(text: string): string {
  const words = text.split(" ");
  let last = words.length - 1;
  while (last > 0 && words[last] === "") last--;
  let opensPhrase = true;
  return words
    .map((word, i) => {
      if (word === "") return word;
      // Split keeps the joiners at the odd indices; the parts sit at the even ones.
      const parts = word.split(JOINERS);
      const cased = parts.map((part, j) => {
        if (j % 2 === 1) return part;
        const edge = (opensPhrase && j === 0) || (i === last && j === parts.length - 1);
        const bare = part.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9.]+$/g, "").toLowerCase();
        return MINOR.has(bare) && !edge ? part.toLowerCase() : raiseFirst(part);
      });
      opensPhrase = word.endsWith(":");
      return cased.join("");
    })
    .join(" ");
}
