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
  // A COST QUESTION IS NOT A REVENUE QUESTION, and "money" appears in both. Measured
  // 2026-09-10: "how much money did we pay Upwork" filled 8 of 12 slots with analytics
  // rows and dropped the contractor thread out of the result entirely. Every pattern
  // below therefore needs the question to be about money COMING IN.
  [/\b(?:income|takings|turnover)\b/i, "revenue"],
  [
    /\bhow much (?:money |cash )?(?:have we|did we|do we) (?:make|made|earn|earned|bring in)\b/i,
    "revenue",
  ],
  [/\b(?:money|cash) (?:have we|did we|do we) (?:make|made|earn|earned|bring in)\b/i, "revenue"],
  [/\bwhat (?:is|are|was) (?:our|the) (?:revenue|earnings|sales|profit|takings)\b/i, "revenue"],
  [/\bhow much (?:are we|have we been) (?:losing|making)\b/i, "revenue"],
  // Traffic. "traffic" alone matched an ad network's cold outreach twice -- and also
  // matched "traffic to the Berlin office", which is about a building.
  [/\b(?:what|how) (?:is|are|much|many) (?:our|the) (?:traffic|visitors?)\b/i, "visits"],
  [
    /\bour (?:traffic|visitors)\b|\btraffic (?:numbers|source|sources|seasonal)\b|\bsources? of traffic\b/i,
    "visits",
  ],
  [/\bhow many (?:visitors?|people) (?:do we|did we|are|visit)\b/i, "visits"],
  // People who paid, as opposed to people who signed up.
  [/\b(?:buyers?|purchasers?|customers who paid|paying users?)\b/i, "paying customers"],
  // People who finished the survey. "new users" returned no signup figure at all.
  // "how many" / "how much" is required, because the bare phrase is also an email
  // subject -- "New user has been added" -- and the plain question already found it.
  [/\bhow many (?:new users?|registrations?|sign[- ]?ups?)\b/i, "signups"],
  [/\b(?:registrations?|sign[- ]?ups?) (?:did we|do we|have we)\b/i, "signups"],
  // Funnel health. Asking whether something "works" names no metric at all.
  // `conversion` alone is a word people use about UX, so it needs a question shape.
  // `funnel` alone is also a thing you draw: "the funnel diagram in Figma" put ten
  // analytics rows above the Notion card that literally answers it.
  [/\b(?:is|how is) (?:the |our )?funnel (?:working|doing|performing)\b/i, "conversion rate"],
  [/\b(?:our|the) funnel (?:conversion|numbers|performance|health)\b/i, "conversion rate"],
  [/\bdrop[- ]?off\b|\b(?:what|how) (?:is|are|was) (?:our|the) conversion\b/i, "conversion rate"],
  // The open-ended founder questions, which name no metric and no period.
  [
    /\bhow (?:are we|is (?:it|business|the company)) (?:doing|going)\b|\bhow's business\b/i,
    "revenue signups visits",
  ],
  [/\b(?:profitable|profitability|are we making money)\b/i, "revenue ad spend"],
  // `growth` is also a job title ("Growth Lead", "running growth") and a direction
  // ("growth direction"), and matching those pulled a hiring conversation toward the
  // monthly numbers -- measured, "which candidate did we speak to about running growth
  // at the end of March 2026" moved the right calendar event from rank 1 to rank 3.
  // A question ABOUT growth says "are we" or "how much".
  [
    /\b(?:are we growing|is (?:the )?(?:business|company) growing|how (?:much|fast) (?:are we|have we) grow)/i,
    "signups revenue",
  ],
  // The automated emails that chase someone who finished the survey and never paid.
  // Measured 2026-09-11, the two worst misses in an 18-question plain-English sweep:
  // "the follow-up messages we send after someone finishes" and "what do we email
  // people who never came back" both returned NOTHING relevant in 8 — a random email
  // thread, the commit-message convention, a landing-page task — while "nurture
  // emails" returned the right documents at 3.69. The corpus has the answer and only
  // answers to its own word for it.
  //
  // Both patterns need the EMAIL noun or the full phrase. Bare "follow up" is what a
  // person does after a meeting, and bare "came back" is a returning visitor.
  [/\b(?:follow[- ]?up|chaser?|re-?engagement)\s+(?:e-?mails?|messages?|sequence)\b/i, "nurture"],
  // THE SUBJECT HAS TO BE A GROUP. The first version of this matched any "never came
  // back" and fired on "the candidate never came back to us about the offer" — a
  // hiring conversation pulled toward the marketing emails. `went cold` was dropped
  // in the same pass: nobody was measured saying it, and an unobserved synonym can
  // only add noise.
  [
    /\b(?:people|users?|customers?|visitors?|readers?)\s+(?:who\s+)?(?:never|did ?n.?t|have ?n.?t)\s+(?:came?|come)\s+back\b/i,
    "nurture",
  ],
  // The password screen in front of the non-production site. "staging" is the house
  // word and a person says "test site"; measured at rank 4, and the gate is the only
  // thing that page does.
  [/\bpassword (?:page|gate|screen|wall)\b|\b(?:test|preview) site\b/i, "staging"],
  // The fourteen types. "archetype" is house vocabulary a new joiner does not have.
  // Measured at rank 7 for "what categories do we sort people into".
  [/\bsort people into\b|\bcategor(?:y|ies)\b[^.]{0,24}\bpeople into\b/i, "archetype"],
  // A chargeback IS a dispute — a pure synonym, not a fact that can change. Measured:
  // "what we do when a card gets charged back" found nothing in 30; "how do disputes
  // work" is rank 1.
  [/\bcharge[- ]?backs?\b|\bcharged back\b/i, "dispute"],
  // Where a module lives. Measured: "where does the logger come from" found nothing in
  // 30 while "where do I import the logger from" is rank 1 — the corpus says
  // `@shared/observability/logger` and a person says "come from".
  [
    /\b(?:where (?:does|do|is)|which (?:file|module))\b[^.]{0,20}\blogger\b/i,
    "import observability",
  ],
];

/**
 * DELIBERATELY NOT MAPPED, though both were measured missing.
 *
 * "what is the test card number" wants Stripe's 4242 card, and "what do we use to
 * send email" wants Resend — and in both cases the only word that would bridge the
 * gap is the VENDOR'S NAME. Every term above maps a person's word to the corpus's
 * word for the same thing; these would instead paste the ANSWER into the question,
 * and would silently keep doing so after we changed provider. A wrong answer that
 * arrives at rank 1 is worse than a right one at rank 8, which is where the email
 * question already lands.
 */

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
