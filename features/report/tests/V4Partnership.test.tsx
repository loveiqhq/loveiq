// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import V4Partnership from "@features/report/ui/v3/V4Partnership";
import { buildPartnership, PARTNERSHIP_RAMP_THROUGH } from "@/data/report3-partnership";

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
const firstClass = (el: Element) => el.className.split(" ")[0];
/** The slimmed chapter's two sections (16.10): the archetype's challenges, then the common. */
const sections = (container: HTMLElement) =>
  [...container.querySelector(".rv4-cip")!.children].filter((el) =>
    el.classList.contains("rv4-sect")
  );

afterEach(cleanup);

describe("the chapter body — 38:1679", () => {
  it("runs the opening, its two sections, the loop, a 44px rule and the result (1665:6941)", () => {
    const { container } = render(<V4Partnership view={OPEN} archetype="Spark Seeker" />);
    const body = container.querySelector(".rv4-cip")!;
    expect(body.getAttribute("data-node-id")).toBe("38:1679");
    expect([...body.children].map(firstClass)).toEqual([
      "rv4-cip__text",
      "rv4-sect",
      "rv4-sect",
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
    const open = render(<V4Partnership view={OPEN} archetype="Spark Seeker" />);
    const last = open.container.querySelector(".rv4-cip")!.lastElementChild!;
    expect(last).toHaveClass("rv4-sep");
    expect(last.getAttribute("data-node-id")).toBe("742:6653");
    expect(last.getAttribute("aria-hidden")).toBe("true");
    cleanup();
    const locked = render(<V4Partnership view={LOCKED} archetype="Spark Seeker" />);
    const lockedLast = locked.container.querySelector(".rv4-cip")!.lastElementChild!;
    expect(lockedLast).toHaveClass("rv4-sep");
    expect(lockedLast.getAttribute("data-node-id")).toBe("742:6656");
    // 16 (the body's gap) + 44 + 20 (its padding) over the card, nothing between.
    expect(rule(".rv3 .rv4-cip")).toContain("gap: 16px");
    expect(rule(".rv3 .rv4-cip")).toContain("padding: 20px 0");
    expect(rule(".rv3 .rv4-cip + .rv4-try")).toContain("margin-top: 0");
  });

  it("sets its fifteen paragraphs in the opening and the two sections, nothing gated", () => {
    const { container } = render(<V4Partnership view={OPEN} archetype="Spark Seeker" />);
    // Sanjin's two-paragraph opening.
    expect(container.querySelectorAll(".rv4-cip__text .rv4-prose__p")).toHaveLength(2);
    const [own, common] = sections(container);
    expect(own!.querySelector(".rv4-sect__name")!.textContent).toBe("The Spark Seeker Challenges");
    expect(common!.querySelector(".rv4-sect__name")!.textContent).toBe("Common Challenges");
    // The archetype's three, folded; the inline heading is the second section's row, its
    // ten paragraphs under it, the first sharp and the rest folded.
    const inner = (el: Element) => el.querySelector(".rv4-sect__inner")!;
    expect([...inner(own!).children].map(firstClass)).toEqual(["rv4-fold"]);
    expect(inner(own!).querySelectorAll(".rv4-prose__p")).toHaveLength(3);
    expect([...inner(common!).children].map(firstClass)).toEqual(["rv4-prose__p", "rv4-fold"]);
    expect(inner(common!).querySelectorAll(".rv4-prose__p")).toHaveLength(10);
    expect(container.querySelector(".rv4-cip .rv4-prose__h")).toBeNull();
    expect(container.querySelector(".rv4-unlock, .rv4-sect.is-locked")).toBeNull();
    expect(container.querySelector(".rv4-premium")).toBeNull();
    expect(container.querySelector(".rv4-loop")).not.toHaveClass("is-locked");
  });

  it("bolds the result from its second sentence, readable when open", () => {
    const { container } = render(<V4Partnership view={OPEN} archetype="Spark Seeker" />);
    const result = container.querySelector(".rv4-cip__closing")!;
    expect(result.getAttribute("data-node-id")).toBe("647:229");
    expect(result.querySelector("strong")!.textContent).toMatch(/^The more the partner tries/);
    expect(result).not.toHaveClass("is-blurred");
    expect(result.querySelector("[inert]")).toBeNull();
  });

  it("closes with its practice card, closed on arrival, one list of three when opened", () => {
    const { container } = render(<V4Partnership view={OPEN} archetype="Spark Seeker" />);
    const practice = container.querySelector(".rv4-cip + .rv4-try")!;
    expect(practice.getAttribute("data-node-id")).toBe("399:219");
    expect(practice.textContent).toContain("Read all");
    fireEvent.click(practice.querySelector(".rv4-try__button")!);
    expect(practice.getAttribute("data-node-id")).toBe("399:240");
    const lists = practice.querySelectorAll("ol");
    expect(lists).toHaveLength(1);
    expect(lists[0]!.querySelectorAll("li")).toHaveLength(3);
  });
});

describe("the paywalled body — 305:358", () => {
  it("keeps paragraphs 1-4: the opening sharp, the archetype's two folded over the wall", () => {
    const { container } = render(<V4Partnership view={LOCKED} archetype="Spark Seeker" />);
    const body = container.querySelector(".rv4-cip")!;
    expect(body).toHaveClass("is-locked");
    expect(body.getAttribute("data-node-id")).toBe("305:358");
    expect(container.querySelectorAll(".rv4-cip__text .rv4-prose__p")).toHaveLength(2);
    const own = sections(container)[0]!.querySelector(".rv4-sect__inner")!;
    expect([...own.children].map(firstClass)).toEqual(["rv4-fold"]);
    const fold = own.querySelector(".rv4-fold")!;
    expect(fold).toHaveClass("has-wall");
    expect([...fold.querySelector(".rv4-fold__copy")!.children].map(firstClass)).toEqual([
      "rv4-prose__p",
      "rv4-prose__p",
      "rv4-unlock",
    ]);
  });

  it("samples paragraph 5 through its fade band only, nothing veiled and no blur", () => {
    const { container } = render(<V4Partnership view={LOCKED} archetype="Spark Seeker" />);
    const sample = container.querySelector(".rv4-cip .rv4-unlock__sample")!;
    expect(sample.getAttribute("aria-hidden")).toBe("true");
    expect(sample.hasAttribute("inert")).toBe(true);
    expect(sample.textContent!.endsWith(PARTNERSHIP_RAMP_THROUGH)).toBe(true);
    expect(sample.querySelector(".rv4-prose__veiled, .rv4-pblur")).toBeNull();
  });

  it("draws Common Challenges locked, its heading and the lock, with no body (16.10)", () => {
    const { container } = render(<V4Partnership view={LOCKED} archetype="Spark Seeker" />);
    const common = sections(container)[1]!;
    expect(common).toHaveClass("is-locked");
    expect(common.querySelector(".rv4-sect__name")!.textContent).toBe("Common Challenges");
    expect(common.querySelector(".rv4-sect__inner")).toBeNull();
    expect(common.querySelector(".rv4-sect__head")!.hasAttribute("aria-expanded")).toBe(false);
  });

  it("draws no card on the wall: 'Unlock Full Chapter' where 1015:1257 floated", () => {
    const { container } = render(<V4Partnership view={LOCKED} archetype="Spark Seeker" />);
    expect(container.querySelector(".rv4-cip .rv4-premium")).toBeNull();
    expect(container.querySelector(".rv4-cip .rv4-unlock__pill")!.textContent).toBe(
      "Unlock Full Chapter"
    );
  });

  it("opens the paywall once from the wall, the locked section, the loop or the blurred result", () => {
    const onUnlock = vi.fn();
    const { container } = render(
      <V4Partnership view={LOCKED} archetype="Spark Seeker" onUnlock={onUnlock} />
    );
    const surfaces = [
      container.querySelector(".rv4-cip .rv4-unlock__sample")!,
      container.querySelector(".rv4-cip .rv4-unlock__pill")!,
      container.querySelector(".rv4-cip .rv4-sect.is-locked .rv4-sect__head")!,
      container.querySelector(".rv4-loop")!,
      // The paragraph itself is inert, so a real tap lands on its wrapper, which owns it.
      container.querySelector(".rv4-cip__closing-text")!,
    ];
    for (const surface of surfaces) {
      onUnlock.mockClear();
      fireEvent.click(surface);
      expect(onUnlock).toHaveBeenCalledTimes(1);
    }
    // The open section's row folds it; it never sells.
    onUnlock.mockClear();
    fireEvent.click(sections(container)[0]!.querySelector(".rv4-sect__head")!);
    expect(onUnlock).not.toHaveBeenCalled();
  });

  it("blurs the loop and the result, and gates the practice with its list numbered on", () => {
    const { container } = render(<V4Partnership view={LOCKED} archetype="Spark Seeker" />);
    expect(container.querySelector(".rv4-loop")).toHaveClass("is-locked");
    const result = container.querySelector(".rv4-cip__closing")!;
    expect(result).toHaveClass("is-blurred");
    expect(result.getAttribute("data-node-id")).toBe("659:234");
    expect(result.hasAttribute("inert")).toBe(false);
    const text = result.querySelector(".rv4-cip__closing-text")!;
    expect(text.hasAttribute("inert")).toBe(true);
    expect(text.getAttribute("aria-hidden")).toBe("true");
    const practice = container.querySelector<HTMLElement>(".rv4-cip + .rv4-try")!;
    // Since Mark's rehaul (28.09) 399:219 draws the shared 196px teaser box, so the
    // card carries none of its own. 399:260's paywall card (1015:1302, 29.09) 219.5px
    // below the gate — 72 lower than the old one's 147.5.
    expect(practice.style.getPropertyValue("--rv4-try-teaser-h")).toBe("");
    expect(practice.style.getPropertyValue("--rv4-try-premium-top")).toBe("219.5px");
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

  it("leaves the frame's air above the loop, and the closed pill where every chapter's is", () => {
    expect(rule(".rv3 .rv4-cip__text + .rv4-loop")).toContain("margin-top: 24px");
    // The rehaul sets 399:219's pill at 298 of the card like the others (28.09).
    expect(V3_CSS).not.toContain(".rv3 .rv4-cip + .rv4-try .rv4-try__open {");
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

  it("ramps the blur in over ~105px and floats the card 303px into the gate", () => {
    expect(rule(".rv3 .rv4-cip__ramp")).toContain("--rv4-band: 105px");
    expect(rule(".rv3 .rv4-cip__blurred")).toContain("filter: blur(var(--rv4-veil, 5px))");
    expect(rule(".rv3 .rv4-cip__gate .rv4-premium")).toContain(
      "top: clamp(0px, 100% - 363px, 303px)"
    );
  });

  it("sets the practice list flush, 21px in and 8px above what follows (399:259)", () => {
    const list = rule(".rv3 .rv4-cip + .rv4-try .rv4-prose__list");
    expect(list).toContain("margin: 0 0 8px");
    expect(rule(".rv3 .rv4-cip + .rv4-try .rv4-prose__list li")).toContain("margin-bottom: 0");
  });
});
