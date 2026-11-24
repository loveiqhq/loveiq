import { describe, expect, it } from "vitest";
import {
  CHOOSE_PRICE_CUSTOM_MAX_CENTS,
  CHOOSE_PRICE_CUSTOM_MIN_CENTS,
  CHOOSE_PRICE_DEFAULT,
  CHOOSE_PRICE_TILES,
  chosenPriceCents,
  isChoosePriceOption,
  parseAmountCents,
} from "@features/report/logic/choosePrice";

// Marcus's board "Paygate · €1,99 (Figma recreation) copy 2" (RFD 24 Nov 2026).
describe("the Choose your price tiles", () => {
  it("are the board's: EUR 0, 6.99 recommended and picked first, 19.99, then an own amount", () => {
    expect(CHOOSE_PRICE_TILES).toEqual([
      { option: "free", cents: 0 },
      { option: "fair", cents: 699 },
      { option: "support", cents: 1999 },
    ]);
    expect(CHOOSE_PRICE_DEFAULT).toBe("fair");
  });

  it("charges each tile its own price, whatever amount comes with it", () => {
    expect(chosenPriceCents("free", 500)).toBe(0);
    expect(chosenPriceCents("fair")).toBe(699);
    expect(chosenPriceCents("support", 1)).toBe(1999);
  });

  it("charges an own amount only from Stripe's EUR 0.50 to EUR 100, in whole cents", () => {
    expect(CHOOSE_PRICE_CUSTOM_MIN_CENTS).toBe(50);
    expect(CHOOSE_PRICE_CUSTOM_MAX_CENTS).toBe(10_000);
    expect(chosenPriceCents("custom", 50)).toBe(50);
    expect(chosenPriceCents("custom", 450)).toBe(450);
    expect(chosenPriceCents("custom", 10_000)).toBe(10_000);
    for (const bad of [49, 0, -100, 10_001, 4.5, Number.NaN, null, undefined]) {
      expect(chosenPriceCents("custom", bad)).toBeNull();
    }
  });

  it("knows its options", () => {
    for (const o of ["free", "fair", "support", "custom"])
      expect(isChoosePriceOption(o)).toBe(true);
    for (const o of ["", "Fair", "own", null]) expect(isChoosePriceOption(o)).toBe(false);
  });
});

describe("parseAmountCents", () => {
  it("reads a comma or a point for the cents, with or without the euro sign", () => {
    expect(parseAmountCents("6,99")).toBe(699);
    expect(parseAmountCents("6.99")).toBe(699);
    expect(parseAmountCents("7")).toBe(700);
    expect(parseAmountCents("€ 7")).toBe(700);
    expect(parseAmountCents(" 4,5 ")).toBe(450);
    expect(parseAmountCents(",5")).toBe(50);
    expect(parseAmountCents("0.29")).toBe(29);
    expect(parseAmountCents("12.")).toBe(1200);
  });

  it("reads nothing else: no fractions of a cent, signs, words or thousands", () => {
    for (const bad of ["", " ", "abc", "-5", "6.999", "1.000,50", "6,9,9", "1e3", "€"]) {
      expect(parseAmountCents(bad)).toBeNull();
    }
  });
});
