import { describe, expect, it } from "vitest";
import { missingReport3CardCopy, report3ArchetypeCard } from "@/data/report3-archetype-card";
import { KNOWN_ARCHETYPES } from "@features/report/server/archetypeSlug";
import { reportThemes } from "@features/report/ui/reportTheme";

/**
 * The archetype card for every archetype: Sanjin's five card docs (03.10, "cards za
 * profile gotovi"), one table per dimension and one row per archetype. Values and bodies
 * are the docs'. The meters come from the archetype table (`reportThemes`, which the
 * "[CURRENT] Archetypes V2" sheet agrees with). The tagline is the archetype's V2 motto
 * until Sanjin writes card lines (Fatih, 03.10), except Spark Seeker's own.
 */
const DECK = [
  ["communication", "Communication", "How Desire Gets Spoken"],
  ["initiation", "Initiation", "Who Makes the First Move"],
  ["attachment", "Attachment", "How Closeness Is Held"],
  ["power", "Power", "Who Takes the Lead"],
] as const;
const LEVEL: Record<string, string> = {
  Low: "low",
  Moderate: "medium",
  High: "high",
  "Very high": "high",
};

describe("an archetype card for every archetype (Sanjin's docs, 03.10)", () => {
  it("leaves no archetype without card copy", () => {
    expect(missingReport3CardCopy()).toEqual([]);
  });

  it.each(KNOWN_ARCHETYPES)("%s's deck runs the four dimensions in the frame's order", (name) => {
    const card = report3ArchetypeCard[name]!;
    expect(card.dimensions.map((d) => [d.key, d.title, d.subtitle])).toEqual(DECK);
    for (const d of card.dimensions) {
      expect(d.value.length).toBeGreaterThan(0);
      expect(d.body.length).toBeGreaterThan(0);
    }
    expect(card.coreMotivation.value.length).toBeGreaterThan(0);
    expect(card.coreMotivation.body.length).toBeGreaterThan(0);
  });

  it.each(KNOWN_ARCHETYPES)("%s's meters follow the archetype table", (name) => {
    const theme = reportThemes[name]!;
    expect(report3ArchetypeCard[name]!.meters).toEqual([
      { label: "Risk Orientation", level: LEVEL[theme.riskOrientation] },
      { label: "Typical Confidence", level: LEVEL[theme.confidence] },
    ]);
  });

  it.each(KNOWN_ARCHETYPES)("%s's tagline is a curly-quoted line", (name) => {
    expect(report3ArchetypeCard[name]!.tagline).toMatch(/^“[^"]+”$/);
  });

  it("gives Quiet Withdrawer's initiation as Sanjin's doc does (Fatih: \"Passive, as the doc\")", () => {
    const initiation = report3ArchetypeCard["Quiet Withdrawer"]!.dimensions[1]!;
    expect(initiation.value).toBe("Passive");
  });

  it("keeps the values in the report's heading case", () => {
    const values = KNOWN_ARCHETYPES.flatMap((name) => {
      const card = report3ArchetypeCard[name]!;
      return [card.coreMotivation.value, ...card.dimensions.map((d) => d.value)];
    });
    expect(
      values.filter((v) => /(^|[\s/])[a-z]/.test(v.replace(/ (of|and|or|the|in|to) /g, " ")))
    ).toEqual([]);
  });
});
