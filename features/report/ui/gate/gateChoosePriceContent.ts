import { tileCents, type ChoosePriceTileOption } from "@features/report/logic/choosePrice";
import { euros } from "./gateContent";

/**
 * Every word the "Choose your price" half of the EUR 1.99 page test adds to the gate (Marcus's
 * board "Paygate · €1,99 (Figma recreation) copy 2", Claude Design "Paygate exit pages", RFD
 * 24 Nov 2026, and his hotfix of 27 Nov: board "copy 3", EUR 1.99 "If money is tight" in the EUR
 * 0 tile's place, and "Custom €0,00 · Are you sure?"; shared/experiments/gatePriceArm.ts).
 * Everything else on that page is today's gate, word for word (gateContent.ts): the boards only
 * change the headline's first words, the card, the box under it and the sheet an own amount of
 * EUR 0 opens. As the gate's other words (gateContent.ts):
 *   - prices print as the gate prints them, "€6.99" where the board writes "€6,99", and the
 *     income guide's "€2.000" as "€2,000" beside them;
 *   - headings are in the report's 02.10 heading case (logic/titleCase.ts);
 *   - the guarantee, the four lines under it and the badge are today's card's, so the board's
 *     older "4× full chapters" and "Premium Report" stay as the live card words them.
 */

/**
 * The exit page's "Choose your price" buttons (exit/PreUnlockExit.tsx): back on the gate, the
 * gate brings its picker into view (InitialUnlockGate).
 */
export const GATE_PICK_PRICE_EVENT = "iug:pick-price";

export const GATE_CHOOSE_COPY = {
  /** The board's "Unlock your" over today's "Sexual Archetypes". */
  headlineLead: "Unlock Your",
  card: {
    /** "Pay what is fair to you, choose a price.", "fair" in the brand gradient. */
    title: { lead: "Pay What Is ", emph: "Fair", tail: " to You, Choose a Price." },
    /** The tiles' radio group, as the board names it. */
    group: "Choose your price",
    notes: {
      tight: "If money is tight",
      fair: "Recommended",
      support: "Support our research",
    } satisfies Record<ChoosePriceTileOption, string>,
    own: "Your own amount",
    ownPlaceholder: "0.00",
    ownAria: "Your own amount in euros",
    /** Shown only while the typed amount can't be charged (logic/choosePrice.ts). */
    ownRange: (minCents: number, maxCents: number) =>
      `Your own amount can be from ${euros(minCents)} to ${euros(maxCents)}.`,
    cta: {
      /** An own amount of EUR 0: the button opens the "Are you sure?" sheet (`zero`). */
      free: "Get my result for free",
      paid: (cents: number) => `Unlock for ${euros(cents)}`,
      empty: "Enter your amount",
    },
    /** The board's new first line under the guarantee (Mark's "V5", 24 Nov). */
    oneTime: { strong: "One-time payment", text: ", no subscription" },
  },
  why: {
    title: "Why You Choose the Price",
    lead: "We believe in fairness. So you set the price, not us.",
    rows: [
      { strong: "Knowing your sexuality", text: " shouldn’t depend on your budget." },
      {
        strong: "Really can’t afford more?",
        text: ` Then ${euros(tileCents("tight"))} is fair.`,
      },
      {
        strong: "Paying more",
        text: " keeps it affordable for those who can’t, and funds our research.",
      },
    ],
    /** The board's "€1,99" mark on the second row (the EUR 0 mark before 27 Nov). */
    lowMark: euros(tileCents("tight")),
    guide: {
      caption: "A fair guide by monthly net income",
      rows: [
        { income: "Under €500", price: euros(tileCents("tight")), highlight: false },
        { income: "€500 to €2,000", price: euros(tileCents("fair")), highlight: false },
        { income: "Over €2,000", price: `${euros(tileCents("support"))} or more`, highlight: true },
      ],
    },
  },
  /**
   * The board "Custom €0,00 · Are you sure?": the sheet an own amount of EUR 0 opens. Its guide
   * is the box's (`why.guide`), its prices the three tiles', EUR 6.99 picked as it opens.
   */
  zero: {
    /** "Are you sure? €0,00 means free.", the amount in the brand gradient. */
    title: { lead: "Are You Sure? ", amount: "€0.00", tail: " Means Free." },
    body: "That’s okay if money is really tight. We believe in fairness, so you set the price, not us.",
    point: {
      strong: "Every payment",
      text: " keeps LoveIQ affordable for those who can’t pay more, and funds our research.",
    },
    /** The three prices' group, for a screen reader (the board draws no label). */
    prices: "Choose a price",
    cta: (cents: number) => `Unlock for ${euros(cents)}`,
    free: "Yes, continue for free",
    /** The handle at its top, a button for whoever can't swipe. */
    close: "Close",
  },
  sticky: {
    free: "Get my result for free",
    paid: (cents: number) => `Unlock for ${euros(cents)} now`,
    empty: "Enter your amount",
  },
  checkout: {
    /** "Get my result for free" while the free unlock is written. */
    opening: "Opening your result…",
  },
} as const;
