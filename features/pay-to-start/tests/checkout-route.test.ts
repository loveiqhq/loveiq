import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@shared/http/csrf", () => ({ verifyCsrfToken: vi.fn() }));
vi.mock("@shared/http/ratelimit", () => ({
  checkRateLimit: vi.fn(),
  getClientIp: vi.fn().mockReturnValue("203.0.113.9"),
}));
vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
const mockNotifySlack = vi.fn();
vi.mock("@shared/observability/slack", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@shared/observability/slack")>();
  return { ...actual, notifySlack: (...args: unknown[]) => mockNotifySlack(...args) };
});
vi.mock("@shared/flags/system-flags", () => ({ isFeatureEnabled: vi.fn() }));
vi.mock("@features/survey/server/server", () => ({ isSurveyClosed: vi.fn() }));
vi.mock("@features/checkout/server/stripeCheckout", () => ({
  STRIPE_CHECKOUT_DISABLED_MESSAGE: "Checkout preview only.",
  // As the real one when Stripe Tax is off; with it on, see stripe-automatic-tax.test.ts.
  createCheckoutSession: (
    stripe: { checkout: { sessions: { create: (p: unknown, o: unknown) => unknown } } },
    params: unknown,
    idempotencyKey: string
  ) => stripe.checkout.sessions.create(params, { idempotencyKey }),
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
  return {
    ...actual,
    createPendingEntitlement: vi.fn(),
    findEntitlementByToken: vi.fn(),
    setEntitlementSession: vi.fn(),
  };
});

import { POST } from "@/app/api/stripe/pay-to-start/route";
import {
  getStripeServerClient,
  isStripeCheckoutEnabled,
} from "@features/checkout/server/stripeCheckout";
import { settlePayToStartSession } from "@features/checkout/server/fulfillment";
import {
  createPendingEntitlement,
  findEntitlementByToken,
  setEntitlementSession,
  type Entitlement,
} from "@features/pay-to-start/server/entitlement";
import { PAY_TO_START_PRICE_ENV } from "@features/pay-to-start/server/offer";
import {
  lookupReportTokenBySubmissionId,
  resolveSubmissionAccessContext,
} from "@features/report/server/personalReport";
import { isSurveyClosed } from "@features/survey/server/server";
import { isFeatureEnabled } from "@shared/flags/system-flags";
import { verifyCsrfToken } from "@shared/http/csrf";
import { checkRateLimit } from "@shared/http/ratelimit";

const TOKEN = `rpp_${"e".repeat(32)}`;
const ORIGIN = "https://www.loveiq.org";

function row(overrides: Partial<Entitlement> = {}): Entitlement {
  return {
    id: 7,
    prepaid_token: TOKEN,
    plan: "full_report",
    status: "pending",
    offer: "full",
    landing_variant: "sexual-archetype",
    stripe_session_id: null,
    stripe_payment_intent_id: null,
    payment_id: null,
    consumed_submission_id: null,
    consumed_at: null,
    amount_cents: null,
    list_price_cents: 2999,
    currency: "EUR",
    customer_email: null,
    is_test: false,
    paid_at: null,
    utm_tracker: null,
    created_at: "2026-10-18T10:00:00.000Z",
    ...overrides,
  };
}

const sessionsCreate = vi.fn();
const sessionsExpire = vi.fn();

function post(body: Record<string, unknown>, cookie?: string) {
  return POST(
    new Request(`${ORIGIN}/api/stripe/pay-to-start`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "user-agent": "vitest",
        ...(cookie ? { cookie } : {}),
      },
      body: JSON.stringify(body),
    })
  );
}

const VALID = { offer: "full", displayedPriceCents: 2999 };

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env[PAY_TO_START_PRICE_ENV];
  delete process.env.STRIPE_PAY_TO_START_PMC;
  mockNotifySlack.mockResolvedValue(undefined);
  vi.mocked(verifyCsrfToken).mockResolvedValue(true);
  vi.mocked(checkRateLimit).mockResolvedValue({
    allowed: true,
    remaining: 9,
    resetAt: new Date(Date.now() + 60_000),
  } as never);
  vi.mocked(isStripeCheckoutEnabled).mockReturnValue(true);
  vi.mocked(isFeatureEnabled).mockResolvedValue(true);
  vi.mocked(isSurveyClosed).mockResolvedValue(false);
  vi.mocked(getStripeServerClient).mockReturnValue({
    checkout: { sessions: { create: sessionsCreate, expire: sessionsExpire } },
  } as never);
  sessionsCreate.mockResolvedValue({ id: "cs_test_new", url: "https://checkout.stripe.com/c/new" });
  sessionsExpire.mockResolvedValue({});
  vi.mocked(createPendingEntitlement).mockResolvedValue(row());
  vi.mocked(findEntitlementByToken).mockResolvedValue(null);
  vi.mocked(setEntitlementSession).mockResolvedValue(true);
});

describe("refusals", () => {
  it("refuses without a CSRF token", async () => {
    vi.mocked(verifyCsrfToken).mockResolvedValue(false);
    expect((await post(VALID)).status).toBe(403);
  });

  it("rate limits", async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({
      allowed: false,
      remaining: 0,
      resetAt: new Date(Date.now() + 30_000),
    } as never);
    const response = await post(VALID);
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBeTruthy();
  });

  it("refuses an unknown offer", async () => {
    expect((await post({ offer: "nope", displayedPriceCents: 2999 })).status).toBe(400);
  });

  it("says checkout is unavailable where payments are off", async () => {
    vi.mocked(isStripeCheckoutEnabled).mockReturnValue(false);
    const response = await post(VALID);
    expect(await response.json()).toMatchObject({ state: "unavailable" });
    expect(sessionsCreate).not.toHaveBeenCalled();
  });

  it("sells nothing while the kill switch is off", async () => {
    vi.mocked(isFeatureEnabled).mockImplementation(async (key) => key !== "pay_to_start_checkout");
    const response = await post(VALID);
    expect(response.status).toBe(503);
    expect(createPendingEntitlement).not.toHaveBeenCalled();
  });

  it("never sells a survey that cannot be submitted", async () => {
    vi.mocked(isSurveyClosed).mockResolvedValue(true);
    expect((await post(VALID)).status).toBe(409);
    vi.mocked(isSurveyClosed).mockResolvedValue(false);
    vi.mocked(isFeatureEnabled).mockImplementation(async (key) => key !== "survey_submissions");
    expect((await post(VALID)).status).toBe(409);
    expect(createPendingEntitlement).not.toHaveBeenCalled();
  });

  it("asks for a reload when the page showed another price", async () => {
    process.env[PAY_TO_START_PRICE_ENV] = "1999";
    const response = await post(VALID);
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ state: "price_changed", priceCents: 1999 });
    expect(sessionsCreate).not.toHaveBeenCalled();
  });
});

describe("a first checkout", () => {
  it("records the entitlement, opens the session and sets the cookie", async () => {
    const response = await post(
      {
        ...VALID,
        gaClientId: "123.456",
        gaSessionId: "789",
        gaConsent: true,
        posthogDistinctId: "019a7c1e-anon",
        utmTracker: '{"utm_source":"google","utm_campaign":"archetype"}',
      },
      "other=1"
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      state: "redirect",
      url: "https://checkout.stripe.com/c/new",
    });
    expect(response.headers.get("Cache-Control")).toContain("no-store");

    const created = vi.mocked(createPendingEntitlement).mock.calls[0]?.[0];
    expect(created).toMatchObject({
      currency: "EUR",
      landingVariant: "sexual-archetype",
      listPriceCents: 2999,
      offer: "full",
      plan: "full_report",
      utmTracker: '{"utm_source":"google","utm_campaign":"archetype"}',
    });

    const [params, options] = sessionsCreate.mock.calls[0] ?? [];
    expect(params).toMatchObject({
      mode: "payment",
      allow_promotion_codes: true,
      invoice_creation: { enabled: true },
      consent_collection: { terms_of_service: "required" },
      line_items: [
        {
          price_data: {
            currency: "eur",
            product_data: { name: "LoveIQ Survey & Report" },
            // The price includes the VAT the receipt lists.
            tax_behavior: "inclusive",
            unit_amount: 2999,
          },
          quantity: 1,
        },
      ],
      success_url: `${ORIGIN}/sexual-archetype/checkout?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${ORIGIN}/sexual-archetype?checkout=cancelled`,
      metadata: {
        journey: "pay_to_start",
        offer: "full",
        entitlementId: "7",
        plan: "full_report",
        listPriceCents: "2999",
        origin: ORIGIN,
        gaClientId: "123.456",
        gaAnalyticsConsent: "1",
        posthogDistinctId: "019a7c1e-anon",
        utmSource: "google",
        utmCampaign: "archetype",
      },
    });
    expect(params.custom_text.terms_of_service_acceptance.message).toContain("18 or older");
    expect(params.custom_text.terms_of_service_acceptance.message).toContain(
      `${ORIGIN}/digital-content-terms`
    );
    expect(options).toMatchObject({ idempotencyKey: expect.any(String) });

    // An abandoned checkout closes within the hour (Stripe's default is 24 hours, and the
    // hourly sweep re-asks about every pending one until it does).
    const ttl = (params.expires_at as number) - Date.now() / 1000;
    expect(ttl).toBeGreaterThanOrEqual(60 * 60 - 1);
    expect(ttl).toBeLessThanOrEqual(61 * 60 + 1);

    // No bearer token and no hero arm in anything sent to Stripe.
    const sent = JSON.stringify(params);
    expect(sent).not.toMatch(/rpp_[A-Za-z0-9]{32}/);
    expect(params.metadata).not.toHaveProperty("landingVariant");
    expect(params.metadata).not.toHaveProperty("prepaidToken");

    expect(setEntitlementSession).toHaveBeenCalledWith({
      id: 7,
      listPriceCents: 2999,
      stripeSessionId: "cs_test_new",
    });
    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toMatch(/__liq_pp=rpp_[A-Za-z0-9]{32}/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=lax/i);
  });

  it("sells at the price setting", async () => {
    process.env[PAY_TO_START_PRICE_ENV] = "1999";
    await post({ ...VALID, displayedPriceCents: 1999 });
    expect(sessionsCreate.mock.calls[0]?.[0].line_items[0].price_data.unit_amount).toBe(1999);
    expect(vi.mocked(createPendingEntitlement).mock.calls[0]?.[0].listPriceCents).toBe(1999);
  });

  it("drops an oversized attribution snapshot", async () => {
    await post({ ...VALID, utmTracker: "x".repeat(1001) });
    expect(vi.mocked(createPendingEntitlement).mock.calls[0]?.[0].utmTracker).toBeNull();
  });

  it("uses the journey's payment method configuration when one is set", async () => {
    process.env.STRIPE_PAY_TO_START_PMC = "pmc_test_123";
    await post(VALID);
    expect(sessionsCreate.mock.calls[0]?.[0].payment_method_configuration).toBe("pmc_test_123");
  });

  it("alerts #ops when the entitlement cannot be recorded", async () => {
    vi.mocked(createPendingEntitlement).mockResolvedValue(null);
    expect((await post(VALID)).status).toBe(500);
    expect(sessionsCreate).not.toHaveBeenCalled();
    expect(mockNotifySlack).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "pts_checkout_failure" })
    );
  });

  it("alerts #ops when Stripe fails", async () => {
    sessionsCreate.mockRejectedValue(new Error("stripe down"));
    expect((await post(VALID)).status).toBe(500);
    expect(mockNotifySlack).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "pts_checkout_failure" })
    );
  });
});

describe("a browser that already holds a token", () => {
  const cookie = `__liq_pp=${TOKEN}`;

  it("sends a paid buyer to the survey instead of charging again", async () => {
    vi.mocked(findEntitlementByToken).mockResolvedValue(row({ status: "succeeded" }));
    const response = await post(VALID, cookie);
    expect(await response.json()).toEqual({ state: "paid" });
    expect(sessionsCreate).not.toHaveBeenCalled();
  });

  it("sends a used token to the payer's own report and clears the cookie", async () => {
    vi.mocked(findEntitlementByToken).mockResolvedValue(
      row({ status: "succeeded", consumed_submission_id: 42, customer_email: "buyer@example.com" })
    );
    vi.mocked(lookupReportTokenBySubmissionId).mockResolvedValue("rpt_x");
    vi.mocked(resolveSubmissionAccessContext).mockResolvedValue({
      userEmail: "buyer@example.com",
    } as never);
    const response = await post(VALID, cookie);
    expect(await response.json()).toEqual({ state: "used", reportPath: "/report/rpt_x" });
    expect(response.headers.get("set-cookie")).toMatch(/Max-Age=0/i);
  });

  it("never sends a used token to a report someone else's survey claimed", async () => {
    // The cookie can sit in another person's browser (a gift, a shared computer).
    vi.mocked(findEntitlementByToken).mockResolvedValue(
      row({ status: "succeeded", consumed_submission_id: 42, customer_email: "buyer@example.com" })
    );
    vi.mocked(lookupReportTokenBySubmissionId).mockResolvedValue("rpt_x");
    vi.mocked(resolveSubmissionAccessContext).mockResolvedValue({
      userEmail: "partner@example.com",
    } as never);
    const response = await post(VALID, cookie);
    expect(await response.json()).toEqual({ state: "used", reportPath: null });
  });

  it("hands back a session that is still open", async () => {
    vi.mocked(findEntitlementByToken).mockResolvedValue(row({ stripe_session_id: "cs_test_open" }));
    vi.mocked(settlePayToStartSession).mockResolvedValue({
      state: "open",
      entitlement: row({ stripe_session_id: "cs_test_open" }),
      session: { url: "https://checkout.stripe.com/c/open", amount_subtotal: 2999 } as never,
      firstFlip: false,
      paymentId: null,
    });
    const response = await post(VALID, cookie);
    expect(await response.json()).toEqual({
      state: "redirect",
      url: "https://checkout.stripe.com/c/open",
    });
    expect(sessionsCreate).not.toHaveBeenCalled();
  });

  it("replaces an open session opened at an old price, under the same token", async () => {
    vi.mocked(findEntitlementByToken).mockResolvedValue(row({ stripe_session_id: "cs_test_open" }));
    vi.mocked(settlePayToStartSession).mockResolvedValue({
      state: "open",
      entitlement: row({ stripe_session_id: "cs_test_open" }),
      session: { url: "https://checkout.stripe.com/c/open", amount_subtotal: 1999 } as never,
      firstFlip: false,
      paymentId: null,
    });
    const response = await post(VALID, cookie);
    expect(sessionsExpire).toHaveBeenCalledWith("cs_test_open");
    expect(createPendingEntitlement).not.toHaveBeenCalled();
    expect(await response.json()).toMatchObject({ state: "redirect" });
    expect(response.headers.get("set-cookie")).toContain(TOKEN);
  });

  it("confirms a session Stripe already took money for", async () => {
    vi.mocked(findEntitlementByToken).mockResolvedValue(row({ stripe_session_id: "cs_test_paid" }));
    vi.mocked(settlePayToStartSession).mockResolvedValue({
      state: "paid",
      entitlement: row({ status: "succeeded" }),
      session: null,
      firstFlip: true,
      paymentId: null,
    });
    const response = await post(VALID, cookie);
    expect(settlePayToStartSession).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: "cs_test_paid", source: "checkout" })
    );
    expect(await response.json()).toEqual({ state: "paid" });
  });

  it("sends a settling payment to the status page", async () => {
    vi.mocked(findEntitlementByToken).mockResolvedValue(row({ stripe_session_id: "cs_test_sepa" }));
    vi.mocked(settlePayToStartSession).mockResolvedValue({
      state: "processing",
      entitlement: row(),
      session: null,
      firstFlip: false,
      paymentId: null,
    });
    expect(await (await post(VALID, cookie)).json()).toEqual({
      state: "redirect",
      url: `${ORIGIN}/sexual-archetype/checkout?session_id=cs_test_sepa`,
    });
  });

  it("opens a new session under the same token when the old one expired", async () => {
    vi.mocked(findEntitlementByToken).mockResolvedValue(
      row({ status: "expired", stripe_session_id: "cs_test_old" })
    );
    const response = await post(VALID, cookie);
    expect(createPendingEntitlement).not.toHaveBeenCalled();
    expect(sessionsCreate.mock.calls[0]?.[0].metadata.entitlementId).toBe("7");
    expect(response.headers.get("set-cookie")).toContain(TOKEN);
  });

  it.each(["pending", "expired"] as const)(
    "never sells a checkout bound to a survey, %s and unpaid, again under its token",
    async (status) => {
      // Checkout left, then the survey: the claim bound the row. A cookie still here (a
      // claim that errored) must not make the next purchase in this browser, someone
      // else's on a shared device, pay for that survey.
      vi.mocked(findEntitlementByToken).mockResolvedValue(
        row({ status, stripe_session_id: "cs_test_old", consumed_submission_id: 42 })
      );
      vi.mocked(createPendingEntitlement).mockResolvedValue(row({ id: 8 }));
      const response = await post(VALID, cookie);
      expect(await response.json()).toMatchObject({ state: "redirect" });
      expect(settlePayToStartSession).not.toHaveBeenCalled();
      expect(createPendingEntitlement).toHaveBeenCalled();
      expect(sessionsCreate.mock.calls[0]?.[0].metadata.entitlementId).not.toBe("7");
      expect(response.headers.get("set-cookie")).not.toContain(TOKEN);
    }
  );

  it("starts afresh after a refund", async () => {
    vi.mocked(findEntitlementByToken).mockResolvedValue(row({ status: "refunded" }));
    const response = await post(VALID, cookie);
    expect(createPendingEntitlement).toHaveBeenCalled();
    expect(response.headers.get("set-cookie")).not.toContain(TOKEN);
  });
});

describe("the session's expiry", () => {
  it("is the same for every click in one minute, and lives at least an hour", async () => {
    const { payToStartSessionExpiresAt, PAY_TO_START_SESSION_TTL_SECONDS } =
      await import("@features/pay-to-start/server/checkout");
    const minute = Date.parse("2026-10-18T12:34:00.000Z");
    // Identical parameters inside a minute: the idempotency key's condition for a double click.
    expect(payToStartSessionExpiresAt(minute + 1_000)).toBe(
      payToStartSessionExpiresAt(minute + 59_000)
    );
    for (const at of [minute, minute + 59_999]) {
      const left = payToStartSessionExpiresAt(at) - at / 1000;
      expect(left).toBeGreaterThanOrEqual(PAY_TO_START_SESSION_TTL_SECONDS);
      // Stripe accepts 30 minutes to 24 hours.
      expect(left).toBeLessThanOrEqual(24 * 60 * 60);
    }
  });
});

/** The initial report (EUR 1.99, Marcus 19.10): its own page, plan and price. */
describe("the initial report's checkout", () => {
  const PRE = { offer: "pre", displayedPriceCents: 199 };
  const cookie = `__liq_pp=${TOKEN}`;
  const preRow = (overrides: Partial<Entitlement> = {}) =>
    row({ offer: "pre", plan: "initial", list_price_cents: 199, ...overrides });

  it("sells the survey and the initial report at EUR 1.99, and returns to its own page", async () => {
    vi.mocked(createPendingEntitlement).mockResolvedValue(preRow());
    const response = await post(PRE);
    expect(await response.json()).toEqual({
      state: "redirect",
      url: "https://checkout.stripe.com/c/new",
    });
    expect(vi.mocked(createPendingEntitlement).mock.calls[0]?.[0]).toMatchObject({
      listPriceCents: 199,
      offer: "pre",
      plan: "initial",
    });
    expect(sessionsCreate.mock.calls[0]?.[0]).toMatchObject({
      line_items: [
        {
          price_data: {
            product_data: { name: "LoveIQ Survey & Initial Report" },
            tax_behavior: "inclusive",
            unit_amount: 199,
          },
        },
      ],
      success_url: `${ORIGIN}/sexual-archetype/checkout?session_id={CHECKOUT_SESSION_ID}&offer=pre`,
      cancel_url: `${ORIGIN}/sexual-archetype/initial?checkout=cancelled`,
      metadata: {
        offer: "pre",
        plan: "initial",
        listPriceCents: "199",
        landingPage: "/sexual-archetype/initial",
      },
    });
  });

  it("keeps its price whatever the full offer's setting says", async () => {
    process.env[PAY_TO_START_PRICE_ENV] = "1999";
    vi.mocked(createPendingEntitlement).mockResolvedValue(preRow());
    await post(PRE);
    expect(sessionsCreate.mock.calls[0]?.[0].line_items[0].price_data.unit_amount).toBe(199);
  });

  it("sends a browser that paid for the full report to its survey, not to a second payment", async () => {
    vi.mocked(findEntitlementByToken).mockResolvedValue(row({ status: "succeeded" }));
    expect(await (await post(PRE, cookie)).json()).toEqual({ state: "paid" });
    expect(sessionsCreate).not.toHaveBeenCalled();
  });

  it("closes the full report's open session rather than hand it back, and starts its own", async () => {
    vi.mocked(findEntitlementByToken).mockResolvedValue(row({ stripe_session_id: "cs_test_open" }));
    vi.mocked(settlePayToStartSession).mockResolvedValue({
      state: "open",
      entitlement: row({ stripe_session_id: "cs_test_open" }),
      session: { url: "https://checkout.stripe.com/c/open", amount_subtotal: 2999 } as never,
      firstFlip: false,
      paymentId: null,
    });
    vi.mocked(createPendingEntitlement).mockResolvedValue(preRow({ id: 8 }));
    const response = await post(PRE, cookie);
    expect(sessionsExpire).toHaveBeenCalledWith("cs_test_open");
    expect(createPendingEntitlement).toHaveBeenCalledWith(
      expect.objectContaining({ offer: "pre", plan: "initial" })
    );
    expect(sessionsCreate.mock.calls[0]?.[0].metadata.entitlementId).toBe("8");
    expect(response.headers.get("set-cookie")).not.toContain(TOKEN);
  });

  it("never sells itself under the full report's expired row", async () => {
    vi.mocked(findEntitlementByToken).mockResolvedValue(
      row({ status: "expired", stripe_session_id: "cs_test_old" })
    );
    vi.mocked(createPendingEntitlement).mockResolvedValue(preRow({ id: 8 }));
    await post(PRE, cookie);
    expect(createPendingEntitlement).toHaveBeenCalledWith(
      expect.objectContaining({ offer: "pre", plan: "initial" })
    );
  });

  it("hands back its own open session", async () => {
    vi.mocked(findEntitlementByToken).mockResolvedValue(
      preRow({ stripe_session_id: "cs_test_open" })
    );
    vi.mocked(settlePayToStartSession).mockResolvedValue({
      state: "open",
      entitlement: preRow({ stripe_session_id: "cs_test_open" }),
      session: { url: "https://checkout.stripe.com/c/open", amount_subtotal: 199 } as never,
      firstFlip: false,
      paymentId: null,
    });
    expect(await (await post(PRE, cookie)).json()).toEqual({
      state: "redirect",
      url: "https://checkout.stripe.com/c/open",
    });
    expect(sessionsExpire).not.toHaveBeenCalled();
  });

  it("sends its settling payment to the status page, which then sells it again", async () => {
    vi.mocked(findEntitlementByToken).mockResolvedValue(
      preRow({ stripe_session_id: "cs_test_sepa" })
    );
    vi.mocked(settlePayToStartSession).mockResolvedValue({
      state: "processing",
      entitlement: preRow(),
      session: null,
      firstFlip: false,
      paymentId: null,
    });
    expect(await (await post(PRE, cookie)).json()).toEqual({
      state: "redirect",
      url: `${ORIGIN}/sexual-archetype/checkout?session_id=cs_test_sepa&offer=pre`,
    });
  });
});
