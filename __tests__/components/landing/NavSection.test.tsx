// @vitest-environment jsdom
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import NavSection from "@/components/landing/NavSection";

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

vi.mock("@/lib/analytics", () => ({
  trackStartSurvey: vi.fn(),
}));

beforeEach(() => {
  Object.defineProperty(window, "scrollY", { writable: true, configurable: true, value: 0 });
});

afterEach(cleanup);

describe("NavSection", () => {
  it("renders LoveIQ logo text", () => {
    render(<NavSection />);
    expect(screen.getByText("LoveIQ")).toBeInTheDocument();
  });

  it("renders hamburger button in DOM", () => {
    render(<NavSection />);
    expect(screen.getByRole("button", { name: /open menu/i })).toBeInTheDocument();
  });

  it("click hamburger sets aria-expanded to true", async () => {
    const user = userEvent.setup();
    render(<NavSection />);
    const hamburger = screen.getByRole("button", { name: /open menu/i });
    await user.click(hamburger);
    expect(hamburger).toHaveAttribute("aria-expanded", "true");
  });

  it("click hamburger adds is-open class to menu panel", async () => {
    const user = userEvent.setup();
    render(<NavSection />);
    const hamburger = screen.getByRole("button", { name: /open menu/i });
    const menu = screen.getByRole("menu");
    await user.click(hamburger);
    expect(menu).toHaveClass("is-open");
  });

  it("pressing Escape after opening closes the menu", async () => {
    const user = userEvent.setup();
    render(<NavSection />);
    const hamburger = screen.getByRole("button", { name: /open menu/i });
    await user.click(hamburger);
    expect(hamburger).toHaveAttribute("aria-expanded", "true");
    await user.keyboard("{Escape}");
    expect(hamburger).toHaveAttribute("aria-expanded", "false");
  });

  it("clicking a menu item closes the menu", async () => {
    const user = userEvent.setup();
    render(<NavSection />);
    const hamburger = screen.getByRole("button", { name: /open menu/i });
    await user.click(hamburger);
    expect(hamburger).toHaveAttribute("aria-expanded", "true");
    const menuItems = screen.getAllByRole("menuitem");
    await user.click(menuItems[0]);
    expect(hamburger).toHaveAttribute("aria-expanded", "false");
  });

  it("Home link has href /", () => {
    render(<NavSection />);
    const homeLinks = screen.getAllByRole("link", { name: /^home$/i });
    expect(homeLinks.length).toBeGreaterThan(0);
    expect(homeLinks[0]).toHaveAttribute("href", "/");
  });

  it("Start survey now CTA links to /survey", () => {
    render(<NavSection />);
    const ctaLinks = screen.getAllByRole("link", { name: /start survey now/i });
    expect(ctaLinks.length).toBeGreaterThan(0);
    ctaLinks.forEach((link) => expect(link).toHaveAttribute("href", "/survey"));
  });
});
