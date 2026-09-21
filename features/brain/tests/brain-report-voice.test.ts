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

  /**
   * EVERY SHIPPED REPORT FILE, not four of five.
   *
   * `data/report-practice-intro.ts` was the one this builder did not import, found
   * 2026-09-21 by diffing `data/report-*.ts` against the imports at the top. It is
   * rendered to every reader by `features/report/ui/reportContent.ts` and it is not
   * decoration: it carries the "probability-based estimates, not deterministic"
   * disclaimer, the definitions of Fantasy Pull and Lived Pleasure, and all four
   * combinations. "What does high fantasy pull with low lived pleasure mean" is an
   * ordinary question about our own product that the brain could not answer from the
   * copy we ship.
   */
  it("indexes the guidance on how to read the two practice scores", () => {
    const intro = rows.filter((r) => r.source_id.startsWith("practice-intro:"));
    expect(intro.length).toBeGreaterThanOrEqual(10);
    const all = intro.map((r) => r.body).join(" ");
    expect(all).toMatch(/probability-based/i);
    expect(all).toMatch(/Fantasy Pull/);
    expect(all).toMatch(/Lived Pleasure/);
  });

  it("keeps each score combination separately retrievable", () => {
    // One block per paragraph, so a question about ONE combination does not have to
    // pull all four to reach it.
    const intro = rows.filter((r) => r.source_id.startsWith("practice-intro:"));
    const combos = [
      "Low Fantasy + Low Pleasure",
      "Low Fantasy + High Pleasure",
      "High Fantasy + Low Pleasure",
      "High Fantasy + High Pleasure",
    ];
    for (const c of combos) {
      const holding = intro.filter((r) => r.body.includes(c));
      expect(holding.length).toBe(1);
    }
  });

  /**
   * THE MOST-READ COPY WE PUBLISH, and the brain held none of it.
   *
   * `data/faqs.ts` is rendered by WFAQ.tsx on both landing variants and emitted as
   * FAQPage JSON-LD, so it is simultaneously what customers read before buying and
   * what Google indexes. Found 2026-09-21 by diffing every file in `data/` against
   * the repo-built ingesters' imports.
   */
  it("indexes the homepage FAQ, one row per question", () => {
    const faq = rows.filter((r) => r.source_id.startsWith("faq:"));
    expect(faq.length).toBeGreaterThanOrEqual(8);
    // The question is in the title AND the body, so it matches however it is asked.
    for (const r of faq) {
      expect(r.title).toMatch(/^Homepage FAQ as shipped — .+/);
      expect(r.body.length).toBeGreaterThan(20);
    }
  });

  it("keys a FAQ on its question, so editing the ANSWER does not orphan the row", () => {
    // An id derived from the answer would change on every copy edit and leave the old
    // row behind for the sweep to find — the orphan problem the drive ingester hit.
    const faq = rows.filter((r) => r.source_id.startsWith("faq:"));
    expect(faq.some((r) => /^faq:[a-z0-9-]+$/.test(r.source_id))).toBe(true);
    expect(new Set(faq.map((r) => r.source_id)).size).toBe(faq.length);
  });

  it("gives every row a distinct id, or an upsert would silently drop copy", () => {
    const ids = rows.map((r) => r.source_id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
