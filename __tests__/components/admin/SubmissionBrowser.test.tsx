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
          email: "test@test.com",
          first_name: "Test",
          status: "completed",
          started_at: "2025-01-01",
          completed_at: "2025-01-01",
          primary_archetype: "Spark Seeker",
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
});
