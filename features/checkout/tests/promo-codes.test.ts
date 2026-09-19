import { afterEach, describe, expect, it } from "vitest";
import {
  NURTURE_PROMO_CODE_REGEX,
  getCouponIdForStage,
} from "@features/checkout/server/promoCodes";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("NURTURE_PROMO_CODE_REGEX", () => {
  it("accepts 50 / 75 / 100 percent codes", () => {
    expect(NURTURE_PROMO_CODE_REGEX.test("LIQ-50-Ab7K9xQ2")).toBe(true);
    expect(NURTURE_PROMO_CODE_REGEX.test("LIQ-75-Ab7K9xQ2")).toBe(true);
    expect(NURTURE_PROMO_CODE_REGEX.test("LIQ-100-Ab7K9xQ2")).toBe(true);
  });

  it("rejects other percents and malformed codes", () => {
    expect(NURTURE_PROMO_CODE_REGEX.test("LIQ-25-Ab7K9xQ2")).toBe(false);
    expect(NURTURE_PROMO_CODE_REGEX.test("LIQ-100-short")).toBe(false);
    expect(NURTURE_PROMO_CODE_REGEX.test("LIQ-100-Ab7K9xQ2x")).toBe(false);
    expect(NURTURE_PROMO_CODE_REGEX.test("nope")).toBe(false);
  });
});

describe("getCouponIdForStage", () => {
  it("maps post_call + partner → STRIPE_COUPON_100", () => {
    process.env.STRIPE_COUPON_100 = "nurture_100";
    expect(getCouponIdForStage("post_call")).toBe("nurture_100");
    expect(getCouponIdForStage("partner")).toBe("nurture_100");
  });

  it("maps the 72h discount stage to STRIPE_COUPON_50 and returns null for others", () => {
    process.env.STRIPE_COUPON_50 = "nurture_50";
    // Pricing 2.0: the only nurture discount is 72h → 50%. The retired 30h/54h
    // ladder no longer maps to a coupon (historical codes resolve via their
    // stored promotion id, never re-minted here).
    expect(getCouponIdForStage("72h_no_unlock")).toBe("nurture_50");
    expect(getCouponIdForStage("30h_no_unlock")).toBeNull();
    expect(getCouponIdForStage("54h_no_unlock")).toBeNull();
    expect(getCouponIdForStage("78h_no_unlock")).toBeNull();
    expect(getCouponIdForStage("bogus")).toBeNull();
  });
});
