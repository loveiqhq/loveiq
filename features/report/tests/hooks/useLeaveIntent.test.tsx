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
  document.documentElement.style.removeProperty("--liq-consent-h");
});

describe("useLeaveIntent: reaching the paywall card", () => {
  it("stays closed while the reader has not reached the paywall card", () => {
    paywallCardAt(2000);
    const { result } = mount();
    advance(90_000);
    expect(result.current.open).toBe(false);
    expect(shown).not.toHaveBeenCalled();
  });

  it("opens 1.6 seconds after the paywall card comes into view", () => {
    const { result } = mount({ popupArm: "no_popup" });
    advance(1_500);
    expect(result.current.open).toBe(false);
    advance(200);
    expect(result.current.open).toBe(true);
    expect(result.current.trigger).toBe("paywall_reached");
    expect(shown).toHaveBeenCalledWith(
      expect.objectContaining({
        variant: "founder_call",
        trigger: "paywall_reached",
        popup_arm: "no_popup",
        armed_ms: 1_600,
      })
    );
  });

  it("arms when scrolling brings the paywall card up", () => {
    paywallCardAt(2000);
    const { result } = mount();
    advance(10_000);
    paywallCardAt(500);
    act(() => {
      window.dispatchEvent(new Event("scroll"));
    });
    advance(1_500);
    expect(result.current.open).toBe(false);
    advance(200);
    expect(result.current.open).toBe(true);
  });

  it("falls back to the first locked chapter where the report draws no card", () => {
    document.body.innerHTML = "";
    const locked = document.createElement("section");
    locked.className = "rv4-chapter is-locked";
    locked.getBoundingClientRect = () => ({ top: 200 }) as DOMRect;
    document.body.appendChild(locked);
    const { result } = mount();
    advance(1_700);
    expect(result.current.open).toBe(true);
  });

  it("works the same with a mouse on a wide screen", () => {
    window.matchMedia = ((query: string) =>
      ({ matches: true, media: query }) as MediaQueryList) as typeof window.matchMedia;
    const { result } = mount();
    advance(1_700);
    expect(result.current.open).toBe(true);
    expect(result.current.trigger).toBe("paywall_reached");
  });
});

describe("useLeaveIntent: waiting until nothing is in the way", () => {
  it("waits while another window is open, and opens once it closes", () => {
    const { result, rerender } = mount({ overlayOpen: true });
    advance(10_000);
    expect(result.current.open).toBe(false);
    rerender({ ...BASE, overlayOpen: false });
    advance(1_000);
    expect(result.current.open).toBe(true);
  });

  it("waits out a dialog in the page", () => {
    const dialog = document.createElement("div");
    dialog.setAttribute("aria-modal", "true");
    document.body.appendChild(dialog);
    const { result } = mount();
    advance(10_000);
    expect(result.current.open).toBe(false);
    dialog.remove();
    advance(1_000);
    expect(result.current.open).toBe(true);
  });

  it("waits out the cookie banner", () => {
    document.documentElement.style.setProperty("--liq-consent-h", "140px");
    const { result } = mount();
    advance(10_000);
    expect(result.current.open).toBe(false);
    document.documentElement.style.removeProperty("--liq-consent-h");
    advance(1_000);
    expect(result.current.open).toBe(true);
  });

  it("waits while the tab is hidden", () => {
    const { result } = mount();
    act(() => setVisibility("hidden"));
    advance(10_000);
    expect(result.current.open).toBe(false);
    act(() => setVisibility("visible"));
    advance(1_000);
    expect(result.current.open).toBe(true);
  });

  it("holds back for 30 seconds after the pay pop-up test's point, in either arm", () => {
    // openPlans() claims this key at the pop-up point, in both arms, on phones only.
    sessionStorage.setItem("loveiq-report-plans-offered:42", "1");
    const { result } = mount();
    // The first tick (second 1) stamps the point; the offer waits until second 31.
    advance(30_500);
    expect(result.current.open).toBe(false);
    advance(1_000);
    expect(result.current.open).toBe(true);
    expect(result.current.trigger).toBe("paywall_reached");
  });

  it("is not held back by a pop-up point it saw long ago", () => {
    sessionStorage.setItem("loveiq-leave-offer-point:42", String(Date.now() - 60_000));
    sessionStorage.setItem("loveiq-report-plans-offered:42", "1");
    const { result } = mount();
    advance(1_700);
    expect(result.current.open).toBe(true);
  });
});

describe("useLeaveIntent: once, and only when it can be remembered", () => {
  it("never shows again for the same submission", () => {
    const first = mount();
    advance(1_700);
    expect(first.result.current.open).toBe(true);
    act(() => first.result.current.dismiss("not_now"));
    first.unmount();
    expect(localStorage.getItem("loveiq-leave-offer:42")).not.toBeNull();

    const second = mount();
    advance(60_000);
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
    advance(60_000);
    expect(result.current.open).toBe(false);
    expect(shown).not.toHaveBeenCalled();
  });

  it("does nothing when off", () => {
    const { result } = mount({ mode: "off" });
    advance(60_000);
    expect(result.current.open).toBe(false);
  });

  it("opens at once for the preview switch, marked forced, without a submission", () => {
    const { result } = mount({ mode: "show", submissionId: null });
    expect(result.current.open).toBe(true);
    expect(result.current.trigger).toBe("forced");
  });
});

describe("useLeaveIntent: the page turning the offer off", () => {
  it("never opens once the page turns the offer off inside the beat", () => {
    // A purchase that lands mid-session turns the mode off; the dialog is no longer
    // mounted, so an offer opening now would blur and freeze the page for nothing.
    const { result, rerender } = mount();
    advance(1_000);
    rerender({ ...BASE, mode: "off" });
    advance(60_000);
    expect(result.current.open).toBe(false);
    expect(shown).not.toHaveBeenCalled();
    expect(localStorage.getItem("loveiq-leave-offer:42")).toBeNull();
  });

  it("arms again from the start when the page turns the offer back on", () => {
    const { result, rerender } = mount();
    advance(1_000);
    rerender({ ...BASE, mode: "off" });
    advance(10_000);
    rerender({ ...BASE, mode: "trigger" });
    advance(1_500);
    expect(result.current.open).toBe(false);
    advance(200);
    expect(result.current.open).toBe(true);
  });
});

describe("useLeaveIntent: what the reader does with it", () => {
  it("records a dismissal, how, and how long it was on screen", () => {
    const { result } = mount();
    advance(1_600);
    expect(result.current.open).toBe(true);
    advance(4_000);
    act(() => result.current.dismiss("not_now"));
    expect(result.current.open).toBe(false);
    expect(dismissed).toHaveBeenCalledWith(
      expect.objectContaining({
        variant: "founder_call",
        trigger: "paywall_reached",
        source: "not_now",
        view_duration_ms: 4_000,
      })
    );
  });

  it("records the booking page being opened and gets out of the way", () => {
    const { result } = mount();
    advance(1_700);
    act(() => result.current.book());
    expect(result.current.open).toBe(false);
    expect(clicked).toHaveBeenCalledWith(
      expect.objectContaining({ variant: "founder_call", trigger: "paywall_reached" })
    );
  });

  it("closes, as superseded, if the plans window opens over it", () => {
    const { result, rerender } = mount();
    advance(1_700);
    rerender({ ...BASE, plansOpen: true });
    expect(result.current.open).toBe(false);
    expect(dismissed).toHaveBeenCalledWith(expect.objectContaining({ source: "superseded" }));
  });
});
