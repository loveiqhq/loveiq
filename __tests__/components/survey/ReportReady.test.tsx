// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ReportReady from "@/components/survey/ReportReady";

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("next/navigation", () => ({ usePathname: () => "/survey" }));
vi.mock("@/lib/csrf-client", () => ({ getCsrfToken: () => "test-token" }));
vi.mock("@features/analytics/client", () => ({
  trackSurveyInvite: vi.fn(),
  trackShare: vi.fn(),
}));

describe("ReportReady", () => {
  const rafTimers = new Map<number, ReturnType<typeof setTimeout>>();
  let rafId = 0;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      rafId += 1;
      const id = rafId;
      const timer = setTimeout(() => {
        rafTimers.delete(id);
        callback(16);
      }, 0);
      rafTimers.set(id, timer);
      return id;
    });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => {
      const timer = rafTimers.get(id);
      if (timer !== undefined) {
        clearTimeout(timer);
        rafTimers.delete(id);
      }
    });
  });

  afterEach(() => {
    rafTimers.forEach((timer) => clearTimeout(timer));
    rafTimers.clear();
    rafId = 0;
    vi.useRealTimers();
    vi.unstubAllGlobals();
    cleanup();
  });

  it("renders the personalized heading and email instructions", () => {
    render(<ReportReady name="Alice" email="alice@example.com" onContinue={vi.fn()} />);
    act(() => {
      vi.runOnlyPendingTimers();
    });

    expect(
      screen.getByRole("heading", { name: /alice, your report is ready/i })
    ).toBeInTheDocument();
    expect(screen.getByText(/check your inbox for/i)).toBeInTheDocument();
    expect(screen.getByText("alice@example.com")).toBeInTheDocument();
  });

  it("falls back to generic copy when name and email are blank", () => {
    render(<ReportReady name="   " email="   " onContinue={vi.fn()} />);
    act(() => {
      vi.runOnlyPendingTimers();
    });

    expect(screen.getByRole("heading", { name: /your report is ready/i })).toBeInTheDocument();
    expect(screen.getByText(/your email/i)).toBeInTheDocument();
  });

  it("waits for the exit animation before calling onContinue", () => {
    const onContinue = vi.fn();

    render(<ReportReady name="Alice" email="alice@example.com" onContinue={onContinue} />);
    act(() => {
      vi.runOnlyPendingTimers();
    });

    fireEvent.click(screen.getByRole("button", { name: /view your free report/i }));

    act(() => {
      vi.advanceTimersByTime(599);
    });
    expect(onContinue).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it("opens the invite modal from the secondary action and pre-fills sender name", () => {
    render(<ReportReady name="Alice" email="alice@example.com" onContinue={vi.fn()} />);
    act(() => {
      vi.runOnlyPendingTimers();
    });

    fireEvent.click(screen.getByRole("button", { name: /refer a friend/i }));

    // Flush the InviteModal's RAF (isVisible → true)
    act(() => {
      vi.runOnlyPendingTimers();
    });

    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByDisplayValue("Alice")).toBeInTheDocument();
  });

  it("shows validation when submitting an invalid invite email from the real modal", () => {
    render(<ReportReady name="Alice" email="alice@example.com" onContinue={vi.fn()} />);
    act(() => {
      vi.runOnlyPendingTimers();
    });

    fireEvent.click(screen.getByRole("button", { name: /refer a friend/i }));
    act(() => {
      vi.runOnlyPendingTimers();
    });

    // Expand the email form first — it is collapsed by default
    fireEvent.click(screen.getByRole("button", { name: /send invite by email/i }));
    fireEvent.click(screen.getByRole("button", { name: /^send invite$/i }));

    expect(screen.getByText(/please enter a valid email address/i)).toBeInTheDocument();
  });
});
