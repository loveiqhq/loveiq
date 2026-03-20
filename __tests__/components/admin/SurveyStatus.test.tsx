// @vitest-environment jsdom
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockRefetch = vi.fn();
const mockUseAdminFetch = vi.fn();

vi.mock("@/components/admin/hooks/useAdminFetch", () => ({
  useAdminFetch: (...args: unknown[]) => mockUseAdminFetch(...args),
}));

vi.mock("@/components/admin/ConfirmDialog", () => ({
  default: (props: {
    open: boolean;
    title: string;
    confirmLabel: string;
    onConfirm: () => void;
    onCancel: () => void;
  }) =>
    props.open ? (
      <div data-testid="confirm-dialog">
        <span>{props.title}</span>
        <button onClick={props.onConfirm}>{props.confirmLabel}</button>
        <button onClick={props.onCancel}>Cancel</button>
      </div>
    ) : null,
}));

import SurveyStatus from "@/components/admin/SurveyStatus";

beforeEach(() => {
  globalThis.fetch = vi.fn();
  document.cookie = "__csrf=test-token";
  mockRefetch.mockClear();
});

afterEach(cleanup);

describe("SurveyStatus", () => {
  it("shows loading spinner when loading", () => {
    mockUseAdminFetch.mockReturnValue({
      data: null,
      loading: true,
      error: null,
      refetch: mockRefetch,
    });
    render(<SurveyStatus />);
    expect(document.querySelector(".animate-spin")).toBeTruthy();
  });

  it("shows error on failure", () => {
    mockUseAdminFetch.mockReturnValue({
      data: null,
      loading: false,
      error: "Failed to load",
      refetch: mockRefetch,
    });
    render(<SurveyStatus />);
    expect(screen.getByText("Failed to load")).toBeInTheDocument();
  });

  it("shows Active status when active=true", () => {
    mockUseAdminFetch.mockReturnValue({
      data: { active: true, id: 1 },
      loading: false,
      error: null,
      refetch: mockRefetch,
    });
    render(<SurveyStatus />);
    expect(screen.getByText("Survey is Active")).toBeInTheDocument();
    expect(screen.getByText(/Users can access/)).toBeInTheDocument();
  });

  it("shows Closed status when active=false", () => {
    mockUseAdminFetch.mockReturnValue({
      data: { active: false, id: 1 },
      loading: false,
      error: null,
      refetch: mockRefetch,
    });
    render(<SurveyStatus />);
    expect(screen.getByText("Survey is Closed")).toBeInTheDocument();
    expect(screen.getByText(/not accepting/)).toBeInTheDocument();
  });

  it("shows Close Survey button when active", () => {
    mockUseAdminFetch.mockReturnValue({
      data: { active: true, id: 1 },
      loading: false,
      error: null,
      refetch: mockRefetch,
    });
    render(<SurveyStatus />);
    expect(screen.getByRole("button", { name: "Close Survey" })).toBeInTheDocument();
  });

  it("shows Reopen Survey button when closed", () => {
    mockUseAdminFetch.mockReturnValue({
      data: { active: false, id: 1 },
      loading: false,
      error: null,
      refetch: mockRefetch,
    });
    render(<SurveyStatus />);
    expect(screen.getByRole("button", { name: "Reopen Survey" })).toBeInTheDocument();
  });

  it("Close Survey button opens password prompt, entering password opens confirm dialog", async () => {
    const user = userEvent.setup();
    mockUseAdminFetch.mockReturnValue({
      data: { active: true, id: 1 },
      loading: false,
      error: null,
      refetch: mockRefetch,
    });
    render(<SurveyStatus />);

    // Click Close Survey — should show password dialog, not confirm dialog
    await user.click(screen.getByRole("button", { name: "Close Survey" }));
    expect(screen.getByText("Authorization Required")).toBeInTheDocument();
    expect(screen.queryByTestId("confirm-dialog")).not.toBeInTheDocument();

    // Empty password shows error
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByText("Incorrect password.")).toBeInTheDocument();

    // Any non-empty password proceeds to confirm dialog (server validates)
    await user.type(screen.getByPlaceholderText("Enter password"), "somepassword");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByTestId("confirm-dialog")).toBeInTheDocument();
  });

  it("Reopen Survey button opens confirm dialog directly (no password)", async () => {
    const user = userEvent.setup();
    mockUseAdminFetch.mockReturnValue({
      data: { active: false, id: 1 },
      loading: false,
      error: null,
      refetch: mockRefetch,
    });
    render(<SurveyStatus />);

    await user.click(screen.getByRole("button", { name: "Reopen Survey" }));
    expect(screen.getByTestId("confirm-dialog")).toBeInTheDocument();
  });
});
