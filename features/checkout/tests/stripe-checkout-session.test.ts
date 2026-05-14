import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/csrf", () => ({
  verifyCsrfToken: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/lib/ratelimit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 9, resetAt: new Date() }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}));

vi.mock("@/lib/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@features/checkout/server/stripeCheckout", () => ({
  STRIPE_CHECKOUT_DISABLED_MESSAGE:
    "Checkout preview only. Payments are not enabled in this environment yet.",
  getStripeCheckoutCustomerEmail: vi.fn(),
  getStripeServerClient: vi.fn(),
  isStripeCheckoutEnabled: vi.fn().mockReturnValue(false),
}));

vi.mock("@/lib/pricing/reportPricing", () => ({
  getReportPriceQuoteForContext: vi.fn(),
  markReportPriceQuoteCheckoutStarted: vi.fn().mockResolvedValue(undefined),
}));

import { POST } from "@/app/api/stripe/checkout-session/route";
import { verifyCsrfToken } from "@/lib/csrf";
import { checkRateLimit } from "@/lib/ratelimit";
import {
  getStripeCheckoutCustomerEmail,
  getStripeServerClient,
  isStripeCheckoutEnabled,
} from "@features/checkout/server/stripeCheckout";
import {
  getReportPriceQuoteForContext,
  markReportPriceQuoteCheckoutStarted,
} from "@/lib/pricing/reportPricing";

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

describe("POST /api/stripe/checkout-session", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(verifyCsrfToken).mockResolvedValue(true);
    vi.mocked(checkRateLimit).mockResolvedValue({
      allowed: true,
      remaining: 9,
      resetAt: new Date(),
    });
    vi.mocked(isStripeCheckoutEnabled).mockReturnValue(false);
    vi.mocked(getStripeCheckoutCustomerEmail).mockResolvedValue("test@example.com");
    vi.mocked(getReportPriceQuoteForContext).mockResolvedValue({
      id: 22,
      plan: "full_report",
      currency: "EUR",
      experimentGroup: "B",
      basePriceBucket: "full_center",
      basePriceCents: 2999,
      currentPriceCents: 2749,
      initialPriceCents: 2999,
      discountMultiplier: 1,
      discountStep: 0,
      pricingClusterId: "B-full_report-full_center-tier_2-desktop-google-serious-engaged-d0",
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
    });
  });

  it("returns the disabled placeholder payload while checkout is not enabled", async () => {
    const res = await POST(
      makeRequest({
        archetype: "Spark Seeker",
        plan: "full_report",
        reportSessionId: "02d88f31-eceb-4402-940d-c8cd98d01848",
      })
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      enabled: false,
      message: "Checkout preview only. Payments are not enabled in this environment yet.",
      reason: "checkout_disabled",
    });
  });

  it("returns 400 when the plan is invalid", async () => {
    const res = await POST(
      makeRequest({
        plan: "invalid",
        reportSessionId: "02d88f31-eceb-4402-940d-c8cd98d01848",
      })
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "Invalid input." });
  });

  it("returns 403 when CSRF verification fails", async () => {
    vi.mocked(verifyCsrfToken).mockResolvedValue(false);

    const res = await POST(
      makeRequest({
        plan: "essentials",
        reportSessionId: "02d88f31-eceb-4402-940d-c8cd98d01848",
      })
    );

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: "Invalid request." });
  });

  it("creates a hosted checkout session and returns the redirect URL", async () => {
    const createSession = vi.fn().mockResolvedValue({
      id: "cs_test_session_123",
      url: "https://checkout.stripe.com/c/pay/cs_test_session_123",
    });

    vi.mocked(isStripeCheckoutEnabled).mockReturnValue(true);
    vi.mocked(getStripeCheckoutCustomerEmail).mockResolvedValue("test@example.com");
    vi.mocked(getStripeServerClient).mockReturnValue({
      checkout: {
        sessions: {
          create: createSession,
        },
      },
    } as never);

    const res = await POST(
      makeRequest({
        archetype: "Spark Seeker",
        plan: "full_report",
        reportSessionId: "02d88f31-eceb-4402-940d-c8cd98d01848",
      })
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      enabled: true,
      url: "https://checkout.stripe.com/c/pay/cs_test_session_123",
    });
    expect(createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        allow_promotion_codes: true,
        cancel_url: "http://localhost/checkout?plan=full_report&archetype=spark-seeker",
        customer_email: "test@example.com",
        line_items: [
          expect.objectContaining({
            price_data: expect.objectContaining({
              currency: "eur",
              unit_amount: 2749,
            }),
          }),
        ],
        metadata: expect.objectContaining({
          archetype: "Spark Seeker",
          requestIp: "127.0.0.1",
          requestUserAgent: "Mozilla/5.0 (Vitest)",
        }),
        success_url:
          "http://localhost/checkout/return?plan=full_report&session_id={CHECKOUT_SESSION_ID}&archetype=spark-seeker",
      })
    );
    expect(markReportPriceQuoteCheckoutStarted).toHaveBeenCalledWith({ quoteId: 22 });
  });

  it("rejects archetype when plan is all_reports (global unlock has no archetype scope)", async () => {
    const res = await POST(
      makeRequest({
        archetype: "Spark Seeker",
        plan: "all_reports",
        reportSessionId: "02d88f31-eceb-4402-940d-c8cd98d01848",
      })
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "Invalid input." });
  });

  it("rejects unknown archetype names", async () => {
    const res = await POST(
      makeRequest({
        archetype: "Not A Real Archetype",
        plan: "full_report",
        reportSessionId: "02d88f31-eceb-4402-940d-c8cd98d01848",
      })
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "Invalid input." });
  });

  it("forwards archetype metadata and success URL slug when full_report + valid archetype", async () => {
    const createSession = vi.fn().mockResolvedValue({
      id: "cs_test_archetype_456",
      url: "https://checkout.stripe.com/c/pay/cs_test_archetype_456",
    });

    vi.mocked(isStripeCheckoutEnabled).mockReturnValue(true);
    vi.mocked(getStripeCheckoutCustomerEmail).mockResolvedValue("test@example.com");
    vi.mocked(getStripeServerClient).mockReturnValue({
      checkout: {
        sessions: {
          create: createSession,
        },
      },
    } as never);

    const res = await POST(
      makeRequest({
        archetype: "Spark Seeker",
        plan: "full_report",
        reportSessionId: "02d88f31-eceb-4402-940d-c8cd98d01848",
      })
    );

    expect(res.status).toBe(200);
    expect(createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          archetype: "Spark Seeker",
          plan: "full_report",
        }),
        success_url:
          "http://localhost/checkout/return?plan=full_report&session_id={CHECKOUT_SESSION_ID}&archetype=spark-seeker",
        cancel_url: "http://localhost/checkout?plan=full_report&archetype=spark-seeker",
      })
    );
  });
});
