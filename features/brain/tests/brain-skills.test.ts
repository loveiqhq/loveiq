import { describe, expect, it } from "vitest";
import {
  buildSkillRows,
  collapseToDocuments,
  isTruncated,
  measuredVoice,
} from "@features/brain/server/ingest/skills";

const prompts = [{ source_id: "drive/doc:ABC", title: "2. Chapter_Prompt" }];

describe("finding the team's prompt documents", () => {
  it("collapses a document's parts BEFORE capping, not after", () => {
    /**
     * A long Drive document is stored as many chunks, each titled "(part 10 of 29)". The
     * first version read 40 rows ordered by title and deduped afterwards, so 34 of them
     * were fragments of the same few files and it listed 6 documents when 18 existed.
     */
    const rows = [
      ...Array.from({ length: 29 }, (_, i) => ({
        source_id: i === 0 ? "doc:LONG" : `doc:LONG#${i + 1}`,
        title: `Drive: Big_Prompt (part ${i + 1} of 29)`,
      })),
      { source_id: "doc:SECOND", title: "Drive: 2. Chapter_Prompt" },
      { source_id: "doc:THIRD", title: "Drive: 3. Visualisation_Chapter_Prompt" },
    ];
    const docs = collapseToDocuments(rows);
    expect(docs).toHaveLength(3);
    expect(docs.map((d) => d.source_id)).toEqual([
      "drive/doc:LONG",
      "drive/doc:SECOND",
      "drive/doc:THIRD",
    ]);
  });

  it("strips the part suffix, so it never points at 'part 10 of 29' as a name", () => {
    const [doc] = collapseToDocuments([
      { source_id: "doc:X#10", title: "Drive: Chapter_Prompt (part 10 of 29)" },
    ]);
    expect(doc!.title).toBe("Chapter_Prompt");
  });

  it("notices when the page came back FULL, which is how the list got silently short", () => {
    // The shipped version asked for 40 rows, got 40 — all fragments of six files — and
    // reported six documents as though that were all of them. 18 existed. A full page is
    // indistinguishable from a truncated one unless something checks.
    expect(isTruncated(40, 40)).toBe(true);
    expect(isTruncated(39, 40)).toBe(false);
    expect(isTruncated(600)).toBe(true);
  });

  it("caps the list, so one noisy folder cannot become the whole skill", () => {
    const many = Array.from({ length: 50 }, (_, i) => ({
      source_id: `doc:${i}`,
      title: `Prompt ${i}`,
    }));
    expect(collapseToDocuments(many, 20)).toHaveLength(20);
  });
});

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
