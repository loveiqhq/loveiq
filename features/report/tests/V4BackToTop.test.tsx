// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { useRef, type FC } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import V4BackToTop from "@features/report/ui/v3/V4BackToTop";

/**
 * The floating "Back to top" control — no Figma node, built from the Ignite
 * panel's chrome after the 2026-09-22 sync asked for it.
 *
 * Follows V4LearnMore.test.tsx: assert the rendered DOM, plus the CSS contracts
 * the DOM cannot show, read off disk.
 */

const V3_CSS = readFileSync(join(__dirname, "..", "ui", "v3", "reportV3.css"), "utf8");

/** Stands in for the expanded learn-more card whose top the button returns to. */
const Harness: FC = () => {
  const ref = useRef<HTMLElement>(null);
  return (
    <section ref={ref} data-testid="target">
      <V4BackToTop targetRef={ref} />
    </section>
  );
};

/** What `getBoundingClientRect().top` reports — negative means scrolled past. */
let rectTop = 0;
let scrollTo: ReturnType<typeof vi.fn>;
let reducedMotion = false;

const setScrollY = (y: number) =>
  Object.defineProperty(window, "scrollY", { value: y, configurable: true });

beforeEach(() => {
  rectTop = 0;
  reducedMotion = false;
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
    () => ({ top: rectTop, height: 11624, width: 393 }) as DOMRect
  );
  // Run the rAF coalescing synchronously so a fired scroll settles in the same tick.
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    cb(0);
    return 1;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {});
  scrollTo = vi.fn();
  vi.stubGlobal("scrollTo", scrollTo);
  vi.stubGlobal("matchMedia", () => ({ matches: reducedMotion }));
  setScrollY(0);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const button = () => screen.getByRole("button", { hidden: true });
const anchor = (c: HTMLElement) => c.querySelector(".rv4-backtop")!;

describe("V4BackToTop", () => {
  it("stays hidden while the section head is still on screen", () => {
    const { container } = render(<Harness />);
    expect(anchor(container).getAttribute("data-visible")).toBe("false");
    // Out of the tab order too, so a keyboard reader cannot land on a control
    // that is not on screen.
    expect(button().getAttribute("tabindex")).toBe("-1");
    expect(button().getAttribute("aria-hidden")).toBe("true");
  });

  it("appears once the section head has passed roughly a screen above the fold", () => {
    const { container } = render(<Harness />);
    rectTop = -319;
    fireEvent.scroll(window);
    expect(anchor(container).getAttribute("data-visible")).toBe("false");

    rectTop = -321;
    fireEvent.scroll(window);
    expect(anchor(container).getAttribute("data-visible")).toBe("true");
    expect(button().getAttribute("tabindex")).toBe("0");
    expect(button().getAttribute("aria-hidden")).toBe("false");
  });

  it("returns to the section top, clear of the floating chrome", () => {
    render(<Harness />);
    setScrollY(5000);
    rectTop = -400;
    fireEvent.scroll(window);
    fireEvent.click(button());
    // 5000 + (-400) is the section top in document space; 144 clears the header
    // (8→56) and the chapter pill band (80→136) that float over the scroll.
    expect(scrollTo).toHaveBeenCalledWith({ top: 4456, behavior: "smooth" });
  });

  it("never scrolls above the document top", () => {
    render(<Harness />);
    setScrollY(10);
    rectTop = -400;
    fireEvent.scroll(window);
    fireEvent.click(button());
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "smooth" });
  });

  it("jumps without animating when the reader asked for reduced motion", () => {
    render(<Harness />);
    reducedMotion = true;
    setScrollY(5000);
    rectTop = -400;
    fireEvent.scroll(window);
    fireEvent.click(button());
    expect(scrollTo).toHaveBeenCalledWith({ top: 4456, behavior: "auto" });
  });
});

describe("reportV3.css — back-to-top contracts", () => {
  const block = (selector: string) => {
    const at = V3_CSS.indexOf(selector);
    expect(at).toBeGreaterThan(-1);
    return V3_CSS.slice(at, V3_CSS.indexOf("}", at));
  };

  it("anchors with a zero-height sticky, as .rv4-chrome does", () => {
    // Sticky, not fixed: fixed resolves against the viewport, which would throw
    // the button out of the preview's 393px canvas and into the browser corner.
    const css = block(".rv3 .rv4-backtop {");
    expect(css).toContain("position: sticky");
    expect(css).toContain("height: 0");
    expect(css).toContain("bottom: 20px");
  });

  it("borrows the Ignite panel's hairline so it reads as part of the report", () => {
    const css = block(".rv3 .rv4-backtop__btn {");
    expect(css).toContain("border: 1px solid rgba(168, 85, 247, 0.4)");
    expect(css).toContain("color: var(--rv3-violet)");
    expect(css).toContain("pointer-events: none");
  });
});
