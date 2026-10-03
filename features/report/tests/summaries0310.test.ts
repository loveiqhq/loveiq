import { describe, expect, it } from "vitest";
import { REPORT_V4_SUMMARY, missingReport3Summary } from "@/data/report3-archetype-page";
import { KNOWN_ARCHETYPES } from "@features/report/server/archetypeSlug";

/**
 * Part II's "Summary of the <Archetype>" for every archetype: Spark Seeker's from the frame
 * (1:741), the other 13 from Sanjin's summary docs (03.10, "summary texts for all
 * archetypes"). The docs only mark bold, so each first paragraph's opening bold run takes
 * Spark Seeker's lead weight (800) and every other bold run 700. Free copy (no Paywall
 * marker in any doc), so it stays in this client-imported module.
 */
const OTHERS = KNOWN_ARCHETYPES.filter((name) => name !== "Spark Seeker");

describe("a summary for every archetype (Sanjin's docs, 03.10)", () => {
  it("leaves no archetype without one", () => {
    expect(missingReport3Summary()).toEqual([]);
  });

  it.each(OTHERS)("%s's runs five or six paragraphs, none of them empty", (name) => {
    const { paragraphs, closer } = REPORT_V4_SUMMARY[name]!;
    expect(paragraphs.length).toBeGreaterThanOrEqual(5);
    expect(paragraphs.length).toBeLessThanOrEqual(6);
    expect(closer).toBeUndefined();
    for (const runs of paragraphs) {
      expect(runs.length).toBeGreaterThan(0);
      expect(runs.every((run) => run.text.length > 0)).toBe(true);
    }
  });

  it.each(OTHERS)("%s's opens on an extra-bold lead, and bolds the rest at 700", (name) => {
    const { paragraphs } = REPORT_V4_SUMMARY[name]!;
    expect(paragraphs[0]![0]!.weight).toBe(800);
    const later = paragraphs.flat().slice(1);
    expect(later.filter((run) => run.weight === 800)).toEqual([]);
  });

  it.each(OTHERS)("%s's is set clean: curly apostrophes, single spaces", (name) => {
    const text = REPORT_V4_SUMMARY[name]!.paragraphs.flat()
      .map((run) => run.text)
      .join("");
    expect(text).not.toMatch(/[A-Za-z]'[A-Za-z]/);
    expect(text).not.toContain("  ");
  });
});
