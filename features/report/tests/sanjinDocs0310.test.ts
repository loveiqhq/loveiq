import { describe, expect, it } from "vitest";
import { REPORT_V4_ACCELERATORS } from "@/data/report3-accelerators";
import { REPORT_V4_FANTASY } from "@/data/report3-fantasy";
import { REPORT_V4_PARTNERSHIP } from "@/data/report3-partnership";
import { REPORT_V4_TYPICAL_BELIEFS } from "@/data/report3-typical-beliefs";

/**
 * Sanjin's docs after his 02.10 fixes (Slack 02.10, 14:09 and 14:57). The docs are the
 * source of truth for every archetype's chapters, Spark Seeker's included. These hold the
 * records to the rules his fixes set, without quoting the paid copy itself.
 */

/** Every string in a record, however deep. */
const strings = (value: unknown): string[] =>
  typeof value === "string"
    ? [value]
    : Array.isArray(value)
      ? value.flatMap(strings)
      : value && typeof value === "object"
        ? Object.values(value).flatMap(strings)
        : [];

const ARCHETYPES = Object.keys(REPORT_V4_TYPICAL_BELIEFS);
const everyRecord = () =>
  ARCHETYPES.flatMap((name) => [
    REPORT_V4_TYPICAL_BELIEFS[name],
    REPORT_V4_ACCELERATORS[name],
    REPORT_V4_PARTNERSHIP[name],
    REPORT_V4_FANTASY[name],
  ]);

describe("no text before, between or after the visual lists (Sanjin, 02.10)", () => {
  // "The typical beliefs (sun and shadow list), and acc&brakes list are visual elements, so
  // no text should be between before or after."
  it.each(ARCHETYPES.filter((name) => name !== "Spark Seeker"))(
    "%s sets nothing after its sun beliefs, and nothing around its two A&B lists",
    (name) => {
      expect(REPORT_V4_TYPICAL_BELIEFS[name]!.afterPanels).toBeUndefined();
      const ab = REPORT_V4_ACCELERATORS[name]!;
      expect(ab.brakesLead).toBeUndefined();
      expect(ab.acceleratorsLead).toBeUndefined();
      expect(ab.afterCards).toBeUndefined();
    }
  );
});

describe("the docs' wording after Sanjin's fixes (02.10)", () => {
  it("opens Relational Nurturer's Typical Beliefs on the universal paragraphs", () => {
    // "no, i deleted that 'in this case' part in the relational nurturer, the intro should
    // always stay the same."
    expect(REPORT_V4_TYPICAL_BELIEFS["Relational Nurturer"]!.intro).toBeUndefined();
  });

  it("spells analyzing the US way everywhere", () => {
    expect(strings(everyRecord()).filter((s) => /\banalys(e|ed|es|ing)\b/i.test(s))).toEqual([]);
  });

  it("writes non-sexual one way everywhere", () => {
    expect(strings(everyRecord()).filter((s) => /\bnonsexual\b/i.test(s))).toEqual([]);
  });

  it("drops the possessive after Explorer of Edges, as the docs now do", () => {
    expect(strings(everyRecord()).filter((s) => /Explorer of Edges[’']/.test(s))).toEqual([]);
  });
});
