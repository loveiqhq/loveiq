import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockFetchWithTimeout = vi.fn();

vi.mock("../../lib/fetch-with-timeout", () => ({
  fetchWithTimeout: (...args: Parameters<typeof mockFetchWithTimeout>) =>
    mockFetchWithTimeout(...args),
}));

vi.mock("../../lib/circuit-breaker", () => ({
  getBreaker: () => ({ fire: (fn: () => Promise<unknown>) => fn() }),
}));

vi.mock("../../lib/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("../../lib/report/personalReport", () => ({
  addUnlockedArchetypeForPersonalReport: vi.fn(),
  ensurePersonalReportForSubmission: vi.fn(),
  resolveSubmissionAccessContext: vi.fn(),
}));

vi.mock("../../lib/pricing/reportPricing", () => ({
  markReportPriceQuotePurchased: vi.fn(),
}));

import { processStripeWebhookEvent } from "../../lib/checkout/fulfillment";
import {
  addUnlockedArchetypeForPersonalReport,
  ensurePersonalReportForSubmission,
  resolveSubmissionAccessContext,
} from "../../lib/report/personalReport";
import { markReportPriceQuotePurchased } from "../../lib/pricing/reportPricing";

function createJsonResponse(body: unknown, ok = true) {
  return {
    ok,
    json: async () => body,
  } as Response;
}

describe("checkout fulfillment", () => {
  const originalSupabaseUrl = process.env.SUPABASE_URL;
  const originalSupabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SUPABASE_URL = "https://test.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";
    vi.mocked(resolveSubmissionAccessContext).mockResolvedValue({
      submissionId: 70,
      userEmail: "testsupabase@gmail.com",
      userId: 70,
    });
    vi.mocked(ensurePersonalReportForSubmission).mockResolvedValue({
      id: 5,
    });
    vi.mocked(markReportPriceQuotePurchased).mockResolvedValue(undefined);
    vi.mocked(addUnlockedArchetypeForPersonalReport).mockResolvedValue([]);
  });

  afterEach(() => {
    process.env.SUPABASE_URL = originalSupabaseUrl;
    process.env.SUPABASE_SERVICE_ROLE_KEY = originalSupabaseServiceRoleKey;
  });

  it("persists promo details and request context for a fully discounted checkout", async () => {
    let paymentPayload: Record<string, unknown> | null = null;
    let paymentItemPayload: Record<string, unknown> | null = null;
    let personalReportPayload: Record<string, unknown> | null = null;

    mockFetchWithTimeout.mockImplementation(
      async (url: string, options?: { body?: string; method?: string }) => {
        if (
          url.includes(
            "/rest/v1/payment_webhook_event?stripe_event_id=eq.evt_test_checkout_free&select=id,payment_id,processed&limit=1"
          )
        ) {
          return createJsonResponse([]);
        }

        if (
          url.includes(
            "/rest/v1/payment_webhook_event?stripe_event_id=eq.evt_test_checkout_free&select=id&limit=1"
          )
        ) {
          return createJsonResponse([]);
        }

        if (
          url.includes("/rest/v1/payment?stripe_charge_id=eq.") ||
          url.includes("/rest/v1/payment?stripe_payment_intent_id=eq.")
        ) {
          return createJsonResponse([]);
        }

        if (options?.method === "POST" && url.endsWith("/rest/v1/payment")) {
          paymentPayload = JSON.parse(options.body ?? "{}") as Record<string, unknown>;
          return createJsonResponse([{ id: 41 }]);
        }

        if (url.includes("/rest/v1/payment_item?payment_id=eq.41")) {
          return createJsonResponse([]);
        }

        if (options?.method === "POST" && url.endsWith("/rest/v1/payment_item")) {
          paymentItemPayload = JSON.parse(options.body ?? "{}") as Record<string, unknown>;
          return createJsonResponse([{ id: 1 }]);
        }

        if (options?.method === "PATCH" && url.includes("/rest/v1/personal_report?id=eq.5")) {
          personalReportPayload = JSON.parse(options.body ?? "{}") as Record<string, unknown>;
          return createJsonResponse([]);
        }

        if (options?.method === "POST" && url.endsWith("/rest/v1/payment_webhook_event")) {
          return createJsonResponse([{ id: 42 }]);
        }

        throw new Error(`Unexpected fetch call: ${options?.method ?? "GET"} ${url}`);
      }
    );

    const stripe = {
      charges: {
        retrieve: vi.fn(),
      },
      checkout: {
        sessions: {
          retrieve: vi.fn().mockResolvedValue({
            id: "cs_test_free_123",
            amount_total: 0,
            currency: "eur",
            customer: null,
            discounts: [
              {
                coupon: {
                  id: "coupon_loveiq_100",
                  amount_off: null,
                  name: "LOVEIQ 100% Off",
                  percent_off: 100,
                },
                promotion_code: {
                  code: "LOVEIQ100",
                  promotion: {
                    coupon: {
                      id: "coupon_loveiq_100",
                      amount_off: null,
                      name: "LOVEIQ 100% Off",
                      percent_off: 100,
                    },
                  },
                },
              },
            ],
            metadata: {
              plan: "full_report",
              pricingQuoteId: "8",
              pricingClusterId:
                "A-full_report-full_low_2-tier_2-desktop-direct-consistent-engaged-d0",
              experimentGroup: "A",
              basePriceBucket: "full_low_2",
              discountStep: "0",
              currentPrice: "24.49",
              initialPrice: "24.49",
              countryTier: "tier_2",
              deviceType: "Desktop",
              trafficSource: "direct",
              engagementScore: "40",
              behavioralBucket: "consistent",
              reportSessionId: "",
              reportToken: "rpt_ABCDEFGHIJKLMNOPQRST",
              requestIp: "127.0.0.1",
              requestUserAgent: "Mozilla/5.0 (Vitest)",
            },
            payment_intent: null,
            payment_status: "no_payment_required",
            total_details: {
              amount_discount: 2449,
            },
          }),
        },
      },
      paymentIntents: {
        retrieve: vi.fn(),
      },
    };

    await processStripeWebhookEvent({
      event: {
        id: "evt_test_checkout_free",
        type: "checkout.session.completed",
        data: {
          object: {
            id: "cs_test_free_123",
            metadata: {
              plan: "full_report",
              reportToken: "rpt_ABCDEFGHIJKLMNOPQRST",
            },
          },
        },
      } as never,
      stripe: stripe as never,
    });

    expect(paymentPayload).toEqual(
      expect.objectContaining({
        amount: 0,
        currency: "EUR",
        ip_address: "127.0.0.1",
        pricing_quote_id: 8,
        status: "succeeded",
        user_agent: "Mozilla/5.0 (Vitest)",
      })
    );
    expect(paymentPayload?.metadata).toEqual(
      expect.objectContaining({
        checkoutSessionId: "cs_test_free_123",
        promotionCode: "LOVEIQ100",
        couponId: "coupon_loveiq_100",
        couponName: "LOVEIQ 100% Off",
        couponPercentOff: 100,
        discountAmount: 24.49,
        requestIp: "127.0.0.1",
        requestUserAgent: "Mozilla/5.0 (Vitest)",
        stripePaymentStatus: "no_payment_required",
      })
    );
    expect(paymentItemPayload).toEqual(
      expect.objectContaining({
        item_name: "Full report",
        quantity: 1,
        total_price: 0,
        unit_price: 0,
      })
    );
    expect(personalReportPayload).toEqual(
      expect.objectContaining({
        payment_id: 41,
        payment_status: "succeeded",
        price: 0,
        updated_date_time: expect.any(String),
      })
    );
    expect(markReportPriceQuotePurchased).toHaveBeenCalledWith({ paymentId: 41, quoteId: 8 });
    expect(addUnlockedArchetypeForPersonalReport).not.toHaveBeenCalled();
  });

  it("appends unlocked archetype when full_report checkout includes metadata.archetype", async () => {
    mockFetchWithTimeout.mockImplementation(
      async (url: string, options?: { body?: string; method?: string }) => {
        if (
          url.includes(
            "/rest/v1/payment_webhook_event?stripe_event_id=eq.evt_test_checkout_archetype&select=id,payment_id,processed&limit=1"
          )
        ) {
          return createJsonResponse([]);
        }

        if (
          url.includes(
            "/rest/v1/payment_webhook_event?stripe_event_id=eq.evt_test_checkout_archetype&select=id&limit=1"
          )
        ) {
          return createJsonResponse([]);
        }

        if (
          url.includes("/rest/v1/payment?stripe_charge_id=eq.") ||
          url.includes("/rest/v1/payment?stripe_payment_intent_id=eq.")
        ) {
          return createJsonResponse([]);
        }

        if (options?.method === "POST" && url.endsWith("/rest/v1/payment")) {
          return createJsonResponse([{ id: 77 }]);
        }

        if (url.includes("/rest/v1/payment_item?payment_id=eq.77")) {
          return createJsonResponse([]);
        }

        if (options?.method === "POST" && url.endsWith("/rest/v1/payment_item")) {
          return createJsonResponse([{ id: 7 }]);
        }

        if (options?.method === "PATCH" && url.includes("/rest/v1/personal_report?id=eq.5")) {
          return createJsonResponse([]);
        }

        if (options?.method === "POST" && url.endsWith("/rest/v1/payment_webhook_event")) {
          return createJsonResponse([{ id: 78 }]);
        }

        throw new Error(`Unexpected fetch call: ${options?.method ?? "GET"} ${url}`);
      }
    );

    const stripe = {
      charges: { retrieve: vi.fn() },
      checkout: {
        sessions: {
          retrieve: vi.fn().mockResolvedValue({
            id: "cs_test_archetype_123",
            amount_total: 2999,
            currency: "eur",
            customer: null,
            metadata: {
              archetype: "Spark Seeker",
              plan: "full_report",
              pricingQuoteId: "9",
              pricingClusterId:
                "A-full_report-full_mid_1-tier_2-desktop-direct-consistent-engaged-d0",
              experimentGroup: "A",
              basePriceBucket: "full_mid_1",
              discountStep: "0",
              currentPrice: "29.99",
              initialPrice: "29.99",
              countryTier: "tier_2",
              deviceType: "Desktop",
              trafficSource: "direct",
              engagementScore: "50",
              behavioralBucket: "consistent",
              reportSessionId: "",
              reportToken: "rpt_ABCDEFGHIJKLMNOPQRST",
              requestIp: "127.0.0.1",
              requestUserAgent: "Mozilla/5.0 (Vitest)",
            },
            payment_intent: null,
            payment_status: "paid",
            total_details: { amount_discount: 0 },
          }),
        },
      },
      paymentIntents: { retrieve: vi.fn() },
    };

    await processStripeWebhookEvent({
      event: {
        id: "evt_test_checkout_archetype",
        type: "checkout.session.completed",
        data: {
          object: {
            id: "cs_test_archetype_123",
            metadata: {
              archetype: "Spark Seeker",
              plan: "full_report",
              reportToken: "rpt_ABCDEFGHIJKLMNOPQRST",
            },
          },
        },
      } as never,
      stripe: stripe as never,
    });

    expect(addUnlockedArchetypeForPersonalReport).toHaveBeenCalledWith({
      archetype: "Spark Seeker",
      personalReportId: 5,
    });
  });

  it("does not append unlocked archetype when metadata.archetype is unknown", async () => {
    mockFetchWithTimeout.mockImplementation(
      async (url: string, options?: { body?: string; method?: string }) => {
        if (url.includes("/rest/v1/payment_webhook_event?stripe_event_id=eq.")) {
          return createJsonResponse([]);
        }
        if (
          url.includes("/rest/v1/payment?stripe_charge_id=eq.") ||
          url.includes("/rest/v1/payment?stripe_payment_intent_id=eq.")
        ) {
          return createJsonResponse([]);
        }
        if (options?.method === "POST" && url.endsWith("/rest/v1/payment")) {
          return createJsonResponse([{ id: 88 }]);
        }
        if (url.includes("/rest/v1/payment_item?payment_id=eq.88")) {
          return createJsonResponse([]);
        }
        if (options?.method === "POST" && url.endsWith("/rest/v1/payment_item")) {
          return createJsonResponse([{ id: 8 }]);
        }
        if (options?.method === "PATCH" && url.includes("/rest/v1/personal_report?id=eq.5")) {
          return createJsonResponse([]);
        }
        if (options?.method === "POST" && url.endsWith("/rest/v1/payment_webhook_event")) {
          return createJsonResponse([{ id: 89 }]);
        }
        throw new Error(`Unexpected fetch call: ${options?.method ?? "GET"} ${url}`);
      }
    );

    const stripe = {
      charges: { retrieve: vi.fn() },
      checkout: {
        sessions: {
          retrieve: vi.fn().mockResolvedValue({
            id: "cs_test_unknown_arch_456",
            amount_total: 2999,
            currency: "eur",
            customer: null,
            metadata: {
              archetype: "Not A Real Archetype",
              plan: "full_report",
              pricingQuoteId: "10",
              pricingClusterId: "x",
              experimentGroup: "A",
              basePriceBucket: "full_mid_1",
              discountStep: "0",
              currentPrice: "29.99",
              initialPrice: "29.99",
              countryTier: "tier_2",
              deviceType: "Desktop",
              trafficSource: "direct",
              engagementScore: "50",
              behavioralBucket: "consistent",
              reportSessionId: "",
              reportToken: "rpt_ABCDEFGHIJKLMNOPQRST",
              requestIp: "127.0.0.1",
              requestUserAgent: "Mozilla/5.0 (Vitest)",
            },
            payment_intent: null,
            payment_status: "paid",
            total_details: { amount_discount: 0 },
          }),
        },
      },
      paymentIntents: { retrieve: vi.fn() },
    };

    await processStripeWebhookEvent({
      event: {
        id: "evt_test_checkout_unknown_arch",
        type: "checkout.session.completed",
        data: {
          object: {
            id: "cs_test_unknown_arch_456",
            metadata: {
              archetype: "Not A Real Archetype",
              plan: "full_report",
              reportToken: "rpt_ABCDEFGHIJKLMNOPQRST",
            },
          },
        },
      } as never,
      stripe: stripe as never,
    });

    expect(addUnlockedArchetypeForPersonalReport).not.toHaveBeenCalled();
  });

  it("returns early when the webhook event was already processed", async () => {
    mockFetchWithTimeout.mockImplementation(async (url: string) => {
      if (
        url.includes(
          "/rest/v1/payment_webhook_event?stripe_event_id=eq.evt_test_checkout_duplicate&select=id,payment_id,processed&limit=1"
        )
      ) {
        return createJsonResponse([{ id: 42, payment_id: 41, processed: true }]);
      }

      throw new Error(`Unexpected fetch call: GET ${url}`);
    });

    const stripe = {
      checkout: {
        sessions: {
          retrieve: vi.fn(),
        },
      },
      paymentIntents: {
        retrieve: vi.fn(),
      },
      charges: {
        retrieve: vi.fn(),
      },
    };

    await processStripeWebhookEvent({
      event: {
        id: "evt_test_checkout_duplicate",
        type: "checkout.session.completed",
        data: {
          object: {
            id: "cs_test_duplicate_123",
            metadata: {
              plan: "full_report",
              reportToken: "rpt_ABCDEFGHIJKLMNOPQRST",
            },
          },
        },
      } as never,
      stripe: stripe as never,
    });

    expect(stripe.checkout.sessions.retrieve).not.toHaveBeenCalled();
    expect(markReportPriceQuotePurchased).not.toHaveBeenCalled();
  });
});
