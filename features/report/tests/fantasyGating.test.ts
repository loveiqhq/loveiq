import { describe, expect, it } from "vitest";
import {
  buildFantasy,
  FANTASY_CLEAR_ROWS,
  FANTASY_PRACTICE_FREE_BLOCKS,
  REPORT_V4_FANTASY,
} from "@/data/report3-fantasy";
import { reportPracticeTendencies } from "@/data/report-practice-tendencies";
import type { Report3Block } from "@/data/report3-learn-more";

/**
 * What a reader RECEIVES of the Fantasy vs. Reality chapter (Figma 304:281 open,
 * 305:217 paywalled). The paywalled frame keeps the intro sharp, shows three rows
 * of each open table category with two more blurred behind a lock badge, blurs
 * "Common challenges" whole and gates the practice; a CSS blur is paint only, so
 * everything only ever seen blurred leaves the server scrambled (Fatih's rule,
 * 2026-09-23).
 */

const textOf = (block: Report3Block): string =>
  block.kind === "heading"
    ? block.text
    : block.kind === "para"
      ? block.runs.map((r) => r.text).join("")
      : block.items.map((runs) => runs.map((r) => r.text).join("")).join(" ");

/** The emphasised runs of a paragraph, as [text, weight, italic]. */
const emphasis = (block: Report3Block) => {
  if (block.kind !== "para") throw new Error("not a paragraph");
  return block.runs.filter((r) => r.weight || r.italic).map((r) => [r.text, r.weight, r.italic]);
};

const SPARK = REPORT_V4_FANTASY["Spark Seeker"]!;
const SOURCE = reportPracticeTendencies["Spark Seeker"]!;
const view = (locked: boolean) => buildFantasy("Spark Seeker", { locked })!;
const payload = (locked: boolean) => JSON.stringify(view(locked));

describe("the authored copy (304:291 / 368:1920 / 441:6187)", () => {
  it("carries the intro's twelve blocks, the sixth the heading 304:291 sets mid-copy", () => {
    expect(SPARK.intro).toHaveLength(12);
    expect(SPARK.intro[5]).toEqual({
      kind: "heading",
      text: "What a fantasy might actually be about",
    });
    expect(textOf(SPARK.intro[0]!)).toBe(
      "A sexual fantasy can feel like evidence. If a scene is intensely arousing or keeps returning, it is easy to assume it must reveal something you secretly want. But fantasy and real-world desire are not the same psychological experience."
    );
    expect(textOf(SPARK.intro[11]!)).toBe(
      "For the Spark Seeker, this matters because fantasy can concentrate novelty, pursuit and intensity into their purest form. That can make imagination useful, but it can also influence what real desire is expected to feel like."
    );
  });

  it("sets the intro's emphasis runs as drawn, and only those", () => {
    expect(emphasis(SPARK.intro[0]!)).toEqual([
      ["fantasy and real-world desire are not the same psychological experience", 700, undefined],
    ]);
    expect(emphasis(SPARK.intro[1]!)).toEqual([]);
    expect(emphasis(SPARK.intro[2]!)).toEqual([]);
    expect(emphasis(SPARK.intro[3]!)).toEqual([
      [
        "Arousal tells you that something activated your erotic system. It does not automatically tell you that you want to experience it.",
        700,
        undefined,
      ],
    ]);
    expect(emphasis(SPARK.intro[4]!)).toEqual([["Spark Seeker, ", 700, undefined]]);
    expect(emphasis(SPARK.intro[6]!)).toEqual([
      ["a secret lover who cannot resist you", 700, undefined],
    ]);
    expect(emphasis(SPARK.intro[7]!)).toEqual([
      ["sex somewhere you could be caught", 700, undefined],
    ]);
    expect(emphasis(SPARK.intro[8]!)).toEqual([["being watched", 700, undefined]]);
    expect(emphasis(SPARK.intro[9]!)).toEqual([]);
    expect(emphasis(SPARK.intro[10]!)).toEqual([["This is what I need", undefined, true]]);
    expect(emphasis(SPARK.intro[11]!)).toEqual([
      [
        "That can make imagination useful, but it can also influence what real desire is expected to feel like.",
        700,
        undefined,
      ],
    ]);
  });

  it("keeps the frame's curly quotes and straight apostrophes", () => {
    expect(textOf(SPARK.intro[10]!)).toBe(
      "A Spark Seeker may look at a fantasy and think: “This is what I need”. But the literal scenario may be just one of the ways to the experience underneath it."
    );
    expect(textOf(SPARK.intro[2]!)).toContain("another person's needs");
  });

  it("opens 'Common challenges' on its heading and runs thirteen paragraphs", () => {
    expect(SPARK.challenges).toHaveLength(14);
    expect(SPARK.challenges[0]).toEqual({ kind: "heading", text: "Common challenges" });
    expect(textOf(SPARK.challenges[1]!)).toBe(
      "A fantasy often works because reality has been edited out."
    );
    expect(textOf(SPARK.challenges[13]!)).toBe(
      "And sometimes the most useful thing a fantasy reveals is not what the Spark Seeker wants to do, but what the Spark Seeker wants to feel."
    );
    expect(SPARK.challenges.slice(1).every((block) => block.kind === "para")).toBe(true);
  });

  it("sets the challenges' emphasis runs as drawn, and only those", () => {
    const runs = SPARK.challenges
      .slice(1)
      .map(emphasis)
      .flat()
      .map(([text]) => text);
    expect(runs).toEqual([
      "the important part was never the audience itself",
      "being able to stop managing the experience",
      "what the Spark Seeker wants to do",
      "what the Spark Seeker wants to feel",
    ]);
  });

  it("carries the practice's ten paragraphs and its three bold passages", () => {
    expect(SPARK.practiceEyebrow).toBe("Practice time: ~8 min.");
    expect(SPARK.practiceTitle).toBe("Try this & see what shifts");
    expect(SPARK.practice).toHaveLength(10);
    expect(textOf(SPARK.practice[0]!)).toBe(
      "Understanding fantasy does not require decoding every image or finding a hidden explanation for it. The goal is simpler: learn to separate what happens in the fantasy from what makes it appealing."
    );
    expect(textOf(SPARK.practice[9]!)).toBe(
      "It is to notice what imagination is showing you about desire, then decide what deserves to stay in fantasy and what might make real sex more exciting."
    );
    expect(
      SPARK.practice
        .map(emphasis)
        .flat()
        .map(([text]) => text)
    ).toEqual([
      "learn to separate what happens in the fantasy from what makes it appealing.",
      "reality test",
      "A fantasy does not have to become reality to improve reality.",
    ]);
  });

  it("teases the closed card with practice paragraphs 1-2 (441:6422)", () => {
    expect(SPARK.practiceTeaser).toEqual(SPARK.practice.slice(0, 2));
  });

  it("drops the trailing spaces the frame leaves at paragraph ends", () => {
    for (const block of [...SPARK.intro, ...SPARK.challenges, ...SPARK.practice]) {
      expect(textOf(block)).toBe(textOf(block).trimEnd());
    }
  });
});

describe("buildFantasy — the table (639:308 open, 639:1905 paywalled)", () => {
  it("lists the eleven categories in the source's order, with their full counts", () => {
    for (const locked of [false, true]) {
      const { categories } = view(locked).table;
      expect(categories.map((c) => c.title)).toEqual(SOURCE.groups.map((g) => g.title));
      expect(categories.map((c) => c.total)).toEqual([11, 9, 8, 6, 8, 8, 12, 8, 8, 5, 6]);
    }
  });

  it("gives a paying reader every row with its source scores and note, and opens two categories", () => {
    const { table } = view(false);
    expect(table.locked).toBe(false);
    table.categories.forEach((category, i) => {
      const group = SOURCE.groups[i]!;
      expect(category.rows).toEqual(
        group.rows.map((r) => ({
          practice: r.practice,
          pull: r.fantasyPull,
          pleasure: r.actualPleasure,
          description: r.description,
        }))
      );
      expect(category.blurredFrom).toBe(category.rows.length);
      expect(category.defaultOpen).toBe(i < 2);
    });
  });

  it("opens three categories for a locked reader: three real rows, then two stand-ins", () => {
    const { table } = view(true);
    expect(table.locked).toBe(true);
    table.categories.slice(0, 3).forEach((category, i) => {
      const group = SOURCE.groups[i]!;
      expect(category.defaultOpen).toBe(true);
      expect(category.blurredFrom).toBe(FANTASY_CLEAR_ROWS);
      expect(category.rows).toHaveLength(FANTASY_CLEAR_ROWS + 2);
      expect(category.rows.slice(0, FANTASY_CLEAR_ROWS)).toEqual(
        group.rows.slice(0, FANTASY_CLEAR_ROWS).map((r) => ({
          practice: r.practice,
          pull: r.fantasyPull,
          pleasure: r.actualPleasure,
          description: r.description,
        }))
      );
    });
  });

  it("closes the other eight, each holding three stand-ins and nothing real", () => {
    const { table } = view(true);
    for (const category of table.categories.slice(3)) {
      expect(category.defaultOpen).toBe(false);
      expect(category.blurredFrom).toBe(0);
      expect(category.rows).toHaveLength(3);
    }
  });

  it("sends a stand-in as a scrambled name of the same shape, with no scores and no note", () => {
    const { table } = view(true);
    table.categories.forEach((category, i) => {
      const group = SOURCE.groups[i]!;
      const hidden = category.blurredFrom === 0 ? group.rows.slice(0, 3) : group.rows.slice(3, 5);
      category.rows.slice(category.blurredFrom).forEach((row, k) => {
        const real = hidden[k]!.practice;
        expect(row.pull).toBeNull();
        expect(row.pleasure).toBeNull();
        expect(row.description).toBeNull();
        expect(row.practice).toHaveLength(real.length);
        expect(row.practice).not.toBe(real);
        // Spaces and punctuation stay put, so the stand-in wraps like the real name.
        expect(row.practice.replace(/[A-Za-z0-9]/g, "")).toBe(real.replace(/[A-Za-z0-9]/g, ""));
      });
    });
  });

  it("sends exactly nine scores per column to a locked reader, the clear rows' own", () => {
    const rows = view(true).table.categories.flatMap((c) => c.rows);
    expect(rows.filter((r) => r.pull !== null)).toHaveLength(9);
    expect(rows.filter((r) => r.pleasure !== null)).toHaveLength(9);
    expect(rows.filter((r) => r.description !== null)).toHaveLength(9);
  });

  it("keeps every hidden fantasy's name and note out of the locked payload", () => {
    const wire = payload(true);
    SOURCE.groups.forEach((group, i) => {
      const hidden = i < 3 ? group.rows.slice(FANTASY_CLEAR_ROWS) : group.rows;
      for (const row of hidden) {
        expect(wire).not.toContain(`"${row.practice}"`);
        expect(wire).not.toContain(row.description!.slice(0, 50));
      }
    });
  });

  it("puts every fantasy and note in the paid payload", () => {
    const wire = payload(false);
    for (const row of SOURCE.groups.flatMap((g) => g.rows)) {
      expect(wire).toContain(`"${row.practice}"`);
      expect(wire).toContain(row.description!.slice(0, 50));
    }
  });
});

describe("buildFantasy — the prose", () => {
  it("hands the intro to everyone verbatim: 305:226 draws it all sharp", () => {
    expect(view(true).intro).toEqual(SPARK.intro);
    expect(view(false).intro).toEqual(SPARK.intro);
  });

  it("scrambles 'Common challenges' whole for a locked reader: 305:228 blurs it all", () => {
    const locked = view(true).challenges;
    expect(locked).toHaveLength(SPARK.challenges.length);
    locked.forEach((block, i) => {
      const original = SPARK.challenges[i]!;
      expect(block.kind).toBe(original.kind);
      expect(textOf(block)).toHaveLength(textOf(original).length);
      expect(textOf(block)).not.toBe(textOf(original));
    });
    const wire = payload(true);
    for (const block of SPARK.challenges.slice(1)) {
      expect(wire).not.toContain(textOf(block).slice(0, 40));
    }
  });

  it("hands a paying reader 'Common challenges' verbatim", () => {
    expect(view(false).challenges).toEqual(SPARK.challenges);
  });
});

describe("buildFantasy — the practice (441:6168 open, 441:6188 gated)", () => {
  it("gives a paying reader all ten paragraphs, nothing split off", () => {
    const { practice } = view(false);
    expect(practice.locked).toBe(false);
    expect(practice.free).toEqual(SPARK.practice);
    expect(practice.ramp).toBeNull();
    expect(practice.rest).toEqual([]);
    expect(practice.eyebrow).toBe("Practice time: ~8 min.");
    expect(practice.title).toBe("Try this & see what shifts");
    expect(practice.teaser).toEqual(SPARK.practice.slice(0, 2));
  });

  it("keeps paragraphs 1-3 sharp and ramps the blur in over paragraph 4, real", () => {
    const { practice } = view(true);
    expect(practice.locked).toBe(true);
    expect(practice.free).toEqual(SPARK.practice.slice(0, FANTASY_PRACTICE_FREE_BLOCKS));
    expect(practice.ramp).toEqual(SPARK.practice[FANTASY_PRACTICE_FREE_BLOCKS]);
  });

  it("scrambles paragraphs 5-10, which 441:6188 only draws under the full blur", () => {
    const { practice } = view(true);
    const hidden = SPARK.practice.slice(FANTASY_PRACTICE_FREE_BLOCKS + 1);
    expect(practice.rest).toHaveLength(hidden.length);
    practice.rest.forEach((block, i) => {
      expect(textOf(block)).toHaveLength(textOf(hidden[i]!).length);
      expect(textOf(block)).not.toBe(textOf(hidden[i]!));
    });
    const wire = payload(true);
    for (const block of hidden) expect(wire).not.toContain(textOf(block).slice(0, 30));
  });

  it("teases the closed card with the same free paragraphs for everyone", () => {
    expect(view(true).practice.teaser).toEqual(SPARK.practice.slice(0, 2));
  });
});

describe("buildFantasy — who gets the chapter", () => {
  it("returns null for an archetype nobody has written yet, so ReportPage keeps V2's section", () => {
    expect(buildFantasy("Emotional Voyeur")).toBeNull();
    expect(buildFantasy("Not An Archetype", { locked: true })).toBeNull();
  });

  it("defaults to the paid view", () => {
    expect(buildFantasy("Spark Seeker")!.locked).toBe(false);
  });
});
