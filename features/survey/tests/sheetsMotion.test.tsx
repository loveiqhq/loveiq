// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { CountUpPercent } from "@features/survey/ui/sheets/parts";
import { ExpertSheet, ScienceSheet, TrustpilotSheet } from "@features/survey/ui/sheets/InfoSheets";
import ReportMapScreen from "@features/survey/ui/sheets/ReportMapScreen";

/**
 * The sheets' motion rules, held as a contract (as gateMotion2310 holds the EUR 1.99 gate's):
 * motion only under prefers-reduced-motion: no-preference; only transform, opacity, a
 * stroke's dash and one phrase's colour move; nothing loops; nothing scales past its size.
 * Researched 12 Nov 2026, see docs/survey.md, "Sheets between questions". Mark's three
 * reviews (12, 13 and 15 Nov) slowed it: the slowest sheet now settles by about 2.7s
 * (Trustpilot, its quote last).
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

  // Mark's reviews keep asking for slower (13 and 15 Nov), so the budget holds before the
  // tempo: nothing runs past 500ms (Trustpilot's quote, the slowest fade), nor past 1.2s once
  // multiplied by the slowest tempo (the map's 2.25).
  it("keeps every duration within the budget at its tempo, without overshoot", () => {
    const tempos = [...CSS.matchAll(/--sheet-tempo:\s*([\d.]+)/g)].map((m) => Number(m[1]));
    const tempo = Math.max(1, ...tempos);
    expect(tempo).toBeLessThanOrEqual(2.25);
    for (const m of CSS.matchAll(/(\d+)ms/g)) {
      expect(Number(m[1]), m[0]).toBeLessThanOrEqual(500);
      expect(Number(m[1]) * tempo, m[0]).toBeLessThanOrEqual(1200);
    }
    for (const m of CSS.matchAll(/cubic-bezier\(([^)]+)\)/g)) {
      const [, y1, , y2] = m[1]!.split(",").map((n) => Number(n.trim()));
      expect(y1!, m[0]).toBeLessThanOrEqual(1);
      expect(y2!, m[0]).toBeLessThanOrEqual(1);
    }
  });

  it("runs Trustpilot and Halfway at 1.5 and the map at 2.25; the rest at their own pace", () => {
    expect(CSS).toMatch(
      /\[data-survey-sheet="trustpilot"\],\s*\[data-survey-sheet="halfway"\]\s*\{\s*--sheet-tempo:\s*1\.5;\s*\}/
    );
    expect(CSS).toMatch(/\[data-survey-sheet="reportMap"\]\s*\{\s*--sheet-tempo:\s*2\.25;\s*\}/);
    expect([...CSS.matchAll(/--sheet-tempo:/g)]).toHaveLength(2);
  });
});

/** The rule for `selector` in the CSS (its first block). */
function ruleFor(selector: string): string {
  const at = CSS.indexOf(`${selector} {`);
  expect(at, selector).toBeGreaterThanOrEqual(0);
  return CSS.slice(at, CSS.indexOf("}", at));
}

/** A class's base duration in ms: the first `calc(<n>ms * var(--sheet-tempo` in its rule. */
function baseMs(selector: string): number {
  const m = ruleFor(selector).match(/calc\((\d+)ms \* var\(--sheet-tempo/);
  expect(m, selector).not.toBeNull();
  return Number(m![1]);
}

/** An element's `--sheet-delay` in ms. */
const delayOf = (el: Element | null): number =>
  Number.parseFloat((el as HTMLElement).style.getPropertyValue("--sheet-delay"));

describe("Mark's third review of the sheets (15 Nov)", () => {
  const handlers = { onKeepGoing: () => {}, onDismiss: () => {} };
  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
  });

  // "Can we have all the sheets appear/move up a tiny bit slower? So that the user actually
  // sees it appear?" One pace for every bottom sheet, on the house curve: 1s (was 0.45s, and
  // 0.75s for the expert's card since his second review, which Fatih found still too fast).
  it("brings every bottom sheet up at one pace: 1s", () => {
    const rise = "motion-safe:animate-[survey-sheet-up_1s_cubic-bezier(0.16,1,0.3,1)_backwards]";
    render(<ScienceSheet open {...handlers} />);
    render(<ExpertSheet open {...handlers} />);
    const dialogs = document.querySelectorAll('[data-survey-sheet] > [role="dialog"]');
    expect(dialogs).toHaveLength(2);
    for (const dialog of dialogs) expect(dialog.className).toContain(rise);
    // The shell alone sets how a sheet arrives: no sheet has a pace of its own any more.
    expect(CSS).not.toMatch(/\[role="dialog"\]/);
  });

  // "After Q59: Slow down all the animations": the screen's fade too, at the map's tempo.
  it("fades the map's screen in over 0.45s (0.2s at the map's 2.25)", () => {
    render(
      <ReportMapScreen
        open
        left={3}
        progressIndex={58}
        total={62}
        onNext={() => {}}
        onPrevious={() => {}}
        onDismiss={() => {}}
      />
    );
    const dialog = document.querySelector('[data-survey-sheet="reportMap"] > [role="dialog"]');
    expect(dialog?.className).toContain(
      "motion-safe:animate-[survey-fade-in_0.45s_ease-out_backwards]"
    );
  });

  // "After Q14: can we have the quote appear a bit later and fade in slower".
  it("brings Trustpilot's quote in once every star has landed, and fades it in slower", () => {
    vi.stubEnv("NEXT_PUBLIC_TRUSTPILOT_ENABLED", "true");
    vi.stubEnv("NEXT_PUBLIC_TRUSTPILOT_SCORE", "4.4");
    vi.stubEnv("NEXT_PUBLIC_TRUSTPILOT_REVIEW_COUNT", "12");
    render(<TrustpilotSheet open {...handlers} />);
    const sheet = document.querySelector('[data-survey-sheet="trustpilot"]')!;
    expect(sheet).not.toBeNull();
    const stars = [...sheet.querySelectorAll("[data-tp-star]")].map(delayOf);
    expect(stars).toHaveLength(5);
    const landed = Math.max(...stars) + baseMs(".sheet-star");

    const rule = sheet.querySelector("[data-tp-rule]");
    const quote = sheet.querySelector("[data-tp-quote]");
    expect(quote?.className).toContain("sheet-quote");
    expect(quote?.textContent).toContain("Very interesting report");
    expect(delayOf(rule)).toBeGreaterThanOrEqual(landed);
    expect(delayOf(quote)).toBeGreaterThan(delayOf(rule));
    // Slower: at least twice a group's fade, on a curve whose fade is seen (the house curve
    // does most of its work in the first tenth).
    expect(baseMs(".sheet-quote")).toBeGreaterThanOrEqual(2 * baseMs(".sheet-in"));
    expect(ruleFor(".sheet-quote")).toMatch(/\bease-out\b/);
    // Nothing else in the sheet waits for the quote: it is the last to arrive. ("Excellent",
    // the five stars, the rule and the quote carry a delay.)
    const timed = sheet.querySelectorAll<HTMLElement>("[style*='--sheet-delay']");
    expect(timed).toHaveLength(8);
    for (const el of timed) {
      if (el !== quote) expect(delayOf(el)).toBeLessThan(delayOf(quote));
    }
  });
});

describe("Mark's second review of the sheets (13 Nov)", () => {
  const handlers = { onKeepGoing: () => {}, onDismiss: () => {} };
  afterEach(() => cleanup());

  it("counts the share it is set against up too, after the first", () => {
    render(<ScienceSheet open {...handlers} />);
    const counts = document.querySelectorAll('[data-survey-sheet="science"] [data-count-up]');
    expect(counts).toHaveLength(2);
  });

  it("brings the expert's card in as one piece: nothing inside it moves on its own", () => {
    render(<ExpertSheet open {...handlers} />);
    const sheet = document.querySelector('[data-survey-sheet="expert"]')!;
    expect(sheet).not.toBeNull();
    expect(
      sheet.querySelectorAll(".sheet-in, .sheet-settle, .sheet-step, .sheet-rise")
    ).toHaveLength(0);
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
