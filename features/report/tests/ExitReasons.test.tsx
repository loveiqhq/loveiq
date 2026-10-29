// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockReason = vi.fn();
const mockNote = vi.fn();
vi.mock("@features/analytics/client", () => ({
  trackPaygateExitReason: (...args: unknown[]) => mockReason(...args),
  trackPaygateExitNote: (...args: unknown[]) => mockNote(...args),
}));

import ExitReasons from "@features/report/ui/gate/exit/ExitReasons";
import { exitReasons } from "@features/report/ui/gate/exit/exitContent";

/** No shuffle: the list in its written order, "Something else" last. */
const asWritten = () => 0.999;

const renderReasons = (
  stage: "pre" | "full" = "pre",
  seed = "55",
  random: (() => number) | undefined = asWritten
) => render(<ExitReasons stage={stage} priceCents={199} seed={seed} random={random} />);

const radios = () => screen.getAllByRole("radio");
const radio = (name: string | RegExp) => screen.getByRole("radio", { name });
const foot = () => document.querySelector(".pge-reasons__foot")!.textContent ?? "";

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe("“Not today? Tell us why.”", () => {
  it("is a labelled radio group of the page's eight reasons, “Something else” last", () => {
    renderReasons();
    const group = screen.getByRole("radiogroup", { name: "Why didn’t you unlock your report?" });
    expect(group).toBeTruthy();
    expect(radios()).toHaveLength(8);
    expect(radios().at(-1)?.textContent).toBe("Something else (tell us in a sentence)");
    expect(radios().every((r) => r.getAttribute("aria-checked") === "false")).toBe(true);
    expect(foot()).toBe("Your answer is only used to improve LoveIQ.");
  });

  it("shows one reader one order, every time, from their submission", () => {
    renderReasons("full", "55", undefined);
    const first = radios().map((r) => r.textContent);
    cleanup();
    renderReasons("full", "55", undefined);
    expect(radios().map((r) => r.textContent)).toEqual(first);
    expect(first.at(-1)).toBe("Something else (tell us in a sentence)");
  });

  it("saves a tap at once, marks the row and thanks the reader", () => {
    renderReasons();
    fireEvent.click(radio("I want to see some of it before I pay"));
    expect(mockReason).toHaveBeenCalledTimes(1);
    expect(mockReason).toHaveBeenCalledWith({
      stage: "pre",
      reason: "see_first",
      position: 2,
      order: exitReasons("pre", 199).map((r) => r.code),
      changed: false,
    });
    expect(radio("I want to see some of it before I pay")).toHaveAttribute("aria-checked", "true");
    expect(radio("I want to see some of it before I pay").closest(".pge-reason")).toHaveClass(
      "pge-reason--on"
    );
    expect(foot()).toBe("Thank you. We read every answer.");
    expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");
  });

  it("records a second tap on the same row once, and another row as a change", () => {
    renderReasons();
    fireEvent.click(radio("I’ll come back to it later"));
    fireEvent.click(radio("I’ll come back to it later"));
    expect(mockReason).toHaveBeenCalledTimes(1);
    fireEvent.click(radio("I didn’t expect to pay after the survey"));
    expect(mockReason).toHaveBeenCalledTimes(2);
    expect(mockReason.mock.calls[1]?.[0]).toMatchObject({
      reason: "unexpected_payment",
      changed: true,
    });
    expect(radio("I’ll come back to it later")).toHaveAttribute("aria-checked", "false");
  });

  // The events share 20 a minute with the report's own: every tap up to twelve (sync 29.10:
  // "even the random clicks"), then the last choice, once, as the reader leaves.
  it("saves twelve taps of a visit, and a later last choice as the reader leaves", () => {
    const { unmount } = renderReasons();
    const [a, b, c] = radios();
    for (let i = 0; i < 12; i += 1) fireEvent.click(i % 2 === 0 ? a! : b!);
    expect(mockReason).toHaveBeenCalledTimes(12);
    fireEvent.click(a!);
    fireEvent.click(c!);
    expect(mockReason).toHaveBeenCalledTimes(12);
    expect(c).toHaveAttribute("aria-checked", "true");
    unmount();
    expect(mockReason).toHaveBeenCalledTimes(13);
    expect(mockReason.mock.calls[12]?.[0]).toMatchObject({
      reason: "unclear_value",
      position: 3,
      changed: true,
    });
  });

  it("sends that last choice when the tab goes, once, and nothing already saved", () => {
    const { unmount } = renderReasons();
    const [a, b, c] = radios();
    for (let i = 0; i < 12; i += 1) fireEvent.click(i % 2 === 0 ? a! : b!);
    fireEvent.click(c!);
    window.dispatchEvent(new Event("pagehide"));
    expect(mockReason).toHaveBeenCalledTimes(13);
    unmount();
    expect(mockReason).toHaveBeenCalledTimes(13);
  });

  it("sends nothing as the reader leaves when their last choice is the one saved", () => {
    const { unmount } = renderReasons();
    const [a, b] = radios();
    for (let i = 0; i < 12; i += 1) fireEvent.click(i % 2 === 0 ? a! : b!);
    fireEvent.click(a!);
    fireEvent.click(b!);
    unmount();
    expect(mockReason).toHaveBeenCalledTimes(12);
  });

  it("opens a box for a sentence under “Something else”, and thanks only once it is sent", () => {
    renderReasons();
    fireEvent.click(radio(/^Something else/));
    expect(mockReason).toHaveBeenCalledWith(expect.objectContaining({ reason: "other" }));
    const box = screen.getByRole("textbox", { name: "Tell us in a sentence" });
    expect(document.activeElement).toBe(box);
    expect(box).toHaveAttribute("maxlength", "500");
    // Kept out of session replays and heatmaps.
    expect(box).toHaveClass("ph-no-capture");
    expect(box).toHaveAttribute("data-clarity-mask", "true");
    expect(foot()).toBe("Your answer is only used to improve LoveIQ.");

    const send = screen.getByRole("button", { name: "Send" });
    expect(send).toBeDisabled();
    fireEvent.change(box, { target: { value: "   " } });
    expect(send).toBeDisabled();
    fireEvent.change(box, { target: { value: "  I wanted a sample chapter first.  " } });
    fireEvent.click(send);
    expect(mockNote).toHaveBeenCalledWith({
      stage: "pre",
      text: "I wanted a sample chapter first.",
    });
    expect(foot()).toBe("Thank you. We read every answer.");
    // The same words again are no new answer.
    expect(send).toBeDisabled();
  });

  it("keeps three sentences a visit", () => {
    renderReasons();
    fireEvent.click(radio(/^Something else/));
    const box = screen.getByRole("textbox", { name: "Tell us in a sentence" });
    for (const words of ["one", "two", "three", "four"]) {
      fireEvent.change(box, { target: { value: words } });
      fireEvent.click(screen.getByRole("button", { name: "Send" }));
    }
    expect(mockNote).toHaveBeenCalledTimes(3);
  });

  it("closes the box when another reason is chosen", () => {
    renderReasons();
    fireEvent.click(radio(/^Something else/));
    fireEvent.click(radio("I’ll come back to it later"));
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(foot()).toBe("Thank you. We read every answer.");
  });
});

describe("the keyboard", () => {
  it("moves the focus with the arrows, Home and End, without choosing", () => {
    renderReasons();
    const rows = radios();
    // One tab stop for the group.
    expect(rows.filter((r) => r.tabIndex === 0)).toHaveLength(1);
    rows[0]!.focus();
    fireEvent.keyDown(rows[0]!, { key: "ArrowDown" });
    expect(document.activeElement).toBe(rows[1]);
    fireEvent.keyDown(rows[1]!, { key: "End" });
    expect(document.activeElement).toBe(rows[7]);
    fireEvent.keyDown(rows[7]!, { key: "ArrowDown" });
    expect(document.activeElement).toBe(rows[0]);
    fireEvent.keyDown(rows[0]!, { key: "ArrowUp" });
    expect(document.activeElement).toBe(rows[7]);
    fireEvent.keyDown(rows[7]!, { key: "Home" });
    expect(document.activeElement).toBe(rows[0]);
    expect(mockReason).not.toHaveBeenCalled();
    expect(rows.every((r) => r.getAttribute("aria-checked") === "false")).toBe(true);
  });

  it("makes the chosen row the group's tab stop", () => {
    renderReasons();
    fireEvent.click(radio("I’ll come back to it later"));
    expect(radios().filter((r) => r.tabIndex === 0)).toEqual([radio("I’ll come back to it later")]);
  });
});
