import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@shared/http/ratelimit", () => ({
  checkRateLimit: vi.fn(),
  getClientIp: vi.fn().mockReturnValue("203.0.113.9"),
}));
vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@features/checkout/server/stripeCheckout", () => ({
  STRIPE_CHECKOUT_DISABLED_MESSAGE: "Checkout preview only.",
  getStripeServerClient: vi.fn(),
  isStripeCheckoutEnabled: vi.fn(),
}));
vi.mock("@features/checkout/server/fulfillment", () => ({ settlePayToStartSession: vi.fn() }));
vi.mock("@features/report/server/personalReport", () => ({
  lookupReportTokenBySubmissionId: vi.fn(),
}));
vi.mock("@features/pay-to-start/server/entitlement", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@features/pay-to-start/server/entitlement")>();
  return { ...actual, findEntitlementByToken: vi.fn() };
});

import { GET as getStatus } from "@/app/api/stripe/pay-to-start/status/route";
import { GET as getContinue } from "@/app/sexual-archetype/continue/route";
import {
  getStripeServerClient,
  isStripeCheckoutEnabled,
} from "@features/checkout/server/stripeCheckout";
import { settlePayToStartSession } from "@features/checkout/server/fulfillment";
import {
  findEntitlementByToken,
  type Entitlement,
} from "@features/pay-to-start/server/entitlement";
import { lookupReportTokenBySubmissionId } from "@features/report/server/personalReport";
import { checkRateLimit } from "@shared/http/ratelimit";

const TOKEN = `rpp_${"f".repeat(32)}`;
const ORIGIN = "https://www.loveiq.org";
const SESSION = "cs_test_a1B2c3D4e5F6g7";

function row(overrides: Partial<Entitlement> = {}): Entitlement {
  return {
    id: 7,
    prepaid_token: TOKEN,
    plan: "full_report",
    status: "succeeded",
    offer: "full",
    landing_variant: "sexual-archetype",
    stripe_session_id: SESSION,
    stripe_payment_intent_id: "pi_test_1",
    payment_id: null,
    consumed_submission_id: null,
    consumed_at: null,
    amount_cents: 2900,
    list_price_cents: 2900,
    currency: "EUR",
    customer_email: "buyer@example.com",
    is_test: false,
    paid_at: "2026-10-18T10:05:00.000Z",
    utm_tracker: null,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

function settled(state: string, entitlement: Entitlement | null) {
  vi.mocked(settlePayToStartSession).mockResolvedValue({
    state: state as never,
    entitlement,
    session: null,
    firstFlip: false,
    paymentId: null,
  });
}

function status(sessionId: string, cookie?: string) {
  return getStatus(
    new Request(`${ORIGIN}/api/stripe/pay-to-start/status?session_id=${sessionId}`, {
      headers: cookie ? { cookie } : {},
    })
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(checkRateLimit).mockResolvedValue({
    allowed: true,
    remaining: 59,
    resetAt: new Date(),
  } as never);
  vi.mocked(isStripeCheckoutEnabled).mockReturnValue(true);
  vi.mocked(getStripeServerClient).mockReturnValue({} as never);
});

describe("GET /api/stripe/pay-to-start/status", () => {
  it("refuses anything that is not a Checkout session id", async () => {
    expect((await status("pi_test_1")).status).toBe(400);
    expect((await status("cs_test_x%26a%3D1")).status).toBe(400);
    expect(settlePayToStartSession).not.toHaveBeenCalled();
  });

  it("reports paid with the purchase the page sends to GA4 once", async () => {
    settled("paid", row());
    const response = await status(SESSION, `__liq_pp=${TOKEN}`);
    expect(await response.json()).toEqual({
      state: "paid",
      purchase: {
        value: 29,
        currency: "EUR",
        transaction_id: SESSION,
        item_name: "LoveIQ Survey & Report",
        isTest: false,
      },
    });
    expect(settlePayToStartSession).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: SESSION, source: "status" })
    );
    // Same token already in the browser: nothing to hand over.
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("hands the entitlement to a browser that came back without its cookie", async () => {
    settled("paid", row());
    const response = await status(SESSION);
    expect(response.headers.get("set-cookie")).toContain(`__liq_pp=${TOKEN}`);
  });

  it("never hands over an entitlement that is used, unpaid or old", async () => {
    settled("open", row({ status: "pending" }));
    expect((await status(SESSION)).headers.get("set-cookie")).toBeNull();

    settled("paid", row({ created_at: "2026-01-01T00:00:00.000Z" }));
    expect((await status(SESSION)).headers.get("set-cookie")).toBeNull();

    vi.mocked(lookupReportTokenBySubmissionId).mockResolvedValue("rpt_x");
    settled("paid", row({ consumed_submission_id: 42 }));
    const used = await status(SESSION);
    expect(used.headers.get("set-cookie")).toBeNull();
    expect(await used.json()).toMatchObject({ state: "used", reportPath: "/report/rpt_x" });
  });

  it("passes the other states through", async () => {
    for (const state of ["processing", "open", "expired", "failed", "refunded"]) {
      settled(state, row({ status: "pending" }));
      expect(await (await status(SESSION)).json()).toEqual({ state });
    }
    settled("unknown", null);
    expect(await (await status(SESSION)).json()).toEqual({ state: "unknown" });
  });

  it("says unavailable where payments are off", async () => {
    vi.mocked(isStripeCheckoutEnabled).mockReturnValue(false);
    expect(await (await status(SESSION)).json()).toMatchObject({ state: "unavailable" });
  });

  it("rate limits", async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({
      allowed: false,
      remaining: 0,
      resetAt: new Date(),
    } as never);
    expect((await status(SESSION)).status).toBe(429);
  });
});

describe("GET /sexual-archetype/continue", () => {
  function open(t: string) {
    return getContinue(new Request(`${ORIGIN}/sexual-archetype/continue?t=${t}`));
  }

  it("sets the cookie and goes to the survey for a paid, unused entitlement", async () => {
    vi.mocked(findEntitlementByToken).mockResolvedValue(row());
    const response = await open(TOKEN);
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(`${ORIGIN}/survey`);
    expect(response.headers.get("set-cookie")).toContain(`__liq_pp=${TOKEN}`);
    expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("opens the report once the entitlement is used", async () => {
    vi.mocked(findEntitlementByToken).mockResolvedValue(row({ consumed_submission_id: 42 }));
    vi.mocked(lookupReportTokenBySubmissionId).mockResolvedValue("rpt_x");
    const response = await open(TOKEN);
    expect(response.headers.get("location")).toBe(`${ORIGIN}/report/rpt_x?from=email`);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("explains a refunded, unknown or malformed link on the landing page", async () => {
    vi.mocked(findEntitlementByToken).mockResolvedValue(row({ status: "refunded" }));
    expect((await open(TOKEN)).headers.get("location")).toBe(
      `${ORIGIN}/sexual-archetype?continue=refunded`
    );
    vi.mocked(findEntitlementByToken).mockResolvedValue(null);
    expect((await open(TOKEN)).headers.get("location")).toBe(
      `${ORIGIN}/sexual-archetype?continue=invalid`
    );
    expect((await open("rpp_short")).headers.get("location")).toBe(
      `${ORIGIN}/sexual-archetype?continue=invalid`
    );
  });

  it("sends a payment still settling to the status page", async () => {
    vi.mocked(findEntitlementByToken).mockResolvedValue(row({ status: "pending" }));
    expect((await open(TOKEN)).headers.get("location")).toBe(
      `${ORIGIN}/sexual-archetype/checkout?session_id=${SESSION}`
    );
  });
});
