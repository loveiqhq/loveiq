// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PPainPoints from "@features/landing/ui/painpoint/PPainPoints";

/**
 * Landing page v2's pain points as a carousel (Mark, 12 Nov: "use a carousel for example and
 * make each card more engaging through design"): one row of six that a phone swipes, a
 * keyboard scrolls, and a desktop steps through with two buttons.
 */

const scrollBy = vi.fn();

const media = (reduce: boolean) =>
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: reduce && query.includes("reduce"),
    media: query,
    addEventListener() {},
    removeEventListener() {},
  }));

/** Gives the row a layout jsdom lacks: 3 cards of 360px in view, 20px apart. */
const layOut = (track: HTMLElement, scrollLeft: number) => {
  Object.defineProperty(track, "clientWidth", { configurable: true, value: 1120 });
  Object.defineProperty(track, "scrollWidth", { configurable: true, value: 6 * 360 + 5 * 20 });
  Object.defineProperty(track, "scrollLeft", { configurable: true, value: scrollLeft });
  [...track.children].forEach((card, i) => {
    Object.defineProperty(card, "offsetLeft", { configurable: true, value: i * 380 });
    Object.defineProperty(card, "offsetWidth", { configurable: true, value: 360 });
  });
};

beforeEach(() => {
  scrollBy.mockClear();
  Object.defineProperty(HTMLElement.prototype, "scrollBy", {
    configurable: true,
    value: scrollBy,
  });
  media(false);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const track = () => screen.getByRole("list", { name: "Six patterns" });

describe("pain-point carousel", () => {
  it("shows the six patterns as one row the reader can swipe, or scroll with the keys", () => {
    render(<PPainPoints />);
    expect(within(track()).getAllByRole("listitem")).toHaveLength(6);
    // Focusable, so the arrow keys scroll it once it has focus.
    expect(track().tabIndex).toBe(0);
  });

  it("steps one pattern on with the next button, gliding", () => {
    render(<PPainPoints />);
    layOut(track(), 0);
    act(() => {
      track().dispatchEvent(new Event("scroll"));
    });
    const next = screen.getByRole("button", { name: "Next pattern" });
    expect(next.getAttribute("aria-controls")).toBe(track().id);
    fireEvent.click(next);
    expect(scrollBy).toHaveBeenCalledWith({ left: 380, behavior: "smooth" });
  });

  it("can't go back from the first pattern, and can once the row has moved", () => {
    render(<PPainPoints />);
    layOut(track(), 0);
    act(() => {
      track().dispatchEvent(new Event("scroll"));
    });
    const previous = screen.getByRole("button", { name: "Previous pattern" });
    expect((previous as HTMLButtonElement).disabled).toBe(true);

    layOut(track(), 380);
    act(() => {
      track().dispatchEvent(new Event("scroll"));
    });
    expect((previous as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(previous);
    expect(scrollBy).toHaveBeenCalledWith({ left: -380, behavior: "smooth" });
  });

  it("can't go on from the last pattern", () => {
    render(<PPainPoints />);
    layOut(track(), 6 * 360 + 5 * 20 - 1120);
    act(() => {
      track().dispatchEvent(new Event("scroll"));
    });
    expect(
      (screen.getByRole("button", { name: "Next pattern" }) as HTMLButtonElement).disabled
    ).toBe(true);
  });

  it("jumps instead of gliding under reduced motion", () => {
    media(true);
    render(<PPainPoints />);
    layOut(track(), 0);
    act(() => {
      track().dispatchEvent(new Event("scroll"));
    });
    fireEvent.click(screen.getByRole("button", { name: "Next pattern" }));
    expect(scrollBy).toHaveBeenCalledWith({ left: 380, behavior: "auto" });
  });
});
