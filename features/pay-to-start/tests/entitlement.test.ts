import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

import { PREPAID_TOKEN_REGEX } from "@features/pay-to-start/logic/journey";
import {
  PREPAID_COOKIE,
  PREPAID_COOKIE_MAX_AGE_SECONDS,
  bindEntitlement,
  clearedPrepaidCookieOptions,
  createPendingEntitlement,
  findEntitlementBySessionId,
  findEntitlementByToken,
  generatePrepaidToken,
  hasBoundEntitlement,
  listBoundUnapplied,
  listPendingForReconcile,
  markEntitlementExpired,
  markEntitlementRefundedUnconfirmed,
  markEntitlementSucceeded,
  prepaidCookieOptions,
  restoreDisputedEntitlement,
  setEntitlementPaymentId,
  setEntitlementSession,
  voidEntitlementByPaymentIntent,
  type Entitlement,
} from "@features/pay-to-start/server/entitlement";

const TOKEN = `rpp_${"a".repeat(32)}`;

interface Call {
  url: string;
  method: string;
  body: Record<string, unknown> | null;
  prefer: string | undefined;
}

let calls: Call[] = [];

function respond(body: unknown, ok = true) {
  return { ok, status: ok ? 200 : 500, json: async () => body } as Response;
}

/** Records every request; `reply` decides the response. */
function routeFetch(reply: (call: Call) => Response) {
  mockFetchWithTimeout.mockImplementation(
    async (
      url: string,
      options: { method?: string; body?: string; headers?: Record<string, string> } = {}
    ) => {
      const call: Call = {
        url,
        method: options.method ?? "GET",
        body: options.body ? (JSON.parse(options.body) as Record<string, unknown>) : null,
        prefer: options.headers?.Prefer,
      };
      calls.push(call);
      return reply(call);
    }
  );
}

function row(overrides: Partial<Entitlement> = {}): Entitlement {
  return {
    id: 7,
    prepaid_token: TOKEN,
    plan: "full_report",
    status: "pending",
    offer: "full",
    landing_variant: "sexual-archetype",
    stripe_session_id: "cs_test_1",
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
    utm_tracker: null,
    created_at: "2026-10-18T10:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  calls = [];
  mockFetchWithTimeout.mockReset();
  process.env.SUPABASE_URL = "https://db.example";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("token and cookie", () => {
  it("mints unique tokens in the accepted format", () => {
    const tokens = new Set(Array.from({ length: 50 }, () => generatePrepaidToken()));
    expect(tokens.size).toBe(50);
    for (const token of tokens) expect(token).toMatch(PREPAID_TOKEN_REGEX);
  });

  it("keeps the token away from page scripts and alive for 30 days", () => {
    const options = prepaidCookieOptions();
    expect(options).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/" });
    expect(options.maxAge).toBe(PREPAID_COOKIE_MAX_AGE_SECONDS);
    expect(PREPAID_COOKIE_MAX_AGE_SECONDS).toBe(60 * 60 * 24 * 30);
    expect(clearedPrepaidCookieOptions().maxAge).toBe(0);
  });

  it("uses the plain cookie name outside production (no __Host- on http)", () => {
    expect(PREPAID_COOKIE).toBe("__liq_pp");
  });
});

describe("createPendingEntitlement", () => {
  it("inserts a pending journey row with the list price and attribution", async () => {
    routeFetch(() => respond([row()]));
    const created = await createPendingEntitlement({
      currency: "eur",
      landingVariant: "sexual-archetype",
      listPriceCents: 2900,
      offer: "full",
      plan: "full_report",
      token: TOKEN,
      utmTracker: '{"utm_source":"google"}',
    });
    expect(created?.id).toBe(7);
    expect(calls[0]?.method).toBe("POST");
    expect(calls[0]?.prefer).toBe("return=representation");
    expect(calls[0]?.body).toEqual({
      prepaid_token: TOKEN,
      plan: "full_report",
      status: "pending",
      offer: "full",
      landing_variant: "sexual-archetype",
      list_price_cents: 2900,
      currency: "EUR",
      utm_tracker: '{"utm_source":"google"}',
    });
  });

  it("returns null when the insert fails", async () => {
    routeFetch(() => respond({ message: "nope" }, false));
    const created = await createPendingEntitlement({
      currency: "EUR",
      landingVariant: "sexual-archetype",
      listPriceCents: 2900,
      offer: "full",
      plan: "full_report",
      token: TOKEN,
      utmTracker: null,
    });
    expect(created).toBeNull();
  });
});

describe("lookups", () => {
  it("refuses a malformed token without asking the database", async () => {
    routeFetch(() => respond([row()]));
    expect(await findEntitlementByToken("rpp_short")).toBeNull();
    expect(await findEntitlementByToken(`${TOKEN}&status=eq.succeeded`)).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it("finds by token", async () => {
    routeFetch(() => respond([row()]));
    expect((await findEntitlementByToken(TOKEN))?.id).toBe(7);
    expect(calls[0]?.url).toContain(`prepaid_token=eq.${TOKEN}&offer=not.is.null`);
  });

  it("matches journey rows only by session, never June's", async () => {
    routeFetch(() => respond([]));
    expect(await findEntitlementBySessionId("cs_test_1")).toBeNull();
    expect(calls[0]?.url).toContain("stripe_session_id=eq.cs_test_1");
    expect(calls[0]?.url).toContain("offer=not.is.null");
  });

  it("throws on a failed lookup, so callers never read an outage as 'no entitlement'", async () => {
    routeFetch(() => respond({}, false));
    await expect(findEntitlementByToken(TOKEN)).rejects.toThrow(
      "prepaid_entitlement_lookup_failed"
    );
  });

  it("hasBoundEntitlement says false on an outage instead of throwing", async () => {
    routeFetch(() => respond({}, false));
    expect(await hasBoundEntitlement(42)).toBe(false);
  });

  it("hasBoundEntitlement finds a claimed row by its submission", async () => {
    routeFetch(() => respond([row({ consumed_submission_id: 42 })]));
    expect(await hasBoundEntitlement(42)).toBe(true);
    expect(calls[0]?.url).toContain("consumed_submission_id=eq.42");
  });
});

describe("setEntitlementSession", () => {
  it("re-points a pending or expired row at a new session and makes it pending", async () => {
    routeFetch(() => respond([]));
    expect(await setEntitlementSession({ id: 7, stripeSessionId: "cs_test_2" })).toBe(true);
    expect(calls[0]?.url).toContain("id=eq.7&status=in.(pending,expired)");
    expect(calls[0]?.body).toMatchObject({ stripe_session_id: "cs_test_2", status: "pending" });
  });
});

describe("markEntitlementSucceeded (the first flip)", () => {
  const input = {
    amountCents: 2900,
    currency: "eur",
    customerEmail: "buyer@example.com",
    id: 7,
    isTest: false,
    paidAt: "2026-10-18T10:05:00.000Z",
    paymentIntentId: "pi_test_1",
  };

  it("flips only a pending row and returns it to the caller that flipped it", async () => {
    routeFetch(() => respond([row({ status: "succeeded", amount_cents: 2900 })]));
    const flipped = await markEntitlementSucceeded(input);
    expect(flipped?.status).toBe("succeeded");
    expect(calls[0]?.method).toBe("PATCH");
    expect(calls[0]?.url).toContain("id=eq.7&status=eq.pending");
    expect(calls[0]?.prefer).toBe("return=representation");
    expect(calls[0]?.body).toMatchObject({
      status: "succeeded",
      amount_cents: 2900,
      currency: "EUR",
      customer_email: "buyer@example.com",
      is_test: false,
      paid_at: "2026-10-18T10:05:00.000Z",
      stripe_payment_intent_id: "pi_test_1",
    });
  });

  it("returns null to every later caller: the side effects run once", async () => {
    routeFetch(() => respond([]));
    expect(await markEntitlementSucceeded(input)).toBeNull();
  });

  it("keeps the row's currency when Stripe sends none", async () => {
    routeFetch(() => respond([row({ status: "succeeded" })]));
    await markEntitlementSucceeded({ ...input, currency: null });
    expect(calls[0]?.body).not.toHaveProperty("currency");
  });

  it("throws on a failed write, so a webhook retry can try again", async () => {
    routeFetch(() => respond({}, false));
    await expect(markEntitlementSucceeded(input)).rejects.toThrow(
      "prepaid_entitlement_succeed_failed"
    );
  });
});

describe("markEntitlementExpired", () => {
  it("expires a pending row only while it still points at that session", async () => {
    routeFetch(() => respond([]));
    await markEntitlementExpired({ id: 7, stripeSessionId: "cs_test_1" });
    expect(calls[0]?.url).toContain("id=eq.7&status=eq.pending&stripe_session_id=eq.cs_test_1");
    expect(calls[0]?.body).toMatchObject({ status: "expired" });
  });
});

describe("bindEntitlement (one payment, one report)", () => {
  it("binds through the concurrency filter and reports the win", async () => {
    routeFetch(() => respond([{ id: 7 }]));
    expect(await bindEntitlement({ id: 7, submissionId: 42 })).toBe(true);
    const url = calls[0]?.url ?? "";
    expect(url).toContain("id=eq.7");
    expect(url).toContain("consumed_submission_id=is.null");
    expect(url).toContain("payment_id=is.null");
    expect(url).toContain("status=in.(pending,succeeded)");
    expect(calls[0]?.prefer).toBe("return=representation");
    expect(calls[0]?.body).toMatchObject({ consumed_submission_id: 42 });
    expect(typeof calls[0]?.body?.consumed_at).toBe("string");
  });

  it("reports a loss when the filter matched nothing (claimed, refunded or expired)", async () => {
    routeFetch(() => respond([]));
    expect(await bindEntitlement({ id: 7, submissionId: 42 })).toBe(false);
  });

  it("lets exactly one of two simultaneous claims win", async () => {
    let consumed: number | null = null;
    routeFetch((call) => {
      if (consumed !== null) return respond([]);
      consumed = call.body?.consumed_submission_id as number;
      return respond([{ id: 7 }]);
    });
    const results = await Promise.all([
      bindEntitlement({ id: 7, submissionId: 42 }),
      bindEntitlement({ id: 7, submissionId: 43 }),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it("throws on a failed write rather than reporting a loss", async () => {
    routeFetch(() => respond({}, false));
    await expect(bindEntitlement({ id: 7, submissionId: 42 })).rejects.toThrow(
      "prepaid_entitlement_bind_failed"
    );
  });
});

describe("refunds and disputes", () => {
  it("voids succeeded rows of a refunded payment intent", async () => {
    routeFetch(() => respond([row({ status: "refunded" })]));
    const voided = await voidEntitlementByPaymentIntent("pi_test_1");
    expect(voided).toHaveLength(1);
    expect(calls[0]?.url).toContain(
      "stripe_payment_intent_id=eq.pi_test_1&offer=not.is.null&status=eq.succeeded"
    );
    expect(calls[0]?.body).toMatchObject({ status: "refunded" });
  });

  it("does nothing without a payment intent and never throws", async () => {
    routeFetch(() => respond({}, false));
    expect(await voidEntitlementByPaymentIntent(null)).toEqual([]);
    expect(calls).toHaveLength(0);
    expect(await voidEntitlementByPaymentIntent("pi_test_1")).toEqual([]);
  });

  it("restores a refunded row after a won dispute", async () => {
    routeFetch(() => respond([row({ status: "succeeded" })]));
    await restoreDisputedEntitlement("pi_test_1");
    expect(calls[0]?.url).toContain("offer=not.is.null&status=eq.refunded");
    expect(calls[0]?.body).toMatchObject({ status: "succeeded" });
  });
});

describe("setEntitlementPaymentId", () => {
  it("stamps only an unapplied row and says whether this call did", async () => {
    routeFetch(() => respond([{ id: 7 }]));
    expect(await setEntitlementPaymentId({ id: 7, paymentId: 99 })).toBe(true);
    expect(calls[0]?.url).toContain("id=eq.7&payment_id=is.null");
    expect(calls[0]?.body).toMatchObject({ payment_id: 99 });
  });

  it("says no when another call stamped it first, or the write failed", async () => {
    routeFetch(() => respond([]));
    expect(await setEntitlementPaymentId({ id: 7, paymentId: 99 })).toBe(false);
    routeFetch(() => respond({}, false));
    expect(await setEntitlementPaymentId({ id: 7, paymentId: 99 })).toBe(false);
  });
});

describe("sweep lists", () => {
  it("lists journey rows still pending inside the window, by their last change", async () => {
    // updated_at, not created_at: a token re-used days later for a new session (the
    // cookie lasts 30 days) is as fresh as that session, and must still be swept.
    routeFetch(() => respond([row()]));
    await listPendingForReconcile({
      newerThan: new Date("2026-10-16T10:00:00.000Z"),
      olderThan: new Date("2026-10-18T09:50:00.000Z"),
    });
    const url = calls[0]?.url ?? "";
    expect(url).toContain("status=eq.pending&offer=not.is.null&stripe_session_id=not.is.null");
    expect(url).toContain("updated_at=lt.2026-10-18T09%3A50%3A00.000Z");
    expect(url).toContain("updated_at=gt.2026-10-16T10%3A00%3A00.000Z");
    expect(url).toContain("order=updated_at.asc&limit=50");
    expect(url).not.toContain("created_at=");
  });

  it("marks a payment refunded before any confirmation, only while it is unconfirmed", async () => {
    routeFetch(() => respond([{ id: 7 }]));
    expect(await markEntitlementRefundedUnconfirmed({ id: 7, paymentIntentId: "pi_1" })).toBe(true);
    const call = calls[0]!;
    expect(call.url).toContain("id=eq.7&status=in.(pending,expired)");
    expect(call.method).toBe("PATCH");
    expect(call.body).toMatchObject({
      status: "refunded",
      stripe_payment_intent_id: "pi_1",
    });
    routeFetch(() => respond([]));
    expect(await markEntitlementRefundedUnconfirmed({ id: 7, paymentIntentId: null })).toBe(false);
  });

  it("lists paid, claimed rows whose payment never got written", async () => {
    routeFetch(() => respond([]));
    await listBoundUnapplied();
    const url = calls[0]?.url ?? "";
    expect(url).toContain("status=eq.succeeded");
    expect(url).toContain("consumed_submission_id=not.is.null&payment_id=is.null");
  });
});
