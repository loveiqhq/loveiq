// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ph = vi.hoisted(() => ({ capture: vi.fn(), register: vi.fn() }));
vi.mock("posthog-js", () => ({ default: ph }));

import WArchetypeCards from "@features/landing/ui/white/WArchetypeCards";
import WTestimonials from "@features/landing/ui/white/WTestimonials";
import WFoundation from "@features/landing/ui/white/WFoundation";
import LandingPagePainPoint from "@features/landing/ui/painpoint/LandingPagePainPoint";

/**
 * The new landing page reuses three live sections (archetypes, reviews, research) at its own
 * scale: the board's 46px headings (32px on a phone), its section padding, and its review row
 * inset. Each is an opt-in prop, so the video page (and pay to start) render as before.
 */
class FakeObserver {
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

const sectionOf = (name: string | RegExp) =>
  screen.getByRole("heading", { level: 2, name }).closest("section") as HTMLElement;
const reviewsSection = () =>
  screen
    .getByText("people have taken a first step to understand themselves.")
    .closest("section") as HTMLElement;
const shellOf = (section: HTMLElement) => section.firstElementChild as HTMLElement;
const reviewsRow = () =>
  screen.getByText("people have taken a first step to understand themselves.").closest("section")!
    .lastElementChild!.firstElementChild as HTMLElement;

describe("reused live sections — the video page keeps its dress", () => {
  it("archetypes: today's padding and 40px heading", () => {
    render(<WArchetypeCards />);
    const h2 = screen.getByRole("heading", { level: 2, name: /14 sexual personalities/ });
    expect(sectionOf(/14 sexual personalities/).className).toContain("pb-16 pt-4 lg:py-24");
    expect(h2.className).toContain("text-3xl");
    expect(h2.className).toContain("sm:text-[40px]");
  });

  it("reviews: today's row inset", () => {
    render(<WTestimonials />);
    expect(reviewsRow().className).toContain("px-4 py-6");
    expect(shellOf(reviewsSection()).className).toBe("content-shell");
  });

  it("research: today's padding and fluid heading", () => {
    render(<WFoundation />);
    const h2 = screen.getByRole("heading", { level: 2, name: /Built by researchers/ });
    expect(sectionOf(/Built by researchers/).className).toContain("py-16 lg:py-[84px]");
    expect(h2.className).toContain("text-[clamp(1.6rem,4.5vw,2.125rem)]");
    expect(shellOf(sectionOf(/Built by researchers/)).className).toBe("content-shell");
  });
});

describe("reused live sections — the new page's scale", () => {
  it("passes the board's headings, paddings and review inset", () => {
    render(<LandingPagePainPoint variant="pain_point" />);
    const arch = screen.getByRole("heading", { level: 2, name: /14 sexual personalities/ });
    expect(arch.className).toContain("text-[32px]");
    expect(arch.className).toContain("lg:text-[46px]");
    expect(sectionOf(/14 sexual personalities/).className).toContain("py-24");
    const research = screen.getByRole("heading", { level: 2, name: /Built by researchers/ });
    expect(research.className).toContain("lg:text-[46px]");
    // The board balances this heading's two lines (and not the archetypes one).
    expect(research.className).toContain("[text-wrap:balance]");
    expect(arch.className).not.toContain("[text-wrap:balance]");
    expect(sectionOf(/Built by researchers/).className).toContain("py-[84px]");
    expect(reviewsRow().className).toContain("pt-2");
    expect(reviewsRow().className).toContain("pr-[29px]");
    expect(reviewsRow().className).not.toContain("px-4");
    // The board's container is min(1200px, 100% - 48px), not the site's 100% - 2.5rem.
    for (const shell of [shellOf(reviewsSection()), shellOf(sectionOf(/Built by researchers/))]) {
      expect(shell.className).toContain("w-[calc(100%-48px)]");
      expect(shell.className).toContain("max-w-[1200px]");
      expect(shell.className).not.toContain("content-shell");
    }
  });
});
