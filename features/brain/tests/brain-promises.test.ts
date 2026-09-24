import { describe, expect, it } from "vitest";
import {
  boardMatcher,
  meetingOf,
  parseNextSteps,
  renderPromises,
  toBoardTask,
  type BoardTask,
  type MeetingPromise,
} from "@features/brain/server/promises";

const NOTES = [
  "Summary",
  "* [Mark Oldenburg] Not a next step: this bullet sits above the heading.",
  "Next steps",
  "* [Mark Oldenburg, Sanjin Kacevac] Finalize Content: Finalize the fantasy versus reality chapter.",
  "* [The group] Review Chapters: Review four chapters of content across archetypes.",
  "",
  "* [Eman Cickusic] Fix Tagging: Investigate why tagging fails in Figma.",
  "Want to see more? View the full notes",
  "* [Fatih Hadzic] Also not one: this comes after the list ended.",
].join("\n");

describe("parseNextSteps", () => {
  it("reads only the list under the heading, one owner list per item, and stops where it ends", () => {
    expect(parseNextSteps(NOTES)).toEqual([
      {
        owners: ["Mark Oldenburg", "Sanjin Kacevac"],
        title: "Finalize Content",
        detail: "Finalize the fantasy versus reality chapter.",
      },
      {
        owners: ["The group"],
        title: "Review Chapters",
        detail: "Review four chapters of content across archetypes.",
      },
      {
        owners: ["Eman Cickusic"],
        title: "Fix Tagging",
        detail: "Investigate why tagging fails in Figma.",
      },
    ]);
  });

  it("finds nothing in notes without a next-steps heading", () => {
    expect(parseNextSteps("* [Mark Oldenburg] Task: do it.")).toEqual([]);
  });
});

describe("meetingOf", () => {
  it("takes the meeting's own day from the title, and the name without the time", () => {
    expect(
      meetingOf(
        "Meeting notes: Report Content Synch - 2026/09/17 17:27 WEST - Notes by Gemini (part 2 of 37)",
        "2026-09-18"
      )
    ).toEqual({ name: "Report Content Synch", date: "2026-09-17" });
    expect(meetingOf("Drive: Something else", "2026-09-18")).toEqual({
      name: "Drive: Something else",
      date: "2026-09-18",
    });
  });
});

describe("renderPromises", () => {
  const p = (owners: string[], title: string): MeetingPromise => ({
    owners,
    title,
    detail: "x.",
    meeting: "LoveIQ Sync",
    date: "2026-09-24",
    id: "drive/doc:a",
    url: null,
  });

  it("gives a person their own items plus the group's, and nobody else's", () => {
    const out = renderPromises(
      [p(["Mark Oldenburg"], "Mine"), p(["The group"], "Ours"), p(["Eman Cickusic"], "Theirs")],
      "Mark Oldenburg"
    );
    expect(out).toContain("Mine");
    expect(out).toContain("Ours");
    expect(out).not.toContain("Theirs");
  });

  it("says when a person has nothing, pointing at the spelling", () => {
    expect(renderPromises([p(["Mark Oldenburg"], "Mine")], "Mark")).toMatch(
      /Check the exact spelling/
    );
  });
});

const promise = (owners: string[], title: string, detail: string, date = "2026-09-21") =>
  ({
    owners,
    title,
    detail,
    meeting: "LoveIQ Sync",
    date,
    id: "drive/doc:a",
    url: null,
  }) as MeetingPromise;

const task = (over: Partial<BoardTask>): BoardTask => ({
  title: "Untitled",
  url: "https://app.notion.com/p/t",
  status: "Backlog",
  state: "open",
  due: null,
  owners: [],
  finished: null,
  ...over,
});

describe("toBoardTask", () => {
  it("reads the owners from the people, the assignee and a '<Name> - WIP' status", () => {
    const t = toBoardTask({
      title: "Notion task (Done): add posthog to notion",
      url: "u",
      meta: {
        status: "Sanjin - WIP",
        state: "open",
        people: ["Mark Oldenburg"],
        assignee: "Eman Cickusic",
        edited: "2026-09-19T10:00:00.000Z",
      },
    });
    expect(t.title).toBe("add posthog to notion");
    expect(t.owners.sort()).toEqual(["eman", "mark", "sanjin"]);
    expect(t.finished).toBe("2026-09-19");
  });

  it("dates a finished task by its completion before its last edit", () => {
    const t = toBoardTask({
      title: "x",
      url: null,
      meta: { completed: "2026-09-10T00:00:00Z", edited: "2026-09-20T00:00:00Z" },
    });
    expect(t.finished).toBe("2026-09-10");
  });
});

/** A board big enough that a word on one task is rare, as it is on the real one (399). */
const FILLER = Array.from({ length: 100 }, (_, n) => task({ title: `filler item ${n}` }));
const matchOn = (p: MeetingPromise, ...candidates: BoardTask[]) =>
  boardMatcher([...candidates, ...FILLER])(p);

describe("boardMatcher", () => {
  const redesign = promise(
    ["Eman Cickusic"],
    "Redesign Survey",
    "Redesign survey sections where specific feedback or tags were provided."
  );

  it("finds the owner's task when most of its title is in the promise", () => {
    const mine = task({ title: "redesign te survey where tagged", owners: ["eman"] });
    expect(matchOn(redesign, mine)).toBe(mine);
  });

  it("needs more than half of an owned task's title", () => {
    const wide = task({ title: "redesign survey pricing funnel onboarding", owners: ["eman"] });
    expect(matchOn(redesign, wide)).toBeNull();
  });

  /** Dormant while the board is small: one word's weight passes INFO past ~1,330 tasks. */
  it("never matches on one word, however rare", () => {
    const p = promise(["Mark Oldenburg"], "Conditionality", "Build the conditionality.");
    const t = task({ title: "conditionality", owners: ["mark"] });
    const big = Array.from({ length: 1500 }, (_, n) => task({ title: `filler item ${n}` }));
    expect(boardMatcher([t, ...big])(p)).toBeNull();
  });

  it("never matches somebody else's task, whatever words it shares", () => {
    expect(
      matchOn(redesign, task({ title: "redesign te survey where tagged", owners: ["mark"] }))
    ).toBeNull();
  });

  it("lets a promise given to the whole group match anyone's task", () => {
    const t = task({ title: "update due dates : )", owners: ["mark"] });
    const p = promise(
      ["The group"],
      "Update Due Dates",
      "Update all pending due dates on the board."
    );
    expect(matchOn(p, t)).toBe(t);
  });

  it("asks more of a task nobody owns", () => {
    const p = promise(["Mark Oldenburg"], "Staging", "Look at the staging report elements.");
    const most = task({ title: "staging report environment elements" }); // 3 of 4 words
    expect(matchOn(p, most)).toBe(most);
    expect(matchOn(p, task({ title: "staging report environment secrets" }))).toBeNull(); // 2 of 4
    // 3 of 5 would do for an owned task, not for one nobody owns.
    expect(matchOn(p, task({ title: "staging report elements environment secrets" }))).toBeNull();
    expect(matchOn(p, task({ title: "staging checklist environment secrets" }))).toBeNull();
  });

  it("does not count a task finished before the meeting as its promise", () => {
    const p = promise(["Eman Cickusic"], "Update Notion", "Integrate PostHog docs into Notion.");
    const before = task({
      title: "add posthog docs",
      owners: ["eman"],
      state: "done",
      finished: "2026-09-01",
    });
    const after = task({
      title: "add posthog docs",
      owners: ["eman"],
      state: "done",
      finished: "2026-09-21",
    });
    expect(matchOn(p, before)).toBeNull();
    expect(matchOn(p, after)).toBe(after);
  });

  it("does not match on the words every next step shares", () => {
    const p = promise(["Mark Oldenburg"], "Review Model", "Review the model shared on WhatsApp.");
    expect(matchOn(p, task({ title: "Review shared WhatsApp", owners: ["mark"] }))).toBeNull();
  });

  /** The real case: "Discuss Figma Report" matched eleven promises in a month, all wrong. */
  it("counts a word that is all over the board for less than a rare one", () => {
    const p = promise(["Mark Oldenburg"], "Figma Report", "Go through the report in Figma.");
    const t = task({ title: "Discuss Figma Report", owners: ["mark"] });
    expect(matchOn(p, t)).toBe(t);
    const everywhere = Array.from({ length: 10 }, (_, n) =>
      task({ title: `figma report round ${n}`, owners: ["sanjin"] })
    );
    expect(matchOn(p, t, ...everywhere)).toBeNull();
  });

  it("picks the task whose title the promise covers best", () => {
    const loose = task({ title: "redesign survey pricing", owners: ["eman"] });
    const tight = task({ title: "redesign survey", owners: ["eman"] });
    expect(matchOn(redesign, loose, tight)).toBe(tight);
    expect(matchOn(redesign, tight, loose)).toBe(tight);
  });
});

describe("renderPromises against the board", () => {
  const on = (t: Partial<BoardTask>) => ({
    ...promise(["Mark Oldenburg"], "Review Staging", "Look."),
    task: task(t),
  });

  it("shows each item's board task with status, due date and an overdue flag, or that it has none", () => {
    const out = renderPromises(
      [
        on({ title: "Review staging", status: "Mark - WIP", due: "2026-09-20" }),
        { ...promise(["Mark Oldenburg"], "Untracked", "Nobody wrote it down."), task: null },
      ],
      null,
      "2026-09-24"
    );
    expect(out).toContain(
      '→ board: "Review staging" (Mark - WIP, due 2026-09-20, overdue) https://app.notion.com/p/t'
    );
    expect(out).toContain("Untracked: Nobody wrote it down. (drive/doc:a) → not on the board");
    expect(out).toMatch(
      /^On the Notion board: 1 of 2 \(0 done, 1 not done\)\. Not on the board: 1\./
    );
    expect(out).toContain("A match can be wrong");
  });

  it("does not flag a finished task as overdue", () => {
    const out = renderPromises(
      [on({ state: "done", status: "Done", due: "2026-09-01" })],
      null,
      "2026-09-24"
    );
    expect(out).not.toContain("overdue");
    expect(out).toMatch(/1 of 1 \(1 done, 0 not done\)/);
  });

  it("counts a promise with two owners once", () => {
    const two = { ...promise(["Mark Oldenburg", "Sanjin Kacevac"], "Finalize", "x."), task: null };
    expect(renderPromises([two], null, "2026-09-24")).toMatch(/0 of 1 \(0 done/);
  });
});
