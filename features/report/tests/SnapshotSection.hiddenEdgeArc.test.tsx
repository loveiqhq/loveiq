// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import SnapshotSection from "@features/report/ui/sections/SnapshotSection";
import { getReport2Section } from "@/data/report2";
import { KNOWN_ARCHETYPES } from "@features/report/server/archetypeSlug";

/**
 * The "Your Hidden Edge" ring must sweep the share printed directly above it.
 *
 * It was a hardcoded half sweep taken from the one Figma frame that mocked the
 * card, so twelve of the fourteen archetypes showed a ring contradicting their
 * own figure — "1 in 4" drawn as 50%, "1 in 14" drawn as 50%. Same defect class
 * as the compare dots and the compare bar before them.
 *
 * The arc is expressed as `--arc-offset` (1 − fraction) because the draw-in
 * animates `stroke-dashoffset` from 1 down to that value, matching the
 * `.report-draw-line` primitive the rest of the report's charts use.
 */
function renderCard(stat: string | null, caption = "share who open first") {
  return render(
    <SnapshotSection
      archetype="Relational Nurturer"
      copy={{ "openingMove.stat": stat, "openingMove.caption": caption }}
    />
  );
}

const arcOffset = (container: HTMLElement): number | null => {
  const arc = container.querySelector<SVGCircleElement>(".report-snapshot-card__arc");
  if (!arc) return null;
  const raw = arc.style.getPropertyValue("--arc-offset");
  return raw === "" ? null : Number(raw);
};

afterEach(cleanup);

describe("Snapshot hidden-edge ring", () => {
  it.each([
    ["1 in 4", 0.25],
    ["1 in 3", 1 / 3],
    ["1 in 2", 0.5],
    ["1 in 14", 1 / 14],
    ["About 1 in 2", 0.5],
    ["52%", 0.52],
  ])("sweeps %s as its own share", (stat, fraction) => {
    const { container } = renderCard(stat);
    const offset = arcOffset(container);
    expect(offset, `no arc rendered for "${stat}"`).not.toBeNull();
    expect(offset!).toBeCloseTo(1 - fraction, 4);
  });

  it.each(["Rarely first", "rarely first"])(
    "draws no accent arc for the qualitative value %s",
    (stat) => {
      // Figma's half sweep would say the opposite of the word above it, and any
      // other size would invent a statistic the stats audit declined to give.
      const { container } = renderCard(stat);
      expect(container.querySelector(".report-snapshot-card__arc")).toBeNull();
      // The faint track still renders, so the card keeps its composition.
      // Scoped past the arousal curve, whose SVG also carries a <circle> marker.
      const ring = container.querySelector(
        ".report-snapshot-card__viz:not(.report-snapshot-card__viz--curve)"
      );
      expect(ring!.querySelectorAll("circle")).toHaveLength(1);
    }
  );

  it("never contradicts the figure it prints, for all 14 archetypes", () => {
    // Card 1's value is resolved server-side from `initiation.stat1`; this walks
    // the real data rather than a fixture, so a copy change that breaks the
    // parser fails here instead of shipping a wrong ring.
    const mismatches: string[] = [];

    for (const archetype of KNOWN_ARCHETYPES) {
      const stat = getReport2Section(archetype, "initiation")["stat1"] as string | undefined;
      if (!stat) continue;

      const { container } = renderCard(stat);
      const offset = arcOffset(container);

      const ratio = stat.match(/\b(\d+)\s+in\s+(\d+)/i);
      const expected = ratio ? Number(ratio[1]) / Number(ratio[2]) : null;

      if (expected === null) {
        if (offset !== null) mismatches.push(`${archetype}: "${stat}" drew an arc`);
      } else if (offset === null) {
        mismatches.push(`${archetype}: "${stat}" drew no arc`);
      } else if (Math.abs(1 - offset - expected) > 0.001) {
        mismatches.push(
          `${archetype}: "${stat}" -> ${((1 - offset) * 100).toFixed(0)}%, expected ${(expected * 100).toFixed(0)}%`
        );
      }
      cleanup();
    }

    expect(mismatches).toEqual([]);
  });
});
