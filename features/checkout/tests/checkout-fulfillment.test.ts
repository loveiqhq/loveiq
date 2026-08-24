import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __resetSlackDedupForTests } from "@shared/observability/slack";

const mockFetchWithTimeout = vi.fn();

vi.mock("@shared/http/fetch-with-timeout", () => ({
  fetchWithTimeout: (...args: Parameters<typeof mockFetchWithTimeout>) =>
    mockFetchWithTimeout(...args),
}));

vi.mock("@shared/http/circuit-breaker", () => ({
  getBreaker: () => ({ fire: (fn: () => Promise<unknown>) => fn() }),
}));

vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@features/report/server/personalReport", () => ({
  ensurePersonalReportForSubmission: vi.fn(),
  resolveSubmissionAccessContext: vi.fn(),
  unlockAllArchetypesForPersonalReport: vi.fn(),
  upsertArchetypeTierForPersonalReport: vi.fn(),
}));

// Spread the real module rather than listing exports: the purchase notification
// reads the live price catalogue (getPricingBucketsForPlan) to say which SIDE of
// the price test the buyer was on, and a hand-listed mock silently breaks the
// moment the notification reaches for one more export.
vi.mock("@features/pricing/logic/reportPricing", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@features/pricing/logic/reportPricing")>();
  return { ...actual, markReportPriceQuotePurchased: vi.fn() };
});

import { classifyTraffic, processStripeWebhookEvent } from "@features/checkout/server/fulfillment";
import {
  ensurePersonalReportForSubmission,
  resolveSubmissionAccessContext,
  unlockAllArchetypesForPersonalReport,
  upsertArchetypeTierForPersonalReport,
} from "@features/report/server/personalReport";
import { markReportPriceQuotePurchased } from "@features/pricing/logic/reportPricing";

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
    vi.mocked(upsertArchetypeTierForPersonalReport).mockResolvedValue({});
    vi.mocked(unlockAllArchetypesForPersonalReport).mockResolvedValue({});
  });

  afterEach(() => {
    process.env.SUPABASE_URL = originalSupabaseUrl;
    process.env.SUPABASE_SERVICE_ROLE_KEY = originalSupabaseServiceRoleKey;
    delete process.env.STRIPE_COUPON_100;
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
              forcedPaywallArm: "treatment",
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
        experimentGroup: "A",
        // Forced-paywall arm carried from session metadata → durable payment row
        // for consent-independent conversion/revenue-by-arm analysis.
        forcedPaywallArm: "treatment",
        requestIp: "127.0.0.1",
        requestUserAgent: "Mozilla/5.0 (Vitest)",
        stripePaymentStatus: "no_payment_required",
      })
    );
    expect(paymentItemPayload).toEqual(
      expect.objectContaining({
        item_name: "Just a snapshot",
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
    expect(upsertArchetypeTierForPersonalReport).not.toHaveBeenCalled();
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

    expect(upsertArchetypeTierForPersonalReport).toHaveBeenCalledWith({
      archetype: "Spark Seeker",
      personalReportId: 5,
      tier: "full_report",
    });
  });

  it("bulk-unlocks every archetype on an all_reports purchase", async () => {
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
          return createJsonResponse([{ id: 99 }]);
        }
        if (url.includes("/rest/v1/payment_item?payment_id=eq.99")) {
          return createJsonResponse([]);
        }
        if (options?.method === "POST" && url.endsWith("/rest/v1/payment_item")) {
          return createJsonResponse([{ id: 9 }]);
        }
        if (options?.method === "PATCH" && url.includes("/rest/v1/personal_report?id=eq.5")) {
          return createJsonResponse([]);
        }
        if (options?.method === "POST" && url.endsWith("/rest/v1/payment_webhook_event")) {
          return createJsonResponse([{ id: 100 }]);
        }
        throw new Error(`Unexpected fetch call: ${options?.method ?? "GET"} ${url}`);
      }
    );

    const stripe = {
      charges: { retrieve: vi.fn() },
      checkout: {
        sessions: {
          retrieve: vi.fn().mockResolvedValue({
            id: "cs_test_all_reports_999",
            amount_total: 12949,
            currency: "eur",
            customer: null,
            metadata: {
              plan: "all_reports",
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
        id: "evt_test_all_reports",
        type: "checkout.session.completed",
        data: {
          object: {
            id: "cs_test_all_reports_999",
            metadata: {
              plan: "all_reports",
              reportToken: "rpt_ABCDEFGHIJKLMNOPQRST",
            },
          },
        },
      } as never,
      stripe: stripe as never,
    });

    expect(unlockAllArchetypesForPersonalReport).toHaveBeenCalledWith(5);
    expect(upsertArchetypeTierForPersonalReport).not.toHaveBeenCalled();
  });

  it("all_reports partner-code quote lookup is NOT filtered to full_report (I-2 regression)", async () => {
    // Tier-3's partner 100%-off code is carried by ANY of the buyer's quote rows
    // (resolveNurturePromo scans them all at redemption). Filtering the lookup to
    // plan=full_report meant an all_reports buyer — who may have no full_report
    // quote — never got a code minted. Guard: the lookup keys on the submission
    // only, never plan=full_report. STRIPE_COUPON_100 set so the path runs past
    // the coupon guard to the quote lookup (the mint then no-ops on the unmocked
    // Stripe client — we only assert the query shape here).
    process.env.STRIPE_COUPON_100 = "nurture_100";
    let quoteLookupUrl: string | null = null;

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
          return createJsonResponse([{ id: 99 }]);
        }
        if (url.includes("/rest/v1/payment_item?payment_id=eq.99")) {
          return createJsonResponse([]);
        }
        if (options?.method === "POST" && url.endsWith("/rest/v1/payment_item")) {
          return createJsonResponse([{ id: 9 }]);
        }
        if (options?.method === "PATCH" && url.includes("/rest/v1/personal_report?id=eq.5")) {
          return createJsonResponse([]);
        }
        if (options?.method === "POST" && url.endsWith("/rest/v1/payment_webhook_event")) {
          return createJsonResponse([{ id: 100 }]);
        }
        // The partner-code carrier lookup inside mintAndEmailPartnerCode.
        if (url.includes("/rest/v1/report_price_quote?survey_submission_id=eq.")) {
          quoteLookupUrl = url;
          return createJsonResponse([{ id: 55, metadata: {} }]);
        }
        throw new Error(`Unexpected fetch call: ${options?.method ?? "GET"} ${url}`);
      }
    );

    const stripe = {
      charges: { retrieve: vi.fn() },
      checkout: {
        sessions: {
          retrieve: vi.fn().mockResolvedValue({
            id: "cs_test_all_reports_i2",
            amount_total: 4900,
            currency: "eur",
            customer: null,
            metadata: {
              plan: "all_reports",
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
        id: "evt_test_all_reports_i2",
        type: "checkout.session.completed",
        data: {
          object: {
            id: "cs_test_all_reports_i2",
            metadata: { plan: "all_reports", reportToken: "rpt_ABCDEFGHIJKLMNOPQRST" },
          },
        },
      } as never,
      stripe: stripe as never,
    });

    // The lookup fired and is scoped to the submission — NOT plan=full_report.
    expect(quoteLookupUrl).not.toBeNull();
    expect(quoteLookupUrl).toContain("survey_submission_id=eq.");
    expect(quoteLookupUrl).not.toContain("plan=eq.full_report");
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

    expect(upsertArchetypeTierForPersonalReport).not.toHaveBeenCalled();
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

  it("gracefully marks expired checkout sessions without plan metadata as processed", async () => {
    let webhookProcessed = false;
    mockFetchWithTimeout.mockImplementation(
      async (url: string, options?: { body?: string; method?: string }) => {
        if (url.includes("/rest/v1/payment_webhook_event?stripe_event_id=eq.")) {
          return createJsonResponse([]);
        }
        if (options?.method === "POST" && url.endsWith("/rest/v1/payment_webhook_event")) {
          if (options.body?.includes('"processed":true')) webhookProcessed = true;
          return createJsonResponse([{ id: 200 }]);
        }
        throw new Error(`Unexpected fetch call: ${options?.method ?? "GET"} ${url}`);
      }
    );

    const stripe = {
      charges: { retrieve: vi.fn() },
      checkout: {
        sessions: {
          retrieve: vi.fn().mockResolvedValue({
            id: "cs_test_expired_no_plan",
            amount_total: 0,
            currency: "eur",
            customer: null,
            metadata: {},
            payment_intent: null,
            payment_status: "unpaid",
            total_details: { amount_discount: 0 },
          }),
        },
      },
      paymentIntents: { retrieve: vi.fn() },
    };

    await processStripeWebhookEvent({
      event: {
        id: "evt_test_expired_no_plan",
        type: "checkout.session.expired",
        data: {
          object: {
            id: "cs_test_expired_no_plan",
            metadata: {},
          },
        },
      } as never,
      stripe: stripe as never,
    });

    expect(webhookProcessed).toBe(true);
    expect(upsertArchetypeTierForPersonalReport).not.toHaveBeenCalled();
    expect(unlockAllArchetypesForPersonalReport).not.toHaveBeenCalled();
  });

  it("acks a legacy prepaid-token session (pay-first removed) instead of throwing on missing submission context", async () => {
    // Regression: white pay-first sessions carry `prepaidToken` + `plan` but no
    // submission context. After the pay-first removal they must be acked, not
    // routed into the normal fulfillment path (which would throw
    // stripe_checkout_missing_submission_context → 500 → endless Stripe retries).
    let webhookProcessed = false;
    mockFetchWithTimeout.mockImplementation(
      async (url: string, options?: { body?: string; method?: string }) => {
        if (url.includes("/rest/v1/payment_webhook_event?stripe_event_id=eq.")) {
          return createJsonResponse([]);
        }
        if (options?.method === "POST" && url.endsWith("/rest/v1/payment_webhook_event")) {
          if (options.body?.includes('"processed":true')) webhookProcessed = true;
          return createJsonResponse([{ id: 201 }]);
        }
        throw new Error(`Unexpected fetch call: ${options?.method ?? "GET"} ${url}`);
      }
    );

    const stripe = {
      charges: { retrieve: vi.fn() },
      checkout: { sessions: { retrieve: vi.fn() } },
      paymentIntents: { retrieve: vi.fn() },
    };

    await expect(
      processStripeWebhookEvent({
        event: {
          id: "evt_test_legacy_prepaid_expired",
          type: "checkout.session.expired",
          data: {
            object: {
              id: "cs_live_legacy_prepaid",
              metadata: {
                plan: "full_report",
                prepaidToken: "rpp_legacy",
                landingVariant: "white",
              },
            },
          },
        } as never,
        stripe: stripe as never,
      })
    ).resolves.toBeUndefined();

    expect(webhookProcessed).toBe(true);
    // Guard short-circuits BEFORE the submission-context resolution that throws.
    expect(resolveSubmissionAccessContext).not.toHaveBeenCalled();
    expect(stripe.checkout.sessions.retrieve).not.toHaveBeenCalled();
  });

  describe("Slack purchase notification", () => {
    const SLACK_URL = "https://hooks.slack.com/services/TEST/PAYMENTS/secret";

    beforeEach(() => {
      // notifySlack dedups identical messages for 60s, keyed on the first 100
      // chars of the fallback text. These fixtures all reuse submission #70 with
      // the same plan and amount, so without a reset the 2nd and 3rd assertions
      // would silently receive zero calls. Real buyers have distinct ids.
      __resetSlackDedupForTests();
    });

    /**
     * The purchase ping now sends Block Kit, so the detail lives in `blocks`, not
     * in `text` (which is only the fallback / dead-letter string). Flatten
     * everything Slack will actually display so these assertions cover the whole
     * message.
     */
    function rendered(body: string): string {
      const parsed = JSON.parse(body) as {
        text: string;
        blocks?: Array<{
          text?: { text?: string };
          fields?: Array<{ text?: string }>;
          elements?: Array<{ text?: { text?: string }; url?: string; text_?: string }>;
        }>;
      };
      const parts: string[] = [parsed.text];
      for (const block of parsed.blocks ?? []) {
        if (block.text?.text) parts.push(block.text.text);
        for (const field of block.fields ?? []) if (field.text) parts.push(field.text);
        for (const el of block.elements ?? []) {
          if (typeof el.text === "string") parts.push(el.text);
          else if (el.text?.text) parts.push(el.text.text);
          if (el.url) parts.push(el.url);
        }
      }
      return parts.join("\n");
    }

    function setupHappyPathMocks(
      opts: { existingPayment?: boolean; utmTracker?: string | null } = {}
    ) {
      const slackCalls: Array<{ url: string; body: string }> = [];

      mockFetchWithTimeout.mockImplementation(
        async (
          url: string,
          options?: { body?: string; method?: string; headers?: Record<string, string> }
        ) => {
          // Slack webhook (capture for assertions)
          if (url.startsWith("https://hooks.slack.com/")) {
            slackCalls.push({ url, body: options?.body ?? "" });
            return { ok: true, status: 200, text: async () => "" } as Response;
          }
          if (url.includes("/rest/v1/payment_webhook_event?stripe_event_id=eq.")) {
            return createJsonResponse([]);
          }
          if (
            url.includes("/rest/v1/payment?stripe_charge_id=eq.") ||
            url.includes("/rest/v1/payment?stripe_payment_intent_id=eq.")
          ) {
            return createJsonResponse(opts.existingPayment ? [{ id: 99 }] : []);
          }
          // Recipient lookup for the Slack payload
          if (url.includes("/rest/v1/survey_submission?id=eq.70&select=")) {
            return createJsonResponse([
              {
                utm_tracker: opts.utmTracker ?? null,
                app_user: { email: "Eman@LoveIQ.org", first_name: "Eman" },
              },
            ]);
          }
          if (options?.method === "POST" && url.endsWith("/rest/v1/payment")) {
            return createJsonResponse([{ id: 101 }]);
          }
          if (url.includes("/rest/v1/payment_item?payment_id=eq.")) {
            return createJsonResponse([]);
          }
          if (options?.method === "POST" && url.endsWith("/rest/v1/payment_item")) {
            return createJsonResponse([{ id: 11 }]);
          }
          if (options?.method === "PATCH" && url.includes("/rest/v1/personal_report?id=eq.5")) {
            return createJsonResponse([]);
          }
          if (options?.method === "PATCH" && url.includes("/rest/v1/payment?id=eq.")) {
            return createJsonResponse([]);
          }
          if (options?.method === "POST" && url.endsWith("/rest/v1/payment_webhook_event")) {
            return createJsonResponse([{ id: 102 }]);
          }
          throw new Error(`Unexpected fetch call: ${options?.method ?? "GET"} ${url}`);
        }
      );

      return slackCalls;
    }

    function buildStripe(
      plan: "essentials" | "full_report" | "all_reports",
      archetype?: string,
      paymentIntent: string | null = "pi_test_slack_001",
      forcedPaywallArm?: string,
      landingVariant?: string
    ) {
      return {
        charges: { retrieve: vi.fn().mockResolvedValue({ id: "ch_test_slack_001" }) },
        checkout: {
          sessions: {
            retrieve: vi.fn().mockResolvedValue({
              id: "cs_test_slack_001",
              amount_total: 1999,
              currency: "eur",
              customer: null,
              metadata: {
                plan,
                ...(archetype ? { archetype } : {}),
                ...(forcedPaywallArm ? { forcedPaywallArm } : {}),
                ...(landingVariant ? { landingVariant } : {}),
                reportToken: "rpt_ABCDEFGHIJKLMNOPQRST",
              },
              payment_intent: paymentIntent,
              payment_status: "paid",
              total_details: { amount_discount: 0 },
            }),
          },
        },
        paymentIntents: {
          retrieve: vi.fn().mockResolvedValue({
            id: paymentIntent ?? "pi_test_slack_001",
            // T-04: status field is now required to pass the
            // paymentIntent-vs-event-status re-check in fulfillment.ts.
            // "succeeded" matches the event type and lets fulfillment proceed.
            status: "succeeded",
            latest_charge: "ch_test_slack_001",
          }),
        },
      };
    }

    it("fires one Slack ping with masked email + plan + archetype + amount on first fulfillment", async () => {
      process.env.SLACK_PAYMENTS_WEBHOOK_URL = SLACK_URL;
      const slackCalls = setupHappyPathMocks();

      await processStripeWebhookEvent({
        event: {
          id: "evt_slack_first_fulfillment",
          type: "checkout.session.completed",
          data: {
            object: {
              id: "cs_test_slack_001",
              metadata: {
                plan: "full_report",
                archetype: "Relational Nurturer",
                reportToken: "rpt_ABCDEFGHIJKLMNOPQRST",
              },
            },
          },
        } as never,
        stripe: buildStripe("full_report", "Relational Nurturer") as never,
      });

      expect(slackCalls).toHaveLength(1);
      const body = JSON.parse(slackCalls[0]!.body) as { text: string; username: string };
      const all = rendered(slackCalls[0]!.body);
      expect(body.username).toBe("payment_notification");
      expect(all).toContain("*Eman*");
      // lookupRecipientForSubmission lowercases the email before returning it,
      // so the masked output is also lowercase. It is rendered as a code span so
      // Slack does not treat the mask's asterisks as bold markers.
      expect(all).toContain("`e***@loveiq.org`");
      expect(all).toContain("Just a snapshot");
      expect(all).toContain("Relational Nurturer");
      expect(all).toContain("EUR 19.99");
      // The fallback text must stand alone: it is all that gets dead-lettered on a
      // delivery failure, and its first 100 chars are the 60s dedup key.
      expect(body.text).toContain("Purchase #");
      expect(body.text).toContain("EUR 19.99");
      // No utm_tracker → Direct. No landingVariant → not recorded, stated as such
      // rather than guessed.
      expect(all).toContain("Direct");
      expect(all).toContain("Not recorded");
      // The concluded paywall experiment is NOT listed as one they were "in":
      // nothing randomises it any more, so it is a finished test, not a live arm.
      expect(all).not.toContain("Paywall style");
      // every arm is named in plain English, never as a raw code
      expect(all).not.toContain("white_prev");

      delete process.env.SLACK_PAYMENTS_WEBHOOK_URL;
    });

    it("includes referral source + forced paywall arm in the Slack ping", async () => {
      process.env.SLACK_PAYMENTS_WEBHOOK_URL = SLACK_URL;
      const slackCalls = setupHappyPathMocks({
        utmTracker: JSON.stringify({
          utm_source: "referral",
          utm_medium: "email",
          utm_campaign: "survey_invite",
          // utm_content base64s the referrer email — must NOT be echoed to Slack.
          utm_content: "cmVmZXJyZXJAZXhhbXBsZS5jb20=",
        }),
      });

      await processStripeWebhookEvent({
        event: {
          id: "evt_slack_referral_treatment",
          type: "checkout.session.completed",
          data: {
            object: {
              id: "cs_test_slack_001",
              metadata: {
                plan: "full_report",
                archetype: "Spark Seeker",
                forcedPaywallArm: "treatment",
                reportToken: "rpt_ABCDEFGHIJKLMNOPQRST",
              },
            },
          },
        } as never,
        stripe: buildStripe(
          "full_report",
          "Spark Seeker",
          "pi_test_slack_001",
          "treatment",
          "white"
        ) as never,
      });

      expect(slackCalls).toHaveLength(1);
      const all = rendered(slackCalls[0]!.body);
      expect(all).toContain("Referral");
      // utm values are escaped for Slack (underscore → \_ so it isn't italicised).
      expect(all).toContain("referral / email / survey\\_invite");
      expect(all).toContain("Forced paywall");
      expect(all).toContain("Current homepage");
      // utm_content (base64 referrer email) must never reach Slack — in the
      // fallback text OR in any block.
      expect(all).not.toContain("cmVmZXJyZXJAZXhhbXBsZS5jb20=");

      delete process.env.SLACK_PAYMENTS_WEBHOOK_URL;
    });

    it("includes organic source + closeable paywall arm in the Slack ping", async () => {
      process.env.SLACK_PAYMENTS_WEBHOOK_URL = SLACK_URL;
      const slackCalls = setupHappyPathMocks({
        utmTracker: JSON.stringify({ utm_source: "google", utm_medium: "organic" }),
      });

      await processStripeWebhookEvent({
        event: {
          id: "evt_slack_organic_control",
          type: "checkout.session.completed",
          data: {
            object: {
              id: "cs_test_slack_001",
              metadata: {
                plan: "full_report",
                archetype: "Spark Seeker",
                forcedPaywallArm: "control",
                reportToken: "rpt_ABCDEFGHIJKLMNOPQRST",
              },
            },
          },
        } as never,
        stripe: buildStripe(
          "full_report",
          "Spark Seeker",
          "pi_test_slack_001",
          "control",
          "control"
        ) as never,
      });

      expect(slackCalls).toHaveLength(1);
      const all = rendered(slackCalls[0]!.body);
      expect(all).toContain("Organic");
      expect(all).toContain("Dismissible paywall");
      // landingVariant "control" is the RETIRED round-1 dark arm and must be
      // labelled as itself — not conflated with the round-2 "previous design".
      expect(all).toContain("Original dark homepage");
      expect(all).toContain("retired arm");
      expect(all).not.toContain("Previous homepage");

      delete process.env.SLACK_PAYMENTS_WEBHOOK_URL;
    });

    it("omits archetype suffix on all_reports purchase", async () => {
      process.env.SLACK_PAYMENTS_WEBHOOK_URL = SLACK_URL;
      const slackCalls = setupHappyPathMocks();

      await processStripeWebhookEvent({
        event: {
          id: "evt_slack_all_reports",
          type: "checkout.session.completed",
          data: {
            object: {
              id: "cs_test_slack_001",
              metadata: {
                plan: "all_reports",
                reportToken: "rpt_ABCDEFGHIJKLMNOPQRST",
              },
            },
          },
        } as never,
        stripe: buildStripe("all_reports") as never,
      });

      expect(slackCalls).toHaveLength(1);
      const all = rendered(slackCalls[0]!.body);
      expect(all).toContain("For you & your partner");
      // all_reports unlocks every archetype, so naming one would mislead.
      expect(all).not.toContain("Relational Nurturer");

      delete process.env.SLACK_PAYMENTS_WEBHOOK_URL;
    });

    it("skips the Slack ping when SLACK_PAYMENTS_WEBHOOK_URL is unset", async () => {
      delete process.env.SLACK_PAYMENTS_WEBHOOK_URL;
      const slackCalls = setupHappyPathMocks();

      await processStripeWebhookEvent({
        event: {
          id: "evt_slack_no_env",
          type: "checkout.session.completed",
          data: {
            object: {
              id: "cs_test_slack_001",
              metadata: {
                plan: "full_report",
                archetype: "Spark Seeker",
                reportToken: "rpt_ABCDEFGHIJKLMNOPQRST",
              },
            },
          },
        } as never,
        stripe: buildStripe("full_report", "Spark Seeker") as never,
      });

      expect(slackCalls).toHaveLength(0);
    });

    it("skips the Slack ping on re-delivery (existing payment row)", async () => {
      process.env.SLACK_PAYMENTS_WEBHOOK_URL = SLACK_URL;
      const slackCalls = setupHappyPathMocks({ existingPayment: true });

      await processStripeWebhookEvent({
        event: {
          id: "evt_slack_redelivery",
          type: "checkout.session.completed",
          data: {
            object: {
              id: "cs_test_slack_001",
              metadata: {
                plan: "full_report",
                archetype: "Spark Seeker",
                reportToken: "rpt_ABCDEFGHIJKLMNOPQRST",
              },
            },
          },
        } as never,
        stripe: buildStripe("full_report", "Spark Seeker") as never,
      });

      expect(slackCalls).toHaveLength(0);

      delete process.env.SLACK_PAYMENTS_WEBHOOK_URL;
    });
  });
});

describe("classifyTraffic", () => {
  it("returns Direct when the tracker is null/empty/whitespace", () => {
    for (const input of [null, "", "   "]) {
      expect(classifyTraffic(input)).toEqual({
        bucket: "Direct",
        source: null,
        medium: null,
        campaign: null,
        isGoogleAds: false,
        keyword: null,
        matchType: null,
        network: null,
      });
    }
  });

  it("returns Direct when JSON has no utm_source/medium/campaign", () => {
    expect(classifyTraffic(JSON.stringify({ utm_term: "x" })).bucket).toBe("Direct");
  });

  it("classifies referral (case-insensitive) regardless of campaign", () => {
    expect(classifyTraffic(JSON.stringify({ utm_source: "referral" })).bucket).toBe("Referral");
    expect(classifyTraffic(JSON.stringify({ utm_source: "REFERRAL" })).bucket).toBe("Referral");
    expect(
      classifyTraffic(JSON.stringify({ utm_source: "Referral", utm_campaign: "x" })).bucket
    ).toBe("Referral");
  });

  it("classifies Paid when a campaign is present or medium is a paid medium", () => {
    expect(
      classifyTraffic(JSON.stringify({ utm_source: "google", utm_campaign: "spring" })).bucket
    ).toBe("Paid");
    expect(classifyTraffic(JSON.stringify({ utm_source: "meta", utm_medium: "CPC" })).bucket).toBe(
      "Paid"
    );
  });

  it("classifies Organic when a source exists with no paid/referral signal", () => {
    expect(
      classifyTraffic(JSON.stringify({ utm_source: "google", utm_medium: "organic" })).bucket
    ).toBe("Organic");
  });

  it("falls back to the raw string as source on malformed JSON", () => {
    const result = classifyTraffic("not-json");
    expect(result.source).toBe("not-json");
    expect(result.bucket).toBe("Organic");
  });

  it("ignores non-string utm values without throwing", () => {
    const result = classifyTraffic(JSON.stringify({ utm_source: 123, utm_campaign: true }));
    expect(result).toEqual({
      bucket: "Direct",
      source: null,
      medium: null,
      campaign: null,
      // Google Ads is asserted from the auto-tagging click id, never inferred
      // from utm_source — any link can set that to "google".
      isGoogleAds: false,
      keyword: null,
      matchType: null,
      network: null,
    });
  });

  it("treats a JSON array as having no utm fields (Direct, no crash)", () => {
    expect(classifyTraffic(JSON.stringify(["referral", "email"]))).toEqual({
      bucket: "Direct",
      source: null,
      medium: null,
      campaign: null,
      isGoogleAds: false,
      keyword: null,
      matchType: null,
      network: null,
    });
  });

  it("asserts Google Ads from the click id, never from utm_source", () => {
    // Measured over 30 days: 287 of 335 submissions carried a click id and only
    // 2 carried a campaign, because auto-tagging appends ONLY the click id. So
    // the click id is the proof, and utm_source="google" is not.
    for (const key of ["gclid", "gbraid", "wbraid"]) {
      expect(classifyTraffic(JSON.stringify({ [key]: "abc123" })).isGoogleAds).toBe(true);
    }
    // Anyone can write this on a link; it must not claim a paid Google click.
    expect(classifyTraffic(JSON.stringify({ utm_source: "google" })).isGoogleAds).toBe(false);
    // An empty click id is not a click.
    expect(classifyTraffic(JSON.stringify({ gclid: "   " })).isGoogleAds).toBe(false);
  });

  it("carries ValueTrack detail through when the tracking template supplies it", () => {
    const t = classifyTraffic(
      JSON.stringify({
        gclid: "abc",
        utm_campaign: "brand-eu",
        utm_term: "love language test",
        matchtype: "e",
        network: "g",
      })
    );
    expect(t).toMatchObject({
      isGoogleAds: true,
      campaign: "brand-eu",
      keyword: "love language test",
      matchType: "e",
      network: "g",
    });
  });

  it("caps each utm value length so the Slack message can't overflow", () => {
    const long = "x".repeat(5000);
    const result = classifyTraffic(JSON.stringify({ utm_source: long, utm_campaign: long }));
    expect(result.source!.length).toBeLessThanOrEqual(100);
    expect(result.campaign!.length).toBeLessThanOrEqual(100);
    // A campaign is present → Paid.
    expect(result.bucket).toBe("Paid");
  });

  it("caps the raw-string fallback on malformed JSON", () => {
    const result = classifyTraffic("y".repeat(5000));
    expect(result.source!.length).toBeLessThanOrEqual(100);
  });

  it("never surfaces utm_content (it can hold the referrer email)", () => {
    const result = classifyTraffic(
      JSON.stringify({ utm_source: "referral", utm_content: "secret@example.com" })
    );
    expect(Object.values(result)).not.toContain("secret@example.com");
  });
});
