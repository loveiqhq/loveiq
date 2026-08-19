// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import archetypeConfig from "@/data/report2-archetype-config.json";
import {
  AROUSAL_CURVES,
  AROUSAL_FAMILIES,
  resolveArousalFamily,
} from "@features/report/ui/arousalCurves";
import { SnapshotCards } from "@features/report/ui/sections/SnapshotSection";
// SnapshotCards, not SnapshotSection: the card row is parked behind
// SHOW_SNAPSHOT_CARDS (hidden 2026-08-19, kept for reuse).

afterEach(cleanup);

/** Config entries are archetype slugs; the `_`-prefixed keys are metadata. */
function archetypeEntries(): Array<[string, string | undefined]> {
  return Object.entries(archetypeConfig as Record<string, { families?: { arousal?: string } }>)
    .filter(([slug]) => !slug.startsWith("_"))
    .map(([slug, cfg]) => [slug, cfg?.families?.arousal]);
}

describe("arousal families", () => {
  it("maps all 14 archetypes onto the three Figma families", () => {
    const entries = archetypeEntries();
    expect(entries).toHaveLength(14);

    const grouped: Record<string, string[]> = { responsive: [], spontaneous: [], contextual: [] };
    for (const [slug, family] of entries) {
      expect(AROUSAL_FAMILIES).toContain(family);
      grouped[family as string].push(slug);
    }

    // Counts per the Figma variant frames (6 / 3 / 5).
    expect(grouped.responsive).toHaveLength(6);
    expect(grouped.spontaneous).toHaveLength(3);
    expect(grouped.contextual).toHaveLength(5);
    expect(grouped.spontaneous.sort()).toEqual([
      "explorer-of-edges",
      "radiant-performer",
      "spark-seeker",
    ]);
  });

  it("gives every family its own arc and colour, on both surfaces", () => {
    const teaser = new Set<string>();
    const snapshot = new Set<string>();
    const colours = new Set<string>();

    for (const family of AROUSAL_FAMILIES) {
      const c = AROUSAL_CURVES[family];
      teaser.add(c.teaser.path);
      snapshot.add(c.snapshot.path);
      colours.add(`${c.from}|${c.to}`);
    }

    // If any of these collapse, a family silently reuses another's arc — the
    // exact bug this module exists to prevent.
    expect(teaser.size).toBe(3);
    expect(snapshot.size).toBe(3);
    expect(colours.size).toBe(3);
  });

  it("gives every family its own headline, subline and snapshot body line", () => {
    const headlines = new Set<string>();
    const sublines = new Set<string>();
    const subtexts = new Set<string>();
    const heights = new Set<number>();

    for (const family of AROUSAL_FAMILIES) {
      const c = AROUSAL_CURVES[family];
      headlines.add(c.headline);
      sublines.add(c.subline);
      subtexts.add(c.snapshotSubtext);
      heights.add(c.snapshot.vbHeight);
    }

    expect(headlines.size).toBe(3);
    expect(sublines.size).toBe(3);
    expect(subtexts.size).toBe(3);
    // Each family's arc is a different height in Figma — a shared viewBox
    // height would squash two of the three.
    expect(heights.size).toBe(3);
    expect(AROUSAL_CURVES.spontaneous.headline).toBe("Your desire is spontaneous");
    expect(AROUSAL_CURVES.contextual.headline).toBe("Your desire is contextual");
  });

  it("renders the family body line for an archetype with no per-archetype copy", () => {
    // Only Spiritual Lover has a `snapshotCards` entry, so before this fell back
    // to the family text the other 13 rendered no arousal body line at all.
    const { container } = render(<SnapshotCards archetype="Authority Conductor" copy={null} />);
    const subtexts = [...container.querySelectorAll(".report-snapshot-card__subtext")].map(
      (n) => n.textContent
    );

    expect(subtexts).toContain(AROUSAL_CURVES.contextual.snapshotSubtext);
  });

  it("falls back to the Figma base family for unknown values", () => {
    expect(resolveArousalFamily(undefined)).toBe("responsive");
    expect(resolveArousalFamily("nonsense")).toBe("responsive");
    expect(resolveArousalFamily("contextual")).toBe("contextual");
  });

  it("draws the spontaneous arc for a spontaneous archetype, not the responsive one", () => {
    const { container } = render(<SnapshotCards archetype="Spark Seeker" copy={null} />);
    const path = container.querySelector(".report-snapshot-card__viz--curve path");

    expect(path).not.toBeNull();
    expect(path?.getAttribute("d")).toBe(AROUSAL_CURVES.spontaneous.snapshot.path);
    expect(path?.getAttribute("d")).not.toBe(AROUSAL_CURVES.responsive.snapshot.path);
  });

  it("draws the responsive arc for a responsive archetype", () => {
    const { container } = render(<SnapshotCards archetype="Spiritual Lover" copy={null} />);
    const path = container.querySelector(".report-snapshot-card__viz--curve path");

    expect(path?.getAttribute("d")).toBe(AROUSAL_CURVES.responsive.snapshot.path);
  });
});
