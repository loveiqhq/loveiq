// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const scroll = vi.hoisted(() => ({ lock: vi.fn(), unlock: vi.fn() }));
vi.mock("@shared/ui/body-scroll-lock", () => ({
  lockBodyScroll: () => scroll.lock(),
  unlockBodyScroll: () => scroll.unlock(),
}));

import FounderCallDialog from "@features/booking/ui/FounderCallDialog";
import { titleCase } from "@features/report/logic/titleCase";

const URL = "https://calendar.app.google/AbC123xyz";

function renderDialog(open: boolean, handlers = { onDismiss: vi.fn(), onBook: vi.fn() }) {
  const view = render(<FounderCallDialog open={open} bookingUrl={URL} {...handlers} />);
  return { ...view, ...handlers };
}

afterEach(() => {
  cleanup();
  scroll.lock.mockReset();
  scroll.unlock.mockReset();
});

describe("FounderCallDialog", () => {
  it("is no dialog at all while closed", () => {
    renderDialog(false);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(scroll.lock).not.toHaveBeenCalled();
  });

  it("is a modal dialog named by its heading while open", () => {
    renderDialog(true);
    const dialog = screen.getByRole("dialog", {
      name: "Your Full Report, Free for a 20-Minute Call",
    });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(scroll.lock).toHaveBeenCalledTimes(1);
  });

  it("follows the report's heading rule", () => {
    renderDialog(true);
    const heading = screen.getByRole("heading", { level: 2 }).textContent ?? "";
    expect(heading).toBe(titleCase(heading));
    expect(screen.getByText("Before You Go")).toBeTruthy();
  });

  it("promises what the grant gives, and no price", () => {
    const { container } = renderDialog(true);
    const text = container.textContent ?? "";
    expect(text).toContain("Mark and Marcus");
    expect(text).toContain("20 minutes");
    expect(text).toContain("one-time code");
    expect(text).toContain("14 days");
    expect(text).not.toMatch(/[€$£]|\d+\s?%|discount/i);
  });

  it("books on Google Calendar in a new tab", () => {
    const { onBook } = renderDialog(true);
    const link = screen.getByRole("link", { name: /Book a 20-Minute Call/ });
    expect(link.getAttribute("href")).toBe(URL);
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
    expect(link.getAttribute("rel")).toContain("noreferrer");
    expect(link.textContent).toContain("(opens Google Calendar in a new tab)");
    fireEvent.click(link);
    expect(onBook).toHaveBeenCalledTimes(1);
  });

  it("reports each way out by name", () => {
    const { onDismiss, container } = renderDialog(true);
    fireEvent.click(screen.getByRole("button", { name: "No Thanks, Keep Reading" }));
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    fireEvent.click(container.querySelector(".report-leave-offer__backdrop")!);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onDismiss.mock.calls.map(([source]) => source)).toEqual([
      "not_now",
      "close_button",
      "backdrop",
      "escape",
    ]);
  });

  it("takes focus, keeps Tab inside, and gives focus back", () => {
    const opener = document.createElement("button");
    document.body.appendChild(opener);
    opener.focus();
    const handlers = { onDismiss: vi.fn(), onBook: vi.fn() };
    const { rerender } = render(<FounderCallDialog open={false} bookingUrl={URL} {...handlers} />);
    rerender(<FounderCallDialog open bookingUrl={URL} {...handlers} />);
    const dialog = screen.getByRole("dialog");
    expect(dialog.contains(document.activeElement)).toBe(true);

    const focusables = dialog.querySelectorAll<HTMLElement>("a[href], button");
    focusables[focusables.length - 1]!.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(focusables[0]);

    rerender(<FounderCallDialog open={false} bookingUrl={URL} {...handlers} />);
    expect(document.activeElement).toBe(opener);
    expect(scroll.unlock).toHaveBeenCalledTimes(1);
    opener.remove();
  });

  it("scrolls on its own without the page's smooth scroll taking the wheel", () => {
    const { container } = renderDialog(true);
    expect(container.querySelector("[data-lenis-prevent]")).not.toBeNull();
  });
});
