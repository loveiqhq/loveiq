// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import CheckoutPage from "@features/checkout/ui/CheckoutPage";

const mockGetReportSessionId = vi.fn();
const mockGetReportPricingSessionId = vi.fn();
const mockCacheReportCheckoutQuote = vi.fn();
const mockGetCachedReportCheckoutQuote = vi.fn();
const READY_QUOTE = {
  id: 42,
  plan: "full_report",
  currency: "EUR",
  experimentGroup: "B",
  basePriceBucket: "full_center",
  basePriceCents: 2999,
  currentPriceCents: 2749,
  initialPriceCents: 2999,
  discountMultiplier: 1,
  discountStep: 0,
  pricingClusterId: "cluster",
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
} as const;

// Mirror of CHECKOUT_SENT_KEY in CheckoutPage.tsx — the per-tab "already handed
// off to Stripe" marker that suppresses the one-tap auto-forward on a
// back-navigation return.
const CHECKOUT_SENT_KEY = "liq_checkout_sent";

function createJsonResponse(body: unknown, ok = true) {
  return {
    ok,
    json: async () => body,
  } as Response;
}

vi.mock("@features/survey/ui/hooks/surveySession", () => ({
  getReportPricingSessionId: () => mockGetReportPricingSessionId(),
  getReportSessionId: () => mockGetReportSessionId(),
  // No nurture promo stashed in CheckoutPage tests — the POST body just omits `promo`.
  getReportNurturePromo: () => null,
}));

vi.mock("@features/checkout/server/reportCheckoutQuoteCache", () => ({
  cacheReportCheckoutQuote: (...args: unknown[]) => mockCacheReportCheckoutQuote(...args),
  getCachedReportCheckoutQuote: (...args: unknown[]) => mockGetCachedReportCheckoutQuote(...args),
}));

describe("CheckoutPage", () => {
  let originalFetch: typeof globalThis.fetch;
  const originalLocation = window.location;
  let mockedAssign: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    document.cookie = "__csrf=test-csrf-token; path=/";
    // The one-tap auto-forward keys off a per-tab sessionStorage marker; clear it
    // so tests don't leak the "already sent" state into one another.
    try {
      sessionStorage.clear();
    } catch {
      /* jsdom always has sessionStorage; guard is belt-and-suspenders */
    }
    mockGetReportSessionId.mockReset();
    mockGetReportPricingSessionId.mockReset();
    mockCacheReportCheckoutQuote.mockReset();
    mockGetCachedReportCheckoutQuote.mockReset();
    mockGetCachedReportCheckoutQuote.mockReturnValue(null);
    mockedAssign = vi.fn();
    delete (window as Window & { location?: Location }).location;
    window.location = { ...originalLocation, assign: mockedAssign } as Location;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    window.location = originalLocation;
    cleanup();
  });

  it("auto-forwards to Stripe once the fetched quote is ready (one tap)", async () => {
    const mockFetch = vi.fn(async (input: string | URL | Request) => {
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url.startsWith("/api/price?")) {
        return createJsonResponse({ quote: READY_QUOTE });
      }

      return createJsonResponse({
        enabled: true,
        url: "https://checkout.stripe.com/c/pay/cs_test_123",
      });
    });
    globalThis.fetch = mockFetch;
    mockGetReportSessionId.mockReturnValue("02d88f31-eceb-4402-940d-c8cd98d01848");
    mockGetReportPricingSessionId.mockReturnValue("pricing-session-123");

    render(<CheckoutPage planId="full_report" />);

    expect(screen.getByRole("heading", { name: /complete your order/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /back to pricing/i })).toHaveAttribute(
      "href",
      "/report"
    );

    // Quote is fetched…
    await waitFor(() =>
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/price?plan=full_report&reportSessionId=02d88f31-eceb-4402-940d-c8cd98d01848&pricingSessionId=pricing-session-123",
        expect.objectContaining({
          headers: expect.objectContaining({ "x-csrf-token": "test-csrf-token" }),
        })
      )
    );

    // …then checkout is requested and the redirect happens WITHOUT a manual click.
    await waitFor(() =>
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/stripe/checkout-session",
        expect.objectContaining({
          body: JSON.stringify({
            gaConsent: false,
            plan: "full_report",
            pricingSessionId: "pricing-session-123",
            quoteId: 42,
            reportSessionId: "02d88f31-eceb-4402-940d-c8cd98d01848",
            reportToken: null,
          }),
          headers: expect.objectContaining({
            "Content-Type": "application/json",
            "x-csrf-token": "test-csrf-token",
          }),
          method: "POST",
        })
      )
    );

    await waitFor(() =>
      expect(mockedAssign).toHaveBeenCalledWith("https://checkout.stripe.com/c/pay/cs_test_123")
    );

    // The hand-off marker is set to THIS checkout's identity so a back-navigation
    // return won't re-trap (but a different plan/report isn't suppressed).
    expect(sessionStorage.getItem(CHECKOUT_SENT_KEY)).toBe(
      "full_report:02d88f31-eceb-4402-940d-c8cd98d01848"
    );
  });

  it("uses the report token for back navigation and hosted checkout creation when present", async () => {
    const tokenQuote = { ...READY_QUOTE, plan: "all_reports", currentPriceCents: 11499 };
    const mockFetch = vi.fn(async (input: string | URL | Request) => {
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url.startsWith("/api/price?")) {
        return createJsonResponse({ quote: tokenQuote });
      }

      return createJsonResponse({
        enabled: true,
        url: "https://checkout.stripe.com/c/pay/cs_test_token",
      });
    });
    globalThis.fetch = mockFetch;
    mockGetReportSessionId.mockReturnValue(null);
    mockGetReportPricingSessionId.mockReturnValue("pricing-token-123");

    render(<CheckoutPage planId="all_reports" token="rpt_ABCDEFGHIJKLMNOPQRST" />);

    expect(screen.getByRole("link", { name: /back to pricing/i })).toHaveAttribute(
      "href",
      "/report/rpt_ABCDEFGHIJKLMNOPQRST"
    );

    await waitFor(() =>
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/stripe/checkout-session",
        expect.objectContaining({
          body: JSON.stringify({
            gaConsent: false,
            plan: "all_reports",
            pricingSessionId: "pricing-token-123",
            quoteId: 42,
            reportSessionId: null,
            reportToken: "rpt_ABCDEFGHIJKLMNOPQRST",
          }),
        })
      )
    );
  });

  it("auto-forwards immediately from a cached quote (no price refresh needed)", async () => {
    const mockFetch = vi.fn(async (input: string | URL | Request) => {
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url.startsWith("/api/price?")) {
        // Never resolves — the cached quote should drive the auto-forward.
        return new Promise<Response>(() => {});
      }

      return createJsonResponse({
        enabled: true,
        url: "https://checkout.stripe.com/c/pay/cs_test_cached",
      });
    });
    globalThis.fetch = mockFetch;
    mockGetReportSessionId.mockReturnValue("02d88f31-eceb-4402-940d-c8cd98d01848");
    mockGetReportPricingSessionId.mockReturnValue("pricing-session-123");
    mockGetCachedReportCheckoutQuote.mockReturnValue(READY_QUOTE);

    render(<CheckoutPage planId="full_report" />);

    expect(screen.getAllByText("€27.49").length).toBeGreaterThan(0);

    await waitFor(() =>
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/stripe/checkout-session",
        expect.objectContaining({
          body: JSON.stringify({
            gaConsent: false,
            plan: "full_report",
            pricingSessionId: "pricing-session-123",
            quoteId: 42,
            reportSessionId: "02d88f31-eceb-4402-940d-c8cd98d01848",
            reportToken: null,
          }),
          method: "POST",
        })
      )
    );
    await waitFor(() =>
      expect(mockedAssign).toHaveBeenCalledWith("https://checkout.stripe.com/c/pay/cs_test_cached")
    );
  });

  it("does NOT auto-forward on a back-navigation return, then forwards on a deliberate retry", async () => {
    // Simulate: the user already went to Stripe for THIS checkout (marker = its
    // identity) and hit browser-back. The page must NOT bounce them straight back
    // — even after the /api/price refetch RESOLVES and re-renders (the exact race
    // that defeated the first consume-once guard). It shows the manual button and
    // only forwards on an explicit click. The marker is write-only (persists), so
    // a subsequent reload also stays on the review page.
    sessionStorage.setItem(CHECKOUT_SENT_KEY, "full_report:02d88f31-eceb-4402-940d-c8cd98d01848");

    const mockFetch = vi.fn(async (input: string | URL | Request) => {
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url.startsWith("/api/price?")) {
        // Resolves (triggers a re-render) — the regression condition.
        return createJsonResponse({ quote: READY_QUOTE });
      }
      return createJsonResponse({
        enabled: true,
        url: "https://checkout.stripe.com/c/pay/cs_test_retry",
      });
    });
    globalThis.fetch = mockFetch;
    mockGetReportSessionId.mockReturnValue("02d88f31-eceb-4402-940d-c8cd98d01848");
    mockGetReportPricingSessionId.mockReturnValue("pricing-session-123");
    mockGetCachedReportCheckoutQuote.mockReturnValue(READY_QUOTE);

    render(<CheckoutPage planId="full_report" />);

    // Wait for the price refetch to resolve + re-render, THEN confirm the manual
    // button is still shown (i.e. auto-forward did not fire on the re-render).
    await waitFor(() =>
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/price?"),
        expect.anything()
      )
    );
    const continueBtn = await screen.findByRole("button", {
      name: /continue to secure checkout/i,
    });
    expect(continueBtn).toBeEnabled();
    expect(mockFetch).not.toHaveBeenCalledWith("/api/stripe/checkout-session", expect.anything());
    expect(mockedAssign).not.toHaveBeenCalled();
    // Marker is write-only (persists), so back + reload both keep the manual
    // button; the deliberate click below re-sends and works regardless.
    expect(sessionStorage.getItem(CHECKOUT_SENT_KEY)).toBe(
      "full_report:02d88f31-eceb-4402-940d-c8cd98d01848"
    );

    // A deliberate click forwards as normal.
    fireEvent.click(continueBtn);
    await waitFor(() =>
      expect(mockedAssign).toHaveBeenCalledWith("https://checkout.stripe.com/c/pay/cs_test_retry")
    );
  });

  it("shows a report-context error when no token or saved report session exists", async () => {
    const mockFetch = vi.fn();
    globalThis.fetch = mockFetch;
    mockGetReportSessionId.mockReturnValue(null);
    mockGetReportPricingSessionId.mockReturnValue(null);

    render(<CheckoutPage planId="essentials" />);

    expect(screen.getByText(/this checkout is tied to a saved report/i)).toBeInTheDocument();
    expect(mockFetch).not.toHaveBeenCalled();
    expect(screen.getByRole("link", { name: /return to your report/i })).toHaveAttribute(
      "href",
      "/report"
    );
  });

  it("shows the disabled fallback if hosted checkout is unavailable", async () => {
    const essentialsQuote = { ...READY_QUOTE, plan: "essentials", currentPriceCents: 1499 };
    const mockFetch = vi.fn(async (input: string | URL | Request) => {
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url.startsWith("/api/price?")) {
        return createJsonResponse({ quote: essentialsQuote });
      }

      return createJsonResponse({
        enabled: false,
        message: "Checkout preview only. Payments are not enabled in this environment yet.",
        reason: "checkout_disabled",
      });
    });
    globalThis.fetch = mockFetch;
    mockGetReportSessionId.mockReturnValue("02d88f31-eceb-4402-940d-c8cd98d01848");
    mockGetReportPricingSessionId.mockReturnValue("pricing-session-123");

    render(<CheckoutPage planId="essentials" />);

    // Auto-forward attempts checkout; the disabled response surfaces the fallback
    // without any manual click.
    expect(
      (await screen.findAllByText(/payments are not enabled in this environment yet/i)).length
    ).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /secure checkout unavailable/i })).toBeDisabled();
    expect(mockedAssign).not.toHaveBeenCalled();
  });
});
