import type Stripe from "stripe";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const mockNotifySlack = vi.fn();
vi.mock("@shared/observability/slack", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@shared/observability/slack")>();
  return { ...actual, notifySlack: (...args: unknown[]) => mockNotifySlack(...args) };
});

vi.mock("@features/analytics/server/ga4", () => ({ sendGa4PurchaseEvent: vi.fn() }));
vi.mock("@features/analytics/server/posthog", () => ({ sendPosthogPurchaseEvent: vi.fn() }));
vi.mock("@features/pay-to-start/server/emails/confirmation", () => ({
  sendPayToStartConfirmationEmail: vi.fn(),
}));
vi.mock("@features/pay-to-start/server/entitlement", () => ({
  findEntitlementById: vi.fn(),
  findRecentPaidDuplicate: vi.fn(),
  markEntitlementExpired: vi.fn(),
  markEntitlementRefundedUnconfirmed: vi.fn(),
  markEntitlementSucceeded: vi.fn(),
  setEntitlementSession: vi.fn(),
}));

import { sendGa4PurchaseEvent } from "@features/analytics/server/ga4";
import { sendPosthogPurchaseEvent } from "@features/analytics/server/posthog";
import { confirmPayToStartSession } from "@features/pay-to-start/server/confirm";
import { sendPayToStartConfirmationEmail } from "@features/pay-to-start/server/emails/confirmation";
import {
  findEntitlementById,
  findRecentPaidDuplicate,
  markEntitlementExpired,
  markEntitlementRefundedUnconfirmed,
  markEntitlementSucceeded,
  setEntitlementSession,
  type Entitlement,
} from "@features/pay-to-start/server/entitlement";
import { __resetStaffEmailRegexForTests } from "@shared/env/staff-email";
import { flushAfterResponse } from "@shared/http/after-response";

const TOKEN = `rpp_${"b".repeat(32)}`;
const CHARGE_CREATED = 1_760_781_900; // 2025-10-18T10:05:00Z

function row(overrides: Partial<Entitlement> = {}): Entitlement {
  return {
    id: 7,
    prepaid_token: TOKEN,
    plan: "full_report",
    status: "pending",
    offer: "full",
    landing_variant: "sexual-archetype",
    stripe_session_id: "cs_test_paid",
    stripe_payment_intent_id: null,
    payment_id: null,
    consumed_submission_id: null,
    consumed_at: null,
    amount_cents: null,
    list_price_cents: 2900,
    currency: "EUR",
    customer_email: null,
    is_test: false,
    paid_at: null,
    utm_tracker: '{"utm_source":"google","utm_medium":"cpc","utm_campaign":"archetype"}',
    created_at: "2026-10-18T10:00:00.000Z",
    ...overrides,
  };
}

function checkoutSession(overrides: Record<string, unknown> = {}): Stripe.Checkout.Session {
  return {
    id: "cs_test_paid",
    object: "checkout.session",
    status: "complete",
    payment_status: "paid",
    amount_total: 2900,
    currency: "eur",
    customer_details: { email: " Buyer@Example.com " },
    discounts: [],
    total_details: { amount_discount: 0 },
    url: null,
    metadata: {
      journey: "pay_to_start",
      entitlementId: "7",
      offer: "full",
      origin: "https://www.loveiq.org",
      gaClientId: "123.456",
      gaSessionId: "789",
      gaAnalyticsConsent: "1",
    },
    payment_intent: {
      id: "pi_test_1",
      status: "succeeded",
      latest_charge: {
        id: "ch_test_1",
        created: CHARGE_CREATED,
        outcome: { risk_level: "normal", risk_score: 12 },
      },
    },
    ...overrides,
  } as unknown as Stripe.Checkout.Session;
}

function stripeReturning(session: Stripe.Checkout.Session) {
  const retrieve = vi.fn().mockResolvedValue(session);
  const intentRetrieve = vi.fn();
  return {
    stripe: {
      checkout: { sessions: { retrieve } },
      paymentIntents: { retrieve: intentRetrieve },
    } as unknown as Stripe,
    retrieve,
    intentRetrieve,
  };
}

async function confirm(session: Stripe.Checkout.Session) {
  const { stripe } = stripeReturning(session);
  const result = await confirmPayToStartSession({
    sessionId: session.id,
    source: "webhook",
    stripe,
  });
  await flushAfterResponse();
  return result;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockNotifySlack.mockResolvedValue(undefined);
  vi.mocked(findEntitlementById).mockResolvedValue(row());
  vi.mocked(findRecentPaidDuplicate).mockResolvedValue(null);
  vi.mocked(markEntitlementSucceeded).mockImplementation(async (input) =>
    row({
      status: "succeeded",
      amount_cents: input.amountCents,
      customer_email: input.customerEmail,
      is_test: input.isTest,
      paid_at: input.paidAt,
      stripe_payment_intent_id: input.paymentIntentId,
    })
  );
  vi.mocked(setEntitlementSession).mockResolvedValue(true);
  vi.mocked(sendPayToStartConfirmationEmail).mockResolvedValue(true);
  delete process.env.ADMIN_TEST_EMAIL_REGEX;
  __resetStaffEmailRegexForTests();
});

describe("which sessions it touches", () => {
  it("ignores sessions from other checkouts", async () => {
    const result = await confirm(checkoutSession({ metadata: { plan: "full_report" } }));
    expect(result.state).toBe("unknown");
    expect(findEntitlementById).not.toHaveBeenCalled();
    expect(markEntitlementSucceeded).not.toHaveBeenCalled();
  });

  it("alerts #ops when money arrived for an entitlement that does not exist", async () => {
    vi.mocked(findEntitlementById).mockResolvedValue(null);
    const result = await confirm(checkoutSession());
    expect(result.state).toBe("unknown");
    expect(mockNotifySlack).toHaveBeenCalledWith(
      expect.objectContaining({ channel: "ops", kind: "pts_paid_without_entitlement" })
    );
  });
});

describe("unpaid sessions", () => {
  it("reports an open checkout as open", async () => {
    const result = await confirm(
      checkoutSession({ status: "open", payment_status: "unpaid", payment_intent: null })
    );
    expect(result.state).toBe("open");
    expect(markEntitlementSucceeded).not.toHaveBeenCalled();
  });

  it("expires the row when its own session expired", async () => {
    const result = await confirm(
      checkoutSession({ status: "expired", payment_status: "unpaid", payment_intent: null })
    );
    expect(result.state).toBe("expired");
    expect(markEntitlementExpired).toHaveBeenCalledWith({ id: 7, stripeSessionId: "cs_test_paid" });
  });

  it("leaves a row paid through another session alone when this one expires", async () => {
    vi.mocked(findEntitlementById).mockResolvedValue(
      row({ status: "succeeded", stripe_session_id: "cs_test_other" })
    );
    const result = await confirm(
      checkoutSession({ status: "expired", payment_status: "unpaid", payment_intent: null })
    );
    expect(result.state).toBe("paid");
    expect(markEntitlementExpired).not.toHaveBeenCalled();
  });

  it("waits on a delayed method: complete but unpaid is processing", async () => {
    const result = await confirm(checkoutSession({ payment_status: "unpaid" }));
    expect(result.state).toBe("processing");
    expect(markEntitlementSucceeded).not.toHaveBeenCalled();
  });

  it("does not unlock on a PaymentIntent that is still processing", async () => {
    const result = await confirm(
      checkoutSession({ payment_intent: { id: "pi_test_1", status: "processing" } })
    );
    expect(result.state).toBe("processing");
    expect(markEntitlementSucceeded).not.toHaveBeenCalled();
  });

  it("reports a voided PaymentIntent as failed", async () => {
    const result = await confirm(
      checkoutSession({ payment_intent: { id: "pi_test_1", status: "canceled" } })
    );
    expect(result.state).toBe("failed");
    expect(markEntitlementSucceeded).not.toHaveBeenCalled();
  });

  it("reads a delayed payment that failed as failed, so a new checkout can open", async () => {
    // A complete session never expires: read as processing, every later click would be
    // sent to the status page for good.
    const result = await confirm(
      checkoutSession({
        payment_status: "unpaid",
        payment_intent: { id: "pi_test_1", status: "requires_payment_method" },
      })
    );
    expect(result.state).toBe("failed");
    expect(markEntitlementSucceeded).not.toHaveBeenCalled();
  });

  it("bounds every Stripe call", async () => {
    const { stripe, retrieve } = stripeReturning(checkoutSession());
    await confirmPayToStartSession({ sessionId: "cs_test_paid", source: "sweep", stripe });
    await flushAfterResponse();
    expect(retrieve).toHaveBeenCalledWith("cs_test_paid", expect.any(Object), {
      timeout: 8_000,
      maxNetworkRetries: 1,
    });
  });

  it.each([
    ["refunded in full", { refunded: true, disputed: false, amount_refunded: 2900 }],
    ["disputed", { refunded: false, disputed: true, amount_refunded: 0 }],
  ])("never unlocks a payment %s before anything confirmed it", async (_label, chargeState) => {
    const result = await confirm(
      checkoutSession({
        payment_intent: {
          id: "pi_test_1",
          status: "succeeded",
          latest_charge: { id: "ch_test_1", created: CHARGE_CREATED, ...chargeState },
        },
      })
    );
    expect(result.state).toBe("refunded");
    expect(markEntitlementRefundedUnconfirmed).toHaveBeenCalledWith({
      id: 7,
      paymentIntentId: "pi_test_1",
    });
    expect(markEntitlementSucceeded).not.toHaveBeenCalled();
    expect(sendPayToStartConfirmationEmail).not.toHaveBeenCalled();
    expect(sendGa4PurchaseEvent).not.toHaveBeenCalled();
  });

  it("still unlocks after a partial refund, as a report purchase does", async () => {
    const result = await confirm(
      checkoutSession({
        payment_intent: {
          id: "pi_test_1",
          status: "succeeded",
          latest_charge: {
            id: "ch_test_1",
            created: CHARGE_CREATED,
            refunded: false,
            disputed: false,
            amount_refunded: 500,
          },
        },
      })
    );
    expect(result.state).toBe("paid");
    expect(markEntitlementRefundedUnconfirmed).not.toHaveBeenCalled();
  });

  it("never re-opens a refunded entitlement", async () => {
    vi.mocked(findEntitlementById).mockResolvedValue(row({ status: "refunded" }));
    const result = await confirm(checkoutSession());
    expect(result.state).toBe("refunded");
    expect(markEntitlementSucceeded).not.toHaveBeenCalled();
  });
});

describe("the first confirmation", () => {
  it("flips the row with what Stripe settled", async () => {
    const result = await confirm(checkoutSession());
    expect(result).toMatchObject({ state: "paid", firstFlip: true });
    expect(markEntitlementSucceeded).toHaveBeenCalledWith({
      amountCents: 2900,
      currency: "eur",
      customerEmail: "buyer@example.com",
      id: 7,
      isTest: false,
      paidAt: new Date(CHARGE_CREATED * 1000).toISOString(),
      paymentIntentId: "pi_test_1",
    });
  });

  it("sends the email, the #payments line and both purchase events once", async () => {
    await confirm(checkoutSession());
    expect(sendPayToStartConfirmationEmail).toHaveBeenCalledWith({
      amountText: "€29.00",
      email: "buyer@example.com",
      entitlementId: 7,
      origin: "https://www.loveiq.org",
      productName: "LoveIQ Survey & Report",
      token: TOKEN,
      variant: "survey",
    });
    const paid = mockNotifySlack.mock.calls.find(([input]) => input.kind === "pts_paid");
    expect(paid?.[0]).toMatchObject({ channel: "payments" });
    expect(paid?.[0].text).toContain("€29.00");
    expect(paid?.[0].text).toContain("survey not started yet");
    expect(paid?.[0].text).toContain("b***@example.com");
    expect(paid?.[0].text).not.toContain("buyer@example.com");
    expect(sendGa4PurchaseEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        transactionId: "cs_test_paid",
        value: 29,
        currency: "EUR",
        isTest: false,
        consentGranted: true,
        clientId: "123.456",
        itemName: "LoveIQ Survey & Report",
        params: expect.objectContaining({ journey: "pay_to_start", offer: "full", list_price: 29 }),
      })
    );
    expect(sendPosthogPurchaseEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "buyer@example.com",
        transactionId: "cs_test_paid",
        value: 29,
        plan: "full_report",
      })
    );
  });

  it("says the report is unlocked when the survey was finished before the money settled", async () => {
    // A checkout left open and paid later, or a delayed method: the buyer already has a
    // report, so "start my survey" would be wrong in the email and in #payments.
    vi.mocked(findEntitlementById).mockResolvedValue(row({ consumed_submission_id: 42 }));
    vi.mocked(markEntitlementSucceeded).mockImplementation(async (input) =>
      row({
        status: "succeeded",
        consumed_submission_id: 42,
        amount_cents: input.amountCents,
        customer_email: input.customerEmail,
        paid_at: input.paidAt,
      })
    );
    await confirm(checkoutSession());
    expect(sendPayToStartConfirmationEmail).toHaveBeenCalledWith(
      expect.objectContaining({ variant: "report" })
    );
    const paid = mockNotifySlack.mock.calls.find(([input]) => input.kind === "pts_paid");
    expect(paid?.[0].text).toContain("survey already finished (submission #42)");
    expect(paid?.[0].text).not.toContain("survey not started yet");
  });

  it("does nothing more when another path flipped it first", async () => {
    vi.mocked(markEntitlementSucceeded).mockResolvedValue(null);
    vi.mocked(findEntitlementById)
      .mockResolvedValueOnce(row())
      .mockResolvedValueOnce(row({ status: "succeeded" }));
    const result = await confirm(checkoutSession());
    expect(result).toMatchObject({ state: "paid", firstFlip: false });
    expect(sendPayToStartConfirmationEmail).not.toHaveBeenCalled();
    expect(mockNotifySlack).not.toHaveBeenCalled();
    expect(sendGa4PurchaseEvent).not.toHaveBeenCalled();
  });

  it("says nothing on a redelivery: the row is already paid by this session", async () => {
    vi.mocked(findEntitlementById).mockResolvedValue(
      row({ status: "succeeded", stripe_payment_intent_id: "pi_test_1" })
    );
    const result = await confirm(checkoutSession());
    expect(result).toMatchObject({ state: "paid", firstFlip: false });
    expect(markEntitlementSucceeded).not.toHaveBeenCalled();
    expect(mockNotifySlack).not.toHaveBeenCalled();
  });

  it("marks a staff buyer as a test, in the row and in the #payments line", async () => {
    const result = await confirm(checkoutSession({ customer_details: { email: "fh@loveiq.org" } }));
    expect(result.state).toBe("paid");
    expect(vi.mocked(markEntitlementSucceeded).mock.calls[0]?.[0].isTest).toBe(true);
    const paid = mockNotifySlack.mock.calls.find(([input]) => input.kind === "pts_paid");
    expect(paid?.[0].text).toContain("[internal]");
  });

  it("confirms a 100% code with no PaymentIntent", async () => {
    const { stripe, intentRetrieve } = stripeReturning(
      checkoutSession({
        payment_status: "no_payment_required",
        payment_intent: null,
        amount_total: 0,
      })
    );
    const result = await confirmPayToStartSession({
      sessionId: "cs_test_paid",
      source: "status",
      stripe,
    });
    await flushAfterResponse();
    expect(result.state).toBe("paid");
    expect(intentRetrieve).not.toHaveBeenCalled();
    expect(vi.mocked(markEntitlementSucceeded).mock.calls[0]?.[0]).toMatchObject({
      amountCents: 0,
      paymentIntentId: null,
    });
  });

  it("follows the money when the row points at another session", async () => {
    vi.mocked(findEntitlementById).mockResolvedValue(row({ stripe_session_id: "cs_test_newer" }));
    await confirm(checkoutSession());
    expect(setEntitlementSession).toHaveBeenCalledWith({ id: 7, stripeSessionId: "cs_test_paid" });
    expect(markEntitlementSucceeded).toHaveBeenCalled();
  });

  it("retrieves the PaymentIntent when Stripe did not expand it", async () => {
    const { stripe, intentRetrieve } = stripeReturning(
      checkoutSession({ payment_intent: "pi_test_1" })
    );
    intentRetrieve.mockResolvedValue({ id: "pi_test_1", status: "succeeded", latest_charge: null });
    const result = await confirmPayToStartSession({
      sessionId: "cs_test_paid",
      source: "sweep",
      stripe,
    });
    await flushAfterResponse();
    expect(intentRetrieve).toHaveBeenCalledWith(
      "pi_test_1",
      { expand: ["latest_charge"] },
      { timeout: 8_000, maxNetworkRetries: 1 }
    );
    expect(result.state).toBe("paid");
  });
});

describe("ops lines", () => {
  it("reports a second paid session for an entitlement already paid", async () => {
    vi.mocked(findEntitlementById).mockResolvedValue(
      row({
        status: "succeeded",
        stripe_session_id: "cs_test_first",
        stripe_payment_intent_id: "pi_test_first",
      })
    );
    const result = await confirm(checkoutSession());
    expect(result.state).toBe("paid");
    expect(mockNotifySlack).toHaveBeenCalledWith(
      expect.objectContaining({ channel: "ops", kind: "pts_second_paid_session" })
    );
  });

  it("reports a buyer who paid twice within 48 hours", async () => {
    vi.mocked(findRecentPaidDuplicate).mockResolvedValue(row({ id: 5, status: "succeeded" }));
    await confirm(checkoutSession());
    expect(mockNotifySlack).toHaveBeenCalledWith(
      expect.objectContaining({ channel: "ops", kind: "pts_double_payment" })
    );
  });

  it("reports a promotion code and keeps the list price in the #payments line", async () => {
    vi.mocked(markEntitlementSucceeded).mockImplementation(async (input) =>
      row({
        status: "succeeded",
        amount_cents: input.amountCents,
        customer_email: input.customerEmail,
      })
    );
    await confirm(
      checkoutSession({
        amount_total: 1450,
        total_details: { amount_discount: 1450 },
        discounts: [
          {
            coupon: { id: "half", percent_off: 50, amount_off: null, name: "Half" },
            promotion_code: { code: "HALF50", promotion: { coupon: null } },
          },
        ],
      })
    );
    expect(mockNotifySlack).toHaveBeenCalledWith(
      expect.objectContaining({ channel: "ops", kind: "promo_redeemed" })
    );
    const paid = mockNotifySlack.mock.calls.find(([input]) => input.kind === "pts_paid");
    expect(paid?.[0].text).toContain("€14.50");
    expect(paid?.[0].text).toContain("list €29.00, code HALF50");
  });

  it("keeps going when one effect fails", async () => {
    vi.mocked(sendPayToStartConfirmationEmail).mockRejectedValue(new Error("resend down"));
    await confirm(checkoutSession());
    expect(sendGa4PurchaseEvent).toHaveBeenCalled();
    expect(sendPosthogPurchaseEvent).toHaveBeenCalled();
  });
});
