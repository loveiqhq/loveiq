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

/** AP › Mira's "Coaches & picks" card (22 Nov 2026): demand per coach, the finder, picks, the guide. */

const TODAY = "2026-12-20";
type Who = { anon?: string; user?: string };
const ev = (
  name: string,
  who: Who,
  at: string,
  extra: { detail?: string; team?: true } = {}
): MiraEventRow => ({
  name,
  anon_id: who.anon ?? null,
  user_id: who.user ?? null,
  at: Date.parse(at),
  detail: extra.detail ?? null,
  ...(extra.team ? { team: true as const } : {}),
});
const account = (id: string, email: string): MiraUserRow => ({
  id,
  email,
  created_at: "2026-11-20T09:00:00Z",
  style: {},
  use_assessment: false,
});
const data = (users: MiraUserRow[], events: MiraEventRow[]): MiraData => ({
  users,
  events,
  nudges: [],
  bodyChecks: [],
  withResult: new Set(),
});
const card = (d: MiraData, from = "2026-11-22", to = "2026-11-30") =>
  buildMiraPage({
    data: d,
    filters: parseFilters({ period: "custom", from, to }, TODAY),
    today: TODAY,
    now: new Date(`${TODAY}T12:00:00Z`),
  }).coaches;

const lea = { user: "u1" };
const max = { user: "u2" };
const visitor = { anon: "visitor-browser-1234" };
const sam = { user: "t1" };

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.ADMIN_TEST_EMAIL_REGEX;
  __resetStaffEmailRegexForTests();
});

describe("Coaches & picks on AP › Mira", () => {
  const USERS = [
    account("u1", "lea@example.com"),
    account("u2", "max@example.com"),
    account("t1", "sam@loveiq.org"),
  ];
  const EVENTS = [
    // Before the range: Max asked about Jonas on Home's old card (its label, not the id).
    ev("notify_me", max, "2026-11-20T10:00:00Z", { detail: "Libido challenges" }),
    ev("coaches_viewed", lea, "2026-11-23T10:00:00Z"),
    ev("coaches_viewed", lea, "2026-11-24T10:00:00Z"),
    ev("coaches_viewed", max, "2026-11-24T11:00:00Z"),
    ev("notify_me", lea, "2026-11-23T10:01:00Z", { detail: "jonas" }),
    ev("notify_me", lea, "2026-11-23T10:02:00Z", { detail: "jonas" }),
    ev("notify_me", lea, "2026-11-23T10:03:00Z", { detail: "lena" }),
    ev("finder_started", lea, "2026-11-23T10:04:00Z"),
    ev("finder_done", lea, "2026-11-23T10:05:00Z", { detail: "elif" }),
    ev("finder_started", max, "2026-11-24T11:01:00Z"),
    ev("picks_shown", lea, "2026-11-25T08:00:00Z", { detail: "chats" }),
    ev("picks_shown", lea, "2026-11-26T08:00:00Z", { detail: "chats" }),
    ev("picks_shown", max, "2026-11-26T09:00:00Z", { detail: "start" }),
    ev("pick_clicked", lea, "2026-11-26T08:01:00Z", { detail: "practice-3" }),
    // The guide, anonymous: opened from practice 3, then a chat started 2 minutes later.
    ev("guide_ask", visitor, "2026-11-27T20:00:00Z", { detail: "3" }),
    ev("chat_started", visitor, "2026-11-27T20:02:00Z", { detail: "-1" }),
    ev("guide_ask", max, "2026-11-27T21:00:00Z", { detail: "3" }),
    ev("guide_ask", lea, "2026-11-28T09:00:00Z", { detail: "6" }),
    ev("chat_started", lea, "2026-11-28T10:30:00Z", { detail: "-1" }),
    ev("search_empty", lea, "2026-11-28T09:30:00Z", { detail: "home" }),
    ev("search_empty", max, "2026-11-28T09:40:00Z", { detail: "roster" }),
    // The team: a staff address and a team browser, left out like everywhere on the page.
    ev("notify_me", sam, "2026-11-23T12:00:00Z", { detail: "jonas" }),
    ev("coaches_viewed", { anon: "team-browser-123456" }, "2026-11-23T12:00:00Z", { team: true }),
    ev("notify_me", { user: "u9" }, "2026-11-23T12:00:00Z", { detail: "theo", team: true }),
  ];

  it("counts Notify me per coach, as people, in the range and since the beta, old labels too", () => {
    const k = card(data(USERS, EVENTS));
    const row = (id: string) => k.notify.find((r) => r.id === id);
    expect(k.notify.map((r) => r.id)).toEqual(["jonas", "lena", "elif", "ana", "theo"]);
    expect(row("jonas")).toMatchObject({ inRange: 1, allTime: 2 });
    expect(row("lena")).toMatchObject({ inRange: 1, allTime: 1 });
    expect(row("theo")).toMatchObject({ inRange: 0, allTime: 0 });
  });

  it("counts the coaches page, the finder and its outcomes, as people", () => {
    const k = card(data(USERS, EVENTS));
    expect(k.roster).toEqual({ views: 3, people: 2 });
    expect(k.finder.started).toBe(2);
    expect(k.finder.done).toBe(1);
    expect(k.finder.outcomes.find((o) => o.id === "elif")?.people).toBe(1);
    expect(k.finder.outcomes.find((o) => o.id === "none")?.label).toBe("No coach yet");
  });

  it("counts Home's picks and their clicks, and searches that found nothing", () => {
    const k = card(data(USERS, EVENTS));
    expect(k.picks).toEqual({
      views: 3,
      personal: 2,
      clicks: 1,
      practiceClicks: 1,
      coachClicks: 0,
    });
    expect(k.emptySearches).toEqual({ home: 1, roster: 1 });
  });

  it("counts “Ask Mira about this” per practice, and the chats it started within 30 minutes", () => {
    const k = card(data(USERS, EVENTS));
    const p = (n: number) => k.guide.find((g) => g.practice === n);
    expect(k.guide).toHaveLength(7);
    expect(p(3)).toMatchObject({ name: "What my body does for me", opened: 2, started: 1 });
    expect(p(6)).toMatchObject({ opened: 1, started: 0 });
  });

  it("asks mira_ap_events for the card's events", async () => {
    mockFetchAllRows.mockResolvedValue([]);
    mockSupabaseFetch.mockResolvedValue({ ok: true, json: async () => [] });
    await fetchMira();
    const names = JSON.parse(String(mockSupabaseFetch.mock.calls[0]![1].body)).p_names;
    for (const n of [
      "coaches_viewed",
      "notify_me",
      "finder_started",
      "finder_done",
      "picks_shown",
      "pick_clicked",
      "guide_ask",
      "search_empty",
    ]) {
      expect(names).toContain(n);
    }
  });
});
