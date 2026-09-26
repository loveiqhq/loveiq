// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import V4PartnershipLoop, { LOOP_STEPS } from "@features/report/ui/v3/V4PartnershipLoop";
import { buildPartnership } from "@/data/report3-partnership";

/**
 * The Spark Seeker loop — Figma 532:231 (open) and 612:862 (locked): the orbit of
 * six steps, the centre-snapped slides, and the pager. Rendered from the server's
 * view, so a locked render sees only scrambled lines, exactly as a reader would.
 */

const V3_CSS = readFileSync(join(process.cwd(), "features/report/ui/v3/reportV3.css"), "utf8");
const SOURCE = readFileSync(
  join(process.cwd(), "features/report/ui/v3/V4PartnershipLoop.tsx"),
  "utf8"
);

const OPEN = buildPartnership("Spark Seeker")!;
const LOCKED = buildPartnership("Spark Seeker", { locked: true })!;

/** 320px slides, 16 apart: the pitch the frame steps by. */
const STEP = 336;

const renderLoop = (props: Partial<Parameters<typeof V4PartnershipLoop>[0]> = {}) =>
  render(<V4PartnershipLoop stages={OPEN.loop} {...props} />);

const layOut = (container: HTMLElement) => {
  const viewport = container.querySelector<HTMLElement>(".rv4-loop__viewport")!;
  container.querySelectorAll<HTMLElement>(".rv4-loop__slide").forEach((slide, i) => {
    Object.defineProperty(slide, "offsetLeft", { value: 36 + i * STEP, configurable: true });
  });
  return viewport;
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("V4PartnershipLoop — content", () => {
  it("draws the six steps in orbit order, each with its two lines", () => {
    const { container } = renderLoop();
    const slides = container.querySelectorAll(".rv4-loop__slide");
    expect(slides).toHaveLength(6);
    expect(LOOP_STEPS.map((s) => s.title)).toEqual([
      "The Situation",
      "My Interpretation",
      "My Reaction",
      "Their Interpretation",
      "Their Reaction",
      "My Confirmation",
    ]);
    slides.forEach((slide, i) => {
      const step = LOOP_STEPS[i]!;
      expect(slide.getAttribute("aria-roledescription")).toBe("slide");
      expect(slide.getAttribute("aria-label")).toBe(`${step.title} (${i + 1} of 6)`);
      expect(within(slide as HTMLElement).getByText(step.title)).toBeInTheDocument();
      expect(within(slide as HTMLElement).getByText("What Happens")).toBeInTheDocument();
      expect(within(slide as HTMLElement).getByText("What’s Underneath")).toBeInTheDocument();
      expect(within(slide as HTMLElement).getByText(OPEN.loop[i]!.happens)).toBeInTheDocument();
      expect(within(slide as HTMLElement).getByText(OPEN.loop[i]!.underneath)).toBeInTheDocument();
    });
  });

  it("gives each card its own dot and label colour, as the frames draw them", () => {
    const { container } = renderLoop();
    const slides = container.querySelectorAll<HTMLElement>(".rv4-loop__slide");
    expect(slides[0]!.style.getPropertyValue("--rv4-loop-dot")).toBe("#B3B3B3");
    expect(slides[0]!.style.getPropertyValue("--rv4-loop-label")).toBe("#A5B4FC");
    expect(slides[3]!.style.getPropertyValue("--rv4-loop-dot")).toBe("#F472B6");
    expect(slides[5]!.style.getPropertyValue("--rv4-loop-label")).toBe("#FDA4AF");
  });

  it("labels the orbit, the first step active, and prompts a swipe (Fatih: not 'flip')", () => {
    const { container } = renderLoop();
    const labels = container.querySelectorAll(".rv4-loop__label");
    expect([...labels].map((l) => l.textContent)).toEqual(LOOP_STEPS.map((s) => s.title));
    expect(container.querySelectorAll(".rv4-loop__label.is-active")).toHaveLength(1);
    expect(labels[0]).toHaveClass("is-active");
    expect(screen.getByText("Swipe the cards below to follow the loop.")).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/flip/i);
  });

  it("offers a pager of six, the first current, with the orbit as a mouse-only shortcut", () => {
    const { container } = renderLoop();
    const pager = container.querySelectorAll<HTMLButtonElement>(".rv4-loop__pager-dot");
    expect(pager).toHaveLength(6);
    expect(pager[0]!.getAttribute("aria-current")).toBe("true");
    expect(container.querySelectorAll('.rv4-loop__pager-dot[aria-current="true"]')).toHaveLength(1);
    expect(pager[2]!.getAttribute("aria-label")).toBe("Show My Reaction");
    const dots = container.querySelectorAll<HTMLButtonElement>(".rv4-loop__dot");
    expect(dots).toHaveLength(6);
    dots.forEach((dot) => expect(dot.tabIndex).toBe(-1));
    expect(container.querySelector(".rv4-loop__orbit")!.getAttribute("aria-hidden")).toBe("true");
    // The slides scroll by keyboard too.
    expect(container.querySelector<HTMLElement>(".rv4-loop__viewport")!.tabIndex).toBe(0);
  });
});

describe("V4PartnershipLoop — following the swipe", () => {
  const syncFrames = () => {
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      cb(0);
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", () => {});
  };

  it("moves the active step, label, pager and orbit indicator with the scroll", () => {
    syncFrames();
    const { container } = renderLoop();
    const viewport = layOut(container);
    viewport.scrollLeft = 1.6 * STEP;
    fireEvent.scroll(viewport);
    expect(container.querySelector(".rv4-loop__label.is-active")!.textContent).toBe("My Reaction");
    expect(container.querySelector(".rv4-loop__slide.is-active")!.getAttribute("aria-label")).toBe(
      "My Reaction (3 of 6)"
    );
    const pager = container.querySelectorAll(".rv4-loop__pager-dot");
    expect(pager[2]!.getAttribute("aria-current")).toBe("true");
    // The indicator rides the ring 1:1 with the scroll — 60° a step.
    const orbit = container.querySelector<HTMLElement>(".rv4-loop__orbit")!;
    expect(orbit.style.getPropertyValue("--orbit-rot")).toBe("96deg");
    viewport.scrollLeft = 5 * STEP;
    fireEvent.scroll(viewport);
    expect(container.querySelector(".rv4-loop__label.is-active")!.textContent).toBe(
      "My Confirmation"
    );
  });

  it("survives a scroll before layout — a collapsed chapter measures nothing", () => {
    syncFrames();
    const { container } = renderLoop();
    const viewport = container.querySelector<HTMLElement>(".rv4-loop__viewport")!;
    viewport.scrollLeft = 500;
    expect(() => fireEvent.scroll(viewport)).not.toThrow();
    expect(container.querySelector(".rv4-loop__label.is-active")!.textContent).toBe(
      "The Situation"
    );
  });

  it("scrolls to the step a pager or orbit dot names, smoothly", () => {
    const { container } = renderLoop();
    const viewport = layOut(container);
    const scrollTo = vi.fn();
    viewport.scrollTo = scrollTo as unknown as typeof viewport.scrollTo;
    fireEvent.click(container.querySelectorAll(".rv4-loop__pager-dot")[3]!);
    expect(scrollTo).toHaveBeenLastCalledWith({ left: 3 * STEP, behavior: "smooth" });
    fireEvent.click(container.querySelectorAll(".rv4-loop__dot")[1]!);
    expect(scrollTo).toHaveBeenLastCalledWith({ left: STEP, behavior: "smooth" });
  });

  it("jumps instead when the reader prefers reduced motion", () => {
    vi.stubGlobal(
      "matchMedia",
      (query: string) => ({ matches: query.includes("reduce"), media: query }) as MediaQueryList
    );
    const { container } = renderLoop();
    const viewport = layOut(container);
    const scrollTo = vi.fn();
    viewport.scrollTo = scrollTo as unknown as typeof viewport.scrollTo;
    fireEvent.click(container.querySelectorAll(".rv4-loop__pager-dot")[5]!);
    expect(scrollTo).toHaveBeenLastCalledWith({ left: 5 * STEP, behavior: "auto" });
  });
});

describe("V4PartnershipLoop — locked (612:862)", () => {
  it("blurs the orbit and slides behind the brand lock, the pager sharp but inert", () => {
    const { container } = renderLoop({ stages: LOCKED.loop, locked: true, onUnlock: () => {} });
    const section = container.querySelector(".rv4-loop")!;
    expect(section).toHaveClass("is-locked");
    expect(section.getAttribute("data-node-id")).toBe("612:862");
    for (const part of container.querySelectorAll(".rv4-loop__orbit-box, .rv4-loop__viewport")) {
      expect(part.getAttribute("aria-hidden")).toBe("true");
      expect(part.hasAttribute("inert")).toBe(true);
    }
    expect(container.querySelector(".rv4-loop__pager")!.hasAttribute("inert")).toBe(true);
    expect(screen.getByRole("button", { name: "Unlock the full report" })).toHaveClass(
      "rv4-lockbadge"
    );
    // Under the blur and hidden from assistive tech; since review 26.09 the copy under the blur is the real one (lockedBlurCopy.ts).
    expect(container.querySelector(".rv4-loop__viewport")!.textContent).toContain(
      OPEN.loop[1]!.underneath
    );
  });

  it("opens the paywall once from a tap anywhere on it, the badge included", () => {
    const onUnlock = vi.fn();
    const { container } = renderLoop({ stages: LOCKED.loop, locked: true, onUnlock });
    fireEvent.click(container.querySelector(".rv4-loop__viewport")!);
    expect(onUnlock).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Unlock the full report" }));
    expect(onUnlock).toHaveBeenCalledTimes(2);
  });

  it("has no paywall and no lock when open", () => {
    const onUnlock = vi.fn();
    const { container } = renderLoop({ onUnlock });
    expect(container.querySelector(".rv4-lockbadge")).toBeNull();
    expect(container.querySelector(".rv4-loop")!.getAttribute("data-node-id")).toBe("532:231");
    fireEvent.click(container.querySelector(".rv4-loop__viewport")!);
    expect(onUnlock).not.toHaveBeenCalled();
  });
});

describe("V4PartnershipLoop — CSS contract", () => {
  const firstRule = (selector: string) => V3_CSS.indexOf(selector);
  const lineOf = (index: number) => V3_CSS.slice(0, index).split("\n").length;

  it("appends its rules below the frozen top of reportV3.css", () => {
    const first = firstRule(".rv4-loop");
    expect(first).toBeGreaterThan(0);
    expect(lineOf(first)).toBeGreaterThan(1884);
  });

  it("uses no class name a V3 catch-all would restyle", () => {
    const classes = SOURCE.match(/rv4-loop__[a-z-]+/g) ?? [];
    expect(classes.length).toBeGreaterThan(10);
    for (const name of classes) {
      expect(name, name).not.toMatch(
        /__(body|card|eyebrow|result|heading|details|details-[a-z-]+|learn-[a-z-]+)$/
      );
    }
  });

  it("sets the cards in Manrope, as drawn, through a token captured before V4's font swap", () => {
    expect(V3_CSS).toMatch(/html\s*\{\s*--rv4-manrope:\s*var\(--font-sans\);\s*\}/);
    const slide = V3_CSS.slice(firstRule(".rv3 .rv4-loop__happens"));
    expect(slide.slice(0, slide.indexOf("}"))).toContain("var(--rv4-manrope");
  });

  it("keeps the trailing spacer at least 1px, so the last slide can centre at 320", () => {
    // At 320 the free width is exactly the gap, so the spacer computes to 0 — and a
    // zero-width box adds nothing to scrollable overflow (measured: 1504 of 1520px).
    // The dedicated rule, after the shared ::before/::after one.
    const after = V3_CSS.slice(V3_CSS.lastIndexOf(".rv3 .rv4-loop__track::after {"));
    expect(after.slice(0, after.indexOf("}"))).toContain(
      "flex-basis: max(1px, calc((100cqw - var(--rv4-loop-w)) / 2 - 16px))"
    );
  });

  it("snaps each slide to the centre and blurs the locked parts at the frame's radius", () => {
    const slide = V3_CSS.slice(firstRule(".rv3 .rv4-loop__slide {"));
    expect(slide.slice(0, slide.indexOf("}"))).toContain("scroll-snap-align: center");
    const locked = V3_CSS.slice(firstRule(".rv3 .rv4-loop.is-locked .rv4-loop__orbit-box"));
    expect(locked.slice(0, locked.indexOf("}"))).toContain("filter: blur(2.5px)");
  });
});
