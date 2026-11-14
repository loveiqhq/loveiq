// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The real analytics client, so this checks what PostHog actually receives.
const ph = vi.hoisted(() => ({ capture: vi.fn(), register: vi.fn() }));
vi.mock("posthog-js", () => ({ default: ph }));

import LandingPagePainPoint from "@features/landing/ui/painpoint/LandingPagePainPoint";

/**
 * The new page's last two blocks (boards "READY" and "FOOTER"): the closing question with
 * one button to the survey, and a one-line footer with the four legal pages the board
 * names, outside <main> so it is the page's footer landmark.
 */
class FakeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}

const events = (name: string) => ph.capture.mock.calls.filter(([n]) => n === name);
const renderPage = () => render(<LandingPagePainPoint variant="pain_point" />);

beforeEach(() => {
  ph.capture.mockClear();
  vi.stubGlobal("IntersectionObserver", FakeObserver);
  vi.stubGlobal("ResizeObserver", FakeObserver);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("pain-point page — closing question", () => {
  it("asks the board's closing question, marked for section_seen", () => {
    renderPage();
    const h2 = screen.getByRole("heading", {
      level: 2,
      name: /^Ready to\s*better understand yourself\?$/,
    });
    const section = h2.closest("section") as HTMLElement;
    expect(section.id).toBe("ready");
    expect(section).toHaveAttribute("data-landing-section", "closing_cta");
    expect(section.textContent).toContain(
      "Anonymous by default · ~15 minutes · No account required"
    );
  });

  it("has one button, straight to the survey, counted as the footer CTA", () => {
    renderPage();
    const section = screen
      .getByRole("heading", { level: 2, name: /better understand yourself/ })
      .closest("section") as HTMLElement;
    const links = within(section).getAllByRole("link");
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAccessibleName("Start free test - closing CTA");
    expect(links[0]).toHaveAttribute("href", "/survey");
    fireEvent.click(links[0]!);
    expect(events("cta_click").at(-1)?.[1]).toMatchObject({ location: "footer" });
  });
});

describe("pain-point page — footer", () => {
  it("is the page's footer landmark, after <main>", () => {
    renderPage();
    const footer = screen.getByRole("contentinfo");
    expect(screen.getByRole("main").contains(footer)).toBe(false);
    expect(footer.textContent).toContain(
      "© 2026 Applied Psychometrics UG · Berlin · Democratizing sexual psychology"
    );
  });

  it("links the four legal pages the board names, each a real page", () => {
    renderPage();
    const footer = screen.getByRole("contentinfo");
    const links = within(footer).getAllByRole("link") as HTMLAnchorElement[];
    expect(links.map((a) => [a.textContent, a.getAttribute("href")])).toEqual([
      ["Privacy", "/privacy-policy"],
      ["Terms", "/terms-and-conditions"],
      ["Imprint", "/imprint"],
      ["Medical disclaimer", "/medical-disclaimer"],
    ]);
    for (const a of links) {
      expect(existsSync(join(process.cwd(), "app", a.getAttribute("href")!, "page.tsx"))).toBe(
        true
      );
    }
  });
});
