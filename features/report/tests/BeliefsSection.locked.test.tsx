// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import BeliefsSection, { type BeliefsCopy } from "@features/report/ui/sections/BeliefsSection";

/**
 * The locked stand-in used to be a single column of two rows sitting behind an
 * overlay card roughly 890px tall, so the paywall floated over blank white for
 * most of its height and the section read as though nothing was behind it.
 * These tests pin the two things that fix makes true: the stand-in mirrors the
 * real two-column grid at a comparable size, and it still leaks nothing.
 */
const lockedCopy: BeliefsCopy = {
  "gate.hook": "See which beliefs still serve you",
  "learn.eyebrow": "What you will learn",
  "learn.body": "In this chapter you will learn where your beliefs came from.",
  // What a locked client actually receives: the per-archetype payload withheld.
  keep: [],
  loosen: [],
  locked: true,
};

const REAL_BELIEF = "Sex is a way we care for each other";

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

describe("BeliefsSection — locked stand-in", () => {
  it("renders the blurred stand-in as TWO columns, mirroring the unlocked grid", () => {
    const { container } = renderLocked();
    const fade = container.querySelector(".report-beliefs__preview-fade");
    expect(fade, "locked stand-in is missing").not.toBeNull();
    expect(fade!.querySelectorAll(".report-beliefs__col")).toHaveLength(2);
  });

  it("fills the height behind the overlay rather than showing two rows", () => {
    const { container } = renderLocked();
    const fade = container.querySelector(".report-beliefs__preview-fade")!;
    const rows = fade.querySelectorAll(".report-beliefs__list > *");
    // The overlay card is ~890px tall; two rows left most of it over blank
    // white. Twelve-plus rows across two columns covers it at any breakpoint.
    expect(rows.length).toBeGreaterThanOrEqual(12);
  });

  it("labels both columns the way the unlocked grid does", () => {
    renderLocked();
    expect(screen.getAllByText(/Serve you/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Box you in/i).length).toBeGreaterThan(0);
  });

  it("leaks no per-archetype belief copy into a locked render", () => {
    // Even if the server ever sent them, a locked client must not paint them.
    const { container } = renderLocked({
      keep: [REAL_BELIEF],
      loosen: [{ belief: "My needs should come second", shift: "My pleasure matters too" }],
    });
    const fade = container.querySelector(".report-beliefs__preview-fade")!;
    expect(fade.textContent).not.toContain(REAL_BELIEF);
    expect(fade.textContent).not.toContain("My needs should come second");
  });

  it("still renders the paywall overlay over the stand-in", () => {
    const { container } = renderLocked();
    expect(container.querySelector('[class*="premium-overlay"]')).not.toBeNull();
  });
});
