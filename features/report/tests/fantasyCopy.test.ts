import { describe, expect, it } from "vitest";
import { getReport2Section } from "@/data/report2";
import { getFantasyMapDots } from "@features/report/server/fantasyMap";
import { buildFantasyCopy } from "@features/report/server/fantasyCopy";

/**
 * Report 2.0's Fantasy vs. Reality copy and map dots, as both /api/report and the
 * preview route send them. One helper, so the two can never drift: the preview used
 * to send none, leaving the V2 section (and V4's fallback for 13 archetypes) an
 * empty head.
 */

const SLOTS = [
  "edu.eyebrow",
  "edu.teaser",
  "edu.body.p1",
  "edu.body.p2",
  "edu.body.p3",
  "edu.body.p4",
  "chartnote1",
  "chartnote2",
  "learn.eyebrow",
  "learn.body",
] as const;

describe("buildFantasyCopy", () => {
  const section = getReport2Section("Spark Seeker", "fantasy");

  it("ships every slot and the archetype's map dots when unlocked", () => {
    const { fantasyCopy, fantasyDots } = buildFantasyCopy("Spark Seeker", true);
    for (const key of SLOTS) expect(fantasyCopy[key], key).toBe(section[key] ?? null);
    expect(fantasyCopy.locked).toBe(false);
    expect(fantasyDots).toEqual(getFantasyMapDots("Spark Seeker"));
    expect(fantasyDots).not.toBeNull();
  });

  it("still frames the section for a locked reader, and withholds the dots", () => {
    const { fantasyCopy, fantasyDots } = buildFantasyCopy("Spark Seeker", false);
    // Every slot is universal, so the locked reader gets the same framing.
    for (const key of SLOTS) expect(fantasyCopy[key], key).toBe(section[key] ?? null);
    expect(fantasyCopy.locked).toBe(true);
    expect(fantasyDots).toBeNull();
  });

  it("carries exactly the slots the V2 section reads, nothing more", () => {
    const { fantasyCopy } = buildFantasyCopy("Emotional Voyeur", true);
    expect(Object.keys(fantasyCopy).sort()).toEqual([...SLOTS, "locked"].sort());
  });
});
