import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/ratelimit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 29, resetAt: new Date() }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}));

vi.mock("../../lib/logger", () => ({
  default: { warn: vi.fn(), error: vi.fn() },
}));

vi.mock("../../lib/checkout/stripeCheckout", () => ({
  STRIPE_CHECKOUT_DISABLED_MESSAGE:
    "Checkout preview only. Payments are not enabled in this environment yet.",
  getStripeServerClient: vi.fn(),
  isStripeCheckoutEnabled: vi.fn().mockReturnValue(false),
}));

vi.mock("../../lib/report/personalReport", () => ({
  getReportAccessPlanForSubmission: vi.fn(),
  resolveSubmissionAccessContext: vi.fn(),
}));

import { GET } from "../../app/api/stripe/checkout-session-status/route";
import { getStripeServerClient, isStripeCheckoutEnabled } from "../../lib/checkout/stripeCheckout";
import {
  getReportAccessPlanForSubmission,
  resolveSubmissionAccessContext,
} from "../../lib/report/personalReport";

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
      },
      sessionStatus: "complete",
    });
    expect(resolveSubmissionAccessContext).toHaveBeenCalledWith({
      reportSessionId: "02d88f31-eceb-4402-940d-c8cd98d01848",
      reportToken: "rpt_ABCDEFGHIJKLMNOPQRST",
    });
    expect(getReportAccessPlanForSubmission).toHaveBeenCalledWith(63);
  });
});
