import { describe, expect, it } from "vitest";
import config from "@/data/report2-archetype-config.json";
import { heroTraitSubtexts, type HeroTraitSubtexts } from "@/data/report2-hero-traits";

const SLUGS = Object.keys(config as Record<string, unknown>).filter((s) => !s.startsWith("_"));
const FIELDS = ["communication", "initiation", "attachment", "power"] as const;

describe("hero trait subtexts", () => {
  it("covers all 14 archetypes with all four traits", () => {
    expect(SLUGS).toHaveLength(14);
    for (const slug of SLUGS) {
      const subs = heroTraitSubtexts[slug as keyof typeof heroTraitSubtexts];
      expect(subs, `${slug} has no hero subtexts`).toBeDefined();
      for (const field of FIELDS) {
        expect((subs as HeroTraitSubtexts)[field], `${slug}.${field}`).toBeTruthy();
      }
    }
  });

  it("keeps the Figma-verified Spiritual Lover entry untouched", () => {
    // The only entry taken verbatim from a Figma hero variant (8427:801); the
    // other 13 are written to match its register, so it is the reference.
    expect(heroTraitSubtexts["spiritual-lover"]).toEqual({
      communication: "honest, emotionally real talk",
      initiation: "opening when invited, not pursuing",
      attachment: "safe — until distance goes unrepaired",
      power: "either, decided by presence",
    });
  });

  it("matches that entry's register: lowercase, short, no trailing stop", () => {
    for (const slug of SLUGS) {
      const subs = heroTraitSubtexts[slug as keyof typeof heroTraitSubtexts] as HeroTraitSubtexts;
      for (const field of FIELDS) {
        const text = subs[field];
        // Rendered as "yours: <text>", so it must read as a continuation.
        expect(text[0], `${slug}.${field} starts lowercase`).toBe(text[0]!.toLowerCase());
        expect(text.endsWith("."), `${slug}.${field} has no full stop`).toBe(false);
        const words = text.split(/\s+/).length;
        expect(words, `${slug}.${field} word count (${text})`).toBeGreaterThanOrEqual(3);
        expect(words, `${slug}.${field} word count (${text})`).toBeLessThanOrEqual(9);
      }
    }
  });

  it("gives every archetype its own wording", () => {
    // A copy-paste across archetypes would defeat the point of the section.
    for (const field of FIELDS) {
      const all = SLUGS.map(
        (s) => (heroTraitSubtexts[s as keyof typeof heroTraitSubtexts] as HeroTraitSubtexts)[field]
      );
      expect(new Set(all).size, `${field} has duplicates`).toBe(all.length);
    }
  });
});
