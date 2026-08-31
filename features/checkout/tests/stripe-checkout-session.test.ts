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
  isStripeCheckoutEnabled: vi.fn().mockReturnValue(false),
}));

vi.mock("@features/pricing/logic/reportPricing", () => ({
  getReportPriceQuoteForContext: vi.fn(),
  markReportPriceQuoteCheckoutStarted: vi.fn().mockResolvedValue(undefined),
}));

// Deterministic arm resolution: mirror the real helper (token → itself, no
// token → null) WITHOUT any Supabase round-trip, so the arm assertions don't
// depend on whether a test DB is configured.
vi.mock("@features/report/server/personalReport", () => ({
  resolveReportAccessToken: vi.fn(
    async ({ reportToken }: { reportToken?: string | null }) => reportToken ?? null
  ),
  resolveSubmissionAccessContext: vi.fn().mockResolvedValue(null),
  getReportAccessPlanForSubmission: vi.fn(),
}));

import { POST } from "@/app/api/stripe/checkout-session/route";
import { verifyCsrfToken } from "@shared/http/csrf";
import { checkRateLimit } from "@shared/http/ratelimit";
import {
  getStripeCheckoutCustomerEmail,
  getStripeServerClient,
  isStripeCheckoutEnabled,
} from "@features/checkout/server/stripeCheckout";
import {
  getReportPriceQuoteForContext,
  markReportPriceQuoteCheckoutStarted,
} from "@features/pricing/logic/reportPricing";

/** The quote the route resolves: full report, €27.49, urgency window still open. */
const BASE_QUOTE = {
  id: 22,
  plan: "full_report",
  currency: "EUR",
  experimentGroup: "B",
  basePriceBucket: "full_center",
  basePriceCents: 2999,
  currentPriceCents: 2749,
  chargedPriceCents: 2749,
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
} as const;

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
    vi.mocked(getReportPriceQuoteForContext).mockResolvedValue({ ...BASE_QUOTE });
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
        // Manual promo entry is ON (product decision 2026-06-10) so staff can
        // hand-redeem test codes. Owned codes still auto-apply via discounts[]
        // (?promo= link); the two params are mutually exclusive.
        allow_promotion_codes: true,
        // Backing out on Stripe returns to the REPORT. The /checkout review page
        // that used to catch a cancellation was removed on 2026-08-31.
        cancel_url: "http://localhost/report?archetype=spark-seeker",
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
      }),
      // P-03: second arg carries Stripe RequestOptions including the
      // idempotency key. Shape — not value — is what we pin; the key is a
      // time-bucketed sha256, so we only assert it's a hex string.
      expect.objectContaining({
        idempotencyKey: expect.stringMatching(/^[0-9a-f]{64}$/),
      })
    );
    expect(markReportPriceQuoteCheckoutStarted).toHaveBeenCalledWith({ quoteId: 22 });
  });

  it("no longer stamps a forced-paywall arm into session metadata", async () => {
    // The A/B was removed on 2026-08-31. The key must be absent, not "control":
    // fulfillment copies session metadata onto the durable payment row, so a
    // constant would read downstream as a live arm every buyer was in.
    const createSession = vi.fn().mockResolvedValue({
      id: "cs_test_arm_789",
      url: "https://checkout.stripe.com/c/pay/cs_test_arm_789",
    });

    vi.mocked(isStripeCheckoutEnabled).mockReturnValue(true);
    vi.mocked(getStripeCheckoutCustomerEmail).mockResolvedValue("test@example.com");
    vi.mocked(getStripeServerClient).mockReturnValue({
      checkout: { sessions: { create: createSession } },
    } as never);

    const res = await POST(
      makeRequest({
        archetype: "Spark Seeker",
        plan: "full_report",
        reportSessionId: "02d88f31-eceb-4402-940d-c8cd98d01848",
        reportToken: "rpt_SkDN8YcTxXRivawCVtY6",
      })
    );

    expect(res.status).toBe(200);
    const metadata = createSession.mock.calls[0]![0].metadata as Record<string, unknown>;
    expect(Object.keys(metadata)).not.toContain("forcedPaywallArm");
    // The consent flag rides in the same block and must survive the removal.
    expect(metadata).toHaveProperty("gaAnalyticsConsent");
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
        cancel_url: "http://localhost/report?archetype=spark-seeker",
      }),
      expect.objectContaining({
        idempotencyKey: expect.stringMatching(/^[0-9a-f]{64}$/),
      })
    );
  });

  it("charges chargedPriceCents, never the base currentPriceCents", async () => {
    // The number Stripe receives has to be the one the report showed. `chargedPriceCents`
    // is that number; `currentPriceCents` is the base it was built from. They are equal
    // today — the +2 EUR urgency surcharge that separated them was removed on
    // 2026-08-31 — so this pins WHICH FIELD is read, which is the part that can rot.
    const createSession = vi.fn().mockResolvedValue({
      id: "cs_test_session_charged",
      url: "https://checkout.stripe.com/c/pay/cs_test_session_charged",
    });
    vi.mocked(isStripeCheckoutEnabled).mockReturnValue(true);
    vi.mocked(getStripeCheckoutCustomerEmail).mockResolvedValue("test@example.com");
    vi.mocked(getStripeServerClient).mockReturnValue({
      checkout: { sessions: { create: createSession } },
    } as never);

    vi.mocked(getReportPriceQuoteForContext).mockResolvedValue({
      ...BASE_QUOTE,
      currentPriceCents: 2749,
      chargedPriceCents: 2949,
    });

    const res = await POST(
      makeRequest({
        archetype: "Spark Seeker",
        plan: "full_report",
        reportSessionId: "02d88f31-eceb-4402-940d-c8cd98d01848",
      })
    );

    expect(res.status).toBe(200);
    const session = createSession.mock.calls[0]![0];
    expect(session.line_items[0].price_data.unit_amount).toBe(2949);
    // The urgency metadata went with the surcharge; nothing may reintroduce a
    // second price into the audit trail.
    expect(Object.keys(session.metadata)).not.toContain("urgencySurcharge");
    expect(Object.keys(session.metadata)).not.toContain("urgencyDeadlineAt");
  });
});
