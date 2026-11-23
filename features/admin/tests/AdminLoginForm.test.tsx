// @vitest-environment jsdom
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

let search = "";
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(search),
}));

vi.mock("@shared/http/csrf-client", () => ({
  getCsrfToken: () => "test-csrf-token",
}));

import AdminLoginForm from "@features/admin/ui/AdminLoginForm";

let mockFetch: ReturnType<typeof vi.fn>;
const assign = vi.fn();

beforeEach(() => {
  mockFetch = vi.fn();
  globalThis.fetch = mockFetch;
  assign.mockReset();
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...window.location, assign },
  });
});

afterEach(() => {
  cleanup();
  search = "";
});

const answer = (status: number, body: unknown) =>
  ({ ok: status < 400, status, json: async () => body }) as Response;

describe("AdminLoginForm: the team password (22 Nov 2026)", () => {
  it("asks for the password only, as staging's /login does", () => {
    render(<AdminLoginForm />);
    const input = screen.getByLabelText("Password");
    expect(input).toHaveAttribute("type", "password");
    expect(input).toHaveAttribute("required");
    expect(input).toHaveAttribute("autocomplete", "current-password");
    expect(screen.queryByLabelText(/email/i)).toBeNull();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.queryByText(/magic link/i)).toBeNull();
  });

  it("signs in and opens the page the server named, with the page it was for", async () => {
    search = "next=%2Fadmin%2Fap%2Fassessment-a%3Fperiod%3D7d";
    mockFetch.mockResolvedValue(
      answer(200, { success: true, next: "/admin/ap/assessment-a?period=7d" })
    );
    const user = userEvent.setup();
    render(<AdminLoginForm />);
    await user.type(screen.getByLabelText("Password"), "the-team-password");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    await vi.waitFor(() => expect(assign).toHaveBeenCalledWith("/admin/ap/assessment-a?period=7d"));
    const [url, init] = mockFetch.mock.calls[0]!;
    expect(url).toBe("/api/admin/login");
    expect(init.headers["x-csrf-token"]).toBe("test-csrf-token");
    expect(JSON.parse(String(init.body))).toEqual({
      password: "the-team-password",
      next: "/admin/ap/assessment-a?period=7d",
    });
  });

  it("says so when the password is wrong, and stays on the form", async () => {
    mockFetch.mockResolvedValue(answer(401, { error: "Incorrect password." }));
    const user = userEvent.setup();
    render(<AdminLoginForm />);
    await user.type(screen.getByLabelText("Password"), "wrong");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Incorrect password.");
    expect(assign).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeEnabled();
  });

  it("passes the rate limit's words on", async () => {
    mockFetch.mockResolvedValue(answer(429, { error: "Please try again later." }));
    const user = userEvent.setup();
    render(<AdminLoginForm />);
    await user.type(screen.getByLabelText("Password"), "x");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Please try again later.");
  });

  it("shows a plain error when the request fails", async () => {
    mockFetch.mockRejectedValue(new Error("offline"));
    const user = userEvent.setup();
    render(<AdminLoginForm />);
    await user.type(screen.getByLabelText("Password"), "x");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Something went wrong. Please try again."
    );
  });

  it("says why when the idle timeout signed the admin out", () => {
    search = "error=idle_timeout";
    render(<AdminLoginForm />);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "You were signed out after 30 minutes without activity. Sign in again below."
    );
  });

  it("points a spent operator link back to the password", () => {
    search = "error=auth_failed";
    render(<AdminLoginForm />);
    expect(screen.getByRole("alert")).toHaveTextContent(/Sign in with the password below/);
  });
});
