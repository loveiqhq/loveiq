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
    ]);
    expect(body.querySelector(".rv4-sep")!.getAttribute("data-node-id")).toBe("612:335");
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
    const practice = container.querySelector(".rv4-cip + .rv4-try")!;
    fireEvent.click(practice.querySelector(".rv4-try__button")!);
    expect(practice.getAttribute("data-node-id")).toBe("399:260");
    const tail = practice.querySelector<HTMLOListElement>(".rv4-try__blurred ol");
    expect(tail).not.toBeNull();
    expect(tail!.start).toBe(3);
    expect(screen.queryByText(/keep the commitment clear/)).toBeNull();
  });
});

describe("the CSS contract", () => {
  it("appends every rule below the frozen top of reportV3.css", () => {
    expect(lineOf(".rv3 .rv4-cip {")).toBeGreaterThan(1884);
  });

  it("sets 'Common challenges' as drawn — Lora Bold 18/21.6, 16 either side", () => {
    const h = rule(".rv3 .rv4-cip .rv4-prose__h");
    expect(h).toContain("font-size: 18px");
    expect(h).toContain("line-height: 21.6px");
    expect(rule(".rv3 .rv4-cip .rv4-prose__p:has(+ .rv4-prose__h)")).toContain(
      "margin-bottom: 16px"
    );
  });

  it("ramps the blur in over ~105px and floats the card 282px into the gate", () => {
    expect(rule(".rv3 .rv4-cip__ramp")).toContain("--rv4-band: 105px");
    expect(rule(".rv3 .rv4-cip__blurred")).toContain("filter: blur(2.5px)");
    expect(rule(".rv3 .rv4-cip__gate .rv4-premium")).toContain("top: 282px");
  });

  it("sets the practice list flush, 21px in and 8px above what follows (399:259)", () => {
    const list = rule(".rv3 .rv4-cip + .rv4-try .rv4-prose__list");
    expect(list).toContain("margin: 0 0 8px");
    expect(rule(".rv3 .rv4-cip + .rv4-try .rv4-prose__list li")).toContain("margin-bottom: 0");
  });
});
