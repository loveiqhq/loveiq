// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";

const mockRouterPush = vi.fn();
const mockStartReportCheckout = vi.fn().mockResolvedValue(null);
vi.mock("@features/checkout/ui/startReportCheckout", () => ({
  startReportCheckout: (...args: unknown[]) => mockStartReportCheckout(...args),
}));

// This suite was written against Report 2.0 and still covers it. V1 became the
// DEFAULT on 2026-09-13 (see features/report/ui/v1/ReportExperienceV1.tsx), so
// every case here opts into `?v2=1` explicitly. V1's own coverage lives in
// ReportPageV1.test.tsx.
//
// NOTE: useSearchParams() is called by BOTH the shell and the experience, and
// the shell calls first — so a `mockReturnValueOnce` override lands on the shell
// and must carry `v2=1` too, or the page silently renders V1 instead.
const mockSearchParams = vi.fn(() => new URLSearchParams("v2=1"));
vi.mock("next/navigation", () => ({
  usePathname: () => "/report",
  useRouter: () => ({ push: mockRouterPush }),
  useSearchParams: () => mockSearchParams(),
}));

const mockGetReportSessionId = vi.fn();
vi.mock("@features/survey/ui/hooks/surveySession", () => ({
  getReportSessionId: () => mockGetReportSessionId(),
  getReportNurturePromo: () => null,
  getReportPricingSessionId: () => null,
  setReportNurturePromo: () => {},
  setReportPricingSessionId: () => {},
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
  trackReportChapterMenuOpened: vi.fn(),
  trackSectionNavigated: vi.fn(),
  trackChapterFeedbackSubmitted: vi.fn(),
  trackLockedCardPriceShown: vi.fn(),
  hasCookieYesConsent: () => true,
}));

import ReportPage from "@features/report/ui/ReportPage";
import * as analytics from "@features/analytics/client";
import { archetypeContent } from "@/data/report-archetypes";
import { reportPracticeTendencies } from "@/data/report-practice-tendencies";
import type { ReportPracticeTendencyContentForUser } from "@features/report/ui/hooks/useReportData";
import { reportSections } from "@/data/report-general";
import { resolveReportSections } from "@features/report/ui/reportTitles";
import { buildPartnership } from "@/data/report3-partnership";
import { buildFantasy } from "@/data/report3-fantasy";
import { buildTypicalBeliefs } from "@/data/report3-typical-beliefs";
import { buildAccelerators } from "@/data/report3-accelerators";
import { REPORT_V4_LEARN_MORE } from "@/data/report3-learn-more";
import { splitArticleForReader } from "@features/report/server/contentGating";
// The 50/50 was concluded → any non-empty token now buckets to the forced
// "treatment" arm. The soft "control" (dismissible) experience is now reached
// only via the email-return escape hatch (from=email / utm_source=email) or the
// dev `?arm=` override — driven through mockSearchParams in the tests below.
const TREATMENT_TOKEN = "rpt_report_test_001";

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
        // Report 2.0 Growth section (Part IV, full_report tier). An unpaid
        // client receives only the universal framing slots + locked:true; the
        // per-archetype ladder is withheld server-side.
        growthCopy: {
          locked: true,
          "learn.eyebrow": "What you will learn",
          "learn.body": "The specific shifts that move you toward what you want.",
        },
        // A SECOND locked premium section, so "clicking one CTA leaves the others
        // locked" is actually exercised. The legacy `summary` chapter used to be
        // the incidental second one; it is retired (not in the Report 2.0 Figma),
        // so the fixture now supplies one deliberately.
        libidoCopy: {
          locked: true,
          eyebrow: "The Pattern",
          "learn.eyebrow": "What you will learn",
          "learn.body": "The loop that quietly drains desire, and the way out.",
        },
        growthRungs: 5,
        pricingQuotes: {
          essentials: {
            id: 1,
            plan: "essentials",
            currency: "EUR",
            experimentGroup: "B",
            basePriceBucket: "essentials_center",
            basePriceCents: 1499,
            currentPriceCents: 1499,
            chargedPriceCents: 1499,
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
            chargedPriceCents: 2749,
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
            chargedPriceCents: 11499,
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
    mockStartReportCheckout.mockReset();
    mockStartReportCheckout.mockResolvedValue(null);
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

  it("does not render pre-2.0 sections the redesign retired", () => {
    mockUseReportData.mockReturnValue(buildSuccessResponse());

    const { container } = render(<ReportPage />);

    // Report 2.0 opens on the Part I divider — the Welcome intro (which carried
    // the 01002 satisfaction status) and the LoveIQ Concept are gone, as are the
    // sections folded into combined ones.
    for (const id of [
      "welcome",
      "the_loveiq_concept",
      "core_motivation",
      "probability_of_other_archetypes",
      "risk_orientation",
      "relationship_form_preference",
      "communication_style",
      "background_know_how_arousal_desire_and_pleasure",
      "typical_arousal_brakes_turn_offs_of_the_core_archetype",
      "about_fantasies_desire_amp_pleasure_per_context",
      "about_living_or_not_living_fantasies",
    ]) {
      expect(container.querySelector(`#${id}`)).toBeNull();
    }
    // The satisfaction label is still interpolated into copy via
    // {{SEXUAL_SATISFACTION}} — it just no longer has its own intro section.
    expect(screen.queryByText("Slightly dissatisfied")).not.toBeInTheDocument();
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
      mockSearchParams.mockReturnValueOnce(new URLSearchParams("offer=1&v2=1"));

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

      expect(screen.getByRole("heading", { name: /unlock your reports/i })).toBeInTheDocument();
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
      // The Report 2.0 Growth section renders its locked preview: a blurred
      // stand-in ladder (aria-hidden) sitting behind the premium overlay — a
      // visual tease, not a byte-level paywall (the real per-archetype ladder is
      // withheld server-side).
      const blurred = growthSection?.querySelector(".report-growth__preview-fade");
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
      // Restored through `restoreScroll`, which passes `behavior: "instant"`: the bare
      // `scrollTo(0, y)` obeyed `html { scroll-behavior: smooth }` and, since the page
      // is at 0 the instant `position: fixed` comes off, it animated from the top of the
      // page down to where the reader was (MO, 2026-08-22).
      expect(mockScrollTo).toHaveBeenCalledWith({ top: 240, left: 0, behavior: "instant" });
    },
    REPORT_MODAL_TEST_TIMEOUT_MS
  );

  it(
    "goes straight to Stripe when a pricing modal CTA is clicked",
    async () => {
      const user = userEvent.setup();
      mockUseReportData.mockReturnValue(buildSuccessResponse());

      const { container } = render(<ReportPage />);

      await user.click(screen.getByRole("button", { name: /^unlock my report$/i }));

      // Price must be a positive, finite EUR amount (matches the pricingQuotes fixture).
      expect(mockTrackBeginCheckout).toHaveBeenCalledTimes(1);
      const [plan, price, currency] = mockTrackBeginCheckout.mock.calls[0];
      expect(plan).toBe("full_report");
      expect(currency).toBe("EUR");
      expect(typeof price).toBe("number");
      expect(Number.isFinite(price)).toBe(true);
      expect(price).toBeGreaterThan(0);
      // Straight to Stripe: no /checkout navigation in between, and the quote the
      // reader was shown is handed over rather than re-fetched on another page.
      expect(mockRouterPush).not.toHaveBeenCalled();
      await waitFor(() => expect(mockStartReportCheckout).toHaveBeenCalledTimes(1));
      expect(mockStartReportCheckout).toHaveBeenCalledWith({
        archetype: "Emotional Voyeur",
        plan: "full_report",
        quote: buildSuccessResponse().data.pricingQuotes.full_report,
        reportSessionId: "02d88f31-eceb-4402-940d-c8cd98d01848",
        token: undefined,
      });
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
      mockSearchParams.mockReturnValueOnce(new URLSearchParams("offer=1&v2=1"));

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
    expect(screen.queryByRole("heading", { name: /unlock your reports/i })).not.toBeInTheDocument();
  });

  it("does NOT open the offer modal for a paid customer on an ?offer=1 email link (Marcus regression)", () => {
    // A nurture/offer email link always carries ?offer=1. A customer who already
    // bought must land on their report, never the payment modal.
    const paid = buildSuccessResponse();
    paid.data.accessPlan = "full_report";
    mockUseReportData.mockReturnValue(paid);
    mockSearchParams.mockReturnValueOnce(new URLSearchParams("offer=1&v2=1"));

    render(<ReportPage />);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows no paywall on load — the forced hard wall is gone", () => {
    /**
     * A report token used to bucket the reader into the forced-paywall
     * "treatment" arm: a non-dismissible modal opened on mount, before any
     * scroll. That experiment was removed on 2026-08-31. An identifiable report
     * now opens with nothing over it, and the reader reaches the plans pop-up by
     * scrolling to Attachment Style or clicking an unlock CTA.
     */
    mockUseReportData.mockReturnValue(buildSuccessResponse());
    render(<ReportPage token={TREATMENT_TOKEN} />);
    // This fixture sits at discountStep 1, so the ordinary 24h-ladder modal does
    // auto-open — the forced arm used to suppress it. What must NOT come back is
    // the un-closable one: whatever opens is always closable.
    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: /close/i })).toBeInTheDocument();
  });

  it("an email return is no longer a special case — same closable surface", () => {
    // `from=email` existed to soften the forced wall for re-engagement links.
    // With the wall gone there is nothing to soften, so an email return must
    // look exactly like any other visit.
    mockUseReportData.mockReturnValue(buildSuccessResponse());
    mockSearchParams.mockImplementation(() => new URLSearchParams("from=email&v2=1"));
    try {
      render(<ReportPage token={TREATMENT_TOKEN} />);
      const dialog = screen.getByRole("dialog");
      expect(within(dialog).getByRole("button", { name: /close/i })).toBeInTheDocument();
    } finally {
      mockSearchParams.mockImplementation(() => new URLSearchParams("v2=1"));
    }
  });

  /**
   * `locked_card_price_shown` reached PostHog 331 times across 276 sessions while
   * writing ZERO rows to `analytics_event` from 2026-08-01 onward. The cause was
   * effect ORDER: `persistAnalyticsEvent` drops any event fired before
   * `window.__loveiqReportSubmissionId` is set, and the submission context used
   * to be published ~1500 lines BELOW this effect. Its one-shot ref is set
   * before the call, so the dropped attempt was never retried.
   *
   * The damage was to what we believed rather than to what readers saw: the
   * admin funnel read as though 39% of report readers never saw a price, when
   * the client-side event shows 89% did.
   */
  describe("persisted analytics can be attributed", () => {
    function withSubmission(id: number | null) {
      const base = buildSuccessResponse();
      return { ...base, data: { ...base.data, submissionId: id } };
    }

    it("publishes the submission context BEFORE the locked-card price event", async () => {
      mockUseReportData.mockReturnValue(withSubmission(1920));

      render(<ReportPage />);

      const setCtx = vi.mocked(analytics.setReportSubmissionContext);
      const priceShown = vi.mocked(analytics.trackLockedCardPriceShown);
      await waitFor(() => expect(priceShown).toHaveBeenCalled());
      expect(setCtx).toHaveBeenCalledWith(1920);
      // Order IS the defect — both merely firing is not enough.
      expect(Math.min(...setCtx.mock.invocationCallOrder)).toBeLessThan(
        Math.min(...priceShown.mock.invocationCallOrder)
      );
    });

    it("does not burn the one-shot ref when there is no submission to attribute to", async () => {
      mockUseReportData.mockReturnValue(withSubmission(null));

      render(<ReportPage />);
      await waitFor(() => expect(mockTrackReportViewed).toHaveBeenCalled());

      // Firing here would persist nothing AND mark the event done for the whole
      // pageview, which is exactly how five weeks of rows were lost.
      expect(vi.mocked(analytics.trackLockedCardPriceShown)).not.toHaveBeenCalled();
    });
  });

  /**
   * V1 is the pre-2.0 report, restored on 2026-09-13 and made the DEFAULT for
   * every reader (WhatsApp 2026-09-12, Mark: "Revert back fully please").
   * Report 2.0 is still in the tree behind `?v2=1` — every other case in this
   * file opts into it — so these guard the half that actually ships.
   */
  describe("V1 — the restored pre-2.0 report", () => {
    beforeEach(() => {
      // No `v2=1`: this is what a real visitor gets.
      mockSearchParams.mockImplementation(() => new URLSearchParams());
    });

    it("is what renders by default, and Report 2.0 only behind ?v2=1", () => {
      mockUseReportData.mockReturnValue(buildSuccessResponse());
      const { container: v1 } = render(<ReportPage />);
      // `welcome` is the clearest tell: Report 2.0 retires it, V1 opens on it.
      expect(v1.querySelector("#welcome")).not.toBeNull();
      cleanup();

      mockSearchParams.mockImplementation(() => new URLSearchParams("v2=1"));
      mockUseReportData.mockReturnValue(buildSuccessResponse());
      const { container: v2 } = render(<ReportPage />);
      expect(v2.querySelector("#welcome")).toBeNull();
    });

    it("renders every chapter of report-general, in sectionNumber order", () => {
      mockUseReportData.mockReturnValue(buildSuccessResponse());
      const { container } = render(<ReportPage />);

      // The exact list and order the old report shipped: no retirement filter
      // and no Figma re-sort, both of which are Report 2.0 concepts. Comparing
      // against the resolver rather than a hand-written list means a change to
      // data/report-general.ts cannot silently drift past this.
      const expected = resolveReportSections(reportSections, "Emotional Voyeur").map((s) => s.id);
      const rendered = Array.from(container.querySelectorAll("section[id]")).map((el) => el.id);
      expect(rendered).toEqual(expected);

      // Guard the count too — `toEqual` on two empty arrays would also pass.
      expect(expected.length).toBeGreaterThan(25);
      // And the chapters 2.0 retired are genuinely back, not merely unfiltered.
      for (const id of [
        "welcome",
        "the_loveiq_concept",
        "core_motivation",
        "probability_of_other_archetypes",
        "risk_orientation",
        "about_living_or_not_living_fantasies",
      ]) {
        expect(rendered).toContain(id);
      }
    });

    it("goes straight to Stripe from the pricing modal — no /checkout hop", async () => {
      const user = userEvent.setup();
      mockUseReportData.mockReturnValue(buildSuccessResponse());

      render(<ReportPage />);
      await user.click(screen.getByRole("button", { name: /^unlock my report$/i }));

      // The pre-2.0 report navigated to a /checkout page that c37514d3 deleted.
      // Restoring the old UI must not restore that hop.
      expect(mockRouterPush).not.toHaveBeenCalled();
      await waitFor(() => expect(mockStartReportCheckout).toHaveBeenCalledTimes(1));
      expect(mockStartReportCheckout.mock.calls[0][0]).toMatchObject({
        plan: "full_report",
        archetype: "Emotional Voyeur",
      });
    });

    it("keeps ?v2=1 when the reader opens another archetype", async () => {
      const user = userEvent.setup();
      mockRouterPush.mockReset();
      mockSearchParams.mockImplementation(() => new URLSearchParams("v2=1"));
      const response = buildSuccessResponse();
      response.data.accessPlan = "all_reports";
      response.data.unlockedArchetypes = ["Emotional Voyeur", "Explorer of Edges"];
      mockUseReportData.mockReturnValue(response);

      render(<ReportPage />);
      const [tile] = screen.getAllByRole("button", { name: /view Explorer of Edges report/i });
      await user.click(tile);

      await waitFor(() => expect(mockRouterPush).toHaveBeenCalled());
      const href = String(mockRouterPush.mock.calls[0][0]);
      expect(href).toContain("archetype=");
      // The arm has to ride along. Without it, anyone comparing the two reports
      // is silently dropped back to V1 on the first tile they click.
      expect(href).toContain("v2=1");
    });

    it("carries neither the forced paywall nor the EUR 2 urgency countdown", async () => {
      const user = userEvent.setup();
      mockUseReportData.mockReturnValue(buildSuccessResponse());

      const { container } = render(<ReportPage />);

      // 565f4cac removed the countdown. Its label was the only text on the card
      // and in the modal, so its absence is the whole assertion.
      expect(screen.queryByText(/time left to secure this price/i)).not.toBeInTheDocument();

      // 05725c7f removed the forced wall: the modal must always be dismissible.
      await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
      const closeButton = screen.getByRole("button", { name: /close pricing modal/i });
      expect(closeButton).toBeInTheDocument();
      await user.click(closeButton);
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

      // And the report underneath is readable rather than walled off.
      expect(container.querySelector(".report-page")).not.toBeNull();
    });
  });

  // Review 24.09: "Please take out the Arousal, Desire & Sexual Stage Chapter", "Take out
  // the Summary, Sexual Stage, Importance of Sexuality chapters please", and Sanjin's note
  // that those, the Spark Seeker summary and an opened Arousal, Desire & Pleasure chapter
  // were still at the very end.
  describe("V4 — the chapters the 24.09 review took out", () => {
    const REMOVED = [
      "background_know_how_arousal_desire_and_pleasure",
      "sexual_stage",
      "the_importance_of_sexuality",
    ];

    afterEach(() => {
      mockSearchParams.mockImplementation(() => new URLSearchParams("v2=1"));
    });

    it("renders none of them, and no closing Summary, under ?v4=1", () => {
      mockSearchParams.mockImplementation(() => new URLSearchParams("v4=1"));
      mockUseReportData.mockReturnValue(buildSuccessResponse());

      const { container } = render(<ReportPage />);

      for (const id of REMOVED) expect(container.querySelector(`#${id}`), id).toBeNull();
      expect(container.querySelector(".rv3-endsummary")).toBeNull();
    });

    it("keeps Other Archetypes, now straight after Reading Recommendations", () => {
      mockSearchParams.mockImplementation(() => new URLSearchParams("v4=1"));
      mockUseReportData.mockReturnValue(buildSuccessResponse());

      const { container } = render(<ReportPage />);

      const recommendations = container.querySelector("#recommendations")!;
      const constellation = container.querySelector("#constellation")!;
      expect(constellation).not.toBeNull();
      expect(container.querySelectorAll("#constellation")).toHaveLength(1);
      expect(
        recommendations.compareDocumentPosition(constellation) & Node.DOCUMENT_POSITION_FOLLOWING
      ).toBeTruthy();
      expect(constellation.querySelector(".report-constellation__row")).not.toBeNull();
    });

    it("leaves ?v3=1 with all of them", () => {
      mockSearchParams.mockImplementation(() => new URLSearchParams("v3=1"));
      mockUseReportData.mockReturnValue(buildSuccessResponse());

      const { container } = render(<ReportPage />);

      for (const id of REMOVED) expect(container.querySelector(`#${id}`), id).not.toBeNull();
      expect(container.querySelector(".rv3-endsummary")).not.toBeNull();
      expect(container.querySelector("#constellation")).not.toBeNull();
    });
  });

  // Review 26.09: "The headline changed to 'A Snapshot of what you will learn'" (1:766).
  describe("V4 — the Snapshot's heading names its rating", () => {
    afterEach(() => {
      mockSearchParams.mockImplementation(() => new URLSearchParams("v2=1"));
    });

    it("names the Snapshot's feedback buttons after the new heading under ?v4=1", () => {
      mockSearchParams.mockImplementation(() => new URLSearchParams("v4=1"));
      mockUseReportData.mockReturnValue(buildSuccessResponse());

      const { container } = render(<ReportPage />);

      expect(
        container.querySelector(
          '#snapshot [aria-label="This resonates: A Snapshot of what you will learn"]'
        )
      ).not.toBeNull();
    });

    it("leaves ?v3=1 on its own label", () => {
      mockSearchParams.mockImplementation(() => new URLSearchParams("v3=1"));
      mockUseReportData.mockReturnValue(buildSuccessResponse());

      const { container } = render(<ReportPage />);

      expect(
        container.querySelector(
          '#snapshot [aria-label="This resonates: Five things this report found"]'
        )
      ).not.toBeNull();
    });
  });

  // Review 26.09: "Can we standardise the space between things/sections?" Every part
  // opens as Figma's part frames do: the fading hairline, the heading, then a 44px
  // separator before its first block — for the archetypes still on V2's chapters too,
  // whose first chapter used to sit straight under the heading.
  describe("V4 — every part opens on its rule, its heading and 44px (review 26.09)", () => {
    const FRAMES = [
      ["1:484", "1:491"],
      ["1:850", "1:858"],
      ["1:983", "1:991"],
      ["38:1508", "38:1516"],
      ["1:1138", "1:1146"],
    ];

    afterEach(() => {
      mockSearchParams.mockImplementation(() => new URLSearchParams("v2=1"));
    });

    const partHeads = (container: HTMLElement) =>
      [...container.querySelectorAll(".rv4-part")].filter(
        (el) => !el.classList.contains("rv4-part--lead")
      );

    const expectFrames = (container: HTMLElement) => {
      const heads = partHeads(container);
      expect(heads).toHaveLength(5);
      heads.forEach((head, i) => {
        const before = head.previousElementSibling!;
        const after = head.nextElementSibling!;
        expect(before, `rule before part ${i + 2}`).toHaveClass("rv4-rule");
        expect(before.getAttribute("data-node-id")).toBe(FRAMES[i]![0]);
        expect(after, `separator after part ${i + 2}`).toHaveClass("rv4-sep");
        expect(after.getAttribute("data-node-id")).toBe(FRAMES[i]![1]);
        expect(after.nextElementSibling, `one separator in part ${i + 2}`).not.toHaveClass(
          "rv4-sep"
        );
      });
      return heads;
    };

    it("frames Parts II-VI the same way over V2's chapters", () => {
      mockSearchParams.mockImplementation(() => new URLSearchParams("v4=1"));
      mockUseReportData.mockReturnValue(buildSuccessResponse());

      const { container } = render(<ReportPage />);

      const heads = expectFrames(container);
      expect(heads[0]!.nextElementSibling!.nextElementSibling).toHaveClass("rv4-top3");
    });

    it("keeps one separator where the designed chapters open their parts", () => {
      mockSearchParams.mockImplementation(() => new URLSearchParams("v4=1"));
      const response = buildSuccessResponse();
      Object.assign(response.data as Record<string, unknown>, {
        primaryArchetype: "Spark Seeker",
        percentages: { "Spark Seeker": 63, "Explorer of Edges": 37 },
        typicalBeliefs: buildTypicalBeliefs("Spark Seeker"),
        accelerators: buildAccelerators("Spark Seeker"),
        partnership: buildPartnership("Spark Seeker"),
        fantasy: buildFantasy("Spark Seeker"),
      });
      mockUseReportData.mockReturnValue(response);

      const { container } = render(<ReportPage />);

      const heads = expectFrames(container);
      for (const head of heads.slice(1)) {
        expect(head.nextElementSibling!.nextElementSibling).toHaveClass("rv4-chapter", "is-open");
      }
    });
  });

  // Review 24.09: "Double Check the Chapter order. Challenges in Partnership is the first
  // chapter in Part V."
  describe("V4 — Challenges in Partnership opens Part V", () => {
    const LOCKED_PARTNERSHIP = {
      locked: true,
      eyebrow: "The Pattern",
      "learn.eyebrow": "What you will learn",
      "learn.body": "The loop you and a partner fall into, and how to step out of it.",
    };

    afterEach(() => {
      mockSearchParams.mockImplementation(() => new URLSearchParams("v2=1"));
    });

    const precedes = (a: Element, b: Element) =>
      Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

    it("renders it once, under the Part V heading and above Attachment Style", () => {
      mockSearchParams.mockImplementation(() => new URLSearchParams("v4=1"));
      mockUseReportData.mockReturnValue(buildSuccessResponse());

      const { container } = render(<ReportPage />);

      const heading = [...container.querySelectorAll(".rv4-part")].find(
        (h) => h.querySelector(".rv4-part__eyebrow")?.textContent === "Part V"
      )!;
      const partnership = container.querySelector("#challenges_in_partnership")!;
      const attachment = container.querySelector("#attachment_style")!;
      expect(heading).toBeDefined();
      expect(container.querySelectorAll("#challenges_in_partnership")).toHaveLength(1);
      expect(precedes(heading, partnership)).toBe(true);
      expect(precedes(partnership, attachment)).toBe(true);
    });

    it("keeps its full-report gate, not the essentials one of the slot it sits in", async () => {
      const user = userEvent.setup();
      mockSearchParams.mockImplementation(() => new URLSearchParams("v4=1"));
      const response = buildSuccessResponse();
      (response.data as Record<string, unknown>).partnershipCopy = LOCKED_PARTNERSHIP;
      mockUseReportData.mockReturnValue(response);

      const { container } = render(<ReportPage />);
      const chapter = container.querySelector<HTMLElement>("#challenges_in_partnership")!;
      // The plans pop-up opens by itself for a locked reader and hides the report
      // from the accessibility tree, so the chapter toggle is found by its class.
      const toggle = chapter.querySelector<HTMLElement>("[aria-expanded]")!;
      if (toggle.getAttribute("aria-expanded") === "false") await user.click(toggle);
      await user.click(chapter.querySelector<HTMLElement>(".report-premium-overlay__cta")!);

      expect(vi.mocked(analytics.trackLockIconClicked)).toHaveBeenCalledWith(
        expect.objectContaining({ section_id: "curiosity_level", plan_needed: "full_report" })
      );
    });

    it("leaves ?v3=1 with it after Curiosity", () => {
      mockSearchParams.mockImplementation(() => new URLSearchParams("v3=1"));
      mockUseReportData.mockReturnValue(buildSuccessResponse());

      const { container } = render(<ReportPage />);

      expect(
        precedes(
          container.querySelector("#curiosity_level")!,
          container.querySelector("#challenges_in_partnership")!
        )
      ).toBe(true);
    });

    // Figma 38:1672 (305:350 locked) — the Report 3.0 chapter replaces V2's section
    // wherever the archetype on screen has one written; today that is Spark Seeker.
    const withChapter = (locked: boolean) => {
      const response = buildSuccessResponse();
      Object.assign(response.data as Record<string, unknown>, {
        primaryArchetype: "Spark Seeker",
        percentages: { "Spark Seeker": 63, "Explorer of Edges": 37 },
        partnership: buildPartnership("Spark Seeker", { locked }),
      });
      return response;
    };

    it("draws the Report 3.0 chapter, open and in the plural, where the archetype has one", () => {
      mockSearchParams.mockImplementation(() => new URLSearchParams("v4=1"));
      mockUseReportData.mockReturnValue(withChapter(false));

      const { container } = render(<ReportPage />);

      const chapter = container.querySelector("#challenges_in_partnership")!;
      expect(container.querySelectorAll("#challenges_in_partnership")).toHaveLength(1);
      expect(chapter).toHaveClass("rv4-chapter");
      expect(chapter).not.toHaveClass("rv3-chapter");
      expect(chapter).toHaveClass("is-open");
      expect(chapter.querySelector(".rv4-chapter__name")!.textContent).toBe(
        "Challenges in Partnerships"
      );
      expect(chapter.querySelector(".rv4-cip")).not.toBeNull();
      expect(chapter.querySelector(".report-partnership__heading")).toBeNull();
      // 38:1516 — the 44px between the Part V heading and its first chapter.
      expect(chapter.previousElementSibling?.getAttribute("data-node-id")).toBe("38:1516");
      const heading = [...container.querySelectorAll(".rv4-part")].find(
        (h) => h.querySelector(".rv4-part__eyebrow")?.textContent === "Part V"
      )!;
      expect(precedes(heading, chapter)).toBe(true);
      expect(precedes(chapter, container.querySelector("#attachment_style")!)).toBe(true);
    });

    it("unlocks the Report 3.0 chapter through Curiosity's full-report gate", async () => {
      const user = userEvent.setup();
      mockSearchParams.mockImplementation(() => new URLSearchParams("v4=1"));
      mockUseReportData.mockReturnValue(withChapter(true));

      const { container } = render(<ReportPage />);
      await user.click(container.querySelector<HTMLElement>(".rv4-cip__gate")!);

      expect(vi.mocked(analytics.trackLockIconClicked)).toHaveBeenCalledWith(
        expect.objectContaining({ section_id: "curiosity_level", plan_needed: "full_report" })
      );
    });

    it("keeps V2's section for an archetype with no Report 3.0 chapter", () => {
      mockSearchParams.mockImplementation(() => new URLSearchParams("v4=1"));
      mockUseReportData.mockReturnValue(buildSuccessResponse());

      const { container } = render(<ReportPage />);

      const chapter = container.querySelector("#challenges_in_partnership")!;
      expect(chapter).toHaveClass("rv3-chapter");
      expect(chapter.querySelector(".rv4-cip")).toBeNull();
    });

    // Fatih, 24.09: the plural everywhere in V4. V2's section still names itself to
    // the feedback buttons, which a screen reader reads out.
    it("names V2's section in V4's plural to its feedback buttons, and ?v3=1 keeps the singular", () => {
      mockSearchParams.mockImplementation(() => new URLSearchParams("v4=1"));
      mockUseReportData.mockReturnValue(buildSuccessResponse());
      const v4 = render(<ReportPage />);
      const v4Chapter = v4.container.querySelector("#challenges_in_partnership")!;
      expect(
        v4Chapter.querySelector('[aria-label="This resonates: Challenges in Partnerships"]')
      ).not.toBeNull();
      expect(
        v4Chapter.querySelector('[aria-label="This resonates: Challenges in Partnership"]')
      ).toBeNull();
      v4.unmount();

      mockSearchParams.mockImplementation(() => new URLSearchParams("v3=1"));
      const v3 = render(<ReportPage />);
      expect(
        v3.container.querySelector(
          '#challenges_in_partnership [aria-label="This resonates: Challenges in Partnership"]'
        )
      ).not.toBeNull();
    });

    it("feeds V2's section the copy the server keyed to the archetype on screen", () => {
      // An all-reports reader browsing another archetype: the server builds the copy
      // for that archetype (contentArchetype), so V4 must not demand the primary.
      mockSearchParams.mockImplementation(
        () => new URLSearchParams("v4=1&archetype=quiet-withdrawer")
      );
      const response = buildSuccessResponse();
      Object.assign(response.data as Record<string, unknown>, {
        accessPlan: "all_reports",
        unlockedArchetypes: ["Emotional Voyeur", "Quiet Withdrawer"],
        archetypeTiers: { "Emotional Voyeur": "full_report", "Quiet Withdrawer": "full_report" },
        contentArchetype: "Quiet Withdrawer",
        partnershipCopy: {
          locked: false,
          eyebrow: "The Pattern",
          result: "The Retreat Loop",
          "row1.label": "The bid",
          "row1.value": "A quiet ask",
          "row2.label": "The mishearing",
          "row2.value": "Heard as distance",
          "row3.label": "The confirmation",
          "row3.value": "The retreat proves it",
        },
      });
      mockUseReportData.mockReturnValue(response);

      const { container } = render(<ReportPage />);

      expect(container.querySelector("#challenges_in_partnership")!.textContent).toContain(
        "The Retreat Loop"
      );
    });

    it("leaves ?v3=1 on V2's section even when the view is there", () => {
      mockSearchParams.mockImplementation(() => new URLSearchParams("v3=1"));
      mockUseReportData.mockReturnValue(withChapter(false));

      const { container } = render(<ReportPage />);

      expect(container.querySelector(".rv4-cip")).toBeNull();
      expect(container.querySelector("#challenges_in_partnership")).toHaveClass("rv3-chapter");
    });
  });

  // Figma 304:281 (305:217 locked) — the Report 3.0 Fantasy vs. Reality chapter opens
  // Part VI wherever the archetype on screen has one written; today that is Spark
  // Seeker. Every other reader keeps V2's section.
  describe("V4 — Fantasy vs. Reality opens Part VI", () => {
    const FVR = "typical_sexual_fantasy_amp_practice_tendencies";

    afterEach(() => {
      mockSearchParams.mockImplementation(() => new URLSearchParams("v2=1"));
    });

    const precedes = (a: Element, b: Element) =>
      Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

    const withChapter = (locked: boolean) => {
      const response = buildSuccessResponse();
      const article = REPORT_V4_LEARN_MORE[FVR]!;
      Object.assign(response.data as Record<string, unknown>, {
        primaryArchetype: "Spark Seeker",
        percentages: { "Spark Seeker": 63, "Explorer of Edges": 37 },
        fantasy: buildFantasy("Spark Seeker", { locked }),
        fantasyArticle: { article: splitArticleForReader(article, locked), locked },
      });
      return response;
    };

    it("draws the Report 3.0 chapter, open, under the Part VI heading", () => {
      mockSearchParams.mockImplementation(() => new URLSearchParams("v4=1"));
      mockUseReportData.mockReturnValue(withChapter(false));

      const { container } = render(<ReportPage />);

      const chapter = container.querySelector(`#${FVR}`)!;
      expect(container.querySelectorAll(`#${FVR}`)).toHaveLength(1);
      expect(chapter).toHaveClass("rv4-chapter");
      expect(chapter).not.toHaveClass("rv3-chapter");
      expect(chapter).toHaveClass("is-open");
      expect(chapter.querySelector(".rv4-chapter__name")!.textContent).toBe("Fantasy vs. Reality");
      expect(chapter.querySelector(".rv4-fvr")).not.toBeNull();
      expect(chapter.querySelector(".rv4-fvt")).not.toBeNull();
      // V2's section, map and tables, is not there.
      expect(chapter.querySelector(".report-practice-table")).toBeNull();
      // 1:1146 — the 44px between the Part VI heading and its first chapter.
      expect(chapter.previousElementSibling?.getAttribute("data-node-id")).toBe("1:1146");
      const heading = [...container.querySelectorAll(".rv4-part")].find(
        (h) => h.querySelector(".rv4-part__eyebrow")?.textContent === "Part VI"
      )!;
      expect(precedes(heading, chapter)).toBe(true);
    });

    it("closes on the practice card, then 'Go deeper & learn more'", () => {
      mockSearchParams.mockImplementation(() => new URLSearchParams("v4=1"));
      mockUseReportData.mockReturnValue(withChapter(false));

      const { container } = render(<ReportPage />);

      const chapter = container.querySelector(`#${FVR}`)!;
      const body = chapter.querySelector(".rv4-chapter__body")!;
      expect(body.querySelector(":scope > .rv4-fvr + .rv4-try")).not.toBeNull();
      expect(body.querySelector(":scope > .rv4-try + .rv4-learn")).not.toBeNull();
    });

    it("unlocks through its own full-report gate", async () => {
      const user = userEvent.setup();
      mockSearchParams.mockImplementation(() => new URLSearchParams("v4=1"));
      mockUseReportData.mockReturnValue(withChapter(true));

      const { container } = render(<ReportPage />);
      await user.click(container.querySelector<HTMLElement>(".rv4-fvr__gate")!);

      expect(vi.mocked(analytics.trackLockIconClicked)).toHaveBeenCalledWith(
        expect.objectContaining({ section_id: FVR, plan_needed: "full_report" })
      );
    });

    it("opens the paywall from the table's lock too", async () => {
      const user = userEvent.setup();
      mockSearchParams.mockImplementation(() => new URLSearchParams("v4=1"));
      mockUseReportData.mockReturnValue(withChapter(true));

      const { container } = render(<ReportPage />);
      await user.click(
        container.querySelector<HTMLElement>(`#${FVR} .rv4-fvt__lock .rv4-lockbadge`)!
      );

      expect(vi.mocked(analytics.trackLockIconClicked)).toHaveBeenCalledWith(
        expect.objectContaining({ section_id: FVR })
      );
    });

    it("keeps V2's section for an archetype with no Report 3.0 chapter", () => {
      mockSearchParams.mockImplementation(() => new URLSearchParams("v4=1"));
      mockUseReportData.mockReturnValue(buildSuccessResponse());

      const { container } = render(<ReportPage />);

      const chapter = container.querySelector(`#${FVR}`)!;
      expect(chapter).toHaveClass("rv3-chapter");
      expect(chapter.querySelector(".rv4-fvr")).toBeNull();
    });

    // The V4 head names the chapter "Fantasy vs. Reality"; V2's section names itself
    // to the feedback buttons, which a screen reader reads out.
    it("names V2's section 'Fantasy vs. Reality' to its feedback buttons, and ?v3=1 keeps its title", () => {
      mockSearchParams.mockImplementation(() => new URLSearchParams("v4=1"));
      mockUseReportData.mockReturnValue(buildSuccessResponse());
      const v4 = render(<ReportPage />);
      expect(
        v4.container.querySelector(`#${FVR} [aria-label="This resonates: Fantasy vs. Reality"]`)
      ).not.toBeNull();
      v4.unmount();

      mockSearchParams.mockImplementation(() => new URLSearchParams("v3=1"));
      const v3 = render(<ReportPage />);
      // Read back rather than matched in a selector: jsdom's selector engine takes the
      // "&" in the title for CSS nesting.
      const labels = [...v3.container.querySelectorAll(`#${FVR} [aria-label]`)].map((el) =>
        el.getAttribute("aria-label")
      );
      expect(labels).toContain("This resonates: Typical Sexual Fantasy & Practice Tendencies");
    });

    it("names the Report 3.0 chapter the same way", () => {
      mockSearchParams.mockImplementation(() => new URLSearchParams("v4=1"));
      mockUseReportData.mockReturnValue(withChapter(false));

      const { container } = render(<ReportPage />);

      expect(
        container.querySelector(`#${FVR} [aria-label="This resonates: Fantasy vs. Reality"]`)
      ).not.toBeNull();
    });

    it("leaves ?v3=1 on V2's section even where the chapter exists", () => {
      mockSearchParams.mockImplementation(() => new URLSearchParams("v3=1"));
      mockUseReportData.mockReturnValue(withChapter(false));

      const { container } = render(<ReportPage />);

      expect(container.querySelector(`#${FVR}`)).toHaveClass("rv3-chapter");
      expect(container.querySelector(".rv4-fvr")).toBeNull();
    });
  });

  // Mark's "they should all be blurred with the icon and the Unlock CTA" (Figma
  // 1940141608) is pinned on Fantasy vs. Reality's collapsed table categories, not on
  // chapters (25.09). A locked chapter without a V4 design keeps V2's own preview and
  // Premium card under V4.
  describe("V4 — locked chapters without a V4 design keep V2's preview", () => {
    afterEach(() => {
      mockSearchParams.mockImplementation(() => new URLSearchParams("v2=1"));
    });

    it("shows V2's Premium card in a locked chapter, and no blurred stand-in anywhere", () => {
      mockSearchParams.mockImplementation(() => new URLSearchParams("v4=1"));
      mockUseReportData.mockReturnValue(buildSuccessResponse());

      const { container } = render(<ReportPage />);

      expect(
        container.querySelector("#libido_challenges_in_relationships .report-premium-overlay")
      ).not.toBeNull();
      expect(container.querySelector(".rv4-lockch")).toBeNull();
    });

    it("opens the paywall for the chapter tapped", async () => {
      const user = userEvent.setup();
      mockSearchParams.mockImplementation(() => new URLSearchParams("v4=1"));
      mockUseReportData.mockReturnValue(buildSuccessResponse());

      const { container } = render(<ReportPage />);
      const chapter = container.querySelector<HTMLElement>("#libido_challenges_in_relationships")!;
      // The plans pop-up opens by itself for a locked reader and hides the report
      // from the accessibility tree, so the chapter toggle is found by its attribute.
      const toggle = chapter.querySelector<HTMLElement>("[aria-expanded]")!;
      if (toggle.getAttribute("aria-expanded") === "false") await user.click(toggle);
      await user.click(chapter.querySelector<HTMLElement>(".report-premium-overlay")!);

      expect(vi.mocked(analytics.trackLockIconClicked)).toHaveBeenCalledWith(
        expect.objectContaining({ section_id: "libido_challenges_in_relationships" })
      );
    });

    it("leaves ?v3=1 on the same V2 preview", () => {
      mockSearchParams.mockImplementation(() => new URLSearchParams("v3=1"));
      mockUseReportData.mockReturnValue(buildSuccessResponse());

      const { container } = render(<ReportPage />);

      expect(
        container.querySelector("#libido_challenges_in_relationships .report-premium-overlay")
      ).not.toBeNull();
    });
  });

  // Review 24.09: "the top part is dark on my iPhone (the background to the time and
  // battery)". Safari 15-18 tints the status bar from `theme-color`, and without one it
  // keeps the site's dark shell (#0b0613) it painted while the report was loading.
  describe("V4 status bar", () => {
    const themeColor = () =>
      document.head.querySelector('meta[name="theme-color"]')?.getAttribute("content") ?? null;

    afterEach(() => {
      mockSearchParams.mockImplementation(() => new URLSearchParams("v2=1"));
    });

    it("declares a white theme-color for ?v4=1 from the loading screen on", () => {
      mockSearchParams.mockImplementation(() => new URLSearchParams("v4=1"));
      mockUseReportData.mockReturnValue({ data: null, status: "loading", error: null });

      render(<ReportPage />);

      expect(themeColor()).toBe("#ffffff");
    });

    it("keeps it on the rendered report, however the flag is spelled", () => {
      mockSearchParams.mockImplementation(() => new URLSearchParams("v4=true"));
      mockUseReportData.mockReturnValue(buildSuccessResponse());

      render(<ReportPage />);

      expect(themeColor()).toBe("#ffffff");
    });

    it("leaves V1, V2 and V3 without one", () => {
      for (const qs of ["", "v2=1", "v3=1"]) {
        mockSearchParams.mockImplementation(() => new URLSearchParams(qs));
        mockUseReportData.mockReturnValue(buildSuccessResponse());

        const { unmount } = render(<ReportPage />);

        expect(themeColor(), qs || "default").toBeNull();
        unmount();
      }
    });
  });
});
