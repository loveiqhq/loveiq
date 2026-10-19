/**
 * The EUR 1.99 gate's sale (app/api/stripe/initial-unlock): a checkout session whose plan is
 * `initial` becomes a payment of that plan, which is what opens the Core Archetype
 * (personalReport.ts reads `initialUnlock` from it). It is access only: no tier is written,
 * and the report's own payment fields stay with the purchase that bought the report.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
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
vi.mock("@features/analytics/server/ga4", () => ({ sendGa4PurchaseEvent: vi.fn() }));
vi.mock("@features/analytics/server/posthog", () => ({ sendPosthogPurchaseEvent: vi.fn() }));
const mockResendSend = vi.fn();
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: (...args: unknown[]) => mockResendSend(...args) };
  },
}));
vi.mock("@features/pricing/logic/reportPricing", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@features/pricing/logic/reportPricing")>();
  return { ...actual, markReportPriceQuotePurchased: vi.fn() };
});

import { processStripeWebhookEvent } from "@features/checkout/server/fulfillment";
import {
  ensurePersonalReportForSubmission,
  resolveSubmissionAccessContext,
  unlockAllArchetypesForPersonalReport,
  upsertArchetypeTierForPersonalReport,
} from "@features/report/server/personalReport";
import { sendGa4PurchaseEvent } from "@features/analytics/server/ga4";
import { sendPosthogPurchaseEvent } from "@features/analytics/server/posthog";

const SLACK_URL = "https://hooks.slack.com/services/TEST/PAYMENTS/secret";
const TOKEN = "rpt_ABCDEFGHIJKLMNOPQRST";
const json = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response;

interface Seen {
  method: string;
  url: string;
  body: Record<string, unknown> | null;
}

/** Supabase and Slack as the handler meets them; every request is kept for the assertions. */
function backend({ existingPayment = false }: { existingPayment?: boolean } = {}) {
  const seen: Seen[] = [];
  mockFetchWithTimeout.mockImplementation(
    async (url: string, options?: { body?: string; method?: string }) => {
      const method = options?.method ?? "GET";
      const body = options?.body && method !== "GET" ? safeJson(options.body) : null;
      seen.push({ method, url, body });
      if (url.startsWith("https://hooks.slack.com/")) {
        return { ok: true, status: 200, text: async () => "" } as Response;
      }
      if (url.includes("/rest/v1/payment_webhook_event?stripe_event_id=eq.")) return json([]);
      if (
        url.includes("/rest/v1/payment?stripe_charge_id=eq.") ||
        url.includes("/rest/v1/payment?stripe_payment_intent_id=eq.") ||
        url.includes("/rest/v1/payment?metadata->>checkoutSessionId=eq.")
      ) {
        return json(existingPayment ? [{ id: 99, personal_report_id: 5 }] : []);
      }
      if (url.includes("/rest/v1/survey_submission?id=eq.70&select=")) {
        return json([
          { utm_tracker: null, app_user: { email: "alice@example.com", first_name: "Alice" } },
        ]);
      }
      if (url.includes("/rest/v1/report_access_token?survey_submission_id=eq.70")) {
        return json([{ token: TOKEN }]);
      }
      if (method === "POST" && url.endsWith("/rest/v1/payment")) return json([{ id: 101 }]);
      if (method === "PATCH" && url.includes("/rest/v1/payment?id=eq.")) return json([{ id: 99 }]);
      if (url.includes("/rest/v1/payment_item?payment_id=eq.")) return json([]);
      if (method === "POST" && url.endsWith("/rest/v1/payment_item")) return json([{ id: 11 }]);
      if (method === "PATCH" && url.includes("/rest/v1/personal_report?")) return json([]);
      if (method === "POST" && url.endsWith("/rest/v1/payment_webhook_event")) {
        return json([{ id: 102 }]);
      }
      throw new Error(`Unexpected fetch call: ${method} ${url}`);
    }
  );
  return seen;
}

function safeJson(raw: string): Record<string, unknown> | null {
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

const SESSION_METADATA = {
  archetype: "",
  currentPrice: "1.99",
  gaAnalyticsConsent: "1",
  gaClientId: "123.456",
  plan: "initial",
  reportSessionId: "",
  reportToken: TOKEN,
  unlockSource: "report_gate",
};

function stripe() {
  return {
    charges: { retrieve: vi.fn().mockResolvedValue({ id: "ch_initial_1" }) },
    checkout: {
      sessions: {
        retrieve: vi.fn().mockResolvedValue({
          id: "cs_initial_1",
          amount_total: 199,
          currency: "eur",
          customer: null,
          customer_details: { email: "alice@example.com" },
          metadata: SESSION_METADATA,
          payment_intent: "pi_initial_1",
          payment_status: "paid",
          total_details: { amount_discount: 0 },
        }),
      },
    },
    paymentIntents: {
      retrieve: vi.fn().mockResolvedValue({
        id: "pi_initial_1",
        status: "succeeded",
        latest_charge: "ch_initial_1",
      }),
    },
  };
}

function completed(eventId = "evt_initial_1") {
  return {
    id: eventId,
    type: "checkout.session.completed",
    data: { object: { id: "cs_initial_1", metadata: SESSION_METADATA } },
  } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  __resetSlackDedupForTests();
  process.env.SUPABASE_URL = "https://test.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";
  process.env.SLACK_PAYMENTS_WEBHOOK_URL = SLACK_URL;
  vi.mocked(resolveSubmissionAccessContext).mockResolvedValue({
    submissionId: 70,
    userEmail: "alice@example.com",
    userId: 70,
  });
  vi.mocked(ensurePersonalReportForSubmission).mockResolvedValue({ id: 5 } as never);
  mockResendSend.mockResolvedValue({ data: { id: "email_1" }, error: null });
});

describe("a paid EUR 1.99 Core Archetype", () => {
  it("is recorded as a succeeded payment of plan `initial`, from the gate", async () => {
    const seen = backend();
    await processStripeWebhookEvent({ event: completed(), stripe: stripe() as never });
    const row = seen.find((s) => s.method === "POST" && s.url.endsWith("/rest/v1/payment"))?.body;
    expect(row).toMatchObject({
      amount: 1.99,
      currency: "EUR",
      status: "succeeded",
      personal_report_id: 5,
      user_id: 70,
      description: "LoveIQ Your Core Archetype",
    });
    expect(row?.metadata).toMatchObject({
      plan: "initial",
      unlockSource: "report_gate",
      checkoutSessionId: "cs_initial_1",
      reportToken: TOKEN,
    });
  });

  it("has one payment item, the Core Archetype", async () => {
    const seen = backend();
    await processStripeWebhookEvent({ event: completed(), stripe: stripe() as never });
    const items = seen.filter(
      (s) => s.method === "POST" && s.url.endsWith("/rest/v1/payment_item")
    );
    expect(items).toHaveLength(1);
    expect(items[0]?.body).toMatchObject({ item_name: "Your Core Archetype", unit_price: 1.99 });
  });

  it("writes nothing on the report itself: no payment fields, no archetype tier", async () => {
    const seen = backend();
    await processStripeWebhookEvent({ event: completed(), stripe: stripe() as never });
    expect(seen.filter((s) => s.url.includes("/rest/v1/personal_report?"))).toEqual([]);
    expect(upsertArchetypeTierForPersonalReport).not.toHaveBeenCalled();
    expect(unlockAllArchetypesForPersonalReport).not.toHaveBeenCalled();
  });

  it("tells #payments once, naming the Core Archetype and EUR 1.99", async () => {
    const seen = backend();
    await processStripeWebhookEvent({ event: completed(), stripe: stripe() as never });
    const slack = seen.filter((s) => s.url.startsWith("https://hooks.slack.com/"));
    expect(slack).toHaveLength(1);
    const text = JSON.stringify(slack[0]?.body);
    expect(text).toContain("Your Core Archetype");
    expect(text).toContain("EUR 1.99");
  });

  it("sends the purchase to GA4 and PostHog once, as plan `initial` from the gate", async () => {
    backend();
    await processStripeWebhookEvent({ event: completed(), stripe: stripe() as never });
    expect(vi.mocked(sendGa4PurchaseEvent).mock.calls).toHaveLength(1);
    expect(vi.mocked(sendGa4PurchaseEvent).mock.calls[0]?.[0]).toMatchObject({
      transactionId: "cs_initial_1",
      value: 1.99,
      currency: "EUR",
      itemName: "Your Core Archetype",
      params: { plan: "initial", unlock_source: "report_gate" },
    });
    expect(vi.mocked(sendPosthogPurchaseEvent).mock.calls).toHaveLength(1);
    expect(vi.mocked(sendPosthogPurchaseEvent).mock.calls[0]?.[0]).toMatchObject({
      value: 1.99,
      plan: "initial",
      itemName: "Your Core Archetype",
      params: { unlock_source: "report_gate" },
    });
  });

  it("sends nothing a second time when the same purchase arrives again", async () => {
    const seen = backend({ existingPayment: true });
    await processStripeWebhookEvent({
      event: completed("evt_initial_2"),
      stripe: stripe() as never,
    });
    expect(seen.filter((s) => s.url.startsWith("https://hooks.slack.com/"))).toEqual([]);
    expect(sendGa4PurchaseEvent).not.toHaveBeenCalled();
    expect(sendPosthogPurchaseEvent).not.toHaveBeenCalled();
    expect(mockResendSend).not.toHaveBeenCalled();
  });
});
