// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import CheckoutReturnPage from "@/components/checkout/CheckoutReturnPage";

const mockRouterReplace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockRouterReplace }),
}));

describe("CheckoutReturnPage", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    mockRouterReplace.mockReset();
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

    expect(screen.getByRole("link", { name: /go to unlocked report/i })).toHaveAttribute(
      "href",
      "/report/rpt_ABCDEFGHIJKLMNOPQRST"
    );

    await new Promise((resolve) => setTimeout(resolve, 1_300));

    expect(mockRouterReplace).toHaveBeenCalledWith("/report/rpt_ABCDEFGHIJKLMNOPQRST");
  }, 10000);

  it("keeps polling while payment is complete but backend access is still syncing", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          accessPlan: null,
          enabled: true,
          paymentStatus: "paid",
          sessionStatus: "complete",
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          accessPlan: "all_reports",
          enabled: true,
          paymentStatus: "paid",
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

    await new Promise((resolve) => setTimeout(resolve, 1_600));

    await waitFor(() =>
      expect(
        screen.getByText(/payment complete\. your report is unlocked\. redirecting you now/i)
      ).toBeInTheDocument()
    );

    await new Promise((resolve) => setTimeout(resolve, 1_300));

    expect(mockRouterReplace).toHaveBeenCalledWith("/report/rpt_ABCDEFGHIJKLMNOPQRST");
  }, 10000);
});
