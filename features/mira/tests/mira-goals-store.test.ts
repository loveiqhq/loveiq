import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@features/admin/server/supabase", () => ({ supabaseFetch: vi.fn() }));

import { supabaseFetch } from "@features/admin/server/supabase";
import {
  MAX_ACTIVE_GOALS,
  createGoal,
  deleteGoal,
  deleteGoals,
  goalsForPrompt,
  listGoals,
  setTick,
  updateGoal,
} from "@features/mira/server/goals";

/** Challenges & goals: every read and write is the signed-in person's own (mira_goal, mira_goal_log). */

const LEA = "6f2c4a1e-1111-4222-8333-944455556666";
const GOAL = "0b7d1f3a-2222-4333-8444-955566667777";
const row = (over: Record<string, unknown> = {}) => ({
  id: GOAL,
  challenge: "body-confidence",
  text: "Leave one soft light on for the first minute",
  weekly_target: 3,
  via: "mira",
  created_at: "2026-11-02T09:00:00Z",
  archived_at: null,
  completed_at: null,
  ...over,
});

/** Answers each call by its "METHOD path" prefix; anything else is an empty 200. */
let answers: Array<[prefix: string, status: number, body: unknown]>;
const calls = () =>
  vi.mocked(supabaseFetch).mock.calls.map(([path, init]) => ({
    call: `${init?.method ?? "GET"} ${path}`,
    body: init?.body ? JSON.parse(String(init.body)) : undefined,
  }));

beforeEach(() => {
  vi.clearAllMocks();
  answers = [];
  vi.mocked(supabaseFetch).mockImplementation(async (path: string, init = {}) => {
    const call = `${init.method ?? "GET"} ${path}`;
    const hit = answers.find(([prefix]) => call.startsWith(prefix));
    return new Response(JSON.stringify(hit ? hit[2] : []), { status: hit ? hit[1] : 200 });
  });
});

describe("listGoals", () => {
  it("reads only the person's goals, each with the days it was ticked", async () => {
    answers = [["GET /rest/v1/mira_goal?", 200, [{ ...row(), log: [{ day: "2026-11-21" }] }]]];
    const goals = await listGoals(LEA);
    expect(calls()[0]!.call).toContain(`user_id=eq.${LEA}`);
    expect(goals).toEqual([{ ...row(), days: ["2026-11-21"] }]);
  });

  it("fails loudly when the table can't be read, rather than showing no goals", async () => {
    answers = [["GET /rest/v1/mira_goal?", 503, {}]];
    await expect(listGoals(LEA)).rejects.toThrow();
  });
});

describe("createGoal", () => {
  it("adds the goal to the person's account", async () => {
    answers = [["POST /rest/v1/mira_goal", 201, [row()]]];
    const made = await createGoal(LEA, { text: "Walk", weeklyTarget: 3, via: "hand" });
    expect(made).toMatchObject({ goal: { id: GOAL, days: [] }, existing: false });
    const insert = calls().find((c) => c.call.startsWith("POST"))!;
    expect(insert.body).toEqual({ user_id: LEA, text: "Walk", weekly_target: 3, via: "hand" });
  });

  it("keeps a few goals on the go, not a list: none past the cap", async () => {
    const active = Array.from({ length: MAX_ACTIVE_GOALS }, (_, i) => ({
      ...row({ id: `g${i}`, text: `Goal ${i}` }),
      log: [],
    }));
    answers = [["GET /rest/v1/mira_goal?", 200, active]];
    expect(await createGoal(LEA, { text: "One more", weeklyTarget: null, via: "hand" })).toBe(
      "full"
    );
    expect(calls().some((c) => c.call.startsWith("POST"))).toBe(false);
    expect(calls()[0]!.call).toContain(`user_id=eq.${LEA}`);
    expect(calls()[0]!.call).toContain("archived_at=is.null&completed_at=is.null");
  });

  it("gives back the goal on the go with the same words, any case, instead of a second", async () => {
    answers = [
      [
        "GET /rest/v1/mira_goal?",
        200,
        [{ ...row({ text: "Walk ten minutes" }), log: [{ day: "2026-11-21" }] }],
      ],
    ];
    // "Add as a goal" tapped twice, or on two devices.
    const made = await createGoal(LEA, { text: "walk TEN minutes", weeklyTarget: 2, via: "mira" });
    expect(made).toMatchObject({ goal: { id: GOAL, days: ["2026-11-21"] }, existing: true });
    expect(calls().some((c) => c.call.startsWith("POST"))).toBe(false);
  });
});

describe("updateGoal", () => {
  it("changes only the person's own goal, and says when it isn't theirs", async () => {
    answers = [["PATCH /rest/v1/mira_goal?", 200, []]];
    expect(await updateGoal(LEA, GOAL, { text: "Walk twice" })).toBe("missing");
    const patch = calls().find((c) => c.call.startsWith("PATCH"))!;
    expect(patch.call).toContain(`id=eq.${GOAL}`);
    expect(patch.call).toContain(`user_id=eq.${LEA}`);
    expect(patch.body).toEqual({ text: "Walk twice" });
    expect(await updateGoal(LEA, "not-a-uuid", { text: "x" })).toBe("missing");
  });

  it("puts a goal away or marks it done with the time, and brings it back", async () => {
    answers = [
      ["GET /rest/v1/mira_goal?id=eq.", 200, [row({ archived_at: "2026-11-20T10:00:00Z" })]],
      ["PATCH /rest/v1/mira_goal?", 200, [row()]],
    ];
    await updateGoal(LEA, GOAL, { archived: true, weeklyTarget: null });
    await updateGoal(LEA, GOAL, { completed: true });
    await updateGoal(LEA, GOAL, { archived: false });
    const bodies = calls()
      .filter((c) => c.call.startsWith("PATCH"))
      .map((c) => c.body);
    expect(bodies[0]).toEqual({ archived_at: expect.any(String), weekly_target: null });
    expect(Date.parse(bodies[0].archived_at)).not.toBeNaN();
    expect(bodies[1]).toEqual({ completed_at: expect.any(String) });
    expect(bodies[2]).toEqual({ archived_at: null });
  });

  it("brings a goal back only within the cap", async () => {
    const active = Array.from({ length: MAX_ACTIVE_GOALS }, (_, i) => ({
      ...row({ id: `g${i}`, text: `Goal ${i}` }),
      log: [],
    }));
    answers = [
      ["GET /rest/v1/mira_goal?id=eq.", 200, [row({ completed_at: "2026-11-20T10:00:00Z" })]],
      ["GET /rest/v1/mira_goal?user_id=eq.", 200, active],
    ];
    expect(await updateGoal(LEA, GOAL, { completed: false })).toBe("full");
    expect(calls().some((c) => c.call.startsWith("PATCH"))).toBe(false);
  });
});

describe("deleting goals", () => {
  it("deletes one of the person's goals, and says when there was none of theirs", async () => {
    answers = [["DELETE /rest/v1/mira_goal?", 200, []]];
    expect(await deleteGoal(LEA, GOAL)).toBe(false);
    expect(calls()[0]!.call).toContain(`id=eq.${GOAL}&user_id=eq.${LEA}`);
    answers = [["DELETE /rest/v1/mira_goal?", 200, [{ id: GOAL }]]];
    expect(await deleteGoal(LEA, GOAL)).toBe(true);
  });

  it("deletes all of them (and so their ticks) for the goals page and the under-18 stop", async () => {
    await deleteGoals(LEA);
    expect(calls()).toEqual([
      { call: `DELETE /rest/v1/mira_goal?user_id=eq.${LEA}`, body: undefined },
    ]);
  });
});

describe("setTick", () => {
  const mine = ["GET /rest/v1/mira_goal?", 200, [row()]] as [string, number, unknown];
  const writes = () => calls().filter((c) => !c.call.startsWith("GET "));

  it("ticks a day once, however often it is tapped, in the person's name", async () => {
    answers = [mine];
    expect(await setTick(LEA, GOAL, "2026-11-21", true)).toBe("ticked");
    expect(calls()[0]!.call).toContain(`/rest/v1/mira_goal?id=eq.${GOAL}&user_id=eq.${LEA}&`);
    const [tick] = writes();
    expect(tick!.call).toBe("POST /rest/v1/mira_goal_log?on_conflict=goal_id,day");
    expect(tick!.body).toEqual({ goal_id: GOAL, user_id: LEA, day: "2026-11-21" });
    const init = vi.mocked(supabaseFetch).mock.calls[1]![1]!;
    expect(init.headers).toMatchObject({ Prefer: "resolution=ignore-duplicates" });
  });

  it("finds no goal of someone else's, even one its owner ticked that day, and writes nothing", async () => {
    // The person's scope has no such goal: their answer is a random id's (round-2 audit DATA-2).
    for (const done of [true, false]) {
      expect(await setTick(LEA, GOAL, "2026-11-21", done)).toBe("missing");
    }
    expect(writes()).toEqual([]);
  });

  it("ticks no goal that was put away or done, as a tab opened before may still offer it", async () => {
    for (const over of [
      { archived_at: "2026-11-21T08:00:00Z" },
      { completed_at: "2026-11-21T08:00:00Z" },
    ]) {
      answers = [["GET /rest/v1/mira_goal?", 200, [row(over)]]];
      expect(await setTick(LEA, GOAL, "2026-11-21", true)).toBe("inactive");
      expect(await setTick(LEA, GOAL, "2026-11-21", false)).toBe("inactive");
    }
    expect(writes()).toEqual([]);
  });

  it("refuses a tick whose goal went between the read and the write (the composite key)", async () => {
    answers = [mine, ["POST /rest/v1/mira_goal_log", 409, { code: "23503" }]];
    expect(await setTick(LEA, GOAL, "2026-11-21", true)).toBe("missing");
  });

  it("takes a tick back only from the person's own goal and day", async () => {
    answers = [mine];
    expect(await setTick(LEA, GOAL, "2026-11-21", false)).toBe("ticked");
    expect(writes()[0]!.call).toBe(
      `DELETE /rest/v1/mira_goal_log?goal_id=eq.${GOAL}&user_id=eq.${LEA}&day=eq.2026-11-21`
    );
  });
});

describe("goalsForPrompt", () => {
  it("tells Mira of the goals on the go only, with this week as the person lives it", async () => {
    answers = [
      [
        "GET /rest/v1/mira_goal?",
        200,
        [
          // Ticked on Saturday 21 and Sunday 22 Nov, in the week of Monday 16 Nov.
          { ...row(), log: [{ day: "2026-11-22" }, { day: "2026-11-21" }] },
          {
            ...row({ id: "done", text: "Done one", completed_at: "2026-11-10T10:00:00Z" }),
            log: [],
          },
          {
            ...row({ id: "away", text: "Away one", archived_at: "2026-11-10T10:00:00Z" }),
            log: [],
          },
        ],
      ],
    ];
    // Sunday 22 Nov, 23:30 UTC: still Sunday in London, already Monday 23 Nov in Berlin.
    const now = new Date("2026-11-22T23:30:00Z");
    const goal = { text: "Leave one soft light on for the first minute", target: 3 };
    expect(await goalsForPrompt(LEA, "Europe/London", now)).toEqual([
      { ...goal, thisWeek: 2, daysSinceLast: 0 },
    ]);
    expect(await goalsForPrompt(LEA, "Europe/Berlin", now)).toEqual([
      { ...goal, thisWeek: 0, daysSinceLast: 1 },
    ]);
  });
});
