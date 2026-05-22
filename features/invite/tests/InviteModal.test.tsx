// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import InviteModal from "@features/invite/ui/InviteModal";

const trackSurveyInvite = vi.fn();

vi.mock("@shared/http/csrf-client", () => ({ getCsrfToken: () => "test-token" }));
vi.mock("@features/analytics/client", () => ({
  trackSurveyInvite: (...args: unknown[]) => trackSurveyInvite(...args),
  trackInviteLinkCopied: vi.fn(),
  trackInviteModalDismissed: vi.fn(),
  // Tests assume analytics-consent is granted so the /api/invite-tracking
  // fetch fires; in real prod the gate is honoured.
  hasCookieYesConsent: () => true,
}));

describe("InviteModal", () => {
  const rafTimers = new Map<number, ReturnType<typeof setTimeout>>();
  let rafId = 0;

  beforeEach(() => {
    vi.useFakeTimers();
    trackSurveyInvite.mockReset();

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

    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
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

  it("hides the email form by default and reveals it when the Email tile is clicked", () => {
    render(
      <InviteModal open onClose={vi.fn()} referrerEmail="alice@example.com" referrerName="Alice" />
    );

    act(() => {
      vi.runOnlyPendingTimers();
    });

    const wrapper = document.getElementById("invite-email-form");
    expect(wrapper).toHaveAttribute("aria-hidden", "true");

    fireEvent.click(screen.getByRole("button", { name: /send invite by email/i }));

    expect(document.getElementById("invite-email-form")).toHaveAttribute("aria-hidden", "false");
  });

  it("shows the success state after a successful invite submission", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <InviteModal open onClose={vi.fn()} referrerEmail="alice@example.com" referrerName="Alice" />
    );

    act(() => {
      vi.runOnlyPendingTimers();
    });

    fireEvent.click(screen.getByRole("button", { name: /send invite by email/i }));

    fireEvent.change(screen.getByLabelText(/friend.?s email/i), {
      target: { value: "friend@example.com" },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^send invite$/i }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByRole("heading", { name: /referral sent!/i })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/invite",
      expect.objectContaining({
        method: "POST",
      })
    );
  });

  it("tracks instagram share with an allowed invite-tracking method", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <InviteModal open onClose={vi.fn()} referrerEmail="alice@example.com" referrerName="Alice" />
    );

    act(() => {
      vi.runOnlyPendingTimers();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /share via instagram/i }));
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/invite-tracking",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"method":"instagram"'),
      })
    );
    expect(trackSurveyInvite).toHaveBeenCalledWith("instagram");
  });
});
