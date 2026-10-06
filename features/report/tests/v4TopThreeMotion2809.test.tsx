// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import V3TopThree from "@features/report/ui/v3/V3TopThree";
import V4TopThreeSection from "@features/report/ui/v3/V4TopThreeSection";
import { installRevealObserver, observerOf } from "./v4RevealTestKit";

/**
 * The top three's entrance (Figma 1:497), review 28.09. Mark (1943965090): "Can you add
 * animations for this. Please check how the animation in V2 worked. We can have the
 * scale start from 0 and the % also count up from 0 … Also the Archetype names should
 * fade in after the animations have finished to build up curiosity."
 *
 * V2's match strength (CoreArchetypeSection) grows over 1800ms on
 * cubic-bezier(0.645, 0.045, 0.355, 1) and counts its % up over the same 1800ms. Here each
 * row does that 150ms after the one above, and the names fade in once the last bar lands.
 */

const V3_CSS = readFileSync(join(process.cwd(), "features/report/ui/v3/reportV3.css"), "utf8");

let frames: FrameRequestCallback[] = [];
let now = 0;
const tick = (ms: number) =>
  act(() => {
    now += ms;
    const due = frames;
    frames = [];
    due.forEach((frame) => frame(now));
  });

beforeEach(() => {
  installRevealObserver();
  // The kit's synchronous frame would spin a count-up in place; these frames queue.
  frames = [];
  now = 1000;
  vi.stubGlobal("requestAnimationFrame", (frame: FrameRequestCallback) => {
    frames.push(frame);
    return frames.length;
  });
  vi.spyOn(performance, "now").mockImplementation(() => now);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const list = (container: HTMLElement) => container.querySelector<HTMLElement>(".rv3-top3__list")!;
const counters = (container: HTMLElement) =>
  [...container.querySelectorAll(".rv3-top3__pct [aria-hidden='true']")].map((n) => n.textContent);

describe("V4TopThreeSection — the top three count in", () => {
  it("holds the rows at their start until the list is in view", () => {
    const { container } = render(<V4TopThreeSection />);
    expect(list(container).className).toContain("is-animated");
    expect(list(container).className).toContain("is-pending");
    expect(counters(container)).toEqual(["0.0%", "0.0%", "0.0%"]);
  });

  it("staggers the rows 0, 1, 2 for the CSS", () => {
    const { container } = render(<V4TopThreeSection />);
    const rows = [...container.querySelectorAll<HTMLElement>(".rv3-top3__row")];
    expect(rows.map((row) => row.style.getPropertyValue("--rv4-t3-i"))).toEqual(["0", "1", "2"]);
  });

  it("counts each % up from 0 once in view, 150ms behind the row above", () => {
    const { container } = render(<V4TopThreeSection />);
    observerOf(list(container))!.fire();
    expect(list(container).className).not.toContain("is-pending");
    tick(0);
    tick(900); // halfway through the first row's count; the next two started later
    const [first, second, third] = counters(container).map((c) => parseFloat(c!));
    expect(first).toBe(21.7);
    expect(second).toBeGreaterThan(0);
    expect(second!).toBeLessThan(39.5 / 2);
    expect(third!).toBeLessThan(second!);
    tick(1500);
    expect(counters(container)).toEqual(["43.4%", "39.5%", "36.2%"]);
  });

  it("gives assistive tech the final % from the start, never the ticking one", () => {
    const { container } = render(<V4TopThreeSection />);
    const finals = [...container.querySelectorAll(".rv3-top3__pct .rv3-sr")].map(
      (n) => n.textContent
    );
    expect(finals).toEqual(["43.4%", "39.5%", "36.2%"]);
  });
});

describe("V3TopThree without `animate` — ?v3=1 and the non-V4 report as they were", () => {
  it("draws no entrance and prints each % as plain text", () => {
    const { container } = render(
      <V3TopThree
        percentages={{ "Spark Seeker": 43.4, "Explorer of Edges": 39.5, "Emotional Voyeur": 36.2 }}
      />
    );
    expect(list(container).className).toBe("rv3-top3__list");
    const pcts = [...container.querySelectorAll(".rv3-top3__pct")];
    expect(pcts.map((p) => p.innerHTML)).toEqual(["43.4%", "39.5%", "36.2%"]);
    const rows = [...container.querySelectorAll<HTMLElement>(".rv3-top3__row")];
    expect(rows.every((row) => row.style.getPropertyValue("--rv4-t3-i") === "")).toBe(true);
  });
});

describe("reportV3.css — the top three's entrance", () => {
  // The first match: each selector appears again, finished, in the reduced-motion block.
  const rule = (selector: string) => {
    const at = V3_CSS.indexOf(`${selector} {`);
    expect(at, selector).toBeGreaterThan(-1);
    expect(V3_CSS.slice(0, at).split("\n").length, selector).toBeGreaterThan(1884);
    return V3_CSS.slice(at, V3_CSS.indexOf("}", at));
  };
  const V2_CURVE = "1800ms cubic-bezier(0.645, 0.045, 0.355, 1)";

  it("grows each bar from 0 on V2's curve, the dot riding its head", () => {
    expect(rule(".rv3 .rv3-top3__list.is-animated.is-pending .rv3-top3__fill")).toMatch(
      /transform: scaleX\(0\)/
    );
    expect(rule(".rv3 .rv3-top3__list.is-animated.is-pending .rv3-top3__dot")).toMatch(/left: 0/);
    const fill = rule(".rv3 .rv3-top3__list.is-animated .rv3-top3__fill");
    expect(fill).toContain(`transform ${V2_CURVE}`);
    expect(fill).toMatch(/transform-origin: left center/);
    expect(fill).toContain("calc(var(--rv4-t3-i, 0) * 150ms)");
    const dot = rule(".rv3 .rv3-top3__list.is-animated .rv3-top3__dot");
    expect(dot).toContain(`left ${V2_CURVE}`);
    expect(dot).toContain("calc(var(--rv4-t3-i, 0) * 150ms)");
  });

  // Mark, desktop review 01.10: "I think the Archetype names appear too late. Let them
  // appear while the scales and % are loading". Then, 02.10, of the phone: "whenever I
  // speak about animations and its timing, it should always be across devices". Each name
  // fades in with its own bar, on the bars' 150ms stagger, on every width.
  it("fades the names in with their bars, on every device", () => {
    expect(rule(".rv3 .rv3-top3__list.is-animated.is-pending .rv3-top3__name")).toMatch(
      /opacity: 0/
    );
    expect(rule(".rv3 .rv3-top3__list.is-animated .rv3-top3__name")).toContain(
      "opacity 600ms ease-out calc(var(--rv4-t3-i, 0) * 150ms)"
    );
  });

  it("keeps no width of its own for the names' timing", () => {
    expect(V3_CSS).not.toContain("calc(2100ms + var(--rv4-t3-i, 0) * 120ms)");
    expect(V3_CSS).not.toContain(".rv3.rv4 .rv3-top3__list.is-animated .rv3-top3__name {");
  });

  it("shows the finished list under reduced motion", () => {
    const blocks = V3_CSS.split("@media (prefers-reduced-motion: reduce)").slice(1);
    const block = blocks.find((b) => b.slice(0, b.indexOf("}")).includes(".rv3-top3__list"));
    expect(block, "no reduced-motion block opens on the top three").toBeDefined();
    const body = block!.slice(0, block!.indexOf("\n}\n"));
    expect(body).toMatch(/is-pending \.rv3-top3__fill[\s\S]*transform: none/);
    expect(body).toMatch(/is-pending \.rv3-top3__dot[\s\S]*left: var\(--rv3-fill\)/);
    expect(body).toMatch(/is-pending \.rv3-top3__name[\s\S]*opacity: 1/);
    expect(body).toMatch(/transition: none/);
  });
});
