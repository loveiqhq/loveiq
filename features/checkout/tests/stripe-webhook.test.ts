import { beforeEach, describe, expect, it, vi } from "vitest";

const mockProcessStripeWebhookEvent = vi.fn();
const mockConstructEvent = vi.fn();
const mockIsStripeCheckoutEnabled = vi.fn();
const mockGetStripeServerClient = vi.fn();

vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@shared/observability/slack", () => ({
  notifySlack: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@features/checkout/server/fulfillment", () => ({
  processStripeWebhookEvent: (...args: unknown[]) => mockProcessStripeWebhookEvent(...args),
}));

vi.mock("@features/checkout/server/stripeCheckout", () => ({
  getStripeServerClient: (...args: unknown[]) => mockGetStripeServerClient(...args),
  isStripeCheckoutEnabled: (...args: unknown[]) => mockIsStripeCheckoutEnabled(...args),
}));

process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
// T-01: tests run in "test mode" (STRIPE_LIVE_MODE unset = false). Every
// mocked event must carry `livemode: false` to match, otherwise the
// livemode guard refuses it and short-circuits without calling
// processStripeWebhookEvent.

import { POST } from "@/app/api/stripe/webhook/route";

function makeRequest(payload = "{}") {
  return new Request("http://localhost/api/stripe/webhook", {
    method: "POST",
    headers: {
      "stripe-signature": "t=1,v1=test",
    },
    body: payload,
  });
}

describe("POST /api/stripe/webhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
    // Deterministic baseline: no live key, no override → expected mode = test.
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_LIVE_MODE;
    mockIsStripeCheckoutEnabled.mockReturnValue(true);
    mockGetStripeServerClient.mockReturnValue({
      webhooks: {
        constructEvent: mockConstructEvent,
      },
    });
  });

  it("returns 503 when checkout is disabled", async () => {
    mockIsStripeCheckoutEnabled.mockReturnValue(false);

    const response = await POST(makeRequest());

    expect(response.status).toBe(503);
  });

  it("processes a verified Stripe event", async () => {
    mockConstructEvent.mockReturnValue({
      id: "evt_test_123",
      type: "checkout.session.completed",
      livemode: false,
      data: { object: { id: "cs_test_123" } },
    });

    const response = await POST(makeRequest('{"id":"evt_test_123"}'));

    expect(response.status).toBe(200);
    expect(mockProcessStripeWebhookEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: expect.objectContaining({ id: "evt_test_123" }),
      })
    );
  });

  it("T-01: refuses live-mode event in test-mode env (and doesn't call fulfillment)", async () => {
    mockConstructEvent.mockReturnValue({
      id: "evt_live_in_test",
      type: "checkout.session.completed",
      livemode: true,
      data: { object: { id: "cs_live_123" } },
    });

    const response = await POST(makeRequest('{"id":"evt_live_in_test"}'));

    // 200 to stop Stripe retries — the mismatch is operator-config, not transient.
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.reason).toBe("livemode_mismatch");
    expect(mockProcessStripeWebhookEvent).not.toHaveBeenCalled();
  });

  it("T-01: PROCESSES a live event when the secret key is live, with NO STRIPE_LIVE_MODE set (self-config; the prod-footgun fix)", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_live_abc123"; // live key, no override
    mockConstructEvent.mockReturnValue({
      id: "evt_live_prod",
      type: "checkout.session.completed",
      livemode: true,
      data: { object: { id: "cs_live_123" } },
    });

    const response = await POST(makeRequest('{"id":"evt_live_prod"}'));

    expect(response.status).toBe(200);
    expect(mockProcessStripeWebhookEvent).toHaveBeenCalledWith(
      expect.objectContaining({ event: expect.objectContaining({ id: "evt_live_prod" }) })
    );
  });

  it("T-01: a live key still REFUSES a test event (protects prod from sandbox events)", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_live_abc123";
    mockConstructEvent.mockReturnValue({
      id: "evt_test_in_prod",
      type: "checkout.session.completed",
      livemode: false,
      data: { object: { id: "cs_test_123" } },
    });

    const response = await POST(makeRequest('{"id":"evt_test_in_prod"}'));
    const body = await response.json();
    expect(body.reason).toBe("livemode_mismatch");
    expect(mockProcessStripeWebhookEvent).not.toHaveBeenCalled();
  });

  it("T-01: a stale STRIPE_LIVE_MODE=false can NOT downgrade a live key (footgun-proof)", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_live_abc123"; // live key...
    process.env.STRIPE_LIVE_MODE = "false"; // ...stale/wrong env — must be ignored
    mockConstructEvent.mockReturnValue({
      id: "evt_live_resilient",
      type: "checkout.session.completed",
      livemode: true,
      data: { object: { id: "cs_live_123" } },
    });

    const response = await POST(makeRequest('{"id":"evt_live_resilient"}'));

    // The live key wins: the real purchase is still processed (the exact prod
    // bug this fix prevents — a stale env no longer refuses live webhooks).
    expect(response.status).toBe(200);
    expect(mockProcessStripeWebhookEvent).toHaveBeenCalledWith(
      expect.objectContaining({ event: expect.objectContaining({ id: "evt_live_resilient" }) })
    );
  });

  it("T-01: STRIPE_LIVE_MODE=true opt-in expects live even with a non-live key", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_abc123";
    process.env.STRIPE_LIVE_MODE = "true"; // explicit opt-in adds live-expectation
    mockConstructEvent.mockReturnValue({
      id: "evt_optin_live",
      type: "checkout.session.completed",
      livemode: true,
      data: { object: { id: "cs_live_123" } },
    });

    const response = await POST(makeRequest('{"id":"evt_optin_live"}'));
    expect(response.status).toBe(200);
    expect(mockProcessStripeWebhookEvent).toHaveBeenCalledWith(
      expect.objectContaining({ event: expect.objectContaining({ id: "evt_optin_live" }) })
    );
  });

  it("returns 400 when signature verification fails", async () => {
    mockConstructEvent.mockImplementation(() => {
      throw new Error("Unable to extract timestamp and signatures from header");
    });

    const response = await POST(makeRequest());

    expect(response.status).toBe(400);
  });

  it("returns 503 when the stripe-signature header is missing", async () => {
    const req = new Request("http://localhost/api/stripe/webhook", {
      method: "POST",
      body: "{}", // no stripe-signature header
    });
    const response = await POST(req);
    expect(response.status).toBe(503);
    expect(mockConstructEvent).not.toHaveBeenCalled();
  });

  it("returns 503 when STRIPE_WEBHOOK_SECRET is unset", async () => {
    delete process.env.STRIPE_WEBHOOK_SECRET;
    const response = await POST(makeRequest());
    expect(response.status).toBe(503);
    expect(mockConstructEvent).not.toHaveBeenCalled();
  });

  it("returns 400 (not 500) on a MISMATCHED signature — forged request, no Stripe retry", async () => {
    mockConstructEvent.mockImplementation(() => {
      throw new Error("No signatures found matching the expected signature for payload");
    });
    const response = await POST(makeRequest());
    expect(response.status).toBe(400);
    expect(mockProcessStripeWebhookEvent).not.toHaveBeenCalled();
  });

  it("returns 400 on a stale timestamp (outside tolerance)", async () => {
    mockConstructEvent.mockImplementation(() => {
      throw new Error("Timestamp outside the tolerance zone");
    });
    const response = await POST(makeRequest());
    expect(response.status).toBe(400);
  });

  it("returns 400 on any StripeSignatureVerificationError type", async () => {
    mockConstructEvent.mockImplementation(() => {
      const err = new Error("anything") as Error & { type?: string };
      err.type = "StripeSignatureVerificationError";
      throw err;
    });
    const response = await POST(makeRequest());
    expect(response.status).toBe(400);
  });

  it("returns 500 when fulfillment fails after signature verification", async () => {
    mockConstructEvent.mockReturnValue({
      id: "evt_test_123",
      type: "checkout.session.completed",
      livemode: false,
      data: { object: { id: "cs_test_123" } },
    });
    mockProcessStripeWebhookEvent.mockRejectedValue(new Error("payment_create_failed"));

    const response = await POST(makeRequest());

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "Webhook processing failed." });
  });

  // R-27: out-of-order Stripe events. Real Stripe deliveries can land in any
  // order — webhook delivery is async, retries happen. These tests pin down
  // that the route delegates events as-is to fulfillment regardless of
  // semantic order; fulfillment is responsible for state-machine correctness.
  it("R-27: accepts charge.refunded arriving before checkout.session.completed", async () => {
    mockConstructEvent.mockReturnValue({
      id: "evt_refund_first",
      type: "charge.refunded",
      livemode: false,
      data: {
        object: {
          id: "ch_xyz",
          amount_captured: 5000,
          amount_refunded: 5000,
          currency: "eur",
        },
      },
    });
    mockProcessStripeWebhookEvent.mockResolvedValue(undefined);

    const response = await POST(makeRequest('{"id":"evt_refund_first"}'));

    expect(response.status).toBe(200);
    expect(mockProcessStripeWebhookEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: expect.objectContaining({ type: "charge.refunded" }),
      })
    );
  });

  it("R-27: accepts charge.dispute.created after a refund event", async () => {
    mockConstructEvent.mockReturnValue({
      id: "evt_dispute_after_refund",
      type: "charge.dispute.created",
      livemode: false,
      data: { object: { id: "dp_test", charge: "ch_xyz", status: "warning_needs_response" } },
    });
    mockProcessStripeWebhookEvent.mockResolvedValue(undefined);

    const response = await POST(makeRequest('{"id":"evt_dispute_after_refund"}'));

    expect(response.status).toBe(200);
    expect(mockProcessStripeWebhookEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: expect.objectContaining({ type: "charge.dispute.created" }),
      })
    );
  });
});
