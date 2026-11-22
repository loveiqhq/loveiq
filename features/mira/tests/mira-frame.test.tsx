// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PrimaryButton } from "@features/mira/ui/MiraShell";
import { ADULTS_ONLY, AdultsOnly, ConfirmDelete, SectionLink } from "@features/mira/ui/kit";
import { shortDate } from "@features/mira/ui/kit/dates";

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

describe("the shared kit (features/mira/ui/kit)", () => {
  it("refuses an under-18 account in one calm sentence, never as an error to retry (decision 9)", () => {
    render(<AdultsOnly />);
    expect(screen.getByText(ADULTS_ONLY)).toHaveTextContent("Mira is only for adults.");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("asks before deleting: the safe choice has focus, the question names the group (UX-9)", () => {
    const onConfirm = vi.fn();
    const onKeep = vi.fn();
    const { rerender } = render(
      <ConfirmDelete
        question="Delete this goal and its ticks? This can't be undone."
        onConfirm={onConfirm}
        onKeep={onKeep}
      />
    );
    expect(
      screen.getByRole("group", { name: "Delete this goal and its ticks? This can't be undone." })
    ).toBeInTheDocument();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Keep it" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);

    // Deleting: the button keeps focus and ignores a second tap; a failure is said aloud.
    rerender(
      <ConfirmDelete
        question="Delete this goal and its ticks? This can't be undone."
        busy
        error="We couldn't delete it. Please try again."
        onConfirm={onConfirm}
        onKeep={onKeep}
      />
    );
    const del = screen.getByRole("button", { name: "Delete" });
    expect(del).toHaveAttribute("aria-disabled", "true");
    expect(del).not.toHaveAttribute("disabled");
    fireEvent.click(del);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("alert")).toHaveTextContent("We couldn't delete it.");
    fireEvent.click(screen.getByRole("button", { name: "Keep it" }));
    expect(onKeep).toHaveBeenCalledTimes(1);
  });

  it("names the destructive button for what it does", () => {
    render(
      <ConfirmDelete
        question="Delete every check-in in your journal? This can't be undone."
        action="Delete my journal"
        onConfirm={() => undefined}
        onKeep={() => undefined}
      />
    );
    expect(screen.getByRole("button", { name: "Delete my journal" })).toBeInTheDocument();
  });

  it("words every card's way to its page the same: See all, then what (UX-10)", () => {
    render(<SectionLink href="/mira/goals" what="goals" />);
    const link = screen.getByRole("link", { name: "See all goals" });
    expect(link).toHaveAttribute("href", "/mira/goals");
    expect(link).toHaveTextContent(/^See all/);
  });

  it("writes dates one way, whatever the browser's language: 22 Nov, the year only when it isn't this one (SET-12)", () => {
    const now = new Date("2026-11-22T12:00:00Z");
    expect(shortDate("2026-11-15T12:00:00Z", now)).toBe("15 Nov");
    expect(shortDate("2025-11-25T12:00:00Z", now)).toBe("25 Nov 2025");
  });
});
