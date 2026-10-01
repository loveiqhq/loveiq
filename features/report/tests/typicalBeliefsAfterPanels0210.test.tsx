// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Sanjin's Authority Conductor doc (01.10) sets a paragraph after the sun beliefs, before
 * "Common challenges": a reflection on the two lists, not a challenge. No frame draws it:
 * it follows the sun panel as the chapter's prose does, 16 apart, and it is free copy, the
 * doc's wall falling later, in the challenges. An archetype without one draws nothing
 * there. Stand-in archetypes, so no copy sits in this test.
 */
const { AFTER, record } = vi.hoisted(() => {
  const para = (text: string) => ({ kind: "para" as const, runs: [{ text }] });
  const AFTER = [para("The two lists, read together.")];
  const record = (withAfter: boolean) => ({
    lede: [
      { kind: "heading" as const, text: "The Stand-in belief map", level: 2 as const },
      para("For the Stand-in, a lede."),
    ],
    turns: Array.from({ length: 10 }, (_, i) => ({
      shadow: `“Shadow ${i}.”`,
      shift: `“Shift ${i}.”`,
    })),
    sun: Array.from({ length: 10 }, (_, i) => `“Sun ${i}.”`),
    ...(withAfter ? { afterPanels: AFTER } : {}),
    challenges: [para("Challenge, first."), para("Challenge, second."), para("Challenge, third.")],
    practice: [para("Practice, first."), para("Practice, second."), para("Practice, third.")],
    cuts: { challengesFree: 1, practiceFree: 1 },
  });
  return { AFTER, record };
});

vi.mock("@/data/report3-copy", () => ({
  chapterCopy: (chapter: string) =>
    chapter === "typicalBeliefs"
      ? { "With After": record(true), "Without After": record(false) }
      : {},
}));

import { buildTypicalBeliefs } from "@/data/report3-typical-beliefs";
import V4TypicalBeliefs from "@features/report/ui/v3/V4TypicalBeliefs";

afterEach(cleanup);

describe("Typical Beliefs — a paragraph between the panels and Common challenges (01.10)", () => {
  it("sets the archetype's paragraph after the sun panel, before the challenges' heading", () => {
    for (const locked of [false, true]) {
      const view = buildTypicalBeliefs("With After", { locked })!;
      // Free copy: as written for a locked reader too.
      expect(view.afterPanels).toEqual(AFTER);
      const { container, unmount } = render(<V4TypicalBeliefs view={view} />);
      const sun = container.querySelector(".rv4-sun")!;
      const after = sun.nextElementSibling!;
      expect(after).toHaveClass("rv4-prose__p");
      expect(after.textContent).toBe("The two lists, read together.");
      expect(after.nextElementSibling).toHaveClass("rv4-tb__h2");
      unmount();
    }
  });

  it("draws nothing there for an archetype without one", () => {
    const view = buildTypicalBeliefs("Without After")!;
    expect(view).not.toHaveProperty("afterPanels");
    const { container } = render(<V4TypicalBeliefs view={view} />);
    expect(container.querySelector(".rv4-sun")!.nextElementSibling).toHaveClass("rv4-tb__h2");
  });
});
