// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import CheckoutPage from "@/components/checkout/CheckoutPage";

const mockGetReportSessionId = vi.fn();

vi.mock("@/components/survey/hooks/surveySession", () => ({
  getReportSessionId: () => mockGetReportSessionId(),
}));

describe("CheckoutPage", () => {
  let originalFetch: typeof globalThis.fetch;
  const originalLocation = window.location;
  let mockedAssign: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    document.cookie = "__csrf=test-csrf-token; path=/";
    mockGetReportSessionId.mockReset();
    mockedAssign = vi.fn();
    delete (window as Window & { location?: Location }).location;
    window.location = { ...originalLocation, assign: mockedAssign } as Location;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    window.location = originalLocation;
    cleanup();
  });

  it("renders the review step and only requests Stripe checkout after clicking continue", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        enabled: true,
        url: "https://checkout.stripe.com/c/pay/cs_test_123",
      }),
    } as Response);
    globalThis.fetch = mockFetch;
    mockGetReportSessionId.mockReturnValue("02d88f31-eceb-4402-940d-c8cd98d01848");

    render(<CheckoutPage planId="full_report" />);

    expect(screen.getByRole("heading", { name: /complete your order/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /back to pricing/i })).toHaveAttribute(
      "href",
      "/report"
    );
    expect(screen.getByText(/stripe-hosted checkout/i)).toBeInTheDocument();
    expect(screen.getByText(/promo codes are entered directly on stripe/i)).toBeInTheDocument();
    expect(mockFetch).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /continue to secure checkout/i }));

    await waitFor(() =>
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/stripe/checkout-session",
        expect.objectContaining({
          body: JSON.stringify({
            plan: "full_report",
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
  });

  it("uses the report token for back navigation and hosted checkout creation when present", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        enabled: true,
        url: "https://checkout.stripe.com/c/pay/cs_test_token",
      }),
    } as Response);
    globalThis.fetch = mockFetch;
    mockGetReportSessionId.mockReturnValue(null);

    render(<CheckoutPage planId="all_reports" token="rpt_ABCDEFGHIJKLMNOPQRST" />);

    expect(screen.getByRole("link", { name: /back to pricing/i })).toHaveAttribute(
      "href",
      "/report/rpt_ABCDEFGHIJKLMNOPQRST"
    );

    fireEvent.click(screen.getByRole("button", { name: /continue to secure checkout/i }));

    await waitFor(() =>
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/stripe/checkout-session",
        expect.objectContaining({
          body: JSON.stringify({
            plan: "all_reports",
            reportSessionId: null,
            reportToken: "rpt_ABCDEFGHIJKLMNOPQRST",
          }),
        })
      )
    );
  });

  it("shows a report-context error when no token or saved report session exists", async () => {
    const mockFetch = vi.fn();
    globalThis.fetch = mockFetch;
    mockGetReportSessionId.mockReturnValue(null);

    render(<CheckoutPage planId="essentials" />);

    expect(screen.getByText(/this checkout is tied to a saved report/i)).toBeInTheDocument();
    expect(mockFetch).not.toHaveBeenCalled();
    expect(screen.getByRole("link", { name: /return to your report/i })).toHaveAttribute(
      "href",
      "/report"
    );
  });

  it("shows the disabled fallback if hosted checkout is unavailable", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        enabled: false,
        message: "Checkout preview only. Payments are not enabled in this environment yet.",
        reason: "checkout_disabled",
      }),
    } as Response);
    globalThis.fetch = mockFetch;
    mockGetReportSessionId.mockReturnValue("02d88f31-eceb-4402-940d-c8cd98d01848");

    render(<CheckoutPage planId="essentials" />);

    fireEvent.click(screen.getByRole("button", { name: /continue to secure checkout/i }));

    expect(
      (await screen.findAllByText(/payments are not enabled in this environment yet/i)).length
    ).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /secure checkout unavailable/i })).toBeDisabled();
    expect(mockedAssign).not.toHaveBeenCalled();
  });
});
