import type Stripe from "stripe";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFetchWithTimeout = vi.fn();
vi.mock("@shared/http/fetch-with-timeout", () => ({
  fetchWithTimeout: (...args: unknown[]) => mockFetchWithTimeout(...args),
}));
vi.mock("@shared/http/circuit-breaker", () => ({
  getBreaker: () => ({ fire: (fn: () => Promise<unknown>) => fn() }),
}));
vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const mockNotifySlack = vi.fn();
vi.mock("@shared/observability/slack", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@shared/observability/slack")>();
  return { ...actual, notifySlack: (...args: unknown[]) => mockNotifySlack(...args) };
});

vi.mock("@features/report/server/personalReport", () => ({
  ensurePersonalReportForSubmission: vi.fn(),
  resolveSubmissionAccessContext: vi.fn(),
  revokeArchetypeTiers: vi.fn(() => ({})),
  unlockAllArchetypesForPersonalReport: vi.fn(),
  upsertArchetypeTierForPersonalReport: vi.fn(),
}));
vi.mock("@features/attribution/server/journey-message", () => ({
  refreshJourneyMessage: vi.fn(),
}));
vi.mock("@features/analytics/server/ga4", () => ({ sendGa4PurchaseEvent: vi.fn() }));
vi.mock("@features/analytics/server/posthog", () => ({ sendPosthogPurchaseEvent: vi.fn() }));
vi.mock("resend", () => ({ Resend: class {} }));
vi.mock("@features/pay-to-start/server/confirm", () => ({
  confirmPayToStartSession: vi.fn(),
}));
vi.mock("@features/pay-to-start/server/entitlement", () => ({
  findEntitlementByPaymentIntent: vi.fn(),
  restoreDisputedEntitlement: vi.fn(),
  setEntitlementPaymentId: vi.fn(),
  voidEntitlementByPaymentIntent: vi.fn(),
}));

import {
  applyPayToStartEntitlement,
  processStripeWebhookEvent,
  settlePayToStartSession,
} from "@features/checkout/server/fulfillment";
import { refreshJourneyMessage } from "@features/attribution/server/journey-message";
import { confirmPayToStartSession } from "@features/pay-to-start/server/confirm";
import {
  findEntitlementByPaymentIntent,
  restoreDisputedEntitlement,
  setEntitlementPaymentId,
  voidEntitlementByPaymentIntent,
  type Entitlement,
} from "@features/pay-to-start/server/entitlement";
import {
  ensurePersonalReportForSubmission,
  resolveSubmissionAccessContext,
  upsertArchetypeTierForPersonalReport,
} from "@features/report/server/personalReport";
import { flushAfterResponse } from "@shared/http/after-response";

const TOKEN = `rpp_${"c".repeat(32)}`;
const PRIMARY = "Spark Seeker";

function row(overrides: Partial<Entitlement> = {}): Entitlement {
  return {
    id: 7,
    prepaid_token: TOKEN,
    plan: "full_report",
    status: "succeeded",
    offer: "full",
    landing_variant: "sexual-archetype",
    stripe_session_id: "cs_test_paid",
    stripe_payment_intent_id: "pi_test_1",
    payment_id: null,
    consumed_submission_id: 42,
    consumed_at: "2026-10-18T10:20:00.000Z",
    amount_cents: 2900,
    list_price_cents: 2900,
    currency: "EUR",
    customer_email: "buyer@example.com",
    is_test: false,
    paid_at: "2026-10-18T10:05:00.000Z",
    utm_tracker: null,
    created_at: "2026-10-18T10:00:00.000Z",
    ...overrides,
  };
}

interface Captured {
  paymentPost: Record<string, unknown> | null;
  itemPost: Record<string, unknown> | null;
  reportPatch: Record<string, unknown> | null;
  webhookRecord: Record<string, unknown> | null;
  urls: string[];
}

function json(body: unknown, ok = true) {
  return { ok, status: ok ? 200 : 500, json: async () => body } as Response;
}

function routeSupabase({
  existingPaymentId = null,
  primary = PRIMARY,
  reportToken = "rpt_abc",
}: {
  existingPaymentId?: number | null;
  primary?: string | null;
  reportToken?: string | null;
} = {}): Captured {
  const captured: Captured = {
    paymentPost: null,
    itemPost: null,
    reportPatch: null,
    webhookRecord: null,
    urls: [],
  };
  mockFetchWithTimeout.mockImplementation(
    async (url: string, options: { body?: string; method?: string } = {}) => {
      const method = options.method ?? "GET";
      captured.urls.push(`${method} ${url}`);
      if (url.includes("/rest/v1/payment_webhook_event?stripe_event_id=eq.")) return json([]);
      if (method === "POST" && url.endsWith("/rest/v1/payment_webhook_event")) {
        captured.webhookRecord = JSON.parse(options.body ?? "{}") as Record<string, unknown>;
        return json([{ id: 1 }]);
      }
      if (url.includes("/rest/v1/scoring_result?")) {
        return json(primary ? [{ primary_archetype: primary, v5_primary_archetype: primary }] : []);
      }
      if (url.includes("/rest/v1/report_access_token?")) {
        return json(reportToken ? [{ token: reportToken }] : []);
      }
      if (
        method === "GET" &&
        (url.includes("/rest/v1/payment?stripe_payment_intent_id=eq.") ||
          url.includes("/rest/v1/payment?stripe_charge_id=eq.") ||
          url.includes("/rest/v1/payment?metadata->>checkoutSessionId=eq."))
      ) {
        return json(existingPaymentId ? [{ id: existingPaymentId, personal_report_id: 5 }] : []);
      }
      if (method === "POST" && url.endsWith("/rest/v1/payment")) {
        captured.paymentPost = JSON.parse(options.body ?? "{}") as Record<string, unknown>;
        return json([{ id: 41 }]);
      }
      if (url.includes("/rest/v1/payment_item?payment_id=eq.")) return json([]);
      if (method === "POST" && url.endsWith("/rest/v1/payment_item")) {
        captured.itemPost = JSON.parse(options.body ?? "{}") as Record<string, unknown>;
        return json([{ id: 1 }]);
      }
      if (method === "PATCH" && url.includes("/rest/v1/personal_report?id=eq.5")) {
        captured.reportPatch = JSON.parse(options.body ?? "{}") as Record<string, unknown>;
        return json([]);
      }
      return json([]);
    }
  );
  return captured;
}

function checkoutEvent(type: Stripe.Event.Type, metadata: Record<string, string>): Stripe.Event {
  return {
    id: `evt_${type}`,
    type,
    data: { object: { id: "cs_test_paid", object: "checkout.session", metadata } },
  } as unknown as Stripe.Event;
}

const stripe = {} as Stripe;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.SUPABASE_URL = "https://db.example";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
  delete process.env.STRIPE_SECRET_KEY;
  mockNotifySlack.mockResolvedValue(undefined);
  vi.mocked(resolveSubmissionAccessContext).mockResolvedValue({
    submissionId: 42,
    userEmail: "survey@example.com",
    userId: 70,
  });
  vi.mocked(ensurePersonalReportForSubmission).mockResolvedValue({ id: 5 } as never);
  vi.mocked(upsertArchetypeTierForPersonalReport).mockResolvedValue({});
  vi.mocked(setEntitlementPaymentId).mockResolvedValue(true);
  vi.mocked(voidEntitlementByPaymentIntent).mockResolvedValue([]);
  vi.mocked(restoreDisputedEntitlement).mockResolvedValue([]);
});

describe("webhook routing", () => {
  it("settles a pay-to-start session on its entitlement, never the report path", async () => {
    const captured = routeSupabase();
    vi.mocked(confirmPayToStartSession).mockResolvedValue({
      state: "paid",
      entitlement: row({ consumed_submission_id: null, consumed_at: null }),
      session: null,
      firstFlip: true,
    });
    await processStripeWebhookEvent({
      event: checkoutEvent("checkout.session.completed", { journey: "pay_to_start" }),
      stripe,
    });
    expect(confirmPayToStartSession).toHaveBeenCalledWith({
      sessionId: "cs_test_paid",
      source: "webhook",
      stripe,
    });
    expect(resolveSubmissionAccessContext).not.toHaveBeenCalled();
    expect(captured.paymentPost).toBeNull();
    expect(captured.webhookRecord).toMatchObject({ processed: true, processing_error: null });
  });

  it("leaves report checkouts on their own path", async () => {
    routeSupabase();
    await processStripeWebhookEvent({
      event: checkoutEvent("checkout.session.expired", { plan: "full_report" }),
      stripe: {
        checkout: { sessions: { retrieve: vi.fn() } },
        paymentIntents: { retrieve: vi.fn() },
      } as unknown as Stripe,
    }).catch(() => undefined);
    expect(confirmPayToStartSession).not.toHaveBeenCalled();
  });

  it("tells #ops when a delayed payment fails after the survey was finished", async () => {
    routeSupabase();
    vi.mocked(confirmPayToStartSession).mockResolvedValue({
      state: "failed",
      entitlement: row({ status: "pending", amount_cents: null }),
      session: null,
      firstFlip: false,
    });
    await processStripeWebhookEvent({
      event: checkoutEvent("checkout.session.async_payment_failed", { journey: "pay_to_start" }),
      stripe,
    });
    const alert = mockNotifySlack.mock.calls.find(
      ([input]) => input.kind === "pts_async_payment_failed"
    );
    expect(alert?.[0].text).toContain("submission #42");
  });
});

describe("applyPayToStartEntitlement", () => {
  it("writes the payment, item, report link and tier, then stamps the entitlement", async () => {
    const captured = routeSupabase();
    const paymentId = await applyPayToStartEntitlement({ entitlement: row(), stripe });
    await flushAfterResponse();

    expect(paymentId).toBe(41);
    expect(captured.paymentPost).toMatchObject({
      amount: 29,
      currency: "EUR",
      description: "LoveIQ Survey & Report",
      is_test: false,
      payment_date_time: "2026-10-18T10:05:00.000Z",
      personal_report_id: 5,
      status: "succeeded",
      stripe_payment_intent_id: "pi_test_1",
      user_id: 70,
      metadata: expect.objectContaining({
        plan: "full_report",
        archetype: PRIMARY,
        checkoutSessionId: "cs_test_paid",
        journey: "pay_to_start",
        offer: "full",
        prepaid: "true",
        prepaidEntitlementId: 7,
        currentPrice: "29.00",
        listPrice: "29.00",
        reportToken: "rpt_abc",
      }),
    });
    expect(captured.itemPost).toMatchObject({
      item_name: "LoveIQ Survey & Report",
      payment_id: 41,
      total_price: 29,
    });
    expect(captured.reportPatch).toMatchObject({ payment_id: 41, payment_status: "succeeded" });
    expect(upsertArchetypeTierForPersonalReport).toHaveBeenCalledWith({
      archetype: PRIMARY,
      personalReportId: 5,
      tier: "full_report",
    });
    expect(setEntitlementPaymentId).toHaveBeenCalledWith({ id: 7, paymentId: 41 });
    expect(mockNotifySlack).toHaveBeenCalledWith(
      expect.objectContaining({ channel: "payments", kind: "pts_claimed" })
    );
    expect(refreshJourneyMessage).toHaveBeenCalledWith(42, "paid");
  });

  it("marks a staff buyer's payment as a test from the Stripe address", async () => {
    const captured = routeSupabase();
    await applyPayToStartEntitlement({
      entitlement: row({ customer_email: "fh@loveiq.org" }),
      stripe,
    });
    expect(captured.paymentPost).toMatchObject({ is_test: true });
  });

  it("reuses a payment row an earlier attempt wrote, without rewriting it", async () => {
    const captured = routeSupabase({ existingPaymentId: 33 });
    const paymentId = await applyPayToStartEntitlement({ entitlement: row(), stripe });
    expect(paymentId).toBe(33);
    expect(captured.paymentPost).toBeNull();
    expect(setEntitlementPaymentId).toHaveBeenCalledWith({ id: 7, paymentId: 33 });
  });

  it("sends the notices only from the call that stamped the entitlement", async () => {
    routeSupabase();
    vi.mocked(setEntitlementPaymentId).mockResolvedValue(false);
    await applyPayToStartEntitlement({ entitlement: row(), stripe });
    await flushAfterResponse();
    expect(mockNotifySlack).not.toHaveBeenCalled();
    expect(refreshJourneyMessage).not.toHaveBeenCalled();
  });

  it("refuses an entitlement that is unpaid, unclaimed or already applied", async () => {
    const captured = routeSupabase();
    expect(
      await applyPayToStartEntitlement({ entitlement: row({ status: "pending" }), stripe })
    ).toBeNull();
    expect(
      await applyPayToStartEntitlement({ entitlement: row({ status: "refunded" }), stripe })
    ).toBeNull();
    expect(
      await applyPayToStartEntitlement({
        entitlement: row({ consumed_submission_id: null }),
        stripe,
      })
    ).toBeNull();
    expect(await applyPayToStartEntitlement({ entitlement: row({ payment_id: 12 }), stripe })).toBe(
      12
    );
    expect(captured.urls).toHaveLength(0);
  });

  it("stops before stamping when no archetype is scored yet, so the sweep retries", async () => {
    routeSupabase({ primary: null });
    await expect(applyPayToStartEntitlement({ entitlement: row(), stripe })).rejects.toThrow(
      "pts_apply_missing_archetype"
    );
    expect(setEntitlementPaymentId).not.toHaveBeenCalled();
  });
});

describe("settlePayToStartSession", () => {
  it("applies a paid entitlement a survey already claimed", async () => {
    routeSupabase();
    vi.mocked(confirmPayToStartSession).mockResolvedValue({
      state: "paid",
      entitlement: row(),
      session: null,
      firstFlip: true,
    });
    const settled = await settlePayToStartSession({
      sessionId: "cs_test_paid",
      source: "status",
      stripe,
    });
    expect(settled.paymentId).toBe(41);
  });

  it("does not apply an unclaimed one", async () => {
    const captured = routeSupabase();
    vi.mocked(confirmPayToStartSession).mockResolvedValue({
      state: "paid",
      entitlement: row({ consumed_submission_id: null }),
      session: null,
      firstFlip: true,
    });
    const settled = await settlePayToStartSession({
      sessionId: "cs_test_paid",
      source: "status",
      stripe,
    });
    expect(settled.paymentId).toBeNull();
    expect(captured.paymentPost).toBeNull();
  });

  it("reports an apply failure to #ops instead of throwing", async () => {
    routeSupabase({ primary: null });
    vi.mocked(confirmPayToStartSession).mockResolvedValue({
      state: "paid",
      entitlement: row(),
      session: null,
      firstFlip: false,
    });
    const settled = await settlePayToStartSession({
      sessionId: "cs_test_paid",
      source: "sweep",
      stripe,
    });
    expect(settled.state).toBe("paid");
    expect(mockNotifySlack).toHaveBeenCalledWith(
      expect.objectContaining({ channel: "ops", kind: "pts_apply_failed" })
    );
  });
});

describe("refunds and disputes before a survey claimed the payment", () => {
  function refundEvent(amountRefunded: number): Stripe.Event {
    return {
      id: "evt_refund",
      type: "charge.refunded",
      data: {
        object: {
          id: "ch_test_1",
          object: "charge",
          amount: 2900,
          amount_captured: 2900,
          amount_refunded: amountRefunded,
          currency: "eur",
          payment_intent: "pi_test_1",
        },
      },
    } as unknown as Stripe.Event;
  }

  function disputeEvent(type: "charge.dispute.created" | "charge.dispute.closed", status: string) {
    return {
      id: `evt_${type}`,
      type,
      data: {
        object: {
          id: "dp_1",
          object: "dispute",
          amount: 2900,
          currency: "eur",
          charge: "ch_test_1",
          payment_intent: "pi_test_1",
          reason: "fraudulent",
          status,
        },
      },
    } as unknown as Stripe.Event;
  }

  it("voids the entitlement on a full refund and records the event", async () => {
    const captured = routeSupabase();
    vi.mocked(findEntitlementByPaymentIntent).mockResolvedValue(
      row({ consumed_submission_id: null })
    );
    await processStripeWebhookEvent({ event: refundEvent(2900), stripe });
    expect(voidEntitlementByPaymentIntent).toHaveBeenCalledWith("pi_test_1");
    expect(captured.webhookRecord).toMatchObject({ processed: true });
    expect(mockNotifySlack).toHaveBeenCalledWith(
      expect.objectContaining({ channel: "ops", kind: "pts_refund" })
    );
  });

  it("keeps the entitlement working on a partial refund", async () => {
    routeSupabase();
    vi.mocked(findEntitlementByPaymentIntent).mockResolvedValue(
      row({ consumed_submission_id: null })
    );
    await processStripeWebhookEvent({ event: refundEvent(1000), stripe });
    expect(voidEntitlementByPaymentIntent).not.toHaveBeenCalled();
    const line = mockNotifySlack.mock.calls.find(([input]) => input.kind === "pts_refund");
    expect(line?.[0].text).toContain("still unlocks");
  });

  it("leaves a refund that is not ours as it was", async () => {
    const captured = routeSupabase();
    vi.mocked(findEntitlementByPaymentIntent).mockResolvedValue(null);
    await processStripeWebhookEvent({ event: refundEvent(2900), stripe });
    expect(captured.webhookRecord).toMatchObject({
      processed: false,
      processing_error: "payment_not_found_for_refund",
    });
  });

  it("voids on a dispute opened, and restores on a dispute won", async () => {
    routeSupabase();
    vi.mocked(findEntitlementByPaymentIntent).mockResolvedValue(
      row({ consumed_submission_id: null })
    );
    await processStripeWebhookEvent({
      event: disputeEvent("charge.dispute.created", "needs_response"),
      stripe,
    });
    expect(voidEntitlementByPaymentIntent).toHaveBeenCalledWith("pi_test_1");

    await processStripeWebhookEvent({
      event: disputeEvent("charge.dispute.closed", "won"),
      stripe,
    });
    expect(restoreDisputedEntitlement).toHaveBeenCalledWith("pi_test_1");
  });

  it("keeps a lost dispute void", async () => {
    routeSupabase();
    vi.mocked(findEntitlementByPaymentIntent).mockResolvedValue(
      row({ consumed_submission_id: null })
    );
    await processStripeWebhookEvent({
      event: disputeEvent("charge.dispute.closed", "lost"),
      stripe,
    });
    expect(restoreDisputedEntitlement).not.toHaveBeenCalled();
    expect(voidEntitlementByPaymentIntent).not.toHaveBeenCalled();
  });
});

describe("after a survey claimed the payment", () => {
  it("re-locks through the payment row and voids the entitlement on a full refund", async () => {
    routeSupabase({ existingPaymentId: 41 });
    await processStripeWebhookEvent({
      event: {
        id: "evt_refund_after",
        type: "charge.refunded",
        data: {
          object: {
            id: "ch_test_1",
            object: "charge",
            amount: 2900,
            amount_captured: 2900,
            amount_refunded: 2900,
            currency: "eur",
            payment_intent: "pi_test_1",
          },
        },
      } as unknown as Stripe.Event,
      stripe,
    });
    expect(findEntitlementByPaymentIntent).not.toHaveBeenCalled();
    expect(voidEntitlementByPaymentIntent).toHaveBeenCalledWith("pi_test_1");
  });
});
