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
  resolveSubmissionAccessContext: vi.fn(),
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
import {
  lookupReportTokenBySubmissionId,
  resolveSubmissionAccessContext,
} from "@features/report/server/personalReport";
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
    paid_at: new Date().toISOString(),
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

  it("hands it over while a wallet's payment still settles, too", async () => {
    settled("processing", row({ status: "pending", paid_at: null }));
    const response = await status(SESSION);
    expect(await response.json()).toEqual({ state: "processing" });
    expect(response.headers.get("set-cookie")).toContain(`__liq_pp=${TOKEN}`);
  });

  it("never hands over an entitlement that is used, unpaid, or paid over two hours ago", async () => {
    settled("open", row({ status: "pending" }));
    expect((await status(SESSION)).headers.get("set-cookie")).toBeNull();

    // The session id is no secret (GA4, Ads and PostHog get it as the transaction id), so
    // the handover is for the return right after paying, measured from the payment.
    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    settled("paid", row({ paid_at: threeHoursAgo }));
    expect((await status(SESSION)).headers.get("set-cookie")).toBeNull();
    settled("paid", row({ paid_at: new Date(Date.now() - 60 * 60 * 1000).toISOString() }));
    expect((await status(SESSION)).headers.get("set-cookie")).toContain(`__liq_pp=${TOKEN}`);

    settled("paid", row({ consumed_submission_id: 42 }));
    const used = await status(SESSION);
    expect(used.headers.get("set-cookie")).toBeNull();
    expect(await used.json()).toMatchObject({ state: "used" });
  });

  it("never opens the report a used entitlement unlocked, even for the payer", async () => {
    // Anyone holding the session id would otherwise read the survey taker's report.
    vi.mocked(lookupReportTokenBySubmissionId).mockResolvedValue("rpt_x");
    vi.mocked(resolveSubmissionAccessContext).mockResolvedValue({
      userEmail: "buyer@example.com",
    } as never);
    settled("paid", row({ consumed_submission_id: 42 }));
    const body = await (await status(SESSION)).json();
    expect(body).toMatchObject({ state: "used", reportPath: null });
    expect(JSON.stringify(body)).not.toContain("rpt_");
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

  it("opens the payer's own report once the entitlement is used", async () => {
    vi.mocked(findEntitlementByToken).mockResolvedValue(row({ consumed_submission_id: 42 }));
    vi.mocked(lookupReportTokenBySubmissionId).mockResolvedValue("rpt_x");
    vi.mocked(resolveSubmissionAccessContext).mockResolvedValue({
      userEmail: " Buyer@Example.com ",
    } as never);
    const response = await open(TOKEN);
    expect(response.headers.get("location")).toBe(`${ORIGIN}/report/rpt_x?from=email`);
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(resolveSubmissionAccessContext).toHaveBeenCalledWith({ submissionId: 42 });
  });

  it("never opens a report someone else's survey claimed with the purchase", async () => {
    // A gift, a forwarded email, a shared browser: the report is the survey taker's.
    vi.mocked(findEntitlementByToken).mockResolvedValue(row({ consumed_submission_id: 42 }));
    vi.mocked(lookupReportTokenBySubmissionId).mockResolvedValue("rpt_x");
    vi.mocked(resolveSubmissionAccessContext).mockResolvedValue({
      userEmail: "someone-else@example.com",
    } as never);
    const response = await open(TOKEN);
    expect(response.headers.get("location")).toBe(`${ORIGIN}/sexual-archetype?continue=used`);
    expect(response.headers.get("location")).not.toContain("rpt_");
    expect(response.headers.get("set-cookie")).toBeNull();

    // No payer address, or a lookup that fails: the same.
    vi.mocked(findEntitlementByToken).mockResolvedValue(
      row({ consumed_submission_id: 42, customer_email: null })
    );
    expect((await open(TOKEN)).headers.get("location")).toBe(
      `${ORIGIN}/sexual-archetype?continue=used`
    );
    vi.mocked(findEntitlementByToken).mockResolvedValue(row({ consumed_submission_id: 42 }));
    vi.mocked(resolveSubmissionAccessContext).mockRejectedValue(new Error("db down"));
    expect((await open(TOKEN)).headers.get("location")).toBe(
      `${ORIGIN}/sexual-archetype?continue=used`
    );
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

  it("explains a problem with the initial report's link on its own page", async () => {
    vi.mocked(findEntitlementByToken).mockResolvedValue(row({ offer: "pre", status: "refunded" }));
    expect((await open(TOKEN)).headers.get("location")).toBe(
      `${ORIGIN}/sexual-archetype/initial?continue=refunded`
    );
    vi.mocked(findEntitlementByToken).mockResolvedValue(row({ offer: "pre", status: "pending" }));
    expect((await open(TOKEN)).headers.get("location")).toBe(
      `${ORIGIN}/sexual-archetype/initial?continue=unpaid`
    );
  });

  it("never sets the cookie for a checkout still pending", async () => {
    // The email goes out only once a payment is confirmed: a link to a pending one is not
    // ours, and setting its cookie would plant that checkout in someone else's browser.
    vi.mocked(findEntitlementByToken).mockResolvedValue(row({ status: "pending" }));
    const response = await open(TOKEN);
    expect(response.headers.get("location")).toBe(`${ORIGIN}/sexual-archetype?continue=unpaid`);
    expect(response.headers.get("set-cookie")).toBeNull();
  });
});
