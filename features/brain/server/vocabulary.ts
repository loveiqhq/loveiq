/**
 * PLAIN ENGLISH IN, HOUSE VOCABULARY OUT.
 *
 * The corpus holds the answer to almost every business question the team asks, and
 * answers it only if you already speak its words. Measured 2026-09-09 over 465
 * questions written the way real colleagues ask them: one-word rewrites flipped
 * failure to success, every time, with no change to the data.
 *
 *   "how much money have we made"   -> a PostHog newsletter titled "We made a horror film"
 *   "how much revenue have we made" -> the all-time analytics row, rank 1
 *
 *   "what is our traffic"           -> cold outreach spam from an ad network
 *   "how many visits do we get"     -> the analytics row, rank 1
 *
 *   "is the funnel working"         -> a duplicated calendar meeting
 *   "funnel conversion rate"        -> the analytics row, rank 1
 *
 * That is exactly backwards for the two people it most has to serve: the founder asks
 * in plain English, and a new engineer does not yet know the house terms. So the
 * translation belongs here rather than in their heads.
 *
 * APPENDED, NEVER SUBSTITUTED. The original words stay and carry their own weight; a
 * rewrite would break the questions that already work, and there is no way to know
 * which reading was meant. Everything below is a mapping some measured question
 * needed -- not a thesaurus. A synonym nobody was observed to use is a word that can
 * only add noise.
 */

/** [what a person says, what the corpus calls it] */
const HOUSE_TERMS: Array<[RegExp, string]> = [
  // Money. "made" and "earned" both collided with ordinary English -- "we made a
  // horror film", "Fatih made the change" -- which is why the metric word has to be
  // added rather than hoped for.
  [/\b(?:money|earn(?:ed|ings)?|income|takings|turnover)\b/i, "revenue"],
  [/\bhow much (?:have we|did we|do we) (?:make|made)\b/i, "revenue"],
  // Traffic. "traffic" alone matched an ad network's cold outreach twice.
  [/\b(?:traffic|visitors?|footfall)\b/i, "visits"],
  // People who paid, as opposed to people who signed up.
  [/\b(?:buyers?|purchasers?|customers who paid|paying users?)\b/i, "paying customers"],
  // People who finished the survey. "new users" returned no signup figure at all.
  [/\b(?:new users?|registrations?|sign[- ]?ups?)\b/i, "signups"],
  // Funnel health. Asking whether something "works" names no metric at all.
  [/\bfunnel\b|\bdrop[- ]?off\b|\bconversion\b/i, "conversion rate"],
  // The open-ended founder questions, which name no metric and no period.
  [
    /\bhow (?:are we|is (?:it|business|the company)) (?:doing|going)\b|\bhow's business\b/i,
    "revenue signups visits",
  ],
  [/\b(?:profitable|profitability|are we making money)\b/i, "revenue ad spend"],
  [/\b(?:growing|growth)\b/i, "signups revenue"],
];

/**
 * At most this many added terms.
 *
 * Not arbitrary: `word_similarity` scores the best contiguous extent of a title, so a
 * query that balloons dilutes every extent and makes the ranking WORSE -- the same
 * mechanism that made verbose month questions outperform terse ones. Four is enough
 * for any question measured here to reach its metric.
 */
const MAX_ADDED = 4;

/** The question with the corpus's own words for it appended. */
export function expandBusinessVocabulary(question: string): string {
  const added: string[] = [];
  for (const [pattern, term] of HOUSE_TERMS) {
    if (added.length >= MAX_ADDED) break;
    if (!pattern.test(question)) continue;
    for (const word of term.split(" ")) {
      // Already said it, or the asker already used the house word: adding it a second
      // time would double its weight on a question that never needed the help.
      if (added.includes(word)) continue;
      if (new RegExp(`\\b${word}\\b`, "i").test(question)) continue;
      added.push(word);
    }
  }
  return added.length > 0 ? `${question} ${added.slice(0, MAX_ADDED).join(" ")}` : question;
}
