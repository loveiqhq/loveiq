// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

const mockRouterPush = vi.fn();
const mockCacheReportCheckoutQuote = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockRouterPush }),
  useSearchParams: () => new URLSearchParams(),
}));

const mockGetReportSessionId = vi.fn();
vi.mock("@/components/survey/hooks/surveySession", () => ({
  getReportSessionId: () => mockGetReportSessionId(),
}));

const mockUseReportData = vi.fn();
vi.mock("@/components/report/hooks/useReportData", () => ({
  useReportData: (...args: unknown[]) => mockUseReportData(...args),
}));

vi.mock("@/components/report/hooks/useSectionFeedback", () => ({
  useSectionFeedback: () => ({
    feedbacks: {},
    submitted: {},
    submitFeedback: vi.fn(),
  }),
}));

vi.mock("@/lib/checkout/reportCheckoutQuoteCache", () => ({
  cacheReportCheckoutQuote: (...args: unknown[]) => mockCacheReportCheckoutQuote(...args),
}));

import ReportPage from "@/components/report/ReportPage";

const REPORT_MODAL_TEST_TIMEOUT_MS = 15000;
const mockScrollTo = vi.fn();

describe("ReportPage", () => {
  function buildSuccessResponse() {
    return {
      data: {
        accessPlan: null,
        userName: "Eman",
        userEmail: "eman@example.com",
        primaryArchetype: "Emotional Voyeur",
        percentages: { "Emotional Voyeur": 63, "Explorer of Edges": 37 },
        reportDate: "2026-04-07T22:23:16.851299+00:00",
        diagnostics: {
          overlaysScalar: {
            OVL_SATISFACTION: (3 - 1) / 6,
            OVL_TOPIC_IMPORTANCE: (5 - 1) / 6,
          },
          overlaysEnum: {
            OVL_PHASE_NOW: "grounded",
          },
        },
        snapshotAnswers: {
          currentSexualSatisfaction: 3,
          importanceOfSex: 5,
        },
        pricingQuotes: {
          essentials: {
            id: 1,
            plan: "essentials",
            currency: "EUR",
            experimentGroup: "B",
            basePriceBucket: "essentials_center",
            basePriceCents: 1499,
            currentPriceCents: 1499,
            initialPriceCents: 1499,
            discountMultiplier: 1,
            discountStep: 0,
            pricingClusterId:
              "B-essentials-essentials_center-tier_2-desktop-google-serious-engaged-d0",
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
          },
          full_report: {
            id: 2,
            plan: "full_report",
            currency: "EUR",
            experimentGroup: "B",
            basePriceBucket: "full_center",
            basePriceCents: 2999,
            currentPriceCents: 2749,
            initialPriceCents: 2999,
            discountMultiplier: 1,
            discountStep: 0,
            pricingClusterId: "B-full_report-full_center-tier_2-desktop-google-serious-engaged-d0",
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
          },
          all_reports: {
            id: 3,
            plan: "all_reports",
            currency: "EUR",
            experimentGroup: "B",
            basePriceBucket: "all_center",
            basePriceCents: 12999,
            currentPriceCents: 11499,
            initialPriceCents: 12999,
            discountMultiplier: 1,
            discountStep: 0,
            pricingClusterId: "B-all_reports-all_center-tier_2-desktop-google-serious-engaged-d0",
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
          },
        },
      },
      status: "success",
      error: null,
    };
  }

  beforeEach(() => {
    vi.stubGlobal(
      "IntersectionObserver",
      class MockIntersectionObserver implements IntersectionObserver {
        readonly root = null;
        readonly rootMargin = "0px";
        readonly thresholds = [0];

        disconnect() {}
        observe(_target: Element) {}
        takeRecords(): IntersectionObserverEntry[] {
          return [];
        }
        unobserve(_target: Element) {}
      }
    );

    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }))
    );

    vi.stubGlobal("scrollTo", mockScrollTo);
    Object.defineProperty(window, "scrollY", {
      configurable: true,
      value: 240,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    mockScrollTo.mockReset();
    document.documentElement.style.overflow = "";
    document.body.style.left = "";
    document.body.style.overflow = "";
    document.body.style.position = "";
    document.body.style.right = "";
    document.body.style.top = "";
    document.body.style.width = "";
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockRouterPush.mockReset();
    mockCacheReportCheckoutQuote.mockReset();
    mockGetReportSessionId.mockReturnValue("02d88f31-eceb-4402-940d-c8cd98d01848");
  });

  it("renders a no-session state when the browser has no saved report session", () => {
    mockGetReportSessionId.mockReturnValue(null);
    mockUseReportData.mockReturnValue({
      data: null,
      status: "missing",
      error: null,
    });

    render(<ReportPage />);

    expect(screen.getByRole("heading", { name: /no saved report session/i })).toBeInTheDocument();
    expect(screen.getByText(/in this browser/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /take the survey/i })).toHaveAttribute(
      "href",
      "/survey"
    );
  });

  it("renders a service failure state for report API errors instead of the saved-session copy", () => {
    mockUseReportData.mockReturnValue({
      data: null,
      status: "error",
      error: { statusCode: 500, message: "Unable to process request." },
    });

    render(<ReportPage />);

    expect(
      screen.getByRole("heading", { name: /report temporarily unavailable/i })
    ).toBeInTheDocument();
    expect(
      screen.getByText(/report service failed while loading your results/i)
    ).toBeInTheDocument();
    expect(screen.queryByText(/saved report session/i)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /reload report/i })).toHaveAttribute("href", "/report");
  });

  it("renders the Figma-style satisfaction status from the stored 01002 answer", () => {
    mockUseReportData.mockReturnValue(buildSuccessResponse());

    render(<ReportPage />);

    expect(screen.getByText("Slightly dissatisfied")).toBeInTheDocument();
    expect(screen.getByText("Slightly important")).toBeInTheDocument();
    expect(
      screen.getByText(/enough frustration, inconsistency, or disappointment/i)
    ).toBeInTheDocument();
  });

  it(
    "surfaces pricing as unavailable when backend quotes are missing",
    () => {
      const response = buildSuccessResponse();
      response.data.pricingQuotes = null;
      mockUseReportData.mockReturnValue(response);

      render(<ReportPage />);

      expect(screen.getByText(/live pricing couldn't be loaded right now/i)).toBeInTheDocument();
      expect(screen.queryByText("€59.00")).not.toBeInTheDocument();
      expect(screen.getAllByRole("button", { name: /pricing unavailable/i })).toHaveLength(3);
    },
    REPORT_MODAL_TEST_TIMEOUT_MS
  );

  it(
    "shows the pricing modal on report open and keeps premium section gates after closing it",
    async () => {
      const user = userEvent.setup();
      mockUseReportData.mockReturnValue(buildSuccessResponse());

      const { container } = render(<ReportPage />);

      expect(screen.getByRole("heading", { name: /unlock your full report/i })).toBeInTheDocument();
      expect(container.querySelector(".report-pricing-modal__scroll-region")).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: /close pricing modal/i }));

      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      expect(container.querySelectorAll(".report-premium-overlay__cta").length).toBeGreaterThan(0);

      const loveLanguageSection = container.querySelector(
        "#love_language_how_affection_meaning_and_erotic_safety_are_communicated"
      );

      expect(loveLanguageSection).toBeInTheDocument();
      expect(
        loveLanguageSection?.querySelector(".report-themed-block__blurred")
      ).not.toBeInTheDocument();
      expect(loveLanguageSection?.querySelector(".report-premium-overlay")).not.toBeInTheDocument();
    },
    REPORT_MODAL_TEST_TIMEOUT_MS
  );

  it(
    "reveals a clicked premium section locally instead of routing to checkout",
    async () => {
      const user = userEvent.setup();
      mockUseReportData.mockReturnValue(buildSuccessResponse());

      const { container } = render(<ReportPage />);

      await user.click(screen.getByRole("button", { name: /close pricing modal/i }));
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

      const firstSectionUnlockButton = container.querySelector(
        ".report-section .report-premium-overlay__cta"
      ) as HTMLButtonElement | null;
      const lockedSection = firstSectionUnlockButton?.closest(
        "[data-report-section='true']"
      ) as HTMLElement | null;
      const lockedSectionCount = container.querySelectorAll(".report-premium-overlay__cta").length;

      expect(firstSectionUnlockButton).toBeTruthy();
      expect(lockedSection).toBeTruthy();
      expect(lockedSectionCount).toBeGreaterThan(1);

      await user.click(firstSectionUnlockButton!);

      await waitFor(() => {
        expect(lockedSection?.querySelector(".report-premium-overlay")).not.toBeInTheDocument();
      });

      expect(container.querySelectorAll(".report-premium-overlay__cta")).toHaveLength(
        lockedSectionCount - 1
      );
      expect(mockRouterPush).not.toHaveBeenCalled();
    },
    REPORT_MODAL_TEST_TIMEOUT_MS
  );

  it(
    "locks background scroll while the pricing modal is open and restores it on close",
    async () => {
      const user = userEvent.setup();
      mockUseReportData.mockReturnValue(buildSuccessResponse());

      render(<ReportPage />);

      expect(document.documentElement.style.overflow).toBe("hidden");
      expect(document.body.style.position).toBe("fixed");
      expect(document.body.style.top).toBe("-240px");
      expect(document.body.style.left).toBe("0px");
      expect(document.body.style.right).toBe("0px");
      expect(document.body.style.width).toBe("100%");
      expect(document.body.style.overflow).toBe("hidden");

      await user.click(screen.getByRole("button", { name: /close pricing modal/i }));

      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      expect(document.documentElement.style.overflow).toBe("");
      expect(document.body.style.position).toBe("");
      expect(document.body.style.top).toBe("");
      expect(document.body.style.left).toBe("");
      expect(document.body.style.right).toBe("");
      expect(document.body.style.width).toBe("");
      expect(document.body.style.overflow).toBe("");
      expect(mockScrollTo).toHaveBeenCalledWith(0, 240);
    },
    REPORT_MODAL_TEST_TIMEOUT_MS
  );

  it(
    "routes to checkout when a pricing modal CTA is clicked",
    async () => {
      const user = userEvent.setup();
      mockUseReportData.mockReturnValue(buildSuccessResponse());

      const { container } = render(<ReportPage />);

      await user.click(screen.getByRole("button", { name: /^unlock full report$/i }));

      expect(mockCacheReportCheckoutQuote).toHaveBeenCalledWith({
        plan: "full_report",
        quote: buildSuccessResponse().data.pricingQuotes.full_report,
        sessionId: "02d88f31-eceb-4402-940d-c8cd98d01848",
        token: undefined,
      });
      await waitFor(() =>
        expect(mockRouterPush).toHaveBeenCalledWith("/checkout?plan=full_report")
      );
      expect(container.querySelector(".report-premium-overlay__cta")).toBeInTheDocument();
    },
    REPORT_MODAL_TEST_TIMEOUT_MS
  );

  it("does not open the pricing modal when backend access is already paid", () => {
    const paid = buildSuccessResponse();
    paid.data.accessPlan = "full_report";
    mockUseReportData.mockReturnValue(paid);

    render(<ReportPage />);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: /unlock your full report/i })
    ).not.toBeInTheDocument();
  });
});
