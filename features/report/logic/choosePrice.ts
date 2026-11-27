/**
 * What a reader on the "Choose your price" half of the EUR 1.99 page test can pay for the
 * pre-unlock (shared/experiments/gatePriceArm.ts; Marcus's board "Paygate · €1,99 (Figma
 * recreation) copy 3", his hotfix of 27 Nov 2026 to the RFD's "copy 2" of 24 Nov): EUR 1.99
 * ("If money is tight"), 6.99 (recommended, picked as the page opens), 19.99, or an amount they
 * type. Every price opens the same pre-unlock as the EUR 1.99 does, its EUR 10 credit included
 * ("Every price includes €10 off").
 *
 * EUR 0 has had no tile since 27 Nov: a reader who types 0 as their own amount is asked "Are you
 * sure?" first (the board "Custom €0,00 · Are you sure?"), and only its "Yes, continue for free"
 * sends the pick `free`. The pick keeps its name, so every reader of `priceOption: "free"` (the
 * EUR 0 row, its credit, the admin's free claims) reads it as before.
 *
 * One list for the page and the server: the page draws these, and POST
 * /api/stripe/initial-unlock charges only what `chosenPriceCents` gives back for them, never a
 * price the browser names.
 */

export type ChoosePriceOption = "free" | "tight" | "fair" | "support" | "custom";

/** The picks with a tile and a price of their own. */
export type ChoosePriceTileOption = "tight" | "fair" | "support";

/** The three tiles with a price, in the board's order; the fourth is the reader's own amount. */
export const CHOOSE_PRICE_TILES: ReadonlyArray<{
  option: ChoosePriceTileOption;
  cents: number;
}> = [
  { option: "tight", cents: 199 },
  { option: "fair", cents: 699 },
  { option: "support", cents: 1999 },
];

/** The tile picked as the page opens: the board's "Recommended". */
export const CHOOSE_PRICE_DEFAULT: ChoosePriceOption = "fair";

/**
 * The reader's own amount, in cents. The floor is Stripe's: it takes no card payment under
 * EUR 0.50 (reportPricing.ts STRIPE_MIN_CHARGE_CENTS), and EUR 0 is the `free` pick, asked for
 * again on the page. The ceiling keeps a slipped decimal ("699" for 6.99) from becoming a EUR 699
 * charge.
 */
export const CHOOSE_PRICE_CUSTOM_MIN_CENTS = 50;
export const CHOOSE_PRICE_CUSTOM_MAX_CENTS = 10_000;

const OPTIONS: ReadonlySet<unknown> = new Set<ChoosePriceOption>([
  "free",
  "tight",
  "fair",
  "support",
  "custom",
]);

export function isChoosePriceOption(value: unknown): value is ChoosePriceOption {
  return OPTIONS.has(value);
}

/** A tile's price in cents (0 for none: the tiles are a fixed list). */
export function tileCents(option: ChoosePriceTileOption): number {
  return CHOOSE_PRICE_TILES.find((tile) => tile.option === option)?.cents ?? 0;
}

/**
 * What the reader pays for an option, in cents: EUR 0 for `free`, a tile's own price, or for
 * their own amount, the amount when it lies within the floor and the ceiling. Null when it can't
 * be charged.
 */
export function chosenPriceCents(
  option: ChoosePriceOption,
  amountCents?: number | null
): number | null {
  if (option === "free") return 0;
  if (option !== "custom") return tileCents(option) || null;
  if (typeof amountCents !== "number" || !Number.isSafeInteger(amountCents)) return null;
  return amountCents >= CHOOSE_PRICE_CUSTOM_MIN_CENTS &&
    amountCents <= CHOOSE_PRICE_CUSTOM_MAX_CENTS
    ? amountCents
    : null;
}

/**
 * The amount a reader typed, in cents: "6,99", "6.99", "7" and "€ 7" all read, a comma or a
 * point for the cents (a German keyboard's decimal key types a comma). Null for anything else,
 * three decimals included: a price has cents, never a fraction of one.
 */
export function parseAmountCents(text: string): number | null {
  const plain = text.replace(/[\s€]/g, "").replace(",", ".");
  const [whole = "", cents, ...more] = plain.split(".");
  if (more.length > 0 || !/^\d{0,6}$/.test(whole)) return null;
  if (cents !== undefined && !/^\d{0,2}$/.test(cents)) return null;
  if (!whole && !cents) return null;
  return Math.round(Number.parseFloat(plain) * 100);
}

/** An own amount of EUR 0 ("0", "0,00", "€ 0"): the free result, asked about before it is taken. */
export function isFreeOwnAmount(text: string): boolean {
  return parseAmountCents(text) === 0;
}
