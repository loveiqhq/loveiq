// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => "/mira/home",
}));

import { MiraAppFrame } from "@features/mira/ui/MiraAppFrame";
import { PrimaryButton, Wordmark } from "@features/mira/ui/MiraShell";
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

describe("the signed-in frame", () => {
  const frame = (active: Parameters<typeof MiraAppFrame>[0]["active"]) =>
    render(
      <MiraAppFrame active={active}>
        <p>Page</p>
      </MiraAppFrame>
    );
  const menu = () => screen.getByRole("navigation", { name: "Mira" });
  /** Each menu link's address, in order (jsdom has no CSS: a phone and a desktop label both show). */
  const hrefs = () =>
    within(menu())
      .getAllByRole("link")
      .map((a) => a.getAttribute("href"));

  it("has a banner with the logo and the menu, the page as main, and the foot outside main (A11Y-15)", () => {
    const { container } = frame("home");
    const header = container.querySelector("header")!;
    expect(header.querySelector('nav[aria-label="Mira"]')).not.toBeNull();
    expect(header.querySelector('a[href="/mira/home"]')).not.toBeNull();
    expect(screen.getByRole("main")).toHaveTextContent("Page");
    expect(screen.getByRole("main").querySelector("footer")).toBeNull();
    expect(screen.getByRole("contentinfo")).toHaveTextContent("Mira is in beta");
    expect(screen.queryByRole("complementary")).toBeNull();
  });

  it("puts Home, Chat, Journal and Goals on the phone's bar and the rest in More (decision 8)", () => {
    frame("journal");
    expect(hrefs()).toEqual([
      "/mira/home",
      "/mira",
      "/mira/journal",
      "/mira/goals",
      "/mira/assessments",
      "/mira/recordings",
      "/mira/coaches",
      "/mira/guide",
      "/mira/settings",
    ]);
    // One name for the chat on phones and desktop alike (SET-11): never "Coach & chats".
    expect(within(menu()).getByRole("link", { name: /^Chat/ })).toHaveTextContent("Chat with Mira");
    expect(menu()).not.toHaveTextContent("Coach & chats");
    const current = within(menu()).getAllByRole("link", { current: "page" });
    expect(current.map((a) => a.getAttribute("href"))).toEqual(["/mira/journal"]);
    // The bar's last place opens the rest, as a dialog.
    const more = within(menu()).getByRole("button", { name: "More" });
    expect(more).toHaveAttribute("aria-haspopup", "dialog");
    expect(more).toHaveAttribute("aria-expanded", "false");
  });

  it("opens More as a sheet with the other pages, the current one marked, and closes it", () => {
    frame("settings");
    fireEvent.click(within(menu()).getByRole("button", { name: "More" }));
    const sheet = screen.getByRole("dialog", { name: "More" });
    expect(
      within(sheet)
        .getAllByRole("link")
        .map((a) => a.textContent)
    ).toEqual(["Assessments", "Voice sessions", "Coaches", "Guide", "Settings"]);
    expect(within(sheet).getByRole("link", { name: "Settings" })).toHaveAttribute(
      "aria-current",
      "page"
    );
    expect(within(sheet).getByRole("button", { name: "Need support right now?" })).toBeVisible();
    fireEvent.click(within(sheet).getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog", { name: "More" })).toBeNull();
  });

  it("closes More when one of its pages is chosen", () => {
    frame("home");
    fireEvent.click(within(menu()).getByRole("button", { name: "More" }));
    fireEvent.click(
      within(screen.getByRole("dialog", { name: "More" })).getByRole("link", { name: "Coaches" })
    );
    expect(screen.queryByRole("dialog", { name: "More" })).toBeNull();
  });

  it("marks nothing as current on a page outside the menu", () => {
    frame(undefined);
    expect(within(menu()).queryAllByRole("link", { current: "page" })).toEqual([]);
  });
});

describe("the logo (SET-7)", () => {
  it("leads a signed-in page to Home, and says so", () => {
    render(<Wordmark home />);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/mira/home");
    expect(link.textContent!.replace(/\s+/g, " ").trim()).toBe(
      "Applied Psychometrics BETA, Mira home"
    );
  });

  it("elsewhere leads to the chat's start, and says that instead of Home", () => {
    render(<Wordmark />);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/mira");
    expect(link.textContent!.replace(/\s+/g, " ").trim()).toBe(
      "Applied Psychometrics BETA, talk to Mira"
    );
  });
});
