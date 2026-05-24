// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

const mockRouterPush = vi.fn();
const mockCacheReportCheckoutQuote = vi.fn();

const mockSearchParams = vi.fn(() => new URLSearchParams());
vi.mock("next/navigation", () => ({
  usePathname: () => "/report",
  useRouter: () => ({ push: mockRouterPush }),
  useSearchParams: () => mockSearchParams(),
}));

const mockGetReportSessionId = vi.fn();
vi.mock("@features/survey/ui/hooks/surveySession", () => ({
  getReportSessionId: () => mockGetReportSessionId(),
}));

const mockUseReportData = vi.fn();
vi.mock("@features/report/ui/hooks/useReportData", () => ({
  useReportData: (...args: unknown[]) => mockUseReportData(...args),
}));

vi.mock("@features/report/ui/hooks/useSectionFeedback", () => ({
  useSectionFeedback: () => ({
    feedbacks: {},
    submitted: {},
    submitFeedback: vi.fn(),
  }),
}));

vi.mock("@features/checkout/server/reportCheckoutQuoteCache", () => ({
  cacheReportCheckoutQuote: (...args: unknown[]) => mockCacheReportCheckoutQuote(...args),
}));

const mockTrackReportViewed = vi.fn();
const mockTrackPaywallView = vi.fn();
const mockTrackPaywallInitiated = vi.fn();
const mockTrackBeginCheckout = vi.fn();
const mockTrackPriceShown = vi.fn();
vi.mock("@features/analytics/client", () => ({
  trackReportViewed: (...args: unknown[]) => mockTrackReportViewed(...args),
  trackPaywallView: (...args: unknown[]) => mockTrackPaywallView(...args),
  trackPaywallInitiated: (...args: unknown[]) => mockTrackPaywallInitiated(...args),
  trackBeginCheckout: (...args: unknown[]) => mockTrackBeginCheckout(...args),
  trackPriceShown: (...args: unknown[]) => mockTrackPriceShown(...args),
  setReportSubmissionContext: vi.fn(),
  // New track functions exercised by ReportPage interactions.
  trackLockIconClicked: vi.fn(),
  trackReferFriendOpened: vi.fn(),
  trackReportShareOpened: vi.fn(),
  trackPaywallDismissed: vi.fn(),
  trackScrollPaywallDismissed: vi.fn(),
  trackStickyUnlockClicked: vi.fn(),
  trackReportSummaryJumped: vi.fn(),
  trackSectionNavigated: vi.fn(),
  trackChapterFeedbackSubmitted: vi.fn(),
  hasCookieYesConsent: () => true,
}));

import ReportPage from "@features/report/ui/ReportPage";
import { archetypeContent } from "@/data/report-archetypes";
import { reportPracticeTendencies } from "@/data/report-practice-tendencies";
import type { ReportPracticeTendencyContentForUser } from "@features/report/ui/hooks/useReportData";

const REPORT_MODAL_TEST_TIMEOUT_MS = 60_000;
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
            discountStep: 1,
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
            discountStep: 1,
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
            discountStep: 1,
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
        unlockedArchetypes: ["Emotional Voyeur"],
        // Server filter parity: tests now ship the same per-archetype content
        // shape that the live API returns. Free tier => content for the
        // primary archetype only, scoped to non-premium sections; the bundled
        // sections ignore archetypes outside the unlocked set.
        archetypeContent: buildArchetypeContentMock(["Emotional Voyeur"]),
        practiceTendencies: buildPracticeTendenciesMock(["Emotional Voyeur"], false),
      },
      status: "success",
      error: null,
    };
  }

  function buildArchetypeContentMock(unlocked: string[]): Record<string, Record<string, string>> {
    const result: Record<string, Record<string, string>> = {};
    for (const blockId of Object.keys(archetypeContent)) {
      for (const archetype of unlocked) {
        const html = archetypeContent[blockId]?.[archetype];
        if (!html) continue;
        if (!result[blockId]) result[blockId] = {};
        result[blockId][archetype] = html;
      }
    }
    return result;
  }

  function buildPracticeTendenciesMock(
    unlocked: string[],
    sectionUnlocked: boolean
  ): Record<string, ReportPracticeTendencyContentForUser> {
    const result: Record<string, ReportPracticeTendencyContentForUser> = {};
    for (const archetype of unlocked) {
      const raw = reportPracticeTendencies[archetype];
      if (!raw) continue;
      result[archetype] = {
        introBlocks: raw.introBlocks,
        groups: raw.groups.map((g) => ({
          title: g.title,
          rows: sectionUnlocked ? g.rows : g.rows.length > 0 ? [g.rows[0]] : [],
          totalRowCount: g.rows.length,
        })),
      };
    }
    return result;
  }

  beforeEach(() => {
    mockTrackReportViewed.mockReset();
    mockTrackPaywallView.mockReset();
    mockTrackBeginCheckout.mockReset();

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

  it("fires trackReportViewed once on data success with locked accessPlan + primaryArchetype", async () => {
    mockUseReportData.mockReturnValue(buildSuccessResponse());

    render(<ReportPage />);

    await waitFor(() => expect(mockTrackReportViewed).toHaveBeenCalledTimes(1));
    expect(mockTrackReportViewed).toHaveBeenCalledWith("locked", "Emotional Voyeur");
  });

  it(
    "surfaces pricing as unavailable when backend quotes are missing",
    () => {
      const response = buildSuccessResponse();
      response.data.pricingQuotes = null;
      mockUseReportData.mockReturnValue(response);
      // ?offer=1 forces the modal open even without quotes — same path the
      // discount-email deep-link uses, and it's the only way the modal can
      // open when there's no quote data to derive a discount step from.
      mockSearchParams.mockReturnValueOnce(new URLSearchParams("offer=1"));

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

      // Auto-mount paywalls no longer fire paywall_view (founder's "forced"
      // vs "initiated" distinction, 2026-05-24). Modal still renders; only
      // user-initiated clicks fire trackPaywallInitiated.
      expect(mockTrackPaywallView).not.toHaveBeenCalled();
      expect(mockTrackPaywallInitiated).not.toHaveBeenCalled();

      await user.click(screen.getByRole("button", { name: /close pricing modal/i }));

      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      expect(container.querySelectorAll(".report-premium-overlay__cta").length).toBeGreaterThan(0);

      const growthSection = container.querySelector(
        "#typical_growth_potentials_for_the_core_archetype"
      );

      expect(growthSection).toBeInTheDocument();
      // Locked premium HTML now renders inside `.report-themed-block__blurred`
      // so the client can blur it visually behind the overlay (visual tease,
      // not byte-level paywall — see plan "whimsical-greeting-popcorn").
      const blurred = growthSection?.querySelector(".report-themed-block__blurred");
      expect(blurred).toBeInTheDocument();
      expect(blurred?.getAttribute("aria-hidden")).toBe("true");
      expect(growthSection?.querySelector(".report-premium-overlay")).toBeInTheDocument();
    },
    REPORT_MODAL_TEST_TIMEOUT_MS
  );

  it(
    "opens the pricing modal when a locked premium section CTA is clicked, and keeps the section locked until checkout completes",
    async () => {
      const user = userEvent.setup();
      mockUseReportData.mockReturnValue(buildSuccessResponse());

      const { container } = render(<ReportPage />);

      await user.click(screen.getByRole("button", { name: /close pricing modal/i }));
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

      const firstSectionUnlockButton = container.querySelector(
        ".report-section .report-premium-overlay__cta"
      ) as HTMLButtonElement | null;
      const lockedSectionCountBefore = container.querySelectorAll(
        ".report-premium-overlay__cta"
      ).length;

      expect(firstSectionUnlockButton).toBeInstanceOf(HTMLButtonElement);
      expect(firstSectionUnlockButton!.disabled).toBe(false);
      expect(firstSectionUnlockButton!.textContent?.trim().length ?? 0).toBeGreaterThan(0);
      expect(lockedSectionCountBefore).toBeGreaterThan(1);

      await user.click(firstSectionUnlockButton!);

      // Pricing modal opens — does NOT auto-unlock the section.
      await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
      expect(container.querySelectorAll(".report-premium-overlay__cta").length).toBe(
        lockedSectionCountBefore
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

      // Price must be a positive, finite EUR amount (matches the pricingQuotes fixture).
      expect(mockTrackBeginCheckout).toHaveBeenCalledTimes(1);
      const [plan, price, currency] = mockTrackBeginCheckout.mock.calls[0];
      expect(plan).toBe("full_report");
      expect(currency).toBe("EUR");
      expect(typeof price).toBe("number");
      expect(Number.isFinite(price)).toBe(true);
      expect(price).toBeGreaterThan(0);
      expect(mockCacheReportCheckoutQuote).toHaveBeenCalledWith({
        plan: "full_report",
        quote: buildSuccessResponse().data.pricingQuotes.full_report,
        sessionId: "02d88f31-eceb-4402-940d-c8cd98d01848",
        token: undefined,
      });
      await waitFor(() =>
        expect(mockRouterPush).toHaveBeenCalledWith(
          "/checkout?plan=full_report&archetype=emotional-voyeur"
        )
      );
      expect(container.querySelector(".report-premium-overlay__cta")).toBeInTheDocument();
    },
    REPORT_MODAL_TEST_TIMEOUT_MS
  );

  it(
    "does not auto-open the pricing modal at discountStep 0 (under 24h)",
    () => {
      const response = buildSuccessResponse();
      response.data.pricingQuotes!.essentials.discountStep = 0;
      response.data.pricingQuotes!.full_report.discountStep = 0;
      response.data.pricingQuotes!.all_reports.discountStep = 0;
      mockUseReportData.mockReturnValue(response);

      render(<ReportPage />);

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    },
    REPORT_MODAL_TEST_TIMEOUT_MS
  );

  it(
    "opens the pricing modal in default variant when a locked section is clicked under 24h (discountStep 0)",
    async () => {
      const user = userEvent.setup();
      const response = buildSuccessResponse();
      response.data.pricingQuotes!.essentials.discountStep = 0;
      response.data.pricingQuotes!.full_report.discountStep = 0;
      response.data.pricingQuotes!.all_reports.discountStep = 0;
      mockUseReportData.mockReturnValue(response);

      const { container } = render(<ReportPage />);

      const lockedCta = container.querySelector(
        ".report-section .report-premium-overlay__cta"
      ) as HTMLButtonElement | null;
      expect(lockedCta).toBeInstanceOf(HTMLButtonElement);
      expect(lockedCta!.disabled).toBe(false);

      await user.click(lockedCta!);

      await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
      const modalRoot = container.querySelector(".report-pricing-modal");
      expect(modalRoot?.getAttribute("data-variant")).toBe("default");
      expect(container.querySelector(".report-pricing-card__extra-pill")).not.toBeInTheDocument();
    },
    REPORT_MODAL_TEST_TIMEOUT_MS
  );

  it(
    "opens the pricing modal in offer variant when a locked section is clicked at discountStep 1+",
    async () => {
      const user = userEvent.setup();
      mockUseReportData.mockReturnValue(buildSuccessResponse());

      const { container } = render(<ReportPage />);

      // Close the auto-opened modal first, then click a locked section.
      await user.click(screen.getByRole("button", { name: /close pricing modal/i }));
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

      const lockedCta = container.querySelector(
        ".report-section .report-premium-overlay__cta"
      ) as HTMLButtonElement | null;
      expect(lockedCta).toBeInstanceOf(HTMLButtonElement);
      expect(lockedCta!.disabled).toBe(false);

      await user.click(lockedCta!);

      await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
      const modalRoot = container.querySelector(".report-pricing-modal");
      expect(modalRoot?.getAttribute("data-variant")).toBe("offer");
    },
    REPORT_MODAL_TEST_TIMEOUT_MS
  );

  it(
    "?offer=1 forces offer variant even at discountStep 0 (email deep-link override)",
    async () => {
      const response = buildSuccessResponse();
      response.data.pricingQuotes!.essentials.discountStep = 0;
      response.data.pricingQuotes!.full_report.discountStep = 0;
      response.data.pricingQuotes!.all_reports.discountStep = 0;
      mockUseReportData.mockReturnValue(response);
      mockSearchParams.mockReturnValueOnce(new URLSearchParams("offer=1"));

      const { container } = render(<ReportPage />);

      await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
      const modalRoot = container.querySelector(".report-pricing-modal");
      expect(modalRoot?.getAttribute("data-variant")).toBe("offer");
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
