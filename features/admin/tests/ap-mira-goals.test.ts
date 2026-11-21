import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFetchAllRows = vi.fn();
const mockSupabaseFetch = vi.fn();
vi.mock("@features/admin/server/supabase", () => ({
  supabaseFetch: (...args: unknown[]) => mockSupabaseFetch(...args),
  fetchAllRows: (...args: unknown[]) => mockFetchAllRows(...args),
  countRows: vi.fn(),
  POSTGREST_MAX_ROWS: 1000,
}));
vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { parseFilters } from "@features/admin/server/ap/filters";
import {
  buildMiraPage,
  fetchMira,
  type MiraData,
  type MiraEventRow,
  type MiraUserRow,
} from "@features/admin/server/ap/mira";
import type { MiraGoalLogRow, MiraGoalRow } from "@features/admin/server/ap/mira-goals";
import { __resetStaffEmailRegexForTests } from "@shared/env/staff-email";

/** AP › Mira › Goals (Challenges & goals): who sets goals, how, and whether they tick them. */

const TODAY = "2026-12-20";
const account = (id: string, email: string, at: string, over: Partial<MiraUserRow> = {}) => ({
  id,
  email,
  created_at: at,
  style: {},
  use_assessment: false,
  ...over,
});
const goal = (id: string, user_id: string, via: "hand" | "mira", created_at: string) =>
  ({ id, user_id, via, created_at }) satisfies MiraGoalRow;
const tick = (goal_id: string, user_id: string, created_at: string) =>
  ({ goal_id, user_id, created_at }) satisfies MiraGoalLogRow;
const ev = (name: string, who: { anon?: string; user?: string }, at: string, team = false) =>
  ({
    name,
    anon_id: who.anon ?? null,
    user_id: who.user ?? null,
    at: Date.parse(at),
    detail: null,
    ...(team ? { team: true as const } : {}),
  }) satisfies MiraEventRow;

const users = [
  account("u1", "real@example.com", "2026-11-01T10:00:00Z"),
  account("u2", "b@example.com", "2026-11-01T10:00:00Z"),
  account("u3", "c@example.com", "2026-11-05T10:00:00Z"),
  account("u4", "d@example.com", "2026-10-20T10:00:00Z"),
  account("s1", "eman@loveiq.org", "2026-11-01T10:00:00Z"),
  account("t1", "lea@gmail.com", "2026-11-01T10:00:00Z", { is_team: true }),
];
const goals = [
  goal("g0", "u2", "hand", "2026-10-20T10:00:00Z"), // before the range
  goal("g1", "u1", "mira", "2026-11-03T10:00:00Z"),
  goal("g2", "u1", "hand", "2026-11-10T10:00:00Z"),
  goal("g3", "u2", "hand", "2026-11-14T10:00:00Z"),
  goal("g4", "u3", "hand", "2026-11-21T10:00:00Z"), // after the range
  goal("g5", "u4", "hand", "2026-10-25T10:00:00Z"), // before the range
  goal("gs", "s1", "mira", "2026-11-05T10:00:00Z"), // a staff address
  goal("gt", "t1", "mira", "2026-11-05T10:00:00Z"), // a team account
];
const logs = [
  tick("g1", "u1", "2026-11-04T08:00:00Z"), // the day after it was set
  tick("g1", "u1", "2026-11-14T08:00:00Z"),
  tick("g2", "u1", "2026-11-20T08:00:00Z"), // ten days after: not its first week
  tick("g0", "u2", "2026-11-12T08:00:00Z"),
  tick("g5", "u4", "2026-11-03T08:00:00Z"), // in the range, not in its last 7 days
  tick("gs", "s1", "2026-11-13T08:00:00Z"), // the team's, in the range's last 7 days
];
const events = [
  ev("goal_suggested", { user: "u1" }, "2026-11-03T09:00:00Z"),
  ev("goal_suggested", { anon: "browser-x" }, "2026-11-04T09:00:00Z"),
  ev("goal_suggested", { anon: "browser-team" }, "2026-11-05T09:00:00Z", true),
  ev("message_sent", { user: "u1" }, "2026-11-03T09:01:00Z"),
];
const data = (over: Partial<MiraData> = {}): MiraData => ({
  users,
  events,
  nudges: [],
  bodyChecks: [],
  withResult: new Set(),
  goals: { goals, logs },
  ...over,
});
const page = (d: MiraData) =>
  buildMiraPage({
    data: d,
    filters: parseFilters({ period: "custom", from: "2026-11-02", to: "2026-11-15" }, TODAY),
    today: TODAY,
    now: new Date(`${TODAY}T12:00:00Z`),
  });

beforeEach(() => {
  vi.clearAllMocks();
  __resetStaffEmailRegexForTests();
});

describe("AP › Mira › Goals", () => {
  it("counts who has a goal, how goals were set, first-week ticks and weekly loggers", () => {
    expect(page(data()).goals).toEqual({
      // u1, u2 and u4 have a goal by the range's last day (u3's came later), of four accounts.
      people: 3,
      accounts: 4,
      // Set in the range: g1 from Mira's suggestion, g2 and g3 by hand; Mira suggested two.
      viaMira: 1,
      byHand: 2,
      suggested: 2,
      // All three are a week old now; only g1 was ticked within 7 days of being set.
      weekOld: 3,
      tickedInWeek: 1,
      // u1 (g1 on 14 Nov) and u2 (g0 on 12 Nov) ticked in the range's last 7 days; u4 before.
      weeklyLoggers: 2,
    });
  });

  it("leaves out the team's goals, ticks and suggestions", () => {
    const team = page(
      data({
        users: users.filter((u) => u.id === "s1" || u.id === "t1"),
        events: [events[2]!],
        goals: { goals: goals.filter((g) => ["gs", "gt"].includes(g.id)), logs: [logs[4]!] },
      })
    ).goals;
    expect(team).toEqual({
      people: 0,
      accounts: 0,
      viaMira: 0,
      byHand: 0,
      suggested: 0,
      weekOld: 0,
      tickedInWeek: 0,
      weeklyLoggers: 0,
    });
  });

  it("waits for a goal's first week to end before counting it", () => {
    const fresh = page(
      data({
        goals: { goals: [goal("g9", "u1", "hand", "2026-11-15T10:00:00Z")], logs: [] },
      })
    );
    const now = buildMiraPage({
      data: data({
        goals: { goals: [goal("g9", "u1", "hand", "2026-11-15T10:00:00Z")], logs: [] },
      }),
      filters: parseFilters(
        { period: "custom", from: "2026-11-02", to: "2026-11-15" },
        "2026-11-18"
      ),
      today: "2026-11-18",
      now: new Date("2026-11-18T12:00:00Z"),
    });
    expect(fresh.goals?.weekOld).toBe(1);
    expect(now.goals?.weekOld).toBe(0);
  });

  it("counts none when the data carries no goal rows at all", () => {
    expect(page(data({ goals: undefined })).goals).toMatchObject({ people: 0, viaMira: 0 });
  });

  it("says nothing rather than zero when the goal tables can't be read", () => {
    expect(page(data({ goals: null })).goals).toBeNull();
  });
});

describe("reading the goal tables", () => {
  beforeEach(() => {
    mockSupabaseFetch.mockImplementation(async () => new Response("[]", { status: 200 }));
  });

  it("reads ids, how and when, never a goal's words", async () => {
    mockFetchAllRows.mockImplementation(async (path: string) =>
      path.startsWith("/rest/v1/mira_goal?")
        ? goals
        : path.startsWith("/rest/v1/mira_goal_log")
          ? logs
          : []
    );
    const out = await fetchMira();
    expect(out.goals).toEqual({ goals, logs });
    const paths = mockFetchAllRows.mock.calls.map((c) => c[0] as string);
    const read = paths.filter((p) => p.startsWith("/rest/v1/mira_goal"));
    expect(read).toEqual([
      "/rest/v1/mira_goal?select=id,user_id,via,created_at&order=id.asc",
      "/rest/v1/mira_goal_log?select=goal_id,user_id,created_at&order=goal_id.asc,day.asc",
    ]);
  });

  it("still shows the rest of the page when they can't be read (not yet migrated)", async () => {
    mockFetchAllRows.mockImplementation(async (path: string) =>
      path.startsWith("/rest/v1/mira_goal") ? null : []
    );
    const out = await fetchMira();
    expect(out.goals).toBeNull();
    expect(out.users).toEqual([]);
  });
});
