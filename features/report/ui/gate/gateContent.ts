/**
 * Every word on the EUR 1.99 pre-unlock gate (Figma Report-3.0 1604:2374 and the sticky bar
 * 1650:2667), as the frames have them, but:
 *   - the guarantee reads the payload's days (14, the standing rule; the frames say 7);
 *   - prices print from the payload, "€1.99" where the frames write "€1,99";
 *   - headings are in the report's 02.10 heading case (logic/titleCase.ts), as the pricing
 *     modal's are; the frames keep the sentence case they were drawn in.
 */

/** "€1.99", "€10": whole euros print without cents. */
export function euros(cents: number): string {
  return cents % 100 === 0 ? `€${cents / 100}` : `€${(cents / 100).toFixed(2)}`;
}

/**
 * Where "Not ready to unlock yet" leads, as `initial_gate_back` records it. Sync 26.10
 * (Marcus): "there is no such thing as back". Until 28.10 it led to the landing page; now to
 * the gate's exit page (Marcus's "Paygate exit pages", ./exit), which makes the case and asks
 * why, on the report's own URL (`?leave=pre`), and whose "Maybe later" leads to the landing.
 */
export const GATE_NOT_READY_TO = "exit_page";

export const GATE_COPY = {
  notReady: "Not ready to unlock yet",
  badge: "Your Core Archetype was determined",
  /** 1604:2387: the second line in the brand gradient. */
  headline: { lead: "Find Out Your", emph: "Sexual Archetypes" },
  card: {
    badge: "Built from your Answers",
    title: "Your Personal Results",
    description: "Find out your core archetype constellation",
    priceSuffix: "one time payment",
    cta: "Unlock now",
    guarantee: (days: number) => `${days}-day money-back guarantee.`,
    /**
     * The card's four lines. `strong` leads a line in bold: the credit (sync 23.10, Marcus
     * and Mark: "highlight and bold the €10 credit"), which now names what it is for, the
     * Full Report the report's own bar sells (persona walks 24.10: it said "the Premium
     * Report", no plan by that name).
     */
    features: (creditCents: number): ReadonlyArray<{ strong?: string; text: string }> => [
      { text: "Your Core Archetype and what drives it" },
      { text: "How you rank against all 14 archetypes" },
      // Chapters as the report counts them, from Part 2 on (Eman, 27.10): Part 1 is its welcome.
      { text: "3x full chapters + 4x partly open" },
      { strong: `${euros(creditCents)} credit`, text: " toward your Full Report" },
    ],
  },
  paymentsLabel: "Guaranteed Safe & Secure Checkout",
  /** 1665:3276: "your report" in the brand gradient. */
  mapTitle: { lead: "The Questions", emph: "Your Report", tail: " Answers." },
  mapLabels: { inFull: "IN FULL", partlyOpen: "PARTLY OPEN" },
  why: {
    /** 1604:2495: "Archetype" in the brand gradient. */
    title: { lead: "Why Unlock Your ", emph: "Archetype", tail: "?" },
    cards: [
      {
        green: "Money-Back Guarantee.",
        emph: "Zero Risk.",
        body: "Learn about your Core Archetype. If it doesn’t land, every cent back, no questions asked.",
      },
      {
        lead: "Your Core Archetype,",
        emph: " Explained.",
        body: "Which archetype leads for you and what that means for your desire and your relationships.",
      },
      {
        emph: "Insights From Hundreds of Research Papers and Books.",
        body: "Your Archetype is based on insights from hundreds of scientific papers and leading books on sexuality.",
      },
      {
        lead: "Become ",
        emph: "an Expert Around Your Sexuality",
        body: "Learn the essential concepts and language to better understand and improve your sexuality grounded in the latest science and practical wisdom.",
      },
    ] as ReadonlyArray<{ green?: string; lead?: string; emph: string; body: string }>,
  },
  sticky: {
    guarantee: (days: number) => `${days}-day money-back`,
    guaranteeLine: "Guaranteed, no questions asked.",
    cta: (priceCents: number) => `Unlock for ${euros(priceCents)} now`,
  },
  checkout: {
    starting: "Opening secure checkout…",
    failed: "We couldn't prepare secure checkout right now. Please try again.",
    unreachable: "We couldn't reach Stripe right now. Please try again.",
    noUrl: "Stripe checkout could not be started right now. Please try again.",
  },
} as const;

/**
 * 1665:3096: the chapter pitches beside the drawer, each next to the chapter it is about.
 * Questions, so in sentence case as the report's own deep-dive questions are.
 * The first sits beside the report's opening chapter: it pitches Parts 1 and 2.
 */
export const GATE_PITCHES: ReadonlyArray<{
  anchor: string;
  label?: "inFull" | "partlyOpen";
  title: string;
  body?: string;
}> = [
  {
    anchor: "introduction",
    label: "inFull",
    title: "Start with who you are.",
    body: "Your Core Archetype, your constellation and how this report was built.",
  },
  {
    anchor: "typical_beliefs",
    label: "partlyOpen",
    title: "Which rules about sex did you never agree to?",
  },
  {
    anchor: "typical_arousal_accelerators_turn_ons_of_the_core_archetype",
    title: "What turns you on, and what shuts you down?",
  },
  {
    anchor: "challenges_in_partnership",
    title: "Where do you and your partners keep missing each other?",
  },
  {
    anchor: "typical_sexual_fantasy_amp_practice_tendencies",
    title: "Which fantasies belong in your head, and which in your bed?",
  },
];
