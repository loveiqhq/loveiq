// R-06: F-07 partial-refund branch test. The webhook handler for
// `charge.refunded` must only re-lock the report on a FULL refund. A
// partial (goodwill / partial dispute) keeps the user's access.
//
// Test strategy: stub fetchWithTimeout to record PATCH payloads, then run
// the webhook with two refund event shapes and assert the payment status
// + personal_report PATCH behavior in each branch.

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

vi.mock("@shared/observability/slack", () => ({
  notifySlack: vi.fn().mockResolvedValue(undefined),
  escapeSlack: (s: string) => s,
  maskEmail: (s: string) => s,
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

const ORIGINAL_ENV = { ...process.env };

function jsonResp(body: unknown, ok = true) {
  return { ok, json: async () => body } as Response;
}

interface CallRecord {
  url: string;
  method?: string;
  body?: unknown;
}

function setupFetchRouter(): CallRecord[] {
  const calls: CallRecord[] = [];
  mockFetchWithTimeout.mockImplementation(
    async (url: string, options?: { method?: string; body?: string }) => {
      const method = options?.method ?? "GET";
      const body = options?.body ? JSON.parse(options.body) : undefined;
      calls.push({ url, method, body });

      // Idempotency lookup — no prior event.
      if (url.includes("/rest/v1/payment_webhook_event?stripe_event_id=eq.")) {
        return jsonResp([]);
      }
      // Existing payment lookup (the refund handler needs a payment row).
      if (url.includes("/rest/v1/payment?stripe_charge_id=eq.ch_test_refund_123")) {
        return jsonResp([{ id: 41, personal_report_id: 5 }]);
      }
      // Any other payment lookup pattern — empty.
      if (
        url.includes("/rest/v1/payment?stripe_charge_id=") ||
        url.includes("/rest/v1/payment?stripe_payment_intent_id=")
      ) {
        return jsonResp([]);
      }
      // PATCH payment / personal_report — capture body, return success.
      if (method === "PATCH") {
        return jsonResp([]);
      }
      // Webhook event insert / upsert.
      if (
        method === "POST" &&
        (url.endsWith("/rest/v1/payment_webhook_event") ||
          url.includes("/rest/v1/payment_webhook_event?on_conflict="))
      ) {
        return jsonResp([{ id: 99 }]);
      }
      // Fallback — let unknown calls surface as test failure.
      throw new Error(`Unexpected fetch in refund test: ${method} ${url}`);
    }
  );
  return calls;
}

function buildRefundEvent(amountCaptured: number, amountRefunded: number) {
  return {
    id: "evt_test_refund",
    type: "charge.refunded" as const,
    data: {
      object: {
        id: "ch_test_refund_123",
        object: "charge",
        amount: amountCaptured,
        amount_captured: amountCaptured,
        amount_refunded: amountRefunded,
        currency: "eur",
        payment_intent: "pi_test_refund",
        status: "succeeded",
      },
    },
  } as unknown as import("stripe").Stripe.Event;
}

const stripeStub = {
  charges: { retrieve: vi.fn() },
  checkout: { sessions: { retrieve: vi.fn() } },
} as unknown as import("stripe").Stripe;

describe("F-07 partial refund handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SUPABASE_URL = "https://test.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("PARTIAL refund (refunded < captured) keeps payment status=succeeded and does NOT touch personal_report", async () => {
    const calls = setupFetchRouter();
    const event = buildRefundEvent(5000, 2000);

    await processStripeWebhookEvent({ event, stripe: stripeStub });

    const paymentPatch = calls.find(
      (c) => c.method === "PATCH" && c.url.includes("/rest/v1/payment?id=eq.41")
    );
    expect(paymentPatch, "payment PATCH must fire").toBeDefined();
    expect((paymentPatch!.body as Record<string, unknown>).status).toBe("succeeded");

    const reportPatch = calls.find(
      (c) => c.method === "PATCH" && c.url.includes("/rest/v1/personal_report?id=eq.5")
    );
    expect(reportPatch, "personal_report MUST NOT be PATCHed on partial refund").toBeUndefined();
  });

  it("FULL refund (refunded == captured) flips payment status=refunded AND re-locks personal_report", async () => {
    const calls = setupFetchRouter();
    const event = buildRefundEvent(5000, 5000);

    await processStripeWebhookEvent({ event, stripe: stripeStub });

    const paymentPatch = calls.find(
      (c) => c.method === "PATCH" && c.url.includes("/rest/v1/payment?id=eq.41")
    );
    expect((paymentPatch!.body as Record<string, unknown>).status).toBe("refunded");

    // updatePersonalReportPayment writes a PATCH on /rest/v1/personal_report
    // OR an internal helper that hits the same row. Accept either form.
    const reportTouched = calls.some(
      (c) => c.method === "PATCH" && c.url.includes("/rest/v1/personal_report")
    );
    expect(reportTouched, "personal_report MUST be PATCHed on full refund").toBe(true);
  });
});
