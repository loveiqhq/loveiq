import { describe, expect, it } from "vitest";
import { buildReportVoiceRows, htmlToText } from "@features/brain/server/ingest/report-voice";

describe("report voice — the shipped copy, indexed", () => {
  const rows = buildReportVoiceRows("2026-09-15T00:00:00Z");

  it("indexes the shipped prose that markdown-only ingest could never see", () => {
    // 1.5 MB across five TypeScript files, previously zero chunks.
    expect(rows.length).toBeGreaterThan(300);
    const chars = rows.reduce((t, r) => t + r.body.length, 0);
    expect(chars).toBeGreaterThan(500_000);
  });

  it("strips HTML to readable prose, keeping structure as line breaks", () => {
    const text = htmlToText(
      "<h3>Core Essence</h3><p>Desire begins in the <strong>nervous system</strong> &amp; the heart.</p><ul><li>Attuned</li><li>Present</li></ul>"
    );
    expect(text).not.toMatch(/<[^>]+>/);
    expect(text).toContain("Core Essence");
    expect(text).toContain("nervous system");
    // The entity has to decode, or the voice reads as markup to anything matching on words.
    expect(text).toContain("&");
    expect(text).not.toContain("&amp;");
    // List items must not run together into one unreadable line.
    expect(text.split("\n").length).toBeGreaterThan(2);
  });

  it("separates a chapter from an archetype, so neither buries the other", () => {
    // Pooling a chapter across archetypes answers "how do we write Core Insecurities for a
    // Spark Seeker" with whichever archetype ranked highest.
    const ids = rows.map((r) => r.source_id);
    const coreForSpark = ids.find((i) => i.startsWith("chapter:") && i.includes("Spark Seeker"));
    expect(coreForSpark).toBeDefined();
    const chapters = new Set(
      rows.filter((r) => r.meta.chapter && r.meta.archetype).map((r) => String(r.meta.chapter))
    );
    const archetypes = new Set(
      rows.filter((r) => r.meta.archetype).map((r) => String(r.meta.archetype))
    );
    expect(chapters.size).toBeGreaterThan(5);
    expect(archetypes.size).toBeGreaterThanOrEqual(14);
  });

  it("marks every row as SHIPPED, so a draft can never be mistaken for the standard", () => {
    // Drive holds "Typical Beliefs — Chapter Output" and its siblings, which is what someone
    // is working on. This is what survived review and went to a reader.
    expect(rows.every((r) => r.meta.kind === "shipped")).toBe(true);
    expect(rows.every((r) => /as shipped/.test(r.title))).toBe(true);
  });

  it("carries no period, so it does not rank as though it described one day", () => {
    expect(rows.every((r) => r.period_end === null)).toBe(true);
  });

  it("writes bodies small enough to store, splitting long ones with a part label", () => {
    expect(rows.every((r) => r.body.length > 0 && r.body.length <= 12_000)).toBe(true);
    // Part ONE keeps the base id and later parts get `#n`, which is the convention the
    // Drive ingester already uses (`doc:X`, `doc:X#2`). Suffixing part one instead would
    // orphan every id already stored.
    const parts = rows.filter((r) => /part \d+ of \d+/.test(r.title));
    for (const p of parts) {
      const n = Number(/part (\d+) of/.exec(p.title)![1]);
      if (n === 1) expect(p.source_id).not.toMatch(/#\d+$/);
      else expect(p.source_id).toMatch(new RegExp(`#${n}$`));
    }
  });

  it("gives every row a distinct id, or an upsert would silently drop copy", () => {
    const ids = rows.map((r) => r.source_id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
