import { beforeEach, describe, expect, it, vi } from "vitest";

const mockVerifyAdminSession = vi.fn();
vi.mock("@features/admin/server/auth", () => ({
  verifyAdminSession: (...args: unknown[]) => mockVerifyAdminSession(...(args as [])),
}));
vi.mock("@shared/http/ratelimit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}));
const mockFetchAllRows = vi.fn();
vi.mock("@features/admin/server/supabase", () => ({
  supabaseFetch: vi.fn(),
  fetchAllRows: (...args: unknown[]) => mockFetchAllRows(...args),
  countRows: vi.fn(),
  POSTGREST_MAX_ROWS: 1000,
}));
vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { GET } from "@/app/api/admin/ap/mira/route";
import { parseFilters } from "@features/admin/server/ap/filters";
import {
  buildMiraPage,
  chatsOf,
  fetchMira,
  type MiraData,
  type MiraEventRow,
  type MiraUserRow,
} from "@features/admin/server/ap/mira";
import { __resetStaffEmailRegexForTests } from "@shared/env/staff-email";

const TODAY = "2026-12-20";

const ev = (
  name: string,
  who: { anon?: string; user?: string },
  at: string,
  rating?: 1 | -1
): MiraEventRow => ({
  name,
  anon_id: who.anon ?? null,
  user_id: who.user ?? null,
  created_at: at,
  rating: rating === undefined ? null : String(rating),
});

/** A chat: its start and `messages` messages a minute apart, the first written 50 ms early. */
function chat(who: { anon?: string; user?: string }, at: string, messages = 1): MiraEventRow[] {
  const t = Date.parse(at);
  return [
    ev("chat_started", who, at),
    ...Array.from({ length: messages }, (_, i) =>
      ev("message_sent", who, new Date(t + (i ? i * 60_000 : -50)).toISOString())
    ),
  ];
}

const account = (id: string, email: string, at: string, over: Partial<MiraUserRow> = {}) => ({
  id,
  email,
  created_at: at,
  style: {},
  use_assessment: true,
  ...over,
});

const data = (
  users: MiraUserRow[],
  events: MiraEventRow[],
  withResult: string[] = [],
  nudges: MiraData["nudges"] = []
) => ({ users, events, nudges, withResult: new Set(withResult) }) satisfies MiraData;

const page = (d: MiraData, from: string, to: string) =>
  buildMiraPage({
    data: d,
    filters: parseFilters({ period: "custom", from, to }, TODAY),
    today: TODAY,
    now: new Date(`${TODAY}T12:00:00Z`),
  });

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.ADMIN_TEST_EMAIL_REGEX;
  __resetStaffEmailRegexForTests();
});

describe("Mira's conversations", () => {
  it("count a person's messages in the chat they started last, a first message written just before its start included", () => {
    const min = 60_000;
    expect(
      chatsOf(
        { starts: [0, 10 * min], msgs: [-50, min, 2 * min, 10 * min - 50, 11 * min] },
        Infinity
      )
    ).toEqual([
      { at: 0, msgs: 3 },
      { at: 10 * min, msgs: 2 },
    ]);
    // As of an earlier end: only what had happened by then.
    expect(chatsOf({ starts: [0, 10 * min], msgs: [-50, min, 2 * min] }, 90_000)).toEqual([
      { at: 0, msgs: 2 },
    ]);
  });
});

// A: an anonymous browser with 8 chats before the range, one in it (3 messages), then signs up
// and chats once more signed in: one person, exactly 10 conversations. B: two one-message chats,
// no account. C: chatted only before the range. D: an account from the range's first day, one
// 5-message chat signed in. E: opened Mira and left. F: an account with one short chat.
const A = { anon: "browser-a" };
const U1 = { user: "u1" };
const PEOPLE = data(
  [
    account("u1", "a@example.com", "2026-11-03T12:00:00Z"),
    account("u2", "d@example.com", "2026-11-02T09:00:00Z"),
    account("u6", "f@example.com", "2026-11-09T09:00:00Z"),
  ],
  [
    ...Array.from({ length: 8 }, (_, i) => chat(A, `2026-11-01T0${i}:00:00Z`)).flat(),
    ev("chat_opened", A, "2026-11-03T10:00:00Z"),
    ...chat(A, "2026-11-03T10:01:00Z", 3),
    ev("signup_completed", { ...A, ...U1 }, "2026-11-03T12:00:00Z"),
    ...chat(U1, "2026-11-04T10:00:00Z"),
    ev("chat_opened", { anon: "b" }, "2026-11-05T10:00:00Z"),
    ...chat({ anon: "b" }, "2026-11-05T10:01:00Z"),
    ...chat({ anon: "b" }, "2026-11-06T10:01:00Z"),
    ...chat({ anon: "c" }, "2026-10-30T10:00:00Z", 4),
    ev("chat_opened", { user: "u2" }, "2026-11-07T10:00:00Z"),
    ...chat({ user: "u2" }, "2026-11-07T10:01:00Z", 5),
    ev("chat_opened", { anon: "e" }, "2026-11-08T10:00:00Z"),
    ev("chat_opened", { user: "u6" }, "2026-11-09T10:00:00Z"),
    ...chat({ user: "u6" }, "2026-11-09T10:01:00Z"),
  ]
);

describe("buildMiraPage", () => {
  it("counts pass 10 and the sign-up rate of the people who chatted in the range; a browser that signed in is its account", () => {
    const p = page(PEOPLE, "2026-11-02", "2026-11-15");
    expect(p.tiles.conversations).toMatchObject({ value: 6, foot: "started by 4 people" });
    // A reached 10 (10 so far); B, D and F did not.
    expect(p.tiles.passTen!.value).toBeCloseTo(1 / 4);
    // A, D and F have an account by the range's end; B doesn't.
    expect(p.tiles.signupRate!.value).toBeCloseTo(3 / 4);
    expect(p.tiles.signups!.value).toBe(3);
    expect(p.perUser.map((b) => b.n)).toEqual([2, 1, 0, 1, 0]);
  });

  it("walks the funnel so that no step rises, and leaves Subscribed unmeasured", () => {
    const steps = page(PEOPLE, "2026-11-02", "2026-11-15").funnel;
    // F has an account but no real conversation, so it leaves at "Real conversation".
    expect(steps.map((s) => [s.key, s.n])).toEqual([
      ["opened", 5],
      ["started", 4],
      ["real", 2],
      ["account", 2],
      ["ten", 1],
      ["paid", null],
    ]);
    expect(steps[1]!.ofPrev).toBeCloseTo(4 / 5);
    expect(steps[4]!.ofFirst).toBeCloseTo(1 / 5);
    expect(steps[5]).toMatchObject({ ofFirst: null, ofPrev: null });
  });

  it("counts helpful answers as the thumbs up of all thumbs given in the range", () => {
    const d = data(
      [],
      [
        ev("rating", { anon: "x" }, "2026-11-01T10:00:00Z", -1),
        ev("rating", { anon: "x" }, "2026-11-03T10:00:00Z", 1),
        ev("rating", { anon: "y" }, "2026-11-03T11:00:00Z", 1),
        ev("rating", { user: "u9" }, "2026-11-04T10:00:00Z", 1),
        ev("rating", { anon: "y" }, "2026-11-05T10:00:00Z", -1),
        ev("crisis_shown", { anon: "y" }, "2026-11-05T10:00:00Z"),
      ]
    );
    const p = page(d, "2026-11-02", "2026-11-15");
    expect(p.tiles.helpful).toMatchObject({ value: 0.75, foot: "3 of 4 thumbs were up" });
    expect(p.safety).toEqual({ conversations: 0, crisis: 1, notHelpful: 1 });
  });

  it("leaves the team out: its accounts, their events and the browser they signed in from", () => {
    const d = data(
      [
        account("s1", "eman@loveiq.org", "2026-11-03T12:00:00Z", { style: { tone: 2 } }),
        account("u5", "real@example.com", "2026-11-04T12:00:00Z", { style: { tone: 4 } }),
      ],
      [
        ...chat({ anon: "staff-browser" }, "2026-11-03T10:00:00Z", 3),
        ev("signup_completed", { anon: "staff-browser", user: "s1" }, "2026-11-03T12:00:00Z"),
        ...chat({ user: "s1" }, "2026-11-04T10:00:00Z"),
        ev("rating", { user: "s1" }, "2026-11-04T10:05:00Z", -1),
        ...chat({ anon: "visitor" }, "2026-11-05T10:00:00Z"),
        // A deleted account's chat: no link left, so counted, but as nobody in particular.
        ev("chat_started", {}, "2026-11-06T10:00:00Z"),
      ]
    );
    const p = page(d, "2026-11-02", "2026-11-15");
    expect(p.tiles.conversations).toMatchObject({ value: 2, foot: "started by 1 person" });
    expect(p.tiles.signups!.value).toBe(1);
    expect(p.tiles.helpful!.value).toBeNull();
    expect(p.knows).toEqual({ accounts: 1, style: 1, result: 0 });
  });

  it("reads DAU % and WAU % over the accounts open each day, and stickiness from them", () => {
    const daily = Array.from({ length: 7 }, (_, i) =>
      ev("message_sent", { user: "u1" }, `2026-11-0${i + 2}T10:00:00Z`)
    );
    const d = data(
      [
        account("u1", "a@example.com", "2026-11-01T09:00:00Z"),
        account("u2", "b@example.com", "2026-11-01T09:00:00Z"),
      ],
      [...daily, ev("message_sent", { user: "u2" }, "2026-11-02T11:00:00Z")]
    );
    const p = page(d, "2026-11-02", "2026-11-08");
    // Both on the 2nd, one of two each day after; both within 7 days of every day.
    expect(p.tiles.dau!.value).toBeCloseTo((1 + 6 * 0.5) / 7);
    expect(p.tiles.wau!.value).toBeCloseTo(1);
    expect(p.tiles.stickiness!.value).toBeCloseTo(4 / 7);
  });

  it("counts week 4 only once it is over, of the accounts whose sign-up week reached it", () => {
    const d = data(
      [
        account("u1", "a@example.com", "2026-11-02T09:00:00Z"),
        account("u2", "b@example.com", "2026-11-04T09:00:00Z"),
        // Its week 4 ends after the range: not counted yet.
        account("u3", "c@example.com", "2026-11-30T09:00:00Z"),
      ],
      [
        ...chat({ user: "u1" }, "2026-11-02T10:00:00Z"),
        ...chat({ user: "u2" }, "2026-11-04T10:00:00Z"),
        ...chat({ user: "u1" }, "2026-12-01T10:00:00Z"),
        ...chat({ user: "u3" }, "2026-12-01T10:00:00Z"),
      ]
    );
    const p = page(d, "2026-11-02", "2026-12-13");
    expect(p.tiles.weekFour).toMatchObject({ value: 0.5, foot: "1 of 2 accounts past week 4" });
    const [first, second] = p.cohorts;
    expect(first).toMatchObject({ week: "2026-11-02", users: 2 });
    expect(first!.cells[0]).toEqual({ active: 2, convos: 2 });
    expect(first!.cells[4]).toEqual({ active: 1, convos: 3 });
    expect(first!.cells[5]).not.toBeNull();
    expect(first!.cells[6]).toBeNull(); // 14–20 Dec: after the range's last day
    expect(second).toMatchObject({ week: "2026-11-30", users: 1 });
    expect(second!.cells[2]).toBeNull();
    // The week of 14 Dec ends today (Sunday 20 Dec): not over yet, even in a range to today.
    expect(page(d, "2026-11-02", TODAY).cohorts[0]!.cells[6]).toBeNull();
  });

  it("is not compared with a period before Mira's first record, and is after it", () => {
    const d = data(
      [],
      [
        ...chat({ anon: "a" }, "2026-11-10T10:00:00Z"),
        ...chat({ anon: "b" }, "2026-11-18T10:00:00Z"),
      ]
    );
    const early = page(d, "2026-11-10", "2026-11-16");
    expect(early.compare).toBeNull();
    expect(early.tiles.conversations!.prev).toBeNull();
    expect(early.notes.join(" ")).toMatch(/Not compared with the period before/);
    const later = page(d, "2026-11-17", "2026-11-23");
    expect(later.compare).toMatchObject({ from: "2026-11-10", to: "2026-11-16" });
    expect(later.tiles.conversations).toMatchObject({ value: 1, prev: 1 });
    expect(page(d, "2026-11-01", "2026-11-07").notes.join(" ")).toMatch(/pick a range from then/);
  });

  it("counts nudges by kind: sent, clicked, and a message within 24 h of the click", () => {
    const d = data(
      [
        account("u1", "a@example.com", "2026-11-02T09:00:00Z"),
        account("s1", "eman@loveiq.org", "2026-11-02T09:00:00Z"),
      ],
      [
        ...chat({ user: "u1" }, "2026-11-10T10:00:00Z"),
        ev("nudge_stopped", { user: "u1" }, "2026-11-12T08:00:00Z"),
      ],
      [],
      [
        {
          user_id: "u1",
          type: "agreement",
          sent_at: "2026-11-10T07:00:00Z",
          clicked_at: "2026-11-10T09:30:00Z",
        },
        {
          user_id: "u1",
          type: "share",
          sent_at: "2026-11-11T07:00:00Z",
          clicked_at: "2026-11-11T08:00:00Z",
        },
        { user_id: "u1", type: "share", sent_at: "2026-11-20T07:00:00Z", clicked_at: null },
        {
          user_id: "s1",
          type: "share",
          sent_at: "2026-11-10T07:00:00Z",
          clicked_at: "2026-11-10T07:05:00Z",
        },
      ]
    );
    const p = page(d, "2026-11-09", "2026-11-15");
    expect(p.tiles.nudgesSent!.value).toBe(2);
    expect(p.tiles.nudgeCtr!.value).toBe(1);
    expect(p.tiles.nudgeStarted!.value).toBe(0.5);
    expect(p.tiles.nudgeUnsub!.value).toBe(0.5);
    expect(p.nudgeTypes.find((t) => t.type === "agreement")).toMatchObject({
      sent: 1,
      clicked: 1,
      started: 1,
    });
    expect(p.nudgeTypes.find((t) => t.type === "share")).toMatchObject({
      sent: 1,
      clicked: 1,
      started: 0,
    });
    expect(p.tiles.nudgeOpen!.blocked).toMatch(/Not measured yet/);
  });

  it("marks what nothing records yet as not measured, never as a number", () => {
    const p = page(PEOPLE, "2026-11-02", "2026-11-15");
    for (const k of ["nps", "timeSpent", "bodyImage", "profileDepth", "subscription", "churn"]) {
      expect(p.tiles[k]).toMatchObject({
        value: null,
        blocked: expect.stringMatching(/^Not measured yet/),
      });
    }
  });
});

describe("fetchMira", () => {
  it("reads only the rating from an event's props, and asks for LoveIQ results by encoded address, the team's left out", async () => {
    mockFetchAllRows.mockImplementation(async (path: string) => {
      if (path.startsWith("/rest/v1/mira_user"))
        return [
          account("u1", "a+b@example.com", "2026-11-03T12:00:00Z"),
          account("s1", "eman@loveiq.org", "2026-11-03T12:00:00Z"),
          account("u3", "c@example.com", "2026-11-03T12:00:00Z", { use_assessment: false }),
        ];
      if (path.startsWith("/rest/v1/mira_event")) return [];
      if (path.startsWith("/rest/v1/app_user")) return [{ email: "a+b@example.com" }];
      if (path.startsWith("/rest/v1/mira_nudge")) return [];
      return null;
    });
    const out = await fetchMira();
    expect(out.withResult).toEqual(new Set(["u1"]));
    const paths = mockFetchAllRows.mock.calls.map((c) => c[0] as string);
    const events = paths.find((p) => p.startsWith("/rest/v1/mira_event"))!;
    expect(events).toContain("rating:props->>rating");
    expect(events).not.toMatch(/[,=]props(,|&|$)/);
    const lookup = paths.find((p) => p.startsWith("/rest/v1/app_user"))!;
    expect(lookup).toContain(`email=in.(${encodeURIComponent('"a+b@example.com"')})`);
    expect(lookup).not.toContain("loveiq.org");
  });

  it("fails rather than count part of the events", async () => {
    mockFetchAllRows.mockImplementation(async (path: string) =>
      path.startsWith("/rest/v1/mira_event") ? null : []
    );
    await expect(fetchMira()).rejects.toThrow(/could not be read/);
  });
});

describe("GET /api/admin/ap/mira", () => {
  const url = "http://localhost/api/admin/ap/mira?period=custom&from=2026-11-02&to=2026-11-15";

  it("needs an admin session", async () => {
    mockVerifyAdminSession.mockResolvedValue(null);
    expect((await GET(new Request(url))).status).toBe(401);
  });

  it("answers the page's figures, uncached", async () => {
    mockVerifyAdminSession.mockResolvedValue({ email: "mb@loveiq.org", role: "viewer" });
    mockFetchAllRows.mockImplementation(async (path: string) =>
      path.startsWith("/rest/v1/mira_event")
        ? PEOPLE.events
        : path.startsWith("/rest/v1/mira_user")
          ? PEOPLE.users
          : []
    );
    const res = await GET(new Request(url));
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toMatch(/no-store/);
    const body = (await res.json()) as { tiles: Record<string, { value: number }> };
    expect(body.tiles.conversations!.value).toBe(6);
  });
});
