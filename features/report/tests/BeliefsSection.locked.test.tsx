// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import BeliefsSection, { type BeliefsCopy } from "@features/report/ui/sections/BeliefsSection";

/**
 * The locked state has been through four shapes, and this is the one Figma
 * actually draws:
 *
 *  1. one column of two rows behind an ~890px card — the paywall floated over
 *     blank white and the section read as though nothing was behind it;
 *  2. a hand-written two-column stand-in — right shape, invented words;
 *  3. a pre-blurred raster of the real chapter — real content, but blurred, and
 *     Figma's locked frame does not blur this chapter at all;
 *  4. the real beliefs, sharp and readable at the top of each column, fading
 *     black -> grey -> transparent toward the paywall card.
 *
 * The security boundary moved with it. It is no longer "the pixels are destroyed";
 * it is "the server only sent four rows per column" (BELIEFS_TEASER_ROWS in
 * app/api/report/route.ts). These tests pin the client half: the tease renders the
 * rows it was given, sharp, with the fade — and it renders nothing it was not given.
 */
const lockedCopy: BeliefsCopy = {
  "learn.eyebrow": "What you will learn",
  "learn.body": "In this chapter you will learn where your beliefs came from.",
  // What a locked client now receives: the first four rows of each column.
  keep: ["Sex is a way we care for each other", "Closeness makes me want to give"],
  loosen: [
    { belief: "My needs should come second", shift: "My pleasure matters too" },
    { belief: "If I say no, I'll hurt them", shift: "A no can hold love" },
  ],
  locked: true,
};

function renderLocked(overrides: Partial<BeliefsCopy> = {}) {
  return render(
    <BeliefsSection
      archetype="Relational Nurturer"
      copy={{ ...lockedCopy, ...overrides }}
      isUnlocked={false}
      onUnlock={() => {}}
      sectionTitle="Typical Beliefs"
    />
  );
}

afterEach(cleanup);

describe("BeliefsSection — locked tease", () => {
  it("renders the real rows it was given, in both columns", () => {
    const { container } = renderLocked();
    const fade = container.querySelector(".report-beliefs__preview-fade--tease");
    expect(fade, "locked tease is missing").not.toBeNull();
    expect(fade!.querySelectorAll(".report-beliefs__col")).toHaveLength(2);
    expect(fade!.textContent).toContain("Sex is a way we care for each other");
    expect(fade!.textContent).toContain("My needs should come second");
  });

  it("is not blurred and carries no raster image", () => {
    // Figma's locked frame keeps this chapter sharp; the fade does the work.
    const { container } = renderLocked();
    const fade = container.querySelector(".report-beliefs__preview-fade--tease")!;
    expect(fade.querySelector("img"), "the blurred raster should be gone").toBeNull();
    expect(fade.className).not.toContain("report-preview-fade--image");
  });

  it("labels both columns", () => {
    renderLocked();
    expect(screen.getAllByText(/Serve you/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Box you in/i).length).toBeGreaterThan(0);
  });

  it("renders only the rows the server sent, never a padded list", () => {
    // The withheld rows are absent from the payload, so the tease cannot show
    // more than it was given — that is where the paywall boundary lives now.
    const { container } = renderLocked({ keep: ["Only one belief"], loosen: [] });
    const fade = container.querySelector(".report-beliefs__preview-fade--tease")!;
    expect(fade.querySelectorAll(".report-beliefs__list > *")).toHaveLength(1);
    expect(fade.querySelectorAll(".report-beliefs__col")).toHaveLength(1);
  });

  it("still withholds the per-archetype body paragraph", () => {
    const { container } = renderLocked();
    expect(container.querySelector(".report-beliefs__note")).toBeNull();
  });

  it("still renders the paywall overlay over the tease", () => {
    const { container } = renderLocked();
    expect(container.querySelector('[class*="premium-overlay"]')).not.toBeNull();
  });
});
