import { describe, expect, it } from "vitest";
import {
  buildArchetypeCard,
  missingReport3CardCopy,
  report3ArchetypeCard,
} from "@/data/report3-archetype-card";
import { KNOWN_ARCHETYPES } from "@features/report/server/archetypeSlug";
import { reportThemes } from "@features/report/ui/reportTheme";

/**
 * The archetype card for every archetype: Sanjin's five card docs (03.10, "cards za
 * profile gotovi"), one table per dimension and one row per archetype. Values and bodies
 * are the docs'. The meters come from the archetype table (`reportThemes`, which the
 * "[CURRENT] Archetypes V2" sheet agrees with). The slimmed report (16.10) took the motto
 * line out, and half-locks each dimension: its first sentence, then the rest under the
 * veil for a reader without the Summary's gate.
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

/** The one dimension body in Sanjin's card docs that is a single sentence. */
const ONE_SENTENCE = ["Explorer of Edges power"];

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

  it.each(KNOWN_ARCHETYPES)("%s's card carries no motto since the slimmed report", (name) => {
    expect(report3ArchetypeCard[name]!).not.toHaveProperty("tagline");
  });

  it.each(KNOWN_ARCHETYPES)(
    "%s's every dimension locks at its second sentence, and only for a locked reader",
    (name) => {
      const open = buildArchetypeCard(name)!;
      const locked = buildArchetypeCard(name, { locked: true })!;
      expect(open.locked).toBe(false);
      expect(open.dimensions).toEqual(report3ArchetypeCard[name]!.dimensions);
      expect(locked.locked).toBe(true);
      locked.dimensions.forEach((d, i) => {
        const whole = report3ArchetypeCard[name]!.dimensions[i]!.body;
        if (ONE_SENTENCE.includes(`${name} ${d.key}`)) {
          // Nothing behind a lock: the card shows its one sentence whole, with no lock.
          expect(d.body).toBe(whole);
          expect(d.veiled).toBeUndefined();
          return;
        }
        // A lead that is one sentence, and a locked rest.
        expect(d.body).toMatch(/^[^.!?]+[.!?]["”’]?$/);
        expect(d.veiled, `${name} ${d.key}`).toBeTruthy();
        expect(`${d.body} ${d.veiled}`).toBe(whole);
      });
      // The rest of the card is free.
      expect(locked.coreMotivation).toEqual(report3ArchetypeCard[name]!.coreMotivation);
      expect(locked.meters).toEqual(report3ArchetypeCard[name]!.meters);
    }
  );

  it("has nothing to lock on an archetype with no card copy", () => {
    expect(buildArchetypeCard("Nobody")).toBeNull();
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
