// @vitest-environment jsdom
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }) }));

import { MiraAppFrame } from "@features/mira/ui/MiraAppFrame";
import { MiraFrame, Wordmark } from "@features/mira/ui/MiraShell";

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
      "Applied Psychometrics BETA, Mira home"
    );
  });
});
