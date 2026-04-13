// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

const mockRouterPush = vi.fn();

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

import ReportPage from "@/components/report/ReportPage";

const REPORT_MODAL_TEST_TIMEOUT_MS = 10000;
const mockScrollTo = vi.fn();

describe("ReportPage", () => {
  function buildSuccessResponse() {
    return {
      data: {
        userName: "Eman",
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

      await waitFor(() =>
        expect(mockRouterPush).toHaveBeenCalledWith("/checkout?plan=full_report")
      );
      expect(container.querySelector(".report-premium-overlay__cta")).toBeInTheDocument();
    },
    REPORT_MODAL_TEST_TIMEOUT_MS
  );
});
