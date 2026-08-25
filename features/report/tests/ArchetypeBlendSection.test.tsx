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

/** Descending percentages, top three separated by `spread`. */
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
    render(<ArchetypeBlendSection ranking={ALL_14} percentages={pcts(20)} mottos={MOTTOS} />);

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
    render(<ArchetypeBlendSection ranking={ALL_14} percentages={pcts(20)} mottos={MOTTOS} />);
    // The whole reason this block exists: an unattributed "71%" in the hero.
    expect(screen.getByText("70.0%")).toBeTruthy();
    expect(screen.getByText("60.0%")).toBeTruthy();
    expect(screen.getByText("50.0%")).toBeTruthy();
  });

  it("describes each of the three, not just names it", () => {
    render(<ArchetypeBlendSection ranking={ALL_14} percentages={pcts(20)} mottos={MOTTOS} />);
    // The motto is evocative, not descriptive; the blurb is what says what the
    // pattern actually is. All three rows carry one.
    const blurbs = document.querySelectorAll(".report-blend__blurb");
    expect(blurbs).toHaveLength(3);
    expect(blurbs[0]!.textContent).toContain("Desire that runs through care");
  });

  it("ends on the ranked card, with no closing paragraph", () => {
    // The "the chapters ahead read X in depth" handoff was cut on 2026-08-25.
    // It is the block most likely to come back by reflex, so this pins it.
    const { container } = render(
      <ArchetypeBlendSection ranking={ALL_14} percentages={pcts(20)} mottos={MOTTOS} />
    );
    expect(container.querySelector(".report-blend__handoff")).toBeNull();
    expect(container.textContent).not.toContain("chapters ahead");
    expect(container.querySelector(".report-blend")!.lastElementChild!.className).toContain(
      "report-blend__card"
    );
  });

  it("says the percentages are not scores", () => {
    render(<ArchetypeBlendSection ranking={ALL_14} percentages={pcts(20)} mottos={MOTTOS} />);
    const intro = document.querySelector(".report-blend__intro");
    expect(intro?.textContent).toContain("not scores");
    expect(intro?.textContent).toContain("nothing to pass");
  });

  it("renders a row without a motto rather than dropping it", () => {
    render(
      <ArchetypeBlendSection
        ranking={ALL_14}
        percentages={pcts(20)}
        mottos={{ ...MOTTOS, "Tender Devotee": null }}
      />
    );
    expect(screen.getAllByRole("progressbar")).toHaveLength(3);
    expect(screen.getByRole("heading", { name: "Tender Devotee" })).toBeTruthy();
  });

  it("renders nothing without a ranking", () => {
    const { container } = render(
      <ArchetypeBlendSection ranking={[]} percentages={{}} mottos={{}} />
    );
    expect(container.firstChild).toBeNull();
  });
});
