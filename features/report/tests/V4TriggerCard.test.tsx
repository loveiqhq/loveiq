// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import V4TriggerCard from "@features/report/ui/v3/V4TriggerCard";
import { buildAccelerators } from "@/data/report3-accelerators";
import { installRevealObserver, mockRect, observerOf } from "./v4RevealTestKit";

/**
 * The two trigger cards of Accelerator & Brakes — "WHAT BRAKES YOU" (Figma 713:6132,
 * paywalled 386:416) and "WHAT ACCELERATES YOU" (713:6181 / 386:444). Review 25.09,
 * Mark (1942039325): "We swapped out these visual elements. On the Paywalled version,
 * we are just deleting the scales."
 */

const V3_CSS = readFileSync(join(__dirname, "..", "ui", "v3", "reportV3.css"), "utf8");
const OPEN = buildAccelerators("Spark Seeker")!;
const LOCKED = buildAccelerators("Spark Seeker", { locked: true })!;

afterEach(cleanup);

const sharpRows = (root: Element) =>
  [...root.querySelectorAll(".rv4-trig__row")].filter((r) => !r.closest("[aria-hidden]"));

describe("V4TriggerCard — open: two rows, the third under a fade (713:6132 / 713:6181)", () => {
  it("draws the brakes card: its label, the minus badge, two rows and a third that peeks", () => {
    const { container } = render(<V4TriggerCard tone="brake" rows={OPEN.brakes} />);
    const card = container.querySelector(".rv4-trig")!;
    expect(card.classList.contains("rv4-trig--brake")).toBe(true);
    expect(card.getAttribute("data-node-id")).toBe("713:6132");
    expect(screen.getByRole("heading", { name: "WHAT BRAKES YOU" })).toBeTruthy();
    const icon = container.querySelector(".rv4-trig__badge img")!;
    expect(icon.getAttribute("src")).toContain("/report/v3/accelerators/icon-minus.svg");
    expect(icon.getAttribute("width")).toBe("16");
    expect(sharpRows(container)).toHaveLength(2);
    expect(container.querySelector(".rv4-trig__title")!.textContent).toBe(
      "Sex that feels predictable or obligatory"
    );
    const peek = container.querySelector(".rv4-trig__peek")!;
    const peekList = peek.querySelector("ul")!;
    expect(peekList.getAttribute("aria-hidden")).toBe("true");
    expect(peekList.hasAttribute("inert")).toBe(true);
    expect(peekList.querySelectorAll(".rv4-trig__row")).toHaveLength(1);
    expect(peek.querySelector(".rv4-trig__fade")!.getAttribute("aria-hidden")).toBe("true");
    // Rows 4 and 5 wait for the pill.
    expect(container.querySelectorAll(".rv4-trig__row")).toHaveLength(3);
  });

  it("draws the accelerators card with the plus badge and its own node", () => {
    const { container } = render(<V4TriggerCard tone="accel" rows={OPEN.accelerators} />);
    expect(container.querySelector(".rv4-trig")!.getAttribute("data-node-id")).toBe("713:6181");
    expect(screen.getByRole("heading", { name: "WHAT ACCELERATES YOU" })).toBeTruthy();
    expect(container.querySelector(".rv4-trig__badge img")!.getAttribute("src")).toContain(
      "/report/v3/accelerators/icon-plus.svg"
    );
  });

  // Mark, 28.09 (1944177596, "Updated CTAs"): 713:6178 / 713:6226 read "Show all" in
  // title case (86px, from 138 / 178). The card's name stays in the accessible name, so
  // the page's several "Show All" pills still say what each opens.
  it("reads 'Show All' on both pills, as the frame now draws them", () => {
    const { container } = render(<V4TriggerCard tone="brake" rows={OPEN.brakes} />);
    expect(container.querySelector(".rv4-trig__pill-label")!.textContent).toBe("Show all");
    cleanup();
    const accel = render(<V4TriggerCard tone="accel" rows={OPEN.accelerators} />);
    expect(accel.container.querySelector(".rv4-trig__pill-label")!.textContent).toBe("Show all");
  });

  it("sets the pill in title case, no longer in capitals", () => {
    const at = V3_CSS.indexOf(".rv3 .rv4-fvt__pill,\n.rv3 .rv4-trig__pill {");
    const pill = V3_CSS.slice(at, V3_CSS.indexOf("}", at));
    expect(pill).toContain("text-transform: capitalize");
    expect(pill).not.toContain("uppercase");
  });

  it("names each pill after its card", () => {
    render(<V4TriggerCard tone="brake" rows={OPEN.brakes} />);
    expect(screen.getByRole("button", { name: "Show all brakes" })).toBeTruthy();
    cleanup();
    render(<V4TriggerCard tone="accel" rows={OPEN.accelerators} />);
    expect(screen.getByRole("button", { name: "Show all accelerators" })).toBeTruthy();
  });

  it("lists every row on the pill, drops the fade and the pill, and moves focus to row 3", () => {
    const { container } = render(<V4TriggerCard tone="brake" rows={OPEN.brakes} />);
    fireEvent.click(screen.getByRole("button", { name: "Show all brakes" }));
    const rows = [...container.querySelectorAll(".rv4-trig__row")];
    expect(rows).toHaveLength(5);
    expect(sharpRows(container)).toHaveLength(5);
    expect(container.querySelector(".rv4-trig__peek")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
    expect(document.activeElement).toBe(rows[2]);
    expect(rows.map((r) => r.classList.contains("is-last"))).toEqual([
      false,
      false,
      false,
      false,
      true,
    ]);
  });

  it("shows two rows whole, with no pill, when there is nothing more", () => {
    const { container } = render(<V4TriggerCard tone="brake" rows={OPEN.brakes.slice(0, 2)} />);
    expect(sharpRows(container)).toHaveLength(2);
    expect(container.querySelector(".rv4-trig__peek")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
    expect(container.querySelectorAll(".rv4-trig__row.is-last")).toHaveLength(1);
  });

  it("draws no scale and no 2.0 reveal, open or paywalled", () => {
    const open = render(<V4TriggerCard tone="brake" rows={OPEN.brakes} />);
    expect(open.container.querySelector(".rv4-trig__scale")).toBeNull();
    expect(open.container.querySelector(".rv4-reveal")).toBeNull();
    cleanup();
    const locked = render(
      <V4TriggerCard tone="brake" rows={LOCKED.brakes} lockedFrom={LOCKED.lockedFrom} />
    );
    expect(locked.container.querySelector(".rv4-trig__scale")).toBeNull();
    expect(locked.container.querySelector(".rv4-reveal")).toBeNull();
  });
});

describe("V4TriggerCard — paywalled (386:416 / 386:444)", () => {
  it("keeps two rows clear and locks the other three behind one badge, with no pill", () => {
    const { container } = render(
      <V4TriggerCard tone="brake" rows={LOCKED.brakes} lockedFrom={LOCKED.lockedFrom} />
    );
    expect(container.querySelector(".rv4-trig")!.getAttribute("data-node-id")).toBe("386:416");
    const lock = container.querySelector(".rv4-tb-lock.rv4-trig__lock")!;
    const lockedList = lock.querySelector("ul")!;
    expect(lockedList.getAttribute("aria-hidden")).toBe("true");
    expect(lockedList.hasAttribute("inert")).toBe(true);
    expect(lockedList.querySelectorAll(".rv4-trig__row.is-locked")).toHaveLength(3);
    expect(container.querySelectorAll(".rv4-trig__row:not(.is-locked)")).toHaveLength(2);
    expect(container.querySelectorAll(".rv4-lockbadge")).toHaveLength(1);
    expect(container.querySelector(".rv4-trig__peek")).toBeNull();
    // Under the lock and hidden from assistive tech; since review 26.09 the rows there
    // are the real ones (lockedBlurCopy.ts).
    expect(lockedList.textContent).toContain("Control and possessiveness");
  });

  // 452:261: the third row ramps from sharp at its top to the full blur 64% down it;
  // rows 4-5 sit under the full blur (452:264, 452:267). Held uniform while that row
  // was a decoy; since review 26.09 it is the real row (lockedBlurCopy.ts).
  it("ramps the first locked row into the blur, the others under it whole", () => {
    const { container } = render(
      <V4TriggerCard tone="brake" rows={LOCKED.brakes} lockedFrom={LOCKED.lockedFrom} />
    );
    const locked = [...container.querySelectorAll(".rv4-trig__row.is-locked")];
    expect(locked).toHaveLength(3);
    expect(locked[0]).toHaveClass("is-ramp");
    expect(locked[0]).not.toHaveClass("is-blurred");
    expect(locked[0]!.querySelectorAll(".rv4-pblur.rv4-trig__ramp > span")).toHaveLength(3);
    for (const row of locked.slice(1)) {
      expect(row).toHaveClass("is-blurred");
      expect(row.querySelector(".rv4-pblur")).toBeNull();
    }
    expect(V3_CSS).toMatch(/\.rv3 \.rv4-trig__ramp \{\s*--rv4-band: 64%;/);
  });

  it("uses the accelerators card's own paywalled node", () => {
    const { container } = render(
      <V4TriggerCard tone="accel" rows={LOCKED.accelerators} lockedFrom={LOCKED.lockedFrom} />
    );
    expect(container.querySelector(".rv4-trig")!.getAttribute("data-node-id")).toBe("386:444");
  });

  it("opens the paywall once from the locked rows and once from the badge, never from a clear row", () => {
    const onUnlock = vi.fn();
    const { container } = render(
      <V4TriggerCard
        tone="brake"
        rows={LOCKED.brakes}
        lockedFrom={LOCKED.lockedFrom}
        onUnlock={onUnlock}
      />
    );
    fireEvent.click(container.querySelector(".rv4-trig__row")!);
    expect(onUnlock).not.toHaveBeenCalled();
    fireEvent.click(container.querySelector(".rv4-tb-lock")!);
    expect(onUnlock).toHaveBeenCalledTimes(1);
    onUnlock.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Unlock the full report" }));
    expect(onUnlock).toHaveBeenCalledTimes(1);
  });
});

// Review 27.09, Mark: "accelerators & Brakes - let's have the headlines fade in, ie
// 'what brakes you' 'what accelerates you'".
describe("V4TriggerCard — the headline fades in once the card reaches the screen", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  const head = (root: Element) => root.querySelector(".rv4-trig__head")!;

  it("holds the badge and label back until the head is in view, then lets them in", () => {
    installRevealObserver();
    mockRect({ top: 5000 });
    const { container } = render(<V4TriggerCard tone="brake" rows={OPEN.brakes} />);
    expect(head(container)).toHaveClass("is-pending");
    expect(screen.getByRole("heading", { name: "WHAT BRAKES YOU" })).toBeTruthy();
    observerOf(head(container))!.fire(true);
    expect(head(container)).not.toHaveClass("is-pending");
    expect(container.querySelector(".rv4-reveal")).toBeNull();
  });

  // Mark, 28.09: "the same animations of the headlines of accelerators & brakes in the
  // text also. So also animate the headlines and texts".
  const rowsBlock = (root: HTMLElement) => root.querySelector<HTMLElement>(".rv4-trig__rows")!;

  it("holds the rows back until they reach the screen, each numbered for its turn", () => {
    installRevealObserver();
    mockRect({ top: 5000 });
    const { container } = render(<V4TriggerCard tone="brake" rows={OPEN.brakes} />);
    expect(rowsBlock(container)).toHaveClass("is-pending");
    const rows = [...container.querySelectorAll<HTMLElement>(".rv4-trig__row")];
    expect(rows.length).toBeGreaterThanOrEqual(3);
    rows.forEach((row, i) => expect(row.style.getPropertyValue("--rv4-trig-i")).toBe(String(i)));
    observerOf(rowsBlock(container))!.fire(true);
    expect(rowsBlock(container)).not.toHaveClass("is-pending");
  });

  it("fades the paywalled card's headline in too: heads are never blurred", () => {
    installRevealObserver();
    mockRect({ top: 5000 });
    const { container } = render(
      <V4TriggerCard tone="accel" rows={LOCKED.accelerators} lockedFrom={LOCKED.lockedFrom} />
    );
    expect(head(container)).toHaveClass("is-pending");
    observerOf(head(container))!.fire(true);
    expect(head(container)).not.toHaveClass("is-pending");
  });
});

describe("reportV3.css — trigger card contracts", () => {
  const rule = (selector: string) => {
    const at = V3_CSS.indexOf(selector);
    expect(at, `${selector} missing from reportV3.css`).toBeGreaterThan(-1);
    return V3_CSS.slice(at, V3_CSS.indexOf("}", at));
  };

  it("draws the card: 20px radius, 1px tone border, clipped", () => {
    const css = rule(".rv3 .rv4-trig {");
    expect(css).toContain("border-radius: 20px");
    expect(css).toContain("border: 1px solid rgba(var(--trig), 0.24)");
    expect(css).toContain("overflow: hidden");
  });

  it("tones coral for the brakes and green for the accelerators", () => {
    expect(rule(".rv3 .rv4-trig--brake {")).toContain("--trig: 194, 84, 47");
    expect(rule(".rv3 .rv4-trig--accel {")).toContain("--trig: 46, 125, 91");
  });

  it("sets the label at 12/19.2 extra-bold with 1.56px tracking", () => {
    const css = rule(".rv3 .rv4-trig__label {");
    expect(css).toContain("font-size: 12px");
    expect(css).toContain("font-weight: 800");
    expect(css).toContain("letter-spacing: 1.56px");
  });

  it("fades the badge in, then the label, 6px up from under the head (review 27.09)", () => {
    const pending = rule(`.rv3 .rv4-trig__head.is-pending > .rv4-trig__badge,
.rv3 .rv4-trig__head.is-pending > .rv4-trig__label {`);
    expect(pending).toContain("opacity: 0");
    expect(pending).toContain("transform: translateY(6px)");
    const moving = rule(`.rv3 .rv4-trig__head > .rv4-trig__badge,
.rv3 .rv4-trig__head > .rv4-trig__label {`);
    expect(moving).toMatch(/opacity 420ms/);
    expect(moving).toMatch(/transform 520ms/);
    // The label's own rule, after the shared one whose second line reads the same.
    const labelAt = V3_CSS.lastIndexOf(".rv3 .rv4-trig__head > .rv4-trig__label {");
    expect(V3_CSS.slice(labelAt, V3_CSS.indexOf("}", labelAt))).toContain("transition-delay: 90ms");
  });

  it("lets the clear rows rise 6px after the headline, one by one; rows under the blur stay still (review 28.09)", () => {
    const pending = rule(".rv3 .rv4-trig__rows.is-pending .rv4-trig__row:not(.is-locked) {");
    expect(pending).toContain("opacity: 0");
    expect(pending).toContain("transform: translateY(6px)");
    const moving = rule(".rv3 .rv4-trig__rows .rv4-trig__row:not(.is-locked) {");
    expect(moving).toMatch(/opacity 420ms/);
    expect(moving).toMatch(/transform 520ms/);
    expect(moving).toMatch(/transition-delay:\s*calc\(180ms \+ var\(--rv4-trig-i, 0\) \* 90ms\)/);
    const at = V3_CSS.indexOf("@media (prefers-reduced-motion: reduce) {\n  .rv3 .rv4-trig__rows");
    expect(at).toBeGreaterThan(0);
    const media = V3_CSS.slice(at, V3_CSS.indexOf("\n}\n", at));
    expect(media).toContain(".rv3 .rv4-trig__rows.is-pending .rv4-trig__row:not(.is-locked)");
    expect(media).toContain("opacity: 1");
    expect(media).toContain("transition: none");
  });

  it("shows the headline in place under reduced motion, pending or not", () => {
    const at = V3_CSS.indexOf(`@media (prefers-reduced-motion: reduce) {
  .rv3 .rv4-trig__head > .rv4-trig__badge,`);
    expect(at).toBeGreaterThan(0);
    const media = V3_CSS.slice(at, V3_CSS.indexOf("\n}\n", at));
    expect(media).toContain(".rv3 .rv4-trig__head.is-pending > .rv4-trig__label");
    expect(media).toContain("opacity: 1");
    expect(media).toContain("transform: none");
    expect(media).toContain("transition: none");
  });

  it("keeps nothing of the scales or their reveal", () => {
    expect(V3_CSS).not.toMatch(/\.rv4-trig__(scale|track|fill|knob)/);
    expect(V3_CSS).not.toContain(".rv4-trig__rows.rv4-reveal");
    expect(V3_CSS).not.toContain("--trig-fill");
  });

  it("fades the third row as the frame does, and sets the pill 48px into it, centred", () => {
    expect(rule(".rv3 .rv4-trig__peek {")).toContain("overflow: hidden");
    const fade = rule(".rv3 .rv4-trig__fade {");
    expect(fade).toContain("rgba(255, 255, 255, 0.7) 40%");
    expect(fade).toContain("#fff 85%");
    expect(fade).toContain("height: 96px");
    expect(fade).toContain("top: -2px");
    const pill = rule(".rv3 .rv4-trig__peek .rv4-trig__pill {");
    expect(pill).toContain("top: 48px");
    expect(pill).toContain("left: 50%");
    expect(pill).toContain("transform: translateX(-50%)");
  });

  it("draws the pill with the fantasy table's rules — one pill, 713:6178 and 639:498", () => {
    expect(V3_CSS).toContain(".rv3 .rv4-fvt__pill,\n.rv3 .rv4-trig__pill {");
    expect(V3_CSS).toContain(".rv3 .rv4-fvt__pill::after,\n.rv3 .rv4-trig__pill::after {");
    expect(V3_CSS).toContain(
      ".rv3 .rv4-fvt__pill:focus-visible,\n.rv3 .rv4-trig__pill:focus-visible {"
    );
    expect(V3_CSS).toContain(".rv3 .rv4-fvt__pill-label,\n.rv3 .rv4-trig__pill-label {");
  });

  // Final review, 25.09: the row the pill hands focus to hid its outline from keyboard
  // users too. The ring stays for keyboard focus; only a pointer's focus drops it.
  it("shows keyboard focus on the row the pill hands focus to", () => {
    expect(V3_CSS).not.toContain(".rv3 .rv4-trig__row:focus {");
    expect(V3_CSS).toContain(".rv3 .rv4-trig__row:focus:not(:focus-visible) {");
  });

  it("blurs locked rows by the veil (review 26.09) and places each badge as the new frames do", () => {
    expect(rule(".rv3 .rv4-trig__row.is-locked.is-blurred {")).toContain(
      "filter: blur(var(--rv4-veil, 5px))"
    );
    expect(rule(".rv3 .rv4-trig--brake .rv4-trig__lock {")).toContain("--rv4-lock-top: 124px");
    expect(rule(".rv3 .rv4-trig--accel .rv4-trig__lock {")).toContain("--rv4-lock-top: 127px");
  });
});
