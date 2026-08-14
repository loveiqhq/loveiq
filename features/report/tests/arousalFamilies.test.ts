import { describe, expect, it } from "vitest";
import config from "@/data/report2-archetype-config.json";
import { AROUSAL_FAMILIES, SHARED_ACT_DETAIL, getArousalFamily } from "@/data/report2-arousal";

const rows = Object.entries(config as Record<string, { families?: { arousal?: string } }>).filter(
  ([slug, v]) => !slug.startsWith("_") && !!v && typeof v === "object"
);

describe("report2 arousal families", () => {
  it("resolves every archetype's families.arousal", () => {
    expect(rows).toHaveLength(14);
    for (const [slug, v] of rows) {
      const family = v.families?.arousal;
      expect(family, `${slug} has no families.arousal`).toBeTruthy();
      expect(AROUSAL_FAMILIES[family!], `${slug} → "${family}" has no entry`).toBeDefined();
    }
  });

  it("splits the 14 across the three Figma scales (6 / 3 / 5)", () => {
    const counts = rows.reduce<Record<string, number>>((acc, [, v]) => {
      const f = v.families!.arousal!;
      acc[f] = (acc[f] ?? 0) + 1;
      return acc;
    }, {});
    expect(counts).toEqual({ responsive: 6, spontaneous: 3, contextual: 5 });
  });

  it("keeps each family's act names and captions distinct and Figma-verbatim", () => {
    // Regression guard: contextual used to ship "The wait / The threshold / The
    // lift", which matched no Figma frame.
    expect(getArousalFamily("contextual").acts).toEqual([
      "The setting",
      "The disruption",
      "The re-entry",
    ]);
    expect(getArousalFamily("spontaneous").acts).toEqual([
      "The ignition",
      "The fade",
      "The rekindle",
    ]);
    expect(getArousalFamily("responsive").acts).toEqual(["The build", "The dip", "The return"]);

    const allActs = Object.values(AROUSAL_FAMILIES).flatMap((f) => f.acts);
    expect(new Set(allActs).size, "act names repeat across families").toBe(allActs.length);
    const allNotes = Object.values(AROUSAL_FAMILIES).flatMap((f) => f.notes);
    expect(new Set(allNotes).size, "captions repeat across families").toBe(allNotes.length);
  });

  it("gives every family an intro ending in the three-acts promise", () => {
    for (const [family, entry] of Object.entries(AROUSAL_FAMILIES)) {
      expect(entry.intro.length, `${family} intro`).toBeGreaterThan(30);
      expect(entry.intro.toLowerCase(), `${family} intro`).toContain("three acts");
      expect(entry.name.length, `${family} name`).toBeGreaterThan(3);
    }
  });

  it("gives EVERY family its own act detail, not the responsive build's", () => {
    // Regression guard: all three shared one copy block, so a Spontaneous reader
    // was told their wave climbs on "Repair · nothing unresolved".
    expect(getArousalFamily("responsive").conditions.map((c) => c.label)).toEqual([
      "Repair",
      "Presence",
      "Sincerity",
    ]);
    expect(getArousalFamily("spontaneous").conditions.map((c) => c.label)).toEqual([
      "Novelty",
      "Charge",
      "Freedom",
    ]);
    expect(getArousalFamily("contextual").conditions.map((c) => c.label)).toEqual([
      "Privacy",
      "Time",
      "Ease",
    ]);

    const seen = { labels: new Set<string>(), notes: new Set<string>(), bodies: new Set<string>() };
    for (const [family, entry] of Object.entries(AROUSAL_FAMILIES)) {
      expect(entry.conditions, `${family} conditions`).toHaveLength(3);
      for (const c of entry.conditions) {
        // The frame's register: a bold chip, then a "nothing …" tail.
        expect(c.note.startsWith("nothing "), `${family}/${c.label} tail`).toBe(true);
        seen.labels.add(c.label);
      }
      expect(entry.conditionsNote, `${family} note`).toContain("the three dots on the curve");
      expect(entry.act2Body.length, `${family} act2`).toBeGreaterThan(40);
      expect(entry.act3Body.length, `${family} act3`).toBeGreaterThan(40);
      seen.notes.add(entry.conditionsNote);
      seen.bodies.add(entry.act2Body);
      seen.bodies.add(entry.act3Body);
    }
    // 9 distinct chips, 3 distinct notes, 6 distinct bodies — nothing reused.
    expect(seen.labels.size, "condition chips repeat across families").toBe(9);
    expect(seen.notes.size, "condition notes repeat across families").toBe(3);
    expect(seen.bodies.size, "act bodies repeat across families").toBe(6);
  });

  it("falls back to the Figma base for an unknown or missing family", () => {
    expect(getArousalFamily(null)).toBe(AROUSAL_FAMILIES.responsive);
    expect(getArousalFamily("nope")).toBe(AROUSAL_FAMILIES.responsive);
  });
});
