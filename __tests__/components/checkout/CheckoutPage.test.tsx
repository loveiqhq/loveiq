// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import CheckoutPage from "@/components/checkout/CheckoutPage";

const mockGetReportSessionId = vi.fn();

vi.mock("@/components/survey/hooks/surveySession", () => ({
  getReportSessionId: () => mockGetReportSessionId(),
}));

vi.mock("@/components/checkout/StripeCheckoutMount", () => ({
  default: ({ clientSecret }: { clientSecret: string }) => (
    <div data-testid="stripe-checkout-mount">{clientSecret}</div>
  ),
}));

describe("CheckoutPage", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    document.cookie = "__csrf=test-csrf-token; path=/";
    mockGetReportSessionId.mockReset();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    cleanup();
  });

  it(
    "renders the full report checkout preview and requests a placeholder session",
    async () => {
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

    render(<CheckoutPage planId="full_report" />);

    expect(screen.getByRole("heading", { name: /complete your order/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /back to pricing/i })).toHaveAttribute(
      "href",
      "/report"
    );

    await waitFor(() =>
      expect(
        screen.getByText(/payments are not enabled in this environment yet/i)
      ).toBeInTheDocument()
    );

    expect(screen.getByText("Full report")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /complete payment/i })).toBeDisabled();
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
    );
    },
    10_000
  );

  it("uses the report token for back navigation and checkout preparation when present", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        enabled: false,
        message: "Checkout preview only. Payments are not enabled in this environment yet.",
        reason: "checkout_disabled",
      }),
    } as Response);
    globalThis.fetch = mockFetch;
    mockGetReportSessionId.mockReturnValue(null);

    render(<CheckoutPage planId="all_reports" token="rpt_ABCDEFGHIJKLMNOPQRST" />);

    expect(screen.getByRole("link", { name: /back to pricing/i })).toHaveAttribute(
      "href",
      "/report/rpt_ABCDEFGHIJKLMNOPQRST"
    );

    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/stripe/checkout-session",
      expect.objectContaining({
        body: JSON.stringify({
          plan: "all_reports",
          reportSessionId: null,
          reportToken: "rpt_ABCDEFGHIJKLMNOPQRST",
        }),
      })
    );
  });

  it("mounts the real Stripe checkout surface when a client secret is returned", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        clientSecret: "cs_test_preview_123",
        enabled: true,
      }),
    } as Response);
    globalThis.fetch = mockFetch;
    mockGetReportSessionId.mockReturnValue("02d88f31-eceb-4402-940d-c8cd98d01848");

    render(<CheckoutPage planId="essentials" />);

    await waitFor(() =>
      expect(screen.getByTestId("stripe-checkout-mount")).toHaveTextContent("cs_test_preview_123")
    );

    expect(screen.getByText("Stripe Checkout Preview")).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /card/i })).not.toBeInTheDocument();
  });

  it("shows a report-context error when no token or saved report session exists", async () => {
    const mockFetch = vi.fn();
    globalThis.fetch = mockFetch;
    mockGetReportSessionId.mockReturnValue(null);

    render(<CheckoutPage planId="essentials" />);

    await waitFor(() =>
      expect(
        screen.getByText(/this checkout preview is tied to a saved report/i)
      ).toBeInTheDocument()
    );

    expect(mockFetch).not.toHaveBeenCalled();
    expect(screen.getByRole("link", { name: /return to your report/i })).toHaveAttribute(
      "href",
      "/report"
    );
  });
});
