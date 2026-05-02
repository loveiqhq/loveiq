// @vitest-environment jsdom
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import WaitlistPage from "@/components/waitlist/WaitlistPage";

vi.mock("next/image", () => ({
  default: ({
    src,
    alt,
    width,
    height,
    className,
  }: {
    src: string;
    alt: string;
    width: number;
    height: number;
    className?: string;
  }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} width={width} height={height} className={className} />
  ),
}));

const mockTrackWaitlistSignup = vi.fn();
const mockTrackGoogleAdsWaitlistConversion = vi.fn();
vi.mock("@/lib/analytics", () => ({
  trackWaitlistSignup: (...args: unknown[]) => mockTrackWaitlistSignup(...args),
  trackGoogleAdsWaitlistConversion: (...args: unknown[]) =>
    mockTrackGoogleAdsWaitlistConversion(...args),
}));

let mockFetch: ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockTrackWaitlistSignup.mockClear();
  mockTrackGoogleAdsWaitlistConversion.mockClear();
  document.cookie = "__csrf=test-token";
  mockFetch = vi.fn();
  globalThis.fetch = mockFetch;
});

afterEach(cleanup);

describe("WaitlistPage", () => {
  it("renders email input with placeholder", () => {
    render(<WaitlistPage />);
    expect(screen.getByPlaceholderText("name@email.com")).toBeInTheDocument();
  });

  it("renders Join waitlist button", () => {
    render(<WaitlistPage />);
    expect(screen.getByRole("button", { name: /join waitlist/i })).toBeInTheDocument();
  });

  it("empty submit shows validation error", async () => {
    const user = userEvent.setup();
    render(<WaitlistPage />);
    await user.click(screen.getByRole("button", { name: /join waitlist/i }));
    expect(await screen.findByText("Please enter a valid email.")).toBeInTheDocument();
  });

  it("invalid email (no @) shows validation error", async () => {
    const user = userEvent.setup();
    render(<WaitlistPage />);
    await user.type(screen.getByPlaceholderText("name@email.com"), "notanemail");
    await user.click(screen.getByRole("button", { name: /join waitlist/i }));
    expect(await screen.findByText("Please enter a valid email.")).toBeInTheDocument();
  });

  it("valid email submit shows Submitting... loading state", async () => {
    mockFetch.mockReturnValue(new Promise(() => {}));
    const user = userEvent.setup();
    render(<WaitlistPage />);
    await user.type(screen.getByPlaceholderText("name@email.com"), "test@example.com");
    await user.click(screen.getByRole("button", { name: /join waitlist/i }));
    expect(await screen.findByRole("button", { name: /submitting/i })).toBeInTheDocument();
  });

  it("successful API response shows You're In! heading", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    } as Response);
    const user = userEvent.setup();
    render(<WaitlistPage />);
    await user.type(screen.getByPlaceholderText("name@email.com"), "test@example.com");
    await user.click(screen.getByRole("button", { name: /join waitlist/i }));
    expect(await screen.findByText("You're In!")).toBeInTheDocument();
  });

  it("successful API response calls trackWaitlistSignup", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    } as Response);
    const user = userEvent.setup();
    render(<WaitlistPage />);
    await user.type(screen.getByPlaceholderText("name@email.com"), "test@example.com");
    await user.click(screen.getByRole("button", { name: /join waitlist/i }));
    await screen.findByText("You're In!");
    expect(mockTrackWaitlistSignup).toHaveBeenCalledWith("waitlist_page");
  });

  it("successful API response fires Google Ads conversion tracking", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    } as Response);
    const user = userEvent.setup();
    render(<WaitlistPage />);
    await user.type(screen.getByPlaceholderText("name@email.com"), "test@example.com");
    await user.click(screen.getByRole("button", { name: /join waitlist/i }));
    await screen.findByText("You're In!");
    expect(mockTrackGoogleAdsWaitlistConversion).toHaveBeenCalledTimes(1);
  });

  it("duplicate waitlist responses show success without firing conversion tracking", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true, already: true }),
    } as Response);
    const user = userEvent.setup();
    render(<WaitlistPage />);
    await user.type(screen.getByPlaceholderText("name@email.com"), "test@example.com");
    await user.click(screen.getByRole("button", { name: /join waitlist/i }));
    await screen.findByText("You're In!");
    expect(mockTrackWaitlistSignup).not.toHaveBeenCalled();
    expect(mockTrackGoogleAdsWaitlistConversion).not.toHaveBeenCalled();
  });

  it("API error response shows error message from body", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: "Email already registered." }),
    } as Response);
    const user = userEvent.setup();
    render(<WaitlistPage />);
    await user.type(screen.getByPlaceholderText("name@email.com"), "test@example.com");
    await user.click(screen.getByRole("button", { name: /join waitlist/i }));
    expect(await screen.findByText("Email already registered.")).toBeInTheDocument();
  });

  it("network error shows error message", async () => {
    mockFetch.mockRejectedValue(new Error("Network error"));
    const user = userEvent.setup();
    render(<WaitlistPage />);
    await user.type(screen.getByPlaceholderText("name@email.com"), "test@example.com");
    await user.click(screen.getByRole("button", { name: /join waitlist/i }));
    expect(await screen.findByText("Network error")).toBeInTheDocument();
  });

  it("FAQ item: click question opens answer (aria-expanded true)", async () => {
    const user = userEvent.setup();
    render(<WaitlistPage />);
    const button = screen.getByRole("button", { name: /what is loveiq early access/i });
    expect(button).toHaveAttribute("aria-expanded", "false");
    await user.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
  });

  it("FAQ item: click again closes answer (aria-expanded false)", async () => {
    const user = userEvent.setup();
    render(<WaitlistPage />);
    const button = screen.getByRole("button", { name: /what is loveiq early access/i });
    await user.click(button);
    await user.click(button);
    expect(button).toHaveAttribute("aria-expanded", "false");
  });

  it("honeypot field is aria-hidden and has tabIndex -1", () => {
    render(<WaitlistPage />);
    const honeypot = document.querySelector('input[name="website"]');
    expect(honeypot).not.toBeNull();
    expect(honeypot).toHaveAttribute("aria-hidden", "true");
    expect(honeypot).toHaveAttribute("tabindex", "-1");
  });
});
