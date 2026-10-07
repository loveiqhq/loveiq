// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * The `afterCards` slot: a paragraph after the two lists, before "Common challenges", in the
 * chapter's 16px rhythm, as free copy. Loyal Ritualist's and Tender Devotee's docs set one on
 * 01.10, and Sanjin deleted both on 02.10 (no text around the lists), so no archetype uses
 * it now; the slot keeps its behaviour. An archetype without one draws nothing there.
 * Stand-in archetypes, so no copy sits in this test.
 */
const { CLOSE, record } = vi.hoisted(() => {
  const para = (text: string) => ({ kind: "para" as const, runs: [{ text }] });
  const CLOSE = [para("The two lists, closed.")];
  const rows = (kind: string) =>
    Array.from({ length: 5 }, (_, i) => ({
      label: `${kind} ${i}`,
      subtext: `About ${kind} ${i}.`,
    }));
  const record = (withClose: boolean) => ({
    intro: [para("Intro.")],
    brakes: rows("Brake"),
    accelerators: rows("Accelerator"),
    ...(withClose ? { afterCards: CLOSE } : {}),
    challenges: [para("Challenge, first."), para("Challenge, second."), para("Challenge, third.")],
    practice: [para("Practice, first."), para("Practice, second."), para("Practice, third.")],
    cuts: { challengesFree: 1, practiceFree: 1, practiceRampThrough: null },
  });
  return { CLOSE, record };
});

vi.mock("@/data/report3-copy", () => ({
  chapterCopy: (chapter: string) =>
    chapter === "accelerators"
      ? { "With Close": record(true), "Without Close": record(false) }
      : {},
}));

import { buildAccelerators } from "@/data/report3-accelerators";
import V4Accelerators from "@features/report/ui/v3/V4Accelerators";

afterEach(cleanup);

describe("Accelerators & Brakes — a paragraph after the two cards (01.10)", () => {
  it("closes the cards with the archetype's paragraph, before Common challenges", () => {
    for (const locked of [false, true]) {
      const view = buildAccelerators("With Close", { locked })!;
      // Free copy: as written for a locked reader too.
      expect(view.afterCards).toEqual(CLOSE);
      const { container, unmount } = render(<V4Accelerators view={view} />);
      const after = container.querySelector(".rv4-ab__after")!;
      expect(after.textContent).toBe("The two lists, closed.");
      const cards = container.querySelectorAll(".rv4-trig");
      expect(cards).toHaveLength(2);
      expect(cards[1]!.nextElementSibling).toBe(after);
      expect(after.nextElementSibling).toHaveClass("rv4-ab__challenges");
      unmount();
    }
  });

  it("draws nothing there for an archetype without one", () => {
    const view = buildAccelerators("Without Close")!;
    expect(view).not.toHaveProperty("afterCards");
    const { container } = render(<V4Accelerators view={view} />);
    expect(container.querySelector(".rv4-ab__after")).toBeNull();
  });

  it("ends the paragraph on the chapter's own 16px gap, not a paragraph margin", () => {
    const css = readFileSync(join(__dirname, "..", "ui", "v3", "reportV3.css"), "utf8");
    // The intro's and the challenges' own rule: one selector list, one body.
    const at = css.indexOf(".rv3 .rv4-ab__intro > :last-child");
    const open = css.indexOf("{", at);
    expect(css.slice(at, open)).toContain(".rv3 .rv4-ab__after > :last-child");
    expect(css.slice(open, css.indexOf("}", open))).toContain("margin-bottom: 0");
  });
});
