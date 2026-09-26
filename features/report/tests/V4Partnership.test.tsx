// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import V4Partnership from "@features/report/ui/v3/V4Partnership";
import { buildPartnership } from "@/data/report3-partnership";

/**
 * "Challenges in Partnership" — the chapter body Figma draws as 38:1679 (open,
 * inside the Part 5 page 334:829) and 305:358 (paywalled, 305:350): sixteen blocks
 * of prose, the Spark Seeker loop, a 44px rule and the result paragraph — then its
 * "Try this & see what shifts" card (399:219 / 399:240 / 399:260).
 */

const V3_CSS = readFileSync(join(__dirname, "..", "ui", "v3", "reportV3.css"), "utf8");
const OPEN = buildPartnership("Spark Seeker")!;
const LOCKED = buildPartnership("Spark Seeker", { locked: true })!;

const rule = (selector: string) => {
  const at = V3_CSS.indexOf(`${selector} {`);
  if (at < 0) throw new Error(`no rule for ${selector}`);
  return V3_CSS.slice(at, V3_CSS.indexOf("}", at));
};
const lineOf = (selector: string) => V3_CSS.slice(0, V3_CSS.indexOf(selector)).split("\n").length;

afterEach(cleanup);

describe("the chapter body — 38:1679", () => {
  it("runs the prose, the loop, a 44px rule and the result, in the frame's order", () => {
    const { container } = render(<V4Partnership view={OPEN} />);
    const body = container.querySelector(".rv4-cip")!;
    expect(body.getAttribute("data-node-id")).toBe("38:1679");
    expect([...body.children].map((el) => el.className.split(" ")[0])).toEqual([
      "rv4-cip__text",
      "rv4-loop",
      "rv4-sep",
      "rv4-cip__closing",
      "rv4-sep",
    ]);
    expect(body.querySelector(".rv4-sep")!.getAttribute("data-node-id")).toBe("612:335");
  });

  // Review 25.09, Mark (1941881246): staging ran the result into "Try this". The frames
  // now draw a 44px separator 16 under the result, 20 over the card (742:6653 / 742:6656).
  it("closes on a 44px separator before 'Try this', open and paywalled", () => {
    const open = render(<V4Partnership view={OPEN} />);
    const last = open.container.querySelector(".rv4-cip")!.lastElementChild!;
    expect(last).toHaveClass("rv4-sep");
    expect(last.getAttribute("data-node-id")).toBe("742:6653");
    expect(last.getAttribute("aria-hidden")).toBe("true");
    cleanup();
    const locked = render(<V4Partnership view={LOCKED} />);
    const lockedLast = locked.container.querySelector(".rv4-cip")!.lastElementChild!;
    expect(lockedLast).toHaveClass("rv4-sep");
    expect(lockedLast.getAttribute("data-node-id")).toBe("742:6656");
    // 16 (the body's gap) + 44 + 20 (its padding) over the card, nothing between.
    expect(rule(".rv3 .rv4-cip")).toContain("gap: 16px");
    expect(rule(".rv3 .rv4-cip")).toContain("padding: 20px 0");
    expect(rule(".rv3 .rv4-cip + .rv4-try")).toContain("margin-top: 0");
  });

  it("sets fifteen paragraphs and the inline 'Common challenges', nothing gated", () => {
    const { container } = render(<V4Partnership view={OPEN} />);
    const text = container.querySelector(".rv4-cip__text")!;
    expect(text.querySelectorAll(".rv4-prose__p")).toHaveLength(15);
    const heading = text.querySelectorAll(".rv4-prose__h");
    expect(heading).toHaveLength(1);
    expect(heading[0]!.textContent).toBe("Common challenges");
    expect(container.querySelector(".rv4-cip__gate")).toBeNull();
    expect(container.querySelector(".rv4-premium")).toBeNull();
    expect(container.querySelector(".rv4-loop")).not.toHaveClass("is-locked");
  });

  it("bolds the result from its second sentence, readable when open", () => {
    const { container } = render(<V4Partnership view={OPEN} />);
    const result = container.querySelector(".rv4-cip__closing")!;
    expect(result.getAttribute("data-node-id")).toBe("647:229");
    expect(result.querySelector("strong")!.textContent).toMatch(/^The more the partner tries/);
    expect(result).not.toHaveClass("is-blurred");
    expect(result.querySelector("[inert]")).toBeNull();
  });

  it("closes with its practice card, closed on arrival, one list of three when opened", () => {
    const { container } = render(<V4Partnership view={OPEN} />);
    const practice = container.querySelector(".rv4-cip + .rv4-try")!;
    expect(practice.getAttribute("data-node-id")).toBe("399:219");
    expect(practice.textContent).toContain("Read the full practice");
    fireEvent.click(practice.querySelector(".rv4-try__button")!);
    expect(practice.getAttribute("data-node-id")).toBe("399:240");
    const lists = practice.querySelectorAll("ol");
    expect(lists).toHaveLength(1);
    expect(lists[0]!.querySelectorAll("li")).toHaveLength(3);
  });
});

describe("the paywalled body — 305:358", () => {
  it("caps the ramp's fade where its scrambled tail starts, so none of it shows lightly blurred", () => {
    // Review 25.09: in the 588px desktop column paragraph 5's real part runs to three
    // lines, so the scrambled tail rose into the 105px band. useRampFit measures it.
    const box = (top: number) => ({ top, bottom: top, left: 0, right: 0, width: 0, height: 0 });
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
      this: HTMLElement
    ) {
      return box(this.classList.contains("rv4-cip__ramp") ? 1000 : 0) as DOMRect;
    });
    vi.spyOn(Element.prototype, "getClientRects").mockImplementation(function (this: Element) {
      const rects = this.classList.contains("rv4-prose__veiled")
        ? [{ ...box(1079), width: 40 }]
        : [];
      return rects as unknown as DOMRectList;
    });
    try {
      const { container } = render(<V4Partnership view={LOCKED} />);
      const ramp = container.querySelector<HTMLElement>(".rv4-cip__ramp")!;
      expect(ramp.querySelector(".rv4-prose__veiled")).not.toBeNull();
      expect(ramp.style.getPropertyValue("--rv4-band-fit")).toBe("79px");
    } finally {
      vi.restoreAllMocks();
    }
  });

  it("keeps paragraphs 1-4 sharp and ramps the blur in over paragraph 5", () => {
    const { container } = render(<V4Partnership view={LOCKED} />);
    const body = container.querySelector(".rv4-cip")!;
    expect(body).toHaveClass("is-locked");
    expect(body.getAttribute("data-node-id")).toBe("305:358");
    const text = container.querySelector(".rv4-cip__text")!;
    const sharp = [...text.children].filter((el) => el.classList.contains("rv4-prose__p"));
    expect(sharp).toHaveLength(4);
    const gated = container.querySelector(".rv4-cip__gated")!;
    expect(gated.getAttribute("aria-hidden")).toBe("true");
    expect(gated.hasAttribute("inert")).toBe(true);
    expect(gated.querySelector(".rv4-cip__ramp .rv4-pblur")).not.toBeNull();
    expect(gated.querySelector(".rv4-cip__blurred")).not.toBeNull();
  });

  it("floats the chapter-body Premium card on the gate, as 305:362 draws it", () => {
    const { container } = render(<V4Partnership view={LOCKED} />);
    const card = container.querySelector(".rv4-cip__gate > .rv4-premium")!;
    expect(card).toHaveClass("rv4-premium--guarantee");
    expect(card.getAttribute("data-node-id")).toBe("305:362");
  });

  it("opens the paywall once from the gate, its card, the loop or the blurred result", () => {
    const onUnlock = vi.fn();
    const { container } = render(<V4Partnership view={LOCKED} onUnlock={onUnlock} />);
    fireEvent.click(container.querySelector(".rv4-cip__gated")!);
    expect(onUnlock).toHaveBeenCalledTimes(1);
    fireEvent.click(container.querySelector(".rv4-cip__gate .rv4-premium button")!);
    expect(onUnlock).toHaveBeenCalledTimes(2);
    fireEvent.click(container.querySelector(".rv4-loop")!);
    expect(onUnlock).toHaveBeenCalledTimes(3);
    // The paragraph itself is inert, so a real tap lands on its wrapper, which owns it.
    fireEvent.click(container.querySelector(".rv4-cip__closing-text")!);
    expect(onUnlock).toHaveBeenCalledTimes(4);
  });

  it("blurs the loop and the result, and gates the practice with its list numbered on", () => {
    const { container } = render(<V4Partnership view={LOCKED} />);
    expect(container.querySelector(".rv4-loop")).toHaveClass("is-locked");
    const result = container.querySelector(".rv4-cip__closing")!;
    expect(result).toHaveClass("is-blurred");
    expect(result.getAttribute("data-node-id")).toBe("659:234");
    expect(result.hasAttribute("inert")).toBe(false);
    const text = result.querySelector(".rv4-cip__closing-text")!;
    expect(text.hasAttribute("inert")).toBe(true);
    expect(text.getAttribute("aria-hidden")).toBe("true");
    const practice = container.querySelector<HTMLElement>(".rv4-cip + .rv4-try")!;
    // 399:219's 240px teaser box; 399:260's card 528px down the card, measured at 393
    // with the real fonts as 147.5px below the gate.
    expect(practice.style.getPropertyValue("--rv4-try-teaser-h")).toBe("240px");
    expect(practice.style.getPropertyValue("--rv4-try-premium-top")).toBe("147.5px");
    fireEvent.click(practice.querySelector(".rv4-try__button")!);
    expect(practice.getAttribute("data-node-id")).toBe("399:260");
    const tail = practice.querySelector<HTMLOListElement>(".rv4-try__blurred ol");
    expect(tail).not.toBeNull();
    expect(tail!.start).toBe(3);
    // The practice's tail sits under the blur; since review 26.09 the copy under the blur is the real one (lockedBlurCopy.ts).
    expect(practice.querySelector(".rv4-try__blurred")!.textContent).toMatch(
      /keep the commitment clear/
    );
  });
});

describe("the CSS contract", () => {
  it("appends every rule below the frozen top of reportV3.css", () => {
    expect(lineOf(".rv3 .rv4-cip {")).toBeGreaterThan(1884);
  });

  it("sets 'Common challenges' as drawn — Lora Bold 18/21.6 on the text's 41.6 baseline step", () => {
    const h = rule(".rv3 .rv4-cip .rv4-prose__h");
    expect(h).toContain("font-size: 18px");
    expect(h).toContain("line-height: 21.6px");
    expect(h).toContain("margin: 0 0 18.06px");
    expect(rule(".rv3 .rv4-cip .rv4-prose__p:has(+ .rv4-prose__h)")).toContain(
      "margin-bottom: 17.94px"
    );
  });

  it("leaves the frame's air above the loop and sets the closed pill 200px into the teaser", () => {
    expect(rule(".rv3 .rv4-cip__text + .rv4-loop")).toContain("margin-top: 24px");
    expect(rule(".rv3 .rv4-cip + .rv4-try .rv4-try__open")).toContain(
      "bottom: calc(var(--rv4-try-teaser-h, 218px) - 232px)"
    );
  });

  it("never runs the progressive blur past a ramp's scrambled tail (--rv4-band-fit)", () => {
    const at = V3_CSS.lastIndexOf(".rv3 .rv4-pblur {");
    expect(V3_CSS.slice(0, at).split("\n").length).toBeGreaterThan(1884);
    expect(V3_CSS.slice(at, V3_CSS.indexOf("}", at))).toContain(
      "--rv4-band-eff: min(var(--rv4-band, 76px), var(--rv4-band-fit, 100000px));"
    );
    for (const n of [1, 2, 3]) {
      const layer = V3_CSS.lastIndexOf(`.rv3 .rv4-pblur > span:nth-child(${n}) {`);
      expect(layer, `layer ${n}`).toBeGreaterThan(at);
      const body = V3_CSS.slice(layer, V3_CSS.indexOf("}", layer));
      expect(body).toContain("var(--rv4-band-eff)");
      expect(body).not.toContain("var(--rv4-band,");
    }
  });

  it("ramps the blur in over ~105px and floats the card 282px into the gate", () => {
    expect(rule(".rv3 .rv4-cip__ramp")).toContain("--rv4-band: 105px");
    expect(rule(".rv3 .rv4-cip__blurred")).toContain("filter: blur(var(--rv4-veil, 5px))");
    expect(rule(".rv3 .rv4-cip__gate .rv4-premium")).toContain("top: 282px");
  });

  it("sets the practice list flush, 21px in and 8px above what follows (399:259)", () => {
    const list = rule(".rv3 .rv4-cip + .rv4-try .rv4-prose__list");
    expect(list).toContain("margin: 0 0 8px");
    expect(rule(".rv3 .rv4-cip + .rv4-try .rv4-prose__list li")).toContain("margin-bottom: 0");
  });
});
