import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@shared/http/csrf", () => ({ verifyCsrfToken: vi.fn().mockResolvedValue(true) }));
vi.mock("@shared/http/ratelimit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 9, resetAt: new Date() }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}));
vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@features/mira/server/session", () => ({ getMiraAccount: vi.fn() }));
vi.mock("@features/mira/server/minor", () => ({ isMinor: vi.fn().mockResolvedValue(false) }));
vi.mock("@features/mira/server/store", () => ({ logMiraEvent: vi.fn() }));
vi.mock("@features/mira/server/goals", async (actual) => ({
  ...(await actual<typeof import("@features/mira/server/goals")>()),
  listGoals: vi.fn().mockResolvedValue([]),
  createGoal: vi.fn(),
  updateGoal: vi.fn(),
  deleteGoal: vi.fn().mockResolvedValue(true),
  deleteGoals: vi.fn().mockResolvedValue(undefined),
  setTick: vi.fn().mockResolvedValue("ticked"),
}));

import { DELETE as deleteAll, GET, POST } from "@/app/api/mira/goals/route";
import { DELETE as deleteOne, PATCH } from "@/app/api/mira/goals/[id]/route";
import { POST as tick } from "@/app/api/mira/goals/[id]/log/route";
import {
  createGoal,
  deleteGoal,
  deleteGoals,
  listGoals,
  setTick,
  updateGoal,
} from "@features/mira/server/goals";
import { isMinor } from "@features/mira/server/minor";
import { getMiraAccount } from "@features/mira/server/session";
import { logMiraEvent } from "@features/mira/server/store";
import { verifyCsrfToken } from "@shared/http/csrf";
import { checkRateLimit } from "@shared/http/ratelimit";

/** Challenges & goals: the API under the card, the page and "Add as a goal". */

const LEA = { id: "6f2c4a1e-1111-4222-8333-944455556666", email: "lea@example.com" };
const GOAL = "0b7d1f3a-2222-4333-8444-955566667777";
const WORDS = "Leave one soft light on for the first minute";
const row = {
  id: GOAL,
  challenge: "body-confidence",
  text: WORDS,
  weekly_target: 3,
  via: "mira" as const,
  created_at: "2026-11-02T09:00:00Z",
  archived_at: null,
  completed_at: null,
};
const req = (method: string, path: string, body?: unknown) =>
  new Request(`http://localhost${path}`, {
    method,
    headers: { "Content-Type": "application/json", "x-csrf-token": "t" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
const params = (id = GOAL) => ({ params: Promise.resolve({ id }) });
/** Every event logged, as one string, to check no goal's words are in it. */
const logged = () => JSON.stringify(vi.mocked(logMiraEvent).mock.calls);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getMiraAccount).mockResolvedValue(LEA);
  vi.mocked(isMinor).mockResolvedValue(false);
  vi.mocked(verifyCsrfToken).mockResolvedValue(true);
  vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true, remaining: 9, resetAt: new Date() });
  vi.mocked(createGoal).mockResolvedValue({ goal: { ...row, days: [] }, existing: false });
  vi.mocked(updateGoal).mockResolvedValue(row);
});

describe("GET /api/mira/goals", () => {
  it("lists the signed-in person's goals, never cached", async () => {
    vi.mocked(listGoals).mockResolvedValueOnce([{ ...row, days: ["2026-11-21"] }]);
    const res = await GET(req("GET", "/api/mira/goals"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.json()).toEqual({ goals: [{ ...row, days: ["2026-11-21"] }] });
    expect(listGoals).toHaveBeenCalledWith(LEA.id);
  });

  it("asks to sign in, slows down, and fails with a generic message", async () => {
    vi.mocked(getMiraAccount).mockResolvedValueOnce(null);
    expect((await GET(req("GET", "/api/mira/goals"))).status).toBe(401);
    vi.mocked(checkRateLimit).mockResolvedValueOnce({
      allowed: false,
      remaining: 0,
      resetAt: new Date(),
    });
    expect((await GET(req("GET", "/api/mira/goals"))).status).toBe(429);
    vi.mocked(listGoals).mockRejectedValueOnce(new Error("relation mira_goal does not exist"));
    const res = await GET(req("GET", "/api/mira/goals"));
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("mira_goal");
  });
});

describe("POST /api/mira/goals", () => {
  const create = (body: unknown) => POST(req("POST", "/api/mira/goals", body));

  it("sets a goal in the person's words, tidied, and counts it without them", async () => {
    const res = await create({
      text: `  ${WORDS.replace(/ /g, "   ")}\n`,
      weeklyTarget: 3,
      via: "mira",
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ goal: { ...row, days: [] } });
    expect(createGoal).toHaveBeenCalledWith(LEA.id, { text: WORDS, weeklyTarget: 3, via: "mira" });
    expect(logMiraEvent).toHaveBeenCalledWith(
      "goal_set",
      { userId: LEA.id },
      { via: "mira", target: 3 }
    );
    expect(logged()).not.toContain("soft light");
  });

  it("makes one goal of the same words twice: the second answers the first, counted once", async () => {
    vi.mocked(createGoal).mockResolvedValueOnce({ goal: { ...row, days: [] }, existing: true });
    const res = await create({ text: WORDS, via: "mira" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ goal: { ...row, days: [] } });
    expect(logMiraEvent).not.toHaveBeenCalled();
  });

  it("sets one by hand with no target unless told otherwise", async () => {
    await create({ text: "Walk" });
    expect(createGoal).toHaveBeenCalledWith(LEA.id, {
      text: "Walk",
      weeklyTarget: null,
      via: "hand",
    });
  });

  it("refuses an empty, overlong or odd goal", async () => {
    for (const body of [
      {},
      { text: "   " },
      { text: "x".repeat(121) },
      { text: "Walk", weeklyTarget: 0 },
      { text: "Walk", weeklyTarget: 8 },
      { text: "Walk", weeklyTarget: 2.5 },
      { text: "Walk", via: "admin" },
      { text: "Walk", user_id: "someone-else" },
    ]) {
      expect((await create(body)).status, JSON.stringify(body)).toBe(400);
    }
    expect(createGoal).not.toHaveBeenCalled();
  });

  it("needs the CSRF token and an account", async () => {
    vi.mocked(verifyCsrfToken).mockResolvedValueOnce(false);
    expect((await create({ text: "Walk" })).status).toBe(403);
    vi.mocked(getMiraAccount).mockResolvedValueOnce(null);
    expect((await create({ text: "Walk" })).status).toBe(401);
    expect(createGoal).not.toHaveBeenCalled();
  });

  it("keeps new goals to a sane number a day", async () => {
    vi.mocked(checkRateLimit).mockImplementation(async (_key, opts) => ({
      allowed: opts.bucket !== "mira-goals-new",
      remaining: 0,
      resetAt: new Date(),
    }));
    expect((await create({ text: "Walk" })).status).toBe(429);
    expect(createGoal).not.toHaveBeenCalled();
  });

  it("says when enough goals are on the go", async () => {
    vi.mocked(createGoal).mockResolvedValueOnce("full");
    const res = await create({ text: "Walk" });
    expect(res.status).toBe(409);
    expect(logMiraEvent).not.toHaveBeenCalled();
  });

  it("sets no goal for someone who said they are under 18", async () => {
    vi.mocked(isMinor).mockResolvedValueOnce(true);
    expect((await create({ text: "Walk" })).status).toBe(403);
    expect(createGoal).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/mira/goals", () => {
  it("deletes all the person's goals, with the CSRF token", async () => {
    vi.mocked(verifyCsrfToken).mockResolvedValueOnce(false);
    expect((await deleteAll(req("DELETE", "/api/mira/goals"))).status).toBe(403);
    expect(deleteGoals).not.toHaveBeenCalled();
    expect((await deleteAll(req("DELETE", "/api/mira/goals"))).status).toBe(200);
    expect(deleteGoals).toHaveBeenCalledWith(LEA.id);
    expect(logMiraEvent).toHaveBeenCalledWith("goals_deleted", { userId: LEA.id });
  });
});

describe("PATCH /api/mira/goals/[id]", () => {
  const patch = (body: unknown, id = GOAL) =>
    PATCH(req("PATCH", `/api/mira/goals/${id}`, body), params(id));

  it("edits the words and the target of the person's own goal", async () => {
    const res = await patch({ text: " Walk  twice ", weeklyTarget: null });
    expect(res.status).toBe(200);
    expect(updateGoal).toHaveBeenCalledWith(LEA.id, GOAL, {
      text: "Walk twice",
      weeklyTarget: null,
    });
    expect(await res.json()).toEqual({ goal: row });
    expect(logMiraEvent).not.toHaveBeenCalled();
  });

  it("counts a goal done or put away, never its words", async () => {
    await patch({ completed: true });
    await patch({ archived: true });
    await patch({ archived: false });
    expect(vi.mocked(logMiraEvent).mock.calls).toEqual([
      ["goal_completed", { userId: LEA.id }],
      ["goal_archived", { userId: LEA.id }],
    ]);
  });

  it("finds no goal of someone else's, and keeps the cap when one comes back", async () => {
    vi.mocked(updateGoal).mockResolvedValueOnce("missing");
    expect((await patch({ completed: true })).status).toBe(404);
    vi.mocked(updateGoal).mockResolvedValueOnce("full");
    expect((await patch({ completed: false })).status).toBe(409);
    expect(logMiraEvent).not.toHaveBeenCalled();
  });

  it("refuses an empty or unknown change, and needs the CSRF token", async () => {
    for (const body of [{}, { user_id: "x" }, { text: "" }, { weeklyTarget: 9 }, { done: true }]) {
      expect((await patch(body)).status, JSON.stringify(body)).toBe(400);
    }
    vi.mocked(verifyCsrfToken).mockResolvedValueOnce(false);
    expect((await patch({ completed: true })).status).toBe(403);
    expect(updateGoal).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/mira/goals/[id]", () => {
  it("deletes the person's own goal, and finds none of anyone else's", async () => {
    const del = () => deleteOne(req("DELETE", `/api/mira/goals/${GOAL}`), params());
    expect((await del()).status).toBe(200);
    expect(deleteGoal).toHaveBeenCalledWith(LEA.id, GOAL);
    expect(logMiraEvent).toHaveBeenCalledWith("goal_deleted", { userId: LEA.id });
    vi.mocked(deleteGoal).mockResolvedValueOnce(false);
    expect((await del()).status).toBe(404);
    vi.mocked(verifyCsrfToken).mockResolvedValueOnce(false);
    expect((await del()).status).toBe(403);
  });
});

describe("POST /api/mira/goals/[id]/log", () => {
  const today = new Date().toISOString().slice(0, 10);
  const log = (body: unknown) => tick(req("POST", `/api/mira/goals/${GOAL}/log`, body), params());

  it("ticks today on the person's own goal and takes it back", async () => {
    expect((await log({ day: today, done: true })).status).toBe(200);
    expect(setTick).toHaveBeenLastCalledWith(LEA.id, GOAL, today, true);
    expect(logMiraEvent).toHaveBeenCalledWith("goal_logged", { userId: LEA.id });
    vi.mocked(logMiraEvent).mockClear();
    expect((await log({ day: today, done: false })).status).toBe(200);
    expect(setTick).toHaveBeenLastCalledWith(LEA.id, GOAL, today, false);
    expect(logMiraEvent).not.toHaveBeenCalled();
  });

  it("ticks no other day than today, and no goal of anyone else's", async () => {
    for (const day of ["2020-01-01", "2026-02-30", "tomorrow", ""]) {
      expect((await log({ day, done: true })).status, day).toBe(400);
    }
    expect(setTick).not.toHaveBeenCalled();
    vi.mocked(setTick).mockResolvedValueOnce("missing");
    expect((await log({ day: today, done: true })).status).toBe(404);
    expect(logMiraEvent).not.toHaveBeenCalled();
  });

  it("says when the goal was put away or done meanwhile, and counts no tick", async () => {
    vi.mocked(setTick).mockResolvedValueOnce("inactive");
    const res = await log({ day: today, done: true });
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toMatch(/put away or marked done/);
    expect(logMiraEvent).not.toHaveBeenCalled();
  });

  it("needs the CSRF token, an account and a slower hand", async () => {
    vi.mocked(verifyCsrfToken).mockResolvedValueOnce(false);
    expect((await log({ day: today, done: true })).status).toBe(403);
    vi.mocked(getMiraAccount).mockResolvedValueOnce(null);
    expect((await log({ day: today, done: true })).status).toBe(401);
    vi.mocked(checkRateLimit).mockResolvedValueOnce({
      allowed: false,
      remaining: 0,
      resetAt: new Date(),
    });
    expect((await log({ day: today, done: true })).status).toBe(429);
    expect(setTick).not.toHaveBeenCalled();
  });
});

describe("someone who said they are under 18 (rail 15)", () => {
  beforeEach(() => vi.mocked(isMinor).mockResolvedValue(true));

  it("sees, sets, changes and ticks no goals", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const refused = await GET(req("GET", "/api/mira/goals"));
    expect(refused.status).toBe(403);
    // Decision 9: one sentence, marked so the screens show the kit's AdultsOnly.
    expect(await refused.json()).toEqual({ error: "Mira is only for adults.", minor: true });
    expect((await POST(req("POST", "/api/mira/goals", { text: "Walk" }))).status).toBe(403);
    const change = req("PATCH", `/api/mira/goals/${GOAL}`, { completed: true });
    expect((await PATCH(change, params())).status).toBe(403);
    const log = req("POST", `/api/mira/goals/${GOAL}/log`, { day: today, done: true });
    expect((await tick(log, params())).status).toBe(403);
    expect(listGoals).not.toHaveBeenCalled();
    expect(createGoal).not.toHaveBeenCalled();
    expect(updateGoal).not.toHaveBeenCalled();
    expect(setTick).not.toHaveBeenCalled();
    expect(logMiraEvent).not.toHaveBeenCalled();
  });

  it("can still delete what is there", async () => {
    expect((await deleteAll(req("DELETE", "/api/mira/goals"))).status).toBe(200);
    expect((await deleteOne(req("DELETE", `/api/mira/goals/${GOAL}`), params())).status).toBe(200);
    expect(deleteGoals).toHaveBeenCalledWith(LEA.id);
    expect(deleteGoal).toHaveBeenCalledWith(LEA.id, GOAL);
  });
});
