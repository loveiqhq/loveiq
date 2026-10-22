// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import V4Accelerators from "@features/report/ui/v3/V4Accelerators";
import { buildAccelerators } from "@/data/report3-accelerators";

/**
 * "Chapter — Accelerator & Brakes" — Figma 310:229 (open, inside the Part IV page
 * 334:521) and 314:219 (paywalled, 314:211), followed by its "Try this & see what
 * shifts" card (377:221 / 374:304 / 375:221).
 */

const V3_CSS = readFileSync(join(__dirname, "..", "ui", "v3", "reportV3.css"), "utf8");
const OPEN = buildAccelerators("Spark Seeker")!;
const LOCKED = buildAccelerators("Spark Seeker", { locked: true })!;

/** The chapter's two sections (16.10): "The Spark Seeker", then "Common Challenges". */
const sections = (container: HTMLElement) =>
  [...container.querySelector(".rv4-ab")!.children].filter((el) =>
    el.classList.contains("rv4-sect")
  );
const firstClass = (el: Element) => el.className.split(" ")[0];

afterEach(cleanup);

describe("the chapter body — 310:229", () => {
  // Figma's two lead lines (311:411, 311:413) went with Sanjin's doc on 02.10: no text before
  // or between the lists.
  it("runs the opening, then 'The Spark Seeker' over both cards, then Common Challenges (16.10)", () => {
    const { container } = render(<V4Accelerators view={OPEN} archetype="Spark Seeker" />);
    const body = container.querySelector(".rv4-ab")!;
    expect(body.getAttribute("data-node-id")).toBe("310:229");
    expect([...body.children].map(firstClass)).toEqual(["rv4-ab__intro", "rv4-sect", "rv4-sect"]);
    const [own, challenges] = sections(container);
    expect(own!.querySelector(".rv4-sect__name")!.textContent).toBe("The Spark Seeker");
    expect(challenges!.querySelector(".rv4-sect__name")!.textContent).toBe("Common Challenges");
    // Sanjin's slimmed opening is two paragraphs; the archetype's own two fold under its name.
    expect(body.querySelectorAll(".rv4-ab__intro .rv4-prose__p")).toHaveLength(2);
    const inner = own!.querySelector(".rv4-sect__inner")!;
    expect([...inner.children].map(firstClass)).toEqual(["rv4-fold", "rv4-trig", "rv4-trig"]);
    expect(inner.querySelectorAll(".rv4-fold .rv4-prose__p")).toHaveLength(2);
    // Figma's two lead lines (311:411, 311:413) went with Sanjin's doc on 02.10.
    expect(body.querySelectorAll(".rv4-ab__lead")).toHaveLength(0);
    expect(inner.querySelector(".rv4-trig--brake")).not.toBeNull();
    expect(inner.querySelector(".rv4-trig--accel")).not.toBeNull();
  });

  it("sets Common Challenges over its seven paragraphs, the first sharp, the rest folded", () => {
    const { container } = render(<V4Accelerators view={OPEN} archetype="Spark Seeker" />);
    const inner = sections(container)[1]!.querySelector(".rv4-sect__inner")!;
    expect(inner.querySelectorAll(".rv4-prose__p")).toHaveLength(7);
    expect(inner.firstElementChild).toHaveClass("rv4-prose__p");
    expect(inner.querySelectorAll(".rv4-fold .rv4-prose__p")).toHaveLength(6);
    expect(container.querySelector(".rv4-unlock")).toBeNull();
    expect(container.querySelector(".rv4-premium")).toBeNull();
  });

  it("keeps bold runs in the paragraph's own colour, as 310:231 draws them", () => {
    const { container } = render(<V4Accelerators view={OPEN} archetype="Spark Seeker" />);
    const bold = (el: Element) => [...el.querySelectorAll("strong")].map((b) => b.textContent);
    // Sanjin's slimmed opening bolds the two systems (16.10).
    expect(bold(container.querySelector(".rv4-ab__intro")!)).toEqual(["accelerator", "brakes"]);
    expect(bold(sections(container)[0]!.querySelector(".rv4-fold")!)).toEqual([
      "Spark Seeker,",
      "this balance tends to be especially sensitive to play, anticipation and novelty.",
    ]);
  });

  it("follows the body with A&B's own practice card, closed", () => {
    const { container } = render(<V4Accelerators view={OPEN} archetype="Spark Seeker" />);
    const next = container.querySelector(".rv4-ab")!.nextElementSibling!;
    expect(next.classList.contains("rv4-try")).toBe(true);
    expect(next.getAttribute("data-node-id")).toBe("377:221");
    expect(next.querySelector(".rv4-try__eyebrow")!.textContent).toBe("Practice time: ~12 min.");
  });
});

describe("the paywalled chapter — 314:211", () => {
  it("locks both cards at row three, each behind one badge", () => {
    const { container } = render(<V4Accelerators view={LOCKED} archetype="Spark Seeker" />);
    expect(container.querySelector(".rv4-ab")!.getAttribute("data-node-id")).toBe("314:219");
    expect(container.querySelectorAll(".rv4-trig .rv4-lockbadge")).toHaveLength(2);
    expect(container.querySelectorAll(".rv4-trig__row.is-locked")).toHaveLength(6);
  });

  it("keeps Common Challenges' first paragraph sharp, then the wall: the next fading out (1665:6780)", () => {
    const { container } = render(<V4Accelerators view={LOCKED} archetype="Spark Seeker" />);
    const challenges = sections(container)[1]!;
    const inner = challenges.querySelector(".rv4-sect__inner")!;
    expect([...inner.children].map(firstClass)).toEqual(["rv4-prose__p", "rv4-unlock"]);
    const wall = inner.querySelector(".rv4-unlock")!;
    expect(wall.getAttribute("data-node-id")).toBe("1665:6780");
    const sample = wall.querySelector(".rv4-unlock__sample")!;
    expect(sample.getAttribute("aria-hidden")).toBe("true");
    expect(sample.hasAttribute("inert")).toBe(true);
    // The whole ramp paragraph, real, under the fade; nothing blurred and nothing after it.
    expect(sample.textContent).toContain("can create days of tension.");
    expect(sample.textContent).toContain("A suggestive message on Wednesday");
    expect(sample.querySelectorAll(".rv4-prose__p")).toHaveLength(1);
    expect(sample.querySelector(".rv4-pblur, .rv4-prose__veiled")).toBeNull();
    expect(wall.querySelector(".rv4-unlock__pill")!.textContent).toBe("Unlock Full Chapter");
    // No card on the wall, and no lock badge on the prose: badges stay on the cards.
    expect(challenges.querySelector(".rv4-premium")).toBeNull();
    expect(challenges.querySelector(".rv4-lockbadge")).toBeNull();
  });

  it("opens the paywall exactly once from every locked surface, never from clear copy", () => {
    const onUnlock = vi.fn();
    const { container } = render(
      <V4Accelerators view={LOCKED} archetype="Spark Seeker" onUnlock={onUnlock} />
    );
    const surfaces = [
      container.querySelector(".rv4-trig--brake .rv4-tb-lock")!,
      container.querySelector(".rv4-trig--accel .rv4-tb-lock")!,
      screen.getAllByRole("button", { name: "Unlock Report" })[0]!,
      // The wall: its faded lines and its pill, which the band's click covers.
      container.querySelector(".rv4-ab .rv4-unlock__sample")!,
      container.querySelector(".rv4-ab .rv4-unlock__pill")!,
    ];
    for (const surface of surfaces) {
      onUnlock.mockClear();
      fireEvent.click(surface);
      expect(onUnlock).toHaveBeenCalledTimes(1);
    }
    onUnlock.mockClear();
    fireEvent.click(container.querySelector(".rv4-ab__intro .rv4-prose__p")!);
    fireEvent.click(sections(container)[1]!.querySelector(".rv4-prose__p")!);
    // The section rows fold, never sell.
    for (const head of container.querySelectorAll(".rv4-ab .rv4-sect__head")) fireEvent.click(head);
    expect(onUnlock).not.toHaveBeenCalled();
  });

  it("hands the locked practice card its gated node", () => {
    const { container } = render(<V4Accelerators view={LOCKED} archetype="Spark Seeker" />);
    fireEvent.click(screen.getByRole("button", { name: "Read all of the practice" }));
    expect(container.querySelector(".rv4-try")!.getAttribute("data-node-id")).toBe("375:221");
  });
});

describe("reportV3.css — chapter body contracts", () => {
  const rule = (selector: string) => {
    const at = V3_CSS.indexOf(selector);
    expect(at, `${selector} missing from reportV3.css`).toBeGreaterThan(-1);
    return V3_CSS.slice(at, V3_CSS.indexOf("}", at));
  };

  it("spaces 310:229's blocks 16 apart under a 20px top pad", () => {
    const css = rule(".rv3 .rv4-ab {");
    expect(css).toContain("gap: 16px");
    expect(css).toContain("padding-top: 20px");
  });

  it("sets the intro in a 356 box and the leads and challenges across the full 361", () => {
    expect(rule(".rv3 .rv4-ab__intro .rv4-prose__p {")).toContain("margin-right: 5px");
    const lead = rule(".rv3 .rv4-ab__lead {");
    expect(lead).toContain("font-size: 16px");
    expect(lead).toContain("line-height: 25.6px");
  });

  it("sets the H2 at 312:212's Lora 700 18/21.6, with the first paragraph where the frame puts it", () => {
    const css = rule(".rv3 .rv4-ab__h2 {");
    expect(css).toContain("font-size: 18px");
    expect(css).toContain("line-height: 21.6px");
    // 312:212 is ONE text node, so Figma sets the first paragraph line 14 + its own
    // 25.6 under the H2's baseline (39.6), where CSS stacks the H2's 4.212 of leading
    // below its baseline and the paragraph's 19.2 above: 2.19 short, and 1216.8
    // against the frame's 1219.
    expect(css).toContain("margin: 0 0 16.19px");
  });

  // Mark (WhatsApp, 30.09): "This one here in accelerators and brakes doesn't blur
  // sufficiently and I can read most of it" — the even 1.75px of 28.09. 314:284 (29.09)
  // fades the gated copy in from sharp at its top to radius 5 at 20.8% of it, 234.5px
  // down on the 393 frame: the first gated paragraph. Figma's 5 is the veil on every
  // locked surface (review 26.09); the band ends at the paragraph's own foot, where the
  // full blur takes over, so the two meet at every width.
  it("fades the first gated paragraph into the veil, as 314:284 draws it, and floats the card at 408", () => {
    expect(rule(".rv3 .rv4-ab__ramp {")).toContain("--rv4-band: 100%;");
    expect(rule(".rv3 .rv4-ab__blurred {")).toContain("filter: blur(var(--rv4-veil, 5px));");
    // The even light blur and the switched-off ramp of 28.09 are gone.
    expect(V3_CSS).not.toContain(".rv3 .rv4-ab__gated {");
    expect(V3_CSS).not.toContain(".rv3 .rv4-ab__ramp > .rv4-pblur");
    // Without backdrop filters the ramp takes half the veil, as every other ramp does.
    const fallback = V3_CSS.slice(
      V3_CSS.indexOf("@supports not ((backdrop-filter: blur(1px))"),
      V3_CSS.indexOf("filter: blur(calc(var(--rv4-veil, 5px) / 2));")
    );
    expect(fallback).toContain(".rv3 .rv4-ab__ramp");
    // 29.09: 1015:1163 sits 408 into 314:284, where the gate opens — or as low as the
    // gate still holds it (v4PremiumPlacement2909).
    expect(rule(".rv3 .rv4-ab__gate .rv4-premium {")).toContain(
      "top: clamp(0px, 100% - 363px, 408px)"
    );
  });

  it("keeps the frame's 16px between the body, the practice card and the article", () => {
    expect(rule(".rv3 .rv4-ab + .rv4-try {")).toContain("margin-top: 16px");
    expect(rule(".rv3 .rv4-chapter__body.is-bare > .rv4-ab ~ .rv4-learn {")).toContain(
      "margin-top: 16px"
    );
  });
});
