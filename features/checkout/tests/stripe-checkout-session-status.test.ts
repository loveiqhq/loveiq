import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@shared/http/ratelimit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 29, resetAt: new Date() }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}));

vi.mock("@shared/observability/logger", () => ({
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

vi.mock("@features/report/server/personalReport", () => ({
  getReportAccessPlanForSubmission: vi.fn(),
  isCheckoutSessionRecorded: vi.fn(),
  resolveSubmissionAccessContext: vi.fn(),
}));

vi.mock("@features/checkout/server/fulfillment", () => ({
  processStripeWebhookEvent: vi.fn(),
}));

import { GET } from "@/app/api/stripe/checkout-session-status/route";
import { processStripeWebhookEvent } from "@features/checkout/server/fulfillment";
import {
  getStripeServerClient,
  isStripeCheckoutEnabled,
} from "@features/checkout/server/stripeCheckout";
import {
  getReportAccessPlanForSubmission,
  isCheckoutSessionRecorded,
  resolveSubmissionAccessContext,
} from "@features/report/server/personalReport";

describe("GET /api/stripe/checkout-session-status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isCheckoutSessionRecorded).mockResolvedValue(true);
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

  /**
   * A returning buyer already holds a plan from an earlier purchase. Answering with that
   * plan sent them back before THIS purchase was written, so they landed on what they had
   * just bought still locked, and the fallback fulfillment never ran for them.
   */
  describe("waits for THIS checkout, not for any plan", () => {
    const stripeWith = (payment_status: string) =>
      ({
        checkout: {
          sessions: {
            retrieve: vi.fn().mockResolvedValue({
              id: "cs_test_second",
              metadata: { reportToken: "rpt_ABCDEFGHIJKLMNOPQRST" },
              amount_total: 0,
              currency: "eur",
              payment_status,
              status: "complete",
            }),
          },
        },
        getApiField: () => "2024-06-20",
      }) as never;

    beforeEach(() => {
      vi.mocked(isStripeCheckoutEnabled).mockReturnValue(true);
      vi.mocked(resolveSubmissionAccessContext).mockResolvedValue({
        submissionId: 63,
        userEmail: "test@example.com",
        userId: 7,
      });
      // The plan from the FIRST purchase.
      vi.mocked(getReportAccessPlanForSubmission).mockResolvedValue({
        accessPlan: "full_report",
        personalReportId: 2,
      } as never);
    });

    const status = async () =>
      (await GET(
        new Request("http://localhost/api/stripe/checkout-session-status?session_id=cs_test_second")
      ).then((r) => r.json())) as { accessPlan: string | null };

    it("answers null until this purchase is recorded, and runs the fallback", async () => {
      vi.mocked(getStripeServerClient).mockReturnValue(stripeWith("paid"));
      vi.mocked(isCheckoutSessionRecorded).mockResolvedValue(false);
      const body = await status();
      expect(body.accessPlan).toBeNull();
      expect(processStripeWebhookEvent).toHaveBeenCalledTimes(1);
    });

    it("answers with the plan once the fallback has recorded it", async () => {
      vi.mocked(getStripeServerClient).mockReturnValue(stripeWith("paid"));
      vi.mocked(isCheckoutSessionRecorded).mockResolvedValueOnce(false).mockResolvedValueOnce(true);
      const body = await status();
      expect(body.accessPlan).toBe("full_report");
    });

    it("rescues a 100%-off checkout too (no_payment_required)", async () => {
      vi.mocked(getStripeServerClient).mockReturnValue(stripeWith("no_payment_required"));
      vi.mocked(isCheckoutSessionRecorded).mockResolvedValue(false);
      await status();
      expect(processStripeWebhookEvent).toHaveBeenCalledTimes(1);
    });
  });
});
