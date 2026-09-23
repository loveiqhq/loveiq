import { describe, expect, it } from "vitest";
import { BODY_LIMIT } from "@features/brain/server/ingest/notion";
import {
  buildSkillRows,
  collapseToDocuments,
  isTruncated,
  measuredVoice,
} from "@features/brain/server/ingest/skills";

const prompts = [{ source_id: "drive/doc:ABC", title: "2. Chapter_Prompt" }];

/** The skill is one DOCUMENT stored as parts; read it the way fetch_document does. */
const whole = (list: typeof prompts) =>
  buildSkillRows("2026-09-15T00:00:00Z", list)
    .map((r) => r.body)
    .join("\n\n");

/**
 * The shape the corpus really holds: 29 prompt documents, four of them Drive "Copy of"
 * duplicates. The one-prompt fixture above is why the truncation went unnoticed.
 */
const realistic = [
  ...Array.from({ length: 25 }, (_, i) => ({
    source_id: `doc:P${i}`,
    title: `Drive: ${String(i + 1).padStart(2, "0")}_Typical_Chapter_${i}_Prompt (part 1 of 3)`,
  })),
  ...Array.from({ length: 4 }, (_, i) => ({
    source_id: `doc:C${i}`,
    title: `Drive: Copy of ${String(i + 1).padStart(2, "0")}_Typical_Chapter_${i}_Prompt`,
  })),
];

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

  it("names the register PER CHAPTER, because the corpus-wide average hides the rule", () => {
    /**
     * The skill used to say "only 121 of 336 blocks use you, so the dominant mode is third
     * person". True on average and useless in practice: `insecurities` addresses the reader
     * in all 14 shipped versions and `core_archetype` in none, so a writer following the
     * average is wrong in both. Corrected 2026-09-16 to list the chapters.
     */
    const body = buildSkillRows("2026-09-16T00:00:00Z", prompts)[0]!.body;
    const v = measuredVoice();
    expect(body).toContain(`${v.chapters} chapters`);
    expect(v.thirdPersonChapters.length).toBeGreaterThan(5);
    expect(v.secondPersonChapters.length).toBeGreaterThan(0);
    for (const c of [...v.thirdPersonChapters, ...v.secondPersonChapters]) {
      expect(body, `${c} must be named in the skill`).toContain(c);
    }
  });

  it("does not repeat the heading claim that was only ever true of one chapter", () => {
    /**
     * It said "every heading appears exactly once per archetype, in the same order",
     * generalised from `practices`. Measured: 19 of 24 chapters have no headings at all, and
     * four more have headings that are archetype-specific content.
     */
    const body = buildSkillRows("2026-09-16T00:00:00Z", prompts)[0]!.body;
    expect(body).not.toMatch(/every heading appears exactly once per archetype/);
    expect(body).toMatch(/only `?practices`? has a fixed heading skeleton/i);
  });

  it("POINTS AT the live prompt documents rather than copying them", () => {
    // A copy taken today is a stale copy tomorrow — the failure check-mcp-claims exists for.
    const body = whole(prompts);
    expect(body).toContain('fetch_document("drive/doc:ABC")');
    expect(body).toContain("2. Chapter_Prompt");
  });

  it("still ships something useful when no prompt document is found", () => {
    // An empty prompt list must not produce a skill that reads as though none exist.
    const body = whole([]);
    expect(body).toMatch(/search Drive/i);
    expect(body).toContain("A CHAPTER IS NOT A BLANK PAGE");
  });

  it("carries the rules a newcomer would otherwise have to be told twice", () => {
    const body = whole(prompts);
    // Standing notes from the strategy lead, not stylistic opinions.
    expect(body).toMatch(/core motivations do not belong in the beliefs chapter/i);
    // Who is allowed to accept a change.
    expect(body).toMatch(/Sanjin/);
    // A draft is a draft.
    expect(body).toMatch(/never anywhere a reader sees/i);
  });

  it("is one DOCUMENT, because the question is 'how do we write a chapter'", () => {
    // Stored as parts, but every part names its place: `brain_search` collapses a
    // document on `meta.part`, so a search returns it once, and fetch_document
    // reassembles the parts in order from the shared id.
    const rows = buildSkillRows("2026-09-15T00:00:00Z", collapseToDocuments(realistic));
    expect(rows.length).toBeGreaterThan(1);
    rows.forEach((r, i) => {
      expect(r.source).toBe("skill");
      expect(r.period_end).toBeNull();
      expect(r.source_id).toBe(
        i === 0 ? "write-a-report-chapter" : `write-a-report-chapter#${i + 1}`
      );
      expect(r.meta).toMatchObject({ part: i + 1, parts: rows.length });
    });
  });

  /**
   * THE WRITE PATH CUTS EVERY BODY AT 2,400 CHARACTERS, and it cut this one.
   *
   * The skill opened with the prompt list, so the stored row was the list and nothing
   * else — cut off mid-link, every rule below it gone — while every test stayed green on
   * a one-prompt fixture. Checked against the list the corpus actually holds.
   */
  it("fits every part under the write-path cap, with the rules intact", () => {
    const rows = buildSkillRows("2026-09-15T00:00:00Z", collapseToDocuments(realistic));
    for (const r of rows) expect(r.body.length).toBeLessThanOrEqual(BODY_LIMIT);
    const body = rows.map((r) => r.body).join("\n\n");
    expect(body).toMatch(/core motivations do not belong in the beliefs chapter/i);
    expect(body).toMatch(/never anywhere a reader sees/i);
    expect(body).toMatch(/Sanjin/);
    // Every real prompt is pointed at, not the first twenty alphabetically.
    for (let i = 0; i < 25; i++) expect(body).toContain(`fetch_document("drive/doc:P${i}")`);
  });

  it("puts the rules before the pointers, so the first part is the method", () => {
    const [first] = buildSkillRows("2026-09-15T00:00:00Z", collapseToDocuments(realistic));
    expect(first!.body).toContain("A CHAPTER IS NOT A BLANK PAGE");
    expect(first!.body).not.toContain('fetch_document("drive/doc:P0")');
  });

  it("drops Drive 'Copy of' duplicates instead of spending slots on them", () => {
    const docs = collapseToDocuments(realistic);
    expect(docs).toHaveLength(25);
    expect(docs.some((d) => /copy of/i.test(d.title))).toBe(false);
  });
});
