// @vitest-environment jsdom
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockRouterPush = vi.fn();
const mockUseSearchParams = vi.fn(() => new URLSearchParams());
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockRouterPush }),
  useSearchParams: () => mockUseSearchParams(),
}));

vi.mock("@/lib/csrf-client", () => ({
  getCsrfToken: () => "test-csrf-token",
}));

import StagingLoginForm from "@features/staging/ui/StagingLoginForm";

let mockFetch: ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockFetch = vi.fn();
  globalThis.fetch = mockFetch;
  mockRouterPush.mockClear();
  mockUseSearchParams.mockReset();
  mockUseSearchParams.mockReturnValue(new URLSearchParams());
});

afterEach(cleanup);

describe("StagingLoginForm", () => {
  it("renders password input and submit button", () => {
    render(<StagingLoginForm />);
    expect(screen.getByPlaceholderText(/enter staging password/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /enter staging site/i })).toBeInTheDocument();
  });

  it("renders LoveIQ branding and staging label", () => {
    render(<StagingLoginForm />);
    expect(screen.getByLabelText("LoveIQ")).toBeInTheDocument();
    expect(screen.getByText("Staging")).toBeInTheDocument();
    expect(screen.getByText(/developer access only/i)).toBeInTheDocument();
  });

  it("navigates to home on successful login", async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValueOnce({ ok: true });

    render(<StagingLoginForm />);
    await user.type(screen.getByPlaceholderText(/enter staging password/i), "correct");
    await user.click(screen.getByRole("button", { name: /enter staging site/i }));

    await waitFor(() => {
      expect(mockRouterPush).toHaveBeenCalledWith("/");
    });
  });

  it("navigates back to the requested path after successful login", async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValueOnce({ ok: true });
    mockUseSearchParams.mockReturnValue(
      new URLSearchParams(
        "next=%2Fcheckout%2Freturn%3Fplan%3Dfull_report%26session_id%3Dcs_test_123"
      )
    );

    render(<StagingLoginForm />);
    await user.type(screen.getByPlaceholderText(/enter staging password/i), "correct");
    await user.click(screen.getByRole("button", { name: /enter staging site/i }));

    await waitFor(() => {
      expect(mockRouterPush).toHaveBeenCalledWith(
        "/checkout/return?plan=full_report&session_id=cs_test_123"
      );
    });
  });

  it("shows error on incorrect password", async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValueOnce({ ok: false, status: 401 });

    render(<StagingLoginForm />);
    await user.type(screen.getByPlaceholderText(/enter staging password/i), "wrong");
    await user.click(screen.getByRole("button", { name: /enter staging site/i }));

    expect(await screen.findByText("Incorrect password")).toBeInTheDocument();
  });

  it("shows generic error on network failure", async () => {
    const user = userEvent.setup();
    mockFetch.mockRejectedValueOnce(new Error("Network error"));

    render(<StagingLoginForm />);
    await user.type(screen.getByPlaceholderText(/enter staging password/i), "test");
    await user.click(screen.getByRole("button", { name: /enter staging site/i }));

    expect(await screen.findByText(/something went wrong/i)).toBeInTheDocument();
  });

  it("shows loading state during submission", async () => {
    const user = userEvent.setup();
    // Never resolve to keep loading state
    mockFetch.mockReturnValueOnce(new Promise(() => {}));

    render(<StagingLoginForm />);
    await user.type(screen.getByPlaceholderText(/enter staging password/i), "test");
    await user.click(screen.getByRole("button", { name: /enter staging site/i }));

    expect(screen.getByRole("button", { name: /verifying/i })).toBeDisabled();
  });

  it("sends password in POST body", async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValueOnce({ ok: true });

    render(<StagingLoginForm />);
    await user.type(screen.getByPlaceholderText(/enter staging password/i), "secret123");
    await user.click(screen.getByRole("button", { name: /enter staging site/i }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith("/api/staging-login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": "test-csrf-token",
        },
        body: JSON.stringify({ password: "secret123" }),
      });
    });
  });
});
