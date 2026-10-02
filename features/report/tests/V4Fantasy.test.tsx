// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import V4Fantasy from "@features/report/ui/v3/V4Fantasy";
import { buildFantasy, REPORT_V4_FANTASY } from "@/data/report3-fantasy";

/**
 * Fantasy vs. Reality's chapter body — Figma 304:290 (open) and 305:217
 * (paywalled) — and the practice card that follows it (441:6422 / 441:6168 /
 * 441:6188). Built from the same server view production renders.
 */

const V3_CSS = readFileSync(join(__dirname, "..", "ui", "v3", "reportV3.css"), "utf8");
const OPEN = buildFantasy("Spark Seeker")!;
const LOCKED = buildFantasy("Spark Seeker", { locked: true })!;
const SPARK = REPORT_V4_FANTASY["Spark Seeker"]!;

afterEach(cleanup);

const body = (root: HTMLElement) => root.querySelector<HTMLElement>(".rv4-fvr")!;

const partsOf = (root: HTMLElement) =>
  [...body(root).children].map((el) => el.getAttribute("data-node-id") ?? el.className);

describe("V4Fantasy — open (304:290)", () => {
  it("runs the intro, the map, the table and 'Common challenges' 44px apart, then 44 more", () => {
    const { container } = render(<V4Fantasy view={OPEN} />);
    // The first separator is ours: 304:290 sets the map flush under the intro.
    expect(partsOf(container)).toEqual([
      "304:291",
      "rv4-sep",
      "696:4393",
      "368:1925",
      "639:308",
      "368:5447",
      "368:1920",
      "696:6060",
    ]);
    const seps = body(container).querySelectorAll(":scope > .rv4-sep");
    expect(seps).toHaveLength(4);
    seps.forEach((sep) => expect(sep.getAttribute("aria-hidden")).toBe("true"));
    expect(body(container).getAttribute("data-node-id")).toBe("304:290");
  });

  it("maps the reader's own dots, in the clear", () => {
    const { container } = render(<V4Fantasy view={OPEN} />);
    const map = body(container).querySelector<HTMLElement>(".rv4-fvm")!;
    expect(map.querySelectorAll(".rv4-fvm__dot")).toHaveLength(16);
    expect([...map.querySelectorAll(".rv4-fvm__name")].map((n) => n.textContent)).toEqual(
      OPEN.mapDots!.filter((d) => d.label).map((d) => d.label)
    );
    expect(map.querySelector(".rv4-fvm__lock")).toBeNull();
  });

  it("sets the intro's eleven paragraphs and its heading", () => {
    const { container } = render(<V4Fantasy view={OPEN} />);
    const intro = body(container).querySelector('[data-node-id="304:291"]')!;
    expect(intro.querySelectorAll(".rv4-prose__p")).toHaveLength(11);
    expect(intro.querySelector(".rv4-prose__h")!.textContent).toBe(
      "What a Fantasy Might Actually Be About"
    );
  });

  it("sets 'Common challenges' and its thirteen paragraphs in the clear", () => {
    const { container } = render(<V4Fantasy view={OPEN} />);
    const challenges = body(container).querySelector<HTMLElement>('[data-node-id="368:1920"]')!;
    expect(challenges.querySelector(".rv4-prose__h")!.textContent).toBe("Common Challenges");
    expect(challenges.querySelectorAll(".rv4-prose__p")).toHaveLength(13);
    expect(challenges.closest("[inert]")).toBeNull();
    expect(body(container).querySelector(".rv4-premium")).toBeNull();
  });

  it("follows with the practice card, closed, on this chapter's frames", () => {
    const { container } = render(<V4Fantasy view={OPEN} />);
    const card = container.querySelector<HTMLElement>(".rv4-fvr + .rv4-try")!;
    expect(card.getAttribute("data-node-id")).toBe("441:6422");
    expect(card.style.getPropertyValue("--rv4-try-band")).toBe("84.5px");
    expect(card.style.getPropertyValue("--rv4-try-gated-pt")).toBe("8px");
    expect(card.style.getPropertyValue("--rv4-try-premium-top")).toBe("167.3px");
    // The frame's teaser draws Typical Beliefs' nine lines and fade: the default box.
    expect(card.style.getPropertyValue("--rv4-try-teaser-h")).toBe("");
    fireEvent.click(card.querySelector(".rv4-try__button")!);
    expect(card.getAttribute("data-node-id")).toBe("441:6168");
  });
});

describe("V4Fantasy — paywalled (305:217)", () => {
  it("runs the same blocks on 305:217's frames", () => {
    const { container } = render(<V4Fantasy view={LOCKED} onUnlock={() => {}} />);
    expect(partsOf(container)).toEqual([
      "304:291",
      "rv4-sep",
      "368:3481",
      "696:6063",
      "639:1905",
      "368:5447",
      "305:228",
      "696:6057",
    ]);
  });

  it("blurs the map's plot behind its badge, and a tap on it opens the paywall", () => {
    const unlock = vi.fn();
    const { container } = render(<V4Fantasy view={LOCKED} onUnlock={unlock} />);
    const map = body(container).querySelector<HTMLElement>(".rv4-fvm")!;
    expect(map.querySelector(".rv4-fvm__blurred")!.hasAttribute("inert")).toBe(true);
    fireEvent.click(map.querySelector(".rv4-fvm__blurred")!);
    expect(unlock).toHaveBeenCalledTimes(1);
  });

  it("keeps the intro sharp", () => {
    const { container } = render(<V4Fantasy view={LOCKED} onUnlock={() => {}} />);
    const intro = body(container).querySelector<HTMLElement>('[data-node-id="304:291"]')!;
    expect(intro.closest("[inert]")).toBeNull();
    expect(intro.textContent).toContain(
      "A sexual fantasy can feel like evidence. If a scene is intensely arousing"
    );
  });

  it("blurs 'Common challenges' whole, with the Premium card on it", () => {
    const { container } = render(<V4Fantasy view={LOCKED} onUnlock={() => {}} />);
    const gate = body(container).querySelector<HTMLElement>(".rv4-fvr__gate")!;
    expect(gate.getAttribute("data-node-id")).toBe("305:228");
    const blurred = gate.querySelector<HTMLElement>(".rv4-fvr__blurred")!;
    expect(blurred.getAttribute("aria-hidden")).toBe("true");
    expect(blurred.hasAttribute("inert")).toBe(true);
    expect(blurred.querySelectorAll(".rv4-prose__p")).toHaveLength(13);
    // Under the blur and out of reach of assistive tech; since review 26.09 the copy under the blur is the real one (lockedBlurCopy.ts).
    expect(blurred.textContent).toContain(
      "A fantasy often works because reality has been edited out."
    );
    const card = gate.querySelector(".rv4-premium")!;
    expect(card).toHaveClass("rv4-premium--body");
    expect(card.getAttribute("data-node-id")).toBe("1015:1379");
  });

  it("opens the paywall once per tap on the blurred copy or its card", () => {
    const unlock = vi.fn();
    const { container } = render(<V4Fantasy view={LOCKED} onUnlock={unlock} />);
    const gate = body(container).querySelector<HTMLElement>(".rv4-fvr__gate")!;
    fireEvent.click(gate.querySelector(".rv4-fvr__blurred")!);
    expect(unlock).toHaveBeenCalledTimes(1);
    fireEvent.click(gate.querySelector(".rv4-premium button")!);
    expect(unlock).toHaveBeenCalledTimes(2);
  });

  it("gates the practice after paragraph 3, the card measured from the gate", () => {
    const { container } = render(<V4Fantasy view={LOCKED} onUnlock={() => {}} />);
    const card = container.querySelector<HTMLElement>(".rv4-fvr + .rv4-try")!;
    fireEvent.click(card.querySelector(".rv4-try__button")!);
    expect(card.getAttribute("data-node-id")).toBe("441:6188");
    expect(card).toHaveClass("is-gated");
    expect(card.querySelectorAll(".rv4-try__body > .rv4-prose__p")).toHaveLength(3);
    expect(card.querySelector(".rv4-try__gate > .rv4-premium")).not.toBeNull();
  });

  it("lays out the same blocks either way, so nothing jumps on unlock", () => {
    const blocksOf = (root: HTMLElement) =>
      [...body(root).querySelectorAll(".rv4-prose__p, .rv4-prose__h")].length;
    const open = render(<V4Fantasy view={OPEN} />).container;
    const openCount = blocksOf(open);
    cleanup();
    const locked = render(<V4Fantasy view={LOCKED} onUnlock={() => {}} />).container;
    expect(blocksOf(locked)).toBe(openCount);
    expect(openCount).toBe(SPARK.intro.length + SPARK.challenges.length);
  });
});

describe("reportV3.css — Fantasy vs. Reality body contracts", () => {
  const ruleOf = (selector: string) => {
    const at = V3_CSS.lastIndexOf(`${selector} {`);
    expect(at, selector).toBeGreaterThan(0);
    return V3_CSS.slice(at, V3_CSS.indexOf("}", at));
  };

  // Review 27.09, Mark (Divider.jpeg): "That space feels a bit wide. Is that more than a
  // separator element in figma?" It was — 305:225 spaces the table, its separator and the
  // blurred copy 16 apart, 76 in all. One 44px separator now, as the open body (304:290)
  // has; the 29.09 card sits 258.3 into the copy (1015:1379), still further clear of the
  // dropdown Mark asked it to move off on 25.09 (1941866053).
  it("paywalled, leaves one 44px separator between the table and the blurred copy", () => {
    expect(V3_CSS).not.toMatch(/\.rv4-fvr\.is-locked > \.rv4-fvt \+ \.rv4-sep\s*\{/);
    expect(ruleOf(".rv3 .rv4-fvr__gate .rv4-premium")).toContain(
      "top: clamp(0px, 100% - 363px, 258.3px)"
    );
  });

  it("sets the body copy 16/25.6 in the copy grey, its bold runs in ink", () => {
    const p = ruleOf(".rv3 .rv4-fvr .rv4-prose__p");
    expect(p).toContain("font-size: 16px");
    expect(p).toContain("line-height: 25.6px");
    expect(p).toContain("color: var(--rv3-copy)");
    expect(ruleOf(".rv3 .rv4-fvr .rv4-prose__p strong")).toContain("color: var(--rv3-ink)");
  });

  it("keeps the frame's baseline steps through a heading: 47.6 into it, 41.6 out", () => {
    const h = ruleOf(".rv3 .rv4-fvr .rv4-prose__h");
    expect(h).toContain("font-size: 18px");
    expect(h).toContain("line-height: 21.6px");
    expect(h).toContain("margin: 0 0 18.06px");
    expect(ruleOf(".rv3 .rv4-fvr .rv4-prose__p:has(+ .rv4-prose__h)")).toContain(
      "margin-bottom: 23.94px"
    );
  });

  it("leaves 20 under the last separator, as 334:1137 now sets the practice card 64 under the last line", () => {
    expect(ruleOf(".rv3 .rv4-fvr")).toContain("padding: 20px 0;");
  });

  // Mark's rehaul (28.09): 441:6422 is 343 tall now, like every chapter's teaser card.
  it("ends the closed card where every chapter's does, 343 tall", () => {
    expect(V3_CSS).not.toContain(".rv3 .rv4-fvr + .rv4-try:not(.is-open) {");
  });
});

/**
 * Mark, desktop review 01.10: "Can we have a horizontal divider line (that we currently
 * use before a new Part), but just have it be half the width and centrally aligned and
 * place it after the last Ritual, Tantra & Conscious Sex category". The separator under
 * the table (368:5447) carries it from 700px: a 1px hairline across half the column,
 * centred in the 44px, fading out at both ends where the Part rule fades one way.
 */
describe("V4Fantasy — the divider after the table (desktop review 01.10)", () => {
  const between = (css: string, from: string) => {
    const at = css.indexOf(from);
    expect(at, from).toBeGreaterThan(-1);
    return css.slice(at, css.indexOf("}", at));
  };

  it("marks the separator after the table, open and locked, without adding a child", () => {
    for (const view of [OPEN, LOCKED]) {
      const { container } = render(<V4Fantasy view={view} />);
      const sep = container.querySelector('.rv4-fvr > [data-node-id="368:5447"]')!;
      expect(sep).toHaveClass("rv4-sep", "rv4-sep--rule");
      expect(sep.previousElementSibling).toHaveClass("rv4-fvt");
      expect(container.querySelectorAll(".rv4-sep--rule")).toHaveLength(1);
      cleanup();
    }
  });

  it("draws it from 700px only: half the table, on its axis, fading at both ends", () => {
    const desktop = V3_CSS.slice(V3_CSS.indexOf("/* ══ Fantasy vs. Reality's divider"));
    expect(desktop.startsWith("/* ══ Fantasy vs. Reality's divider")).toBe(true);
    expect(desktop).toContain("@media (min-width: 700px) {");
    const line = between(desktop, ".rv3.rv4 .rv4-fvr > .rv4-sep--rule::before {");
    // The table and the map are 760 wide at the column's left (min(760px, 100%)), so
    // the line is half that, a quarter in: centred under them, not under the column.
    expect(line).toContain("width: min(380px, 50%);");
    expect(line).toContain("margin-left: min(190px, 25%);");
    expect(line).toContain("height: 1px;");
    // Prettier sets a long gradient a stop a line: read it flat.
    const flat = line.replace(/\(\s+/g, "(").replace(/\s+\)/g, ")").replace(/,\s+/g, ", ");
    expect(flat).toContain(
      "linear-gradient(90deg, rgba(22, 16, 33, 0), rgba(22, 16, 33, 0.1) 50%, rgba(22, 16, 33, 0))"
    );
    const box = between(desktop, ".rv3.rv4 .rv4-fvr > .rv4-sep--rule {");
    expect(box).toContain("align-items: center;");
  });
});
