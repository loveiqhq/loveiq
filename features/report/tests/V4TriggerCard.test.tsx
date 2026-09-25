// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import V4TriggerCard from "@features/report/ui/v3/V4TriggerCard";
import { buildAccelerators } from "@/data/report3-accelerators";

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
    // The locked rows carry the server's scrambled copy, not the real rows.
    expect(lock.textContent).not.toContain("Control and possessiveness");
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

  it("blurs locked rows at the frame's radius 4 and places each badge as the new frames do", () => {
    expect(rule(".rv3 .rv4-trig__row.is-locked {")).toContain("filter: blur(2px)");
    expect(rule(".rv3 .rv4-trig--brake .rv4-trig__lock {")).toContain("--rv4-lock-top: 124px");
    expect(rule(".rv3 .rv4-trig--accel .rv4-trig__lock {")).toContain("--rv4-lock-top: 127px");
  });
});
