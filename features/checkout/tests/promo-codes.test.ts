import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockFetchWithTimeout = vi.fn();
vi.mock("@shared/http/fetch-with-timeout", () => ({
  fetchWithTimeout: (...args: unknown[]) => mockFetchWithTimeout(...args),
}));

import {
  NURTURE_PROMO_CODE_REGEX,
  getCouponIdForStage,
  resolveNurturePromo,
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

/**
 * A reader who bought with an email's one-time code and then bought again in the same tab
 * had the spent code sent again: Stripe refused the session and every retry failed.
 */
describe("resolveNurturePromo — a code a purchase already used", () => {
  const CODE = "LIQ-50-Ab7K9xQ2";
  const json = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
  const stored = (stage: string, code: string) => [
    {
      metadata: {
        nurturePromoCodes: {
          [stage]: {
            code,
            stripePromotionCodeId: "promo_test_1",
            percentOff: 50,
            expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
          },
        },
      },
    },
  ];
  /** The submission's quotes, and the payments that used the code. */
  const serve = (quotes: unknown[], paymentsWithCode: unknown[]) =>
    mockFetchWithTimeout.mockImplementation(async (url: string) => {
      if (url.includes("/rest/v1/report_price_quote?")) return json(quotes);
      if (url.includes("/rest/v1/payment?")) return json(paymentsWithCode);
      throw new Error(`Unexpected fetch: ${url}`);
    });
  const paymentLookup = () =>
    mockFetchWithTimeout.mock.calls
      .map(([url]) => String(url))
      .find((url) => url.includes("/rest/v1/payment?"));

  beforeEach(() => {
    mockFetchWithTimeout.mockReset();
    process.env.SUPABASE_URL = "https://test.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";
  });

  it("applies a code no purchase has used", async () => {
    serve(stored("72h_no_unlock", CODE), []);
    await expect(resolveNurturePromo({ submissionId: 7, userCode: CODE })).resolves.toEqual({
      percentOff: 50,
      stage: "72h_no_unlock",
      stripePromotionCodeId: "promo_test_1",
    });
  });

  it("refuses it once a purchase used it, refunded or not", async () => {
    serve(stored("72h_no_unlock", CODE), [{ id: 9 }]);
    await expect(resolveNurturePromo({ submissionId: 7, userCode: CODE })).resolves.toBeNull();
    // This code, on a purchase that completed: an abandoned session spends nothing.
    expect(paymentLookup()).toContain(`metadata->>promoCode=eq.${CODE}`);
    expect(paymentLookup()).toContain("status=in.(succeeded,refunded,disputed)");
  });

  it("keeps the team's test alias reusable, for several test purchases on one report", async () => {
    serve(stored("team_test", "LIQ-100-TESTONLY"), [{ id: 9 }]);
    await expect(
      resolveNurturePromo({ submissionId: 7, userCode: "LIQ-100-TESTONLY" })
    ).resolves.toMatchObject({ stage: "team_test" });
  });
});
