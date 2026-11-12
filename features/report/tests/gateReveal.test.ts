import { describe, expect, it, vi } from "vitest";

const isFeatureEnabled = vi.fn();
vi.mock("@shared/flags/system-flags", () => ({
  isFeatureEnabled: (...args: unknown[]) => isFeatureEnabled(...args),
}));

import { report3ArchetypeCard } from "@/data/report3-archetype-card";
import { report4ArchetypeBlurbs } from "@/data/report3-archetype-blurbs";
import { isGateReveal } from "@features/report/logic/gateReveal";
import { KNOWN_ARCHETYPES } from "@features/report/server/archetypeSlug";
import { buildGateReveal, isGateRevealEnabled } from "@features/report/server/gateReveal";

/**
 * Mark's redesigned EUR 1.99 page (12 Nov 2026): what the gate's payload carries to show the
 * Core Archetype, and that nothing locked travels with it.
 */
describe("buildGateReveal", () => {
  const card = report3ArchetypeCard["Spark Seeker"]!;

  it("carries the archetype, its whole match and its one line", () => {
    const reveal = buildGateReveal("Spark Seeker", {
      "Spark Seeker": 43.4,
      "Explorer of Edges": 20,
    })!;
    expect(reveal.archetype).toBe("Spark Seeker");
    expect(reveal.matchStrength).toBe(43);
    expect(reveal.blurb).toBe(report4ArchetypeBlurbs["Spark Seeker"]);
    expect(isGateReveal(reveal)).toBe(true);
  });

  it("draws five cards in the board's order: the first two open, the last three locked", () => {
    const reveal = buildGateReveal("Spark Seeker", { "Spark Seeker": 43 })!;
    expect(reveal.aspects.map((a) => [a.key, a.locked])).toEqual([
      ["motivation", false],
      ["communication", false],
      ["initiation", true],
      ["attachment", true],
      ["power", true],
    ]);
    const [motivation, communication] = reveal.aspects;
    expect(motivation).toMatchObject({
      title: "Core motivation",
      subtitle: "What drives your desire",
      value: card.coreMotivation.value,
      body: card.coreMotivation.body,
    });
    const deckCommunication = card.dimensions.find((d) => d.key === "communication")!;
    expect(communication!.body).toBe(deckCommunication.body);
    // The board's sentence case, not the report's heading case.
    expect(communication!.subtitle).toBe("How desire gets spoken");
    expect(reveal.aspects[2]!.subtitle).toBe("Who makes the first move");
  });

  it("names a locked card's verdict but never sends its sentence, for any archetype", () => {
    for (const name of KNOWN_ARCHETYPES) {
      const copy = report3ArchetypeCard[name];
      if (!copy) continue;
      const reveal = buildGateReveal(name, { [name]: 30 })!;
      for (const aspect of reveal.aspects.filter((a) => a.locked)) {
        const real = copy.dimensions.find((d) => d.key === aspect.key)!;
        expect(aspect.value, `${name} ${aspect.key}`).toBe(real.value);
        expect(aspect.body, `${name} ${aspect.key}`).not.toBe(real.body);
        // Not one of the sentence's longer words survives the stand-in.
        const words = real.body.split(/\W+/).filter((w) => w.length > 6);
        for (const word of words) expect(aspect.body).not.toContain(word);
      }
    }
  });

  it("keeps the match between 0 and 100, and 0 when it is unknown", () => {
    expect(buildGateReveal("Spark Seeker", { "Spark Seeker": 140 })!.matchStrength).toBe(100);
    expect(buildGateReveal("Spark Seeker", { "Spark Seeker": -3 })!.matchStrength).toBe(0);
    expect(buildGateReveal("Spark Seeker", null)!.matchStrength).toBe(0);
  });

  it("is nothing without an archetype it has a card for: the gate then draws as before", () => {
    expect(buildGateReveal(null, {})).toBeNull();
    expect(buildGateReveal("Not An Archetype", {})).toBeNull();
  });
});

describe("its switch", () => {
  it("is report_gate_archetype_reveal, off when the row is missing", async () => {
    isFeatureEnabled.mockResolvedValueOnce(false);
    await expect(isGateRevealEnabled()).resolves.toBe(false);
    expect(isFeatureEnabled).toHaveBeenCalledWith("report_gate_archetype_reveal", false);
  });

  it("is off when the flags cannot be read", async () => {
    isFeatureEnabled.mockRejectedValueOnce(new Error("supabase down"));
    await expect(isGateRevealEnabled()).resolves.toBe(false);
  });
});
