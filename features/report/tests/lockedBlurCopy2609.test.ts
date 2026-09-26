import { describe, expect, it } from "vitest";
import { buildAccelerators, REPORT_V4_ACCELERATORS } from "@/data/report3-accelerators";
import {
  buildFantasy,
  FANTASY_BLURRED_ROWS,
  FANTASY_CLEAR_ROWS,
  FANTASY_CLOSED_BLURRED_ROWS,
  FANTASY_LOCKED_OPEN_CATEGORIES,
  REPORT_V4_FANTASY,
} from "@/data/report3-fantasy";
import { buildPartnership, REPORT_V4_PARTNERSHIP } from "@/data/report3-partnership";
import {
  buildTypicalBeliefs,
  REPORT_V4_TYPICAL_BELIEFS,
  TYPICAL_BELIEFS_CHALLENGES,
  TYPICAL_BELIEFS_CHALLENGES_FREE_BLOCKS,
  TYPICAL_BELIEFS_FREE_ROWS,
  TYPICAL_BELIEFS_PRACTICE,
  TYPICAL_BELIEFS_PRACTICE_FREE_BLOCKS,
} from "@/data/report3-typical-beliefs";
import type { Report3Block } from "@/data/report3-learn-more";
import { reportPracticeTendencies } from "@/data/report-practice-tendencies";
import { getFantasyMapDots } from "@features/report/server/fantasyMap";

/**
 * What a locked reader receives under the blur since review 26.09 — the switch's
 * default position (lockedBlurCopy.ts, "real").
 *
 * Mark: "I can read the blurred pieces and the scores. Also the blurred items are
 * gibberish ('Experienced diece')… This should always be the unlocked content but
 * blurred." Fatih: real paid content, as Mark asked, under a stronger blur. So every
 * block, row and score the page draws blurred is now the copy itself — and only
 * what the page draws: the fantasy rows past the ones shown, and the notes of the
 * rows under the lock, still never leave the server. The decoy position stays
 * pinned by the chapters' own gating tests.
 */

const textOf = (block: Report3Block): string =>
  block.kind === "heading"
    ? block.text
    : block.kind === "para"
      ? block.runs.map((r) => r.text).join("")
      : block.items.map((runs) => runs.map((r) => r.text).join("")).join(" ");
const texts = (blocks: readonly Report3Block[]) => blocks.map(textOf);

describe("Accelerators & Brakes, locked — the blurred rows and passages are the real ones", () => {
  const copy = REPORT_V4_ACCELERATORS["Spark Seeker"]!;
  const view = buildAccelerators("Spark Seeker", { locked: true })!;

  it("sends rows 3-5 of both cards as written, still marked locked from row 3", () => {
    expect(view.lockedFrom).toBe(2);
    expect(view.brakes).toEqual(copy.brakes);
    expect(view.accelerators).toEqual(copy.accelerators);
  });

  it("sends Common challenges and the practice past their ramps as written", () => {
    expect(texts([view.challenges.ramp!, ...view.challenges.rest])).toEqual(
      texts(copy.challenges.slice(1))
    );
    expect(texts([view.practice.ramp!, ...view.practice.rest])).toEqual(
      texts(copy.practice.slice(1))
    );
  });
});

describe("Typical Beliefs, locked — the rows under the full blur are the real ones", () => {
  const panels = REPORT_V4_TYPICAL_BELIEFS["Spark Seeker"]!;
  const view = buildTypicalBeliefs("Spark Seeker", { locked: true })!;

  it("sends every shadow and belief as written, and no shift for a locked row", () => {
    expect(view.panels.turns.map((t) => t.shadow)).toEqual(panels.turns.map((t) => t.shadow));
    expect(view.panels.sun).toEqual(panels.sun);
    view.panels.turns.forEach((turn, i) => {
      // A locked row draws no shift at all, so none is sent — the wall is still
      // the page's, not only the blur's.
      if (i >= TYPICAL_BELIEFS_FREE_ROWS) expect(turn.shift).toBeNull();
    });
  });

  it("sends the gated challenges and practice as written", () => {
    expect(texts(view.challenges.rest)).toEqual(
      texts(TYPICAL_BELIEFS_CHALLENGES.slice(TYPICAL_BELIEFS_CHALLENGES_FREE_BLOCKS + 1))
    );
    expect(texts(view.practice.rest)).toEqual(
      texts(TYPICAL_BELIEFS_PRACTICE.slice(TYPICAL_BELIEFS_PRACTICE_FREE_BLOCKS + 1))
    );
  });
});

describe("Challenges in Partnerships, locked — the gated body, loop and closing are the real ones", () => {
  const copy = REPORT_V4_PARTNERSHIP["Spark Seeker"]!;
  const view = buildPartnership("Spark Seeker", { locked: true })!;

  it("sends the body past its ramp, the loop's lines and the closing as written", () => {
    expect(texts([view.body.ramp!, ...view.body.rest])).toEqual(texts(copy.body.slice(4)));
    expect(view.loop).toEqual(copy.loop);
    expect(view.result).toEqual(copy.result);
  });
});

describe("Fantasy vs. Reality, locked — the blurred rows, their scores and the map are real", () => {
  const copy = REPORT_V4_FANTASY["Spark Seeker"]!;
  const view = buildFantasy("Spark Seeker", { locked: true })!;
  const groups = reportPracticeTendencies["Spark Seeker"]!.groups;
  const payload = JSON.stringify(view);

  it("sends Common challenges as written", () => {
    expect(view.challenges).toEqual(copy.challenges);
  });

  it("sends the blurred rows' real names and scores, and no note for them", () => {
    view.table.categories.forEach((category, index) => {
      const authored = groups[index]!.rows;
      const open = index < FANTASY_LOCKED_OPEN_CATEGORIES;
      const drawn = open ? FANTASY_CLEAR_ROWS + FANTASY_BLURRED_ROWS : FANTASY_CLOSED_BLURRED_ROWS;
      expect(category.rows).toHaveLength(Math.min(drawn, authored.length));
      category.rows.forEach((row, i) => {
        expect(row.practice).toBe(authored[i]!.practice);
        expect(row.pull).toBe(authored[i]!.fantasyPull);
        expect(row.pleasure).toBe(authored[i]!.actualPleasure);
        if (i >= category.blurredFrom) expect(row.description).toBeNull();
      });
    });
  });

  it("still sends nothing past the rows it draws — 'Unlock all 11 fantasies' hides the rest", () => {
    // The table's own rows: the map draws sixteen fantasies of its own (below), so a
    // name can be on the page there without being one of the table's hidden rows.
    const table = JSON.stringify(view.table);
    view.table.categories.forEach((category, index) => {
      for (const row of groups[index]!.rows.slice(category.rows.length)) {
        expect(table, row.practice).not.toContain(JSON.stringify(row.practice));
      }
      // No blurred or undrawn row's note anywhere in the payload.
      for (const row of groups[index]!.rows.slice(category.blurredFrom)) {
        if (row.description) expect(payload, row.practice).not.toContain(row.description);
      }
    });
  });

  it("places the map's real dots, blurred on the page, instead of V2's illustrative layout", () => {
    expect(view.mapDots).toEqual(getFantasyMapDots("Spark Seeker"));
  });
});
