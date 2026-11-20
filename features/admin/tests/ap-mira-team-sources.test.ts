import { readFileSync } from "node:fs";
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
import { __resetStaffEmailRegexForTests } from "@shared/env/staff-email";

/** Team traffic (loveiq_team / loveiq_probe browsers) and "Where people came from", 21 Nov 2026. */

const TODAY = "2026-12-20";
type Who = { anon?: string; user?: string };

const ev = (
  name: string,
  who: Who,
  at: string,
  extra: { detail?: string; team?: true; source?: string } = {}
): MiraEventRow => ({
  name,
  anon_id: who.anon ?? null,
  user_id: who.user ?? null,
  at: Date.parse(at),
  detail: extra.detail ?? null,
  ...(extra.team ? { team: true as const } : {}),
  ...(extra.source ? { source: extra.source } : {}),
});

/** A chat: its start (own words) and `n` messages a minute apart. */
const chat = (who: Who, at: string, n: number, extra: { team?: true; source?: string } = {}) => {
  const t = Date.parse(at);
  return [
    ev("chat_started", who, at, { detail: "-1", ...extra }),
    ...Array.from({ length: n }, (_, i) =>
      ev("message_sent", who, new Date(t + i * 60_000).toISOString(), { team: extra.team })
    ),
  ];
};

const account = (id: string, email: string, at: string, over: Partial<MiraUserRow> = {}) => ({
  id,
  email,
  created_at: at,
  style: { tone: 3 },
  use_assessment: true,
  ...over,
});

const data = (
  users: MiraUserRow[],
  events: MiraEventRow[],
  more: Partial<MiraData> = {}
): MiraData => ({ users, events, nudges: [], bodyChecks: [], withResult: new Set(), ...more });

const page = (d: MiraData, from = "2026-11-21", to = "2026-11-30") =>
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

describe("team traffic on AP › Mira", () => {
  // A real visitor and a real account, then the team: Lea's personal Gmail account signed in
  // from a team browser (is_team); a browser that chatted before it was marked as team and
  // after; Max's account, signed in before his browser was marked, writing from it after; Sam's
  // account, marked is_team by hand for testing before 21 Nov (none of its events is marked); and
  // a rating left by a team browser whose account has since been deleted (no links left).
  const visitor = { anon: "visitor" };
  const leaBrowser = { anon: "lea-browser" };
  const lea = { user: "t1" };
  const marked = { anon: "marked-later" };
  const max = { user: "t2" };
  const REAL = [
    ev("chat_opened", visitor, "2026-11-22T10:00:00Z", { source: "instagram" }),
    ...chat(visitor, "2026-11-22T10:01:00Z", 3),
    ev("rating", visitor, "2026-11-22T10:05:00Z", { detail: "1" }),
    ev("chat_opened", { user: "u1" }, "2026-11-23T10:00:00Z", { source: "newsletter" }),
    ...chat({ user: "u1" }, "2026-11-23T10:01:00Z", 3),
  ];
  const TEAM = [
    ev("chat_opened", leaBrowser, "2026-11-22T09:00:00Z", { team: true, source: "direct" }),
    ...chat(leaBrowser, "2026-11-22T09:01:00Z", 3, { team: true }),
    ev("signup_completed", { ...leaBrowser, ...lea }, "2026-11-22T09:10:00Z", {
      detail: "google",
      team: true,
    }),
    ...chat(lea, "2026-11-23T09:00:00Z", 4, { team: true }),
    ev("rating", lea, "2026-11-23T09:05:00Z", { detail: "-1", team: true }),
    ev("nps", lea, "2026-11-23T09:06:00Z", { detail: "0", team: true }),
    ev("chat_topic", lea, "2026-11-23T09:00:01Z", { detail: "hiding", team: true }),
    ev("intake_answered", lea, "2026-11-23T09:00:02Z", { detail: "change", team: true }),
    // Before the browser was marked: nothing flags these events themselves.
    ev("chat_opened", marked, "2026-11-24T09:00:00Z"),
    ...chat(marked, "2026-11-24T09:01:00Z", 3),
    ev("gate_shown", marked, "2026-11-24T09:30:00Z"),
    ev("chat_opened", marked, "2026-11-25T09:00:00Z", { team: true }),
    // Max signed in from an ordinary browser, then wrote from his marked one.
    ev("chat_opened", max, "2026-11-24T08:00:00Z"),
    ...chat(max, "2026-11-24T08:01:00Z", 3),
    ev("chat_opened", max, "2026-11-26T08:00:00Z", { team: true }),
    ev("rating", {}, "2026-11-27T08:00:00Z", { detail: "-1", team: true }),
    ev("chat_opened", { user: "t3" }, "2026-11-25T08:00:00Z", { source: "direct" }),
    ...chat({ user: "t3" }, "2026-11-25T08:01:00Z", 3),
  ];
  const USERS = [
    account("u1", "real@example.com", "2026-11-23T08:00:00Z"),
    account("t1", "lea.private@gmail.com", "2026-11-22T09:10:00Z", { is_team: true }),
    account("t2", "max.private@gmail.com", "2026-11-20T08:00:00Z"),
    account("t3", "sam.private@gmail.com", "2026-11-25T07:00:00Z", { is_team: true }),
  ];
  const check = (user_id: string, created_at: string, score: number) => ({
    user_id,
    created_at,
    score,
  });

  it("leaves out team accounts, team browsers and all they did before they were marked", () => {
    const withTeam = page(
      data(USERS, [...REAL, ...TEAM], {
        bodyChecks: [
          check("t1", "2026-10-20T10:00:00Z", 2),
          check("t1", "2026-11-22T10:00:00Z", 4),
        ],
        nudges: [
          {
            user_id: "t1",
            type: "agreement",
            sent_at: "2026-11-24T07:00:00Z",
            clicked_at: "2026-11-24T07:30:00Z",
            delivered_at: "2026-11-24T07:00:05Z",
            opened_at: "2026-11-24T07:10:00Z",
          },
        ],
        withResult: new Set(["t1"]),
      })
    );
    const realOnly = page(data([USERS[0]!], REAL));
    // Everything the page counts reads as if the team had never been there.
    expect({ ...withTeam, generatedAt: null }).toEqual({ ...realOnly, generatedAt: null });
    expect(withTeam.tiles.conversations).toMatchObject({ value: 2, foot: "by 2 people" });
    expect(withTeam.tiles.signups!.value).toBe(1);
    expect(withTeam.funnel[0]).toMatchObject({ key: "opened", n: 2 });
    expect(withTeam.gate).toBe(0);
    expect(withTeam.tiles.helpful!.value).toBe(1);
    expect(withTeam.nps.answers).toBe(0);
    expect(withTeam.bodyCheck.pairs).toBe(0);
    expect(withTeam.tiles.nudgesSent!.value).toBe(0);
    expect(withTeam.knows.accounts).toBe(1);
    expect(withTeam.topics.every((t) => t.chats === 0)).toBe(true);
  });
});

describe("Where people came from", () => {
  const people = (n: number, prefix: string, at: string, source?: string) =>
    Array.from({ length: n }, (_, i) =>
      ev("chat_opened", { anon: `${prefix}-${i}` }, at, source ? { source } : {})
    );

  it("counts the range's openers under their first recorded source, with who chatted and signed up", () => {
    const a = { anon: "a" };
    const d = data(
      [
        account("u1", "a@example.com", "2026-11-23T12:00:00Z"),
        account("u2", "b@example.com", "2026-11-24T12:00:00Z"),
      ],
      [
        // Instagram: opens, chats and signs up in the range, then opens again signed in.
        ev("chat_opened", a, "2026-11-23T10:00:00Z", { source: "instagram" }),
        ...chat(a, "2026-11-23T10:01:00Z", 1, { source: "instagram" }),
        ev("signup_completed", { ...a, user: "u1" }, "2026-11-23T12:00:00Z", {
          detail: "email",
          source: "instagram",
        }),
        ev("chat_opened", { user: "u1" }, "2026-11-24T10:00:00Z", { source: "instagram" }),
        ...people(1, "ig", "2026-11-23T11:00:00Z", "instagram"),
        // An AI assistant's link, a direct visit, and one from before sources were recorded.
        ev("chat_opened", { anon: "b" }, "2026-11-25T10:00:00Z", { source: "chatgpt.com" }),
        ...chat({ anon: "b" }, "2026-11-25T10:01:00Z", 2, { source: "chatgpt.com" }),
        ev("chat_opened", { anon: "c" }, "2026-11-25T11:00:00Z", { source: "direct" }),
        ev("chat_opened", { anon: "d" }, "2026-11-25T12:00:00Z"),
        // First came from the newsletter before the range, back from Instagram in it.
        ev("chat_opened", { anon: "e" }, "2026-11-10T10:00:00Z", { source: "newsletter" }),
        ev("chat_opened", { anon: "e" }, "2026-11-26T10:00:00Z", { source: "instagram" }),
        // Opened only before the range; and an account created without opening Mira in it.
        ev("chat_opened", { anon: "f" }, "2026-11-10T10:00:00Z", { source: "tiktok" }),
        ev("signup_completed", { anon: "g", user: "u2" }, "2026-11-24T12:00:00Z", {
          source: "tiktok",
        }),
      ]
    );
    expect(page(d).sources).toEqual([
      { source: "instagram", label: "instagram", opened: 2, started: 1, accounts: 1, rate: 0.5 },
      { source: "chatgpt.com", label: "chatgpt.com", opened: 1, started: 1, accounts: 0, rate: 0 },
      { source: "direct", label: "Direct", opened: 1, started: 0, accounts: 0, rate: 0 },
      { source: "newsletter", label: "newsletter", opened: 1, started: 0, accounts: 0, rate: 0 },
      { source: null, label: "Not recorded", opened: 1, started: 0, accounts: 0, rate: 0 },
    ]);
    // The openers are the funnel's first step, whatever their source.
    expect(page(d).funnel[0]!.n).toBe(6);
    expect(page(d, "2026-12-01", "2026-12-10").sources).toEqual([]);
  });
});

describe("the “Keep this chat” card and the two safety stops", () => {
  it("counts the card's people: shown, Keep, a new account after it, and Not now", () => {
    const k = (n: number) => ({ anon: `k${n}` });
    const d = data(
      [
        account("u1", "a@example.com", "2026-11-22T10:05:00Z"),
        account("u2", "b@example.com", "2026-11-01T10:00:00Z"),
        account("u6", "c@example.com", "2026-12-02T10:00:00Z"),
      ],
      [
        // Keeps the chat and signs up five minutes later.
        ev("keep_card_shown", k(1), "2026-11-22T10:00:00Z"),
        ev("keep_card_keep", k(1), "2026-11-22T10:01:00Z"),
        ev("signup_completed", { ...k(1), user: "u1" }, "2026-11-22T10:05:00Z", {
          detail: "email",
        }),
        // Taps Keep and goes no further; taps Not now; signs in to an older account.
        ev("keep_card_shown", k(2), "2026-11-23T10:00:00Z"),
        ev("keep_card_keep", k(2), "2026-11-23T10:01:00Z"),
        ev("keep_card_shown", k(3), "2026-11-24T10:00:00Z"),
        ev("keep_card_not_now", k(3), "2026-11-24T10:00:30Z"),
        ev("keep_card_shown", k(4), "2026-11-25T10:00:00Z"),
        ev("keep_card_keep", k(4), "2026-11-25T10:01:00Z"),
        ev("signup_completed", { ...k(4), user: "u2" }, "2026-11-25T10:05:00Z", {
          detail: "google",
        }),
        // Shown before the range; signs up after it; a team browser.
        ev("keep_card_shown", k(5), "2026-11-19T10:00:00Z"),
        ev("keep_card_keep", k(5), "2026-11-22T10:01:00Z"),
        ev("keep_card_shown", k(6), "2026-11-29T10:00:00Z"),
        ev("keep_card_keep", k(6), "2026-11-29T10:01:00Z"),
        ev("signup_completed", { ...k(6), user: "u6" }, "2026-12-02T10:00:00Z"),
        ev("keep_card_shown", k(7), "2026-11-26T10:00:00Z", { team: true }),
        ev("keep_card_keep", k(7), "2026-11-26T10:01:00Z", { team: true }),
      ]
    );
    expect(page(d).keepCard).toEqual({ shown: 5, kept: 4, accounts: 1, notNow: 1 });
    expect(page(d, "2026-12-01", "2026-12-10").keepCard).toEqual({
      shown: 0,
      kept: 0,
      accounts: 0,
      notNow: 0,
    });
  });

  it("counts declined replies and under-18 stops in the range, the team's left out", () => {
    const d = data(
      [],
      [
        ...chat({ anon: "a" }, "2026-11-22T10:00:00Z", 3),
        ev("reply_declined", { anon: "a" }, "2026-11-22T10:04:00Z"),
        ev("reply_declined", { anon: "t" }, "2026-11-22T11:00:00Z", { team: true }),
        ev("reply_declined", { anon: "b" }, "2026-11-10T10:00:00Z"),
        ev("minor_stop", { anon: "c" }, "2026-11-23T10:00:00Z"),
        ev("minor_stop", { anon: "c" }, "2026-11-23T10:00:05Z"),
      ]
    );
    expect(page(d).safety).toMatchObject({ conversations: 1, declined: 1, minorStops: 2 });
  });
});

describe("fetchMira", () => {
  it("reads is_team, each group's team mark and source, and asks no LoveIQ result for the team", async () => {
    const t = Date.parse("2026-11-22T10:00:00Z");
    mockSupabaseFetch.mockResolvedValue(
      new Response(
        JSON.stringify([
          ["chat_opened", "b1", null, null, [t], false, "instagram", null],
          ["chat_opened", "b2", null, null, [t], false, "", "www.chatgpt.com"],
          ["chat_opened", "b3", null, null, [t], false, "", null],
          ["chat_opened", "b4", null, null, [t], false, null, null],
          ["message_sent", "b5", null, null, [t, t + 1], true, null, null],
        ]),
        { status: 200 }
      )
    );
    mockFetchAllRows.mockImplementation(async (path: string) => {
      if (path.startsWith("/rest/v1/mira_user"))
        return [
          account("u1", "real@example.com", "2026-11-22T10:00:00Z"),
          account("t1", "lea@gmail.com", "2026-11-22T10:00:00Z", { is_team: true }),
        ];
      if (path.startsWith("/rest/v1/app_user")) return [];
      return [];
    });
    const out = await fetchMira();
    const paths = mockFetchAllRows.mock.calls.map((c) => c[0] as string);
    expect(paths.find((p) => p.startsWith("/rest/v1/mira_user"))).toContain(
      "select=id,email,created_at,style,use_assessment,is_team"
    );
    const lookup = paths.find((p) => p.startsWith("/rest/v1/app_user"))!;
    expect(lookup).toContain("real%40example.com");
    expect(lookup).not.toContain("lea%40gmail.com");
    expect(out.events.map((e) => [e.anon_id, e.source ?? null, e.team ?? false])).toEqual([
      ["b1", "instagram", false],
      ["b2", "chatgpt.com", false],
      ["b3", "direct", false],
      ["b4", null, false],
      ["b5", null, true],
      ["b5", null, true],
    ]);
  });
});

describe("mira_ap_events (supabase/migrations/20261121030000_mira_team_and_source.sql)", () => {
  const sql = readFileSync("supabase/migrations/20261121030000_mira_team_and_source.sql", "utf8");
  const rollback = readFileSync(
    "supabase/rollbacks/20261121030000_mira_team_and_source_down.sql",
    "utf8"
  );

  it("adds is_team and answers each group's team mark and source; the rollback goes back to 050000", () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS is_team boolean NOT NULL DEFAULT false;/);
    expect(sql).toContain(
      "json_build_array(g.name, g.anon_id, g.user_id, g.detail, g.times, g.team, g.source, g.referrer_host)"
    );
    expect(sql).toContain("coalesce(props ->> 'team' = 'true', false) AS team");
    expect(sql).toMatch(
      /WHEN name IN \('chat_opened', 'chat_started', 'signup_completed'\) AND props \? 'source'\s+THEN coalesce\(props ->> 'source', ''\)/
    );
    expect(sql).toContain("GROUP BY name, anon_id, user_id, detail, team, source, referrer_host");
    // Every prop the page read before is still answered.
    for (const [name, prop] of [
      ["rating", "rating"],
      ["chat_started", "chip"],
      ["signup_completed", "method"],
      ["nps", "score"],
      ["nudge_prefs_saved", "choice"],
      ["intake_answered", "q"],
      ["chat_topic", "topic"],
    ]) {
      expect(sql).toContain(`WHEN '${name}' THEN '${prop}'`);
      expect(rollback).toContain(`WHEN '${name}' THEN '${prop}'`);
    }
    for (const text of [sql, rollback]) {
      expect(text).toMatch(/SECURITY INVOKER\s+SET search_path = public/);
      expect(text).toContain(
        "REVOKE ALL ON FUNCTION public.mira_ap_events(text[]) FROM PUBLIC, anon, authenticated;"
      );
      expect(text).toContain(
        "GRANT EXECUTE ON FUNCTION public.mira_ap_events(text[]) TO service_role;"
      );
    }
    expect(rollback).toMatch(
      /json_build_array\(g\.name, g\.anon_id, g\.user_id, g\.detail, g\.times\) ORDER BY/
    );
    expect(rollback).toContain("ALTER TABLE public.mira_user DROP COLUMN IF EXISTS is_team;");
  });
});
