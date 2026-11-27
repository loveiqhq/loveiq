import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@shared/http/csrf", () => ({
  verifyCsrfToken: vi.fn().mockResolvedValue(true),
}));
vi.mock("@shared/http/ratelimit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 9, resetAt: new Date() }),
  getClientIp: vi.fn().mockReturnValue("203.0.113.9"),
}));
vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@features/checkout/server/stripeCheckout", () => ({
  STRIPE_CHECKOUT_DISABLED_MESSAGE:
    "Checkout preview only. Payments are not enabled in this environment yet.",
  getStripeCheckoutCustomerEmail: vi.fn(),
  // As the real one when Stripe Tax is off; with it on, see stripe-automatic-tax.test.ts.
  createCheckoutSession: (
    stripe: { checkout: { sessions: { create: (p: unknown, o: unknown) => unknown } } },
    params: unknown,
    idempotencyKey: string
  ) => stripe.checkout.sessions.create(params, { idempotencyKey }),
  getStripeServerClient: vi.fn(),
  isStripeCheckoutEnabled: vi.fn(),
}));
vi.mock("@features/report/server/personalReport", () => ({
  resolveSubmissionAccessContext: vi.fn(),
  ensurePersonalReportForSubmission: vi.fn(),
  lookupReportTokenBySubmissionId: vi.fn(),
  lookupSubmissionSessionId: vi.fn(),
}));
vi.mock("@features/report/server/gateRevealSwitch", () => ({
  gatePriceArmFor: vi.fn(),
}));
vi.mock("@features/report/server/initialUnlockGift", () => ({
  grantChosenFreeInitialUnlock: vi.fn(),
}));
vi.mock("@features/report/server/initialUnlockGate", () => ({
  ownerMeetsInitialGate: vi.fn(),
}));
vi.mock("@features/attribution/server/journey-message", () => ({
  refreshJourneyMessage: vi.fn().mockResolvedValue(undefined),
}));

import { POST } from "@/app/api/stripe/initial-unlock/route";
import { verifyCsrfToken } from "@shared/http/csrf";
import { checkRateLimit } from "@shared/http/ratelimit";
import {
  getStripeCheckoutCustomerEmail,
  getStripeServerClient,
  isStripeCheckoutEnabled,
} from "@features/checkout/server/stripeCheckout";
import {
  ensurePersonalReportForSubmission,
  lookupReportTokenBySubmissionId,
  lookupSubmissionSessionId,
  resolveSubmissionAccessContext,
} from "@features/report/server/personalReport";
import { ownerMeetsInitialGate } from "@features/report/server/initialUnlockGate";
import { gatePriceArmFor } from "@features/report/server/gateRevealSwitch";
import { grantChosenFreeInitialUnlock } from "@features/report/server/initialUnlockGift";
import { refreshJourneyMessage } from "@features/attribution/server/journey-message";
import { flushAfterResponse } from "@shared/http/after-response";

const TOKEN = "rpt_abcdefghij0123456789";
const SESSION = "02d88f31-eceb-4402-940d-c8cd98d01848";

const mockCreateSession = vi.fn();

function post(body: unknown) {
  return POST(
    new Request("http://localhost/api/stripe/initial-unlock", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-csrf-token": "valid-token",
        "user-agent": "Mozilla/5.0 (Vitest)",
      },
      body: JSON.stringify(body),
    })
  );
}

/** The params the route handed Stripe, and its request options. */
function sessionCreated() {
  const [params, options] = mockCreateSession.mock.calls[0] as [
    Record<string, unknown> & {
      line_items: Array<Record<string, unknown>>;
      metadata: Record<string, string>;
    },
    { idempotencyKey?: string },
  ];
  return { params, options };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(verifyCsrfToken).mockResolvedValue(true);
  vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true, remaining: 9, resetAt: new Date() });
  vi.mocked(isStripeCheckoutEnabled).mockReturnValue(true);
  vi.mocked(getStripeServerClient).mockReturnValue({
    checkout: { sessions: { create: mockCreateSession } },
  } as never);
  mockCreateSession.mockResolvedValue({
    id: "cs_test_1",
    url: "https://checkout.stripe.com/c/pay/cs_test_1",
  });
  vi.mocked(getStripeCheckoutCustomerEmail).mockResolvedValue("alice@example.com");
  vi.mocked(resolveSubmissionAccessContext).mockResolvedValue({
    submissionId: 55,
    userEmail: "alice@example.com",
    userId: 77,
  });
  vi.mocked(ensurePersonalReportForSubmission).mockResolvedValue({
    id: 99,
    payment_id: null,
    payment_status: null,
    url: `/report/${TOKEN}`,
  } as never);
  vi.mocked(lookupReportTokenBySubmissionId).mockResolvedValue(TOKEN);
  // Gated is this reader's own report alone.
  vi.mocked(ownerMeetsInitialGate).mockImplementation(
    async ({ submissionId, personalReportId }) => submissionId === 55 && personalReportId === 99
  );
  // The price test: this reader's survey ran under SESSION, in the half that chooses its price.
  vi.mocked(lookupSubmissionSessionId).mockImplementation(async (id) =>
    id === 55 ? SESSION : null
  );
  vi.mocked(gatePriceArmFor).mockImplementation(async (sessionId) =>
    sessionId === SESSION ? "choose" : "fixed"
  );
  vi.mocked(grantChosenFreeInitialUnlock).mockResolvedValue(501);
});

describe("POST /api/stripe/initial-unlock — refusals", () => {
  it("403 without a valid CSRF token", async () => {
    vi.mocked(verifyCsrfToken).mockResolvedValue(false);
    const res = await post({ reportToken: TOKEN });
    expect(res.status).toBe(403);
    expect(mockCreateSession).not.toHaveBeenCalled();
  });

  it("429 past ten tries in ten minutes from one address", async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({
      allowed: false,
      remaining: 0,
      resetAt: new Date(Date.now() + 60_000),
    });
    const res = await post({ reportToken: TOKEN });
    expect(res.status).toBe(429);
    expect(vi.mocked(checkRateLimit).mock.calls[0]).toEqual([
      "203.0.113.9",
      { bucket: "initial-unlock", limit: 10, windowMs: 600_000 },
    ]);
  });

  it("400 without a report token or session", async () => {
    const res = await post({});
    expect(res.status).toBe(400);
  });

  it("answers the placeholder while payments are off in this environment", async () => {
    vi.mocked(isStripeCheckoutEnabled).mockReturnValue(false);
    const res = await post({ reportToken: TOKEN });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      enabled: false,
      message: "Checkout preview only. Payments are not enabled in this environment yet.",
      reason: "checkout_disabled",
    });
    expect(mockCreateSession).not.toHaveBeenCalled();
  });

  it("409 for a reader the gate doesn't stop (bought, switched off, or unreadable), so the page reloads into the report", async () => {
    vi.mocked(ownerMeetsInitialGate).mockResolvedValue(false);
    const res = await post({ reportToken: TOKEN });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "already_unlocked" });
    expect(mockCreateSession).not.toHaveBeenCalled();
  });

  it("404 when the report can't be found", async () => {
    vi.mocked(resolveSubmissionAccessContext).mockResolvedValue(null);
    const res = await post({ reportToken: TOKEN });
    expect(res.status).toBe(404);
    expect(mockCreateSession).not.toHaveBeenCalled();
  });

  it("503 without a Stripe client or the buyer's email", async () => {
    vi.mocked(getStripeServerClient).mockReturnValue(null as never);
    expect((await post({ reportToken: TOKEN })).status).toBe(503);
    vi.mocked(getStripeServerClient).mockReturnValue({
      checkout: { sessions: { create: mockCreateSession } },
    } as never);
    vi.mocked(getStripeCheckoutCustomerEmail).mockResolvedValue(null);
    expect((await post({ reportToken: TOKEN })).status).toBe(503);
    expect(mockCreateSession).not.toHaveBeenCalled();
  });
});

describe("POST /api/stripe/initial-unlock — the EUR 1.99 session", () => {
  it("sells the Core Archetype at EUR 1.99 and hands back Stripe's page, never cached", async () => {
    const res = await post({ reportToken: TOKEN, gaClientId: "123.456", gaConsent: true });
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store, no-cache, must-revalidate");
    expect(await res.json()).toEqual({
      enabled: true,
      url: "https://checkout.stripe.com/c/pay/cs_test_1",
    });
    const { params } = sessionCreated();
    expect(params.mode).toBe("payment");
    expect(params.line_items).toEqual([
      {
        price_data: {
          currency: "eur",
          unit_amount: 199,
          product_data: { name: "LoveIQ: Your Core Archetype" },
          // EUR 1.99 includes the VAT the receipt lists.
          tax_behavior: "inclusive",
        },
        quantity: 1,
      },
    ]);
    expect(params.customer_email).toBe("alice@example.com");
    expect(params.payment_intent_data).toEqual({ receipt_email: "alice@example.com" });
    expect(params.invoice_creation).toEqual({ enabled: true });
  });

  it("keeps the promotion-code field, so a 100% code can be redeemed on production", async () => {
    await post({ reportToken: TOKEN });
    const { params } = sessionCreated();
    expect(params.allow_promotion_codes).toBe(true);
    expect(params).not.toHaveProperty("discounts");
  });

  it("tags the session as the gate's `initial` sale, never as pay to start", async () => {
    await post({ reportToken: TOKEN, gaClientId: "123.456", gaSessionId: "789", gaConsent: true });
    const { metadata } = sessionCreated().params;
    expect(metadata).toMatchObject({
      plan: "initial",
      unlockSource: "report_gate",
      archetype: "",
      reportToken: TOKEN,
      reportSessionId: "",
      currentPrice: "1.99",
      gaClientId: "123.456",
      gaSessionId: "789",
      gaAnalyticsConsent: "1",
      requestIp: "203.0.113.9",
      requestUserAgent: "Mozilla/5.0 (Vitest)",
    });
    // `journey: "pay_to_start"` would send the webhook down the pay-to-start branch.
    expect(metadata).not.toHaveProperty("journey");
    expect(metadata).not.toHaveProperty("prepaidToken");
  });

  it("returns a buyer to the checkout page with plan=initial, and a back-out to the gate", async () => {
    await post({ reportToken: TOKEN });
    const { params } = sessionCreated();
    expect(params.success_url).toBe(
      `http://localhost/checkout/return?plan=initial&session_id={CHECKOUT_SESSION_ID}&token=${TOKEN}`
    );
    expect(params.cancel_url).toBe(`http://localhost/report/${TOKEN}`);
  });

  it("names the report in both return URLs when the reader came by session", async () => {
    await post({ reportSessionId: SESSION });
    const { params } = sessionCreated();
    expect(lookupReportTokenBySubmissionId).toHaveBeenCalledWith(55);
    expect(params.success_url).toContain(`&token=${TOKEN}`);
    expect(params.cancel_url).toBe(`http://localhost/report/${TOKEN}`);
    expect(params.metadata).toMatchObject({ reportSessionId: SESSION, reportToken: "" });
  });

  it("sends a double click within the minute to the same session, and a later one to a new", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(new Date("2026-10-20T10:00:05.000Z"));
      await post({ reportToken: TOKEN });
      vi.setSystemTime(new Date("2026-10-20T10:00:45.000Z"));
      await post({ reportToken: TOKEN });
      vi.setSystemTime(new Date("2026-10-20T10:01:10.000Z"));
      await post({ reportToken: TOKEN });
    } finally {
      vi.useRealTimers();
    }
    const keys = mockCreateSession.mock.calls.map(
      ([, options]) => (options as { idempotencyKey?: string }).idempotencyKey
    );
    expect(keys[0]).toMatch(/^[0-9a-f]{64}$/);
    expect(keys[1]).toBe(keys[0]);
    expect(keys[2]).not.toBe(keys[0]);
  });

  it("500 when Stripe hands back no page to send the reader to", async () => {
    mockCreateSession.mockResolvedValue({ id: "cs_test_2", url: null });
    const res = await post({ reportToken: TOKEN });
    expect(res.status).toBe(500);
  });
});

describe("POST /api/stripe/initial-unlock — the price test's Choose your price half", () => {
  const lineAmount = () =>
    (sessionCreated().params.line_items[0]!.price_data as { unit_amount: number }).unit_amount;

  it.each([
    ["tight", undefined, 199, "1.99"],
    ["fair", undefined, 699, "6.99"],
    ["support", undefined, 1999, "19.99"],
    ["custom", 450, 450, "4.50"],
    ["custom", 50, 50, "0.50"],
    ["custom", 10_000, 10_000, "100.00"],
  ] as const)(
    "charges the pick %s (%s) as %i cents, its pick on the session",
    async (priceOption, amountCents, cents, price) => {
      const res = await post({ reportToken: TOKEN, priceOption, amountCents });
      expect(res.status).toBe(200);
      expect(lineAmount()).toBe(cents);
      expect(sessionCreated().params.metadata).toMatchObject({
        plan: "initial",
        priceOption,
        currentPrice: price,
      });
      expect(gatePriceArmFor).toHaveBeenCalledWith(SESSION);
    }
  );

  it("never charges a price the browser names: the amount counts only for the own-amount pick", async () => {
    await post({ reportToken: TOKEN, priceOption: "fair", amountCents: 1 });
    expect(lineAmount()).toBe(699);
    mockCreateSession.mockClear();
    await post({ reportToken: TOKEN, priceOption: "tight", amountCents: 0 });
    expect(lineAmount()).toBe(199);
  });

  it("400 for an own amount under EUR 0.50 or none, and above EUR 100 never reaches Stripe", async () => {
    for (const body of [
      { priceOption: "custom", amountCents: 49 },
      { priceOption: "custom", amountCents: 0 },
      { priceOption: "custom" },
      { priceOption: "custom", amountCents: 10_001 },
      { priceOption: "custom", amountCents: 4.5 },
      { priceOption: "cheap" },
    ]) {
      const res = await post({ reportToken: TOKEN, ...body });
      expect(res.status).toBe(400);
    }
    expect(mockCreateSession).not.toHaveBeenCalled();
    expect(grantChosenFreeInitialUnlock).not.toHaveBeenCalled();
  });

  it("writes EUR 0 itself, with no Stripe, and sends the reader to their report opened", async () => {
    const res = await post({ reportToken: TOKEN, priceOption: "free" });
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store, no-cache, must-revalidate");
    expect(await res.json()).toEqual({
      enabled: true,
      url: `http://localhost/report/${TOKEN}?unlocked=initial`,
    });
    expect(mockCreateSession).not.toHaveBeenCalled();
    expect(grantChosenFreeInitialUnlock).toHaveBeenCalledWith({
      personalReportId: 99,
      userId: 77,
      email: "alice@example.com",
      landingVariant: "white",
    });
    await flushAfterResponse();
    expect(refreshJourneyMessage).toHaveBeenCalledWith(55, "paywall");
  });

  it("503 when EUR 0 can't be written, and the reader stays on the page", async () => {
    vi.mocked(grantChosenFreeInitialUnlock).mockResolvedValue(null);
    const res = await post({ reportToken: TOKEN, priceOption: "free" });
    expect(res.status).toBe(503);
  });

  it("409 for a pick from today's page's half, or with the test switched off since: the page reloads", async () => {
    vi.mocked(gatePriceArmFor).mockResolvedValue("fixed");
    expect((await post({ reportToken: TOKEN, priceOption: "free" })).status).toBe(409);
    vi.mocked(gatePriceArmFor).mockResolvedValue(null);
    expect((await post({ reportToken: TOKEN, priceOption: "fair" })).status).toBe(409);
    expect(mockCreateSession).not.toHaveBeenCalled();
    expect(grantChosenFreeInitialUnlock).not.toHaveBeenCalled();
  });

  it("409 before any pick is read for a reader the gate no longer stops", async () => {
    vi.mocked(ownerMeetsInitialGate).mockResolvedValue(false);
    const res = await post({ reportToken: TOKEN, priceOption: "free" });
    expect(res.status).toBe(409);
    expect(grantChosenFreeInitialUnlock).not.toHaveBeenCalled();
  });

  it("503 when the survey's session can't be read: it never guesses the half", async () => {
    vi.mocked(lookupSubmissionSessionId).mockRejectedValue(new Error("down"));
    const res = await post({ reportToken: TOKEN, priceOption: "free" });
    expect(res.status).toBe(503);
    expect(grantChosenFreeInitialUnlock).not.toHaveBeenCalled();
  });

  it("charges today's EUR 1.99 for a request with no pick, and reads no half for it", async () => {
    await post({ reportToken: TOKEN });
    expect(lineAmount()).toBe(199);
    expect(sessionCreated().params.metadata.priceOption).toBeUndefined();
    expect(gatePriceArmFor).not.toHaveBeenCalled();
  });
});
