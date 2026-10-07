import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@shared/http/csrf", () => ({
  verifyCsrfToken: vi.fn().mockResolvedValue(true),
}));

vi.mock("@shared/http/ratelimit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 9, resetAt: new Date() }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}));

vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@features/checkout/server/stripeCheckout", () => ({
  STRIPE_CHECKOUT_DISABLED_MESSAGE:
    "Checkout preview only. Payments are not enabled in this environment yet.",
  ensureUpgradeCreditCoupon: vi.fn(
    async (_stripe: unknown, cents: number) => `upgrade_credit_eur_${cents}`
  ),
  getStripeCheckoutCustomerEmail: vi.fn(),
  getStripeServerClient: vi.fn(),
  isStripeCheckoutEnabled: vi.fn().mockReturnValue(true),
}));

vi.mock("@features/pricing/logic/reportPricing", () => ({
  getReportPriceQuoteForContext: vi.fn(),
  markReportPriceQuoteCheckoutStarted: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@features/checkout/server/promoCodes", async () => {
  const actual = await vi.importActual<typeof import("@features/checkout/server/promoCodes")>(
    "@features/checkout/server/promoCodes"
  );
  return {
    ...actual,
    resolveNurturePromo: vi.fn(),
  };
});

import { POST } from "@/app/api/stripe/checkout-session/route";
import {
  ensureUpgradeCreditCoupon,
  getStripeCheckoutCustomerEmail,
  getStripeServerClient,
  isStripeCheckoutEnabled,
} from "@features/checkout/server/stripeCheckout";
import { getReportPriceQuoteForContext } from "@features/pricing/logic/reportPricing";
import { resolveNurturePromo } from "@features/checkout/server/promoCodes";

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/stripe/checkout-session", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-csrf-token": "valid-token",
      "user-agent": "Mozilla/5.0 (Vitest)",
    },
    body: JSON.stringify(body),
  });
}

const QUOTE = {
  id: 22,
  plan: "all_reports" as const,
  currency: "EUR",
  experimentGroup: "B",
  basePriceBucket: "full_center",
  basePriceCents: 5999,
  msrpCents: 5999,
  startingPriceCents: 2999,
  currentPriceCents: 2749,
  chargedPriceCents: 2749,
  initialPriceCents: 2999,
  discountMultiplier: 1,
  discountStep: 0,
  pricingClusterId: "B-full_report-full_center",
  countryTier: "tier_2",
  countryMultiplier: 1,
  deviceType: "Desktop",
  deviceMultiplier: 1.05,
  trafficSource: "google",
  trafficMultiplier: 1.1,
  behavioralBucket: "serious",
  behavioralMultiplier: 1.2,
  engagementScore: 40,
  engagementMultiplier: 1.1,
  reportPreviewViews: 2,
  fantasySignalCount: 1,
  surveyDurationMs: 600000,
  initialPriceTimestamp: "2026-04-14T10:00:00.000Z",
  expiresAt: "2026-05-05T10:00:00.000Z",
  checkoutStartedAt: null,
  purchasedAt: null,
  viewCount: 1,
};

/**
 * All 14 credits what was already paid on the report: Stripe's line keeps the regular
 * price and the credit is its discount, so the page and the receipt both show it.
 */
describe("POST /api/stripe/checkout-session (All 14 upgrade credit)", () => {
  let createSession: ReturnType<typeof vi.fn>;
  const body = { plan: "all_reports", reportSessionId: "02d88f31-eceb-4402-940d-c8cd98d01848" };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isStripeCheckoutEnabled).mockReturnValue(true);
    vi.mocked(getStripeCheckoutCustomerEmail).mockResolvedValue("test@example.com");
    vi.mocked(resolveNurturePromo).mockResolvedValue(null);
    createSession = vi.fn().mockResolvedValue({
      id: "cs_test",
      url: "https://checkout.stripe.com/c/pay/cs_test",
    });
    vi.mocked(getStripeServerClient).mockReturnValue({
      checkout: { sessions: { create: createSession } },
    } as never);
  });

  it("charges €19.99 less the €14.99 single as Stripe's discount", async () => {
    vi.mocked(getReportPriceQuoteForContext).mockResolvedValue({
      ...QUOTE,
      chargedPriceCents: 500,
      upgradeCreditCents: 1499,
    } as never);

    const res = await POST(makeRequest(body));

    expect(res.status).toBe(200);
    const args = createSession.mock.calls[0]![0];
    expect(args.line_items[0].price_data.unit_amount).toBe(1999);
    expect(args.discounts).toEqual([{ coupon: "upgrade_credit_eur_1499" }]);
    expect(args.allow_promotion_codes).toBeUndefined();
    expect(args.metadata).toEqual(
      expect.objectContaining({ currentPrice: "5.00", upgradeCredit: "14.99" })
    );
  });

  it("sends a fully credited All 14 to a €0 checkout", async () => {
    vi.mocked(getReportPriceQuoteForContext).mockResolvedValue({
      ...QUOTE,
      chargedPriceCents: 0,
      upgradeCreditCents: 1999,
    } as never);

    await POST(makeRequest(body));

    const args = createSession.mock.calls[0]![0];
    expect(args.line_items[0].price_data.unit_amount).toBe(1999);
    expect(args.discounts).toEqual([{ coupon: "upgrade_credit_eur_1999" }]);
  });

  it("uses a nurture promo instead when it takes off more than the credit", async () => {
    vi.mocked(getReportPriceQuoteForContext).mockResolvedValue({
      ...QUOTE,
      chargedPriceCents: 999,
      upgradeCreditCents: 1000,
    } as never);
    vi.mocked(resolveNurturePromo).mockResolvedValue({
      stage: "54h_no_unlock",
      percentOff: 75,
      stripePromotionCodeId: "promo_75",
    });

    await POST(makeRequest({ ...body, promo: "LIQ-75-Ab7K9xQ2" }));

    const args = createSession.mock.calls[0]![0];
    expect(args.discounts).toEqual([{ promotion_code: "promo_75" }]);
    expect(args.metadata.upgradeCredit).toBeUndefined();
    expect(args.metadata.promoStage).toBe("54h_no_unlock");
    expect(ensureUpgradeCreditCoupon).not.toHaveBeenCalled();
  });

  it("changes nothing when nothing was paid before", async () => {
    vi.mocked(getReportPriceQuoteForContext).mockResolvedValue({
      ...QUOTE,
      chargedPriceCents: 1999,
    } as never);

    await POST(makeRequest(body));

    const args = createSession.mock.calls[0]![0];
    expect(args.line_items[0].price_data.unit_amount).toBe(1999);
    expect(args.discounts).toBeUndefined();
    expect(args.allow_promotion_codes).toBe(true);
    expect(ensureUpgradeCreditCoupon).not.toHaveBeenCalled();
  });
});
