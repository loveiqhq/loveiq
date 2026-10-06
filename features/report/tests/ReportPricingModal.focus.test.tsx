// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import type { MutableRefObject } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ReportPricingModal from "@features/report/ui/ReportPricingModal";

vi.mock("@features/analytics/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@features/analytics/client")>()),
  trackPaywallDismissed: vi.fn(),
  trackPriceShown: vi.fn(),
}));

/**
 * Mark, desktop review 30.09: "When the paywall pop up comes and you exit it, it scrolls
 * up weirdly." The pop-up often opens by itself as the reader scrolls, so the element it
 * hands focus back to on closing is whatever they last clicked, often a chapter head far
 * above. Focusing it scrolled it into view, under `html { scroll-behavior: smooth }`:
 * measured at 1440, 11141 → 4247 in a second. Focus goes back without moving the page.
 */
describe("ReportPricingModal — closing hands focus back without scrolling", () => {
  const props = {
    archetype: "Spark Seeker",
    onClose: () => {},
    onUnlock: () => {},
    quotes: null,
  };

  beforeEach(() => {
    // Synchronous frames for the dialog's own focus. A frame asked for from inside a
    // frame is dropped: the testimonials' marquee asks for its next one there.
    let inFrame = false;
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      if (inFrame) return 1;
      inFrame = true;
      try {
        cb(0);
      } finally {
        inFrame = false;
      }
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", () => {});
    vi.stubGlobal("scrollTo", vi.fn());
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    document.body.replaceChildren();
  });

  it("returns focus to what had it, without scrolling to it", () => {
    const chapterHead = document.createElement("button");
    document.body.appendChild(chapterHead);
    chapterHead.focus();
    const focus = vi.spyOn(chapterHead, "focus");
    const view = render(<ReportPricingModal {...props} open />);
    view.rerender(<ReportPricingModal {...props} open={false} />);
    expect(focus).toHaveBeenCalledTimes(1);
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
  });

  it("falls back to the page's content the same way when that element is gone", () => {
    const chapterHead = document.createElement("button");
    document.body.appendChild(chapterHead);
    chapterHead.focus();
    const content = document.createElement("div");
    content.tabIndex = -1;
    document.body.appendChild(content);
    const focus = vi.spyOn(content, "focus");
    const returnFocusRef = { current: content } as MutableRefObject<HTMLElement | null>;
    const view = render(<ReportPricingModal {...props} open returnFocusRef={returnFocusRef} />);
    chapterHead.remove();
    view.rerender(<ReportPricingModal {...props} open={false} returnFocusRef={returnFocusRef} />);
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
  });
});
