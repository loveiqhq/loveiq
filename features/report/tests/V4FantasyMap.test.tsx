// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import V4FantasyMap from "@features/report/ui/v3/V4FantasyMap";
import { MAP_DOTS } from "@features/report/ui/sections/FantasySection";
import { getFantasyMapDots, type FantasyMapDot } from "@features/report/server/fantasyMap";
import { placeNames } from "@features/report/ui/v3/fantasyMapNames";

/**
 * The fantasy map over the table — Figma 696:4393 in the open chapter (304:290),
 * 368:3481 in the paywalled one (305:217): five filter chips, the Fantasy Pull x
 * Lived Pleasure plot and its caption. V2's map, in V4's drawing: the same filters,
 * quadrants and dots (getFantasyMapDots for a paying reader, V2's illustrative
 * layout otherwise), each dot opening V2's readout.
 */

const V3_CSS = readFileSync(join(__dirname, "..", "ui", "v3", "reportV3.css"), "utf8");
const SPARK_DOTS = getFantasyMapDots("Spark Seeker")!;

/** The Spark Seeker's names on one line, Manrope 9.5, measured in Chromium (25.09). */
const NAME_WIDTH: Readonly<Record<string, number>> = {
  "Emotional healing sex": 95.08,
  "Penetrating partner": 86.52,
  "Using toys on partner": 93.88,
  "Forced voyeurism fantasy": 111.5,
  "Breeding fantasy": 74.31,
  "Anal play (receiving)": 88.98,
  "Romantic dominance": 92.5,
  "Breasts / nipple play": 87.78,
};

afterEach(cleanup);

const mapOf = (root: HTMLElement) => root.querySelector<HTMLElement>(".rv4-fvm")!;
const chips = (root: HTMLElement) => [
  ...root.querySelectorAll<HTMLButtonElement>(".rv4-fvm__chip"),
];
const dots = (root: HTMLElement) => [...root.querySelectorAll<HTMLElement>(".rv4-fvm__dot")];
const printed = (root: HTMLElement) =>
  [...root.querySelectorAll(".rv4-fvm__name")].map((el) => el.textContent);

describe("V4FantasyMap — open (696:4393)", () => {
  it("names its frame, and the paywalled one when locked", () => {
    const open = render(<V4FantasyMap dots={SPARK_DOTS} locked={false} />);
    expect(mapOf(open.container).getAttribute("data-node-id")).toBe("696:4393");
    open.unmount();
    const locked = render(<V4FantasyMap dots={null} locked onUnlock={() => {}} />);
    expect(mapOf(locked.container).getAttribute("data-node-id")).toBe("368:3481");
  });

  it("sets the five chips in the frame's order, 'All' pressed", () => {
    const { container } = render(<V4FantasyMap dots={SPARK_DOTS} locked={false} />);
    expect(chips(container).map((c) => c.textContent)).toEqual([
      "All",
      "Lean in",
      "Hidden gems",
      "Keep in imagination",
      "Not your thing",
    ]);
    expect(chips(container).map((c) => c.getAttribute("aria-pressed"))).toEqual([
      "true",
      "false",
      "false",
      "false",
      "false",
    ]);
    const group = container.querySelector(".rv4-fvm__chips")!;
    expect(group.getAttribute("role")).toBe("group");
    expect(group.getAttribute("aria-label")).toBe("Filter the map by zone");
  });

  it("dims every dot outside a chip's zone, and 'All' brings them back", () => {
    const { container } = render(<V4FantasyMap dots={SPARK_DOTS} locked={false} />);
    fireEvent.click(chips(container)[1]!);
    expect(chips(container)[1]!.getAttribute("aria-pressed")).toBe("true");
    expect(chips(container)[0]!.getAttribute("aria-pressed")).toBe("false");
    dots(container).forEach((dot, i) => {
      expect(dot.classList.contains("is-dim"), SPARK_DOTS[i]!.name).toBe(
        SPARK_DOTS[i]!.q !== "lean"
      );
    });
    fireEvent.click(chips(container)[0]!);
    expect(dots(container).some((dot) => dot.classList.contains("is-dim"))).toBe(false);
  });

  it("draws the four quadrants in the frame's order, each titled", () => {
    const { container } = render(<V4FantasyMap dots={SPARK_DOTS} locked={false} />);
    const quads = [...container.querySelectorAll(".rv4-fvm__quad")];
    expect(quads.map((q) => q.getAttribute("data-zone"))).toEqual([
      "keep",
      "lean",
      "not",
      "hidden",
    ]);
    expect(quads.map((q) => q.querySelector(".rv4-fvm__zone")!.textContent)).toEqual([
      "KEEP IN IMAGINATION",
      "LEAN IN",
      "NOT YOUR THING",
      "HIDDEN GEMS",
    ]);
  });

  it("places the reader's sixteen dots by their scores, eight named", () => {
    const { container } = render(<V4FantasyMap dots={SPARK_DOTS} locked={false} />);
    expect(dots(container)).toHaveLength(16);
    dots(container).forEach((dot, i) => {
      const d = SPARK_DOTS[i]!;
      expect(dot.style.getPropertyValue("--fvm-x")).toBe(`${d.x * 100}%`);
      expect(dot.style.getPropertyValue("--fvm-y")).toBe(`${d.y * 100}%`);
      expect(dot).toHaveClass(`rv4-fvm__dot--${d.q}`);
    });
    expect(printed(container)).toEqual(SPARK_DOTS.filter((d) => d.label).map((d) => d.label));
    // Until the plot has a size (here: jsdom lays nothing out), V2's rule holds.
    for (const name of container.querySelectorAll(".rv4-fvm__name")) {
      expect(name).toHaveClass("is-below");
      expect(name).not.toHaveClass("is-end");
    }
  });

  it("places the names again when one changes size — a web font landing", () => {
    // WebKit fires no event for a face that lands after mount, so the names were set
    // on the fallback font's widths and stayed there (final review 2, WebKit at 320).
    const observed: Element[] = [];
    let fire = () => {};
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: () => void) {
          fire = callback;
        }
        observe(el: Element) {
          observed.push(el);
        }
        unobserve() {}
        disconnect() {}
      }
    );
    let nameWidth = 40;
    const rect = (width: number, height: number) =>
      ({ left: 0, top: 0, width, height, right: width, bottom: height, x: 0, y: 0 }) as DOMRect;
    const measure = vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockImplementation(function (this: HTMLElement) {
        if (this.classList.contains("rv4-fvm__frame")) return rect(300, 300);
        if (this.classList.contains("rv4-fvm__name")) return rect(nameWidth, 12);
        return rect(0, 0);
      });
    const spotsFor = (width: number) =>
      placeNames(
        SPARK_DOTS.map((d) => ({ x: d.x, y: d.y, r: d.q === "lean" ? 7.5 : 6.5 })),
        SPARK_DOTS.map((d) => (d.label ? { width, height: 12 } : null)),
        300,
        []
      );
    const shown = (root: HTMLElement) =>
      dots(root).map((dot) => {
        const name = dot.querySelector<HTMLElement>(".rv4-fvm__name");
        return name ? `${name.className} ${name.style.getPropertyValue("--fvm-shift")}` : null;
      });
    const expected = (width: number) =>
      spotsFor(width).map((spot, i) =>
        SPARK_DOTS[i]!.label
          ? `rv4-fvm__name is-${spot?.side ?? "below"}${spot ? "" : " is-hidden"} ${spot?.shift ?? 0}px`
          : null
      );
    try {
      const { container } = render(<V4FantasyMap dots={SPARK_DOTS} locked={false} />);
      expect(observed.filter((el) => el.classList.contains("rv4-fvm__name"))).toHaveLength(8);
      expect(shown(container)).toEqual(expected(40));
      nameWidth = 120;
      act(() => fire());
      expect(shown(container)).toEqual(expected(120));
      expect(expected(120)).not.toEqual(expected(40));
    } finally {
      measure.mockRestore();
      vi.unstubAllGlobals();
    }
  });

  it("leaves a name unprinted where it has no clear spot, its dot still reading it out", () => {
    // Nine named dots packed round one: the middle name has nowhere clear to go.
    const crowd: FantasyMapDot[] = [
      [0.5, 0.5],
      [0.4, 0.5],
      [0.6, 0.5],
      [0.5, 0.44],
      [0.5, 0.56],
      [0.4, 0.44],
      [0.6, 0.56],
      [0.4, 0.56],
      [0.6, 0.44],
    ].map(([x, y], i) => ({
      label: `Name ${i}`,
      name: `Name ${i}`,
      q: "lean" as const,
      x: x!,
      y: y!,
      pull: 7,
      pleasure: 7,
    }));
    const rect = (width: number, height: number) =>
      ({ left: 0, top: 0, width, height, right: width, bottom: height, x: 0, y: 0 }) as DOMRect;
    const measure = vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockImplementation(function (this: HTMLElement) {
        if (this.classList.contains("rv4-fvm__frame")) return rect(300, 300);
        if (this.classList.contains("rv4-fvm__name")) return rect(60, 12);
        return rect(0, 0);
      });
    try {
      const { container } = render(<V4FantasyMap dots={crowd} locked={false} />);
      const middle = dots(container)[0]!;
      const name = middle.querySelector(".rv4-fvm__name")!;
      expect(name).toHaveClass("is-hidden");
      // Still in the page, so it is measured again when the plot grows.
      expect(name.textContent).toBe("Name 0");
      expect(middle.getAttribute("aria-label")).toMatch(/^Name 0, fantasy pull 7 of 10/);
    } finally {
      measure.mockRestore();
    }
  });

  it("sets each of the reader's names where placeNames puts it, once measured", () => {
    const plot = 300;
    const far = (plot + 4) / 2;
    const zoneAt: Record<string, [number, number, number]> = {
      keep: [9, 8, 104.42],
      lean: [far + 9, 8, 37.56],
      not: [9, far + 8, 82.06],
      hidden: [far + 9, far + 8, 67.23],
    };
    const rect = (left: number, top: number, width: number, height: number) =>
      ({
        left,
        top,
        width,
        height,
        right: left + width,
        bottom: top + height,
        x: left,
        y: top,
      }) as DOMRect;
    const measure = vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockImplementation(function (this: HTMLElement) {
        if (this.classList.contains("rv4-fvm__frame")) return rect(0, 0, plot, plot);
        if (this.classList.contains("rv4-fvm__name"))
          return rect(0, 0, NAME_WIDTH[this.textContent!]!, 12);
        if (this.classList.contains("rv4-fvm__zone")) {
          const [left, top, width] = zoneAt[this.parentElement!.getAttribute("data-zone")!]!;
          return rect(left, top, width, 12);
        }
        return rect(0, 0, 0, 0);
      });
    try {
      const { container } = render(<V4FantasyMap dots={SPARK_DOTS} locked={false} />);
      const want = placeNames(
        SPARK_DOTS.map((d) => ({ x: d.x, y: d.y, r: d.q === "lean" ? 7.5 : 6.5 })),
        SPARK_DOTS.map((d) => (d.label ? { width: NAME_WIDTH[d.label]!, height: 12 } : null)),
        plot,
        Object.values(zoneAt).map(([left, top, width]) => ({
          left,
          top,
          right: left + width,
          bottom: top + 12,
        }))
      );
      const sides = new Set<string>();
      dots(container).forEach((dot, i) => {
        const spot = want[i];
        const name = dot.querySelector<HTMLElement>(".rv4-fvm__name");
        if (!spot) return expect(name).toBeNull();
        expect(name, SPARK_DOTS[i]!.label!).toHaveClass(`is-${spot.side}`);
        expect(name!.style.getPropertyValue("--fvm-shift")).toBe(`${spot.shift}px`);
        sides.add(spot.side);
      });
      // The map is no longer all names-under-dots.
      expect(sides.size).toBeGreaterThan(1);
    } finally {
      measure.mockRestore();
    }
  });

  it("reads each dot out whole: its fantasy, both scores and its zone", () => {
    const { container } = render(<V4FantasyMap dots={SPARK_DOTS} locked={false} />);
    const first = SPARK_DOTS[0]!;
    expect(dots(container)[0]!.getAttribute("aria-label")).toBe(
      `${first.name}, fantasy pull ${first.pull} of 10, lived pleasure ${first.pleasure} of 10, zone: HIDDEN GEMS`
    );
  });

  it("opens a dot's readout on focus or hover, and closes it on leaving", () => {
    const { container } = render(<V4FantasyMap dots={SPARK_DOTS} locked={false} />);
    const dot = dots(container)[3]!;
    fireEvent.focus(dot);
    expect(dot).toHaveClass("is-open");
    expect(dot.getAttribute("aria-expanded")).toBe("true");
    expect(mapOf(container)).toHaveClass("is-inspecting");
    const readout = dot.querySelector(".rv4-fvm__readout")!;
    expect(readout.getAttribute("aria-hidden")).toBe("true");
    expect(readout.querySelector(".rv4-fvm__readout-name")!.textContent).toBe(SPARK_DOTS[3]!.name);
    expect(
      [...readout.querySelectorAll(".rv4-fvm__meter-value")].map((v) => v.textContent)
    ).toEqual([String(SPARK_DOTS[3]!.pull), String(SPARK_DOTS[3]!.pleasure)]);
    fireEvent.blur(dot);
    expect(dot).not.toHaveClass("is-open");
    fireEvent.mouseEnter(dots(container)[5]!);
    expect(dots(container)[5]!).toHaveClass("is-open");
    fireEvent.mouseLeave(dots(container)[5]!);
    expect(mapOf(container)).not.toHaveClass("is-inspecting");
  });

  it("toggles a readout by touch: a tap opens it, a second tap closes it", () => {
    const { container } = render(<V4FantasyMap dots={SPARK_DOTS} locked={false} />);
    const dot = dots(container)[2]!;
    // A tap: pointerdown, then focus opens it, then the click must not close it.
    fireEvent.pointerDown(dot, { pointerType: "touch" });
    fireEvent.focus(dot);
    fireEvent.click(dot);
    expect(dot).toHaveClass("is-open");
    fireEvent.pointerDown(dot, { pointerType: "touch" });
    fireEvent.click(dot);
    expect(dot).not.toHaveClass("is-open");
  });

  it("opens the readout toward the plot's middle, under the dot in its upper 45%", () => {
    // V2 drops it under the dot in the top quarter only; V4's readout is drawn full
    // size, not at V2's two thirds, and from the quarter to 45% down it rose onto the
    // chips.
    const { container } = render(<V4FantasyMap dots={SPARK_DOTS} locked={false} />);
    dots(container).forEach((dot, i) => {
      const d = SPARK_DOTS[i]!;
      expect(dot.classList.contains("is-flip-x"), d.name).toBe(d.x > 0.55);
      expect(dot.classList.contains("is-flip-start"), d.name).toBe(d.x < 0.45);
      expect(dot.classList.contains("is-flip-y"), d.name).toBe(d.y < 0.45);
    });
    // Romantic dominance, 30% down, now opens under its dot.
    const romantic = SPARK_DOTS.findIndex((d) => d.name === "Romantic dominance");
    expect(dots(container)[romantic]).toHaveClass("is-flip-y");
  });

  it("labels the axes for the eye only, and sets the caption", () => {
    const { container } = render(<V4FantasyMap dots={SPARK_DOTS} locked={false} />);
    const axes = [...container.querySelectorAll(".rv4-fvm__axis")];
    expect(axes.map((a) => a.textContent)).toEqual(["lived pleasure →", "fantasy pull →"]);
    axes.forEach((a) => expect(a.getAttribute("aria-hidden")).toBe("true"));
    expect(container.querySelector(".rv4-fvm__caption")!.textContent).toBe(
      "Hover or tap any dot for its name and note. Placements start from your archetype's typical pattern."
    );
  });

  it("keeps the plot clear and unlocked for a paying reader", () => {
    const { container } = render(<V4FantasyMap dots={SPARK_DOTS} locked={false} />);
    expect(container.querySelector(".rv4-fvm__lock")).toBeNull();
    expect(container.querySelector("[inert]")).toBeNull();
    expect(container.querySelector(".rv4-lockbadge")).toBeNull();
  });
});

describe("V4FantasyMap — the illustrative layout (V2's, as Figma draws it)", () => {
  it("falls back to V2's sixteen dots, where Figma draws them", () => {
    const { container } = render(<V4FantasyMap dots={null} locked={false} />);
    expect(dots(container)).toHaveLength(16);
    dots(container).forEach((dot, i) => {
      expect(dot.style.getPropertyValue("--fvm-x")).toBe(`${MAP_DOTS[i]!.x * 100}%`);
      expect(dot.style.getPropertyValue("--fvm-y")).toBe(`${MAP_DOTS[i]!.y * 100}%`);
    });
  });

  it("prints each name on the side 696:4407 sets it", () => {
    const { container } = render(<V4FantasyMap dots={null} locked={false} />);
    const side = (label: string) => {
      const name = [...container.querySelectorAll(".rv4-fvm__name")].find(
        (el) => el.textContent === label
      )!;
      return ["is-left", "is-right", "is-above", "is-below", "is-end"].filter((c) =>
        name.classList.contains(c)
      );
    };
    expect(side("Mutual surrender")).toEqual(["is-left"]);
    expect(side("Sacred kink")).toEqual(["is-left"]);
    expect(side("Tantra")).toEqual(["is-left"]);
    expect(side("Public play")).toEqual(["is-right"]);
    expect(side("Quickies")).toEqual(["is-right"]);
    expect(side("Slow builds")).toEqual(["is-above", "is-end"]);
    expect(side("Emotional release")).toEqual(["is-below", "is-end"]);
    expect(side("Voice & sound")).toEqual(["is-below"]);
  });

  it("reads an unnamed illustrative dot out by its zone alone", () => {
    const { container } = render(<V4FantasyMap dots={null} locked={false} />);
    const unnamed = MAP_DOTS.findIndex((d) => !d.label);
    expect(dots(container)[unnamed]!.getAttribute("aria-label")).toBe("LEAN IN, zone: LEAN IN");
  });
});

describe("V4FantasyMap — paywalled (368:3481)", () => {
  it("blurs the plot under the lock badge, V2's illustrative dots behind it", () => {
    const { container } = render(<V4FantasyMap dots={null} locked onUnlock={() => {}} />);
    const lock = container.querySelector<HTMLElement>(".rv4-fvm__lock")!;
    const blurred = lock.querySelector<HTMLElement>(".rv4-fvm__blurred")!;
    expect(blurred.getAttribute("aria-hidden")).toBe("true");
    expect(blurred.hasAttribute("inert")).toBe(true);
    expect(blurred.querySelectorAll(".rv4-fvm__dot")).toHaveLength(16);
    expect(printed(container)).toEqual(MAP_DOTS.filter((d) => d.label).map((d) => d.label));
    expect(lock.querySelector(".rv4-lockbadge")).not.toBeNull();
  });

  it("draws the illustrative layout even if dots arrive, so no score is ever drawn locked", () => {
    const { container } = render(<V4FantasyMap dots={SPARK_DOTS} locked onUnlock={() => {}} />);
    expect(printed(container)).toEqual(MAP_DOTS.filter((d) => d.label).map((d) => d.label));
    expect(container.textContent).not.toContain(SPARK_DOTS[0]!.name);
  });

  it("opens the paywall once per tap on the plot or its badge", () => {
    const unlock = vi.fn();
    const { container } = render(<V4FantasyMap dots={null} locked onUnlock={unlock} />);
    fireEvent.click(container.querySelector(".rv4-fvm__blurred")!);
    expect(unlock).toHaveBeenCalledTimes(1);
    fireEvent.click(container.querySelector(".rv4-lockbadge")!);
    expect(unlock).toHaveBeenCalledTimes(2);
  });

  it("keeps the chips working and the axes and caption sharp", () => {
    const unlock = vi.fn();
    const { container } = render(<V4FantasyMap dots={null} locked onUnlock={unlock} />);
    fireEvent.click(chips(container)[2]!);
    expect(chips(container)[2]!.getAttribute("aria-pressed")).toBe("true");
    expect(unlock).not.toHaveBeenCalled();
    for (const el of container.querySelectorAll(
      ".rv4-fvm__chips, .rv4-fvm__axis, .rv4-fvm__caption"
    )) {
      expect(el.closest(".rv4-fvm__blurred")).toBeNull();
    }
  });
});

describe("reportV3.css — the fantasy map (696:4393 / 368:3481)", () => {
  const ruleOf = (selector: string) => {
    const at = V3_CSS.lastIndexOf(`${selector} {`);
    expect(at, selector).toBeGreaterThan(0);
    return V3_CSS.slice(at, V3_CSS.indexOf("}", at));
  };

  it("stacks chips, plot and caption 10.49 apart in a 328px column", () => {
    const map = ruleOf(".rv3 .rv4-fvm");
    expect(map).toContain("gap: 10.4947px");
    expect(map).toContain("width: min(328px, 100%)");
  });

  it("wraps the chips centred, 7.9 apart, rows touching", () => {
    const row = ruleOf(".rv3 .rv4-fvm__chips");
    expect(row).toContain("justify-content: center");
    expect(row).toContain("gap: 0 7.8992px");
    expect(row).toContain("flex-wrap: wrap");
  });

  it("draws a chip 32.8 tall with its 1.13px stroke painted inside, Manrope Bold 12.41", () => {
    const chip = ruleOf(".rv3 .rv4-fvm__chip");
    expect(chip).toContain("height: 32.7985px");
    expect(chip).toContain("padding: 0 15.7985px");
    expect(chip).toContain("box-shadow: inset 0 0 0 1.12846px rgba(22, 16, 33, 0.12)");
    expect(chip).toContain('font-family: var(--rv4-manrope, "Manrope"), sans-serif');
    expect(chip).toContain("font-size: 12.4131px");
    expect(chip).toContain("font-weight: 700");
    // 17, not Figma's 16.9563: Chromium rounds Manrope to a 17px content area and
    // floors the 0.02px it overhangs a 16.9563 line to a whole pixel, which raised
    // the label 1.23px (measured 25.09).
    expect(chip).toContain("line-height: 17px");
    expect(chip).toContain("color: #6b6678");
    const on = ruleOf(".rv3 .rv4-fvm__chip.is-active");
    expect(on).toContain("background: #161021");
    expect(on).toContain("color: #fff");
  });

  it("sets the plot 300 square, 26 in from the left, its quadrants 4 apart", () => {
    expect(ruleOf(".rv3 .rv4-fvm__img")).toContain("--fvm-plot: min(300px, 100cqi - 28px)");
    const frame = ruleOf(".rv3 .rv4-fvm__frame");
    expect(frame).toContain("left: 26px");
    expect(frame).toContain("width: var(--fvm-plot)");
    expect(frame).toContain("height: var(--fvm-plot)");
    expect(ruleOf(".rv3 .rv4-fvm__plot")).toContain("gap: 4px");
    expect(ruleOf(".rv3 .rv4-fvm__row")).toContain("container-type: inline-size");
  });

  it("tints each quadrant as drawn", () => {
    expect(ruleOf('.rv3 .rv4-fvm__quad[data-zone="keep"]')).toContain("rgba(242, 109, 79, 0.05)");
    expect(ruleOf('.rv3 .rv4-fvm__quad[data-zone="lean"]')).toContain("rgba(95, 180, 140, 0.08)");
    expect(ruleOf('.rv3 .rv4-fvm__quad[data-zone="not"]')).toContain("rgba(22, 16, 33, 0.02)");
    expect(ruleOf('.rv3 .rv4-fvm__quad[data-zone="hidden"]')).toContain(
      "rgba(157, 138, 215, 0.08)"
    );
  });

  it("draws a dot 10 across (12 in 'Lean in') with a 1.5 white ring outside", () => {
    const dot = ruleOf(".rv3 .rv4-fvm__pip");
    expect(dot).toContain("width: 10px");
    expect(dot).toContain("box-shadow: 0 0 0 1.5px #fff");
    expect(ruleOf(".rv3 .rv4-fvm__dot--lean .rv4-fvm__pip")).toContain("width: 12px");
  });

  it("sets a name on one line where fantasyMapNames reckons it: 2.5 off the ring, slid by its shift", () => {
    expect(ruleOf(".rv3 .rv4-fvm__name")).toContain("white-space: nowrap");
    expect(ruleOf(".rv3 .rv4-fvm__name.is-left")).toContain("right: calc(var(--fvm-r) + 2.5px)");
    expect(ruleOf(".rv3 .rv4-fvm__name.is-right")).toContain("left: calc(var(--fvm-r) + 2.5px)");
    expect(ruleOf(".rv3 .rv4-fvm__name.is-below")).toContain("top: calc(var(--fvm-r) + 2.5px)");
    expect(ruleOf(".rv3 .rv4-fvm__name.is-end")).toContain("right: -6px");
    expect(
      ruleOf(
        ".rv3 .rv4-fvm__name.is-above:not(.is-end),\n.rv3 .rv4-fvm__name.is-below:not(.is-end)"
      )
    ).toContain("transform: translateX(calc(-50% + var(--fvm-shift, 0px)))");
  });

  it("makes every dot a 26px target centred on it, held a ring inside the plot", () => {
    const dot = ruleOf(".rv3 .rv4-fvm__dot");
    expect(dot).toContain("width: 26px");
    expect(dot).toContain("height: 26px");
    expect(dot).toContain("margin: -13px 0 0 -13px");
    expect(dot).toContain("left: clamp(var(--fvm-r), var(--fvm-x), 100% - var(--fvm-r))");
    expect(dot).toContain("top: clamp(var(--fvm-r), var(--fvm-y), 100% - var(--fvm-r))");
    expect(ruleOf(".rv3 .rv4-fvm__dot--lean")).toContain("--fvm-r: 7.5px");
  });

  it("blurs the locked plot 2px, as the table's stand-ins", () => {
    expect(ruleOf(".rv3 .rv4-fvm__blurred")).toContain("filter: blur(2px)");
  });
});
