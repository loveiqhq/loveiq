// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { KNOWN_ARCHETYPES } from "@features/report/server/archetypeSlug";
import { splitFirstSentence } from "@features/report/server/gatedCopy";
import { buildFantasy, REPORT_V4_FANTASY } from "@/data/report3-fantasy";
import type { Report3Block } from "@/data/report3-learn-more";
import V4Fantasy from "@features/report/ui/v3/V4Fantasy";

/**
 * Sanjin, 05.10: "the paywall on fantasy vs reality common challenges is too early, the
 * commen challenges tittle should remain open, and the paywall starts at the second
 * sentence of the text, as in the docs." Fatih: "Will resolve it". So a locked reader
 * keeps the heading and the first sentence sharp, and the blur fades in from the second
 * sentence on, for every archetype. Held without quoting the paid copy.
 */

afterEach(cleanup);

const textOf = (block: Report3Block | null | undefined): string =>
  !block
    ? ""
    : block.kind === "heading"
      ? block.text
      : block.kind === "para"
        ? block.runs.map((r) => r.text).join("")
        : block.items.map((runs) => runs.map((r) => r.text).join("")).join(" ");
const sentences = (text: string) => text.match(/[.!?][”’"')\]]*(?=\s|$)/g)?.length ?? 0;

describe("splitFirstSentence", () => {
  const para = (...texts: [string, (700 | undefined)?][]): Report3Block => ({
    kind: "para",
    runs: texts.map(([text, weight]) => (weight ? { text, weight } : { text })),
  });

  it("cuts after the first sentence, run by run, dropping the space between", () => {
    const cut = splitFirstSentence(
      para(["A bold lead ends here.", 700], [" Then more. And more."])
    );
    expect(cut).not.toBeNull();
    const [head, tail] = cut!;
    expect(head).toEqual(para(["A bold lead ends here.", 700]));
    expect(tail).toEqual(para(["Then more. And more."]));
  });

  it("cuts inside a run, and past a closing quote", () => {
    const [head, tail] = splitFirstSentence(para(["One “quoted.” Two."]))!;
    expect(textOf(head)).toBe("One “quoted.”");
    expect(textOf(tail)).toBe("Two.");
  });

  it("keeps a one-sentence paragraph whole", () => {
    const block = para(["Only one sentence."]);
    expect(splitFirstSentence(block)).toEqual([block, null]);
  });

  it("finds nothing to cut in a heading, or where no sentence ends", () => {
    expect(splitFirstSentence({ kind: "heading", text: "A heading." })).toBeNull();
    expect(splitFirstSentence(para(["no full stop at all"]))).toBeNull();
  });
});

describe("Fantasy vs. Reality's Common Challenges, locked (Sanjin, 05.10)", () => {
  it.each(KNOWN_ARCHETYPES)("keeps %s's heading and first sentence sharp", (archetype) => {
    const copy = REPORT_V4_FANTASY[archetype]!;
    const { challenges } = buildFantasy(archetype, { locked: true })!;
    const [heading, first] = challenges.free;
    expect(challenges.free).toHaveLength(2);
    expect(heading).toEqual(copy.challenges[0]);
    expect(heading!.kind).toBe("heading");
    expect(first!.kind).toBe("para");
    expect(sentences(textOf(first))).toBe(1);
    // Nothing is lost or reordered: the free sentence and the ramp make the copy's first
    // paragraph, or the first paragraph is that one sentence and the ramp the next one.
    const original = textOf(copy.challenges[1]);
    if (textOf(first) === original) {
      expect(textOf(challenges.ramp)).toBe(textOf(copy.challenges[2]));
      expect(challenges.rest).toHaveLength(copy.challenges.length - 3);
    } else {
      expect(first!.kind === "para" && first!.tight).toBe(true);
      expect(`${textOf(first)} ${textOf(challenges.ramp)}`).toBe(original);
      expect(challenges.rest).toHaveLength(copy.challenges.length - 2);
    }
  });

  it.each(KNOWN_ARCHETYPES)("gives a paying reader %s's copy whole", (archetype) => {
    const { challenges } = buildFantasy(archetype)!;
    expect(challenges.free).toEqual(REPORT_V4_FANTASY[archetype]!.challenges);
    expect(challenges.ramp).toBeNull();
    expect(challenges.rest).toEqual([]);
  });
});

describe("V4Fantasy, locked", () => {
  const renderLocked = (onUnlock = vi.fn()) => {
    const view = buildFantasy("Quiet Withdrawer", { locked: true })!;
    return { ...render(<V4Fantasy view={view} onUnlock={onUnlock} />), view, onUnlock };
  };

  it("draws the heading and the first sentence sharp, outside the blur and the click", () => {
    const { container, view, onUnlock } = renderLocked();
    const free = container.querySelector(".rv4-fvr__free")!;
    expect(free.textContent).toContain(textOf(view.challenges.free[0]));
    expect(free.textContent).toContain(textOf(view.challenges.free[1]));
    expect(free.closest("[inert], .rv4-fvr__gate")).toBeNull();
    fireEvent.click(free);
    expect(onUnlock).not.toHaveBeenCalled();
  });

  it("fades the blur in over the second sentence, then blurs the rest", () => {
    const { container, view, onUnlock } = renderLocked();
    const gate = container.querySelector(".rv4-fvr__gate")!;
    const ramp = gate.querySelector("[inert] .rv4-fvr__ramp")!;
    expect(ramp.textContent).toContain(textOf(view.challenges.ramp));
    expect(ramp.querySelectorAll(".rv4-pblur > span")).toHaveLength(3);
    expect(gate.querySelectorAll("[inert] .rv4-fvr__blurred p")).toHaveLength(
      view.challenges.rest.length
    );
    expect(gate.querySelector(".rv4-premium")).not.toBeNull();
    fireEvent.click(ramp);
    expect(onUnlock).toHaveBeenCalledTimes(1);
  });
});
