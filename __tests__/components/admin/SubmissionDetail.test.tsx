// @vitest-environment jsdom
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockRefetch = vi.fn();
const mockUseAdminFetch = vi.fn();

vi.mock("@/components/admin/hooks/useAdminFetch", () => ({
  useAdminFetch: (...args: unknown[]) => mockUseAdminFetch(...args),
}));

vi.mock("@/components/admin/AnswerDisplay", () => ({
  default: (props: { answer: { q_id: string } }) => (
    <div data-testid={`answer-${props.answer.q_id}`}>Answer</div>
  ),
}));

vi.mock("@/components/admin/BarChart", () => ({
  default: () => <div data-testid="bar-chart" />,
}));

vi.mock("@/components/admin/ConfirmDialog", () => ({
  default: (props: { open: boolean; onConfirm: () => void; onCancel: () => void }) =>
    props.open ? (
      <div data-testid="confirm-dialog">
        <button onClick={props.onConfirm}>Confirm</button>
        <button onClick={props.onCancel}>Cancel</button>
      </div>
    ) : null,
}));

import SubmissionDetail from "@/components/admin/SubmissionDetail";

let mockFetch: ReturnType<typeof vi.fn>;

const submissionData = {
  submission: {
    id: 1,
    email: "test@example.com",
    first_name: "Test",
    status: "completed",
    started_at: "2025-01-01T10:00:00Z",
    completed_at: "2025-01-01T10:05:00Z",
    duration_ms: 300000,
  },
  answers: [{ q_id: "q1", question_text: "Q1?", answer_type: "open", answer_value: "Answer" }],
  scoring: null,
};

beforeEach(() => {
  mockFetch = vi.fn();
  globalThis.fetch = mockFetch;
  document.cookie = "__csrf=test-token";
  mockRefetch.mockClear();
  mockUseAdminFetch.mockReturnValue({
    data: submissionData,
    loading: false,
    error: null,
    refetch: mockRefetch,
  });
});

afterEach(cleanup);

describe("SubmissionDetail", () => {
  it("shows loading spinner when loading", () => {
    mockUseAdminFetch.mockReturnValue({
      data: null,
      loading: true,
      error: null,
      refetch: mockRefetch,
    });
    render(<SubmissionDetail id="1" />);
    const spinner = document.querySelector(".animate-spin");
    expect(spinner).toBeInstanceOf(HTMLElement);
    // Spinner must be visible (not display:none) — guards against a regression
    // that renders the loading state but hides it accidentally.
    const styles = window.getComputedStyle(spinner as HTMLElement);
    expect(styles.display).not.toBe("none");
    expect(styles.visibility).not.toBe("hidden");
  });

  it("shows error message on error", () => {
    mockUseAdminFetch.mockReturnValue({
      data: null,
      loading: false,
      error: "Something went wrong",
      refetch: mockRefetch,
    });
    render(<SubmissionDetail id="1" />);
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
  });

  it("renders submission info", () => {
    render(<SubmissionDetail id="1" />);
    expect(screen.getByText("t***@example.com")).toBeInTheDocument();
    expect(screen.getByText("Test")).toBeInTheDocument();
    expect(screen.getByText("completed")).toBeInTheDocument();
    expect(screen.getByText("Submission #1")).toBeInTheDocument();
  });

  it("renders answers", () => {
    render(<SubmissionDetail id="1" />);
    expect(screen.getByTestId("answer-q1")).toBeInTheDocument();
    expect(screen.getByText("Answers (1)")).toBeInTheDocument();
  });

  it("flag button calls PATCH with status flagged", async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValueOnce({ ok: true });
    render(<SubmissionDetail id="1" />);

    await user.click(screen.getByRole("button", { name: "Flag submission" }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/admin/submissions/1",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ status: "flagged" }),
        })
      );
    });
  });

  it("archive button calls PATCH with status archived", async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValueOnce({ ok: true });
    render(<SubmissionDetail id="1" />);

    await user.click(screen.getByRole("button", { name: "Archive submission" }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/admin/submissions/1",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ status: "archived" }),
        })
      );
    });
  });

  it("delete button opens confirm dialog", async () => {
    const user = userEvent.setup();
    render(<SubmissionDetail id="1" />);

    await user.click(screen.getByRole("button", { name: "Delete submission" }));
    expect(screen.getByTestId("confirm-dialog")).toBeInTheDocument();
  });

  it("CSRF token included in PATCH headers", async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValueOnce({ ok: true });
    render(<SubmissionDetail id="1" />);

    await user.click(screen.getByRole("button", { name: "Flag submission" }));

    await waitFor(() => {
      const call = mockFetch.mock.calls[0];
      expect(call[1].headers["x-csrf-token"]).toBe("test-token");
    });
  });

  it("renders duration when present", () => {
    render(<SubmissionDetail id="1" />);
    expect(screen.getByText("5 min 0 sec")).toBeInTheDocument();
  });

  it("shows Not Scored when scoring is null", () => {
    render(<SubmissionDetail id="1" />);
    expect(screen.getByText("Not Scored")).toBeInTheDocument();
    expect(screen.getByText("No scoring data available for this submission.")).toBeInTheDocument();
  });

  it("shows scoring result when present", () => {
    mockUseAdminFetch.mockReturnValue({
      data: {
        ...submissionData,
        scoring: {
          primary_archetype: "Spark Seeker",
          percentages: { "Spark Seeker": 15.2, "Romantic Idealist": 12.1 },
          raw_scores: { "Spark Seeker": 22.5, "Romantic Idealist": 20.1 },
          engine_version: "v3",
          scored_at: "2025-01-01T10:05:00Z",
          v5_primary_archetype: null,
          v5_percentages: null,
          v5_raw_scores: null,
        },
      },
      loading: false,
      error: null,
      refetch: mockRefetch,
    });
    render(<SubmissionDetail id="1" />);
    expect(screen.getByText(/Scoring Result \(V4/)).toBeInTheDocument();
    expect(screen.getByText("Spark Seeker")).toBeInTheDocument();
    expect(screen.getByText(/v3/)).toBeInTheDocument();
    expect(screen.getByTestId("bar-chart")).toBeInTheDocument();
  });
});
