// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import CheckoutReturnPage from "@/components/checkout/CheckoutReturnPage";

const mockRouterReplace = vi.fn();
const mockTrackReportPurchase = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockRouterReplace }),
}));

vi.mock("@/lib/analytics", () => ({
  trackReportPurchase: (...args: unknown[]) => mockTrackReportPurchase(...args),
}));

describe("CheckoutReturnPage", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    mockRouterReplace.mockReset();
    mockTrackReportPurchase.mockReset();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    cleanup();
  });

  it("auto-redirects to the unlocked report after payment and backend access are confirmed", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        accessPlan: "full_report",
        enabled: true,
        paymentStatus: "paid",
        purchaseAnalytics: {
          value: 27.49,
          currency: "EUR",
          transaction_id: "cs_test_123",
          pricing_cluster_id: "cluster",
          base_price_bucket: "full_center",
          experiment_group: "B",
          discount_step: 1,
          country_tier: "tier_2",
          device_type: "Desktop",
          traffic_source: "google",
          engagement_score: 40,
          behavioral_bucket: "serious",
          initial_price: 29.99,
          promotion_code: "LOVEIQ20",
          coupon_id: "coupon_loveiq_20",
          coupon_name: "LOVEIQ 20% Off",
          coupon_percent_off: 20,
          discount_amount: 5.5,
        },
        sessionStatus: "complete",
      }),
    } as Response);

    render(
      <CheckoutReturnPage
        planId="full_report"
        sessionId="cs_test_123"
        token="rpt_ABCDEFGHIJKLMNOPQRST"
      />
    );

    expect(screen.getByText(/verifying your checkout session/i)).toBeInTheDocument();

    await waitFor(() =>
      expect(
        screen.getByText(/payment complete\. your report is unlocked\. redirecting you now/i)
      ).toBeInTheDocument()
    );
    expect(mockTrackReportPurchase).toHaveBeenCalledWith({
      value: 27.49,
      currency: "EUR",
      transaction_id: "cs_test_123",
      pricing_cluster_id: "cluster",
      base_price_bucket: "full_center",
      experiment_group: "B",
      discount_step: 1,
      country_tier: "tier_2",
      device_type: "Desktop",
      traffic_source: "google",
      engagement_score: 40,
      behavioral_bucket: "serious",
      initial_price: 29.99,
      promotion_code: "LOVEIQ20",
      coupon_id: "coupon_loveiq_20",
      coupon_name: "LOVEIQ 20% Off",
      coupon_percent_off: 20,
      discount_amount: 5.5,
    });

    expect(screen.getByRole("link", { name: /go to unlocked report/i })).toHaveAttribute(
      "href",
      "/report/rpt_ABCDEFGHIJKLMNOPQRST"
    );

    await new Promise((resolve) => setTimeout(resolve, 1_300));

    expect(mockRouterReplace).toHaveBeenCalledWith("/report/rpt_ABCDEFGHIJKLMNOPQRST");
  }, 10000);

  it("treats no_payment_required as a successful unlock for fully discounted checkouts", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        accessPlan: "full_report",
        enabled: true,
        paymentStatus: "no_payment_required",
        purchaseAnalytics: {
          value: 0,
          currency: "EUR",
          transaction_id: "cs_test_free_123",
          promotion_code: "LOVEIQ100",
          coupon_percent_off: 100,
          discount_amount: 24.49,
        },
        sessionStatus: "complete",
      }),
    } as Response);

    render(
      <CheckoutReturnPage
        planId="full_report"
        sessionId="cs_test_free_123"
        token="rpt_ABCDEFGHIJKLMNOPQRST"
      />
    );

    await waitFor(() =>
      expect(
        screen.getByText(/payment complete\. your report is unlocked\. redirecting you now/i)
      ).toBeInTheDocument()
    );
    expect(mockTrackReportPurchase).toHaveBeenCalledWith({
      value: 0,
      currency: "EUR",
      transaction_id: "cs_test_free_123",
      promotion_code: "LOVEIQ100",
      coupon_percent_off: 100,
      discount_amount: 24.49,
    });
  });

  it("keeps polling while payment is complete but backend access is still syncing", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          accessPlan: null,
          enabled: true,
          paymentStatus: "paid",
          purchaseAnalytics: {
            value: 114.99,
            currency: "EUR",
            transaction_id: "cs_test_456",
          },
          sessionStatus: "complete",
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          accessPlan: "all_reports",
          enabled: true,
          paymentStatus: "paid",
          purchaseAnalytics: {
            value: 114.99,
            currency: "EUR",
            transaction_id: "cs_test_456",
          },
          sessionStatus: "complete",
        }),
      } as Response);

    render(
      <CheckoutReturnPage
        planId="all_reports"
        sessionId="cs_test_456"
        token="rpt_ABCDEFGHIJKLMNOPQRST"
      />
    );

    await waitFor(() => expect(screen.getByText(/unlocking your report/i)).toBeInTheDocument());
    expect(mockTrackReportPurchase).not.toHaveBeenCalled();

    // Polling re-fetches every UNLOCK_CHECK_DELAY_MS (2000ms in component).
    // Wait long enough that the second fetch is guaranteed to have resolved
    // even under suite-wide CPU contention.
    await new Promise((resolve) => setTimeout(resolve, 2_500));

    await waitFor(() =>
      expect(
        screen.getByText(/payment complete\. your report is unlocked\. redirecting you now/i)
      ).toBeInTheDocument()
    );
    expect(mockTrackReportPurchase).toHaveBeenCalledTimes(1);
    expect(mockTrackReportPurchase).toHaveBeenCalledWith({
      value: 114.99,
      currency: "EUR",
      transaction_id: "cs_test_456",
    });

    await new Promise((resolve) => setTimeout(resolve, 1_500));

    expect(mockRouterReplace).toHaveBeenCalledWith("/report/rpt_ABCDEFGHIJKLMNOPQRST");
  }, 15000);
});
