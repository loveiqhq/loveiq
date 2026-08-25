import { describe, expect, it } from "vitest";
import config from "@/data/report2-archetype-config.json";
import { heroMotivationSubtexts } from "@/data/report2-hero-traits";
import { mapLearnDetail } from "@/data/report2-map-detail";

const slugs = Object.keys(config as Record<string, unknown>).filter((s) => !s.startsWith("_"));
const TILES = ["tile1", "tile2", "tile3", "tile4", "tile5"] as const;

describe("insight-map pattern descriptions", () => {
  it("covers all 14 archetypes across all five patterns", () => {
    expect(slugs).toHaveLength(14);
    for (const slug of slugs) {
      const entry = mapLearnDetail[slug as keyof typeof mapLearnDetail];
      expect(entry, `${slug} has no detail block`).toBeTruthy();
      for (const tile of TILES) {
        expect(entry![tile], `${slug}.${tile} missing`).toBeTruthy();
      }
    }
  });

  it("never repeats a line across archetypes or tiles", () => {
    // One generic sentence would fit several of these well enough to pass
    // review, and that is exactly the "bla bla" the rows were criticised for.
    const all = slugs.flatMap((slug) =>
      TILES.map((tile) => mapLearnDetail[slug as keyof typeof mapLearnDetail]![tile]!)
    );
    expect(all).toHaveLength(70);
    expect(new Set(all).size, "duplicate detail lines").toBe(70);
  });

  it("stays in the report's house style", () => {
    for (const slug of slugs) {
      const entry = mapLearnDetail[slug as keyof typeof mapLearnDetail]!;
      for (const tile of TILES) {
        const line = entry[tile]!;
        // A full description since the two lines were merged on 2026-08-25:
        // long enough to carry the clause AND the specific part, short enough
        // that a row stays scannable.
        expect(line.length, `${slug}.${tile} too short`).toBeGreaterThan(110);
        expect(line.length, `${slug}.${tile} too long`).toBeLessThan(300);
        // Prose, not a lowercase fragment glued to a sentence.
        expect(line[0], `${slug}.${tile} does not open as a sentence`).toBe(line[0]!.toUpperCase());
        expect(line, `${slug}.${tile} uses an em dash`).not.toMatch(/—/);
        // Second person throughout, like the tile subline above it.
        expect(line.toLowerCase(), `${slug}.${tile} never addresses the reader`).toMatch(
          /\byou\b|\byour\b/
        );
      }
    }
  });
});

describe("hero core-motivation gloss", () => {
  it("covers all 14, so no reader is left with the bare noun", () => {
    for (const slug of slugs) {
      const line = heroMotivationSubtexts[slug as keyof typeof heroMotivationSubtexts];
      expect(line, `${slug} has no motivation gloss`).toBeTruthy();
      // A fragment here would reproduce the problem it was written to fix.
      expect(line!.length, `${slug} motivation gloss too thin`).toBeGreaterThan(80);
      expect(line!, `${slug} motivation gloss uses an em dash`).not.toMatch(/—/);
    }
  });

  it("never repeats a gloss, including between the two Validation archetypes", () => {
    const all = slugs.map((s) => heroMotivationSubtexts[s as keyof typeof heroMotivationSubtexts]!);
    expect(new Set(all).size, "motivation glosses repeat").toBe(14);
  });
});
