import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@features/admin/server/supabase", () => ({
  supabaseFetch: vi.fn(),
  fetchAllRows: vi.fn(),
  countRows: vi.fn(),
  POSTGREST_MAX_ROWS: 1000,
}));
vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { parseFilters } from "@features/admin/server/ap/filters";
import {
  buildMiraPage,
  type MiraData,
  type MiraEventRow,
  type MiraUserRow,
} from "@features/admin/server/ap/mira";
import { __resetStaffEmailRegexForTests } from "@shared/env/staff-email";

/** AP › Mira's "Weekly sessions" card (21 Nov 2026): booked, in place, reminded, joined, cancelled. */

const TODAY = "2026-12-20";
type Who = { anon?: string; user?: string };
const ev = (name: string, who: Who, at: string, team?: true): MiraEventRow => ({
  name,
  anon_id: who.anon ?? null,
  user_id: who.user ?? null,
  at: Date.parse(at),
  detail: null,
  ...(team ? { team } : {}),
});
const account = (id: string, email: string, over: Partial<MiraUserRow> = {}): MiraUserRow => ({
  id,
  email,
  created_at: "2026-11-01T10:00:00Z",
  style: {},
  use_assessment: false,
  ...over,
});
const data = (users: MiraUserRow[], events: MiraEventRow[]): MiraData => ({
  users,
  events,
  nudges: [],
  bodyChecks: [],
  withResult: new Set(),
});
const page = (d: MiraData, from = "2026-11-21", to = "2026-11-30") =>
  buildMiraPage({
    data: d,
    filters: parseFilters({ period: "custom", from, to }, TODAY),
    today: TODAY,
    now: new Date(`${TODAY}T12:00:00Z`),
  });

beforeEach(() => {
  delete process.env.ADMIN_TEST_EMAIL_REGEX;
  __resetStaffEmailRegexForTests();
});

describe("Weekly sessions on AP › Mira", () => {
  const users = ["a", "b", "c", "d", "e", "f"].map((u) => account(u, `${u}@example.com`));
  const events = [
    // a: books in the range, two reminders, joins one on time: in place at the range's end.
    ev("session_scheduled", { user: "a" }, "2026-11-22T10:00:00Z"),
    ev("session_reminder_sent", { user: "a" }, "2026-11-24T17:02:00Z"),
    ev("session_attended", { user: "a" }, "2026-11-24T18:04:00Z"),
    ev("session_reminder_sent", { user: "a" }, "2026-12-01T17:02:00Z"), // after the range
    // b: booked before the range, one reminder in it, cancels in it.
    ev("session_scheduled", { user: "b" }, "2026-11-10T10:00:00Z"),
    ev("session_reminder_sent", { user: "b" }, "2026-11-23T08:02:00Z"),
    ev("session_cancelled", { user: "b" }, "2026-11-25T10:00:00Z"),
    // c: books in the range, then Mira stops them as under 18 (the session goes silently).
    ev("session_scheduled", { user: "c" }, "2026-11-23T10:00:00Z"),
    ev("minor_stop", { user: "c" }, "2026-11-26T10:00:00Z"),
    // d: booked before the range and still in place: counted as in place, not as booked.
    ev("session_scheduled", { user: "d" }, "2026-11-05T10:00:00Z"),
    // e: cancels and books again in the range: in place, booked once as a person.
    ev("session_scheduled", { user: "e" }, "2026-11-22T09:00:00Z"),
    ev("session_cancelled", { user: "e" }, "2026-11-23T09:00:00Z"),
    ev("session_scheduled", { user: "e" }, "2026-11-24T09:00:00Z"),
    // f: books after the range ends: nothing in it.
    ev("session_scheduled", { user: "f" }, "2026-12-02T10:00:00Z"),
    // The team: an account testing from a team browser, left out with everything it did.
    ev("session_scheduled", { user: "t" }, "2026-11-22T10:00:00Z", true),
    ev("session_reminder_sent", { user: "t" }, "2026-11-24T17:02:00Z"),
    ev("session_attended", { user: "t" }, "2026-11-24T18:01:00Z"),
  ];

  it("counts the people who booked, the sessions in place, reminders, joins and cancellations", () => {
    expect(page(data([...users, account("t", "t@example.com")], events)).weeklySessions).toEqual({
      scheduled: 3, // a, c, e
      active: 3, // a, d, e (b cancelled, c stopped, f later)
      reminders: 2, // a's first, b's
      attended: 1, // a's
      cancelled: 2, // b, e
    });
  });

  it("is all zero before anything happened, and in a range before the first booking", () => {
    expect(page(data(users, [])).weeklySessions).toEqual({
      scheduled: 0,
      active: 0,
      reminders: 0,
      attended: 0,
      cancelled: 0,
    });
    expect(page(data(users, events), "2026-10-01", "2026-10-31").weeklySessions).toEqual({
      scheduled: 0,
      active: 0,
      reminders: 0,
      attended: 0,
      cancelled: 0,
    });
  });
});
