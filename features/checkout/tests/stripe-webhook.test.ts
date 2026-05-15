import { beforeEach, describe, expect, it, vi } from "vitest";

const mockProcessStripeWebhookEvent = vi.fn();
const mockConstructEvent = vi.fn();
const mockIsStripeCheckoutEnabled = vi.fn();
const mockGetStripeServerClient = vi.fn();

vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), error: vi.fn() },
}));

vi.mock("@features/checkout/server/fulfillment", () => ({
  processStripeWebhookEvent: (...args: unknown[]) => mockProcessStripeWebhookEvent(...args),
}));

vi.mock("@features/checkout/server/stripeCheckout", () => ({
  getStripeServerClient: (...args: unknown[]) => mockGetStripeServerClient(...args),
  isStripeCheckoutEnabled: (...args: unknown[]) => mockIsStripeCheckoutEnabled(...args),
}));

process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";

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

  it("returns 400 when signature verification fails", async () => {
    mockConstructEvent.mockImplementation(() => {
      throw new Error("Unable to extract timestamp and signatures from header");
    });

    const response = await POST(makeRequest());

    expect(response.status).toBe(400);
  });

  it("returns 500 when fulfillment fails after signature verification", async () => {
    mockConstructEvent.mockReturnValue({
      id: "evt_test_123",
      type: "checkout.session.completed",
      data: { object: { id: "cs_test_123" } },
    });
    mockProcessStripeWebhookEvent.mockRejectedValue(new Error("payment_create_failed"));

    const response = await POST(makeRequest());

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "Webhook processing failed." });
  });
});
