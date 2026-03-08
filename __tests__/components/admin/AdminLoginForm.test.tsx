// @vitest-environment jsdom
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

const mockRouterPush = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockRouterPush }),
}));

import AdminLoginForm from "@/components/admin/AdminLoginForm";

let mockFetch: ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockRouterPush.mockClear();
  document.cookie = "__csrf=test-token";
  mockFetch = vi.fn();
  globalThis.fetch = mockFetch;
});

afterEach(cleanup);

describe("AdminLoginForm", () => {
  it("renders password input and submit button", () => {
    render(<AdminLoginForm />);
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /enter admin panel/i })).toBeInTheDocument();
  });

  it("successful login redirects to /admin", async () => {
    mockFetch.mockResolvedValue({ ok: true } as Response);
    const user = userEvent.setup();
    render(<AdminLoginForm />);

    await user.type(screen.getByLabelText(/password/i), "correct-password");
    await user.click(screen.getByRole("button", { name: /enter admin panel/i }));

    expect(await screen.findByRole("button", { name: /enter admin panel/i })).toBeInTheDocument();
    expect(mockRouterPush).toHaveBeenCalledWith("/admin");
  });

  it("incorrect password shows error message", async () => {
    mockFetch.mockResolvedValue({ ok: false } as Response);
    const user = userEvent.setup();
    render(<AdminLoginForm />);

    await user.type(screen.getByLabelText(/password/i), "wrong-password");
    await user.click(screen.getByRole("button", { name: /enter admin panel/i }));

    expect(await screen.findByText("Incorrect password")).toBeInTheDocument();
    expect(mockRouterPush).not.toHaveBeenCalled();
  });

  it("network error shows generic error message", async () => {
    mockFetch.mockRejectedValue(new Error("Network failure"));
    const user = userEvent.setup();
    render(<AdminLoginForm />);

    await user.type(screen.getByLabelText(/password/i), "any-password");
    await user.click(screen.getByRole("button", { name: /enter admin panel/i }));

    expect(await screen.findByText("Something went wrong. Please try again.")).toBeInTheDocument();
    expect(mockRouterPush).not.toHaveBeenCalled();
  });

  it("button is disabled and shows Verifying... during submission", async () => {
    // Fetch never resolves so the loading state persists
    mockFetch.mockReturnValue(new Promise(() => {}));
    const user = userEvent.setup();
    render(<AdminLoginForm />);

    await user.type(screen.getByLabelText(/password/i), "any-password");
    await user.click(screen.getByRole("button", { name: /enter admin panel/i }));

    const btn = await screen.findByRole("button", { name: /verifying/i });
    expect(btn).toBeDisabled();
  });

  it("sends CSRF token in request headers", async () => {
    mockFetch.mockResolvedValue({ ok: true } as Response);
    const user = userEvent.setup();
    render(<AdminLoginForm />);

    await user.type(screen.getByLabelText(/password/i), "any-password");
    await user.click(screen.getByRole("button", { name: /enter admin panel/i }));

    await screen.findByRole("button", { name: /enter admin panel/i });

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/admin/login",
      expect.objectContaining({
        headers: expect.objectContaining({
          "x-csrf-token": "test-token",
        }),
      })
    );
  });
});
