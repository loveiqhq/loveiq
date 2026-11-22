// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PrimaryButton } from "@features/mira/ui/MiraShell";

/**
 * The round-2 audit's frame and shared parts (22 Nov 2026): the ink button, the signed-in frame,
 * Home, and the parts every stream shares (features/mira/ui/kit).
 */
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("PrimaryButton (decision 7, A11Y-1)", () => {
  it("while disabled keeps keyboard focus, ignores the click and cancels its form's submit", () => {
    const onSubmit = vi.fn((e: { preventDefault: () => void }) => e.preventDefault());
    const onClick = vi.fn();
    render(
      <form onSubmit={onSubmit}>
        <PrimaryButton type="submit" disabled onClick={onClick}>
          Save
        </PrimaryButton>
      </form>
    );
    const button = screen.getByRole("button", { name: "Save" });
    // Never natively disabled: that drops focus to <body> and takes the button out of Tab's order.
    expect(button).not.toHaveAttribute("disabled");
    expect(button).toHaveAttribute("aria-disabled", "true");
    button.focus();
    // Implicit submission (Enter in a field) is a click on the default button, so this is Enter too.
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(button);
  });

  it("when ready, acts and submits", () => {
    const onSubmit = vi.fn((e: { preventDefault: () => void }) => e.preventDefault());
    const onClick = vi.fn();
    render(
      <form onSubmit={onSubmit}>
        <PrimaryButton type="submit" onClick={onClick}>
          Save
        </PrimaryButton>
      </form>
    );
    const button = screen.getByRole("button", { name: "Save" });
    expect(button).not.toHaveAttribute("aria-disabled");
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});
