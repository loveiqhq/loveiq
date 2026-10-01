// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import V4PartnershipLoop from "@features/report/ui/v3/V4PartnershipLoop";
import { buildPartnership } from "@/data/report3-partnership";

/**
 * Mark, desktop review 01.10 (frame and arrows.png): "This also needs a frame, and arrows
 * to click. This is too mobile designed right now. Also there shouldnt be much space when
 * you navigated to the last tile."
 *
 * From 700px the slides sit in the galleries' frame, start-aligned from a 22px inset with
 * no centring spacers, and Previous / Next step the loop. A step whose card already shows
 * whole moves the orbit and the highlight without scrolling; one that does not scrolls it
 * in, never past the end. So the orbit walks all six steps although the track stops when
 * the last card is whole. The reader's own scroll (wheel, drag, keys) takes over again.
 * The phone keeps its centred swipe.
 */

const V3_CSS = readFileSync(join(process.cwd(), "features/report/ui/v3/reportV3.css"), "utf8");
const OPEN = buildPartnership("Spark Seeker")!;
const PITCH = 336;

const desktop = () =>
  vi.stubGlobal(
    "matchMedia",
    (query: string) =>
      ({
        matches: query === "(min-width: 700px)",
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      }) as unknown as MediaQueryList
  );

/** An 855 viewport: slides 320 wide, 336 apart, from a 22px inset; the track ends 22 on. */
const layOut = (container: HTMLElement) => {
  const viewport = container.querySelector<HTMLElement>(".rv4-loop__viewport")!;
  Object.defineProperty(viewport, "clientWidth", { value: 855, configurable: true });
  Object.defineProperty(viewport, "scrollWidth", {
    value: 22 + 6 * 320 + 5 * 16 + 22,
    configurable: true,
  });
  viewport.getBoundingClientRect = () => ({ left: 0, width: 855, right: 855 }) as DOMRect;
  container.querySelectorAll<HTMLElement>(".rv4-loop__slide").forEach((slide, i) => {
    Object.defineProperty(slide, "offsetLeft", { value: 22 + i * PITCH, configurable: true });
    slide.getBoundingClientRect = () =>
      ({
        left: 22 + i * PITCH - viewport.scrollLeft,
        right: 22 + i * PITCH - viewport.scrollLeft + 320,
        width: 320,
      }) as DOMRect;
  });
  const scrollTo = vi.fn((options: ScrollToOptions) => {
    viewport.scrollLeft = options.left ?? 0;
  });
  viewport.scrollTo = scrollTo as unknown as typeof viewport.scrollTo;
  return { viewport, scrollTo };
};

const syncFrames = () => {
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    cb(0);
    return 1;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {});
};

const active = (container: HTMLElement) =>
  container.querySelector(".rv4-loop__label.is-active")!.textContent;
const rot = (container: HTMLElement) =>
  container.querySelector<HTMLElement>(".rv4-loop__orbit")!.style.getPropertyValue("--orbit-rot");

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("V4PartnershipLoop — the desktop loop (desktop review 01.10)", () => {
  it("draws Previous and Next beside the loop's own dots, Previous inert at the start", () => {
    desktop();
    render(<V4PartnershipLoop stages={OPEN.loop} />);
    const prev = screen.getByRole("button", { name: "Previous step" });
    const next = screen.getByRole("button", { name: "Next step" });
    expect(prev.getAttribute("aria-disabled")).toBe("true");
    expect(next.getAttribute("aria-disabled")).toBeNull();
    expect(prev.closest(".rv4-loop__pager")).not.toBeNull();
  });

  it("moves the orbit to a card already whole without scrolling", () => {
    desktop();
    syncFrames();
    const { container } = render(<V4PartnershipLoop stages={OPEN.loop} />);
    const { scrollTo } = layOut(container);
    fireEvent.click(screen.getByRole("button", { name: "Next step" }));
    expect(active(container)).toBe("My Interpretation");
    expect(rot(container)).toBe("60deg");
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it("scrolls a card in that is not whole, never past the end, and walks the orbit to the last step", () => {
    desktop();
    syncFrames();
    const { container } = render(<V4PartnershipLoop stages={OPEN.loop} />);
    const { viewport, scrollTo } = layOut(container);
    const next = () => fireEvent.click(screen.getByRole("button", { name: "Next step" }));
    next(); // 2: whole
    next(); // 3: 694-1014, cut at 855
    expect(scrollTo).toHaveBeenLastCalledWith({ left: 2 * PITCH, behavior: "smooth" });
    fireEvent.scroll(viewport);
    expect(active(container)).toBe("My Reaction");
    next();
    next();
    next(); // 6: the end, 2044 - 855 = 1189
    expect(scrollTo).toHaveBeenLastCalledWith({ left: 1189, behavior: "smooth" });
    fireEvent.scroll(viewport);
    expect(active(container)).toBe("My Confirmation");
    expect(rot(container)).toBe("300deg");
    expect(screen.getByRole("button", { name: "Next step" }).getAttribute("aria-disabled")).toBe(
      "true"
    );
  });

  it("lets the reader's own scroll take over again", () => {
    desktop();
    syncFrames();
    const { container } = render(<V4PartnershipLoop stages={OPEN.loop} />);
    const { viewport } = layOut(container);
    fireEvent.click(screen.getByRole("button", { name: "Next step" }));
    expect(active(container)).toBe("My Interpretation");
    // A page scroll over the loop is no takeover; a sideways one is.
    fireEvent.wheel(viewport, { deltaY: 120 });
    expect(active(container)).toBe("My Interpretation");
    fireEvent.wheel(viewport, { deltaX: 40 });
    fireEvent.scroll(viewport);
    expect(active(container)).toBe("The Situation");
  });

  it("asks a mouse to use the arrows, and a phone still to swipe", () => {
    desktop();
    render(<V4PartnershipLoop stages={OPEN.loop} />);
    expect(screen.getByText("Use the arrows to follow the loop.")).toBeInTheDocument();
    expect(screen.getByText("Swipe the cards below to follow the loop.")).toBeInTheDocument();
  });
});

describe("reportV3.css — the desktop loop (01.10)", () => {
  const block = () =>
    V3_CSS.slice(V3_CSS.indexOf("/* ══ The Challenges in Partnerships loop from 700px"));

  it("frames the cards and their pager as the science gallery is framed", () => {
    expect(block().startsWith("/* ══ The Challenges in Partnerships loop from 700px")).toBe(true);
    const frame = block().slice(block().indexOf(".rv3.rv4 .rv4-loop__deck {"));
    expect(frame).toContain("border: 1px solid rgba(255, 106, 61, 0.45);");
    expect(frame).toContain("border-radius: 24px;");
  });

  it("starts the cards from a 22px inset, as far after the last, and drops the bleed", () => {
    const css = block();
    // The spacers stay (a flex scroller's end padding is not scrollable in every engine)
    // at 6px: 6 and the 16px gap make the 22 inset at both ends.
    expect(css).toContain(
      ".rv3.rv4 .rv4-loop__track::before,\n  .rv3.rv4 .rv4-loop__track::after {\n    flex-basis: 6px;"
    );
    expect(css).toContain("scroll-snap-align: start;");
    expect(css).toContain("scroll-padding-inline: 22px;");
    expect(css).toMatch(/\.rv3\.rv4 \.rv4-loop \{\n {4}margin-inline: 0;/);
  });

  it("shows the arrows and the mouse's prompt from 700px only", () => {
    expect(V3_CSS).toContain(
      ".rv3 .rv4-loop__arrow,\n.rv3 .rv4-loop__prompt-pointer {\n  display: none;\n}"
    );
    expect(block()).toContain(".rv3.rv4 .rv4-loop__prompt-touch {\n    display: none;");
  });
});
