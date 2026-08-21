// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import LandingPageWhiteV1 from "@features/landing/ui/white-v1/LandingPageWhiteV1";

// The code-split bottom-of-fold sections (FAQ, CTA, footer) are not what this
// test is about, and next/dynamic would resolve them asynchronously — stub them
// out so the assertions below are about the arm's own sections.
vi.mock("next/dynamic", () => ({ default: () => () => null }));

// ScrollAnimator + the carousels observe intersections; jsdom has no such API.
class NoopObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}
vi.stubGlobal("IntersectionObserver", NoopObserver);
vi.stubGlobal("ResizeObserver", NoopObserver);

/**
 * Arm B of the landing A/B — the white landing as it was before the 2026-08-10
 * rebuild. Its four pinned sections are what distinguish it from arm A, so this
 * asserts the page renders and that those sections are the PRE-rebuild ones.
 */
afterEach(cleanup);

describe("LandingPageWhiteV1", () => {
  it("renders the pre-rebuild hero, not the rebuild's question hero", () => {
    render(<LandingPageWhiteV1 />);
    // The rebuild's hero asks survey question 1 on the page; this one does not.
    expect(screen.getByRole("heading", { level: 1 }).textContent).toMatch(/Determine Your Sexual/i);
    expect(screen.queryByText(/which of these sounds most like you/i)).toBeNull();
  });

  it("keeps the sections the rebuild dropped", () => {
    render(<LandingPageWhiteV1 />);
    // how-it-works, perfect-for, problem/value, glossary, trust row, report
    // preview and the academic board all left the page in the rebuild — this arm
    // is the reason they are still on disk.
    // These left the page in the rebuild; this arm is why they are still on disk.
    expect(screen.getAllByText(/how it works/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/glossary/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/perfect for/i).length).toBeGreaterThan(0);
  });

  it("paints the page surface white so the dark body cannot show through", () => {
    const { container } = render(<LandingPageWhiteV1 />);
    const main = container.querySelector("main");
    expect(main?.className).toContain("bg-white");
    // The global body background is dark; on mobile overscroll bounce it would
    // show through a white landing without this.
    expect(container.innerHTML).toContain("html,body{background:#ffffff;}");
  });
});
