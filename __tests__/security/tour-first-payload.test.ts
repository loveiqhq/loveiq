// Tour first, then the EUR 1.99 gate (sync 30.10): a gated reader's first open shows their own
// report under the tour with who they are left out, so the EUR 1.99 still reveals it (Fatih,
// 30.10). The page veils what it draws; this holds the network to the same: the payload names
// no archetype, carries no percentage and none of the Core Archetype card's or Summary's copy,
// for every archetype, while the four tour stops still have their chapter.

import { describe, expect, it } from "vitest";
import { buildArchetypeCard } from "@/data/report3-archetype-card";
import { buildSummary } from "@/data/report3-summary";
import { buildInitialUnlockGatePayload } from "@features/report/logic/initialUnlockGate";
import { KNOWN_ARCHETYPES } from "@features/report/server/archetypeSlug";
import {
  buildTourFirstReportPayload,
  neutraliseArchetypeName,
  neutraliseNameInText,
} from "@features/report/server/tourFirstReport";

const gate = buildInitialUnlockGatePayload({
  reportToken: "rpt_test",
  submissionId: 55,
  surveyMinutes: 14,
});

function payloadFor(archetype: string) {
  return buildTourFirstReportPayload({
    submissionId: 55,
    userName: "Alex",
    reportDate: "2026-10-30T09:00:00Z",
    archetype,
    gate,
  });
}

/** Every string a run of the card or Summary carries, long enough to be telling. */
function telltales(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") {
    if (value.length >= 40) out.push(value.slice(0, 40));
  } else if (Array.isArray(value)) value.forEach((item) => telltales(item, out));
  else if (value && typeof value === "object")
    Object.values(value).forEach((item) => telltales(item, out));
  return out;
}

describe("the tour-first payload names no archetype", () => {
  it.each(KNOWN_ARCHETYPES.map((name) => [name]))("%s", (name) => {
    const payload = payloadFor(name);
    const json = JSON.stringify(payload);
    for (const other of KNOWN_ARCHETYPES) expect(json).not.toContain(other);
    expect(payload.primaryArchetype).toBe("");
    expect(payload.contentArchetype).toBe("");
    expect(payload.percentages).toEqual({});
    expect(payload.archetypeCard).toBeNull();
    expect(payload.summaryChapter).toBeNull();
    expect(payload.pricingQuotes).toBeNull();
    // Nothing of the card's or the Summary's own words, locked or not.
    for (const piece of [
      ...telltales(buildArchetypeCard(name, { locked: true })),
      ...telltales(buildSummary(name, { locked: true })),
    ]) {
      expect(json).not.toContain(piece);
    }
    // The tour's stops 2–4 live in Typical Beliefs, which stays (locked) for every archetype.
    expect(payload.typicalBeliefs?.sunShadowTitle).toBe("Sun and Shadow Beliefs");
    expect(payload.typicalBeliefs?.practice.locked).toBe(true);
    expect(payload.initialGate).toEqual(gate);
  });

  it("allows only the keys it lists: a field added to the report does not ride along", () => {
    const keys = Object.keys(payloadFor("Spark Seeker")).sort();
    const nonEmpty = keys.filter((key) => {
      const value = (payloadFor("Spark Seeker") as Record<string, unknown>)[key];
      if (value === null || value === "" || value === false) return false;
      if (Array.isArray(value)) return value.length > 0;
      if (typeof value === "object") return Object.keys(value as object).length > 0;
      return true;
    });
    expect(nonEmpty.sort()).toEqual(
      [
        "initialGate",
        "reportDate",
        "submissionId",
        "typicalBeliefs",
        "typicalBeliefsArticle",
        "userName",
        "viewMode",
      ].sort()
    );
  });
});

describe("neutraliseNameInText", () => {
  const name = "Spark Seeker";
  it.each([
    ["The Spark Seeker tends to", "Your archetype tends to"],
    ["For the Spark Seeker, planning", "For your archetype, planning"],
    ["one of the Spark Seeker’s strongest", "one of your archetype’s strongest"],
    ["many Spark Seekers, too", "many people with your archetype, too"],
    ["A Spark Seeker might", "Someone with your archetype might"],
    ["no name here", "no name here"],
  ])("%s", (input, output) => {
    expect(neutraliseNameInText(input, name)).toBe(output);
  });

  it("joins an article and a bold name set in runs of their own", () => {
    const runs = [
      { text: "The " },
      { text: "Spark Seeker", weight: 700 },
      { text: " tends to place unusual value on " },
    ];
    expect(neutraliseArchetypeName(runs, name)).toEqual([
      { text: "" },
      { text: "Your archetype", weight: 700 },
      { text: " tends to place unusual value on " },
    ]);
  });
});
