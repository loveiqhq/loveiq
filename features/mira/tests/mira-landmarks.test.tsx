// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }) }));

import { MiraAppFrame } from "@features/mira/ui/MiraAppFrame";
import { MiraFrame, Wordmark } from "@features/mira/ui/MiraShell";
import SignUpFlow from "@features/mira/ui/SignUpFlow";

/**
 * Accessibility from the staging audit (22 Nov 2026): the site's skip link ("#main-content") must
 * land on every Mira page's main content, and the logo's name must read what is on screen.
 */
const html = (el: React.ReactElement) => {
  const div = document.createElement("div");
  div.innerHTML = renderToString(el);
  return div;
};

describe("landmarks", () => {
  it("the signed-in frame's main content is the skip link's target", () => {
    const page = html(
      <MiraAppFrame active="home">
        <p>Hi</p>
      </MiraAppFrame>
    );
    expect(page.querySelector("main#main-content")?.textContent).toContain("Hi");
  });

  // R3-UXA-12's leftover (round 4): the sign-in page had main and aside only, its logo and legal
  // links inside them; every other Mira page has a banner and a contentinfo.
  it("the sign-in page has the frames' banner and contentinfo, outside main and the aside", () => {
    render(<SignUpFlow />);
    const banner = screen.getByRole("banner");
    expect(within(banner).getByRole("link", { name: /Applied Psychometrics/ })).toBeTruthy();
    const info = screen.getByRole("contentinfo");
    expect(within(info).getByRole("navigation", { name: "Legal" })).toBeTruthy();
    for (const el of [banner, info]) expect(el.closest("main, aside")).toBeNull();
    expect(screen.getByRole("main")).toHaveAttribute("id", "main-content");
    // One logo for a screen reader and the keyboard, whatever the width.
    expect(screen.getAllByRole("link", { name: /Applied Psychometrics/ })).toHaveLength(1);
  });

  it("the open pages' frame too", () => {
    const page = html(
      <MiraFrame>
        <p>Guide</p>
      </MiraFrame>
    );
    expect(page.querySelector("main#main-content")?.textContent).toContain("Guide");
  });
});

describe("the logo", () => {
  it("is named by what it shows, in reading order, so voice control can say it (WCAG 2.5.3)", () => {
    const link = html(<Wordmark />).querySelector("a")!;
    expect(link.getAttribute("aria-label")).toBeNull();
    expect(link.textContent!.replace(/\s+/g, " ").trim()).toBe(
      "Applied Psychometrics BETA, talk to Mira"
    );
  });
});
