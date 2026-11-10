// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("posthog-js", () => ({ default: { capture: vi.fn() } }));
vi.mock("@shared/http/csrf-client", () => ({ getCsrfToken: () => "csrf-token" }));
vi.mock("@features/analytics/client", () => ({
  getGaMeasurementContext: () => ({ clientId: null, sessionId: null, consent: false }),
  trackBeginCheckout: vi.fn(),
  trackInitialGateCta: vi.fn(),
}));

import { useInitialUnlockCheckout } from "@features/report/ui/gate/useInitialUnlockCheckout";

/**
 * The EUR 1.99 page's hand-off to Stripe. While the page is on screen its Back catch owns a
 * duplicate, same-URL history entry (useGateBack). Stripe must REPLACE that entry, as the
 * pricing modal's hand-off does: pushed on top, it left the duplicate behind, and Back from
 * Stripe walked through an extra copy of the report.
 */
const assign = vi.fn();
const replace = vi.fn();
let originalLocation: Location;

beforeEach(() => {
  vi.clearAllMocks();
  originalLocation = window.location;
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...originalLocation, assign, replace, reload: vi.fn() },
  });
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ enabled: true, url: "https://checkout.stripe.com/c/pay/cs_gate" }),
  } as Response);
});

afterEach(() => {
  Object.defineProperty(window, "location", { configurable: true, value: originalLocation });
});

async function startFromCard() {
  const { result } = renderHook(() =>
    useInitialUnlockCheckout({ priceCents: 199, reportSessionId: null, reportToken: "rpt_x" })
  );
  await act(async () => {
    await result.current.start("card");
  });
}

describe("useInitialUnlockCheckout: the hand-off to Stripe", () => {
  it("replaces the Back catch's own history entry instead of stacking Stripe on it", async () => {
    window.history.pushState({ __loveiqOverlay: true }, "");
    try {
      await startFromCard();
    } finally {
      window.history.replaceState(null, "");
    }
    expect(replace).toHaveBeenCalledWith("https://checkout.stripe.com/c/pay/cs_gate");
    expect(assign).not.toHaveBeenCalled();
  });

  it("pushes as it always has when no overlay owns the entry", async () => {
    await startFromCard();
    expect(assign).toHaveBeenCalledWith("https://checkout.stripe.com/c/pay/cs_gate");
    expect(replace).not.toHaveBeenCalled();
  });
});
