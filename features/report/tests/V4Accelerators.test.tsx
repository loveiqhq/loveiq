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

afterEach(cleanup);

describe("the chapter body — 310:229", () => {
  it("runs intro, brakes lead, brakes card, accelerators lead, accelerators card, challenges", () => {
    const { container } = render(<V4Accelerators view={OPEN} />);
    const body = container.querySelector(".rv4-ab")!;
    expect(body.getAttribute("data-node-id")).toBe("310:229");
    expect([...body.children].map((el) => el.className.split(" ")[0])).toEqual([
      "rv4-ab__intro",
      "rv4-ab__lead",
      "rv4-trig",
      "rv4-ab__lead",
      "rv4-trig",
      "rv4-ab__challenges",
    ]);
    expect(body.querySelectorAll(".rv4-ab__intro .rv4-prose__p")).toHaveLength(5);
    const leads = [...body.querySelectorAll(".rv4-ab__lead")].map((el) => el.textContent);
    expect(leads[0]).toBe("For many Spark Seekers, the brakes may sound something like this");
    expect(leads[1]!.trim()).toBe("The accelerators might be just as recognizable:");
    expect(body.querySelector(".rv4-trig--brake")).not.toBeNull();
    expect(body.querySelector(".rv4-trig--accel")).not.toBeNull();
  });

  it("sets Common challenges' H2 over its seven paragraphs, nothing gated", () => {
    const { container } = render(<V4Accelerators view={OPEN} />);
    const challenges = container.querySelector(".rv4-ab__challenges")!;
    expect(challenges.getAttribute("data-node-id")).toBe("312:211");
    expect(challenges.querySelector(".rv4-ab__h2")!.textContent).toBe("Common Challenges");
    expect(challenges.querySelectorAll(".rv4-prose__p")).toHaveLength(7);
    expect(container.querySelector(".rv4-ab__gate")).toBeNull();
    expect(container.querySelector(".rv4-premium")).toBeNull();
  });

  it("keeps bold runs in the paragraph's own colour, as 310:231 draws them", () => {
    const { container } = render(<V4Accelerators view={OPEN} />);
    const bold = [...container.querySelectorAll(".rv4-ab__intro strong")].map((b) => b.textContent);
    expect(bold).toEqual([
      "Dual Control Model",
      "accelerator",
      "brakes",
      "Spark Seeker,",
      "this balance tends to be especially sensitive to play, anticipation and novelty.",
    ]);
  });

  it("follows the body with A&B's own practice card, closed", () => {
    const { container } = render(<V4Accelerators view={OPEN} />);
    const next = container.querySelector(".rv4-ab")!.nextElementSibling!;
    expect(next.classList.contains("rv4-try")).toBe(true);
    expect(next.getAttribute("data-node-id")).toBe("377:221");
    expect(next.querySelector(".rv4-try__eyebrow")!.textContent).toBe("Practice time: ~12 min.");
  });
});

describe("the paywalled chapter — 314:211", () => {
  it("locks both cards at row three, each behind one badge", () => {
    const { container } = render(<V4Accelerators view={LOCKED} />);
    expect(container.querySelector(".rv4-ab")!.getAttribute("data-node-id")).toBe("314:219");
    expect(container.querySelectorAll(".rv4-trig .rv4-lockbadge")).toHaveLength(2);
    expect(container.querySelectorAll(".rv4-trig__row.is-locked")).toHaveLength(6);
  });

  it("gates Common challenges after its first paragraph: ramp, blurred rest, and the body card", () => {
    const { container } = render(<V4Accelerators view={LOCKED} />);
    const challenges = container.querySelector(".rv4-ab__challenges")!;
    expect(challenges.getAttribute("data-node-id")).toBe("314:307");
    const gate = challenges.querySelector(".rv4-ab__gate")!;
    const gated = gate.querySelector(".rv4-ab__gated")!;
    expect(gated.getAttribute("aria-hidden")).toBe("true");
    expect(gated.hasAttribute("inert")).toBe(true);
    // The ramp's fade band, then the full blur — since review 26.09 the copy under the blur is the real one (lockedBlurCopy.ts), hidden with the rest.
    const ramp = gate.querySelector(".rv4-ab__ramp")!;
    expect(ramp.textContent).toContain("can create days of tension.");
    expect(ramp.textContent).toContain("A suggestive message on Wednesday");
    expect(ramp.querySelector(".rv4-pblur")).not.toBeNull();
    expect(gate.querySelectorAll(".rv4-ab__blurred .rv4-prose__p")).toHaveLength(5);
    const card = gate.querySelector(".rv4-premium")!;
    expect(card.classList.contains("rv4-premium--body")).toBe(true);
    expect(card.getAttribute("data-node-id")).toBe("1015:1163");
    // No lock badge on the prose: the frame puts badges only on the cards.
    expect(gate.querySelector(".rv4-lockbadge")).toBeNull();
  });

  it("fades the whole ramp paragraph in, with no veiled tail to cut the fade short", () => {
    // 314:284 (29.09) runs the fade over the first gated paragraph, so none of it is
    // marked for the full blur: no useRampFit ending the fade where a tail starts.
    const { container } = render(<V4Accelerators view={LOCKED} />);
    const ramp = container.querySelector<HTMLElement>(".rv4-ab__ramp")!;
    expect(ramp.querySelector(".rv4-prose__veiled")).toBeNull();
  });

  it("opens the paywall exactly once from every locked surface, never from clear copy", () => {
    const onUnlock = vi.fn();
    const { container } = render(<V4Accelerators view={LOCKED} onUnlock={onUnlock} />);
    const surfaces = [
      container.querySelector(".rv4-trig--brake .rv4-tb-lock")!,
      container.querySelector(".rv4-trig--accel .rv4-tb-lock")!,
      container.querySelector(".rv4-ab__gate")!,
      screen.getAllByRole("button", { name: "Unlock Report" })[0]!,
      // The paywall card's pill (29.09), named as it reads.
      container.querySelector(".rv4-ab__gate .rv4-premium__cta")!,
    ];
    for (const surface of surfaces) {
      onUnlock.mockClear();
      fireEvent.click(surface);
      expect(onUnlock).toHaveBeenCalledTimes(1);
    }
    onUnlock.mockClear();
    fireEvent.click(container.querySelector(".rv4-ab__intro .rv4-prose__p")!);
    fireEvent.click(container.querySelector(".rv4-ab__lead")!);
    fireEvent.click(container.querySelector(".rv4-ab__challenges .rv4-prose__p")!);
    expect(onUnlock).not.toHaveBeenCalled();
  });

  it("hands the locked practice card its gated node", () => {
    const { container } = render(<V4Accelerators view={LOCKED} />);
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
