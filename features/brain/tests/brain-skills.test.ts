import { describe, expect, it } from "vitest";
import { buildSkillRows, measuredVoice } from "@features/brain/server/ingest/skills";

const prompts = [{ source_id: "drive/doc:ABC", title: "2. Chapter_Prompt" }];

describe("the chapter skill", () => {
  it("counts the voice off the shipped copy instead of describing it", () => {
    // A skill that says "write warmly" is worth nothing. These are countable.
    const v = measuredVoice();
    expect(v.chapters).toBeGreaterThan(10);
    expect(v.archetypes).toBeGreaterThanOrEqual(14);
    expect(v.medianSentenceWords).toBeGreaterThan(5);
    expect(v.medianSentenceWords).toBeLessThan(40);
    expect(v.secondPersonBlocks).toBeLessThan(v.totalBlocks);
  });

  it("puts the measured figures in the body, not adjectives", () => {
    const body = buildSkillRows("2026-09-15T00:00:00Z", prompts)[0]!.body;
    const v = measuredVoice();
    expect(body).toContain(`${v.chapters} chapters`);
    expect(body).toContain(`${v.medianSentenceWords} words`);
    expect(body).toContain(`${v.secondPersonBlocks} of ${v.totalBlocks}`);
  });

  it("POINTS AT the live prompt documents rather than copying them", () => {
    // A copy taken today is a stale copy tomorrow — the failure check-mcp-claims exists for.
    const body = buildSkillRows("2026-09-15T00:00:00Z", prompts)[0]!.body;
    expect(body).toContain('fetch_document("drive/doc:ABC")');
    expect(body).toContain("2. Chapter_Prompt");
  });

  it("still ships something useful when no prompt document is found", () => {
    // An empty prompt list must not produce a skill that reads as though none exist.
    const body = buildSkillRows("2026-09-15T00:00:00Z", [])[0]!.body;
    expect(body).toMatch(/search Drive/i);
    expect(body).toContain("THE SKELETON IS FIXED");
  });

  it("carries the rules a newcomer would otherwise have to be told twice", () => {
    const body = buildSkillRows("2026-09-15T00:00:00Z", prompts)[0]!.body;
    // Standing notes from the strategy lead, not stylistic opinions.
    expect(body).toMatch(/core motivations do not belong in the beliefs chapter/i);
    // Who is allowed to accept a change.
    expect(body).toMatch(/Sanjin/);
    // A draft is a draft.
    expect(body).toMatch(/never anywhere a reader sees/i);
  });

  it("is one chunk, because the question is 'how do we write a chapter'", () => {
    const rows = buildSkillRows("2026-09-15T00:00:00Z", prompts);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.source).toBe("skill");
    expect(rows[0]!.period_end).toBeNull();
  });
});
