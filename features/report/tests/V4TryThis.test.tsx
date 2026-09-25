// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import V4TryThis from "@features/report/ui/v3/V4TryThis";
import { buildTypicalBeliefs, TYPICAL_BELIEFS_PRACTICE } from "@/data/report3-typical-beliefs";
import { buildAccelerators } from "@/data/report3-accelerators";

/**
 * "Try this & see what shifts" — Figma 374:217 (closed), 374:238 (open) and
 * 374:258 (open & gated). Built from the same server view production renders.
 */

const V3_CSS = readFileSync(join(__dirname, "..", "ui", "v3", "reportV3.css"), "utf8");
const OPEN = buildTypicalBeliefs("Spark Seeker")!.practice;
const LOCKED = buildTypicalBeliefs("Spark Seeker", { locked: true })!.practice;

afterEach(cleanup);

describe("V4TryThis — closed (374:217)", () => {
  it("draws the eyebrow, the Lora title and the pill", () => {
    const { container } = render(<V4TryThis practice={OPEN} />);
    expect(container.querySelector(".rv4-try__eyebrow")?.textContent).toBe(
      "Practice time: ~15 min."
    );
    expect(container.querySelector(".rv4-try__eyebrow-label")?.textContent).toBe("Practice time:");
    expect(screen.getByText("Try this & see what shifts")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Read the full practice" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Try this/ }).getAttribute("aria-expanded")).toBe(
      "false"
    );
    expect(container.querySelector(".rv4-try")!.getAttribute("data-node-id")).toBe("374:217");
  });

  it("runs the second and third paragraphs together in the teaser, as 375:270 does", () => {
    const { container } = render(<V4TryThis practice={OPEN} />);
    const paras = container.querySelectorAll(".rv4-try__teaser .rv4-prose__p");
    expect(paras).toHaveLength(2);
    expect(paras[1]!.textContent).toMatch(
      /^A simple process can help\.Separate the event from its meaning\./
    );
    // …on its own line, with no paragraph gap between them.
    expect(paras[1]!.querySelector("br")).not.toBeNull();
  });

  it("is never gated closed — a locked reader sees the same teaser and pill", () => {
    // Compared without the useId-generated ids, which differ between two mounts.
    const snapshot = (el: HTMLElement) => el.innerHTML.replace(/ (id|aria-controls)="[^"]*"/g, "");
    const open = snapshot(render(<V4TryThis practice={OPEN} />).container);
    cleanup();
    const locked = snapshot(render(<V4TryThis practice={LOCKED} />).container);
    expect(locked).toBe(open);
  });
});

describe("V4TryThis — open (374:238)", () => {
  it("opens from the pill onto all nine paragraphs", () => {
    const { container } = render(<V4TryThis practice={OPEN} />);
    fireEvent.click(screen.getByRole("button", { name: "Read the full practice" }));
    expect(container.querySelector(".rv4-try")!.classList.contains("is-open")).toBe(true);
    expect(container.querySelector(".rv4-try")!.getAttribute("data-node-id")).toBe("374:238");
    expect(container.querySelectorAll(".rv4-prose__p")).toHaveLength(
      TYPICAL_BELIEFS_PRACTICE.length
    );
    expect(container.querySelector(".rv4-premium")).toBeNull();
    expect(screen.getByRole("button", { name: /Try this/ }).getAttribute("aria-expanded")).toBe(
      "true"
    );
  });

  it("sets the step leads in bold, with step six regular as both frames draw it", () => {
    const { container } = render(<V4TryThis practice={OPEN} defaultOpen />);
    const bold = [...container.querySelectorAll(".rv4-prose__p strong")].map((b) => b.textContent);
    expect(bold).toEqual([
      "Separate the event from its meaning.",
      "Name the rule underneath it.",
      "Ask where the belief came from.",
      "Test the interpretation.",
      "Rewrite the belief without erasing the preference.",
      "The goal is not for the Spark Seeker to want less spark, but to stop treating its presence or absence as a verdict.",
    ]);
  });

  it("closes again from its own toggle", () => {
    const { container } = render(<V4TryThis practice={OPEN} defaultOpen />);
    fireEvent.click(screen.getByRole("button", { name: /Try this/ }));
    expect(container.querySelector(".rv4-try")!.classList.contains("is-open")).toBe(false);
  });
});

describe("V4TryThis — open & gated (374:258)", () => {
  it("keeps two paragraphs clear, ramps the third, and blurs the rest under the card", () => {
    const { container } = render(<V4TryThis practice={LOCKED} defaultOpen />);
    expect(container.querySelector(".rv4-try")!.getAttribute("data-node-id")).toBe("374:258");
    const clear = [...container.querySelectorAll(".rv4-try__body > .rv4-prose__p")];
    expect(clear).toHaveLength(2);
    const ramp = container.querySelector(".rv4-try__ramp")!;
    expect(ramp.textContent).toContain("Separate the event from its meaning.");
    const blurred = container.querySelector(".rv4-try__blurred")!;
    // The rest arrived scrambled from the server: same shape, none of the words.
    expect(blurred.querySelectorAll(".rv4-prose__p")).toHaveLength(
      TYPICAL_BELIEFS_PRACTICE.length - 3
    );
    expect(blurred.textContent).not.toContain("Name the rule underneath it.");
    expect(blurred.textContent).not.toContain("The goal is not for the Spark Seeker");
    for (const el of [ramp, blurred]) {
      expect(el.getAttribute("aria-hidden")).toBe("true");
      expect(el.hasAttribute("inert")).toBe(true);
    }
    expect(container.querySelectorAll(".rv4-try__rest .rv4-premium")).toHaveLength(1);
  });

  it("opens the paywall once from the band and once from the card's CTA", () => {
    const onUnlock = vi.fn();
    const { container } = render(<V4TryThis practice={LOCKED} onUnlock={onUnlock} defaultOpen />);
    fireEvent.click(container.querySelector(".rv4-try__gate")!);
    expect(onUnlock).toHaveBeenCalledTimes(1);
    onUnlock.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Unlock full report" }));
    expect(onUnlock).toHaveBeenCalledTimes(1);
  });

  it("never opens the paywall from the clear copy or the toggle", () => {
    const onUnlock = vi.fn();
    const { container } = render(<V4TryThis practice={LOCKED} onUnlock={onUnlock} defaultOpen />);
    fireEvent.click(container.querySelector(".rv4-try__body > .rv4-prose__p")!);
    fireEvent.click(screen.getByRole("button", { name: /Try this/ }));
    expect(onUnlock).not.toHaveBeenCalled();
  });
});

describe("reportV3.css — practice card contracts", () => {
  const rule = (selector: string) => {
    const at = V3_CSS.indexOf(selector);
    expect(at, `${selector} missing from reportV3.css`).toBeGreaterThan(-1);
    return V3_CSS.slice(at, V3_CSS.indexOf("}", at));
  };

  it("draws 374:241's gold card, full-bleed like the article", () => {
    const css = rule(".rv3 .rv4-try {");
    expect(css).toContain("rgba(230, 182, 92, 0.14) 0%");
    expect(css).toContain("rgba(230, 182, 92, 0.03) 100%");
    expect(css).toContain("border: 1px solid rgba(230, 182, 92, 0.6)");
    expect(css).toContain("border-radius: 27px");
    expect(css).toContain("width: calc(100% + var(--rv3-gutter) * 2)");
  });

  it("clamps the teaser to 375:270's 218px and uses Mark's 163x32 pill", () => {
    expect(rule(".rv3 .rv4-try__teaser {")).toContain("max-height: 218px");
    const pill = rule(".rv3 .rv4-try__open {");
    expect(pill).toContain("width: 163px");
    expect(pill).toContain("height: 32px");
    expect(pill).toContain("border: 1.5px solid #8f5e16");
  });

  it("lets the heading row grow instead of overlapping the copy on a narrow phone", () => {
    expect(rule(".rv3 .rv4-try__button {")).toContain("min-height: 51px");
  });

  it("never lets the 358px measure run past the card", () => {
    expect(rule(".rv3 .rv4-try .rv4-prose__p {")).toContain("width: min(358px, calc(100% + 12px))");
  });
});

/**
 * The same card closing Accelerator & Brakes — 377:221 closed, 374:304 open, 375:221
 * open & gated. Its teaser box is 224 (377:242, against Typical Beliefs' 218) in the
 * same 343 card, and its ramp fades in over four lines. Both open frames set the copy
 * 8px under the button where the closed teaser (and all of Typical Beliefs) sits 4px
 * under it. The Premium card sits 171.4px under the clear first paragraph, as 375:243
 * does: 155px below the gate, because the ramp paragraph's tail runs on under the full
 * blur in the same paragraph, so the rest starts too late to measure from.
 */
describe("V4TryThis — Accelerator & Brakes (377:221 / 374:304 / 375:221)", () => {
  const AB_OPEN = buildAccelerators("Spark Seeker")!.practice;
  const AB_LOCKED = buildAccelerators("Spark Seeker", { locked: true })!.practice;
  const AB = {
    nodeIds: { closed: "377:221", open: "374:304", gated: "375:221" },
    teaserHeightPx: 224,
    rampBandPx: 89.6,
    openPaddingTopPx: 8,
    premiumTopPx: 155,
  } as const;

  it("shows the frame's own teaser, broken as 377:242 is, identical for every reader", () => {
    const snapshot = (el: HTMLElement) => el.innerHTML.replace(/ (id|aria-controls)="[^"]*"/g, "");
    const open = render(<V4TryThis practice={AB_OPEN} {...AB} />).container;
    const teaser = open.querySelectorAll(".rv4-try__teaser .rv4-prose__p");
    expect(teaser).toHaveLength(1);
    // A blank line after the lead, and a fresh line before "A playful message".
    expect(teaser[0]!.querySelectorAll("br")).toHaveLength(3);
    expect(open.querySelector(".rv4-try")!.getAttribute("data-node-id")).toBe("377:221");
    const unlocked = snapshot(open);
    cleanup();
    expect(snapshot(render(<V4TryThis practice={AB_LOCKED} {...AB} />).container)).toBe(unlocked);
  });

  it("carries its geometry as custom properties on the card", () => {
    const { container } = render(<V4TryThis practice={AB_OPEN} {...AB} />);
    const card = container.querySelector<HTMLElement>(".rv4-try")!;
    expect(card.style.getPropertyValue("--rv4-try-teaser-h")).toBe("224px");
    expect(card.style.getPropertyValue("--rv4-try-band")).toBe("89.6px");
    expect(card.style.getPropertyValue("--rv4-try-open-pt")).toBe("8px");
    expect(card.style.getPropertyValue("--rv4-try-premium-top")).toBe("155px");
  });

  it("opens onto all seven paragraphs", () => {
    const { container } = render(<V4TryThis practice={AB_OPEN} {...AB} defaultOpen />);
    expect(container.querySelector(".rv4-try")!.getAttribute("data-node-id")).toBe("374:304");
    expect(container.querySelectorAll(".rv4-prose__p")).toHaveLength(7);
  });

  it("gates after one paragraph and floats the card from the gate, not the rest", () => {
    const { container } = render(<V4TryThis practice={AB_LOCKED} {...AB} defaultOpen />);
    expect(container.querySelector(".rv4-try")!.getAttribute("data-node-id")).toBe("375:221");
    expect(container.querySelectorAll(".rv4-try__body > .rv4-prose__p")).toHaveLength(1);
    const ramp = container.querySelector(".rv4-try__ramp")!;
    expect(ramp.textContent).toContain("making it harder to respond?”");
    expect(ramp.textContent).not.toContain("Sometimes the solution is to add an accelerator.");
    expect(container.querySelectorAll(".rv4-try__blurred .rv4-prose__p")).toHaveLength(5);
    expect(container.querySelectorAll(".rv4-try__gate > .rv4-premium")).toHaveLength(1);
    expect(container.querySelector(".rv4-try__rest .rv4-premium")).toBeNull();
  });

  it("leaves Typical Beliefs' card without any of them", () => {
    const { container } = render(<V4TryThis practice={OPEN} />);
    expect(container.querySelector(".rv4-try")!.hasAttribute("style")).toBe(false);
  });

  it("reads each custom property with Typical Beliefs' value as the fallback", () => {
    expect(V3_CSS).toContain("max-height: var(--rv4-try-teaser-h, 218px)");
    expect(V3_CSS).toContain("bottom: calc(var(--rv4-try-teaser-h, 218px) - 228.5px)");
    expect(V3_CSS).toContain("padding-bottom: calc(257px - var(--rv4-try-teaser-h, 218px))");
    expect(V3_CSS).toContain("--rv4-band: var(--rv4-try-band, 100%)");
    expect(V3_CSS).toContain("top: var(--rv4-try-premium-top, 148px)");
    expect(V3_CSS).toContain("padding-top: var(--rv4-try-open-pt, 4px)");
  });
});

/**
 * Fantasy vs. Reality's frames drop the copy by different amounts: 4px under the
 * button when open (441:6168), as the closed teaser does, and 8px when gated
 * (441:6188). A&B's open and gated frames share one value, which `openPaddingTopPx`
 * already carries.
 */
describe("V4TryThis — a gated drop of its own (441:6168 / 441:6188)", () => {
  it("carries the gated drop as its own custom property", () => {
    const { container } = render(<V4TryThis practice={OPEN} gatedPaddingTopPx={8} />);
    const card = container.querySelector<HTMLElement>(".rv4-try")!;
    expect(card.style.getPropertyValue("--rv4-try-gated-pt")).toBe("8px");
    expect(card.style.getPropertyValue("--rv4-try-open-pt")).toBe("");
  });

  it("marks the card gated only while the wall is showing", () => {
    const locked = render(<V4TryThis practice={LOCKED} gatedPaddingTopPx={8} />).container;
    const card = locked.querySelector(".rv4-try")!;
    expect(card).not.toHaveClass("is-gated");
    fireEvent.click(locked.querySelector(".rv4-try__button")!);
    expect(card).toHaveClass("is-open");
    expect(card).toHaveClass("is-gated");
    fireEvent.click(locked.querySelector(".rv4-try__button")!);
    expect(card).not.toHaveClass("is-gated");
    cleanup();
    const open = render(<V4TryThis practice={OPEN} defaultOpen />).container;
    expect(open.querySelector(".rv4-try")).not.toHaveClass("is-gated");
  });

  it("drops the gated copy by the gated value, and by the open one when none is given", () => {
    expect(V3_CSS).toContain(
      ".rv3 .rv4-try.is-open.is-gated .rv4-try__body {\n  padding-top: var(--rv4-try-gated-pt, var(--rv4-try-open-pt, 4px));"
    );
  });
});
