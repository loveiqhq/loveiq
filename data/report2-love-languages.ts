/**
 * Per-archetype `love_language_order` — the reader's ranking of the five love
 * languages. Only the ORDER varies: the display name, blurb, meter fill and
 * intensity word are universal (see `LANGUAGES` in `LoveLanguageSection`).
 *
 * `report2-archetype-config.json` carries `love_language_order` for Spiritual
 * Lover ONLY, so 13 of 14 archetypes rendered NO ranked list at all (the section
 * gates on `hasOrder`). The `spiritual-lover` entry below reproduces that one
 * real config EXACTLY — the check that makes the other 13 trustworthy (asserted
 * in `features/report/tests/loveLanguages.test.ts`).
 *
 * Each order is read off that archetype's own love-language copy
 * (`getReport2Section(name, "lovelang").body.p1`), quoted on every entry. Rank 1
 * is the channel the copy names first as how love reaches them, and the last
 * rank is whatever that copy says "moves you less" (for 12 of 14 that is
 * explicitly gifts — "grand gestures", "flowers", "plans, gifts and big
 * statements"). The middle ranks follow the order of emphasis within the same
 * paragraph.
 */

/** The five language slugs (fixed set; `LANGUAGES` owns their copy). */
export const LOVE_LANGUAGE_SLUGS = [
  "presence_time",
  "reverent_touch",
  "sincere_words",
  "acts_of_care",
  "gifts",
] as const;

export type LoveLanguageSlug = (typeof LOVE_LANGUAGE_SLUGS)[number];

export const LOVE_LANGUAGE_ORDER_BY_SLUG: Record<string, LoveLanguageSlug[]> = {
  // "partners who show love through action and play are speaking love. You just
  // don't receive it in that dialect." — VALIDATION ANCHOR, matches the config.
  "spiritual-lover": ["presence_time", "reverent_touch", "sincere_words", "acts_of_care", "gifts"],

  // "You show love by teasing, planning surprises, and keeping things light. A
  // partner who shows it through steadiness and serious talks can feel like
  // pressure" — so sincere words land last, surprises keep gifts mid-table.
  "spark-seeker": ["reverent_touch", "presence_time", "gifts", "acts_of_care", "sincere_words"],

  // "attention that reaches the body: a hand resting with awareness, eyes that
  // stay… a partner who loves through plans, gifts, and big statements."
  "sensual-connector": [
    "reverent_touch",
    "presence_time",
    "sincere_words",
    "acts_of_care",
    "gifts",
  ],

  // "steady, practical care: a partner who remembers what matters, helps before
  // being asked, and stays warm afterward. Grand gestures move you less."
  "relational-nurturer": [
    "acts_of_care",
    "presence_time",
    "reverent_touch",
    "sincere_words",
    "gifts",
  ],

  // "desire you can see and hear: a compliment, a kiss they start, being told
  // you're wanted… a partner who loves through steady, undemonstrative care can
  // be [missed]" — so acts of care land last.
  "radiant-performer": [
    "sincere_words",
    "reverent_touch",
    "presence_time",
    "gifts",
    "acts_of_care",
  ],

  // "Nonjudgment and honest talk about what you want land as love here, more
  // than flowers or routine ever will."
  "explorer-of-edges": [
    "sincere_words",
    "reverent_touch",
    "presence_time",
    "acts_of_care",
    "gifts",
  ],

  // "Encouragement is how love reaches you… who gives feedback kindly, who stays
  // patient when things get awkward. Big confident gestures move you less."
  "curious-apprentice": [
    "sincere_words",
    "presence_time",
    "acts_of_care",
    "reverent_touch",
    "gifts",
  ],

  // "Calm, steady closeness… quiet affection, a hand resting on your back, a
  // partner who doesn't turn every moment into a big conversation. Grand
  // gestures and intense declarations move you less."
  "minimalist-companion": [
    "reverent_touch",
    "presence_time",
    "acts_of_care",
    "sincere_words",
    "gifts",
  ],

  // "room to breathe: a partner who sets a soft mood, invites instead of pushes,
  // and stays close… Big, loud gestures move you less than a spacious,
  // unpressured evening does."
  "emotional-voyeur": ["presence_time", "reverent_touch", "acts_of_care", "sincere_words", "gifts"],

  // "Respect, made concrete: honored agreements, a clear yes or no,
  // follow-through on what was promised. Grand romantic gestures move you less."
  "authority-conductor": [
    "acts_of_care",
    "sincere_words",
    "reverent_touch",
    "presence_time",
    "gifts",
  ],

  // "Steadiness… a partner who keeps their word, repeats the small rituals, and
  // stays warm even when sex isn't happening. Grand romantic gestures move you
  // less than someone who simply shows up."
  "loyal-ritualist": ["acts_of_care", "presence_time", "reverent_touch", "sincere_words", "gifts"],

  // "words and warmth that confirm you're wanted: a clear 'I want you', praise
  // you didn't have to fish for, affection that stays once the moment ends."
  "tender-devotee": ["sincere_words", "reverent_touch", "presence_time", "acts_of_care", "gifts"],

  // "clarity: a partner who says what they want, gives feedback kindly, and
  // follows through the way they said they would. Grand romantic mystery moves
  // you less than one straight sentence."
  "analytical-sexualist": [
    "sincere_words",
    "acts_of_care",
    "presence_time",
    "reverent_touch",
    "gifts",
  ],

  // "gentleness: a partner who sits close without asking for more, and offers
  // touch with no expectation attached. Big, intense declarations move you less."
  "quiet-withdrawer": ["reverent_touch", "presence_time", "acts_of_care", "sincere_words", "gifts"],
};

/** Ranked language order for an archetype slug, or null when unknown. */
export function getLoveLanguageOrder(slug: string | null | undefined): LoveLanguageSlug[] | null {
  return (slug && LOVE_LANGUAGE_ORDER_BY_SLUG[slug]) || null;
}
