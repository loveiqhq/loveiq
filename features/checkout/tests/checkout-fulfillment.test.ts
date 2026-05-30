import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

vi.mock("@features/pricing/logic/reportPricing", () => ({
  markReportPriceQuotePurchased: vi.fn(),
}));

import { processStripeWebhookEvent } from "@features/checkout/server/fulfillment";
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

  describe("Slack purchase notification", () => {
    const SLACK_URL = "https://hooks.slack.com/services/TEST/PAYMENTS/secret";

    function setupHappyPathMocks(opts: { existingPayment?: boolean } = {}) {
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
              { app_user: { email: "Eman@LoveIQ.org", first_name: "Eman" } },
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
      paymentIntent: string | null = "pi_test_slack_001"
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
      expect(body.username).toBe("payment_notification");
      expect(body.text).toContain("*Eman*");
      // lookupRecipientForSubmission lowercases the email before returning it,
      // so the masked output is also lowercase.
      expect(body.text).toContain("e***@loveiq.org");
      expect(body.text).toContain("Full report");
      expect(body.text).toContain("Relational Nurturer");
      expect(body.text).toContain("EUR 19.99");

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
      const body = JSON.parse(slackCalls[0]!.body) as { text: string };
      expect(body.text).toContain("All 14 reports");
      expect(body.text).not.toMatch(/\([A-Z][a-z]+ [A-Z][a-z]+\)/);

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
