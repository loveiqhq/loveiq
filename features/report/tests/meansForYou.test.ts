import { describe, expect, it } from "vitest";
import config from "@/data/report2-archetype-config.json";
import { meansForYou } from "@/data/report2-summary";

const slugs = Object.keys(config as Record<string, unknown>).filter((s) => !s.startsWith("_"));

// The frame's ONE remaining universal line. The body paragraph that used to be
// universal too ("Your full report maps what opens you, what shuts you off…")
// was replaced per archetype on 2026-08-24 — it was identical for all fourteen,
// which is exactly why it told nobody anything. The test below now guards the
// opposite property: that last paragraph must NOT repeat.
const UNIVERSAL_CLOSING = "Not a verdict. A mirror, and a map for where your intimacy goes next.";
const RETIRED_UNIVERSAL_BODY =
  "Your full report maps what opens you, what shuts you off, the one pattern that most often gets in your way, and the rare strength that sets you apart.";

describe("report2 What this means for you", () => {
  it("covers all 14 archetypes", () => {
    expect(slugs).toHaveLength(14);
    const missing = slugs.filter((s) => !meansForYou[s as keyof typeof meansForYou]);
    expect(missing, "archetypes with no summary block").toEqual([]);
  });

  it("keeps the frame's signature closing line, and nothing else, universal", () => {
    for (const slug of slugs) {
      const entry = meansForYou[slug as keyof typeof meansForYou]!;
      expect(entry.closing, `${slug} closing line`).toBe(UNIVERSAL_CLOSING);
      expect(entry.body, `${slug} still ships the retired boilerplate`).not.toContain(
        RETIRED_UNIVERSAL_BODY
      );
    }
  });

  it("gives every archetype its own open loop, not a shared one", () => {
    // The last paragraph is the "here is what the paid chapters answer" turn.
    // It is the highest-risk place for boilerplate to creep back in, because one
    // generic version fits all fourteen well enough to look fine in review.
    const openLoops = slugs.map((s) => meansForYou[s as keyof typeof meansForYou]!.body.at(-1)!);
    expect(new Set(openLoops).size, "open-loop paragraphs repeat").toBe(14);
    // Recognition paragraphs likewise.
    const recognitions = slugs.map((s) => meansForYou[s as keyof typeof meansForYou]!.body[1]!);
    expect(new Set(recognitions).size, "recognition paragraphs repeat").toBe(14);
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
      // 3 since 2026-08-24: strength/cost, then recognition, then the open loop.
      expect(entry.body).toHaveLength(3);
      // Both added paragraphs have to carry real weight. A one-liner in either
      // slot is the failure mode that produced the feedback in the first place.
      expect(entry.body[1]!.length, `${slug} recognition paragraph too thin`).toBeGreaterThan(150);
      expect(entry.body[2]!.length, `${slug} open-loop paragraph too thin`).toBeGreaterThan(150);
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
