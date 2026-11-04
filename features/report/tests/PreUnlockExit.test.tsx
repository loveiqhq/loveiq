// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
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
