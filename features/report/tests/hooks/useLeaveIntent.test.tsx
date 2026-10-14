// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";

const shown = vi.fn();
const clicked = vi.fn();
const dismissed = vi.fn();
vi.mock("@features/analytics/client", () => ({
  trackLeaveOfferShown: (...args: unknown[]) => shown(...args),
  trackLeaveOfferClicked: (...args: unknown[]) => clicked(...args),
  trackLeaveOfferDismissed: (...args: unknown[]) => dismissed(...args),
}));

import { useLeaveIntent, type UseLeaveIntentArgs } from "@features/report/ui/hooks/useLeaveIntent";

const BASE: UseLeaveIntentArgs = {
  mode: "trigger",
  submissionId: 42,
  overlayOpen: false,
  plansOpen: false,
  popupArm: null,
};

/** The first paywall card, `top` px from the top of an 800px-tall window. */
function paywallCardAt(top: number) {
  document.body.querySelector(".rv4-premium")?.remove();
  const card = document.createElement("div");
  card.className = "rv4-premium";
  card.getBoundingClientRect = () => ({ top }) as DOMRect;
  document.body.appendChild(card);
}

const setVisibility = (state: "visible" | "hidden") => {
  Object.defineProperty(document, "visibilityState", { value: state, configurable: true });
  document.dispatchEvent(new Event("visibilitychange"));
};

const originalMatchMedia = window.matchMedia;
/** A wide window with a mouse: what `(hover: hover) and (pointer: fine)` and 700px see. */
const useMouse = () => {
  window.matchMedia = ((query: string) =>
    ({ matches: true, media: query }) as MediaQueryList) as typeof window.matchMedia;
};

const exitThroughTop = () =>
  document.dispatchEvent(new MouseEvent("mouseout", { clientY: -2, relatedTarget: null }));

const advance = (ms: number) => act(() => vi.advanceTimersByTime(ms));

function mount(args: Partial<UseLeaveIntentArgs> = {}) {
  return renderHook((props: UseLeaveIntentArgs) => useLeaveIntent(props), {
    initialProps: { ...BASE, ...args },
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-14T10:00:00.000Z"));
  shown.mockReset();
  clicked.mockReset();
  dismissed.mockReset();
  Object.defineProperty(window, "innerHeight", { value: 800, configurable: true });
  Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
  paywallCardAt(100);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  window.matchMedia = originalMatchMedia;
  document.body.innerHTML = "";
});

describe("useLeaveIntent: phones", () => {
  it("stays closed while the reader has not reached the paywall", () => {
    paywallCardAt(2000);
    const { result } = mount();
    advance(90_000);
    expect(result.current.open).toBe(false);
    expect(shown).not.toHaveBeenCalled();
  });

  it("opens after 30 seconds of nothing happening at the paywall", () => {
    const { result } = mount({ popupArm: "no_popup" });
    advance(29_000);
    expect(result.current.open).toBe(false);
    advance(2_000);
    expect(result.current.open).toBe(true);
    expect(result.current.trigger).toBe("idle");
    expect(shown).toHaveBeenCalledWith(
      expect.objectContaining({ variant: "founder_call", trigger: "idle", popup_arm: "no_popup" })
    );
  });

  it("arms when scrolling brings the paywall card up", () => {
    paywallCardAt(2000);
    const { result } = mount();
    advance(40_000);
    paywallCardAt(500);
    act(() => {
      window.dispatchEvent(new Event("scroll"));
    });
    advance(29_000);
    expect(result.current.open).toBe(false);
    advance(2_000);
    expect(result.current.open).toBe(true);
  });

  it("falls back to the first locked chapter where the report draws no card", () => {
    document.body.innerHTML = "";
    const locked = document.createElement("section");
    locked.className = "rv4-chapter is-locked";
    locked.getBoundingClientRect = () => ({ top: 200 }) as DOMRect;
    document.body.appendChild(locked);
    const { result } = mount();
    advance(31_000);
    expect(result.current.open).toBe(true);
  });

  it("starts the 30 seconds again whenever the reader does something", () => {
    const { result } = mount();
    advance(20_000);
    act(() => {
      window.dispatchEvent(new Event("touchstart"));
    });
    advance(20_000);
    expect(result.current.open).toBe(false);
    advance(11_000);
    expect(result.current.open).toBe(true);
  });

  it("does not count time the tab spent hidden", () => {
    const { result } = mount();
    act(() => setVisibility("hidden"));
    advance(120_000);
    expect(result.current.open).toBe(false);
    act(() => setVisibility("visible"));
    advance(29_000);
    expect(result.current.open).toBe(false);
    advance(2_000);
    expect(result.current.open).toBe(true);
  });

  it("waits while another window is open, and counts from when it closes", () => {
    const { result, rerender } = mount({ overlayOpen: true });
    advance(60_000);
    expect(result.current.open).toBe(false);
    rerender({ ...BASE, overlayOpen: false });
    advance(29_000);
    expect(result.current.open).toBe(false);
    advance(2_000);
    expect(result.current.open).toBe(true);
  });

  it("never opens over a dialog or the cookie banner", () => {
    const dialog = document.createElement("div");
    dialog.setAttribute("aria-modal", "true");
    document.body.appendChild(dialog);
    const { result } = mount();
    advance(60_000);
    expect(result.current.open).toBe(false);
    dialog.remove();
    document.documentElement.style.setProperty("--liq-consent-h", "140px");
    advance(60_000);
    expect(result.current.open).toBe(false);
    document.documentElement.style.removeProperty("--liq-consent-h");
  });

  it("opens shortly after the reader closes a plans window they opened", () => {
    const { result } = mount();
    advance(3_000);
    act(() => result.current.notifyPlansClosed());
    advance(799);
    expect(result.current.open).toBe(false);
    advance(2);
    expect(result.current.open).toBe(true);
    expect(result.current.trigger).toBe("plans_closed");
  });

  it("holds back for 30 seconds after the pay pop-up test's point, in either arm", () => {
    const { result } = mount();
    // openPlans() claims this key at the pop-up point, in both arms, on phones only.
    sessionStorage.setItem("loveiq-report-plans-offered:42", "1");
    advance(4_000);
    act(() => result.current.notifyPlansClosed());
    advance(1_000);
    expect(result.current.open).toBe(false);
    // The close counts as activity, so idle runs from second 4 and lands at 34,
    // after the window that began when the key was first seen (second 1).
    advance(28_000);
    expect(result.current.open).toBe(false);
    advance(3_000);
    expect(result.current.open).toBe(true);
    expect(result.current.trigger).toBe("idle");
  });

  it("is not held back by a pop-up point it saw long ago", () => {
    sessionStorage.setItem("loveiq-leave-offer-point:42", String(Date.now() - 60_000));
    sessionStorage.setItem("loveiq-report-plans-offered:42", "1");
    const { result } = mount();
    act(() => result.current.notifyPlansClosed());
    advance(900);
    expect(result.current.open).toBe(true);
  });
});

describe("useLeaveIntent: a mouse on a wide screen", () => {
  it("opens when the pointer leaves through the top", () => {
    useMouse();
    const { result } = mount();
    act(() => exitThroughTop());
    expect(result.current.open).toBe(true);
    expect(result.current.trigger).toBe("exit_intent");
  });

  it("ignores the pointer leaving before the paywall, or through the sides", () => {
    useMouse();
    paywallCardAt(2000);
    const { result } = mount();
    act(() => exitThroughTop());
    expect(result.current.open).toBe(false);
    paywallCardAt(100);
    act(() => {
      document.dispatchEvent(new MouseEvent("mouseout", { clientY: 300, relatedTarget: null }));
    });
    expect(result.current.open).toBe(false);
  });

  it("never opens on idle or on a plans window closing", () => {
    useMouse();
    const { result } = mount();
    act(() => result.current.notifyPlansClosed());
    advance(120_000);
    expect(result.current.open).toBe(false);
  });
});

describe("useLeaveIntent: once, and only when it can be remembered", () => {
  it("never shows again for the same submission", () => {
    const first = mount();
    advance(31_000);
    expect(first.result.current.open).toBe(true);
    act(() => first.result.current.dismiss("not_now"));
    first.unmount();
    expect(localStorage.getItem("loveiq-leave-offer:42")).not.toBeNull();

    const second = mount();
    advance(120_000);
    expect(second.result.current.open).toBe(false);
    expect(shown).toHaveBeenCalledTimes(1);
  });

  it("does not show when the browser refuses to remember it", () => {
    const refuse = () => {
      throw new Error("QuotaExceededError");
    };
    vi.stubGlobal("localStorage", { getItem: () => null, setItem: refuse } as unknown as Storage);
    vi.stubGlobal("sessionStorage", {
      getItem: () => null,
      setItem: refuse,
    } as unknown as Storage);
    const { result } = mount();
    advance(120_000);
    expect(result.current.open).toBe(false);
    expect(shown).not.toHaveBeenCalled();
  });

  it("does nothing when off", () => {
    const { result } = mount({ mode: "off" });
    advance(120_000);
    expect(result.current.open).toBe(false);
  });

  it("opens at once for the preview switch, marked forced, without a submission", () => {
    const { result } = mount({ mode: "show", submissionId: null });
    expect(result.current.open).toBe(true);
    expect(result.current.trigger).toBe("forced");
  });
});

describe("useLeaveIntent: what the reader does with it", () => {
  it("records a dismissal, how, and how long it was on screen", () => {
    const { result } = mount();
    advance(30_000);
    expect(result.current.open).toBe(true);
    advance(4_000);
    act(() => result.current.dismiss("not_now"));
    expect(result.current.open).toBe(false);
    expect(dismissed).toHaveBeenCalledWith(
      expect.objectContaining({
        variant: "founder_call",
        trigger: "idle",
        source: "not_now",
        view_duration_ms: 4_000,
      })
    );
  });

  it("records the booking page being opened and gets out of the way", () => {
    const { result } = mount();
    advance(31_000);
    act(() => result.current.book());
    expect(result.current.open).toBe(false);
    expect(clicked).toHaveBeenCalledWith(
      expect.objectContaining({ variant: "founder_call", trigger: "idle" })
    );
  });

  it("closes, as superseded, if the plans window opens over it", () => {
    const { result, rerender } = mount();
    advance(31_000);
    rerender({ ...BASE, plansOpen: true });
    expect(result.current.open).toBe(false);
    expect(dismissed).toHaveBeenCalledWith(expect.objectContaining({ source: "superseded" }));
  });
});
