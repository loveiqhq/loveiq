// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import V4LockBadge from "@features/report/ui/v3/V4LockBadge";

/**
 * Mark, 29.09 (1945259495): "We have updated the Unlock Report icons that sit on the
 * visuals." The 48px gradient disc became an 88x88 white tile — a 38px gradient disc
 * with a 17px lock over "Unlock Report" (979:507, and its twins on every visual). The
 * fantasy table's categories take a compact 73x70 one: a 28px disc, a 14px lock and
 * an 8px label (979:588 / 979:600 / 979:612).
 */

afterEach(cleanup);

describe("V4LockBadge — the Unlock Report tile", () => {
  it("is a button named by the words it shows", () => {
    render(<V4LockBadge />);
    const tile = screen.getByRole("button", { name: "Unlock Report" });
    expect(tile).toHaveClass("rv4-lockbadge");
    expect(tile).not.toHaveClass("rv4-lockbadge--compact");
    expect(tile.textContent).toBe("Unlock Report");
    expect(tile.getAttribute("data-node-id")).toBe("979:507");
  });

  it("draws the frame's own 17px lock on the disc", () => {
    const { container } = render(<V4LockBadge />);
    const lock = container.querySelector(".rv4-lockbadge__disc img")!;
    expect(lock.getAttribute("src")).toBe("/report/v3/locks/lock-17.svg");
    expect(lock.getAttribute("width")).toBe("17");
    expect(lock.getAttribute("height")).toBe("17");
    expect(lock.getAttribute("alt")).toBe("");
    expect(container.querySelector(".rv4-lockbadge__disc")!.getAttribute("aria-hidden")).toBe(
      "true"
    );
  });

  it("is the table's compact 73x70 with the 14px lock", () => {
    const { container } = render(<V4LockBadge size="compact" />);
    const tile = screen.getByRole("button", { name: "Unlock Report" });
    expect(tile).toHaveClass("rv4-lockbadge", "rv4-lockbadge--compact");
    expect(tile.getAttribute("data-node-id")).toBe("979:588");
    const lock = container.querySelector(".rv4-lockbadge__disc img")!;
    expect(lock.getAttribute("src")).toBe("/report/v3/locks/lock-14.svg");
    expect(lock.getAttribute("width")).toBe("14");
  });
});
