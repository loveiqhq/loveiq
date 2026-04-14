import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/csrf", () => ({
  verifyCsrfToken: vi.fn().mockResolvedValue(true),
}));

vi.mock("../../lib/ratelimit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 9, resetAt: new Date() }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}));

vi.mock("../../lib/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("../../lib/checkout/stripeCheckout", () => ({
  STRIPE_CHECKOUT_DISABLED_MESSAGE:
    "Checkout preview only. Payments are not enabled in this environment yet.",
  getStripeCheckoutCustomerEmail: vi.fn(),
  getStripePriceId: vi.fn(),
  getStripeServerClient: vi.fn(),
  isStripeCheckoutEnabled: vi.fn().mockReturnValue(false),
}));

import { POST } from "../../app/api/stripe/checkout-session/route";
import { verifyCsrfToken } from "../../lib/csrf";
import { checkRateLimit } from "../../lib/ratelimit";
import {
  getStripeCheckoutCustomerEmail,
  getStripePriceId,
  getStripeServerClient,
  isStripeCheckoutEnabled,
} from "../../lib/checkout/stripeCheckout";

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/stripe/checkout-session", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-csrf-token": "valid-token",
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
  });

  it("returns the disabled placeholder payload while checkout is not enabled", async () => {
    const res = await POST(
      makeRequest({
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

  it("creates an elements session with the curated payment method shortlist", async () => {
    const createSession = vi.fn().mockResolvedValue({
      client_secret: "cs_test_preview_123",
      id: "cs_test_session_123",
    });

    vi.mocked(isStripeCheckoutEnabled).mockReturnValue(true);
    vi.mocked(getStripeCheckoutCustomerEmail).mockResolvedValue("test@example.com");
    vi.mocked(getStripePriceId).mockReturnValue("price_test_full_report");
    vi.mocked(getStripeServerClient).mockReturnValue({
      checkout: {
        sessions: {
          create: createSession,
        },
      },
    } as never);

    const res = await POST(
      makeRequest({
        plan: "full_report",
        reportSessionId: "02d88f31-eceb-4402-940d-c8cd98d01848",
      })
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      clientSecret: "cs_test_preview_123",
      enabled: true,
    });
    expect(createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        allow_promotion_codes: true,
        customer_email: "test@example.com",
        payment_method_options: {
          us_bank_account: {
            verification_method: "automatic",
          },
        },
        payment_method_types: ["card", "us_bank_account", "amazon_pay", "link"],
        ui_mode: "elements",
      })
    );
  });
});
