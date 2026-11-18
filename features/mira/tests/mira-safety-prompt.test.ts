import { describe, expect, it } from "vitest";
import { EVIDENCE_CARDS } from "@features/mira/server/cards";
import {
  STABLE_INSTRUCTIONS,
  personalInstructions,
  styleInstructions,
} from "@features/mira/server/prompt";
import { CRISIS_TOKEN, isCrisisMessage, parseReply } from "@features/mira/server/safety";

describe("isCrisisMessage", () => {
  it.each([
    "I want to kill myself",
    "sometimes I think about suicide",
    "I don't want to live anymore",
    "I've been self-harming again",
    "I cut myself last night",
  ])("stops for %j", (text) => {
    expect(isCrisisMessage(text)).toBe(true);
  });

  it.each([
    "I only feel okay with the lights off",
    "This kills the mood every time",
    "I'm dying to feel relaxed in bed",
    "I hide during sex",
  ])("does not stop for %j", (text) => {
    expect(isCrisisMessage(text)).toBe(false);
  });
});

describe("parseReply", () => {
  it("removes the crisis token and flags the reply", () => {
    const out = parseReply(`I'm really glad you told me.\n${CRISIS_TOKEN}`);
    expect(out.crisis).toBe(true);
    expect(out.text).toBe("I'm really glad you told me.");
  });

  it("turns a Sources line into tags for real cards only", () => {
    const real = EVIDENCE_CARDS[0];
    const raw = `Try one slow breath first.\n\nSources: ${real ? `[${real.id}] ` : ""}[Z999]`;
    const out = parseReply(raw);
    expect(out.text).toBe("Try one slow breath first.");
    expect(out.sources.map((s) => s.id)).toEqual(real ? [real.id] : []);
    if (real) expect(out.sources[0]?.link ?? null).toBe(real.link);
  });

  it("leaves a reply without a sources line alone", () => {
    const out = parseReply("Plain answer.");
    expect(out).toEqual({ text: "Plain answer.", crisis: false, sources: [] });
  });
});

describe("Mira's instructions", () => {
  it("carry the rules and every evidence card", () => {
    expect(STABLE_INSTRUCTIONS.length).toBeGreaterThan(2000);
    for (const card of EVIDENCE_CARDS) expect(STABLE_INSTRUCTIONS).toContain(`[${card.id}]`);
  });

  it("add a style line only off the middle, stronger at the ends", () => {
    expect(styleInstructions({ tone: 3 })).toEqual([]);
    const lines = styleInstructions({ tone: 1, depth: 4 });
    expect(lines).toHaveLength(2);
    expect(lines.some((l) => l.startsWith("Clearly: "))).toBe(true);
    expect(lines.some((l) => l.startsWith("Somewhat: "))).toBe(true);
  });

  it("mention only what the person shared", () => {
    const anon = personalInstructions({}, { signedIn: false });
    expect(anon).toContain("anonymously");
    expect(anon).not.toContain("Sexual Personality");
    const known = personalInstructions(
      {},
      { signedIn: true, name: "Lea", archetype: "Spark Seeker" }
    );
    expect(known).toContain("Lea");
    expect(known).toContain("Spark Seeker");
  });
});
