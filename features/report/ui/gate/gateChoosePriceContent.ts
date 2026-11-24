import { CHOOSE_PRICE_TILES, type ChoosePriceOption } from "@features/report/logic/choosePrice";
import { euros } from "./gateContent";

/**
 * Every word the "Choose your price" half of the EUR 1.99 page test adds to the gate (Marcus's
 * board "Paygate · €1,99 (Figma recreation) copy 2", Claude Design "Paygate exit pages", RFD
 * 24 Nov 2026; shared/experiments/gatePriceArm.ts). Everything else on that page is today's
 * gate, word for word (gateContent.ts): the board only changes the headline's first words, the
 * card and the box under it. As the gate's other words (gateContent.ts):
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

const tileCents = (option: Exclude<ChoosePriceOption, "custom">) =>
  CHOOSE_PRICE_TILES.find((tile) => tile.option === option)?.cents ?? 0;

export const GATE_CHOOSE_COPY = {
  /** The board's "Unlock your" over today's "Sexual Archetypes". */
  headlineLead: "Unlock Your",
  card: {
    /** "Pay what is fair to you, choose a price.", "fair" in the brand gradient. */
    title: { lead: "Pay What Is ", emph: "Fair", tail: " to You, Choose a Price." },
    /** The tiles' radio group, as the board names it. */
    group: "Choose your price",
    notes: {
      free: "Paying nothing is fair",
      fair: "Recommended",
      support: "Support our research",
    } satisfies Record<Exclude<ChoosePriceOption, "custom">, string>,
    own: "Your own amount",
    ownPlaceholder: "0.00",
    ownAria: "Your own amount in euros",
    /** Shown only while the typed amount can't be charged (logic/choosePrice.ts). */
    ownRange: (minCents: number, maxCents: number) =>
      `Your own amount can be from ${euros(minCents)} to ${euros(maxCents)}.`,
    cta: {
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
      { strong: "Really can’t afford it?", text: " Then paying nothing is fair." },
      {
        strong: "Paying more",
        text: " keeps it free for those who can’t, and funds our research.",
      },
    ],
    /** The board's "€0" mark on the second row. */
    freeMark: euros(tileCents("free")),
    guide: {
      caption: "A fair guide by monthly net income",
      rows: [
        { income: "Under €500", price: euros(tileCents("free")), highlight: false },
        { income: "€500 to €2,000", price: euros(tileCents("fair")), highlight: false },
        { income: "Over €2,000", price: `${euros(tileCents("support"))} or more`, highlight: true },
      ],
    },
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
