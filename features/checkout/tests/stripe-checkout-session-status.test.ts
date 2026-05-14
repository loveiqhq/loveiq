import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/ratelimit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 29, resetAt: new Date() }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}));

vi.mock("@/lib/logger", () => ({
  default: { warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@features/checkout/server/stripeCheckout", () => ({
  STRIPE_CHECKOUT_DISABLED_MESSAGE:
    "Checkout preview only. Payments are not enabled in this environment yet.",
  STRIPE_CHECKOUT_SESSION_EXPAND: [
    "discounts.coupon",
    "discounts.promotion_code",
    "discounts.promotion_code.promotion.coupon",
  ],
  getStripeCheckoutPromotionSummary: (session: {
    discounts?: Array<{
      coupon?: {
        id?: string | null;
        amount_off?: number | null;
        name?: string | null;
        percent_off?: number | null;
      } | null;
      promotion_code?: {
        code?: string | null;
      } | null;
    }> | null;
    total_details?: { amount_discount?: number | null } | null;
  }) => {
    const primaryDiscount =
      session.discounts?.find((discount) => discount.promotion_code?.code) ??
      session.discounts?.[0] ??
      null;

    if (!primaryDiscount) {
      return null;
    }

    return {
      couponAmountOff: primaryDiscount.coupon?.amount_off ?? null,
      couponId: primaryDiscount.coupon?.id ?? null,
      couponName: primaryDiscount.coupon?.name ?? null,
      couponPercentOff: primaryDiscount.coupon?.percent_off ?? null,
      discountAmount:
        typeof session.total_details?.amount_discount === "number"
          ? session.total_details.amount_discount / 100
          : null,
      promotionCode: primaryDiscount.promotion_code?.code ?? null,
    };
  },
  getStripeServerClient: vi.fn(),
  isStripeCheckoutEnabled: vi.fn().mockReturnValue(false),
}));

vi.mock("@/lib/report/personalReport", () => ({
  getReportAccessPlanForSubmission: vi.fn(),
  resolveSubmissionAccessContext: vi.fn(),
}));

import { GET } from "@/app/api/stripe/checkout-session-status/route";
import {
  getStripeServerClient,
  isStripeCheckoutEnabled,
} from "@features/checkout/server/stripeCheckout";
import {
  getReportAccessPlanForSubmission,
  resolveSubmissionAccessContext,
} from "@/lib/report/personalReport";

describe("GET /api/stripe/checkout-session-status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isStripeCheckoutEnabled).mockReturnValue(false);
  });

  it("returns the disabled payload while checkout is not enabled", async () => {
    const response = await GET(
      new Request("http://localhost/api/stripe/checkout-session-status?session_id=cs_test_123")
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      enabled: false,
      message: "Checkout preview only. Payments are not enabled in this environment yet.",
      reason: "checkout_disabled",
    });
  });

  it("returns Stripe status plus backend access for the checkout context", async () => {
    vi.mocked(isStripeCheckoutEnabled).mockReturnValue(true);
    vi.mocked(resolveSubmissionAccessContext).mockResolvedValue({
      submissionId: 63,
      userEmail: "test@example.com",
      userId: 7,
    });
    vi.mocked(getReportAccessPlanForSubmission).mockResolvedValue({
      accessPlan: "all_reports",
      personalReportId: 2,
    });
    vi.mocked(getStripeServerClient).mockReturnValue({
      checkout: {
        sessions: {
          retrieve: vi.fn().mockResolvedValue({
            id: "cs_test_123",
            discounts: [
              {
                coupon: {
                  id: "coupon_loveiq_20",
                  amount_off: null,
                  name: "LOVEIQ 20% Off",
                  percent_off: 20,
                },
                promotion_code: {
                  code: "LOVEIQ20",
                  promotion: {
                    coupon: {
                      id: "coupon_loveiq_20",
                      amount_off: null,
                      name: "LOVEIQ 20% Off",
                      percent_off: 20,
                    },
                  },
                },
              },
            ],
            metadata: {
              basePriceBucket: "full_center",
              behavioralBucket: "serious",
              countryTier: "tier_2",
              deviceType: "Desktop",
              discountStep: "1",
              engagementScore: "40",
              experimentGroup: "B",
              initialPrice: "29.99",
              pricingClusterId: "cluster",
              reportSessionId: "02d88f31-eceb-4402-940d-c8cd98d01848",
              reportToken: "rpt_ABCDEFGHIJKLMNOPQRST",
              trafficSource: "google",
            },
            amount_total: 2749,
            currency: "eur",
            payment_status: "paid",
            status: "complete",
            total_details: {
              amount_discount: 550,
            },
          }),
        },
      },
    } as never);

    const response = await GET(
      new Request("http://localhost/api/stripe/checkout-session-status?session_id=cs_test_123")
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      accessPlan: "all_reports",
      enabled: true,
      paymentStatus: "paid",
      purchaseAnalytics: {
        value: 27.49,
        currency: "EUR",
        transaction_id: "cs_test_123",
        pricing_cluster_id: "cluster",
        base_price_bucket: "full_center",
        experiment_group: "B",
        discount_step: 1,
        country_tier: "tier_2",
        device_type: "Desktop",
        traffic_source: "google",
        engagement_score: 40,
        behavioral_bucket: "serious",
        initial_price: 29.99,
        promotion_code: "LOVEIQ20",
        coupon_id: "coupon_loveiq_20",
        coupon_name: "LOVEIQ 20% Off",
        coupon_percent_off: 20,
        discount_amount: 5.5,
      },
      sessionStatus: "complete",
      surveySubmissionId: 63,
    });
    expect(resolveSubmissionAccessContext).toHaveBeenCalledWith({
      reportSessionId: "02d88f31-eceb-4402-940d-c8cd98d01848",
      reportToken: "rpt_ABCDEFGHIJKLMNOPQRST",
    });
    expect(getReportAccessPlanForSubmission).toHaveBeenCalledWith(63);
  });
});
