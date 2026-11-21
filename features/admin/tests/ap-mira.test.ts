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

import { readFileSync } from "node:fs";

import { GET } from "@/app/api/admin/ap/mira/route";
import { parseFilters } from "@features/admin/server/ap/filters";
import {
  buildMiraPage,
  conversationsOf,
  fetchMira,
  SESSION_GAP_MS,
  type MiraData,
  type MiraEventRow,
  type MiraNudgeRow,
  type MiraUserRow,
} from "@features/admin/server/ap/mira";
import miraConfig from "@features/mira/content/mira-config.json";
import { __resetStaffEmailRegexForTests } from "@shared/env/staff-email";

const TODAY = "2026-12-20";

const ev = (
  name: string,
  who: { anon?: string; user?: string },
  at: string,
  detail?: string | number | null
): MiraEventRow => ({
  name,
  anon_id: who.anon ?? null,
  user_id: who.user ?? null,
  at: Date.parse(at),
  detail: detail === undefined || detail === null ? null : String(detail),
});

/**
 * What mira_ap_events answers for these rows (in id order): one entry per person, name and
 * detail, with its times, in the order of each entry's first event.
 */
function grouped(events: MiraEventRow[]) {
  const groups = new Map<string, [string, string | null, string | null, string | null, number[]]>();
  for (const e of events) {
    const key = JSON.stringify([e.name, e.anon_id, e.user_id, e.detail]);
    if (!groups.has(key)) groups.set(key, [e.name, e.anon_id, e.user_id, e.detail, []]);
    groups.get(key)![4].push(e.at);
  }
  return [...groups.values()];
}

/** The RPC answering `groups`, and every other read answering `rows(path)`. */
function database(groups: unknown, rows: (path: string) => unknown = () => []) {
  mockSupabaseFetch.mockImplementation(async (path: string) =>
    path === "/rest/v1/rpc/mira_ap_events"
      ? new Response(JSON.stringify(groups), { status: 200 })
      : new Response("[]", { status: 200 })
  );
  mockFetchAllRows.mockImplementation(async (path: string) => rows(path));
}

/**
 * A chat: its start (opened by `chip`, -1 for the person's own words, null for none recorded) and
 * `messages` messages a minute apart, the first written 50 ms early.
 */
function chat(
  who: { anon?: string; user?: string },
  at: string,
  messages = 1,
  chip: number | null = -1
): MiraEventRow[] {
  const t = Date.parse(at);
  return [
    ev("chat_started", who, at, chip),
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

/** A nudge that went out, delivered when it was sent unless `over` says otherwise. */
const nudge = (
  user_id: string,
  type: string,
  sent_at: string,
  over: Partial<MiraNudgeRow> = {}
): MiraNudgeRow => ({
  user_id,
  type,
  sent_at,
  clicked_at: null,
  delivered_at: sent_at,
  opened_at: null,
  ...over,
});

const data = (
  users: MiraUserRow[],
  events: MiraEventRow[],
  withResult: string[] = [],
  nudges: MiraData["nudges"] = [],
  bodyChecks: MiraData["bodyChecks"] = []
) => ({ users, events, nudges, bodyChecks, withResult: new Set(withResult) }) satisfies MiraData;

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
  it("split a person's messages at gaps of more than 30 minutes; a part with 3+ is one, by its 3rd", () => {
    const min = 60_000;
    expect(SESSION_GAP_MS).toBe(30 * min);
    expect(
      conversationsOf([0, min, 2 * min, 40 * min, 41 * min, 72 * min, 73 * min, 74 * min, 80 * min])
    ).toEqual([2 * min, 74 * min]);
    // A gap of exactly 30 minutes keeps the session going.
    expect(conversationsOf([0, 30 * min, 60 * min])).toEqual([60 * min]);
    expect(conversationsOf([0, min])).toEqual([]);
  });
});

// A: an anonymous browser that gave the consent before the range, with 8 conversations before it
// and one in it, then signs up and has one more signed in: one person, exactly 10 conversations.
// B: two one-message chats, no account. C: a conversation only before the range. D: an account
// from the range's first day, one 5-message conversation signed in. E: opened Mira and left
// without the consent. F: an account with one short chat.
const A = { anon: "browser-a" };
const U1 = { user: "u1" };
const PEOPLE = data(
  [
    account("u1", "a@example.com", "2026-11-03T12:00:00Z"),
    account("u2", "d@example.com", "2026-11-02T09:00:00Z"),
    account("u6", "f@example.com", "2026-11-09T09:00:00Z"),
  ],
  [
    ev("consent_given", A, "2026-10-31T23:00:00Z"),
    ...Array.from({ length: 8 }, (_, i) => chat(A, `2026-11-01T0${i}:00:00Z`, 3)).flat(),
    ev("chat_opened", A, "2026-11-03T10:00:00Z"),
    ...chat(A, "2026-11-03T10:01:00Z", 3),
    ev("signup_completed", { ...A, ...U1 }, "2026-11-03T12:00:00Z", "email"),
    ...chat(U1, "2026-11-04T10:00:00Z", 3),
    ev("chat_opened", { anon: "b" }, "2026-11-05T10:00:00Z"),
    ev("consent_given", { anon: "b" }, "2026-11-05T10:00:30Z"),
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
  it("counts conversations, pass 10 and conversations per user from 3+ message sessions; a browser that signed in is its account", () => {
    const p = page(PEOPLE, "2026-11-02", "2026-11-15");
    // A's two and D's one; B's and F's one-message chats are no conversation.
    expect(p.tiles.conversations).toMatchObject({ value: 3, foot: "by 2 people" });
    expect(p.safety.conversations).toBe(3);
    // A reached 10 (8 before the range); D did not.
    expect(p.tiles.passTen).toMatchObject({ value: 0.5, foot: "1 of 2 who had a conversation" });
    expect(p.tiles.signups!.value).toBe(3);
    expect(p.perUser.map((b) => b.n)).toEqual([1, 0, 0, 1, 0]);
  });

  it("counts a conversation in the range its 3rd message is sent in, and only once", () => {
    // Three messages from 23:50 on 2 Nov (Berlin), the 3rd after midnight.
    const d = data(
      [],
      [
        ev("message_sent", { anon: "x" }, "2026-11-02T22:50:00Z"),
        ev("message_sent", { anon: "x" }, "2026-11-02T22:58:00Z"),
        ev("message_sent", { anon: "x" }, "2026-11-02T23:05:00Z"),
      ]
    );
    expect(page(d, "2026-11-02", "2026-11-02").tiles.conversations!.value).toBe(0);
    expect(page(d, "2026-11-03", "2026-11-03").tiles.conversations!.value).toBe(1);
    expect(page(d, "2026-11-02", "2026-11-03").tiles.conversations!.value).toBe(1);
  });

  it("reads the sign-up rate of the people who chatted signed out, converted by an account created after the chat", () => {
    const d = data(
      [
        account("u1", "a@example.com", "2026-11-03T11:00:00Z"),
        account("u2", "b@example.com", "2026-10-01T09:00:00Z"),
        account("u3", "c@example.com", "2026-10-01T09:00:00Z"),
        account("u4", "d@example.com", "2026-11-20T09:00:00Z"),
      ],
      [
        // Signs up an hour after chatting: converted.
        ...chat({ anon: "x" }, "2026-11-03T10:00:00Z"),
        ev("signup_completed", { anon: "x", user: "u1" }, "2026-11-03T11:00:00Z", "email"),
        // Never signs up.
        ...chat({ anon: "y" }, "2026-11-04T10:00:00Z"),
        // Chats signed in: not an anonymous chatter.
        ...chat({ user: "u2" }, "2026-11-05T10:00:00Z"),
        // An older account on a new browser chats signed out, then signs in: not a sign-up.
        ...chat({ anon: "z" }, "2026-11-06T10:00:00Z"),
        ev("signup_completed", { anon: "z", user: "u3" }, "2026-11-06T10:30:00Z", "google"),
        // Signs up after the range.
        ...chat({ anon: "w" }, "2026-11-14T10:00:00Z"),
        ev("signup_completed", { anon: "w", user: "u4" }, "2026-11-20T09:00:00Z", "email"),
      ]
    );
    expect(page(d, "2026-11-02", "2026-11-15").tiles.signupRate).toMatchObject({
      value: 0.25,
      foot: "1 of 4 anonymous chatters signed up",
    });
    expect(page(d, "2026-11-02", "2026-11-21").tiles.signupRate!.value).toBe(0.5);
  });

  it("walks the funnel so that no step rises, with the consent after opening, and leaves Subscribed unmeasured", () => {
    const steps = page(PEOPLE, "2026-11-02", "2026-11-15").funnel;
    // E opened and left without the consent; the accounts gave theirs at sign-up. F has an
    // account but no real conversation, so it leaves at "Real conversation".
    expect(steps.map((s) => [s.key, s.n])).toEqual([
      ["opened", 5],
      ["consent", 4],
      ["started", 4],
      ["real", 2],
      ["account", 2],
      ["ten", 1],
      ["paid", null],
    ]);
    expect(steps[1]!.ofPrev).toBeCloseTo(4 / 5);
    expect(steps[5]!.ofFirst).toBeCloseTo(1 / 5);
    expect(steps[6]).toMatchObject({ ofFirst: null, ofPrev: null });
  });

  it("counts the sign-up card per person, not per showing, and sign-ups by their first sign-in's method", () => {
    const d = data(
      [
        account("u1", "a@example.com", "2026-11-03T11:00:00Z"),
        account("u2", "b@example.com", "2026-11-04T11:00:00Z"),
        account("u3", "c@example.com", "2026-11-05T11:00:00Z"),
        account("u4", "d@example.com", "2026-10-01T11:00:00Z"),
      ],
      [
        ev("gate_shown", { anon: "x" }, "2026-11-03T10:00:00Z"),
        ev("gate_shown", { anon: "x" }, "2026-11-03T10:00:01Z"),
        ev("gate_shown", { anon: "x" }, "2026-11-03T10:05:00Z"),
        ev("gate_shown", { anon: "y" }, "2026-11-04T10:00:00Z"),
        ev("gate_shown", { anon: "z" }, "2026-10-04T10:00:00Z"),
        ev("signup_completed", { anon: "x", user: "u1" }, "2026-11-03T11:00:00Z", "email"),
        // A later sign-in with Google leaves u1 an email sign-up.
        ev("signup_completed", { anon: "x2", user: "u1" }, "2026-11-08T11:00:00Z", "google"),
        ev("signup_completed", { anon: "y", user: "u2" }, "2026-11-04T11:00:00Z", "google"),
        // u3's sign-in wasn't recorded; u4 signed up before the range.
        ev("signup_completed", { anon: "q", user: "u4" }, "2026-10-01T11:00:00Z", "google"),
      ]
    );
    const p = page(d, "2026-11-02", "2026-11-15");
    expect(p.gate).toBe(2);
    expect(p.signupsBy).toEqual({ email: 1, google: 1 });
    expect(p.tiles.signups!.value).toBe(3);
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
    expect(p.safety).toEqual({
      conversations: 0,
      crisis: 1,
      declined: 0,
      minorStops: 0,
      notHelpful: 1,
      referred: 0,
    });
  });

  it("reads NPS from the scores given, and how often “Not now” was tapped", () => {
    const d = data(
      [account("s1", "eman@loveiq.org", "2026-11-01T09:00:00Z")],
      [
        ev("nps", { anon: "a" }, "2026-11-03T10:00:00Z", 10),
        ev("nps", { anon: "b" }, "2026-11-03T10:00:00Z", 9),
        ev("nps", { anon: "c" }, "2026-11-04T10:00:00Z", 9),
        ev("nps", { anon: "d" }, "2026-11-04T10:00:00Z", 7),
        ev("nps", { anon: "e" }, "2026-11-05T10:00:00Z", 3),
        ev("nps", { anon: "f" }, "2026-11-05T10:00:00Z", null),
        ev("nps", { anon: "g" }, "2026-10-05T10:00:00Z", 0),
        ev("nps", { user: "s1" }, "2026-11-05T10:00:00Z", 0),
      ]
    );
    const p = page(d, "2026-11-02", "2026-11-15");
    // 3 promoters, 1 passive and 1 detractor of 5 scores: 60% − 20%.
    expect(p.nps).toEqual({ answers: 5, notNow: 1, promoters: 3, detractors: 1, score: 40 });
    expect(p.tiles.nps).toMatchObject({
      value: 40,
      prev: null,
      blocked: null,
      foot: "5 answers, 16.7% “Not now”",
    });
  });

  it("counts the starter chips of the range's new chats, their share, and which became a real conversation", () => {
    const d = data(
      [],
      [
        ...chat({ anon: "a" }, "2026-11-03T10:00:00Z", 3, 0),
        ...chat({ anon: "b" }, "2026-11-03T10:00:00Z", 1, 0),
        ...chat({ anon: "c" }, "2026-11-04T10:00:00Z", 4, 3),
        ...chat({ anon: "d" }, "2026-11-05T10:00:00Z", 2, -1),
        // A crisis first message records no chip; a chat before the range isn't the range's.
        ...chat({ anon: "e" }, "2026-11-05T10:00:00Z", 3, null),
        ...chat({ anon: "f" }, "2026-10-05T10:00:00Z", 3, 0),
      ]
    );
    const rows = page(d, "2026-11-02", "2026-11-15").chips;
    const [chip0, , , chip3] = miraConfig.starterChips;
    expect(rows).toHaveLength(miraConfig.starterChips.length + 1);
    expect(rows[0]).toEqual({ label: chip0, chats: 2, share: 0.5, real: 0.5 });
    expect(rows[1]).toEqual({ label: chip3, chats: 1, share: 0.25, real: 1 });
    expect(rows.at(-1)).toEqual({ label: "Their own words", chats: 1, share: 0.25, real: 0 });
    expect(rows.slice(2, -1).every((r) => r.chats === 0 && r.real === null)).toBe(true);
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
        ...chat({ user: "s1" }, "2026-11-04T10:00:00Z", 3),
        ev("rating", { user: "s1" }, "2026-11-04T10:05:00Z", -1),
        ...chat({ anon: "visitor" }, "2026-11-05T10:00:00Z", 3),
        // A deleted account's chat: no link left, so its messages make no conversation.
        ...chat({}, "2026-11-06T10:00:00Z", 3),
      ]
    );
    const p = page(d, "2026-11-02", "2026-11-15");
    expect(p.tiles.conversations).toMatchObject({ value: 1, foot: "by 1 person" });
    expect(p.tiles.signups!.value).toBe(1);
    expect(p.tiles.helpful!.value).toBeNull();
    expect(p.knows).toEqual({
      accounts: 1,
      rootCause: 0,
      baseline: 0,
      goals: 0,
      style: 1,
      result: 0,
      depth: 0.2,
    });
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

  it("reads daily time spent from the gaps of 5 minutes or less between an account's messages, per day, then over the days", () => {
    const say = (who: { anon?: string; user?: string }, at: string) => ev("message_sent", who, at);
    const u1 = { user: "u1" };
    const u2 = { user: "u2" };
    const d = data(
      [
        account("u1", "a@example.com", "2026-11-01T09:00:00Z"),
        account("u2", "b@example.com", "2026-11-01T09:00:00Z"),
      ],
      [
        // 2 Nov: u1 3 + 3 + 4 minutes (the 14-minute gap isn't time with Mira); u2 one message.
        say(u1, "2026-11-02T10:00:00Z"),
        say(u1, "2026-11-02T10:03:00Z"),
        say(u1, "2026-11-02T10:06:00Z"),
        say(u1, "2026-11-02T10:20:00Z"),
        say(u1, "2026-11-02T10:24:00Z"),
        say(u2, "2026-11-02T11:00:00Z"),
        // 3 Nov: u1 alone, one minute.
        say(u1, "2026-11-03T10:00:00Z"),
        say(u1, "2026-11-03T10:01:00Z"),
        // A browser that never signed in is no account.
        say({ anon: "x" }, "2026-11-03T10:00:00Z"),
        say({ anon: "x" }, "2026-11-03T10:04:00Z"),
      ]
    );
    // 2 Nov: (10 + 0) / 2 = 5 minutes; 3 Nov: 1 minute; nobody wrote on the other days.
    expect(page(d, "2026-11-02", "2026-11-08").tiles.timeSpent).toMatchObject({
      unit: "mmss",
      value: 3 * 60_000,
      blocked: null,
    });
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
        ...chat({ user: "u1" }, "2026-11-02T10:00:00Z", 3),
        ...chat({ user: "u2" }, "2026-11-04T10:00:00Z", 3),
        ...chat({ user: "u1" }, "2026-12-01T10:00:00Z", 3),
        ...chat({ user: "u3" }, "2026-12-01T10:00:00Z", 3),
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
        ...chat({ anon: "a" }, "2026-11-10T10:00:00Z", 3),
        ...chat({ anon: "b" }, "2026-11-18T10:00:00Z", 3),
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

  it("counts nudges by kind: opens of the delivered, clicks, conversations and their messages, and unsubscribes", () => {
    const d = data(
      [
        account("u1", "a@example.com", "2026-11-02T09:00:00Z"),
        account("u2", "b@example.com", "2026-11-02T09:00:00Z"),
        account("s1", "eman@loveiq.org", "2026-11-02T09:00:00Z"),
      ],
      [
        // After the agreement nudge's click: 3 messages, then one after a 40-minute gap.
        ...chat({ user: "u1" }, "2026-11-10T10:00:00Z", 3),
        ev("message_sent", { user: "u1" }, "2026-11-10T10:42:00Z"),
        // A pause after the agreement nudge, a stop after the share one; fewer nudges isn't one.
        ev("nudge_prefs_saved", { user: "u1" }, "2026-11-10T08:00:00Z", "pause"),
        ev("nudge_prefs_saved", { user: "u1" }, "2026-11-10T08:30:00Z", "twice_weekly"),
        ev("nudge_stopped", { user: "u1" }, "2026-11-12T08:00:00Z"),
        ev("nudge_stopped", { user: "s1" }, "2026-11-12T08:00:00Z"),
      ],
      [],
      [
        nudge("u1", "agreement", "2026-11-10T07:00:00Z", {
          opened_at: "2026-11-10T07:30:00Z",
          clicked_at: "2026-11-10T09:30:00Z",
        }),
        nudge("u1", "share", "2026-11-11T07:00:00Z", { clicked_at: "2026-11-11T08:00:00Z" }),
        nudge("u2", "progress", "2026-11-12T07:00:00Z"),
        // An open without a delivery isn't counted.
        nudge("u2", "celebrate", "2026-11-13T07:00:00Z", {
          delivered_at: null,
          opened_at: "2026-11-13T07:05:00Z",
        }),
        nudge("u1", "share", "2026-11-20T07:00:00Z"),
        nudge("s1", "share", "2026-11-10T07:00:00Z", { clicked_at: "2026-11-10T07:05:00Z" }),
      ]
    );
    const p = page(d, "2026-11-09", "2026-11-15");
    expect(p.tiles.nudgesSent!.value).toBe(4);
    expect(p.tiles.nudgeOpen).toMatchObject({
      value: 1 / 3,
      blocked: null,
      foot: "1 of 3 delivered were opened",
    });
    expect(p.tiles.nudgeCtr!.value).toBe(0.5);
    expect(p.tiles.nudgeStarted!.value).toBe(0.25);
    expect(p.tiles.nudgeMessages!.value).toBe(3);
    expect(p.tiles.nudgeUnsub).toMatchObject({
      value: 2 / 3,
      foot: "2 of 3 delivered were followed by a stop or pause",
      // Fewer stops is better: a falling unsubscribe rate shows green, not red.
      goodWhen: "down",
    });
    expect(p.tiles.nudgeCtr!.goodWhen).toBe("up");
    const kind = (type: string) => p.nudgeTypes.find((t) => t.type === type);
    expect(kind("agreement")).toMatchObject({
      sent: 1,
      delivered: 1,
      opened: 1,
      clicked: 1,
      started: 1,
      messages: 3,
      stopped: 1,
    });
    expect(kind("share")).toMatchObject({
      sent: 1,
      delivered: 1,
      opened: 0,
      clicked: 1,
      started: 0,
      messages: 0,
      stopped: 1,
    });
    expect(kind("progress")).toMatchObject({ sent: 1, delivered: 1, stopped: 0 });
    expect(kind("celebrate")).toMatchObject({ sent: 1, delivered: 0, opened: 0 });
  });

  it("counts as reactivated the people a nudge found 7+ days away who wrote within 48 h of it", () => {
    const say = (user: string, at: string) => ev("message_sent", { user }, at);
    const d = data(
      ["u1", "u2", "u3"].map((u) => account(u, `${u}@example.com`, "2026-10-01T09:00:00Z")),
      [
        say("u1", "2026-11-01T10:00:00Z"),
        say("u1", "2026-11-10T10:00:00Z"),
        say("u2", "2026-11-08T10:00:00Z"),
        say("u2", "2026-11-09T12:00:00Z"),
        say("u3", "2026-10-25T10:00:00Z"),
        say("u3", "2026-11-13T10:00:00Z"),
      ],
      [],
      [
        // u1: 8 days away, back 27 h later; its second nudge finds it active, so it counts once.
        nudge("u1", "share", "2026-11-09T07:00:00Z"),
        nudge("u1", "share", "2026-11-12T07:00:00Z"),
        // u2 wrote the day before: not away. u3 is away but back only after 3 days.
        nudge("u2", "share", "2026-11-09T07:00:00Z"),
        nudge("u3", "share", "2026-11-10T07:00:00Z"),
      ]
    );
    expect(page(d, "2026-11-09", "2026-11-15").tiles.reactivated).toMatchObject({
      value: 0.5,
      foot: "1 of 2 away 7+ days wrote within 48 h",
    });
  });

  it("leaves not measured only what nothing records, each with its reason", () => {
    const p = page(PEOPLE, "2026-11-02", "2026-11-15");
    for (const k of ["subscription", "churn"]) {
      expect(p.tiles[k]).toMatchObject({
        value: null,
        blocked: expect.stringMatching(/^Not measured yet: \S/),
      });
    }
    for (const k of [
      "nps",
      "timeSpent",
      "nudgeOpen",
      "nudgeMessages",
      "reactivated",
      "bodyImage",
      "profileDepth",
    ]) {
      expect(p.tiles[k]!.blocked).toBeNull();
    }
  });
});

describe("Mira's outcomes", () => {
  const check = (user_id: string, created_at: string, score: number) => ({
    user_id,
    created_at,
    score,
  });
  const u = (id: string) => account(id, `${id}@example.com`, "2026-10-01T09:00:00Z");

  it("counts a four-week body check against the person's first, improved or worse past the scale's noise", () => {
    const d = data(
      [u("u1"), u("u2"), u("u3"), u("u4"), u("u5")],
      [],
      [],
      [],
      [
        // 3.5 → 4.3 is 0.8 exactly, not 0.7999…: improved.
        check("u1", "2026-10-01T10:00:00Z", 3.5),
        check("u1", "2026-11-05T10:00:00Z", 4.3),
        // Down 1.0: worse.
        check("u2", "2026-10-01T10:00:00Z", 3.8),
        check("u2", "2026-11-06T10:00:00Z", 2.8),
        // Up 0.7: no clear change.
        check("u3", "2026-10-01T10:00:00Z", 3.0),
        check("u3", "2026-11-07T10:00:00Z", 3.7),
        // Only 27 days later: no four-week check yet.
        check("u4", "2026-10-12T10:00:00Z", 2.0),
        check("u4", "2026-11-08T09:00:00Z", 4.5),
        // The four-week check is outside the range.
        check("u5", "2026-09-01T10:00:00Z", 2.0),
        check("u5", "2026-10-20T10:00:00Z", 4.5),
      ]
    );
    const p = page(d, "2026-11-02", "2026-11-15");
    expect(p.bodyCheck).toMatchObject({ pairs: 3, improved: 1, worse: 1, reliableChange: 0.8 });
    expect(p.bodyCheck.change).toBeCloseTo((0.8 - 1.0 + 0.7) / 3);
    expect(p.tiles.bodyImage!.value).toBeCloseTo(1 / 3);
    expect(p.tiles.bodyImage!.foot).toBe("1 of 3 four-week body checks improved");
    // First checks and four-week checks finished in the range.
    expect(p.bodyCheck).toMatchObject({ baselines: 0, followUps: 4 });
  });

  it("counts profile depth over five areas, with intake answers given before signing up", () => {
    const d = data(
      [
        account("u1", "a@example.com", "2026-11-03T12:00:00Z", { style: { tone: 2 } }),
        account("u2", "b@example.com", "2026-11-03T12:00:00Z"),
      ],
      [
        ev("intake_answered", { anon: "browser-1" }, "2026-11-03T10:00:00Z", "where"),
        ev("intake_answered", { anon: "browser-1" }, "2026-11-03T10:05:00Z", "onset"),
        ev("intake_answered", { anon: "browser-1" }, "2026-11-03T10:06:00Z", "change"),
        ev("signup_completed", { anon: "browser-1", user: "u1" }, "2026-11-03T12:00:00Z", "email"),
        // u2 answered only one of the two root-cause questions.
        ev("intake_answered", { user: "u2" }, "2026-11-04T10:00:00Z", "onset"),
      ],
      ["u1"],
      [],
      [check("u1", "2026-11-04T10:00:00Z", 3.2)]
    );
    const p = page(d, "2026-11-02", "2026-11-15");
    expect(p.knows).toEqual({
      accounts: 2,
      rootCause: 1,
      baseline: 1,
      goals: 1,
      style: 1,
      result: 1,
      depth: (5 / 5 + 0 / 5) / 2,
    });
    expect(p.tiles.profileDepth).toMatchObject({ value: 0.5, prev: null, blocked: null });
  });

  it("reads topics as shares of the range's labelled own-words chats, with the trend against before", () => {
    const d = data(
      [],
      [
        ...chat({ anon: "a1" }, "2026-11-03T10:00:00Z"),
        ev("chat_topic", { anon: "a1" }, "2026-11-03T10:00:01Z", "hiding"),
        ...chat({ anon: "a2" }, "2026-11-04T10:00:00Z"),
        ev("chat_topic", { anon: "a2" }, "2026-11-04T10:00:01Z", "hiding"),
        ...chat({ anon: "a3" }, "2026-11-05T10:00:00Z"),
        ev("chat_topic", { anon: "a3" }, "2026-11-05T10:00:01Z", "other"),
        // An own-words chat without a topic, and a starter chip's chat (never a topic).
        ...chat({ anon: "a4" }, "2026-11-06T10:00:00Z"),
        ...chat({ anon: "a5" }, "2026-11-06T11:00:00Z", 1, 2),
        // The week before (compared: Mira's records start by its first day): one "weight".
        ev("chat_opened", { anon: "a0" }, "2026-10-26T08:00:00Z"),
        ...chat({ anon: "a6" }, "2026-10-28T10:00:00Z"),
        ev("chat_topic", { anon: "a6" }, "2026-10-28T10:00:01Z", "weight"),
      ]
    );
    const p = buildMiraPage({
      data: d,
      filters: parseFilters({ period: "custom", from: "2026-11-02", to: "2026-11-08" }, TODAY),
      today: TODAY,
      now: new Date(`${TODAY}T12:00:00Z`),
    });
    const row = (id: string) => p.topics.find((t) => t.id === id)!;
    expect(row("hiding")).toMatchObject({ chats: 2, prevShare: 0 });
    expect(row("hiding").share).toBeCloseTo(2 / 3);
    expect(row("weight")).toMatchObject({ chats: 0, share: 0, prevShare: 1 });
    expect(p.topics.at(-1)!.id).toBe("other");
    expect(p.topics[0]!.id).toBe("hiding");
    expect(p.untopical).toBe(1);
  });

  it("counts a referral once per person and conversation, in the range it was made", () => {
    const d = data(
      [],
      [
        ev("referred", { anon: "a1" }, "2026-11-03T10:00:00Z"),
        ev("referred", { anon: "a1" }, "2026-11-03T10:20:00Z"), // same conversation
        ev("referred", { anon: "a1" }, "2026-11-03T12:00:00Z"), // a new one
        ev("referred", { anon: "a2" }, "2026-11-03T10:00:00Z"),
        ev("referred", { anon: "a3" }, "2026-10-20T10:00:00Z"), // before the range
      ]
    );
    expect(page(d, "2026-11-02", "2026-11-15").safety.referred).toBe(3);
  });

  it("counts the body check offered and started per person in the range", () => {
    const d = data(
      [u("u1"), u("u2")],
      [
        ev("body_check_offered", { user: "u1" }, "2026-11-03T10:00:00Z"),
        ev("body_check_offered", { user: "u1" }, "2026-11-07T10:00:00Z"),
        ev("body_check_offered", { user: "u2" }, "2026-11-03T10:00:00Z"),
        ev("body_check_started", { user: "u1" }, "2026-11-07T10:01:00Z"),
      ],
      [],
      [],
      [check("u1", "2026-11-07T10:03:00Z", 3)]
    );
    expect(page(d, "2026-11-02", "2026-11-15").bodyCheck).toMatchObject({
      offered: 2,
      started: 1,
      baselines: 1,
      followUps: 0,
      pairs: 0,
      change: null,
    });
  });

  it("leaves the team's body checks out", () => {
    const d = data(
      [account("s1", "eman@loveiq.org", "2026-10-01T09:00:00Z")],
      [],
      [],
      [],
      [check("s1", "2026-10-01T10:00:00Z", 2), check("s1", "2026-11-05T10:00:00Z", 4)]
    );
    expect(page(d, "2026-11-02", "2026-11-15").bodyCheck.pairs).toBe(0);
  });
});

describe("mira_ap_events (supabase/migrations/20261120050000_mira_outcomes.sql)", () => {
  const sql = readFileSync("supabase/migrations/20261120050000_mira_outcomes.sql", "utf8");
  const rollback = readFileSync("supabase/rollbacks/20261120050000_mira_outcomes_down.sql", "utf8");

  it("also answers intake_answered's question and chat_topic's topic; the rollback goes back to 040000", () => {
    expect(sql).toContain("WHEN 'intake_answered' THEN 'q'");
    expect(sql).toContain("WHEN 'chat_topic' THEN 'topic'");
    expect(sql).toContain("ON DELETE CASCADE");
    expect(sql).toMatch(/REVOKE ALL ON public\.mira_body_check FROM PUBLIC, anon, authenticated;/);
    expect(sql).toContain("ENABLE ROW LEVEL SECURITY");
    expect(rollback).not.toContain("intake_answered");
    expect(rollback).toContain("WHEN 'nudge_prefs_saved' THEN 'choice'");
    expect(rollback).toContain("DROP TABLE IF EXISTS public.mira_body_check;");
  });
});

describe("mira_ap_events (supabase/migrations/20261120040000_mira_ap_events_props.sql)", () => {
  const sql = readFileSync("supabase/migrations/20261120040000_mira_ap_events_props.sql", "utf8");
  const rollback = readFileSync(
    "supabase/rollbacks/20261120040000_mira_ap_events_props_down.sql",
    "utf8"
  );

  it("answers the one prop the page reads for each event, and stays the service role's", () => {
    for (const [name, prop] of [
      ["rating", "rating"],
      ["chat_started", "chip"],
      ["signup_completed", "method"],
      ["nps", "score"],
      ["nudge_prefs_saved", "choice"],
    ]) {
      expect(sql).toContain(`WHEN '${name}' THEN '${prop}'`);
    }
    expect(sql).toMatch(/json_build_array\(g\.name, g\.anon_id, g\.user_id, g\.detail, g\.times\)/);
    expect(sql).toMatch(/GROUP BY name, anon_id, user_id, detail/);
    for (const text of [sql, rollback]) {
      expect(text).toContain("CREATE OR REPLACE FUNCTION public.mira_ap_events(p_names text[])");
      expect(text).toMatch(/SECURITY INVOKER\s+SET search_path = public/);
      expect(text).toContain(
        "REVOKE ALL ON FUNCTION public.mira_ap_events(text[]) FROM PUBLIC, anon, authenticated;"
      );
      expect(text).toContain(
        "GRANT EXECUTE ON FUNCTION public.mira_ap_events(text[]) TO service_role;"
      );
    }
    // The rollback is 20261120020000's body again.
    expect(rollback).toContain("props ->> 'rating' AS rating");
  });
});

describe("fetchMira", () => {
  it("asks only for the counted events, the nudges' deliveries and opens, and LoveIQ results by encoded address, the team's left out", async () => {
    database([], (path) => {
      if (path.startsWith("/rest/v1/mira_user"))
        return [
          account("u1", "a+b@example.com", "2026-11-03T12:00:00Z"),
          account("s1", "eman@loveiq.org", "2026-11-03T12:00:00Z"),
          account("u3", "c@example.com", "2026-11-03T12:00:00Z", { use_assessment: false }),
        ];
      if (path.startsWith("/rest/v1/app_user")) return [{ email: "a+b@example.com" }];
      if (path.startsWith("/rest/v1/mira_nudge")) return [];
      if (path.startsWith("/rest/v1/mira_body_check")) return [];
      return null;
    });
    const out = await fetchMira();
    expect(out.withResult).toEqual(new Set(["u1"]));
    const [path, init] = mockSupabaseFetch.mock.calls[0] as [string, { body: string }];
    expect(path).toBe("/rest/v1/rpc/mira_ap_events");
    expect(JSON.parse(init.body).p_names).toEqual([
      "chat_opened",
      "consent_given",
      "chat_started",
      "message_sent",
      "gate_shown",
      "signup_completed",
      "rating",
      "crisis_shown",
      "nps",
      "nudge_prefs_saved",
      "nudge_stopped",
      "intake_answered",
      "chat_topic",
      "referred",
      "body_check_offered",
      "body_check_started",
      "keep_card_shown",
      "keep_card_keep",
      "keep_card_not_now",
      "style_tip_shown",
      "style_tip_opened",
      "style_saved",
      "reply_declined",
      "minor_stop",
    ]);
    const paths = mockFetchAllRows.mock.calls.map((c) => c[0] as string);
    expect(paths.find((p) => p.startsWith("/rest/v1/mira_nudge"))).toContain(
      "select=user_id,type,sent_at,clicked_at,delivered_at,opened_at"
    );
    const lookup = paths.find((p) => p.startsWith("/rest/v1/app_user"))!;
    expect(lookup).toContain(`email=in.(${encodeURIComponent('"a+b@example.com"')})`);
    expect(lookup).not.toContain("loveiq.org");
  });

  it("reads every event in one request however many there are, never row by row", async () => {
    const times = Array.from({ length: 150_001 }, (_, i) => Date.parse("2026-11-03T10:00:00Z") + i);
    database([
      ["message_sent", "browser-a", null, null, times],
      ["chat_started", "browser-a", null, "3", [times[0]]],
    ]);
    const out = await fetchMira();
    expect(out.events).toHaveLength(150_002);
    expect(out.events[150_000]).toEqual({
      name: "message_sent",
      anon_id: "browser-a",
      user_id: null,
      at: times[150_000],
      detail: null,
    });
    expect(out.events[150_001]).toMatchObject({ name: "chat_started", detail: "3" });
    expect(mockSupabaseFetch).toHaveBeenCalledTimes(1);
    expect(mockFetchAllRows.mock.calls.some(([p]) => String(p).includes("mira_event"))).toBe(false);
  });

  it("counts exactly what it counted from the rows themselves", async () => {
    database(grouped(PEOPLE.events), (path) =>
      path.startsWith("/rest/v1/mira_user") ? PEOPLE.users : []
    );
    const read = await fetchMira();
    for (const [from, to] of [
      ["2026-11-02", "2026-11-15"],
      ["2026-10-01", "2026-12-13"],
    ] as const) {
      expect(page(read, from, to)).toEqual(page(PEOPLE, from, to));
    }
  });

  it("fails rather than count part of the events", async () => {
    database([]);
    mockSupabaseFetch.mockResolvedValueOnce(new Response("timeout", { status: 500 }));
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
    database(grouped(PEOPLE.events), (path) =>
      path.startsWith("/rest/v1/mira_user") ? PEOPLE.users : []
    );
    const res = await GET(new Request(url));
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toMatch(/no-store/);
    const body = (await res.json()) as { tiles: Record<string, { value: number }> };
    expect(body.tiles.conversations!.value).toBe(3);
  });
});
