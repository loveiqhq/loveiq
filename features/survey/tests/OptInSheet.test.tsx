// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import OptInSheet, { CLOSE_MS, OPEN_GUARD_MS } from "@features/survey/ui/OptInSheet";
import { __resetBodyScrollLockForTests, isBodyScrollLocked } from "@shared/ui/body-scroll-lock";

/**
 * The opt-in's "Sure you want to miss out?" sheet on its own: Mark's board B (10 Nov 2026).
 * SurveyEngine.optInSheet.test.tsx covers when it opens and what its choices submit.
 */
const TITLE = "Sure you want to miss out?";
const props = () => ({ onAccept: vi.fn(), onDecline: vi.fn(), onDismiss: vi.fn() });

const dialog = () => screen.getByRole("dialog", { name: TITLE });
const yes = () => screen.getByRole("button", { name: "Yes, I want to keep learning" });
const notNow = () => screen.getByRole("button", { name: "Not now" });
/** Past the guard that ignores taps landing as the sheet opens. */
const settle = () => act(() => vi.advanceTimersByTime(OPEN_GUARD_MS));

function reducedMotion(on: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: on && query.includes("prefers-reduced-motion"),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

beforeEach(() => {
  vi.useFakeTimers();
  reducedMotion(false);
  __resetBodyScrollLockForTests();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("OptInSheet", () => {
  it("draws nothing while closed", () => {
    render(<OptInSheet open={false} {...props()} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("is a modal dialog named by its title, with the board's words", () => {
    render(<OptInSheet open {...props()} />);
    const sheet = dialog();
    expect(sheet).toHaveAttribute("aria-modal", "true");
    expect(sheet).toHaveTextContent("Practical & scientific insights tailored to you");
    expect(sheet).toHaveTextContent("Small practices to try the same day");
    expect(sheet).toHaveTextContent("First access to new tests & guides");
    expect(sheet).toHaveTextContent("No spam, just value. 95% of readers stay subscribed.");
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    expect(yes()).toBeInTheDocument();
    expect(notNow()).toBeInTheDocument();
    // Portalled out of the survey, over everything (the Pause dialog's layer).
    expect(sheet.closest("[data-optin-sheet]")?.parentElement).toBe(document.body);
  });

  it("puts focus on the sheet itself, never on Yes", () => {
    render(<OptInSheet open {...props()} />);
    act(() => vi.advanceTimersByTime(0));
    expect(document.activeElement).toBe(dialog());
    expect(document.activeElement).not.toBe(yes());
  });

  it("ignores a tap that lands as it opens (a double tap on Next must never consent)", () => {
    const p = props();
    render(<OptInSheet open {...p} />);
    fireEvent.click(yes());
    fireEvent.click(notNow());
    expect(p.onAccept).not.toHaveBeenCalled();
    expect(p.onDecline).not.toHaveBeenCalled();
  });

  it("takes Yes once the sheet has settled, and only once", () => {
    const p = props();
    render(<OptInSheet open {...p} />);
    settle();
    fireEvent.click(yes());
    fireEvent.click(yes());
    fireEvent.click(notNow());
    expect(p.onAccept).toHaveBeenCalledTimes(1);
    expect(p.onDecline).not.toHaveBeenCalled();
  });

  it("takes Not now once the sheet has settled", () => {
    const p = props();
    render(<OptInSheet open {...p} />);
    settle();
    fireEvent.click(notNow());
    expect(p.onDecline).toHaveBeenCalledTimes(1);
    expect(p.onAccept).not.toHaveBeenCalled();
  });

  it("closes on Esc after sliding down, with no choice made", () => {
    const p = props();
    render(<OptInSheet open {...p} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(p.onDismiss).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(CLOSE_MS));
    expect(p.onDismiss).toHaveBeenCalledWith("escape");
    expect(p.onAccept).not.toHaveBeenCalled();
    expect(p.onDecline).not.toHaveBeenCalled();
  });

  it("closes at once under reduced motion", () => {
    reducedMotion(true);
    const p = props();
    render(<OptInSheet open {...p} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(p.onDismiss).toHaveBeenCalledWith("escape");
  });

  it("closes on a tap outside it", () => {
    const p = props();
    render(<OptInSheet open {...p} />);
    fireEvent.click(screen.getByRole("button", { name: "Back to the question", hidden: true }));
    act(() => vi.advanceTimersByTime(CLOSE_MS));
    expect(p.onDismiss).toHaveBeenCalledWith("backdrop");
  });

  it("closes on a swipe down, and springs back from a short slow drag", () => {
    const p = props();
    render(<OptInSheet open {...p} />);
    const sheet = dialog();
    const title = screen.getByRole("heading", { name: TITLE });

    fireEvent.pointerDown(title, { clientY: 600, pointerId: 1 });
    act(() => vi.advanceTimersByTime(500));
    fireEvent.pointerMove(sheet, { clientY: 640, pointerId: 1 });
    fireEvent.pointerUp(sheet, { clientY: 640, pointerId: 1 });
    act(() => vi.advanceTimersByTime(CLOSE_MS));
    expect(p.onDismiss).not.toHaveBeenCalled();
    expect(sheet.style.transform).toBe("");

    fireEvent.pointerDown(title, { clientY: 600, pointerId: 2 });
    fireEvent.pointerMove(sheet, { clientY: 730, pointerId: 2 });
    expect(sheet.style.transform).toBe("translateY(130px)");
    fireEvent.pointerUp(sheet, { clientY: 730, pointerId: 2 });
    act(() => vi.advanceTimersByTime(CLOSE_MS));
    expect(p.onDismiss).toHaveBeenCalledWith("swipe");
  });

  it("never starts a swipe on a button (lifting there would press it)", () => {
    const p = props();
    render(<OptInSheet open {...p} />);
    const sheet = dialog();
    fireEvent.pointerDown(yes(), { clientY: 600, pointerId: 3 });
    fireEvent.pointerMove(sheet, { clientY: 760, pointerId: 3 });
    fireEvent.pointerUp(sheet, { clientY: 760, pointerId: 3 });
    act(() => vi.advanceTimersByTime(CLOSE_MS));
    expect(p.onDismiss).not.toHaveBeenCalled();
    expect(sheet.style.transform).toBe("");
  });

  it("keeps Tab inside its two buttons", () => {
    render(<OptInSheet open {...props()} />);
    act(() => vi.advanceTimersByTime(0));
    // From the sheet itself, Shift+Tab wraps to its last button.
    fireEvent.keyDown(window, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(notNow());
    fireEvent.keyDown(window, { key: "Tab" });
    expect(document.activeElement).toBe(yes());
    fireEvent.keyDown(window, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(notNow());
  });

  it("holds the page still while open, and gives focus back on close", () => {
    const opener = document.createElement("button");
    opener.textContent = "Next";
    document.body.appendChild(opener);
    opener.focus();

    const p = props();
    const { rerender } = render(<OptInSheet open {...p} />);
    expect(isBodyScrollLocked()).toBe(true);

    rerender(<OptInSheet open={false} {...p} />);
    expect(isBodyScrollLocked()).toBe(false);
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it("slides in only for readers who allow motion", () => {
    render(<OptInSheet open {...props()} />);
    expect(dialog().className).toContain("motion-safe:animate-[survey-sheet-up");
  });
});
