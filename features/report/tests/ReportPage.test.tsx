// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

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

const { mockRateSection, mockFeedbackIdentity } = vi.hoisted(() => ({
  mockRateSection: vi.fn(),
  mockFeedbackIdentity: vi.fn(),
}));
vi.mock("@features/report/ui/hooks/useSectionFeedback", () => ({
  useSectionFeedback: (sessionId: string | null, token?: string | null) => (
    mockFeedbackIdentity(sessionId, token ?? null),
    {
      feedbacks: {},
      submitted: {},
      rateSection: mockRateSection,
      submitFeedback: vi.fn(),
    }
  ),
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
  trackExperimentExposure: vi.fn(),
  hasCookieYesConsent: () => true,
}));

// The real V3Chapter, counted: the scroll-spy test below checks that moving the nav's
// highlight renders no chapter again. Transparent to every other test.
const v3ChapterRenders = vi.hoisted(() => ({ count: 0 }));
vi.mock("@features/report/ui/v3/V3Chapter", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@features/report/ui/v3/V3Chapter")>();
  const { createElement } = await import("react");
  const Counted = (props: Parameters<typeof actual.default>[0]) => {
    v3ChapterRenders.count += 1;
    return createElement(actual.default, props);
  };
  return { ...actual, default: Counted };
});

import ReportPage from "@features/report/ui/ReportPage";
import { UNLOCK_ANCHOR_REGEX } from "@features/checkout/server/reportPurchase";
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
import { REPORT_V4_DESIGNED_CHAPTER_IDS } from "@/data/report3-archetype-page";
import { REPORT_V4_NAV_IDS } from "@features/report/ui/v3/reportV3Nav";
import { splitArticleForReader } from "@features/report/server/contentGating";
// The 50/50 was concluded → any non-empty token now buckets to the forced
// "treatment" arm. The soft "control" (dismissible) experience is now reached
// only via the email-return escape hatch (from=email / utm_source=email) or the
// dev `?arm=` override — driven through mockSearchParams in the tests below.
const TREATMENT_TOKEN = "rpt_report_test_001";

const REPORT_MODAL_TEST_TIMEOUT_MS = 60_000;
/**
 * How long a closed pricing dialog may take to leave the DOM. waitFor's default 1s
 * holds alone, but under the full suite's parallel load (the pre-push hook) the close
 * has taken longer: "locks background scroll…" and "shows the pricing modal on report
 * open…" each failed there once on 2026-09-26 and passed alone every time. On 2026-09-29
 * "shows the pricing modal on report open…" ran past 5s twice in a row under the hook
 * (8.4s and 8.6s in all) and took 1.1s alone, so the wait is 10s, inside the 60s test.
 */
const DIALOG_CLOSED = { timeout: 10_000 };
const mockScrollTo = vi.fn();
/**
 * Closes the plans modal the fixture's discount ladder opens on mount, once nothing can
 * bring it back. The plans pop-up's 1.6s beat starts on mount too (jsdom's zero-sized boxes
 * count its chapter as reached), and a close inside the beat lets the pop-up open the modal
 * again: under the full suite's load the close landed there (2026-10-02: closed at 1.55s,
 * reopened at 1.84s) and the dialog never left. The beat is a no-op while the modal is
 * open, so it is let pass first, as "carries neither the forced paywall…" does.
 */
async function closeLadderModal(user: ReturnType<typeof userEvent.setup>) {
  await new Promise((resolve) => setTimeout(resolve, 1_700));
  await user.click(screen.getByRole("button", { name: /close pricing modal/i }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument(), DIALOG_CLOSED);
}

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
    // Unmount BEFORE the globals go. A render committed at the very end of a test
    // leaves passive effects pending, and unmounting flushes them: with the stubs
    // already removed, useRevealOnView then constructs an IntersectionObserver that
    // no longer exists. On a busy machine that failed two "free sharing" tests at
    // random (ReferenceError at useRevealOnView), and blocked the pre-push hook.
    cleanup();
    vi.unstubAllGlobals();
    mockScrollTo.mockReset();
    document.documentElement.style.overflow = "";
    document.body.style.left = "";
    document.body.style.overflow = "";
    document.body.style.position = "";
    document.body.style.right = "";
    document.body.style.top = "";
    document.body.style.width = "";
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

    // Copy changed deliberately: this screen used to say "Complete the survey
    // again to generate a fresh report", which told someone who had already
    // answered 56 questions to redo them. Opening the report on a second phone
    // is the ordinary way to land here, and the completion email carries their
    // link, so the email is the way back in. The survey link stays for people
    // who genuinely have not taken it, but as an aside rather than the fix.
    expect(screen.getByRole("heading", { name: /can.t find your report/i })).toBeInTheDocument();
    expect(screen.getByText(/we emailed your report link/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /taken the test yet/i })).toHaveAttribute(
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

  it("reloads the reader's own report, not bare /report, when they came by link", () => {
    // Bare /report only works in the browser that took the survey. From an emailed
    // link it could only lead to "Can't find your report" (2026-10-03).
    mockUseReportData.mockReturnValue({
      data: null,
      status: "error",
      error: { statusCode: 500, message: "Unable to process request." },
    });

    render(<ReportPage token="rpt_abc123" />);

    expect(screen.getByRole("link", { name: /reload report/i })).toHaveAttribute(
      "href",
      "/report/rpt_abc123"
    );
  });

  it("says a withdrawn shared link is not available, not 'we emailed your report link'", () => {
    // A share recipient never took the survey; the owner's copy sent them looking
    // for an email that does not exist.
    mockUseReportData.mockReturnValue({
      data: null,
      status: "error",
      error: { statusCode: 404, message: "Report not found." },
    });

    render(<ReportPage token="rpts_abcdefghijklmnopqrst" />);

    expect(
      screen.getByRole("heading", { name: "This shared report isn't available" })
    ).toBeInTheDocument();
    expect(screen.getByText(/ask them to send it again/i)).toBeInTheDocument();
    expect(screen.queryByText(/we emailed your report link/i)).toBeNull();
  });

  it("keeps the owner's not-found copy for an owner's link", () => {
    mockUseReportData.mockReturnValue({
      data: null,
      status: "error",
      error: { statusCode: 404, message: "Report not found." },
    });

    render(<ReportPage token="rpt_abcdefghijklmnopqrst" />);

    expect(screen.getByRole("heading", { name: /can.t find your report/i })).toBeInTheDocument();
    expect(screen.getByText(/we emailed your report link/i)).toBeInTheDocument();
  });

  it("treats a malformed report link (400) as not found, not as an outage", () => {
    mockUseReportData.mockReturnValue({
      data: null,
      status: "error",
      error: { statusCode: 400, message: "Invalid input" },
    });

    render(<ReportPage token="[object Object]" />);

    expect(screen.getByRole("heading", { name: /can.t find your report/i })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /temporarily unavailable/i })).toBeNull();
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
      // Both plans say so where the price would be, and neither can start a checkout
      // on a price nobody was quoted — not even the catalogue's fallback figure.
      expect(screen.getAllByText("Pricing unavailable")).toHaveLength(2);
      expect(screen.queryByText("€39.99")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: /^continue$/i })).toBeDisabled();
      expect(
        screen.getByRole("button", { name: /^only unlock my highest scoring report$/i })
      ).toBeDisabled();
    },
    REPORT_MODAL_TEST_TIMEOUT_MS
  );

  it(
    "shows the pricing modal on report open and keeps premium section gates after closing it",
    async () => {
      const user = userEvent.setup();
      mockUseReportData.mockReturnValue(buildSuccessResponse());

      const { container } = render(<ReportPage />);

      expect(
        screen.getByRole("heading", { name: /discover your full sexual self/i })
      ).toBeInTheDocument();
      expect(container.querySelector(".report-pricing-modal__scroll-region")).toBeInTheDocument();

      // Auto-mount paywalls no longer fire paywall_view (founder's "forced"
      // vs "initiated" distinction, 2026-05-24). Modal still renders; only
      // user-initiated clicks fire trackPaywallInitiated.
      expect(mockTrackPaywallView).not.toHaveBeenCalled();
      expect(mockTrackPaywallInitiated).not.toHaveBeenCalled();

      await closeLadderModal(user);
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

      await closeLadderModal(user);

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

      await closeLadderModal(user);
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

      await user.click(
        screen.getByRole("button", { name: /^only unlock my highest scoring report$/i })
      );

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
      const { anchor, ...checkout } = mockStartReportCheckout.mock.calls[0][0];
      expect(checkout).toEqual({
        archetype: "Emotional Voyeur",
        plan: "full_report",
        quote: buildSuccessResponse().data.pricingQuotes.full_report,
        reportSessionId: "02d88f31-eceb-4402-940d-c8cd98d01848",
        token: undefined,
      });
      // Where the reader was when the paygate opened, for Stripe's return to put them
      // back (Figma 1382:2010). Nothing to measure in jsdom, but never a malformed one.
      expect(anchor === null || UNLOCK_ANCHOR_REGEX.test(anchor)).toBe(true);
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
      expect(
        screen.getByRole("heading", { name: /discover your full sexual self/i })
      ).toBeInTheDocument();
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
      await closeLadderModal(user);

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
    expect(
      screen.queryByRole("heading", { name: /discover your full sexual self/i })
    ).not.toBeInTheDocument();
  });

  it(
    "opens Share Report on a report with no token behind it, as ?preview=1 is (Marcus, 2026-10-04)",
    async () => {
      // The preview route answers ownerToken: null. The sidebar drew the button disabled
      // but styled live, and nothing opened. Now sharing opens and Send says nothing went.
      const user = userEvent.setup();
      const fetchSpy = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
      vi.stubGlobal("fetch", fetchSpy);
      const paid = buildSuccessResponse();
      paid.data.accessPlan = "full_report";
      mockUseReportData.mockReturnValue(paid);

      render(<ReportPage />);

      await user.click(screen.getAllByRole("button", { name: /share report/i })[0]!);
      const dialog = await screen.findByRole("dialog");
      await user.type(within(dialog).getByLabelText(/email address/i), "friend@example.com");
      await user.click(within(dialog).getByRole("button", { name: /share report/i }));

      expect(await within(dialog).findByRole("alert")).toHaveTextContent(/nothing was sent/i);
      expect(fetchSpy.mock.calls.some(([url]) => String(url).includes("/api/report/share"))).toBe(
        false
      );
    },
    REPORT_MODAL_TEST_TIMEOUT_MS
  );

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
      // The default until Report 3.0 launched; `?v4=0` still opens it.
      mockSearchParams.mockImplementation(() => new URLSearchParams("v4=0"));
    });

    it("is what ?v4=0 renders, Report 3.0 is the default, and Report 2.0 is behind ?v2=1", () => {
      mockUseReportData.mockReturnValue(buildSuccessResponse());
      const { container: v1 } = render(<ReportPage />);
      // `welcome` is the clearest tell: Report 2.0 retires it, V1 opens on it.
      expect(v1.querySelector("#welcome")).not.toBeNull();
      expect(v1.querySelector(".rv4-rule")).toBeNull();
      cleanup();

      // What a real visitor gets: no parameter at all.
      mockSearchParams.mockImplementation(() => new URLSearchParams());
      mockUseReportData.mockReturnValue(buildSuccessResponse());
      const { container: v4 } = render(<ReportPage />);
      expect(v4.querySelector("#welcome")).toBeNull();
      expect(v4.querySelector(".rv4-rule")).not.toBeNull();
      expect(mockUseReportData.mock.calls.at(-1)?.[0]).toEqual(
        expect.objectContaining({ v4: true })
      );
      cleanup();

      mockSearchParams.mockImplementation(() => new URLSearchParams("v2=1"));
      mockUseReportData.mockReturnValue(buildSuccessResponse());
      const { container: v2 } = render(<ReportPage />);
      expect(v2.querySelector("#welcome")).toBeNull();
      expect(v2.querySelector(".rv4-rule")).toBeNull();
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
      await user.click(
        screen.getByRole("button", { name: /^only unlock my highest scoring report$/i })
      );

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

    it(
      "carries neither the forced paywall nor the EUR 2 urgency countdown",
      async () => {
        const user = userEvent.setup();
        mockUseReportData.mockReturnValue(buildSuccessResponse());

        const { container } = render(<ReportPage />);

        // 565f4cac removed the countdown. Its label was the only text on the card
        // and in the modal, so its absence is the whole assertion.
        expect(screen.queryByText(/time left to secure this price/i)).not.toBeInTheDocument();

        // 05725c7f removed the forced wall: the modal must always be dismissible.
        await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
        // Two things open the modal here: the fixture's discount ladder, at once, and
        // the plans pop-up's 1.6s beat after the reader reaches its chapter — which
        // jsdom's zero-sized boxes count as reached on mount. Closing inside that beat
        // let the pop-up open the modal again, so the test failed whenever the render
        // was quick. Let the beat pass (it is a no-op while the modal is open) before
        // closing, and the close is the only thing left to observe.
        await new Promise((resolve) => setTimeout(resolve, 1_700));
        const closeButton = screen.getByRole("button", { name: /close pricing modal/i });
        expect(closeButton).toBeInTheDocument();
        await user.click(closeButton);
        await waitFor(
          () => expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
          DIALOG_CLOSED
        );

        // And the report underneath is readable rather than walled off.
        expect(container.querySelector(".report-page")).not.toBeNull();
      },
      REPORT_MODAL_TEST_TIMEOUT_MS
    );
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

  // 30.09: the Snapshot's four deep dives moved into the pre-report wizard's map (Figma
  // 1071:2092), and Part 2 now runs the Archetype card into the Summary (1:483).
  describe("V4 — the Snapshot left the report for the wizard", () => {
    afterEach(() => {
      mockSearchParams.mockImplementation(() => new URLSearchParams("v2=1"));
    });

    it("renders no Snapshot, nudges or 'How you compare' under ?v4=1", () => {
      mockSearchParams.mockImplementation(() => new URLSearchParams("v4=1"));
      mockUseReportData.mockReturnValue(buildSuccessResponse());

      const { container } = render(<ReportPage />);

      expect(container.querySelector("#snapshot")).toBeNull();
      expect(container.querySelector(".rv4-nudges")).toBeNull();
      expect(container.querySelector(".rv3-snap")).toBeNull();
    });

    it("keeps ?v3=1's own Snapshot and its label", () => {
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
  // separator before its first block — where the designed chapters fall back to V2's
  // too, whose first chapter used to sit straight under the heading.
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

    // Review 27.09 (Extra divider.jpeg): the rule that drops a closed chapter's hairline
    // before a part keys on the chapter and the part's rule being adjacent siblings.
    it("opens Parts IV-VI straight after a closed chapter, the sibling the one-line rule keys on", () => {
      mockSearchParams.mockImplementation(() => new URLSearchParams("v4=1"));
      mockUseReportData.mockReturnValue(buildSuccessResponse());

      const { container } = render(<ReportPage />);

      for (const [id, frame] of [
        ["power_orientation", "1:983"],
        ["energy_level", "38:1508"],
        ["curiosity_level", "1:1138"],
      ] as const) {
        const chapter = container.querySelector(`#${id}`)!;
        expect(chapter, id).toHaveClass("rv4-chapter");
        expect(chapter, id).not.toHaveClass("is-open");
        expect(chapter.nextElementSibling, id).toHaveClass("rv4-rule");
        expect(chapter.nextElementSibling!.getAttribute("data-node-id")).toBe(frame);
      }
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

    it("renders it once, under the Part 5 heading and above Attachment Style", () => {
      mockSearchParams.mockImplementation(() => new URLSearchParams("v4=1"));
      mockUseReportData.mockReturnValue(buildSuccessResponse());

      const { container } = render(<ReportPage />);

      const heading = [...container.querySelectorAll(".rv4-part")].find(
        (h) => h.querySelector(".rv4-part__eyebrow")?.textContent === "Part 5"
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
        (h) => h.querySelector(".rv4-part__eyebrow")?.textContent === "Part 5"
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
      // V3Chapter draws V2's section; under V4 its root is `.rv4-chapter` alone (review
      // 27.09: the frozen 3.0 restyle keyed on `.rv3-chapter`), its body still V3's.
      expect(chapter).toHaveClass("rv4-chapter");
      expect(chapter).not.toHaveClass("rv3-chapter");
      expect(chapter.querySelector(".rv3-chapter__body")).not.toBeNull();
      expect(chapter.querySelector(".rv4-cip")).toBeNull();
    });

    // Marcus, 01.10: "store the rating also without 'send'". The thumb reaches the
    // page's own store, under the section's id, with no message.
    it("stores a chapter's rating from its thumb, through the page", async () => {
      mockSearchParams.mockImplementation(() => new URLSearchParams("v4=1"));
      mockUseReportData.mockReturnValue(buildSuccessResponse());
      mockRateSection.mockReset().mockResolvedValue(true);
      const { container } = render(<ReportPage />);
      const thumb = container.querySelector<HTMLButtonElement>(
        '#challenges_in_partnership [aria-label="This resonates: Challenges in Partnerships"]'
      )!;
      await act(async () => {
        fireEvent.click(thumb);
      });
      expect(mockRateSection).toHaveBeenCalledWith("challenges_in_partnership", "up");
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

    it("draws the Report 3.0 chapter, open, under the Part 6 heading", () => {
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
        (h) => h.querySelector(".rv4-part__eyebrow")?.textContent === "Part 6"
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
      // V3Chapter draws V2's section; under V4 its root is `.rv4-chapter` alone (review
      // 27.09: the frozen 3.0 restyle keyed on `.rv3-chapter`), its body still V3's.
      expect(chapter).toHaveClass("rv4-chapter");
      expect(chapter).not.toHaveClass("rv3-chapter");
      expect(chapter.querySelector(".rv3-chapter__body")).not.toBeNull();
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

  // WhatsApp, 26.09: Mark proposed locking "the other chapters" outright instead of
  // letting a paywalled reader open them into V2's preview; Marcus agreed ("Love
  // this", "Agree") and Mark closed it ("Let's do that then"). Under V4 a chapter the
  // reader has no access to is its head, its teaser and the gradient lock, and a tap
  // opens the paywall. Who is locked is the nav badges' answer. The four designed
  // chapters keep their own gates, and V2's previews where there is no V4 copy.
  // Marcus, 2026-10-05: anyone may share, and a recipient sees the report as its owner
  // does, locks included. Only the owner can unlock it, so a recipient's lock never prices.
  describe("free sharing — a recipient's locked report", () => {
    const FVR = "typical_sexual_fantasy_amp_practice_tendencies";
    const view = (viewMode: "owner" | "shared") => {
      const response = buildSuccessResponse();
      const article = REPORT_V4_LEARN_MORE[FVR]!;
      Object.assign(response.data as Record<string, unknown>, {
        viewMode,
        submissionId: 42,
        ownerFirstName: "Eman",
        // /api/report prices nothing for a shared viewer.
        ...(viewMode === "shared" ? { pricingQuotes: null } : {}),
        primaryArchetype: "Spark Seeker",
        percentages: { "Spark Seeker": 63, "Explorer of Edges": 37 },
        fantasy: buildFantasy("Spark Seeker", { locked: true }),
        fantasyArticle: { article: splitArticleForReader(article, true), locked: true },
      });
      return response;
    };

    afterEach(() => {
      mockSearchParams.mockImplementation(() => new URLSearchParams("v2=1"));
    });

    it("opens the take-the-test screen from a lock, uncounted as intent to pay", async () => {
      const user = userEvent.setup();
      mockSearchParams.mockImplementation(() => new URLSearchParams("v4=1"));
      mockUseReportData.mockReturnValue(view("shared"));

      const { container } = render(<ReportPage />);
      await user.click(container.querySelector<HTMLElement>(".rv4-fvr__gate")!);

      const modal = container.querySelector(".report-pricing-modal")!;
      expect(modal).toHaveAttribute("data-state", "open");
      expect(modal).toHaveAttribute("data-variant", "recipient");
      expect(
        within(modal as HTMLElement).getByRole("link", { name: "Take the Free Test" })
      ).toHaveAttribute("href", "/survey");
      expect(vi.mocked(analytics.trackLockIconClicked)).not.toHaveBeenCalled();
      expect(mockTrackPaywallInitiated).not.toHaveBeenCalled();
      expect(mockStartReportCheckout).not.toHaveBeenCalled();
    });

    it("shows the owner the paygate from the same lock", async () => {
      const user = userEvent.setup();
      mockSearchParams.mockImplementation(() => new URLSearchParams("v4=1"));
      mockUseReportData.mockReturnValue(view("owner"));

      const { container } = render(<ReportPage />);
      await user.click(container.querySelector<HTMLElement>(".rv4-fvr__gate")!);

      const modal = container.querySelector(".report-pricing-modal")!;
      expect(modal).toHaveAttribute("data-state", "open");
      // "default" or "offer", whichever this fixture's ladder makes it: a priced one.
      expect(modal).not.toHaveAttribute("data-variant", "recipient");
      expect(modal.querySelector(".rpg__tiers")).not.toBeNull();
      expect(vi.mocked(analytics.trackLockIconClicked)).toHaveBeenCalledWith(
        expect.objectContaining({ section_id: FVR })
      );
    });

    it("counts nothing a recipient does against the owner: no paywall ping, no events, no ratings", async () => {
      const user = userEvent.setup();
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}"));
      mockGetReportSessionId.mockReturnValue("2f1c0b8e-3d4a-4c5b-8e6f-7a8b9c0d1e2f");
      mockSearchParams.mockImplementation(() => new URLSearchParams("v4=1"));
      mockUseReportData.mockReturnValue(view("shared"));

      const { container } = render(<ReportPage />);
      await user.click(container.querySelector<HTMLElement>(".rv4-fvr__gate")!);

      expect(fetchSpy.mock.calls.some(([url]) => String(url).includes("/api/price"))).toBe(false);
      expect(vi.mocked(analytics.setReportSubmissionContext)).toHaveBeenLastCalledWith(null);
      expect(mockFeedbackIdentity).toHaveBeenLastCalledWith(null, null);
      fetchSpy.mockRestore();
    });

    it("counts the owner's, by the same lock", async () => {
      const user = userEvent.setup();
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}"));
      mockGetReportSessionId.mockReturnValue("2f1c0b8e-3d4a-4c5b-8e6f-7a8b9c0d1e2f");
      mockSearchParams.mockImplementation(() => new URLSearchParams("v4=1"));
      mockUseReportData.mockReturnValue(view("owner"));

      const { container } = render(<ReportPage />);
      await user.click(container.querySelector<HTMLElement>(".rv4-fvr__gate")!);

      await waitFor(() =>
        expect(fetchSpy.mock.calls.some(([url]) => String(url).includes("/api/price"))).toBe(true)
      );
      expect(vi.mocked(analytics.setReportSubmissionContext)).toHaveBeenLastCalledWith(42);
      expect(mockFeedbackIdentity).toHaveBeenLastCalledWith(
        "2f1c0b8e-3d4a-4c5b-8e6f-7a8b9c0d1e2f",
        null
      );
      fetchSpy.mockRestore();
    });

    it("gives a recipient no sticky unlock bar, and the owner one", () => {
      mockSearchParams.mockImplementation(() => new URLSearchParams("v4=1"));
      mockUseReportData.mockReturnValue(view("shared"));
      const shared = render(<ReportPage />);
      expect(shared.container.querySelector(".report-sticky-unlock")).toBeNull();
      shared.unmount();

      mockUseReportData.mockReturnValue(view("owner"));
      const owner = render(<ReportPage />);
      expect(owner.container.querySelector(".report-sticky-unlock")).not.toBeNull();
    });
  });

  describe("V4 — a chapter the reader has no access to is locked outright (review 26.09)", () => {
    const LIBIDO = "libido_challenges_in_relationships";
    const DESIGNED = [
      "typical_beliefs",
      "typical_arousal_accelerators_turn_ons_of_the_core_archetype",
      "challenges_in_partnership",
      "typical_sexual_fantasy_amp_practice_tendencies",
    ];
    const withPlan = (plan: string | null) => {
      const response = buildSuccessResponse();
      (response.data as Record<string, unknown>).accessPlan = plan;
      return response;
    };
    const lockedIds = (container: HTMLElement) =>
      [...container.querySelectorAll(".rv4-chapter.is-locked")].map((c) => c.id);

    afterEach(() => {
      mockSearchParams.mockImplementation(() => new URLSearchParams("v2=1"));
    });

    it("draws a locked chapter as its head, teaser and lock, with no V2 preview", () => {
      mockSearchParams.mockImplementation(() => new URLSearchParams("v4=1"));
      mockUseReportData.mockReturnValue(withPlan(null));

      const { container } = render(<ReportPage />);

      const chapter = container.querySelector(`#${LIBIDO}`)!;
      expect(chapter).toHaveClass("rv4-chapter", "is-locked");
      expect(chapter.querySelector(".rv4-chapter__lock")).not.toBeNull();
      expect(chapter.querySelector(".rv4-chapter__teaser")).not.toBeNull();
      expect(chapter.querySelector(".report-premium-overlay")).toBeNull();
      expect(chapter.querySelector(".rv3-chapter__body")).toBeNull();
    });

    it("opens the paywall for the chapter tapped", async () => {
      const user = userEvent.setup();
      mockSearchParams.mockImplementation(() => new URLSearchParams("v4=1"));
      mockUseReportData.mockReturnValue(withPlan(null));

      const { container } = render(<ReportPage />);
      await user.click(container.querySelector<HTMLElement>(`#${LIBIDO} .rv4-chapter__button`)!);

      expect(vi.mocked(analytics.trackLockIconClicked)).toHaveBeenCalledWith(
        expect.objectContaining({ section_id: LIBIDO, plan_needed: "full_report" })
      );
    });

    it("locks Reward System, and never the free Other Archetypes or a designed chapter", () => {
      mockSearchParams.mockImplementation(() => new URLSearchParams("v4=1"));
      mockUseReportData.mockReturnValue(withPlan(null));

      const { container } = render(<ReportPage />);

      expect([...REPORT_V4_DESIGNED_CHAPTER_IDS].sort()).toEqual([...DESIGNED].sort());
      const locked = lockedIds(container);
      expect(locked).toContain("biochemical_reward_system_dynamics");
      expect(locked).toContain("core_insecurities");
      expect(locked).not.toContain("constellation");
      for (const id of DESIGNED) expect(locked).not.toContain(id);
      // The fixture sends no V4 chapter, as for a name with no V4 copy: its designed
      // chapters open into V2's own locked preview, as before.
      const beliefs = container.querySelector("#typical_beliefs")!;
      expect(beliefs.querySelector("[aria-expanded]")).not.toBeNull();
      expect(beliefs.querySelector(".rv3-chapter__body")).not.toBeNull();
    });

    it("locks only what Essentials leaves out", () => {
      mockSearchParams.mockImplementation(() => new URLSearchParams("v4=1"));
      mockUseReportData.mockReturnValue(withPlan("essentials"));

      const { container } = render(<ReportPage />);

      const locked = lockedIds(container);
      expect(locked).toContain(LIBIDO);
      expect(locked).not.toContain("core_insecurities");
      expect(locked).not.toContain("confidence_level");
      expect(locked).not.toContain("attachment_style");
      expect(container.querySelector("#core_insecurities [aria-expanded]")).not.toBeNull();
    });

    it("locks nothing for a full-report reader", () => {
      mockSearchParams.mockImplementation(() => new URLSearchParams("v4=1"));
      mockUseReportData.mockReturnValue(withPlan("full_report"));

      const { container } = render(<ReportPage />);

      expect(lockedIds(container)).toEqual([]);
    });

    it("leaves ?v3=1 on V2's preview", () => {
      mockSearchParams.mockImplementation(() => new URLSearchParams("v3=1"));
      mockUseReportData.mockReturnValue(withPlan(null));

      const { container } = render(<ReportPage />);

      expect(container.querySelector(".is-locked")).toBeNull();
      expect(container.querySelector(`#${LIBIDO} .report-premium-overlay`)).not.toBeNull();
    });

    // The nav's three tiers (28.09 sync; Mark's 961:333, 29.09): free, open to this
    // reader — the gradient padlock — and locked. The sidebar is always in the DOM.
    const tiers = (container: HTMLElement) =>
      new Map(
        [...container.querySelectorAll<HTMLElement>(".report-sidebar__item")].map((a) => [
          a.getAttribute("href")!.slice(1),
          a.dataset.access,
        ])
      );

    it("badges the nav in three tiers for a reader with no plan, as 961:333 draws them", () => {
      mockSearchParams.mockImplementation(() => new URLSearchParams("v4=1"));
      mockUseReportData.mockReturnValue(withPlan(null));

      const { container } = render(<ReportPage />);
      const tier = tiers(container);

      for (const id of ["introduction", "what_shaped_this_report", "core_archetype"]) {
        expect(tier.get(id), id).toBe("free");
      }
      // The four designed chapters open, in part, to every reader.
      for (const id of DESIGNED) expect(tier.get(id), id).toBe("unlocked");
      for (const id of ["core_insecurities", LIBIDO, "biochemical_reward_system_dynamics"]) {
        expect(tier.get(id), id).toBe("locked");
      }
      // Other Archetypes opens for everyone (above), so its badge says so.
      expect(tier.get("constellation")).toBe("free");
      // The chapters the nav calls locked are the ones the page locks.
      const lockedInNav = [...tier].filter(([, t]) => t === "locked").map(([id]) => id);
      expect(lockedIds(container).sort()).toEqual(lockedInNav.sort());
    });

    it("opens every gated chapter's badge for a full-report reader", () => {
      mockSearchParams.mockImplementation(() => new URLSearchParams("v4=1"));
      mockUseReportData.mockReturnValue(withPlan("full_report"));

      const { container } = render(<ReportPage />);
      const tier = tiers(container);

      expect([...tier.values()]).not.toContain("locked");
      expect(tier.get("core_insecurities")).toBe("unlocked");
      expect(tier.get(LIBIDO)).toBe("unlocked");
      expect(tier.get("introduction")).toBe("free");
    });

    it("opens what Essentials opens, and locks the rest", () => {
      mockSearchParams.mockImplementation(() => new URLSearchParams("v4=1"));
      mockUseReportData.mockReturnValue(withPlan("essentials"));

      const { container } = render(<ReportPage />);
      const tier = tiers(container);

      expect(tier.get("core_insecurities")).toBe("unlocked");
      expect(tier.get("attachment_style")).toBe("unlocked");
      expect(tier.get(LIBIDO)).toBe("locked");
      for (const id of DESIGNED) expect(tier.get(id), id).toBe("unlocked");
    });
  });

  // Review 24.09: "the top part is dark on my iPhone (the background to the time and
  // battery)". Safari 15-18 tints the status bar from `theme-color`, and without one it
  // keeps the site's dark shell (#0b0613) it painted while the report was loading.
  // Final review 26.09: the API built V4's chapters for every request, handing the
  // default report's locked readers paid copy they are never shown. The page says
  // when it is V4, and the API builds them only then.
  // Review 27.09, Mark: "For the unlocked version, any chance we can show the report 2.0
  // version in the other chapters that we don't open by default. Please make sure that
  // the practical and learn more elements are according to the new design."
  describe("V4 — the Report 2.0 chapters open on V4's Try this and Go deeper cards", () => {
    const POWER = {
      "edu.eyebrow": "Learn: leading and yielding",
      "edu.teaser": "In sex, one person usually sets the pace.",
      "edu.body.p1": "Leading: setting the pace.",
      "learn.eyebrow": "What you will learn",
      "learn.body": "Where you sit between leading and yielding.",
      takeaway: "Power works on you as play.",
      locked: false,
    };
    const INSECURITIES = {
      "practical.label": "Working with your sensitivity: three moves",
      "practical.teaser": "Three small moves.",
      "practical.line1": "1. Name it.",
      "learn.eyebrow": "What you will learn",
      "learn.body": "What sexual insecurity is.",
      locked: false,
    };
    const withCopies = (
      plan: string | null = "full_report",
      extra: Record<string, unknown> = {}
    ) => {
      const response = buildSuccessResponse();
      Object.assign(response.data as Record<string, unknown>, {
        accessPlan: plan,
        powerCopy: POWER,
        insecuritiesCopy: INSECURITIES,
        ...extra,
      });
      return response;
    };

    afterEach(() => {
      mockSearchParams.mockImplementation(() => new URLSearchParams("v2=1"));
    });

    it("opens Power on 2.0's card, then Go deeper where 2.0's 'Learn:' panel was", () => {
      mockSearchParams.mockImplementation(() => new URLSearchParams("v4=1"));
      mockUseReportData.mockReturnValue(withCopies());

      const { container } = render(<ReportPage />);

      const power = container.querySelector("#power_orientation")!;
      expect(power.querySelector(".report-power__card")).not.toBeNull();
      expect(power.querySelector(".report-power__details")).toBeNull();
      const learn = power.querySelector(".rv4-chapter__extras .rv4-learn")!;
      expect(learn.querySelector(".rv4-learn__label")!.textContent).toBe("Learn More & Go Deeper");
      expect(learn.textContent).toContain(POWER["edu.teaser"]);
      const inner = power.querySelector(".rv3-chapter__body-inner")!;
      expect([...inner.children].map((el) => el.className.split(" ")[0])).toEqual([
        "report-power",
        "rv4-chapter__extras",
        "rv4-rating",
      ]);
    });

    it("gives Insecurities a Try this card, its 2.0 label for the eyebrow", () => {
      mockSearchParams.mockImplementation(() => new URLSearchParams("v4=1"));
      mockUseReportData.mockReturnValue(withCopies());

      const { container } = render(<ReportPage />);

      const chapter = container.querySelector("#core_insecurities")!;
      expect(chapter.querySelector(".report-insecurities__details")).toBeNull();
      const practice = chapter.querySelector(".rv4-chapter__extras .rv4-try")!;
      expect(practice.querySelector(".rv4-try__label")!.textContent).toBe(
        "Try This & See What Shifts"
      );
      expect(practice.querySelector(".rv4-try__eyebrow")!.textContent).toBe(
        INSECURITIES["practical.label"]
      );
    });

    it("keeps 2.0's own panels, and no V4 card, under ?v2=1 and ?v3=1", () => {
      for (const query of ["v2=1", "v3=1"]) {
        mockSearchParams.mockImplementation(() => new URLSearchParams(query));
        mockUseReportData.mockReturnValue(withCopies());
        const { container, unmount } = render(<ReportPage />);
        expect(container.querySelector(".report-power__details"), query).not.toBeNull();
        expect(container.querySelector(".report-insecurities__details"), query).not.toBeNull();
        expect(container.querySelector(".rv4-chapter__extras"), query).toBeNull();
        unmount();
      }
    });

    it("keeps a locked 2.0 section's own panel, which opens the paywall, and makes it no card", () => {
      mockSearchParams.mockImplementation(() => new URLSearchParams("v4=1"));
      mockUseReportData.mockReturnValue(
        withCopies(null, {
          beliefsCopy: {
            "edu.eyebrow": "Learn: where beliefs come from",
            "edu.teaser": "Beliefs form early.",
            "learn.body": "Where your beliefs came from.",
            keep: [],
            loosen: [],
            locked: true,
          },
        })
      );

      const { container } = render(<ReportPage />);

      // Typical Beliefs never locks outright: this archetype opens V2's locked preview.
      const beliefs = container.querySelector("#typical_beliefs")!;
      expect(beliefs.querySelector(".report-beliefs__details")).not.toBeNull();
      expect(beliefs.querySelector(".rv4-chapter__extras")).toBeNull();
    });

    it("hands over no card while the payload is still another archetype's", () => {
      mockSearchParams.mockImplementation(() => new URLSearchParams("v4=1"));
      mockUseReportData.mockReturnValue(
        withCopies("full_report", { contentArchetype: "Spark Seeker" })
      );

      const { container } = render(<ReportPage />);

      expect(container.querySelector(".rv4-chapter__extras")).toBeNull();
    });
  });

  describe("V4 — asks the API for its chapters, and nothing else does (final review 26.09)", () => {
    afterEach(() => {
      mockSearchParams.mockImplementation(() => new URLSearchParams("v2=1"));
    });
    const lastRequest = () => mockUseReportData.mock.calls.at(-1)?.[0] as { v4?: boolean };

    it("tells the data hook when the page is V4", () => {
      mockSearchParams.mockImplementation(() => new URLSearchParams("v4=1"));
      mockUseReportData.mockReturnValue(buildSuccessResponse());
      render(<ReportPage />);
      expect(lastRequest().v4).toBe(true);
    });

    // Report 3.0 is the default, so a bare URL asks too; only an older report by name does not.
    it("tells it on a bare URL, the default", () => {
      mockSearchParams.mockImplementation(() => new URLSearchParams());
      mockUseReportData.mockReturnValue(buildSuccessResponse());
      render(<ReportPage />);
      expect(lastRequest().v4).toBe(true);
    });

    it.each(["v4=0", "v2=1", "v3=1"])("does not on %j", (query) => {
      mockSearchParams.mockImplementation(() => new URLSearchParams(query));
      mockUseReportData.mockReturnValue(buildSuccessResponse());
      render(<ReportPage />);
      expect(lastRequest().v4).toBe(false);
    });
  });

  // Mark, 28.09: "can we take out the 'what you will learn' text sections from the V2
  // report chapters." Growth has no card, so its copy reached it without the mapper.
  describe("V4 — the 2.0 chapters open without 'What you will learn'", () => {
    const GROWTH = {
      locked: false,
      "learn.eyebrow": "What you will learn",
      "learn.body": "The shifts that move you forward.",
    };
    afterEach(() => {
      mockSearchParams.mockImplementation(() => new URLSearchParams("v2=1"));
    });
    const withGrowth = () => {
      const response = buildSuccessResponse();
      Object.assign(response.data as Record<string, unknown>, {
        accessPlan: "full_report",
        growthCopy: GROWTH,
      });
      return response;
    };
    const learnIn = (root: HTMLElement) =>
      root
        .querySelector("#typical_growth_potentials_for_the_core_archetype")
        ?.querySelector('[class$="__learn-body"]') ?? null;

    it("drops it from Growth, a chapter with no card, under ?v4=1", () => {
      mockSearchParams.mockImplementation(() => new URLSearchParams("v4=1"));
      mockUseReportData.mockReturnValue(withGrowth());
      const { container } = render(<ReportPage />);
      expect(
        container.querySelector("#typical_growth_potentials_for_the_core_archetype")
      ).not.toBeNull();
      expect(learnIn(container)).toBeNull();
    });

    it("keeps it under ?v2=1", () => {
      mockUseReportData.mockReturnValue(withGrowth());
      const { container } = render(<ReportPage />);
      expect(learnIn(container)).not.toBeNull();
    });
  });

  // Sync 28.09 (Notion: "Take out the end of the report summary - 'Where this leaves
  // you'"): hardly anyone scrolls that far, and its points belong in the chapters.
  describe("V4 — the report ends without 'Where this leaves you'", () => {
    afterEach(() => {
      mockSearchParams.mockImplementation(() => new URLSearchParams("v2=1"));
    });

    it("drops the closing note under ?v4=1", () => {
      mockSearchParams.mockImplementation(() => new URLSearchParams("v4=1"));
      mockUseReportData.mockReturnValue(buildSuccessResponse());
      const { container } = render(<ReportPage />);
      expect(container.querySelector(".report-closing")).toBeNull();
    });

    it("keeps it everywhere else", () => {
      mockUseReportData.mockReturnValue(buildSuccessResponse());
      const { container } = render(<ReportPage />);
      expect(container.querySelector(".report-closing")).not.toBeNull();
    });
  });

  // Fatih, 27.09: "the entire page is laggy". The chapter the nav marks as current
  // changes some twenty times down the page. As state on ReportExperience, every change
  // re-rendered the whole report — ~120ms each on the dev server, and more once the
  // Report 2.0 chapters carried their content — though only the two navs read it.
  describe("the scroll-spy", () => {
    let scrollY = 0;
    // After mount, every anchor past `pivot` sits `grown` px further down.
    let grown = 0;
    let pivot = Infinity;
    let rects: { mockRestore: () => void } | null = null;
    // Frames queue and run one batch at a time: some of the page's frame loops
    // schedule their next frame from inside the last.
    let frames: FrameRequestCallback[] = [];
    const nextFrame = () => {
      const due = frames;
      frames = [];
      due.forEach((cb) => cb(0));
    };

    beforeEach(() => {
      scrollY = 0;
      grown = 0;
      pivot = Infinity;
      frames = [];
      Object.defineProperty(window, "scrollY", { configurable: true, get: () => scrollY });
      // Every nav anchor sits 1000px below the one before it (V4's nav: these are V4's).
      rects = vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (
        this: Element
      ) {
        const i = REPORT_V4_NAV_IDS.indexOf(this.id);
        const top = (i < 0 ? 0 : i * 1000 + (i > pivot ? grown : 0)) - scrollY;
        return {
          top,
          bottom: top + 10,
          left: 0,
          right: 10,
          width: 10,
          height: 10,
          x: 0,
          y: top,
          toJSON: () => ({}),
        } as DOMRect;
      });
      vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => frames.push(cb));
      vi.stubGlobal("cancelAnimationFrame", () => {});
    });

    afterEach(() => {
      rects?.mockRestore();
      mockSearchParams.mockImplementation(() => new URLSearchParams("v2=1"));
    });

    it("moves the nav's highlight without rendering the report again", () => {
      mockSearchParams.mockImplementation(() => new URLSearchParams("v4=1"));
      const response = buildSuccessResponse();
      (response.data as Record<string, unknown>).accessPlan = "full_report";
      mockUseReportData.mockReturnValue(response);
      render(<ReportPage />);

      const current = () =>
        screen
          .getAllByRole("link")
          .filter((link) => link.getAttribute("aria-current") === "location")
          .map((link) => link.getAttribute("href"));
      // A chapter halfway down that the page draws and the sidebar lists.
      const listed = REPORT_V4_NAV_IDS.filter(
        (id) => document.getElementById(id) && document.querySelector(`a[href="#${id}"]`)
      );
      expect(listed.length).toBeGreaterThan(6);
      const target = listed[Math.floor(listed.length / 2)]!;
      expect(current()).not.toEqual([`#${target}`]);

      const before = v3ChapterRenders.count;
      expect(before).toBeGreaterThan(0);
      scrollY = REPORT_V4_NAV_IDS.indexOf(target) * 1000 + 50;
      act(() => {
        fireEvent.scroll(window);
        nextFrame();
      });

      expect(current()).toEqual([`#${target}`]);
      expect(v3ChapterRenders.count).toBe(before);
    });

    // Found in the lag round (27.09): the tops were measured once, at mount, and the page
    // keeps growing after that — Typical Beliefs' rows as they turn (~759px), a chapter
    // opening, the fonts landing. The highlight ran ahead of the reader: at Attachment it
    // lit Love Language. `staging` did the same.
    it("follows the chapters where they are now, after the page above them grows", () => {
      mockSearchParams.mockImplementation(() => new URLSearchParams("v4=1"));
      const response = buildSuccessResponse();
      (response.data as Record<string, unknown>).accessPlan = "full_report";
      mockUseReportData.mockReturnValue(response);
      render(<ReportPage />);

      const current = () =>
        screen
          .getAllByRole("link")
          .filter((link) => link.getAttribute("aria-current") === "location")
          .map((link) => link.getAttribute("href"));
      const listed = REPORT_V4_NAV_IDS.filter(
        (id) => document.getElementById(id) && document.querySelector(`a[href="#${id}"]`)
      );
      // Halfway down, with the next anchor on the page too: measured at mount, the
      // grown page would light that one instead.
      const target = listed.find(
        (id, k) =>
          k >= listed.length / 2 &&
          document.getElementById(REPORT_V4_NAV_IDS[REPORT_V4_NAV_IDS.indexOf(id) + 1] ?? "")
      )!;
      expect(target).toBeDefined();

      // Everything past the second anchor moves 1759px down, with no resize to tell.
      pivot = REPORT_V4_NAV_IDS.indexOf(listed[1]!);
      grown = 1759;
      scrollY = REPORT_V4_NAV_IDS.indexOf(target) * 1000 + grown + 50;
      act(() => {
        fireEvent.scroll(window);
        nextFrame();
      });

      expect(current()).toEqual([`#${target}`]);
    });

    // Report 3.0 lands a chapter 144px down, under its floating chrome. At the old 90px
    // line the next scroll lit the chapter before it, often off screen by then (desktop
    // sweep, 2026-10-06).
    it("keeps a chapter lit that sits where a nav jump lands it, 144px down", () => {
      mockSearchParams.mockImplementation(() => new URLSearchParams("v4=1"));
      const response = buildSuccessResponse();
      (response.data as Record<string, unknown>).accessPlan = "full_report";
      mockUseReportData.mockReturnValue(response);
      render(<ReportPage />);

      const current = () =>
        screen
          .getAllByRole("link")
          .filter((link) => link.getAttribute("aria-current") === "location")
          .map((link) => link.getAttribute("href"));
      const listed = REPORT_V4_NAV_IDS.filter(
        (id) => document.getElementById(id) && document.querySelector(`a[href="#${id}"]`)
      );
      const target = listed[Math.floor(listed.length / 2)]!;

      scrollY = REPORT_V4_NAV_IDS.indexOf(target) * 1000 - 144;
      act(() => {
        fireEvent.scroll(window);
        nextFrame();
      });

      expect(current()).toEqual([`#${target}`]);
    });

    // Mark's 961:333 lists Part 1 · Welcome: at the top of the page the nav names the
    // Introduction, not Core Archetype two chapters further down, and scrolling on
    // lights "What shaped this report" as it passes.
    it("lights the Introduction at the top of V4's page, then the Welcome's second chapter", () => {
      mockSearchParams.mockImplementation(() => new URLSearchParams("v4=1"));
      const response = buildSuccessResponse();
      (response.data as Record<string, unknown>).accessPlan = "full_report";
      mockUseReportData.mockReturnValue(response);
      render(<ReportPage />);

      const current = () =>
        screen
          .getAllByRole("link")
          .filter((link) => link.getAttribute("aria-current") === "location")
          .map((link) => link.getAttribute("href"));
      expect(document.getElementById("introduction")).not.toBeNull();
      expect(document.getElementById("what_shaped_this_report")).not.toBeNull();
      expect(current()).toEqual(["#introduction"]);

      scrollY = REPORT_V4_NAV_IDS.indexOf("what_shaped_this_report") * 1000 + 50;
      act(() => {
        fireEvent.scroll(window);
        nextFrame();
      });
      expect(current()).toEqual(["#what_shaped_this_report"]);
    });
  });

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
      for (const qs of ["v4=0", "v2=1", "v3=1"]) {
        mockSearchParams.mockImplementation(() => new URLSearchParams(qs));
        mockUseReportData.mockReturnValue(buildSuccessResponse());

        const { unmount } = render(<ReportPage />);

        expect(themeColor(), qs || "default").toBeNull();
        unmount();
      }
    });
  });
  // Marcus's 50/50 (shared/experiments/popupArm.ts). jsdom lays every element out
  // at the top, so the trigger counts as reached on mount; discountStep 0 keeps
  // the 24h ladder's own auto-open out of the way.
  describe("V4 — the pay pop-up test", () => {
    afterEach(() => {
      vi.useRealTimers();
      mockSearchParams.mockImplementation(() => new URLSearchParams("v2=1"));
    });

    function lockedV4(query: string, submissionId: number | null = 2063) {
      mockSearchParams.mockImplementation(() => new URLSearchParams(`v4=1${query}`));
      const response = buildSuccessResponse();
      for (const quote of Object.values(response.data.pricingQuotes!)) quote.discountStep = 0;
      mockUseReportData.mockReturnValue({ ...response, data: { ...response.data, submissionId } });
    }

    const exposure = () => vi.mocked(analytics.trackExperimentExposure);

    it("marks the pop-up point and opens nothing for no_popup", () => {
      vi.useFakeTimers();
      exposure().mockClear();
      lockedV4("&popup=off");

      render(<ReportPage />);
      act(() => vi.advanceTimersByTime(3000));

      expect(exposure()).toHaveBeenCalledTimes(1);
      expect(exposure()).toHaveBeenCalledWith({
        experiment: "report_popup_2026_10",
        variant: "no_popup",
        surface: "challenges_in_partnership",
      });
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("marks the same point and opens the pop-up for popup", () => {
      vi.useFakeTimers();
      exposure().mockClear();
      lockedV4("&popup=on");

      render(<ReportPage />);
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      act(() => vi.advanceTimersByTime(1700));

      expect(exposure()).toHaveBeenCalledWith(expect.objectContaining({ variant: "popup" }));
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    /** A window from 700px wide. */
    const stubDesktop = () =>
      vi.stubGlobal(
        "matchMedia",
        vi.fn().mockImplementation((query: string) => ({
          matches: query === "(min-width: 700px)",
          media: query,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          addListener: vi.fn(),
          removeListener: vi.fn(),
          dispatchEvent: vi.fn(),
        }))
      );

    // Mark, desktop review 01.10: "Take out the Paywall Pop up that currently triggers at
    // Challenges in Partnerships". Fatih: desktop only, from 700px; phones keep it. With
    // no pop-up there is nothing to expose, so desktop readers leave the 50/50 too.
    it("opens nothing and exposes no arm on a desktop, from 700px", () => {
      vi.useFakeTimers();
      exposure().mockClear();
      stubDesktop();
      lockedV4("&popup=on");

      render(<ReportPage />);
      act(() => vi.advanceTimersByTime(3000));

      expect(exposure()).not.toHaveBeenCalled();
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    // The arrival is still the Slack journey's "Paywall hit": /api/price hears of it on a
    // desktop too, though nothing opens. (The first offer card's observer never fires
    // here, and no modal opens, so the ping can only come from the pop-up point.)
    it("still reports reaching the paywall on a desktop", () => {
      vi.useFakeTimers();
      const fetchSpy = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
      vi.stubGlobal("fetch", fetchSpy);
      stubDesktop();
      lockedV4("&popup=on");

      render(<ReportPage token={TREATMENT_TOKEN} />);
      act(() => vi.advanceTimersByTime(3000));

      const pings = fetchSpy.mock.calls.filter(([url]) => url === "/api/price");
      expect(pings).toHaveLength(1);
      expect(pings[0]![1]).toMatchObject({ method: "POST" });
      expect(JSON.parse(String(pings[0]![1].body))).toEqual({ token: TREATMENT_TOKEN });
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("leaves a reader with no submission out of it, pop-up as built", () => {
      vi.useFakeTimers();
      exposure().mockClear();
      lockedV4("", null);

      render(<ReportPage />);
      act(() => vi.advanceTimersByTime(1700));

      expect(exposure()).not.toHaveBeenCalled();
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    it("never buckets a V2 reader", () => {
      vi.useFakeTimers();
      exposure().mockClear();
      mockSearchParams.mockImplementation(() => new URLSearchParams("v2=1&popup=off"));
      const response = buildSuccessResponse();
      for (const quote of Object.values(response.data.pricingQuotes!)) quote.discountStep = 0;
      mockUseReportData.mockReturnValue({
        ...response,
        data: { ...response.data, submissionId: 2063 },
      });

      render(<ReportPage />);
      act(() => vi.advanceTimersByTime(1700));

      expect(exposure()).not.toHaveBeenCalled();
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });
  });

  // Fatih, 03.10: each archetype's own colours. The live root is the only place a V4 reader
  // gets the inks, so the page is what this pins.
  describe("V4 — the report root carries the archetype's own inks", () => {
    afterEach(() => {
      mockSearchParams.mockImplementation(() => new URLSearchParams("v2=1"));
    });

    const renderRoot = (query: string) => {
      mockSearchParams.mockImplementation(() => new URLSearchParams(query));
      mockUseReportData.mockReturnValue(buildSuccessResponse());
      return render(<ReportPage />).container.querySelector<HTMLElement>("main.report-page")!;
    };

    it("sets Emotional Voyeur's inks beside its accent under ?v4=1", () => {
      const main = renderRoot("v4=1");
      expect(main.style.getPropertyValue("--rv3-name-ink")).toBe("#0d7e7a");
      expect(main.style.getPropertyValue("--rv3-accent-ink")).toBe("#0d7e7a");
      expect(main.style.getPropertyValue("--rv3-accent-ink-rgb")).toBe("13 126 122");
      expect(main.style.getPropertyValue("--report-accent-rgb")).toBe("52 234 228");
    });

    it("leaves ?v3=1's root on the stylesheet's defaults", () => {
      const main = renderRoot("v3=1");
      expect(main.style.getPropertyValue("--rv3-name-ink")).toBe("");
      expect(main.style.getPropertyValue("--rv3-accent-ink-rgb")).toBe("");
      expect(main.style.getPropertyValue("--report-accent-rgb")).toBe("52 234 228");
    });

    it("stays dismissed once closed, even after the scroll teaser's timer lands", async () => {
      /**
       * This is the assertion the test above was making by accident.
       *
       * The scroll teaser arms a 1.6s timer and, when it fires, opens the modal
       * if one is not already open. A reader arriving with a ladder discount
       * has the modal auto-opened on mount, scrolling arms that timer
       * underneath it, and closing inside the window let the timer throw the
       * modal straight back — dismissed, then back a second and a half later.
       *
       * The test above only caught it when the run was slow enough for the
       * timer to land inside its `waitFor`, which is why it read as a flake for
       * days. Waiting PAST the timer makes it deterministic in both directions:
       * it fails on the unfixed component every time, and it cannot pass by
       * being quick.
       */
      const user = userEvent.setup();
      mockUseReportData.mockReturnValue(buildSuccessResponse());

      render(<ReportPage />);

      await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
      await user.click(screen.getByRole("button", { name: /close pricing modal/i }));
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

      // Real time, not fake: the component owns the timer and the point is that
      // it never fires. 1.6s is the delay; 2.2s clears it with margin.
      await new Promise((resolve) => setTimeout(resolve, 2200));

      expect(
        screen.queryByRole("dialog"),
        "the pricing modal reopened itself after the reader dismissed it"
      ).toBeNull();
    });
  });
});
