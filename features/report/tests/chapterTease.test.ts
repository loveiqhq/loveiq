import { describe, expect, it } from "vitest";

import {
  CHAPTER_LEARN_ONELINERS,
  CHAPTER_NUDGE_POOL,
  buildChapterContent,
  computeLockedChapters,
  extractTease,
  getChapterNudgesSentFromMetadata,
  normalizeArchetypeName,
  pickNextChapter,
  seededShuffle,
  type ChapterNudgeEntry,
} from "@features/report/server/chapterTease";
import { ESSENTIALS_SECTION_IDS } from "@features/report/server/access";
import { KNOWN_ARCHETYPES } from "@features/report/server/archetypeSlug";

const PRIMARY = "Sensual Connector";
const ESSENTIALS_POOL_SECTIONS = CHAPTER_NUDGE_POOL.filter((c) =>
  (ESSENTIALS_SECTION_IDS as readonly string[]).includes(c.sectionId)
).map((c) => c.sectionId);

describe("CHAPTER_NUDGE_POOL", () => {
  it("has exactly 21 narrative chapters and excludes the table + recommendations", () => {
    expect(CHAPTER_NUDGE_POOL.length).toBe(21);
    const ids = CHAPTER_NUDGE_POOL.map((c) => c.sectionId);
    expect(ids).toContain("core_motivation");
    expect(ids).not.toContain("typical_sexual_fantasy_amp_practice_tendencies");
    expect(ids).not.toContain("recommendations");
    expect(ids).not.toContain("core_archetype"); // non-premium, never locked
    expect(ids).not.toContain("summary"); // premium but has no archetype block
  });

  it("has a 'what you'll learn' one-liner for every pool chapter", () => {
    for (const chapter of CHAPTER_NUDGE_POOL) {
      expect(CHAPTER_LEARN_ONELINERS[chapter.sectionId]).toBeTruthy();
    }
  });
});

describe("normalizeArchetypeName", () => {
  it("passes through current names, maps legacy names, rejects unknown", () => {
    expect(normalizeArchetypeName("Sensual Connector")).toBe("Sensual Connector");
    // V9 rename: Approval Seeker → Tender Devotee
    expect(normalizeArchetypeName("Approval Seeker")).toBe("Tender Devotee");
    expect(normalizeArchetypeName("Not An Archetype")).toBeNull();
    expect(normalizeArchetypeName(null)).toBeNull();
    expect(normalizeArchetypeName("")).toBeNull();
  });
});

describe("getChapterNudgesSentFromMetadata", () => {
  it("reads the sent list and tolerates malformed metadata", () => {
    expect(getChapterNudgesSentFromMetadata({ chapterNudgesSent: ["a", "b"] })).toEqual(["a", "b"]);
    expect(getChapterNudgesSentFromMetadata({ chapterNudgesSent: ["a", 5, null] })).toEqual(["a"]);
    expect(getChapterNudgesSentFromMetadata({})).toEqual([]);
    expect(getChapterNudgesSentFromMetadata(null)).toEqual([]);
    expect(getChapterNudgesSentFromMetadata({ chapterNudgesSent: "nope" })).toEqual([]);
  });
});

describe("extractTease", () => {
  it("caps the tease at ~60% so a short chapter is never revealed in full", () => {
    // 10-word chapter → at most 6 words teased.
    const r = extractTease("<p>one two three four five six seven eight nine ten</p>");
    expect(r.wasTruncated).toBe(true);
    const count = r.text.split(/\s+/).filter(Boolean).length;
    expect(count).toBeLessThanOrEqual(6);
    expect(count).toBeGreaterThan(0);
    expect(r.text.startsWith("one two three")).toBe(true);
  });

  it("cuts to ~150 words and strips footnotes / tags when prose is long", () => {
    const sentence = "Desire builds slowly through safety and sensation and warmth";
    const longHtml =
      "<p>" +
      Array(40).fill(sentence).join(" ") +
      '<sup><a href="https://docs.google.com/document/d/abc">1</a></sup></p>' +
      "<p>More prose here that should be cut off well before this point.</p>";
    const r = extractTease(longHtml, 150);
    expect(r.wasTruncated).toBe(true);
    const wordCount = r.text.split(/\s+/).filter(Boolean).length;
    expect(wordCount).toBeLessThanOrEqual(150);
    expect(wordCount).toBeGreaterThan(120);
    // No HTML, no footnote anchors, no sup tags leak into the tease.
    expect(r.text).not.toContain("<");
    expect(r.text.toLowerCase()).not.toContain("docs.google");
    expect(r.text.toLowerCase()).not.toContain("sup");
  });

  it("returns empty text for empty / tag-only input", () => {
    expect(extractTease("")).toEqual({ text: "", wasTruncated: false });
    expect(extractTease("<p></p>")).toEqual({ text: "", wasTruncated: false });
    expect(extractTease(null)).toEqual({ text: "", wasTruncated: false });
  });
});

describe("seededShuffle (via pickNextChapter ordering)", () => {
  const items: ChapterNudgeEntry[] = Array.from({ length: 12 }, (_, i) => ({
    sectionId: `s${i}`,
    blockId: `b${i}`,
  }));

  it("is stable for the same email and case-insensitive", () => {
    const a = pickNextChapter({ lockedChapters: items, alreadySent: [], email: "a@x.com" });
    const a2 = pickNextChapter({ lockedChapters: items, alreadySent: [], email: "A@X.com" });
    expect(a?.entry.sectionId).toBe(a2?.entry.sectionId);
  });

  it("differs across emails (not all the same first pick)", () => {
    const picks = ["a@x.com", "b@x.com", "c@x.com", "d@x.com", "e@x.com"].map(
      (email) => pickNextChapter({ lockedChapters: items, alreadySent: [], email })?.entry.sectionId
    );
    expect(new Set(picks).size).toBeGreaterThan(1);
  });

  it("advances to the next unsent chapter and returns null when all sent", () => {
    const email = "loop@x.com";
    const first = pickNextChapter({ lockedChapters: items, alreadySent: [], email });
    expect(first?.index).toBe(1);
    const second = pickNextChapter({
      lockedChapters: items,
      alreadySent: [first!.entry.sectionId],
      email,
    });
    expect(second?.index).toBe(2);
    expect(second?.entry.sectionId).not.toBe(first?.entry.sectionId);

    const allSent = items.map((c) => c.sectionId);
    expect(pickNextChapter({ lockedChapters: items, alreadySent: allSent, email })).toBeNull();
  });

  it("returns null for an empty locked list", () => {
    expect(pickNextChapter({ lockedChapters: [], alreadySent: [], email: "x@x.com" })).toBeNull();
  });

  it("keeps relative order stable when the set shrinks (identity-keyed, not positional)", () => {
    const email = "shrink@x.com";
    const bigOrder = seededShuffle(items, email, (c) => c.sectionId).map((c) => c.sectionId);
    const removed = new Set(["s2", "s5", "s8", "s11"]);
    const small = items.filter((c) => !removed.has(c.sectionId));
    const smallOrder = seededShuffle(small, email, (c) => c.sectionId).map((c) => c.sectionId);
    // The shrunk order must be exactly the big order with removed ids filtered
    // out — i.e. removing chapters never reshuffles the survivors.
    expect(smallOrder).toEqual(bigOrder.filter((id) => !removed.has(id)));
  });
});

describe("computeLockedChapters", () => {
  it("locks the whole pool for a free user", () => {
    const free = computeLockedChapters({
      accessPlan: null,
      archetypeTiers: null,
      unlockedArchetypes: null,
      primaryArchetype: PRIMARY,
    });
    expect(free.length).toBeGreaterThanOrEqual(17);
    // Sensual Connector has prose for every narrative chapter → full pool.
    expect(free.length).toBe(CHAPTER_NUDGE_POOL.length);
  });

  it("drops the essentials sections for an essentials buyer of the primary", () => {
    const free = computeLockedChapters({
      accessPlan: "essentials",
      archetypeTiers: { [PRIMARY]: "essentials" },
      unlockedArchetypes: null,
      primaryArchetype: PRIMARY,
    });
    const ids = free.map((c) => c.sectionId);
    for (const essentialsId of ESSENTIALS_POOL_SECTIONS) {
      expect(ids).not.toContain(essentialsId);
    }
    expect(free.length).toBe(CHAPTER_NUDGE_POOL.length - ESSENTIALS_POOL_SECTIONS.length);
  });

  it("returns nothing for full_report (primary) or all_reports", () => {
    expect(
      computeLockedChapters({
        accessPlan: "full_report",
        archetypeTiers: { [PRIMARY]: "full_report" },
        unlockedArchetypes: null,
        primaryArchetype: PRIMARY,
      })
    ).toEqual([]);
    expect(
      computeLockedChapters({
        accessPlan: "all_reports",
        archetypeTiers: null,
        unlockedArchetypes: null,
        primaryArchetype: PRIMARY,
      })
    ).toEqual([]);
  });

  it("treats a legacy unlocked_archetypes entry as a full unlock", () => {
    expect(
      computeLockedChapters({
        accessPlan: null,
        archetypeTiers: null,
        unlockedArchetypes: [PRIMARY],
        primaryArchetype: PRIMARY,
      })
    ).toEqual([]);
  });

  it("does NOT unlock the primary when full_report was bought for another archetype", () => {
    const locked = computeLockedChapters({
      accessPlan: "full_report", // global plan, but for a different archetype
      archetypeTiers: { "Spark Seeker": "full_report" },
      unlockedArchetypes: ["Spark Seeker"],
      primaryArchetype: PRIMARY,
    });
    expect(locked.length).toBe(CHAPTER_NUDGE_POOL.length);
  });
});

describe("buildChapterContent + end-to-end content for every archetype", () => {
  it("produces a usable tease for every locked chapter of every archetype", () => {
    for (const archetype of KNOWN_ARCHETYPES) {
      const locked = computeLockedChapters({
        accessPlan: null,
        archetypeTiers: null,
        unlockedArchetypes: null,
        primaryArchetype: archetype,
      });
      expect(locked.length).toBeGreaterThan(0);
      for (const entry of locked) {
        const content = buildChapterContent(entry, archetype);
        expect(content, `${archetype} / ${entry.sectionId}`).not.toBeNull();
        expect(content!.teaseText.length).toBeGreaterThan(0);
        expect(content!.chapterTitle.length).toBeGreaterThan(0);
        expect(content!.whatYoullLearn.length).toBeGreaterThan(0);
        // The {{CORE_ARCHETYPE}} placeholder must be resolved in titles.
        expect(content!.chapterTitle).not.toContain("{{");
      }
    }
  });

  it("returns null for an unknown archetype", () => {
    expect(buildChapterContent(CHAPTER_NUDGE_POOL[0]!, "Nonexistent Archetype")).toBeNull();
  });
});
