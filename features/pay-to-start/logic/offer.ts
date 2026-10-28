import { INITIAL_UNLOCK_PLAN } from "@features/report/logic/initialUnlock";
import type { PayToStartWizard } from "./journey";

/**
 * Pay to start the survey (Notion "RFD > Pay to start survey", Figma Report-3.0 1468:720):
 * what is sold before the survey, and how its price reads. Two offers, each with its own
 * page (Marcus, 19.10): the full report ("Full Payments", 1741:3820) and the initial
 * report ("Pre-Payments", 1741:5587).
 *
 * Pure: no environment, no I/O. The server decides the price (`server/offer.ts`), and the
 * landing page and the Stripe session both read that one offer, so the price a visitor is
 * shown is the price they are charged.
 */

/** Every offer. funnel_event.offer's CHECK (20261023150000) lists the same: a test holds it. */
export const PAY_TO_START_OFFER_IDS = ["full", "pre"] as const;
export type PayToStartOfferId = (typeof PAY_TO_START_OFFER_IDS)[number];

export interface PayToStartOffer {
  id: PayToStartOfferId;
  /**
   * What paying unlocks once the survey is submitted. `plan` is the key the payment row
   * and the entitlement carry: the full report, or the initial unlock
   * (features/report/logic/initialUnlock.ts), which is access only and holds no tier.
   */
  grant:
    | { kind: "report_plan"; plan: "full_report" }
    | { kind: "initial_unlock"; plan: typeof INITIAL_UNLOCK_PLAN };
  /** The Stripe line item, the receipt line and the payment_item name (Figma receipt 1475:2114). */
  productName: string;
  defaultPriceCents: number;
  /** The pre-report wizard a buyer of this offer gets, told to the survey by its claim. */
  wizard: PayToStartWizard;
  /** Whether it can be sold: a checkout for an offer that is not is refused. */
  enabled: boolean;
  /** Where its landing page lives (the search ad's URL in Figma 1706:1627). */
  landingPath: string;
}

const FULL_OFFER: PayToStartOffer = {
  id: "full",
  grant: { kind: "report_plan", plan: "full_report" },
  productName: "LoveIQ Survey & Report",
  // EUR 29.99: Marcus, 19.10, "pay to start 29.99€ #full-unlock" (Figma drew EUR 29).
  defaultPriceCents: 2999,
  wizard: "pay_to_start",
  enabled: true,
  landingPath: "/sexual-archetype",
};

/**
 * EUR 1.99: Marcus, 19.10, "pay to start 1.99€ #pre-unlock". The survey, then the report
 * pre-unlocked: the Core Archetype in full and EUR 10 off the full report. Its price is
 * fixed here; the price setting is the full offer's alone.
 */
const PRE_OFFER: PayToStartOffer = {
  id: "pre",
  grant: { kind: "initial_unlock", plan: INITIAL_UNLOCK_PLAN },
  productName: "LoveIQ Survey & Initial Report",
  defaultPriceCents: 199,
  // Five slides: the report map too (Marcus, 20.10; Figma 1899:5255).
  wizard: "pay_to_start_initial",
  enabled: true,
  landingPath: "/sexual-archetype/initial",
};

export function getOfferDefinition(id: PayToStartOfferId): PayToStartOffer {
  switch (id) {
    case "full":
      return FULL_OFFER;
    case "pre":
      return PRE_OFFER;
  }
}

export function isPayToStartOfferId(value: unknown): value is PayToStartOfferId {
  return (PAY_TO_START_OFFER_IDS as readonly unknown[]).includes(value);
}

/**
 * The offer a row or a parameter names. A row from before the offers (June's rows carry no
 * offer) and anything unknown read as the full offer, as they always did.
 */
export function offerDefinitionOf(value: unknown): PayToStartOffer {
  return getOfferDefinition(isPayToStartOfferId(value) ? value : "full");
}

/** The checkout status page, which Stripe returns every buyer to, whichever offer. */
export const PAY_TO_START_STATUS_PATH = "/sexual-archetype/checkout";

/**
 * What follows `session_id` in the status page's address: nothing for the full offer (its
 * address as it always was), `&offer=pre` for the other, so the page's way back and its
 * "Start checkout again" sell what the buyer chose.
 */
export function statusOfferQuery(id: PayToStartOfferId): string {
  return id === "full" ? "" : `&offer=${id}`;
}

/**
 * The prices a setting may hold, in cents. Below EUR 5 a Stripe fee eats most of it and a
 * typo like "29" (EUR 0.29) is caught; above EUR 99 is not a price anyone has proposed.
 */
export const MIN_PRICE_CENTS = 500;
export const MAX_PRICE_CENTS = 9900;

/** A price setting, or null when it is missing or not a whole number of cents in range. */
export function parsePriceCents(raw: string | null | undefined): number | null {
  if (typeof raw !== "string" || !/^\d+$/.test(raw.trim())) return null;
  const cents = Number(raw.trim());
  return Number.isSafeInteger(cents) && cents >= MIN_PRICE_CENTS && cents <= MAX_PRICE_CENTS
    ? cents
    : null;
}

/**
 * "€29" for whole euros (as every price on the Figma page reads), "€19.99" otherwise.
 * en-IE puts the euro sign first, as the rest of the site does (`formatReportPurchasePrice`).
 */
export function formatOfferPrice(cents: number): string {
  const whole = cents % 100 === 0;
  return new Intl.NumberFormat("en-IE", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

/** "€29.00", for the places that show cents whatever the price (the confirmation email). */
export function formatOfferAmount(cents: number): string {
  return new Intl.NumberFormat("en-IE", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}
