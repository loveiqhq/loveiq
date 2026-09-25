// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import V4TriggerCard from "@features/report/ui/v3/V4TriggerCard";
import { buildAccelerators } from "@/data/report3-accelerators";

/**
 * The two trigger cards of Accelerator & Brakes — "WHAT BRAKES YOU" (Figma 386:219,
 * paywalled 386:416) and "WHAT ACCELERATES YOU" (386:317 / 386:444).
 */

const V3_CSS = readFileSync(join(__dirname, "..", "ui", "v3", "reportV3.css"), "utf8");
const OPEN = buildAccelerators("Spark Seeker")!;
const LOCKED = buildAccelerators("Spark Seeker", { locked: true })!;

afterEach(cleanup);

describe("V4TriggerCard — open (386:219 / 386:317)", () => {
  it("draws the brakes card: its label, the minus badge and five rows", () => {
    const { container } = render(<V4TriggerCard tone="brake" rows={OPEN.brakes} />);
    const card = container.querySelector(".rv4-trig")!;
    expect(card.classList.contains("rv4-trig--brake")).toBe(true);
    expect(card.getAttribute("data-node-id")).toBe("386:219");
    expect(screen.getByRole("heading", { name: "WHAT BRAKES YOU" })).toBeTruthy();
    const icon = container.querySelector(".rv4-trig__badge img")!;
    expect(icon.getAttribute("src")).toContain("/report/v3/accelerators/icon-minus.svg");
    expect(icon.getAttribute("width")).toBe("16");
    expect(icon.getAttribute("height")).toBe("16");
    expect(container.querySelectorAll(".rv4-trig__row")).toHaveLength(5);
    expect(container.querySelector(".rv4-trig__title")!.textContent).toBe(
      "Sex that feels predictable or obligatory"
    );
    expect(container.querySelector(".rv4-trig__sub")!.textContent).toContain(
      "can drain erotic tension."
    );
  });

  it("draws the accelerators card with the plus badge", () => {
    const { container } = render(<V4TriggerCard tone="accel" rows={OPEN.accelerators} />);
    expect(container.querySelector(".rv4-trig")!.getAttribute("data-node-id")).toBe("386:317");
    expect(screen.getByRole("heading", { name: "WHAT ACCELERATES YOU" })).toBeTruthy();
    expect(container.querySelector(".rv4-trig__badge img")!.getAttribute("src")).toContain(
      "/report/v3/accelerators/icon-plus.svg"
    );
  });

  it("sets each row's scale from its fill, and hides the scale from assistive tech", () => {
    const { container } = render(<V4TriggerCard tone="brake" rows={OPEN.brakes} />);
    const scales = [...container.querySelectorAll<HTMLElement>(".rv4-trig__scale")];
    expect(scales.map((s) => s.style.getPropertyValue("--fill"))).toEqual([
      "94%",
      "85%",
      "77%",
      "66%",
      "58%",
    ]);
    scales.forEach((s) => expect(s.getAttribute("aria-hidden")).toBe("true"));
  });

  it("marks only the card's last row, which draws no rule under it", () => {
    const { container } = render(<V4TriggerCard tone="brake" rows={OPEN.brakes} />);
    const rows = [...container.querySelectorAll(".rv4-trig__row")];
    expect(rows.map((r) => r.classList.contains("is-last"))).toEqual([
      false,
      false,
      false,
      false,
      true,
    ]);
    expect(container.querySelector(".rv4-tb-lock")).toBeNull();
  });
});

describe("V4TriggerCard — paywalled (386:416 / 386:444)", () => {
  it("keeps two rows clear and locks the other three behind one badge", () => {
    const { container } = render(
      <V4TriggerCard tone="brake" rows={LOCKED.brakes} lockedFrom={LOCKED.lockedFrom} />
    );
    expect(container.querySelector(".rv4-trig")!.getAttribute("data-node-id")).toBe("386:416");
    const lock = container.querySelector(".rv4-tb-lock.rv4-trig__lock")!;
    const lockedList = lock.querySelector("ul")!;
    expect(lockedList.getAttribute("aria-hidden")).toBe("true");
    expect(lockedList.hasAttribute("inert")).toBe(true);
    expect(lockedList.querySelectorAll(".rv4-trig__row.is-locked")).toHaveLength(3);
    expect(container.querySelectorAll(".rv4-trig__row:not(.is-locked)")).toHaveLength(2);
    expect(container.querySelectorAll(".rv4-lockbadge")).toHaveLength(1);
    // The locked rows carry the server's scrambled copy, not the real rows.
    expect(lock.textContent).not.toContain("Control and possessiveness");
  });

  it("uses the accelerators card's own paywalled node", () => {
    const { container } = render(
      <V4TriggerCard tone="accel" rows={LOCKED.accelerators} lockedFrom={LOCKED.lockedFrom} />
    );
    expect(container.querySelector(".rv4-trig")!.getAttribute("data-node-id")).toBe("386:444");
  });

  it("opens the paywall once from the locked rows and once from the badge, never from a clear row", () => {
    const onUnlock = vi.fn();
    const { container } = render(
      <V4TriggerCard
        tone="brake"
        rows={LOCKED.brakes}
        lockedFrom={LOCKED.lockedFrom}
        onUnlock={onUnlock}
      />
    );
    fireEvent.click(container.querySelector(".rv4-trig__row")!);
    expect(onUnlock).not.toHaveBeenCalled();
    fireEvent.click(container.querySelector(".rv4-tb-lock")!);
    expect(onUnlock).toHaveBeenCalledTimes(1);
    onUnlock.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Unlock the full report" }));
    expect(onUnlock).toHaveBeenCalledTimes(1);
  });
});

describe("reportV3.css — trigger card contracts", () => {
  const rule = (selector: string) => {
    const at = V3_CSS.indexOf(selector);
    expect(at, `${selector} missing from reportV3.css`).toBeGreaterThan(-1);
    return V3_CSS.slice(at, V3_CSS.indexOf("}", at));
  };

  it("draws 386:219's card: 20px radius, 1px tone border, clipped", () => {
    const css = rule(".rv3 .rv4-trig {");
    expect(css).toContain("border-radius: 20px");
    expect(css).toContain("border: 1px solid rgba(var(--trig), 0.24)");
    expect(css).toContain("overflow: hidden");
  });

  it("tones coral for the brakes and green for the accelerators", () => {
    expect(rule(".rv3 .rv4-trig--brake {")).toContain("--trig: 194, 84, 47");
    expect(rule(".rv3 .rv4-trig--brake {")).toContain("--trig-fill: 0.45");
    expect(rule(".rv3 .rv4-trig--accel {")).toContain("--trig: 46, 125, 91");
    expect(rule(".rv3 .rv4-trig--accel {")).toContain("--trig-fill: 0.5");
  });

  it("sets the label at 12/19.2 extra-bold with 1.56px tracking", () => {
    const css = rule(".rv3 .rv4-trig__label {");
    expect(css).toContain("font-size: 12px");
    expect(css).toContain("font-weight: 800");
    expect(css).toContain("letter-spacing: 1.56px");
  });

  it("centres the knob on the end of the fill", () => {
    expect(rule(".rv3 .rv4-trig__knob {")).toContain("left: calc(var(--fill) - 3px)");
    expect(rule(".rv3 .rv4-trig__fill {")).toContain("width: var(--fill)");
  });

  it("blurs locked rows at the frame's 2px and places each badge as drawn", () => {
    expect(rule(".rv3 .rv4-trig__row.is-locked {")).toContain("filter: blur(2px)");
    expect(rule(".rv3 .rv4-trig--brake .rv4-trig__lock {")).toContain("--rv4-lock-top: 96px");
    expect(rule(".rv3 .rv4-trig--accel .rv4-trig__lock {")).toContain("--rv4-lock-top: 99px");
  });
});

/**
 * Review 24.09: "In the Accelerators & Brakes visual, can we bring back the animation
 * from V2 Report". 2.0's chart (AcceleratorsSection + report.css .report-chart-reveal)
 * grows each fill from nothing, staggered row by row, and lands each dot once its
 * fill has reached it. V4's trigger cards get the same choreography.
 */
describe("V4TriggerCard — 2.0's reveal", () => {
  const rule = (selector: string) => {
    const at = V3_CSS.indexOf(selector);
    expect(at, `${selector} missing from reportV3.css`).toBeGreaterThan(-1);
    return V3_CSS.slice(at, V3_CSS.indexOf("}", at));
  };

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("staggers its rows the way 2.0 does, blurred rows included", () => {
    const { container } = render(
      <V4TriggerCard tone="brake" rows={LOCKED.brakes} lockedFrom={2} />
    );
    const rows = [...container.querySelectorAll<HTMLElement>(".rv4-trig__row")];
    expect(rows.map((r) => r.style.getPropertyValue("--row"))).toEqual(
      rows.map((_, i) => String(i))
    );
  });

  it("never leaves the scales empty where it cannot observe (SSR, jsdom, old browsers)", () => {
    const { container } = render(<V4TriggerCard tone="accel" rows={OPEN.accelerators} />);
    const chart = container.querySelector(".rv4-trig__rows")!;
    expect(chart.className).toContain("rv4-reveal");
    expect(chart.className).toContain("is-revealed");
  });

  it("holds the scales back until the card has actually come on screen", () => {
    let fire: ((entries: { isIntersecting: boolean }[]) => void) | null = null;
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(cb: (entries: { isIntersecting: boolean }[]) => void) {
          fire = cb;
        }
        observe() {}
        disconnect() {}
      }
    );
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
      top: 5000,
    } as DOMRect);
    const { container } = render(<V4TriggerCard tone="brake" rows={OPEN.brakes} />);
    const chart = container.querySelector(".rv4-trig__rows")!;
    expect(chart.className).not.toContain("is-revealed");
    act(() => fire!([{ isIntersecting: true }]));
    expect(chart.className).toContain("is-revealed");
  });

  it("grows the fill and lands the knob with 2.0's timings, and pins both for reduced motion", () => {
    const hidden = (sel: string) =>
      rule(`.rv3 .rv4-trig__rows.rv4-reveal:not(.is-revealed) ${sel} {`);
    const moving = (sel: string) => rule(`.rv3 .rv4-trig__rows.rv4-reveal ${sel} {`);
    expect(hidden(".rv4-trig__fill")).toContain("transform: scaleX(0)");
    expect(moving(".rv4-trig__fill")).toContain("transform-origin: left center");
    expect(moving(".rv4-trig__fill")).toContain(
      "transition: transform 820ms cubic-bezier(0.22, 1, 0.36, 1)"
    );
    expect(moving(".rv4-trig__fill")).toContain("transition-delay: calc(var(--row, 0) * 70ms)");
    expect(hidden(".rv4-trig__knob")).toMatch(/opacity: 0;[\s\S]*transform: scale\(0\.35\)/);
    expect(moving(".rv4-trig__knob")).toContain(
      "transition-delay: calc(var(--row, 0) * 70ms + 620ms)"
    );
    const reduce = V3_CSS.slice(
      V3_CSS.indexOf(
        "@media (prefers-reduced-motion: reduce)",
        V3_CSS.indexOf(".rv4-trig__rows.rv4-reveal")
      )
    );
    expect(reduce).toMatch(
      /\.rv4-trig__rows\.rv4-reveal:not\(\.is-revealed\) \.rv4-trig__fill \{\s*transform: none/
    );
    // The static geometry the tests above pin is untouched: the reveal only
    // transforms, so the knob still sits on the fill's end when it lands.
    expect(rule(".rv3 .rv4-trig__fill {")).toContain("width: var(--fill)");
  });
});
