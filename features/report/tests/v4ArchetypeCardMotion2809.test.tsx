// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import V3ArchetypeCard from "@features/report/ui/v3/V3ArchetypeCard";
import { report3ArchetypeCard } from "@/data/report3-archetype-card";
import { installRevealObserver, observerOf } from "./v4RevealTestKit";

/**
 * The archetype card's entrance (Figma 15:815), review 28.09. Mark (1943981051): "Also
 * check for V2 animations and build them into this please", and in reply: "If there
 * werent any, feel free to be creative".
 *
 * V2's card (CoreArchetypeSection) animates its match strength and nothing else: the bar
 * widens over 1800ms on cubic-bezier(0.645, 0.045, 0.355, 1) while the % counts up. That
 * is built as it is. The rest follows from it: the tagline and the core motivation panel
 * rise in behind the bar, and the meters, far lower, fill segment by segment when they
 * are reached. The deck keeps its own cross-fade and gets no entrance.
 */

const V3_CSS = readFileSync(join(process.cwd(), "features/report/ui/v3/reportV3.css"), "utf8");
const copy = report3ArchetypeCard["Spark Seeker"]!;

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

const renderCard = () =>
  render(<V3ArchetypeCard archetype="Spark Seeker" matchStrength={43} copy={copy} />);

describe("V3ArchetypeCard — the match strength, as V2 draws it in", () => {
  it("holds the card at its start until the header is in view", () => {
    const { container } = renderCard();
    expect(container.querySelector(".rv3-arch")!.className).toContain("is-pending");
    expect(
      container.querySelector(".rv3-arch__match-value [aria-hidden='true']")!.textContent
    ).toBe("0%");
  });

  it("widens the bar to the match strength through a custom property the CSS can hold", () => {
    const { container } = renderCard();
    const fill = container.querySelector<HTMLElement>(".rv3-arch__bar-fill")!;
    expect(fill.style.getPropertyValue("--rv3-arch-match")).toBe("43%");
    expect(fill.style.width).toBe("");
  });

  it("counts the % up from 0 once the header is in view, and lands on it", () => {
    const { container } = renderCard();
    const head = container.querySelector(".rv3-arch__head")!;
    observerOf(head)!.fire();
    expect(container.querySelector(".rv3-arch")!.className).not.toContain("is-pending");
    const counter = () =>
      container.querySelector(".rv3-arch__match-value [aria-hidden='true']")!.textContent;
    tick(0);
    tick(900);
    expect(counter()).toBe("22%");
    tick(900);
    expect(counter()).toBe("43%");
  });

  it("gives assistive tech the final % from the start", () => {
    renderCard();
    expect(screen.getByText("43%").className).toBe("rv3-sr");
  });
});

describe("V3ArchetypeCard — the meters fill segment by segment", () => {
  it("watches the meters on their own, since they sit far below the header", () => {
    const { container } = renderCard();
    const meters = container.querySelector(".rv3-arch__meters")!;
    expect(meters.className).toContain("is-pending");
    observerOf(meters)!.fire();
    expect(meters.className).not.toContain("is-pending");
    // The header's reveal is its own; the meters' did not bring it in.
    expect(container.querySelector(".rv3-arch")!.className).toContain("is-pending");
  });

  it("numbers the lit segments in reading order across both meters", () => {
    const { container } = renderCard();
    const lit = [...container.querySelectorAll<HTMLElement>(".rv3-arch__seg.is-on")];
    expect(lit.map((seg) => seg.style.getPropertyValue("--rv4-seg-i"))).toEqual([
      "0",
      "1",
      "2",
      "3",
      "4",
      "5",
    ]);
    // Each reached label lights as its meter's last segment lands.
    const stops = [...container.querySelectorAll<HTMLElement>(".rv3-arch__meter")].map((meter) =>
      meter.style.getPropertyValue("--rv4-stop-i")
    );
    expect(stops).toEqual(["2", "5"]);
  });
});

describe("reportV3.css — the archetype card's entrance", () => {
  const rule = (selector: string) => {
    const at = V3_CSS.indexOf(`${selector} {`);
    expect(at, selector).toBeGreaterThan(-1);
    expect(V3_CSS.slice(0, at).split("\n").length, selector).toBeGreaterThan(1884);
    return V3_CSS.slice(at, V3_CSS.indexOf("}", at));
  };
  const V2_CURVE = "1800ms cubic-bezier(0.645, 0.045, 0.355, 1)";

  it("widens the match bar from 0 on V2's own timing", () => {
    const fill = rule(".rv3:is(.rv4, .rv4-doc) .rv3-arch__bar-fill");
    expect(fill).toMatch(/width: var\(--rv3-arch-match\)/);
    expect(fill).toContain(`width ${V2_CURVE}`);
    expect(rule(".rv3:is(.rv4, .rv4-doc) .rv3-arch.is-pending .rv3-arch__bar-fill")).toMatch(
      /width: 0/
    );
  });

  it("raises the tagline, then the core motivation panel, in behind the bar", () => {
    const tagline = rule(".rv3:is(.rv4, .rv4-doc) .rv3-arch.is-animated .rv3-arch__tagline");
    expect(tagline).toMatch(/opacity 600ms ease-out 500ms/);
    const panel = rule(".rv3:is(.rv4, .rv4-doc) .rv3-arch.is-animated .rv3-arch__motive-wrap");
    expect(panel).toMatch(/opacity 600ms ease-out 800ms/);
    const pending = rule(
      ".rv3:is(.rv4, .rv4-doc) .rv3-arch.is-pending :is(.rv3-arch__tagline, .rv3-arch__motive-wrap)"
    );
    expect(pending).toMatch(/opacity: 0/);
    expect(pending).toMatch(/transform: translateY\(8px\)/);
  });

  it("fills each lit segment from the left, 110ms after the one before", () => {
    const lit = rule(".rv3:is(.rv4, .rv4-doc) .rv3-arch__seg.is-on::after");
    expect(lit).toMatch(/transform-origin: left center/);
    expect(lit).toContain("transform 280ms ease-out calc(var(--rv4-seg-i, 0) * 110ms)");
    expect(
      rule(".rv3:is(.rv4, .rv4-doc) .rv3-arch__meters.is-pending .rv3-arch__seg.is-on::after")
    ).toMatch(/transform: scaleX\(0\)/);
    // Under the fill, a lit segment is the same track an unlit one is.
    expect(rule(".rv3:is(.rv4, .rv4-doc) .rv3-arch__seg.is-on")).toMatch(
      /background: var\(--rv3-hairline\)/
    );
  });

  it("lights each meter's reached label as its last segment lands", () => {
    expect(rule(".rv3:is(.rv4, .rv4-doc) .rv3-arch__stop.is-current")).toContain(
      "color 300ms ease-out calc(var(--rv4-stop-i, 0) * 110ms + 280ms)"
    );
    expect(
      rule(".rv3:is(.rv4, .rv4-doc) .rv3-arch__meters.is-pending .rv3-arch__stop.is-current")
    ).toMatch(/color: var\(--rv3-scale\)/);
  });

  it("shows the finished card under reduced motion", () => {
    const blocks = V3_CSS.split("@media (prefers-reduced-motion: reduce)").slice(1);
    const block = blocks.find((b) => b.slice(0, b.indexOf("}")).includes(".rv3-arch"));
    expect(block, "no reduced-motion block opens on the archetype card").toBeDefined();
    const body = block!.slice(0, block!.indexOf("\n}\n"));
    expect(body).toMatch(/is-pending \.rv3-arch__bar-fill[\s\S]*width: var\(--rv3-arch-match\)/);
    expect(body).toMatch(/opacity: 1/);
    expect(body).toMatch(/transform: none/);
    expect(body).toMatch(/color: var\(--rv3-accent-ink\)/);
    expect(body).toMatch(/transition: none/);
  });
});
