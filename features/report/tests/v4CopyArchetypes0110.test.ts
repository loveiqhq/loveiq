import { describe, expect, it } from "vitest";
import {
  ACCELERATORS_CHALLENGES_FREE_BLOCKS,
  ACCELERATORS_FREE_ROWS,
  ACCELERATORS_PRACTICE_FREE_BLOCKS,
  ACCELERATORS_PRACTICE_RAMP_THROUGH,
  REPORT_V4_ACCELERATORS,
  buildAccelerators,
} from "@/data/report3-accelerators";
import {
  FANTASY_PRACTICE_FREE_BLOCKS,
  REPORT_V4_FANTASY,
  buildFantasy,
} from "@/data/report3-fantasy";
import type { Report3Block } from "@/data/report3-learn-more";
import {
  PARTNERSHIP_FREE_BLOCKS,
  PARTNERSHIP_PRACTICE_FREE_BLOCKS,
  PARTNERSHIP_RAMP_THROUGH,
  REPORT_V4_PARTNERSHIP,
  buildPartnership,
} from "@/data/report3-partnership";
import {
  REPORT_V4_TYPICAL_BELIEFS,
  TYPICAL_BELIEFS_CHALLENGES_FREE_BLOCKS,
  TYPICAL_BELIEFS_FREE_ROWS,
  TYPICAL_BELIEFS_PRACTICE_FREE_BLOCKS,
  buildTypicalBeliefs,
} from "@/data/report3-typical-beliefs";
import { reportPracticeTendencies } from "@/data/report-practice-tendencies";
import { KNOWN_ARCHETYPES } from "@features/report/server/archetypeSlug";

/**
 * Every archetype's V4 chapters, whoever wrote them: Spark Seeker hand-set from Figma, the
 * others transcribed from Sanjin's docs (data/report3-copy, 01.10). These hold for each one,
 * so a new archetype's file is checked the moment it is merged in.
 */
const text = (block: Report3Block | undefined): string => {
  if (!block) return "";
  if (block.kind === "heading") return block.text;
  if (block.kind === "para") return block.runs.map((run) => run.text).join("");
  return block.items.map((item) => item.map((run) => run.text).join("")).join(" ");
};

const CHAPTERS = {
  typicalBeliefs: REPORT_V4_TYPICAL_BELIEFS,
  accelerators: REPORT_V4_ACCELERATORS,
  partnership: REPORT_V4_PARTNERSHIP,
  fantasy: REPORT_V4_FANTASY,
};
const archetypes = Object.keys(REPORT_V4_TYPICAL_BELIEFS);

describe("the V4 chapters' archetypes", () => {
  it("are known archetypes, by the display names the report uses", () => {
    for (const [chapter, record] of Object.entries(CHAPTERS)) {
      for (const name of Object.keys(record)) {
        expect(KNOWN_ARCHETYPES, `${chapter}: ${name}`).toContain(name);
      }
    }
  });

  it("have all four chapters or none", () => {
    for (const record of Object.values(CHAPTERS)) {
      expect(Object.keys(record).sort()).toEqual([...archetypes].sort());
    }
  });
});

describe.each(archetypes)("%s's V4 chapters", (name) => {
  it("Typical Beliefs: ten turns and ten sun beliefs, cut inside them", () => {
    const copy = REPORT_V4_TYPICAL_BELIEFS[name]!;
    expect(copy.turns).toHaveLength(10);
    expect(copy.sun).toHaveLength(10);
    const cuts = {
      freeRows: TYPICAL_BELIEFS_FREE_ROWS,
      challengesFree: TYPICAL_BELIEFS_CHALLENGES_FREE_BLOCKS,
      practiceFree: TYPICAL_BELIEFS_PRACTICE_FREE_BLOCKS,
      ...copy.cuts,
    };
    expect(cuts.freeRows).toBeLessThan(10);
    expect(cuts.challengesFree).toBeLessThan(copy.challenges.length);
    expect(cuts.practiceFree).toBeLessThan(copy.practice.length);
    // A locked reader never receives a shift the wall withholds.
    const locked = buildTypicalBeliefs(name, { locked: true })!;
    locked.panels.turns.forEach((turn, i) => {
      if (i >= cuts.freeRows) expect(turn.shift).toBeNull();
      else expect(turn.shift).not.toBeNull();
    });
  });

  it("Accelerators & Brakes: five brakes and five accelerators, the ramp anchored in its paragraph", () => {
    const copy = REPORT_V4_ACCELERATORS[name]!;
    expect(copy.brakes).toHaveLength(5);
    expect(copy.accelerators).toHaveLength(5);
    const cuts = {
      freeRows: ACCELERATORS_FREE_ROWS,
      challengesFree: ACCELERATORS_CHALLENGES_FREE_BLOCKS,
      practiceFree: ACCELERATORS_PRACTICE_FREE_BLOCKS,
      practiceRampThrough: ACCELERATORS_PRACTICE_RAMP_THROUGH as string | null,
      ...copy.cuts,
    };
    expect(cuts.challengesFree).toBeLessThan(copy.challenges.length);
    expect(cuts.practiceFree).toBeLessThan(copy.practice.length);
    // A missing anchor would leave the whole ramp real: it must be in the ramp paragraph.
    if (cuts.practiceRampThrough !== null) {
      expect(text(copy.practice[cuts.practiceFree])).toContain(cuts.practiceRampThrough);
    }
    // The closed card's teaser is free copy.
    const teaser = buildAccelerators(name, { locked: true })!.practice.teaser!;
    const free = copy.practice.slice(0, cuts.practiceFree).map(text).join(" ");
    if (!copy.practiceTeaser) for (const block of teaser) expect(free).toContain(text(block));
  });

  it("Challenges in Partnerships: six loop steps, the body's ramp anchored in its paragraph", () => {
    const copy = REPORT_V4_PARTNERSHIP[name]!;
    expect(copy.loop).toHaveLength(6);
    const cuts = {
      freeBlocks: PARTNERSHIP_FREE_BLOCKS,
      rampThrough: PARTNERSHIP_RAMP_THROUGH as string | null,
      practiceFree: PARTNERSHIP_PRACTICE_FREE_BLOCKS,
      ...copy.cuts,
    };
    expect(cuts.freeBlocks).toBeLessThan(copy.body.length);
    if (cuts.rampThrough !== null) {
      expect(text(copy.body[cuts.freeBlocks])).toContain(cuts.rampThrough);
    }
    const teaser = buildPartnership(name, { locked: true })!.practice.teaser!;
    const free = copy.practice.slice(0, cuts.practiceFree).map(text).join(" ");
    if (!copy.practiceTeaser) for (const block of teaser) expect(free).toContain(text(block));
  });

  it("Fantasy vs. Reality: the practice cut inside it, the teaser free copy", () => {
    const copy = REPORT_V4_FANTASY[name]!;
    const practiceFree = copy.cuts?.practiceFree ?? FANTASY_PRACTICE_FREE_BLOCKS;
    expect(practiceFree).toBeLessThan(copy.practice.length);
    const view = buildFantasy(name, { locked: true });
    // Null only where the practice tendencies have no table for the archetype.
    expect(view).not.toBeNull();
    const free = copy.practice.slice(0, practiceFree).map(text).join(" ");
    if (!copy.practiceTeaser) {
      for (const block of view!.practice.teaser!) expect(free).toContain(text(block));
    }
  });

  // lockedBlurCopy2609.test.ts holds this for Spark Seeker; the table is each archetype's own
  // (report-practice-tendencies), so it is held for each.
  it("Fantasy vs. Reality, locked: no row past the ones the table draws, no note under the lock", () => {
    const view = buildFantasy(name, { locked: true })!;
    const groups = reportPracticeTendencies[name]!.groups;
    const table = JSON.stringify(view.table);
    const payload = JSON.stringify(view);
    view.table.categories.forEach((category, index) => {
      for (const row of groups[index]!.rows.slice(category.rows.length)) {
        expect(table, row.practice).not.toContain(JSON.stringify(row.practice));
      }
      for (const row of groups[index]!.rows.slice(category.blurredFrom)) {
        if (row.description) expect(payload, row.practice).not.toContain(row.description);
      }
    });
  });
});
