import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@shared/http/csrf", () => ({
  verifyCsrfToken: vi.fn().mockResolvedValue(true),
}));

vi.mock("@shared/http/ratelimit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 9, resetAt: new Date() }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}));

vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@features/checkout/server/stripeCheckout", () => ({
  STRIPE_CHECKOUT_DISABLED_MESSAGE:
    "Checkout preview only. Payments are not enabled in this environment yet.",
  getStripeCheckoutCustomerEmail: vi.fn(),
  getStripeServerClient: vi.fn(),
  isStripeCheckoutEnabled: vi.fn().mockReturnValue(true),
}));

vi.mock("@features/pricing/logic/reportPricing", () => ({
  getReportPriceQuoteForContext: vi.fn(),
  markReportPriceQuoteCheckoutStarted: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@features/checkout/server/promoCodes", async () => {
  const actual = await vi.importActual<typeof import("@features/checkout/server/promoCodes")>(
    "@features/checkout/server/promoCodes"
  );
  return {
    ...actual,
    resolveNurturePromo: vi.fn(),
  };
});

import { POST } from "@/app/api/stripe/checkout-session/route";
import {
  getStripeCheckoutCustomerEmail,
  getStripeServerClient,
  isStripeCheckoutEnabled,
} from "@features/checkout/server/stripeCheckout";
import { getReportPriceQuoteForContext } from "@features/pricing/logic/reportPricing";
import { resolveNurturePromo } from "@features/checkout/server/promoCodes";

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/stripe/checkout-session", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-csrf-token": "valid-token",
      "user-agent": "Mozilla/5.0 (Vitest)",
    },
    body: JSON.stringify(body),
  });
}

const QUOTE = {
  id: 22,
  plan: "full_report" as const,
  currency: "EUR",
  experimentGroup: "B",
  basePriceBucket: "full_center",
  basePriceCents: 5999,
  msrpCents: 5999,
  startingPriceCents: 2999,
  currentPriceCents: 2749,
  initialPriceCents: 2999,
  discountMultiplier: 1,
  discountStep: 0,
  pricingClusterId: "B-full_report-full_center",
  countryTier: "tier_2",
  countryMultiplier: 1,
  deviceType: "Desktop",
  deviceMultiplier: 1.05,
  trafficSource: "google",
  trafficMultiplier: 1.1,
  behavioralBucket: "serious",
  behavioralMultiplier: 1.2,
  engagementScore: 40,
  engagementMultiplier: 1.1,
  reportPreviewViews: 2,
  fantasySignalCount: 1,
  surveyDurationMs: 600000,
  initialPriceTimestamp: "2026-04-14T10:00:00.000Z",
  expiresAt: "2026-05-05T10:00:00.000Z",
  checkoutStartedAt: null,
  purchasedAt: null,
  viewCount: 1,
};

describe("POST /api/stripe/checkout-session (promo wiring)", () => {
  let createSession: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isStripeCheckoutEnabled).mockReturnValue(true);
    vi.mocked(getStripeCheckoutCustomerEmail).mockResolvedValue("test@example.com");
    vi.mocked(getReportPriceQuoteForContext).mockResolvedValue(QUOTE);

    createSession = vi.fn().mockResolvedValue({
      id: "cs_test",
      url: "https://checkout.stripe.com/c/pay/cs_test",
    });
    vi.mocked(getStripeServerClient).mockReturnValue({
      checkout: { sessions: { create: createSession } },
    } as never);
  });

  it("pre-applies promotion code as discounts[] when promo resolves", async () => {
    vi.mocked(resolveNurturePromo).mockResolvedValue({
      stage: "30h_no_unlock",
      percentOff: 50,
      stripePromotionCodeId: "promo_xyz",
    });

    const res = await POST(
      makeRequest({
        archetype: "Spark Seeker",
        plan: "full_report",
        promo: "LIQ-50-Ab7K9xQ2",
        reportSessionId: "02d88f31-eceb-4402-940d-c8cd98d01848",
      })
    );

    expect(res.status).toBe(200);
    expect(createSession).toHaveBeenCalledTimes(1);
    const args = createSession.mock.calls[0][0];
    expect(args.discounts).toEqual([{ promotion_code: "promo_xyz" }]);
    // Mutually exclusive with allow_promotion_codes — must not be set when
    // discounts[] is applied or Stripe rejects the create call.
    expect(args.allow_promotion_codes).toBeUndefined();
    expect(args.metadata).toEqual(
      expect.objectContaining({
        promoCode: "LIQ-50-Ab7K9xQ2",
        promoStage: "30h_no_unlock",
        promoPercentOff: "50",
      })
    );
  });

  it("accepts a 100%-off post_call code and pre-applies it as discounts[]", async () => {
    vi.mocked(resolveNurturePromo).mockResolvedValue({
      stage: "post_call",
      percentOff: 100,
      stripePromotionCodeId: "promo_free",
    });

    const res = await POST(
      makeRequest({
        archetype: "Spark Seeker",
        plan: "full_report",
        promo: "LIQ-100-Ab7K9xQ2",
        reportSessionId: "02d88f31-eceb-4402-940d-c8cd98d01848",
      })
    );

    expect(res.status).toBe(200);
    const args = createSession.mock.calls[0][0];
    expect(args.discounts).toEqual([{ promotion_code: "promo_free" }]);
    expect(args.allow_promotion_codes).toBeUndefined();
    expect(args.metadata).toEqual(
      expect.objectContaining({ promoStage: "post_call", promoPercentOff: "100" })
    );
  });

  it("falls through to allow_promotion_codes when promo is absent", async () => {
    vi.mocked(resolveNurturePromo).mockResolvedValue(null);

    const res = await POST(
      makeRequest({
        archetype: "Spark Seeker",
        plan: "full_report",
        reportSessionId: "02d88f31-eceb-4402-940d-c8cd98d01848",
      })
    );

    expect(res.status).toBe(200);
    expect(createSession).toHaveBeenCalledTimes(1);
    const args = createSession.mock.calls[0][0];
    expect(args.allow_promotion_codes).toBe(true);
    expect(args.discounts).toBeUndefined();
    expect(args.metadata.promoCode).toBeUndefined();
  });

  it("falls through silently when promo resolves to null (unknown/expired/wrong-owner)", async () => {
    vi.mocked(resolveNurturePromo).mockResolvedValue(null);

    const res = await POST(
      makeRequest({
        archetype: "Spark Seeker",
        plan: "full_report",
        // Well-formed but won't match any user's stored code.
        promo: "LIQ-50-ZzZzZzZz",
        reportSessionId: "02d88f31-eceb-4402-940d-c8cd98d01848",
      })
    );

    expect(res.status).toBe(200);
    const args = createSession.mock.calls[0][0];
    expect(args.allow_promotion_codes).toBe(true);
    expect(args.discounts).toBeUndefined();
  });

  it("400s on a promo string that fails the regex", async () => {
    const res = await POST(
      makeRequest({
        archetype: "Spark Seeker",
        plan: "full_report",
        promo: "not-a-valid-code",
        reportSessionId: "02d88f31-eceb-4402-940d-c8cd98d01848",
      })
    );

    expect(res.status).toBe(400);
    expect(resolveNurturePromo).not.toHaveBeenCalled();
  });
});
