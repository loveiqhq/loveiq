// @vitest-environment jsdom
import { render, screen, cleanup } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

const mockRefetch = vi.fn();

vi.mock("@/components/admin/hooks/useAdminFetch", () => ({
  useAdminFetch: vi.fn(() => ({
    data: {
      submissions: [
        {
          id: 1,
          record_type: "submission",
          submission_id: 1,
          session_id: null,
          detail_href: "/admin/submissions/1",
          selectable: true,
          email: "test@test.com",
          first_name: "Test",
          status: "completed",
          started_at: "2025-01-01",
          completed_at: "2025-01-01",
          saved_at: "2025-01-01",
          duration_ms: 60000,
          utm_source: null,
          primary_archetype: "Spark Seeker",
          v5_primary_archetype: null,
          priority_score: 12,
          priority_label: "low",
          review_reasons: [],
          answer_count: null,
          current_index: null,
          recoverable: false,
        },
      ],
      total: 1,
      page: 1,
      limit: 20,
    },
    loading: false,
    error: null,
    refetch: mockRefetch,
  })),
}));

vi.mock("@/components/admin/FilterBar", () => ({
  default: () => <div data-testid="filter-bar" />,
}));

vi.mock("@/components/admin/SubmissionTable", () => ({
  default: () => <div data-testid="submission-table" />,
}));

vi.mock("@/components/admin/Pagination", () => ({
  default: () => <div data-testid="pagination" />,
}));

import { useAdminFetch } from "@/components/admin/hooks/useAdminFetch";
import SubmissionBrowser from "@/components/admin/SubmissionBrowser";

beforeEach(() => {
  mockRefetch.mockClear();
});

afterEach(cleanup);
afterEach(() => {
  vi.useRealTimers();
});

describe("SubmissionBrowser", () => {
  it("renders heading, export button, filter bar, table, and pagination", () => {
    render(<SubmissionBrowser />);

    expect(screen.getByText("Submissions")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /export csv/i })).toBeInTheDocument();
    expect(screen.getByTestId("filter-bar")).toBeInTheDocument();
    expect(screen.getByTestId("submission-table")).toBeInTheDocument();
    expect(screen.getByTestId("pagination")).toBeInTheDocument();
  });

  it("shows spinner when loading", () => {
    vi.mocked(useAdminFetch).mockReturnValueOnce({
      data: null,
      loading: true,
      error: null,
      refetch: mockRefetch,
    });

    const { container } = render(<SubmissionBrowser />);
    // The spinner is a div with animate-spin class
    expect(container.querySelector(".animate-spin")).toBeInTheDocument();
  });

  it("shows error message when error occurs", () => {
    vi.mocked(useAdminFetch).mockReturnValueOnce({
      data: null,
      loading: false,
      error: "Failed to load submissions",
      refetch: mockRefetch,
    });

    render(<SubmissionBrowser />);
    expect(screen.getByText("Failed to load submissions")).toBeInTheDocument();
  });

  it("export CSV link excludes page/limit params", () => {
    render(<SubmissionBrowser />);

    const exportLink = screen.getByRole("link", { name: /export csv/i });
    const href = exportLink.getAttribute("href") ?? "";
    expect(href).toContain("/api/admin/export");
    expect(href).not.toContain("page=");
    expect(href).not.toContain("limit=");
  });

  it("refetches while recent submissions are still awaiting scoring", () => {
    vi.useFakeTimers();
    vi.mocked(useAdminFetch).mockReturnValueOnce({
      data: {
        submissions: [
          {
            id: 2,
            record_type: "submission",
            submission_id: 2,
            session_id: null,
            detail_href: "/admin/submissions/2",
            selectable: true,
            email: "pending@test.com",
            first_name: "Pending",
            status: "completed",
            started_at: new Date(Date.now() - 60_000).toISOString(),
            completed_at: new Date(Date.now() - 30_000).toISOString(),
            saved_at: new Date(Date.now() - 30_000).toISOString(),
            duration_ms: 45_000,
            utm_source: null,
            primary_archetype: null,
            v5_primary_archetype: null,
            priority_score: 0,
            priority_label: "low",
            review_reasons: ["Scoring pending"],
            answer_count: null,
            current_index: null,
            recoverable: false,
          },
        ],
        total: 1,
        page: 1,
        limit: 20,
      },
      loading: false,
      error: null,
      refetch: mockRefetch,
    });

    render(<SubmissionBrowser />);
    vi.advanceTimersByTime(5000);

    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });
});
