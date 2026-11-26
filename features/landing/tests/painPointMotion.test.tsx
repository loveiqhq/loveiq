// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ph = vi.hoisted(() => ({ capture: vi.fn(), register: vi.fn() }));
vi.mock("posthog-js", () => ({ default: ph }));

import LandingPagePainPoint from "@features/landing/ui/painpoint/LandingPagePainPoint";
import WFoundation from "@features/landing/ui/white/WFoundation";

/**
 * Landing page v2's motion, from Hana's board "animated pain-point section" (16 Nov), played
 * once (Fatih, 23 Nov). The markup carries each element's place in its cascade; the CSS in
 * app/globals.css plays it when ScrollAnimator marks the element (or its group) `.animate`.
 */

class FakeObserver {
  constructor(public cb: IntersectionObserverCallback) {}
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}

beforeEach(() => {
  vi.stubGlobal("IntersectionObserver", FakeObserver);
  vi.stubGlobal("ResizeObserver", FakeObserver);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const renderPage = () => render(<LandingPagePainPoint variant="pain_point" />);
const section = (name: string | RegExp) =>
  screen.getByRole("heading", { level: 2, name }).closest("section") as HTMLElement;
const delay = (el: Element, name: string) => (el as HTMLElement).style.getPropertyValue(name);

describe("landing page v2 — the pain points fly in", () => {
  it("rises the heading, then the row of cards enters in order, as one group", () => {
    renderPage();
    const pain = section("Is your sex life stuck in one of these patterns?");
    const heading = within(pain).getByRole("heading", { level: 2 });
    expect(heading.classList.contains("pp-rise")).toBe(true);
    expect(heading.classList.contains("animate-on-scroll")).toBe(true);

    const row = within(pain).getByRole("list", { name: "Six patterns" });
    // The row is the one trigger: a phone's later cards sit beside the screen.
    expect(row.hasAttribute("data-reveal")).toBe(true);
    const cards = within(row).getAllByRole("listitem");
    expect(cards.every((c) => c.classList.contains("pp-card-in"))).toBe(true);
    expect(cards.map((c) => delay(c, "--pp-i"))).toEqual(["0", "1", "2", "3", "4", "5"]);
  });

  it("brings the button in after the last card", () => {
    renderPage();
    const pain = section("Is your sex life stuck in one of these patterns?");
    const button = within(pain).getByRole("link", { name: "Start free test - pain points" });
    const rise = button.closest(".pp-rise") as HTMLElement;
    // 0.25s + 0.12s for each of the six cards (Hana's board).
    expect(delay(rise, "--pp-d")).toBe("0.97s");
  });
});

describe("landing page v2 — the closing headline", () => {
  it("brings 'Ready to' in word by word, then wipes in its gradient line", () => {
    renderPage();
    const heading = screen.getByRole("heading", {
      level: 2,
      name: /^Ready to\s*better understand yourself\?$/,
    });
    expect(heading.hasAttribute("data-reveal")).toBe(true);
    const words = [...heading.querySelectorAll(".pp-w")];
    expect(words.map((w) => w.textContent)).toEqual(["Ready", "to"]);
    expect(words.map((w) => delay(w, "--pp-wi"))).toEqual(["0", "1"]);
    expect(heading.querySelector(".pp-wipe")?.textContent).toBe("better understand yourself?");

    const ready = heading.closest("section") as HTMLElement;
    const button = within(ready).getByRole("link", { name: /closing CTA$/ });
    expect(delay(button.closest(".pp-rise")!, "--pp-d")).toBe("1.1s");
    const note = within(ready).getByText(/Anonymous by default/);
    expect(note.classList.contains("pp-rise")).toBe(true);
    expect(delay(note, "--pp-d")).toBe("1.25s");
  });
});

describe("landing page v2 — the research rail", () => {
  it("pops each step's icon in and fills the rail to the next, one after another", () => {
    render(<WFoundation railMotion />);
    const steps = screen.getAllByRole("listitem");
    const icons = steps.map((s) => s.querySelector(".pp-rail-icon"));
    expect(icons.map((i) => i && delay(i, "--pp-icon-d"))).toEqual(["0.15s", "1.15s", "1.9s"]);
    const lines = steps.map((s) => s.querySelector(".pp-rail-line")).filter(Boolean);
    expect(lines.map((l) => delay(l!, "--pp-line-d"))).toEqual(["0.45s", "1.2s"]);
  });

  it("plays on the pain-point page, and not on the video page", () => {
    renderPage();
    const research = section(/Built by researchers/);
    expect(research.querySelectorAll(".pp-rail-icon")).toHaveLength(3);
    cleanup();
    render(<WFoundation />);
    expect(document.querySelectorAll(".pp-rail-icon, .pp-rail-line")).toHaveLength(0);
  });
});

describe("landing page v2 — motion never hides content", () => {
  const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");
  /** The text of every `@media (<media>)` block, braces matched. */
  const blocks = (media: string) => {
    const out: string[] = [];
    const open = `@media (${media}) {`;
    for (let at = css.indexOf(open); at !== -1; at = css.indexOf(open, at + 1)) {
      let depth = 0;
      for (let i = at + open.length - 1; i < css.length; i += 1) {
        if (css[i] === "{") depth += 1;
        if (css[i] === "}" && --depth === 0) {
          out.push(css.slice(at, i + 1));
          break;
        }
      }
    }
    return out.join("\n");
  };

  for (const media of ["prefers-reduced-motion: reduce", "scripting: none"]) {
    it(`shows every entrance's end state under ${media}`, () => {
      const block = blocks(media);
      for (const cls of ["pp-card-in", "pp-rise", "pp-w", "pp-wipe", "pp-rail-icon"]) {
        expect(block, cls).toMatch(new RegExp(`\\.pp-root \\.${cls}[^{]*\\{\\s*opacity: 1;`));
      }
      expect(block).toMatch(/\.pp-root \.pp-rail-line \{\s*background-size: 100% 100%;/);
    });
  }
});
