// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    onClick,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
    onClick?: React.MouseEventHandler<HTMLAnchorElement>;
    [key: string]: unknown;
  }) => (
    <a href={href} onClick={onClick} {...props}>
      {children}
    </a>
  ),
}));

const analytics = vi.hoisted(() => ({ trackStartSurvey: vi.fn() }));
vi.mock("@features/analytics/client", () => analytics);

import WNavSection from "@features/landing/ui/white/WNavSection";

const scrollTo = vi.fn();
const scrollIntoView = vi.fn();
/** Keeps jsdom from "navigating" (it cannot) when a test presses a link to another page. */
const stayOnPage = (event: Event) => event.preventDefault();
const pressingLinksAway = () => document.addEventListener("click", stayOnPage, true);

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(window, "scrollY", { writable: true, configurable: true, value: 0 });
  vi.stubGlobal("scrollTo", scrollTo);
  // jsdom has no scrollIntoView; the menu's jump calls it on the target.
  Element.prototype.scrollIntoView = scrollIntoView;
});

afterEach(() => {
  document.removeEventListener("click", stayOnPage, true);
  cleanup();
  vi.unstubAllGlobals();
});

const bar = () => within(document.querySelector("header nav") as HTMLElement);
const menu = () => within(document.querySelector(".w-menu-panel") as HTMLElement);
const barButton = () => screen.getByRole("link", { name: "Start test now - navigation" });
const openMenu = () => fireEvent.click(screen.getByRole("button", { name: "Open menu" }));

describe("WNavSection", () => {
  it("keeps the site's button on the free survey, counted as the landing's nav click", () => {
    pressingLinksAway();
    render(<WNavSection />);
    expect(barButton().getAttribute("href")).toBe("/survey");
    expect(menu().getByRole("link", { name: "Start test now" }).getAttribute("href")).toBe(
      "/survey"
    );
    fireEvent.click(barButton());
    expect(analytics.trackStartSurvey).toHaveBeenCalledWith("nav");
    expect(document.querySelector("header nav")?.parentElement?.className).toBe("content-shell");
  });

  it("lets a page point the button at its own section, and says what was pressed", () => {
    const onPress = vi.fn();
    const onNavigate = vi.fn();
    render(<WNavSection cta={{ href: "#price", onPress }} onNavigate={onNavigate} />);
    expect(barButton().getAttribute("href")).toBe("#price");
    fireEvent.click(barButton());
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(onNavigate).toHaveBeenCalledWith("cta", "bar");
    expect(analytics.trackStartSurvey).not.toHaveBeenCalled();
  });

  it("jumps from the menu only once the menu has let go of the page", () => {
    const onNavigate = vi.fn();
    render(
      <>
        <WNavSection cta={{ href: "#price" }} onNavigate={onNavigate} />
        <section id="price" />
      </>
    );
    openMenu();
    const hamburger = screen.getByRole("button", { name: "Close menu" });
    expect(document.body.style.position).toBe("fixed");

    const followed = fireEvent.click(menu().getByRole("link", { name: "Start test now" }));
    expect(followed).toBe(false); // the jump waits for the menu
    expect(onNavigate).toHaveBeenCalledWith("cta", "menu");
    expect(hamburger.getAttribute("aria-expanded")).toBe("false");
    expect(document.body.style.position).toBe("");
    // The lock's restore first, then the jump to the section: the other way round, the
    // restore would carry the page back to where the menu was opened.
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView.mock.contexts[0]).toBe(document.getElementById("price"));
    expect(scrollTo.mock.invocationCallOrder[0]).toBeLessThan(
      scrollIntoView.mock.invocationCallOrder[0]!
    );
  });

  it("names the logo and every link, in the bar and in the menu", () => {
    pressingLinksAway();
    const onNavigate = vi.fn();
    render(<WNavSection onNavigate={onNavigate} />);
    fireEvent.click(bar().getByRole("link", { name: "LoveIQ" }));
    fireEvent.click(bar().getByRole("link", { name: "Home" }));
    fireEvent.click(bar().getByRole("link", { name: "About us" }));
    fireEvent.click(bar().getByRole("link", { name: "Glossary" }));
    fireEvent.click(bar().getByRole("link", { name: "Trust Center" }));
    openMenu();
    fireEvent.click(menu().getByRole("link", { name: "Trust Center" }));
    expect(onNavigate.mock.calls).toEqual([
      ["logo", "bar"],
      ["home", "bar"],
      ["about", "bar"],
      ["glossary", "bar"],
      ["trust_center", "bar"],
      ["trust_center", "menu"],
    ]);
  });

  it("spans the page's own grid when it has one", () => {
    render(<WNavSection shellClassName="mx-auto max-w-[1288px] px-6" />);
    expect(document.querySelector("header nav")?.parentElement?.className).toBe(
      "mx-auto max-w-[1288px] px-6"
    );
  });
});
