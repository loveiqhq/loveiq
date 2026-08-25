// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import ArchetypeBlendSection from "@features/report/ui/sections/ArchetypeBlendSection";

// jsdom has no IntersectionObserver, so `useRevealOnView` starts revealed and no
// observer stub is needed here (see the hook's SSR fallback).

const ALL_14 = [
  "Relational Nurturer",
  "Tender Devotee",
  "Sensual Connector",
  "Spiritual Lover",
  "Minimalist Companion",
  "Loyal Ritualist",
  "Curious Apprentice",
  "Quiet Withdrawer",
  "Emotional Voyeur",
  "Radiant Performer",
  "Spark Seeker",
  "Authority Conductor",
  "Analytical Sexualist",
  "Explorer of Edges",
];

/** Descending percentages with a controllable gap between rank 1 and rank 3. */
function pcts(spread: number): Record<string, number> {
  const out: Record<string, number> = {};
  ALL_14.forEach((name, i) => {
    out[name] = i < 3 ? 70 - (spread / 2) * i : 40 - i;
  });
  return out;
}

const MOTTOS = Object.fromEntries(ALL_14.map((n) => [n, `"${n} motto."`]));

afterEach(cleanup);

describe("ArchetypeBlendSection", () => {
  it("shows only the top three of the fourteen", () => {
    render(
      <ArchetypeBlendSection
        ranking={ALL_14}
        percentages={pcts(20)}
        mottos={MOTTOS}
        viewArchetype={ALL_14[0]!}
      />
    );

    for (const name of ALL_14.slice(0, 3)) {
      expect(screen.getByRole("heading", { name })).toBeTruthy();
    }
    // Rank 4 onward must not be here — that is what the fourteen-row
    // ConstellationSection at the end of Part I is for.
    for (const name of ALL_14.slice(3)) {
      expect(screen.queryByRole("heading", { name })).toBeNull();
    }
    expect(screen.getAllByRole("progressbar")).toHaveLength(3);
  });

  it("renders each match percentage, so the hero's number has a reference", () => {
    render(
      <ArchetypeBlendSection
        ranking={ALL_14}
        percentages={pcts(20)}
        mottos={MOTTOS}
        viewArchetype={ALL_14[0]!}
      />
    );
    // The whole reason this block exists: an unattributed "71%" in the hero.
    expect(screen.getByText("70.0%")).toBeTruthy();
    expect(screen.getByText("60.0%")).toBeTruthy();
    expect(screen.getByText("50.0%")).toBeTruthy();
  });

  it("names the archetype the rest of the report speaks in", () => {
    render(
      <ArchetypeBlendSection
        ranking={ALL_14}
        percentages={pcts(20)}
        mottos={MOTTOS}
        viewArchetype={ALL_14[0]!}
      />
    );
    const handoff = document.querySelector(".report-blend__handoff");
    expect(handoff?.textContent).toContain("Relational Nurturer");
    // Wide spread: the reader is told a miss points at what sits underneath,
    // rather than being told they are an even blend.
    expect(handoff?.textContent).toContain("explains the most");
    expect(handoff?.textContent).not.toContain("sit close together");
  });

  it("says the same thing however close the top three are", () => {
    // A spread-keyed "your top three sit close together" variant was cut on
    // 2026-08-25: the bars above already show how close they are.
    render(
      <ArchetypeBlendSection
        ranking={ALL_14}
        percentages={pcts(4)}
        mottos={MOTTOS}
        viewArchetype={ALL_14[0]!}
      />
    );
    const handoff = document.querySelector(".report-blend__handoff");
    expect(handoff?.textContent).toContain("explains the most");
    expect(handoff?.textContent).not.toContain("sit close together");
  });

  it("describes each of the three, not just names it", () => {
    render(
      <ArchetypeBlendSection
        ranking={ALL_14}
        percentages={pcts(20)}
        mottos={MOTTOS}
        viewArchetype={ALL_14[0]!}
      />
    );
    // The motto is evocative, not descriptive; the blurb is what says what the
    // pattern actually is. All three rows carry one.
    const blurbs = document.querySelectorAll(".report-blend__blurb");
    expect(blurbs).toHaveLength(3);
    expect(blurbs[0]!.textContent).toContain("Desire that runs through care");
  });

  it("renders a row without a motto rather than dropping it", () => {
    render(
      <ArchetypeBlendSection
        ranking={ALL_14}
        percentages={pcts(20)}
        mottos={{ ...MOTTOS, "Tender Devotee": null }}
        viewArchetype={ALL_14[0]!}
      />
    );
    expect(screen.getAllByRole("progressbar")).toHaveLength(3);
    expect(screen.getByRole("heading", { name: "Tender Devotee" })).toBeTruthy();
  });

  it("does not claim someone else's chapters are your top match", () => {
    // Reached by opening another archetype from the constellation list. Saying
    // "the chapters ahead read your strongest match" would be false there.
    render(
      <ArchetypeBlendSection
        ranking={ALL_14}
        percentages={pcts(20)}
        mottos={MOTTOS}
        viewArchetype="Spark Seeker"
      />
    );
    const handoff = document.querySelector(".report-blend__handoff");
    expect(handoff?.textContent).toContain("You are reading the Spark Seeker chapters");
    expect(handoff?.textContent).toContain("Your own strongest match is Relational Nurturer");
    expect(handoff?.textContent).not.toContain("explains the most");
  });

  it("renders nothing without a ranking", () => {
    const { container } = render(
      <ArchetypeBlendSection ranking={[]} percentages={{}} mottos={{}} viewArchetype="" />
    );
    expect(container.firstChild).toBeNull();
  });
});
