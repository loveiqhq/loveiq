// @vitest-environment jsdom
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/csrf-client", () => ({
  getCsrfToken: () => "test-csrf-token",
}));

import AdminLoginForm from "@features/admin/ui/AdminLoginForm";

let mockFetch: ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockFetch = vi.fn();
  globalThis.fetch = mockFetch;
});

afterEach(cleanup);

describe("AdminLoginForm", () => {
  it("renders email input and submit button", () => {
    render(<AdminLoginForm />);
    expect(screen.getByPlaceholderText(/enter your email/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /send magic link/i })).toBeInTheDocument();
  });

  it("shows success state after sending magic link", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        message: "If your email is registered, check your inbox.",
      }),
    } as unknown as Response);
    const user = userEvent.setup();
    render(<AdminLoginForm />);

    await user.type(screen.getByPlaceholderText(/enter your email/i), "admin@test.com");
    await user.click(screen.getByRole("button", { name: /send magic link/i }));

    expect(await screen.findByText(/check your email/i)).toBeInTheDocument();
    expect(screen.getByText("admin@test.com")).toBeInTheDocument();
  });

  it("shows error on failed request", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      json: async () => ({ error: "Unable to process request." }),
    } as unknown as Response);
    const user = userEvent.setup();
    render(<AdminLoginForm />);

    await user.type(screen.getByPlaceholderText(/enter your email/i), "admin@test.com");
    await user.click(screen.getByRole("button", { name: /send magic link/i }));

    expect(await screen.findByText("Unable to process request.")).toBeInTheDocument();
  });

  it("shows generic error on network failure", async () => {
    mockFetch.mockRejectedValue(new Error("Network failure"));
    const user = userEvent.setup();
    render(<AdminLoginForm />);

    await user.type(screen.getByPlaceholderText(/enter your email/i), "admin@test.com");
    await user.click(screen.getByRole("button", { name: /send magic link/i }));

    expect(await screen.findByText("Something went wrong. Please try again.")).toBeInTheDocument();
  });

  it("button shows Sending... during submission", async () => {
    mockFetch.mockReturnValue(new Promise(() => {}));
    const user = userEvent.setup();
    render(<AdminLoginForm />);

    await user.type(screen.getByPlaceholderText(/enter your email/i), "admin@test.com");
    await user.click(screen.getByRole("button", { name: /send magic link/i }));

    const btn = await screen.findByRole("button", { name: /sending/i });
    expect(btn).toBeDisabled();
  });

  it("sends CSRF token in request headers", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    } as unknown as Response);
    const user = userEvent.setup();
    render(<AdminLoginForm />);

    await user.type(screen.getByPlaceholderText(/enter your email/i), "admin@test.com");
    await user.click(screen.getByRole("button", { name: /send magic link/i }));

    await screen.findByText(/check your email/i);

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/admin/login",
      expect.objectContaining({
        headers: expect.objectContaining({
          "x-csrf-token": "test-csrf-token",
        }),
      })
    );
  });

  it("allows trying a different email after success", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    } as unknown as Response);
    const user = userEvent.setup();
    render(<AdminLoginForm />);

    await user.type(screen.getByPlaceholderText(/enter your email/i), "admin@test.com");
    await user.click(screen.getByRole("button", { name: /send magic link/i }));

    await screen.findByText(/check your email/i);
    await user.click(screen.getByText(/try a different email/i));

    expect(screen.getByPlaceholderText(/enter your email/i)).toBeInTheDocument();
  });
});
