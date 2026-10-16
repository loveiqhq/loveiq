import { describe, expect, it } from "vitest";
import {
  STALE_DAYS,
  assess,
  briefLine,
  dueDate,
  healthChunkBody,
  type PlanItem,
} from "@features/brain/server/plan";
import { MAX_BODY_CHARS } from "@features/brain/server/ingest/upsert";

const NOW = Date.parse("2026-09-12T00:00:00Z");
const TODAY = "2026-09-12";
const daysAgo = (n: number) => new Date(NOW - n * 86_400_000).toISOString();

const task = (meta: Record<string, unknown>, title = "a task") => ({
  source_id: `task:${title}`,
  title: `Notion task: ${title}`,
  meta: { kind: "task", database: "Board", edited: daysAgo(1), ...meta },
});

describe("dueDate — a Notion date property is not always a date", () => {
  /**
   * MEASURED 2026-09-12: 27 of the 205 due values on the board are RANGES, because
   * Notion lets a date property hold one. Casting blindly throws, which would take out
   * the whole health check over one card.
   */
  it("takes the last date of a range, which is the deadline it implies", () => {
    expect(dueDate("2025-12-19 to 2025-12-26")).toBe("2025-12-26");
  });

  it("reads a plain date, and refuses anything that is not one", () => {
    expect(dueDate("2026-09-01")).toBe("2026-09-01");
    expect(dueDate("next week")).toBeNull();
    expect(dueDate(null)).toBeNull();
    expect(dueDate("")).toBeNull();
  });
});

describe("assess", () => {
  it(`flags an open task untouched for ${STALE_DAYS}+ days, and leaves recent work alone`, () => {
    const h = assess(
      [
        task({ state: "open", edited: daysAgo(40) }, "stale one"),
        task({ state: "open", edited: daysAgo(3) }, "being worked on"),
      ],
      TODAY,
      NOW
    );
    expect(h.stale.map((s) => s.title)).toEqual(["stale one"]);
    expect(h.stale[0].idleDays).toBe(40);
  });

  it("never flags a task that is not open, however old", () => {
    // Backlog is `idea`, and an idea nobody has started is not slipping — it is a
    // backlog item. Measured: the backlog averages 33 days idle by its nature.
    const h = assess(
      [
        task({ state: "idea", edited: daysAgo(300) }, "old idea"),
        task({ state: "done", edited: daysAgo(300) }, "long finished"),
      ],
      TODAY,
      NOW
    );
    expect(h.stale).toHaveLength(0);
    expect(h.openCount).toBe(0);
  });

  /**
   * OVERDUE MEANS OPEN AND PAST ITS DATE.
   *
   * MEASURED: 169 board tasks are past a due date they still carry — 148 DONE (4 of
   * them with no completion date at all), 10 unstarted ideas, and only 11 genuinely
   * open. Keying on "past due with no completion stamp" would flag 25 and be wrong
   * about 14, which is how a report stops being read.
   */
  it("counts only OPEN tasks as overdue, not finished ones missing a completion date", () => {
    const h = assess(
      [
        task({ state: "open", due: "2026-09-01" }, "really overdue"),
        task({ state: "done", due: "2026-09-01", completed: null }, "done, no stamp"),
        task({ state: "idea", due: "2026-09-01" }, "unstarted idea"),
      ],
      TODAY,
      NOW
    );
    expect(h.overdue.map((o) => o.title)).toEqual(["really overdue"]);
  });

  it("does not throw on a range-valued due date, and reads its end", () => {
    const h = assess(
      [task({ state: "open", due: "2026-08-01 to 2026-09-01" }, "ranged")],
      TODAY,
      NOW
    );
    expect(h.overdue[0]?.due).toBe("2026-09-01");
  });

  it("treats a future due date as not overdue", () => {
    const h = assess([task({ state: "open", due: "2026-12-01" })], TODAY, NOW);
    expect(h.overdue).toHaveLength(0);
  });

  it("survives a task with no edited timestamp instead of calling it infinitely idle", () => {
    const h = assess([task({ state: "open", edited: null })], TODAY, NOW);
    expect(h.stale).toHaveLength(0);
    expect(h.openCount).toBe(1);
  });
});

describe("briefLine — silence on a healthy day", () => {
  it("says nothing when nothing is slipping", () => {
    expect(briefLine({ openCount: 5, stale: [], overdue: [] })).toBeNull();
  });

  it("says nothing when the board could not be read, rather than 'all clear'", () => {
    /**
     * An unreadable board and a healthy board are different states, and reporting the
     * first as the second is the failure this file spends its comments on.
     *
     * The stale list is deliberately NON-EMPTY. The first version passed empty arrays,
     * so deleting the `unavailable` guard entirely still returned null — via the
     * "nothing is slipping" branch — and the mutation went uncaught. The assertion was
     * right and could not tell the two paths apart.
     */
    expect(
      briefLine({
        openCount: 0,
        stale: [{ title: "stale", assignee: null, idleDays: 99, sourceId: "notion/x" }],
        overdue: [],
        unavailable: "the board could not be read (500)",
      })
    ).toBeNull();
  });

  it("names the worst offender when something is slipping", () => {
    const line = briefLine({
      openCount: 9,
      stale: [
        { title: "Find a weekly slot?", assignee: "Mark", idleDays: 78, sourceId: "notion/x" },
      ],
      overdue: [],
    });
    expect(line).toContain("78 days");
    expect(line).toContain("Find a weekly slot?");
  });
});

describe("healthChunkBody", () => {
  it("says 'none' rather than going quiet when nothing is slipping", () => {
    // A chunk that omits the section on a healthy week makes "is anything slipping"
    // unanswerable exactly when the answer is "no".
    const body = healthChunkBody({ openCount: 7, stale: [], overdue: [] });
    expect(body).toContain("7 tasks are open");
    expect(body).toContain("none — every open task has moved recently");
  });

  it("says the board could not be read rather than reporting an empty board", () => {
    const body = healthChunkBody({ openCount: 0, stale: [], overdue: [], unavailable: "a 500" });
    expect(body).toContain("could not be read");
    expect(body).not.toContain("0 tasks are open");
  });

  // Titles as long as `assess` lets them be (110), so the lists are as wide as they get.
  const task = (i: number, extra: Partial<PlanItem>): PlanItem => ({
    title: `Task ${i} `.padEnd(110, "x"),
    assignee: "Marcus Hartmann, Mark Oldenburg",
    sourceId: `notion/t${i}`,
    ...extra,
  });
  const listed = (body: string, prefix: string) =>
    body.split("\n").filter((l) => l.startsWith(prefix)).length;
  const more = (body: string) => [...body.matchAll(/…and (\d+) more/g)].map((m) => Number(m[1]));

  it("fits under the write path's cut and keeps the definition when the board is long", () => {
    // 2026-10-05: 21 overdue tasks made a 2,529-character body, and the cut at 2,400
    // removed the definition of "overdue" while the heading still claimed all 21.
    expect(MAX_BODY_CHARS).toBe(2400);
    const overdue = Array.from({ length: 30 }, (_, i) => task(i, { due: "2026-09-01" }));
    const body = healthChunkBody({ openCount: 40, stale: [], overdue });
    expect(body.length).toBeLessThanOrEqual(2400);
    expect(body).toContain("open AND past its date");
    expect(body).toContain("Past their due date and still open (30):");
    const shown = listed(body, "  due ");
    expect(shown).toBeGreaterThan(0);
    expect(shown).toBeLessThan(30);
    expect(more(body)).toEqual([30 - shown]);
  });

  it("shares the room between the two lists and counts what each left out", () => {
    const stale = Array.from({ length: 25 }, (_, i) => task(i, { idleDays: 30 + i }));
    const overdue = Array.from({ length: 25 }, (_, i) => task(100 + i, { due: "2026-09-01" }));
    const body = healthChunkBody({ openCount: 50, stale, overdue });
    expect(body.length).toBeLessThanOrEqual(2400);
    const s = listed(body, "  ") - listed(body, "  due ") - listed(body, "  …and");
    const o = listed(body, "  due ");
    expect(s).toBeGreaterThan(0);
    expect(o).toBeGreaterThan(0);
    expect(more(body)).toEqual([25 - s, 25 - o]);
  });

  it("lists everything, with no 'more' line, when the board is short", () => {
    const overdue = [task(1, { due: "2026-09-01" }), task(2, { due: "2026-09-02" })];
    const body = healthChunkBody({ openCount: 5, stale: [], overdue });
    expect(listed(body, "  due ")).toBe(2);
    expect(more(body)).toEqual([]);
  });
});
