import { describe, expect, it } from "vitest";
import {
  MAX_RELATED,
  MIN_SHARED_PEOPLE,
  WINDOW_DAYS,
  pickRelated,
  renderRelated,
} from "@features/brain/server/related";

const rec = (
  id: string,
  people: string[],
  period_end: string | null,
  source = "drive",
  title = id
) => ({ source_id: id, source, title, period_end, meta: { people } });

const PEOPLE = ["Ann", "Bo", "Cy"];
const DAY = "2026-09-09";

describe("pickRelated", () => {
  it("needs two people in common, not one", () => {
    // One shared colleague in a company of five is not a signal; it is everybody.
    const out = pickRelated(PEOPLE, DAY, "drive/anchor", [
      rec("one", ["Ann"], DAY),
      rec("two", ["Ann", "Bo"], DAY),
    ]);
    expect(out.map((r) => r.sourceId)).toEqual(["drive/two"]);
    expect(MIN_SHARED_PEOPLE).toBe(2);
  });

  it(`stays inside ${WINDOW_DAYS} days on either side`, () => {
    const out = pickRelated(PEOPLE, DAY, "drive/anchor", [
      rec("near", ["Ann", "Bo"], "2026-09-11"),
      rec("far", ["Ann", "Bo"], "2026-09-20"),
      rec("before", ["Ann", "Bo"], "2026-09-07"),
    ]);
    expect(out.map((r) => r.sourceId).sort()).toEqual(["drive/before", "drive/near"]);
  });

  it("never returns the anchor itself", () => {
    const out = pickRelated(PEOPLE, DAY, "drive/anchor", [rec("anchor", PEOPLE, DAY)]);
    expect(out).toHaveLength(0);
  });

  it("drops an undated record rather than guessing where it sits", () => {
    const out = pickRelated(PEOPLE, DAY, "drive/anchor", [rec("undated", ["Ann", "Bo"], null)]);
    expect(out).toHaveLength(0);
  });

  /**
   * MEASURED on the first real run: the top six results were all gmail, and three of them
   * were separate thread ids carrying the identical subject — one test blast filling half
   * the answer. Gmail is 8,487 of 22,951 chunks, so "who else was around" is answered
   * entirely by email unless it is capped; `retrieve()` holds a per-source share for the
   * same reason.
   */
  it("counts three copies of one subject as one connection", () => {
    const out = pickRelated(PEOPLE, DAY, "drive/anchor", [
      rec("t1", ["Ann", "Bo"], DAY, "gmail", "same subject"),
      rec("t2", ["Ann", "Bo"], DAY, "gmail", "same subject"),
      rec("t3", ["Ann", "Bo"], DAY, "gmail", "same subject"),
    ]);
    expect(out).toHaveLength(1);
  });

  it("does not let one source fill the whole list", () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      rec(`g${i}`, ["Ann", "Bo"], DAY, "gmail", `subject ${i}`)
    );
    const out = pickRelated(PEOPLE, DAY, "drive/anchor", [
      ...many,
      rec("n1", ["Ann", "Bo"], DAY, "notion", "a task"),
    ]);
    expect(out.filter((r) => r.source === "gmail").length).toBeLessThan(out.length);
    expect(out.some((r) => r.source === "notion")).toBe(true);
    expect(out.length).toBeLessThanOrEqual(MAX_RELATED);
  });

  it("puts the strongest overlap first, then the closest in time", () => {
    const out = pickRelated(PEOPLE, DAY, "drive/anchor", [
      rec("two-people-far", ["Ann", "Bo"], "2026-09-12"),
      rec("three-people", ["Ann", "Bo", "Cy"], "2026-09-12"),
      rec("two-people-near", ["Ann", "Bo"], DAY),
    ]);
    expect(out.map((r) => r.sourceId)).toEqual([
      "drive/three-people",
      "drive/two-people-near",
      "drive/two-people-far",
    ]);
  });
});

describe("renderRelated", () => {
  const base = {
    anchor: { sourceId: "drive/a", title: "A meeting", people: PEOPLE, periodEnd: DAY },
    note: "the note",
  };

  /**
   * THE WORD THAT KEEPS THIS HONEST. `ingest/link.ts` makes the point about its own
   * window: a wrong link attributes one meeting's attendees to another meeting's
   * decisions, silently. These are inferred from co-occurrence, so every line says
   * `possible` and prints what it inferred from.
   */
  it("calls every result POSSIBLE, and shows what it inferred from", () => {
    const out = renderRelated({
      ...base,
      related: [
        {
          sourceId: "notion/t1",
          source: "notion",
          title: "a task",
          periodEnd: DAY,
          shared: ["Ann", "Bo"],
          dayGap: 1,
        },
      ],
    });
    expect(out).toContain("possible — shares 2 (Ann, Bo), 1 day apart");
    expect(out).not.toContain("linked:");
  });

  it("explains an empty result instead of returning a bare nothing", () => {
    const out = renderRelated({ ...base, related: [], note: "nothing within 3 days" });
    expect(out).toContain("nothing within 3 days");
    expect(out).toContain("A meeting");
  });
});
