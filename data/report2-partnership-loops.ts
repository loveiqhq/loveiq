/**
 * The three loop steps and the exit quote for Challenges in Partnership — the
 * circular orbit diagram (Figma 9114:632, base banner 9157:529).
 *
 * The variant's footer states the contract: "identical spine to the Libido loop.
 * Each archetype swaps the loop name, the three rows and the three steps. All 14
 * need their own." The loop NAME already exists for all 14 as
 * `partnership.result` ("The Resonance Loop", "The Closeness Loop", …) and the
 * rows as `row1..row3`; the three STEPS existed nowhere and the orbit was not
 * rendered at all.
 *
 * NOTE ON THE FIGMA VARIANT: it is labelled "The Restlessness Loop", which is not
 * any archetype's loop name, and its steps mix Spiritual Lover's bid ("I miss
 * us") with Spark Seeker's "confinement". It is a synthetic demo, so it is NOT a
 * verbatim anchor — it only fixes the register. Each entry below is written from
 * THAT archetype's own `row1`/`row2` copy, which maps directly onto the three
 * beats the demo shows:
 *   1 · the bid the reader makes, with their own words quoted
 *   2 · how the partner mishears it
 *   3 · what the partner's reaction then confirms
 * The source row is quoted above each entry.
 */

export interface PartnershipLoop {
  steps: [string, string, string];
  /** The reader's own bid, quoted in the orbit's centre message. */
  exitQuote: string;
}

/** Centre of the orbit; `exitQuote` is spliced in (Figma 9114:645). */
export function partnershipCentreMessage(exitQuote: string): string {
  return `Each step feeds the next — the loop tightens until a bid is named. ${exitQuote}, said plainly, is the exit.`;
}

export const PARTNERSHIP_LOOPS: Record<string, PartnershipLoop> = {
  // "Intimacy feels hollow, so you bid for depth: 'I miss us'" / "hears criticism
  // and pulls back; the pullback confirms your fear"
  "spiritual-lover": {
    steps: ["Bid for depth — “I miss us”", "Heard as criticism", "The pullback confirms the fear"],
    exitQuote: "“I miss us”",
  },

  // "Flatness creeps in, so you bid for spark: 'we never flirt anymore'" / "They
  // hear failure and grip tighter; the tighter grip feels like a trap closing"
  "spark-seeker": {
    steps: [
      "Bid for spark — “we never flirt anymore”",
      "Heard as failure",
      "The tighter grip feels like a trap",
    ],
    exitQuote: "“we never flirt anymore”",
  },

  // "so you ask for more: 'can we get some real time tonight?'" / "They recover
  // through space, you recover through closeness; each one's fix makes the other
  // feel worse"
  "sensual-connector": {
    steps: [
      "Bid for closeness — “can we get some real time?”",
      "Their fix is space, yours is closeness",
      "Each fix makes the other feel worse",
    ],
    exitQuote: "“can we get some real time?”",
  },

  // "so you ask for balance: 'I need you to carry some of this too'" / "They hear
  // an accusation and get defensive; the defensiveness proves you're on your own"
  "relational-nurturer": {
    steps: [
      "Bid for balance — “carry some of this too”",
      "Heard as an accusation",
      "The defensiveness proves you are alone",
    ],
    exitQuote: "“carry some of this too”",
  },

  // "so you reach for it: 'You don't look at me the way you used to'" / "hears
  // 'I'm failing you' and pulls back; the pullback confirms your fear"
  "radiant-performer": {
    steps: [
      "Bid for attention — “you don't look at me”",
      "Heard as “I'm failing you”",
      "The pullback confirms you are unwanted",
    ],
    exitQuote: "“you don't look at me the way you used to”",
  },

  // "so you reach for more: 'I need us to go there again'" / "They hear 'you're
  // not enough' and grip tighter; the grip feels like a cage"
  "explorer-of-edges": {
    steps: [
      "Bid for edge — “let's go there again”",
      "Heard as “you're not enough”",
      "The grip starts to feel like a cage",
    ],
    exitQuote: "“I need us to go there again”",
  },

  // "so you reach for reassurance: 'was that okay?'" / "feel they can never
  // reassure you enough and pull back; the pullback reads as 'I got it wrong'"
  "curious-apprentice": {
    steps: [
      "Bid for reassurance — “was that okay?”",
      "Heard as never reassurable",
      "The pullback reads as getting it wrong",
    ],
    exitQuote: "“was that okay?”",
  },

  // "A partner wants more, so the asks build up" / "Each request lands as
  // pressure; you pull back to protect your calm; the pullback reads as rejection"
  "minimalist-companion": {
    steps: [
      "The asks build up — more often, more spark",
      "Each request lands as pressure",
      "Your pullback reads as rejection",
    ],
    exitQuote: "“this is a lot for me”",
  },

  // "so you ask for room: 'can we slow down and keep this just us?'" / "reads it
  // as pulling away and pushes closer; the push feels like more exposure"
  "emotional-voyeur": {
    steps: [
      "Bid for room — “can we slow down?”",
      "Heard as pulling away",
      "The push closer feels like exposure",
    ],
    exitQuote: "“can we slow down?”",
  },

  // "so you move to fix it: 'I need us to be clear about this'" / "A demand is
  // what your partner hears, so they push back; the pushback reads as disrespect"
  "authority-conductor": {
    steps: [
      "Bid for clarity — “let's be clear about this”",
      "Heard as a demand",
      "The pushback reads as disrespect",
    ],
    exitQuote: "“I need us to be clear about this”",
  },

  // "so you reach for structure: 'I need us to have a rhythm I can count on'" /
  // "They hear an impossible demand and pull toward more freedom; the distance
  // feels like the bond slipping"
  "loyal-ritualist": {
    steps: [
      "Bid for rhythm — “something I can count on”",
      "Heard as an impossible demand",
      "The distance feels like the bond slipping",
    ],
    exitQuote: "“I need a rhythm I can count on”",
  },

  // "so you ask to be reassured: 'Do you still want me?'" / "feels the neediness
  // and eases back; that small distance lands as proof you're too much"
  "tender-devotee": {
    steps: [
      "Bid to be wanted — “do you still want me?”",
      "Heard as neediness",
      "The distance proves you are too much",
    ],
    exitQuote: "“do you still want me?”",
  },

  // "so you ask to talk it through: 'can we work out what's not landing?'" /
  // "starts to feel examined and pulls back; the pulling back reads as one more
  // unsolved problem"
  "analytical-sexualist": {
    steps: [
      "Bid to solve it — “what's not landing?”",
      "Heard as being examined",
      "The pullback reads as one more problem",
    ],
    exitQuote: "“can we work out what's not landing?”",
  },

  // "so you reach for room: 'I need a bit of space right now'" / "They hear it as
  // 'I'm losing you' and move closer to fix it; the extra closeness feels like
  // more pressure"
  "quiet-withdrawer": {
    steps: [
      "Bid for space — “I need a bit of room”",
      "Heard as “I'm losing you”",
      "The closeness that follows feels like pressure",
    ],
    exitQuote: "“I need a bit of space right now”",
  },
};

/** Loop steps + exit quote for an archetype slug, or null when unknown. */
export function getPartnershipLoop(slug: string | null | undefined): PartnershipLoop | null {
  return (slug && PARTNERSHIP_LOOPS[slug]) || null;
}
