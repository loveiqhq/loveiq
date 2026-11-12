/**
 * The words of Mark's redesigned EUR 1.99 page (Claude Design HcHeTUFfEgmg62qqktHSMU,
 * "€1.99 Pre-Paywall · mobile", artboard 29119cb1f6ae, 12 Nov 2026), in one place. The rest
 * of the page is the gate's own (gateContent.ts).
 *
 * Where the board and today's EUR 1.99 differ, the page says what is true today: a 14-day
 * guarantee, not 7 (Fatih, 02.10); "3x full chapters", as the report counts them; the credit
 * toward "your Full Report", the plan the report sells. The name "Light Report" is the board's,
 * for the change still to come; the page stays behind its switch until that change ships.
 */
export const GATE_REVEAL_COPY = {
  /** Under the ring's number. */
  match: "match",
  ringLabel: (match: number, archetype: string) => `${match}% match with ${archetype}`,
  carouselLabel: "Your Core Archetype, aspect by aspect",
  cardLabel: (i: number, total: number) => `${i} of ${total}`,
  previous: "Previous card",
  next: "Next card",
  dot: (i: number) => `Card ${i}`,
  locked: "Locked, opens with your Light Report",
  why: {
    lead: "Why you should unlock your ",
    emph: "Light Report",
  },
  whyItems: [
    "Discover other archetypes you score high on",
    "Feel more confident in bed",
    "Ask for what you want, without shame",
    "Bring your desire back when it fades",
  ],
  /** The price card's title on this page (the board's "Your Personal Light Report"). */
  cardTitle: "Your Personal Light Report",
} as const;
