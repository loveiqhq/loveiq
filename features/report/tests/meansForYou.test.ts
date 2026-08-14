import { describe, expect, it } from "vitest";
import config from "@/data/report2-archetype-config.json";
import { meansForYou } from "@/data/report2-summary";

const slugs = Object.keys(config as Record<string, unknown>).filter((s) => !s.startsWith("_"));

// The two paragraphs the Figma frame keeps identical for every archetype.
const UNIVERSAL_BODY =
  "Your full report maps what opens you, what shuts you off, the one pattern that most often gets in your way, and the rare strength that sets you apart.";
const UNIVERSAL_CLOSING = "Not a verdict. A mirror, and a map for where your intimacy goes next.";

describe("report2 What this means for you", () => {
  it("covers all 14 archetypes", () => {
    expect(slugs).toHaveLength(14);
    const missing = slugs.filter((s) => !meansForYou[s as keyof typeof meansForYou]);
    expect(missing, "archetypes with no summary block").toEqual([]);
  });

  it("keeps the frame's universal tail verbatim", () => {
    for (const slug of slugs) {
      const entry = meansForYou[slug as keyof typeof meansForYou]!;
      expect(entry.body.at(-1), `${slug} closing paragraph`).toBe(UNIVERSAL_BODY);
      expect(entry.closing, `${slug} closing line`).toBe(UNIVERSAL_CLOSING);
    }
  });

  it("speaks in the second person, never the source prose's third", () => {
    for (const slug of slugs) {
      const entry = meansForYou[slug as keyof typeof meansForYou]!;
      const all = [
        entry.lead.before,
        entry.lead.bold,
        entry.lead.after,
        ...entry.body,
        entry.closing,
      ]
        .join(" ")
        .toLowerCase();
      // `data/report-archetypes.ts` is third person ("The Spark Seeker experiences…",
      // "for them, desire…"). Any of that leaking through is a voice bug.
      expect(all, `${slug} leaks third person`).not.toMatch(
        /\bthe (spark seeker|sensual connector|relational nurturer|radiant performer|explorer of edges|curious apprentice|spiritual lover|minimalist companion|emotional voyeur|authority conductor|loyal ritualist|tender devotee|analytical sexualist|quiet withdrawer)\b/
      );
      expect(all, `${slug} uses "for them"`).not.toMatch(
        /\bfor them\b|\btheir system\b|\bthis archetype\b/
      );
      expect(all, `${slug} never addresses the reader`).toMatch(/\byou\b|\byour\b/);
    }
  });

  it("gives every archetype its OWN opening and strength, never boilerplate", () => {
    const leads = slugs.map((s) => meansForYou[s as keyof typeof meansForYou]!.lead);
    expect(new Set(leads.map((l) => l.bold)).size, "bolded triads repeat").toBe(14);
    expect(
      new Set(leads.map((l) => l.before)).size,
      "opening claims repeat"
    ).toBeGreaterThanOrEqual(12);
    expect(new Set(leads.map((l) => l.after)).size, "desire sentences repeat").toBe(14);
    // The archetype-specific first paragraph must differ for all 14 too.
    const firstParas = slugs.map((s) => meansForYou[s as keyof typeof meansForYou]!.body[0]);
    expect(new Set(firstParas).size, "strength paragraphs repeat").toBe(14);
  });

  it("holds the frame's sentence shape", () => {
    for (const slug of slugs) {
      const entry = meansForYou[slug as keyof typeof meansForYou]!;
      expect(entry.body).toHaveLength(2);
      expect(entry.lead.before.length, `${slug} lead.before`).toBeGreaterThan(20);
      expect(entry.lead.bold.length, `${slug} lead.bold`).toBeGreaterThan(15);
      // "Desire builds through X, not Y, and once Z…" — the frame's turn is a
      // contrast then a resolution. "rather than" carries it as well as "not",
      // and reads better in some of them, so accept either.
      expect(entry.lead.after, `${slug} lead.after states no contrast`).toMatch(
        /\bnot\b|rather than/
      );
      expect(entry.lead.after, `${slug} lead.after has no resolution`).toMatch(/\bonce\b/);
      expect(entry.lead.after.startsWith("."), `${slug} lead.after joins the bold run`).toBe(true);
      // The strength/cost pairing the frame makes in its first paragraph.
      expect(entry.body[0], `${slug} strength paragraph`).toMatch(/^At your best/);
      expect(entry.body[0], `${slug} cost clause`).toContain(
        "can quietly close you down faster than you would expect"
      );
    }
  });
});
