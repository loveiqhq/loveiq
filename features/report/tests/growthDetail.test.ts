import { describe, expect, it } from "vitest";
import config from "@/data/report2-archetype-config.json";
import { getReport2Section } from "@/data/report2";
import { growthDetail } from "@/data/report2-growth-detail";

const slugs = Object.keys(config as Record<string, unknown>).filter((s) => !s.startsWith("_"));
const RUNGS = ["rung1", "rung2", "rung3", "rung4", "rung5"] as const;

/** slug → the display name `getReport2Section` expects. */
const NAME_BY_SLUG: Record<string, string> = {
  "spiritual-lover": "Spiritual Lover",
  "sensual-connector": "Sensual Connector",
  "spark-seeker": "Spark Seeker",
  "relational-nurturer": "Relational Nurturer",
  "radiant-performer": "Radiant Performer",
  "explorer-of-edges": "Explorer of Edges",
  "curious-apprentice": "Curious Apprentice",
  "minimalist-companion": "Minimalist Companion",
  "emotional-voyeur": "Emotional Voyeur",
  "authority-conductor": "Authority Conductor",
  "loyal-ritualist": "Loyal Ritualist",
  "tender-devotee": "Tender Devotee",
  "analytical-sexualist": "Analytical Sexualist",
  "quiet-withdrawer": "Quiet Withdrawer",
};

describe("growth chapter prose", () => {
  it("covers all 14 archetypes, opener and five rungs each", () => {
    expect(slugs).toHaveLength(14);
    for (const slug of slugs) {
      const entry = growthDetail[slug as keyof typeof growthDetail];
      expect(entry, `${slug} has no growth detail`).toBeTruthy();
      expect(entry!.opener, `${slug} has no opener`).toBeTruthy();
      for (const rung of RUNGS) {
        expect(entry![rung], `${slug}.${rung} missing`).toBeTruthy();
      }
    }
  });

  it("has a body for every rung the ladder actually renders", () => {
    // The ladder renders a rung when its `from`+`to` slots exist. A rung with a
    // shift line and no prose is the state this chapter was rewritten out of, so
    // the two sets have to agree.
    for (const slug of slugs) {
      const section = getReport2Section(NAME_BY_SLUG[slug]!, "growth");
      for (const [i, rung] of RUNGS.entries()) {
        const rendered = Boolean(section[`rung${i + 1}.from`] && section[`rung${i + 1}.to`]);
        if (!rendered) continue;
        expect(
          growthDetail[slug as keyof typeof growthDetail]![rung],
          `${slug}.${rung} renders a shift with no prose`
        ).toBeTruthy();
      }
    }
  });

  it("never repeats a passage", () => {
    // One generic body would fit several archetypes well enough to pass review,
    // which is exactly the failure the rewrite was for.
    const all = slugs.flatMap((slug) => {
      const e = growthDetail[slug as keyof typeof growthDetail]!;
      return [e.opener, ...RUNGS.map((r) => e[r]!)];
    });
    expect(all).toHaveLength(84);
    expect(new Set(all).size, "duplicate growth passages").toBe(84);
  });

  it("stays in the report's house style", () => {
    for (const slug of slugs) {
      const e = growthDetail[slug as keyof typeof growthDetail]!;
      for (const [label, text] of [["opener", e.opener], ...RUNGS.map((r) => [r, e[r]!])] as Array<
        [string, string]
      >) {
        // Tightened 2026-08-26: at most three sentences, weighted to the
        // practical. By this chapter the reader has been through the report, so
        // the pattern needs a reference rather than a re-derivation.
        expect(text.split(/\s+/).length, `${slug}.${label} too short`).toBeGreaterThan(18);
        expect(text.split(/\s+/).length, `${slug}.${label} too long`).toBeLessThan(60);
        expect(
          text.split(/(?<=[.!?])\s+/).length,
          `${slug}.${label} runs past three sentences`
        ).toBeLessThanOrEqual(3);
        expect(text, `${slug}.${label} uses an em dash`).not.toMatch(/—/);
        expect(text[0], `${slug}.${label} does not open as a sentence`).toBe(
          text[0]!.toUpperCase()
        );
      }
      // The loop-rewrite device ("The shift is from … It becomes: …") was cut
      // with the tightening: it re-explained the dynamic, which is exactly the
      // length the rewrite was meant to remove.
      for (const rung of RUNGS) {
        expect(e[rung], `${slug}.${rung} still carries the retired loop rewrite`).not.toMatch(
          /The shift is from/
        );
      }
    }
  });

  it("addresses the reader, and never in the third person", () => {
    for (const slug of slugs) {
      const e = growthDetail[slug as keyof typeof growthDetail]!;
      for (const rung of RUNGS) {
        expect(e[rung]!.toLowerCase(), `${slug}.${rung} never addresses the reader`).toMatch(
          /\byou\b|\byour\b/
        );
      }
    }
  });
});
