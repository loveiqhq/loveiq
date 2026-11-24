// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@features/analytics/client", () => ({
  trackPaygateExitViewed: vi.fn(),
  trackPaygateExitLeave: vi.fn(),
  trackPaygateExitReason: vi.fn(),
  trackPaygateExitNote: vi.fn(),
  trackInitialGateCta: vi.fn(),
  trackBeginCheckout: vi.fn(),
  getGaMeasurementContext: () => ({ clientId: null, sessionId: null, consent: false }),
}));
vi.mock("posthog-js", () => ({ default: { capture: vi.fn() } }));
vi.mock("@shared/http/csrf-client", () => ({ getCsrfToken: () => "csrf-token" }));
vi.mock("@shared/ui/trustpilot/config", () => ({
  isTrustpilotEnabled: () => false,
  getTrustpilotConfig: () => ({ score: null, reviewCount: null, profileUrl: null }),
  TRUSTPILOT_FALLBACK_URL: "https://www.trustpilot.com/review/loveiq.org",
}));

import PreUnlockExit from "@features/report/ui/gate/exit/PreUnlockExit";
import { trackInitialGateCta } from "@features/analytics/client";
import type { InitialUnlockGatePayload } from "@features/report/logic/initialUnlockGate";

const GATE: InitialUnlockGatePayload = {
  gate: "initial_unlock",
  priceCents: 199,
  currency: "EUR",
  creditCents: 1000,
  guaranteeDays: 14,
  reportToken: "rpt_abcdefghij0123456789",
  submissionId: 55,
  viewMode: "owner",
};

const watchers: Array<{ onclose: (() => void) | null; destroyed: boolean }> = [];
class FakeCloseWatcher {
  onclose: (() => void) | null = null;
  destroyed = false;
  constructor() {
    watchers.push(this);
  }
  destroy() {
    this.destroyed = true;
  }
}

beforeEach(() => {
  watchers.length = 0;
  vi.stubGlobal("scrollTo", vi.fn());
  (window as unknown as { CloseWatcher?: unknown }).CloseWatcher = FakeCloseWatcher;
});
afterEach(() => {
  cleanup();
  delete (window as unknown as { CloseWatcher?: unknown }).CloseWatcher;
  vi.unstubAllGlobals();
});

/**
 * The EUR 1.99 page's exit page (`?leave=pre`) on a phone. Android's back is a close request:
 * answered with the page's own way back to the gate (closeExit, a script's history.back()), it
 * finds the gate even for a reader who met it without a tap, whose entries Chrome's back button
 * would skip on the way to /survey.
 */
describe("PreUnlockExit — the phone's Back on the EUR 1.99 page's exit page", () => {
  it("answers a close request with its own way back to the gate, and adds no entry", () => {
    const onBack = vi.fn();
    const before = window.history.length;
    render(
      <PreUnlockExit
        gate={GATE}
        reportToken={GATE.reportToken}
        reportSessionId={null}
        onBack={onBack}
      />
    );
    expect(window.history.length).toBe(before);
    expect(watchers).toHaveLength(1);

    act(() => watchers[0]!.onclose?.());
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});

// Fatih, 24 Nov 2026: the price test's Choose your price half has no exit-page design, so its
// exit page keeps everything but the EUR 1.99: its price and both buttons say "Choose your
// price", and both go back to the gate's picker.
describe("PreUnlockExit — the price test's Choose your price half", () => {
  const renderChoose = (onBack = vi.fn()) => {
    render(
      <PreUnlockExit
        gate={{ ...GATE, priceArm: "choose" }}
        reportToken={GATE.reportToken}
        reportSessionId={null}
        onBack={onBack}
      />
    );
    return onBack;
  };
  const text = () => (document.body.textContent ?? "").replace(/\s+/g, " ");

  it("names no EUR 1.99 anywhere: its price and both buttons say Choose your price", () => {
    renderChoose();
    expect(text()).not.toContain("1.99");
    expect(screen.getAllByRole("button", { name: /^Choose your price/ })).toHaveLength(2);
    expect(text()).toContain("One-time payment, no subscription");
    expect(text()).toContain("I wasn’t sure what I’d get");
  });

  it("goes back to the gate's picker from either button, counted as pressed, with no checkout", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const listener = vi.fn();
    window.addEventListener("iug:pick-price", listener);
    const raf = vi.fn((cb: FrameRequestCallback) => {
      cb(0);
      return 1;
    });
    vi.stubGlobal("requestAnimationFrame", raf);
    const onBack = renderChoose();
    const [card, sticky] = screen.getAllByRole("button", { name: /^Choose your price/ });
    fireEvent.click(card!);
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(trackInitialGateCta).toHaveBeenCalledWith({ place: "exit_card" });
    fireEvent.click(sticky!);
    expect(trackInitialGateCta).toHaveBeenCalledWith({ place: "exit_sticky" });
    expect(fetchMock).not.toHaveBeenCalled();
    // Once the page goes (the gate's back on screen), the gate is asked to show its picker.
    cleanup();
    expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener("iug:pick-price", listener);
  });

  it("keeps today's page's EUR 1.99 for the other half", () => {
    render(
      <PreUnlockExit
        gate={{ ...GATE, priceArm: "fixed" }}
        reportToken={GATE.reportToken}
        reportSessionId={null}
        onBack={vi.fn()}
      />
    );
    expect(text()).toContain("€1.99");
    expect(screen.queryByRole("button", { name: /^Choose your price/ })).toBeNull();
  });
});
