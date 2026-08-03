// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import CheckoutReturnPage from "@features/checkout/ui/CheckoutReturnPage";

const mockRouterReplace = vi.fn();
const mockTrackReportPurchase = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockRouterReplace }),
}));

vi.mock("@features/analytics/client", () => ({
  trackReportPurchase: (...args: unknown[]) => mockTrackReportPurchase(...args),
  setReportSubmissionContext: vi.fn(),
  setForcedPaywallArm: vi.fn(),
  trackPaywallUnlocked: vi.fn(),
  trackCheckoutReturnViewed: vi.fn(),
  trackCheckoutRetryClicked: vi.fn(),
  trackCheckoutAbandonedReturn: vi.fn(),
  hasCookieYesConsent: () => true,
}));

import {
  setForcedPaywallArm,
  trackCheckoutReturnViewed,
  trackPaywallUnlocked,
} from "@features/analytics/client";

describe("CheckoutReturnPage", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    mockRouterReplace.mockReset();
    mockTrackReportPurchase.mockReset();
    vi.mocked(setForcedPaywallArm).mockClear();
    vi.mocked(trackPaywallUnlocked).mockClear();
    vi.mocked(trackCheckoutReturnViewed).mockClear();
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
    // Wrap in waitFor: the trackReportPurchase effect runs in a separate
    // microtask after the success-state render. Under CI CPU pressure, the
    // effect can lag the DOM update by a tick or two — polling avoids the
    // race without bumping arbitrary timeouts.
    await waitFor(() =>
      expect(mockTrackReportPurchase).toHaveBeenCalledWith({
        value: 27.49,
        currency: "EUR",
        transaction_id: "cs_test_123",
        item_name: "Just a snapshot",
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
      })
    );

    expect(screen.getByRole("link", { name: /go to unlocked report/i })).toHaveAttribute(
      "href",
      "/report/rpt_ABCDEFGHIJKLMNOPQRST"
    );

    // Component schedules router.replace after a ~1s success-toast delay.
    // waitFor polls until the call lands instead of sleeping past the timer.
    await waitFor(
      () => expect(mockRouterReplace).toHaveBeenCalledWith("/report/rpt_ABCDEFGHIJKLMNOPQRST"),
      { timeout: 3000 }
    );
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
    await waitFor(() =>
      expect(mockTrackReportPurchase).toHaveBeenCalledWith({
        value: 0,
        currency: "EUR",
        transaction_id: "cs_test_free_123",
        item_name: "Just a snapshot",
        promotion_code: "LOVEIQ100",
        coupon_percent_off: 100,
        discount_amount: 24.49,
      })
    );
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
    // waitFor with a generous timeout lets the second poll fire and resolve
    // without sleeping past it.
    await waitFor(
      () =>
        expect(
          screen.getByText(/payment complete\. your report is unlocked\. redirecting you now/i)
        ).toBeInTheDocument(),
      { timeout: 5000 }
    );
    await waitFor(() => {
      expect(mockTrackReportPurchase).toHaveBeenCalledTimes(1);
      expect(mockTrackReportPurchase).toHaveBeenCalledWith({
        value: 114.99,
        currency: "EUR",
        transaction_id: "cs_test_456",
        item_name: "For you & your partner",
      });
    });

    await waitFor(
      () => expect(mockRouterReplace).toHaveBeenCalledWith("/report/rpt_ABCDEFGHIJKLMNOPQRST"),
      { timeout: 3000 }
    );
  }, 15000);

  it("re-binds the server-echoed forced-paywall arm before the conversion events fire", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        accessPlan: "full_report",
        enabled: true,
        paymentStatus: "paid",
        purchaseAnalytics: {
          value: 27.49,
          currency: "EUR",
          transaction_id: "cs_test_arm",
        },
        sessionStatus: "complete",
        surveySubmissionId: 4242,
        forcedPaywallArm: "treatment",
      }),
    } as Response);

    render(
      <CheckoutReturnPage
        planId="full_report"
        sessionId="cs_test_arm"
        token="rpt_ABCDEFGHIJKLMNOPQRST"
      />
    );

    // paywall_unlocked is the conversion event; it must carry the arm. The arm
    // is bound from the server-echoed session value (== payment row), not the
    // /report page (a different route), so the durable row self-tags the arm.
    await waitFor(() => expect(trackPaywallUnlocked).toHaveBeenCalled());
    expect(setForcedPaywallArm).toHaveBeenCalledWith("treatment");
    expect(trackCheckoutReturnViewed).toHaveBeenCalledWith({
      status: "success",
      plan: "full_report",
    });
  }, 10000);
});
