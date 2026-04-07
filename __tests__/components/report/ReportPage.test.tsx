// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

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
    submitFeedback: vi.fn(),
  }),
}));

import ReportPage from "@/components/report/ReportPage";

describe("ReportPage", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
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
});
