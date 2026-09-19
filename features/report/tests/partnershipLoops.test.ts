import { describe, expect, it } from "vitest";
import config from "@/data/report2-archetype-config.json";
import { getReport2Section } from "@/data/report2";
import {
  PARTNERSHIP_LOOPS,
  getPartnershipLoop,
  partnershipCentreMessage,
} from "@/data/report2-partnership-loops";

const SLUGS = Object.keys(config as Record<string, unknown>).filter((s) => !s.startsWith("_"));

describe("report2 partnership loops", () => {
  it("covers all 14 archetypes with three steps and an exit quote", () => {
    expect(SLUGS).toHaveLength(14);
    for (const slug of SLUGS) {
      const loop = getPartnershipLoop(slug);
      expect(loop, `${slug} has no loop`).toBeTruthy();
      expect(loop!.steps, `${slug} step count`).toHaveLength(3);
      for (const step of loop!.steps) expect(step.length, `${slug} step`).toBeGreaterThan(12);
      expect(loop!.exitQuote.length, `${slug} exit quote`).toBeGreaterThan(6);
    }
  });

  it("never repeats the diagnostic rows shown above the orbit", () => {
    for (const slug of SLUGS) {
      const name = (config as Record<string, { name: string }>)[slug]!.name;
      const rows = [1, 2, 3].map((i) => getReport2Section(name, "partnership")[`row${i}.value`]);
      for (const step of getPartnershipLoop(slug)!.steps) {
        expect(rows, `${slug} step duplicates a row`).not.toContain(step);
      }
    }
  });

  it("keeps every archetype's wording its own", () => {
    const steps = Object.values(PARTNERSHIP_LOOPS).flatMap((l) => l.steps);
    expect(new Set(steps).size, "a step repeats across archetypes").toBe(steps.length);
    const quotes = Object.values(PARTNERSHIP_LOOPS).map((l) => l.exitQuote);
    expect(new Set(quotes).size, "an exit quote repeats").toBe(quotes.length);
  });

  it("matches the Figma register: short beats, no full stop", () => {
    for (const slug of SLUGS) {
      for (const step of getPartnershipLoop(slug)!.steps) {
        expect(step.endsWith("."), `${slug} "${step}"`).toBe(false);
        // Step 1 embeds the reader's quoted bid, so it runs longer than the other
        // two — Figma's own is "Bid for depth — “I miss us”".
        expect(step.split(/\s+/).length, `${slug} "${step}"`).toBeLessThanOrEqual(11);
      }
    }
  });

  it("builds the centre message around the reader's own bid", () => {
    const msg = partnershipCentreMessage("“I miss us”");
    expect(msg).toContain("Each step feeds the next");
    expect(msg).toContain("“I miss us”, said plainly, is the exit.");
  });

  it("returns null for an unknown slug", () => {
    expect(getPartnershipLoop("nope")).toBeNull();
    expect(getPartnershipLoop(null)).toBeNull();
  });
});
