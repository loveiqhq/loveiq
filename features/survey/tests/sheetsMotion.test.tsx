// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { CountUpPercent } from "@features/survey/ui/sheets/parts";

/**
 * The sheets' motion rules, held as a contract (as gateMotion2310 holds the EUR 1.99 gate's):
 * motion only under prefers-reduced-motion: no-preference; only transform, opacity, a
 * stroke's dash and one phrase's colour move; nothing loops; nothing scales past its size;
 * every sheet has finished moving within about a second. Researched 12 Nov 2026, see
 * docs/survey.md, "Sheets between questions".
 */
const CSS = readFileSync(
  join(process.cwd(), "features/survey/ui/sheets/sheets-motion.css"),
  "utf8"
).replace(/\/\*[\s\S]*?\*\//g, "");

/** The CSS outside every @keyframes and @media block. */
function topLevelRules(css: string): string {
  let depth = 0;
  let out = "";
  let block = "";
  for (const ch of css) {
    if (ch === "{") depth++;
    if (depth === 0) out += ch;
    else block += ch;
    if (ch === "}") {
      depth--;
      if (depth === 0) block = "";
    }
  }
  return out;
}

function keyframes(css: string): Record<string, string> {
  const found: Record<string, string> = {};
  const re = /@keyframes\s+([\w-]+)\s*\{([\s\S]*?\})\s*\}/g;
  for (let m = re.exec(css); m; m = re.exec(css)) found[m[1]!] = m[2]!;
  return found;
}

describe("the sheets' motion contract", () => {
  it("animates nothing outside prefers-reduced-motion: no-preference", () => {
    const media = CSS.match(/@media\s*\(prefers-reduced-motion:\s*no-preference\)\s*\{/g) ?? [];
    expect(media).toHaveLength(1);
    // Outside the media block there are only @keyframes; no rule starts an animation.
    const outside = topLevelRules(CSS.replace(/@keyframes[\s\S]*?\}\s*\}/g, ""));
    expect(outside).not.toMatch(/animation/);
    const mediaBody = CSS.slice(CSS.indexOf("@media"));
    expect(mediaBody).toMatch(/animation:/);
  });

  it("moves only transform, opacity, a stroke's dash and a phrase's colour", () => {
    const allowed = new Set(["transform", "opacity", "stroke-dashoffset", "color"]);
    for (const [name, body] of Object.entries(keyframes(CSS))) {
      const props = [...body.matchAll(/([\w-]+)\s*:/g)].map((m) => m[1]!);
      expect(props.length, name).toBeGreaterThan(0);
      for (const prop of props) expect(allowed.has(prop), `${name}: ${prop}`).toBe(true);
    }
  });

  it("never loops and never grows past full size", () => {
    expect(CSS).not.toMatch(/infinite/);
    for (const [name, body] of Object.entries(keyframes(CSS))) {
      for (const m of body.matchAll(/scale[XY]?\(([\d.]+)\)/g)) {
        expect(Number(m[1]), name).toBeLessThanOrEqual(1);
      }
    }
  });

  it("keeps every duration within the budget, and the house curve, without overshoot", () => {
    for (const m of CSS.matchAll(/(\d+)ms/g)) expect(Number(m[1])).toBeLessThanOrEqual(450);
    for (const m of CSS.matchAll(/cubic-bezier\(([^)]+)\)/g)) {
      const [, y1, , y2] = m[1]!.split(",").map((n) => Number(n.trim()));
      expect(y1!, m[0]).toBeLessThanOrEqual(1);
      expect(y2!, m[0]).toBeLessThanOrEqual(1);
    }
  });
});

describe("the count-up", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("counts from 0 to the value, once, and keeps only the value for screen readers", () => {
    vi.useFakeTimers();
    let now = 0;
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) =>
      setTimeout(() => cb((now += 16)), 16)
    );
    vi.stubGlobal("cancelAnimationFrame", (id: number) => clearTimeout(id));
    const { container } = render(<CountUpPercent value={36} />);
    const digits = container.querySelector("[data-count-up]")!;
    expect(digits.textContent).toBe("0%");
    expect(digits.getAttribute("aria-hidden")).toBe("true");
    expect(container.querySelector(".sr-only")?.textContent).toBe("36%");

    act(() => vi.advanceTimersByTime(300 + 200));
    const midway = Number.parseInt(digits.textContent ?? "0", 10);
    expect(midway).toBeGreaterThan(0);
    expect(midway).toBeLessThan(36);

    act(() => vi.advanceTimersByTime(1000));
    expect(digits.textContent).toBe("36%");
  });

  it("stands at its value under reduced motion", () => {
    vi.stubGlobal(
      "matchMedia",
      (query: string) =>
        ({
          matches: query.includes("reduce"),
          media: query,
          addEventListener: () => {},
          removeEventListener: () => {},
        }) as unknown as MediaQueryList
    );
    const { container } = render(<CountUpPercent value={44} />);
    expect(container.querySelector("[data-count-up]")!.textContent).toBe("44%");
  });
});
