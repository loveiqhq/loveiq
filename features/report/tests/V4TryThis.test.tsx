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

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/**
 * jsdom has no layout, so the closed teaser's fade is measured against a stand-in:
 * every text node reports the same nine lines — two, a paragraph gap, seven, the last
 * under the 196px box's foot — which merge into one set of lines.
 */
const stubTeaserLayout = (teaserClass: string) => {
  const tops = [11.2, 33.6, 72, 94.4, 116.8, 139.2, 161.6, 184, 206.4].map((c) => c - 8.8);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
    this: HTMLElement
  ) {
    const height = this.classList.contains(teaserClass) ? 196 : 0;
    return {
      top: 0,
      bottom: height,
      left: 0,
      right: 346,
      width: 346,
      height,
      x: 0,
      y: 0,
    } as DOMRect;
  });
  vi.spyOn(document, "createRange").mockImplementation(
    () =>
      ({
        selectNodeContents: () => {},
        getClientRects: () =>
          tops.map((top) => ({ top, bottom: top + 17.6, width: 100, height: 17.6 })),
        detach: () => {},
      }) as unknown as Range
  );
};

describe("V4TryThis — closed (374:217)", () => {
  it("draws the eyebrow, the Lora title and the pill", () => {
    const { container } = render(<V4TryThis practice={OPEN} />);
    expect(container.querySelector(".rv4-try__eyebrow")?.textContent).toBe(
      "Practice time: ~15 min."
    );
    expect(container.querySelector(".rv4-try__eyebrow-label")?.textContent).toBe("Practice time:");
    // Mark's rehaul, 28.09 (1944397594; 185:256): "Practice Time:" in title case, the
    // value in capitals — so a time label is marked, and the value is its own span.
    expect(container.querySelector(".rv4-try__eyebrow-label")).toHaveClass("is-time");
    expect(container.querySelector(".rv4-try__eyebrow-value")?.textContent).toBe("~15 min.");
    const label = container.querySelector(".rv4-try__label")!;
    expect(label.textContent).toBe("Try this & see what shifts");
    // 185:265 — "Try this" in Bold, the rest Regular; the lightbulb chip is gone.
    expect(label.querySelector("strong.rv4-try__lead")?.textContent).toBe("Try this");
    expect(container.querySelector(".rv4-try__chip")).toBeNull();
    // 894:7594 — "Read All"; the accessible name keeps what it opens.
    const pill = screen.getByRole("button", { name: "Read all of the practice" });
    expect(pill.textContent).toBe("Read all");
    expect(screen.getByRole("button", { name: /Try this/ }).getAttribute("aria-expanded")).toBe(
      "false"
    );
    expect(container.querySelector(".rv4-try")!.getAttribute("data-node-id")).toBe("374:217");
  });

  // 375:270 greys the last three lines of the box, one colour a line; the steps are
  // measured (useTeaserFade), so they land on lines whatever the wrap.
  it("hands the teaser's fade the lines it shows", () => {
    stubTeaserLayout("rv4-try__teaser");
    const { container } = render(<V4TryThis practice={OPEN} />);
    const teaser = container.querySelector<HTMLElement>(".rv4-try__teaser")!;
    expect([1, 2, 3].map((i) => teaser.style.getPropertyValue(`--rv4-fade-${i}`))).toEqual([
      "128px",
      "150.4px",
      "172.8px",
    ]);
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
    fireEvent.click(screen.getByRole("button", { name: "Read all of the practice" }));
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
    // The rest, under the blur: since review 26.09 the copy under the blur is the real one (lockedBlurCopy.ts).
    expect(blurred.querySelectorAll(".rv4-prose__p")).toHaveLength(
      TYPICAL_BELIEFS_PRACTICE.length - 3
    );
    expect(blurred.textContent).toContain("Name the rule underneath it.");
    expect(blurred.textContent).toContain("The goal is not for the Spark Seeker");
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
    fireEvent.click(screen.getByRole("button", { name: "Unlock Report" }));
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

  it("draws 185:255's gold card, full-bleed like the article", () => {
    const css = rule(".rv3 .rv4-try {");
    // The rehaul's lighter wash: 7% of the gold, fading out (it was 14% to 3%).
    expect(css).toContain("rgba(230, 182, 92, 0.07) 0%");
    expect(css).toContain("rgba(230, 182, 92, 0) 100%");
    // On white, as the page is: a paywall's backdrop blur inside the card samples the
    // card, and over a see-through wash each of its three layers stacked another copy
    // of the gold into a band (CiP and FvR drew it at 29.09).
    expect(css).toMatch(/background:\s*linear-gradient\([^;]*\),\s*#fff;/);
    // 18.5 from the card's edge to the eyebrow: the 1px border and 17.5.
    expect(css).toContain("padding: 17.5px 22px 20px");
    expect(css).toContain("border: 1px solid rgba(230, 182, 92, 0.6)");
    expect(css).toContain("border-radius: 27px");
    expect(css).toContain("width: calc(100% + var(--rv3-gutter) * 2)");
  });

  // The rehaul (894:7574 and every chapter's instance): a 196px teaser, and "Read All"
  // in a 126x32 pill at 298 of the 343 card, whatever the teaser's box.
  it("greys the teaser's last three lines, one step a line, as 375:270 colours them", () => {
    const css = rule(".rv3 .rv4-try__teaser {");
    // #7e7e7e / #b5b5b5 / #e5e5e5 are black at 50% / 29% / 10%. Before the lines are
    // measured the steps sit on the last three 22.4px lines of the box.
    for (const stop of [
      "#000 var(--rv4-fade-1, calc(100% - 68px))",
      "rgba(0, 0, 0, 0.5) var(--rv4-fade-1, calc(100% - 68px))",
      "rgba(0, 0, 0, 0.5) var(--rv4-fade-2, calc(100% - 45.6px))",
      "rgba(0, 0, 0, 0.29) var(--rv4-fade-2, calc(100% - 45.6px))",
      "rgba(0, 0, 0, 0.29) var(--rv4-fade-3, calc(100% - 23.2px))",
      "rgba(0, 0, 0, 0.1) var(--rv4-fade-3, calc(100% - 23.2px))",
    ]) {
      expect(css).toContain(stop);
    }
    // Copy that ends inside the box (the wide desktop column) keeps the proportional fade.
    const short = rule('.rv3 .rv4-try__teaser[data-fade="short"] {');
    expect(short).toContain("#000 69%");
    expect(short).toContain("rgba(0, 0, 0, 0.05) 100%");
  });

  it("clamps the teaser to 196px and sets the 126x32 'Read All' pill at 298", () => {
    expect(rule(".rv3 .rv4-try__teaser {")).toContain("max-height: 196px");
    const pill = rule(".rv3 .rv4-try__open {");
    expect(pill).toContain("width: 126px");
    expect(pill).toContain("height: 32px");
    expect(pill).toContain("border: 1.5px solid #8f5e16");
    expect(pill).toContain("text-transform: capitalize");
    // 298 of the card is 212.5 into the closed block, which starts at 85.5.
    expect(pill).toContain("top: 212.5px");
    expect(rule(".rv3 .rv4-try__closed {")).toContain("min-height: 244.5px");
    expect(rule(".rv3 .rv4-try:not(.is-open) {")).toContain("padding-bottom: 12px");
  });

  it("sets the rehaul's eyebrow and title type", () => {
    const eyebrow = rule(".rv3 .rv4-try__eyebrow {");
    expect(eyebrow).toContain("font-size: 12px");
    expect(eyebrow).toContain("text-transform: none");
    expect(rule(".rv3 .rv4-try__eyebrow-label {")).toContain("font-weight: 300");
    expect(rule(".rv3 .rv4-try__eyebrow-label.is-time {")).toContain("text-transform: capitalize");
    const value = rule(".rv3 .rv4-try__eyebrow-value {");
    expect(value).toContain("font-weight: 700");
    expect(value).toContain("text-transform: uppercase");
    expect(rule(".rv3 .rv4-try__label {")).toContain("font-weight: 400");
    expect(rule(".rv3 .rv4-try__lead {")).toContain("font-weight: 700");
    expect(V3_CSS).not.toContain(".rv3 .rv4-try__chip");
    // The Report's four closed cards (374:232, 377:236, 399:234, 441:6437) keep the
    // disc at 10% of the gold; only the master 894:7589 has 18%, as it did before the
    // rehaul, and Mark's comment says "see Report".
    expect(rule(".rv3 .rv4-try__chev {")).toContain("background: rgba(178, 138, 60, 0.1)");
    // Figma sets the eyebrow's space in Light, with the label: the value alone is Bold.
    expect(rule(".rv3 .rv4-try__eyebrow {")).toContain("font-weight: 300");
  });

  it("lets the heading row grow instead of overlapping the copy on a narrow phone", () => {
    expect(rule(".rv3 .rv4-try__button {")).toContain("min-height: 51px");
  });

  // Review 25.09, Mark: "My mistake! Equal space left and right." The frames set the
  // practice 358 wide in a card that leaves 347, so it ran 12px into the right
  // padding; the copy, the closed teaser and the ramp now keep to the content box.
  it("keeps the practice inside the card's padding, the same space left and right", () => {
    expect(V3_CSS).not.toContain(".rv3 .rv4-try .rv4-prose__p {");
    expect(rule(".rv3 .rv4-try__closed {")).not.toContain("358px");
    expect(rule(".rv3 .rv4-try__ramp {")).not.toContain("358px");
  });
});

/**
 * The same card closing Accelerator & Brakes — 377:221 closed, 374:304 open, 375:221
 * open & gated. Its teaser box is 202 (377:242, against the others' 196) in the
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
    teaserHeightPx: 202,
    rampBandPx: 89.6,
    openPaddingTopPx: 8,
    premiumTopPx: 155,
  } as const;

  it("shows the frame's own teaser, broken as 377:242 is, identical for every reader", () => {
    const snapshot = (el: HTMLElement) => el.innerHTML.replace(/ (id|aria-controls)="[^"]*"/g, "");
    const open = render(<V4TryThis practice={AB_OPEN} {...AB} />).container;
    const teaser = open.querySelectorAll(".rv4-try__teaser .rv4-prose__p");
    expect(teaser).toHaveLength(1);
    // A fresh line after the lead and another before "A playful message": 377:242
    // breaks each with one line separator, no blank line (the lead once had one here).
    expect(teaser[0]!.querySelectorAll("br")).toHaveLength(2);
    expect(open.querySelector(".rv4-try")!.getAttribute("data-node-id")).toBe("377:221");
    const unlocked = snapshot(open);
    cleanup();
    expect(snapshot(render(<V4TryThis practice={AB_LOCKED} {...AB} />).container)).toBe(unlocked);
  });

  it("carries its geometry as custom properties on the card", () => {
    const { container } = render(<V4TryThis practice={AB_OPEN} {...AB} />);
    const card = container.querySelector<HTMLElement>(".rv4-try")!;
    expect(card.style.getPropertyValue("--rv4-try-teaser-h")).toBe("202px");
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
    // The ramp's tail runs on under the full blur; since review 26.09 the copy under the blur is the real one (lockedBlurCopy.ts).
    expect(ramp.textContent).toContain("Sometimes the solution is to add an accelerator.");
    expect(container.querySelectorAll(".rv4-try__blurred .rv4-prose__p")).toHaveLength(5);
    expect(container.querySelectorAll(".rv4-try__gate > .rv4-premium")).toHaveLength(1);
    expect(container.querySelector(".rv4-try__rest .rv4-premium")).toBeNull();
  });

  it("leaves Typical Beliefs' card without any of them", () => {
    const { container } = render(<V4TryThis practice={OPEN} />);
    expect(container.querySelector(".rv4-try")!.hasAttribute("style")).toBe(false);
  });

  it("reads each custom property with Typical Beliefs' value as the fallback", () => {
    expect(V3_CSS).toContain("max-height: var(--rv4-try-teaser-h, 196px)");
    // The pill and the card's foot no longer follow the teaser's box: fixed at 298 / 343.
    expect(V3_CSS).not.toContain("228.5px)");
    expect(V3_CSS).not.toContain("padding-bottom: calc(257px - var(--rv4-try-teaser-h");
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
