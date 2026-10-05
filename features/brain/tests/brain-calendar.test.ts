import fs from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
  CALENDAR_BUILDER_VERSION,
  eventDay,
  eventToRows,
  isWorthIndexing,
  eventsToConfirm,
} from "@features/brain/server/ingest/calendar";

const STAMP = "2026-08-31T00:00:00.000Z";

const meeting = (over: Record<string, unknown> = {}) => ({
  id: "cal-copy-1",
  iCalUID: "abc123@google.com",
  status: "confirmed",
  summary: "Pricing review",
  description: "Decide whether the report goes to 39.99",
  htmlLink: "https://calendar.google.com/event?eid=x",
  start: { dateTime: "2026-08-28T14:00:00+02:00" },
  organizer: { email: "ec@loveiq.org", displayName: "Eman" },
  attendees: [
    { email: "ec@loveiq.org", displayName: "Eman", responseStatus: "accepted" },
    { email: "mb@loveiq.org", displayName: "Marcus", responseStatus: "accepted" },
  ],
  ...over,
});

describe("isWorthIndexing — a calendar is mostly not meetings", () => {
  it("keeps a real meeting between people", () => {
    expect(isWorthIndexing(meeting())).toBe(true);
  });

  it("drops a candidate interview, which names the candidate and invites them", () => {
    // Real title shapes from the calendar, 2026-09-23.
    expect(
      isWorthIndexing(meeting({ summary: "Jane Doe & Marcus Börner - Growth Lead Interview" }))
    ).toBe(false);
    expect(isWorthIndexing(meeting({ summary: "Jane Doe - Design Intern Interview" }))).toBe(false);
  });

  it("keeps a user-research interview, which is company knowledge", () => {
    expect(isWorthIndexing(meeting({ summary: "User interview — participant 4" }))).toBe(true);
  });

  it("drops blocked-out time with no guests and no agenda", () => {
    // "Focus time", "Lunch", "Gym" — answering a question with one of these is noise.
    expect(
      isWorthIndexing(meeting({ summary: "Focus time", description: "", attendees: [] }))
    ).toBe(false);
  });

  it("keeps a solo event that HAS an agenda, because the agenda is the content", () => {
    expect(
      isWorthIndexing(meeting({ summary: "Prep", attendees: [], description: "Draft the Q4 plan" }))
    ).toBe(true);
  });

  it("drops a cancelled event — it did not happen", () => {
    expect(isWorthIndexing(meeting({ status: "cancelled" }))).toBe(false);
  });

  it("drops an untitled event rather than indexing a blank", () => {
    expect(isWorthIndexing(meeting({ summary: "   " }))).toBe(false);
  });

  it("does not count a meeting room as a guest", () => {
    // A room is an attendee in Google's model. One person plus a room is not a meeting.
    expect(
      isWorthIndexing(
        meeting({
          description: "",
          attendees: [
            { email: "ec@loveiq.org", displayName: "Eman" },
            { email: "room@loveiq.org", displayName: "Board room", resource: true },
          ],
        })
      )
    ).toBe(false);
  });
});

describe("eventToRows", () => {
  /**
   * THE DESIGN DECISION WORTH PROTECTING. One meeting exists once on every guest's
   * calendar, each copy with a different `id`. Keying on `id` would store a
   * six-person meeting six times; `iCalUID` is identical across all copies, so the
   * upsert collapses them and whoever is read last simply confirms it.
   */
  it("keys across guests, so one meeting is stored once no matter how many calendars hold it", () => {
    const fromEman = eventToRows(meeting({ id: "copy-eman" }), STAMP, null)[0]!;
    const fromMarcus = eventToRows(meeting({ id: "copy-marcus" }), STAMP, null)[0]!;
    expect(fromMarcus.source_id).toBe(fromEman.source_id);
  });

  /**
   * AND THE OTHER HALF, WHICH THE UID ALONE GOT CATASTROPHICALLY WRONG.
   *
   * `iCalUID` is shared by every OCCURRENCE of a recurring series too, and
   * `singleEvents=true` expands those into one item per occurrence — so every weekly
   * sync collapsed onto a single row and whichever occurrence was written last won.
   *
   * MEASURED against the live calendar: sixteen February instances, FOUR distinct
   * iCalUIDs, nine daily "LoveIQ Sync" occurrences sharing one. The corpus held 4 rows
   * for that month against 14 meetings that produced notes. Every one of those meetings
   * happened; the record of all but the last of each series was overwritten.
   */
  it("keeps each occurrence of a recurring series as its own record", () => {
    const feb10 = eventToRows(
      meeting({ id: "series_20260210T080000Z", start: { dateTime: "2026-02-10T08:00:00Z" } }),
      STAMP
    )[0]!;
    const feb11 = eventToRows(
      meeting({ id: "series_20260211T080000Z", start: { dateTime: "2026-02-11T08:00:00Z" } }),
      STAMP
    )[0]!;
    // Same series, same iCalUID, different days — and therefore different records.
    expect(feb10.source_id).not.toBe(feb11.source_id);
    expect(feb10.source_id).toContain("2026-02-10");
    expect(feb11.source_id).toContain("2026-02-11");
  });

  /** An event with no resolvable day keeps the old shape: there is nothing to separate
   *  it by, and inventing a suffix would only make the id unstable. */
  it("falls back to the bare uid when the event has no day", () => {
    const row = eventToRows(meeting({ start: {} }), STAMP)[0]!;
    expect(row.source_id).toBe("event:abc123@google.com");
  });

  it("dates the chunk by the day the meeting happens, not by when it was read", () => {
    expect(eventToRows(meeting(), STAMP)[0]!.period_end).toBe("2026-08-28");
  });

  it("puts who was there in the body, so 'who met the investor' is answerable", () => {
    const body = eventToRows(meeting(), STAMP)[0]!.body;
    expect(body).toContain("With: Eman, Marcus");
    expect(body).toContain("Organised by: Eman");
    expect(body).toContain("39.99");
  });

  it("separates people who declined from people who attended", () => {
    const row = eventToRows(
      meeting({
        attendees: [
          { email: "ec@loveiq.org", displayName: "Eman", responseStatus: "accepted" },
          { email: "mb@loveiq.org", displayName: "Marcus", responseStatus: "declined" },
        ],
      }),
      STAMP
    )[0]!;
    expect(row.body).toContain("With: Eman");
    expect(row.body).toContain("Declined: Marcus");
  });

  it("handles an all-day event, which carries `date` rather than `dateTime`", () => {
    const row = eventToRows(meeting({ start: { date: "2026-09-01" } }), STAMP)[0]!;
    expect(row.period_end).toBe("2026-09-01");
    expect(row.body).toContain("all day");
  });

  it("returns nothing for an event not worth indexing", () => {
    expect(eventToRows(meeting({ status: "cancelled" }), STAMP)).toEqual([]);
  });

  it("reads the day off either shape, and null when there is neither", () => {
    expect(eventDay(meeting())).toBe("2026-08-28");
    expect(eventDay(meeting({ start: {} }))).toBeNull();
  });
});

/**
 * AN OFFBOARDED COLLEAGUE'S MEETINGS ARE NOT DELETED MEETINGS.
 *
 * `domainMailboxes()` lists `isSuspended=false` users, so a departing colleague
 * drops off the walk the day their account is suspended — no token failure, so
 * nothing sets `complete = false` and the walk finishes cleanly over everyone
 * else. Their events then go stale and `sweepStale` removes them. Same root
 * cause, same function, as the Gmail mailbox sweep fixed on 2026-09-06.
 */
describe("calendar rows carry the calendar they were walked from", () => {
  it("records the mailbox in meta", () => {
    const row = eventToRows(meeting({ id: "e1" }), STAMP, "sk@loveiq.org")[0]!;
    expect((row.meta as Record<string, unknown>).mailbox).toBe("sk@loveiq.org");
  });

  it("is null rather than absent when the calendar is unknown", () => {
    // A row with no scope stays sweepable, which is what the pre-bump rows are.
    const row = eventToRows(meeting({ id: "e2" }), STAMP, null)[0]!;
    expect((row.meta as Record<string, unknown>).mailbox).toBeNull();
  });

  it("ships a builder version that rewrites the rows written without it", () => {
    // Without the bump, existing rows keep v=2, carry no mailbox, and the
    // scoped sweep would never match them — immortal rather than protected.
    const row = eventToRows(meeting({ id: "e3" }), STAMP, "ec@loveiq.org")[0]!;
    expect((row.meta as Record<string, unknown>).v).toBe(CALENDAR_BUILDER_VERSION);
    expect(CALENDAR_BUILDER_VERSION).toBeGreaterThan(2);
  });

  it("still stores one row for a meeting seen on two calendars", () => {
    // The scope must not become part of the key: one meeting exists on every
    // guest's calendar and is deliberately stored once, keyed on iCalUID+day.
    const a = eventToRows(meeting({ id: "copy-a" }), STAMP, "ec@loveiq.org")[0]!;
    const b = eventToRows(meeting({ id: "copy-b" }), STAMP, "sk@loveiq.org")[0]!;
    expect(a.source_id).toBe(b.source_id);
  });
});

describe("the attendee list is capped, the count is not", () => {
  /**
   * `meta.attendees` stops at 12. One row in the corpus sits exactly on that cap
   * today, and from the row alone it is indistinguishable from a meeting that
   * really had twelve people — a truncation that looks like a fact.
   */
  const crowd = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      email: `p${i}@loveiq.org`,
      displayName: `Person ${i}`,
      responseStatus: "accepted",
    }));

  it("keeps twelve names but reports the true total", () => {
    const [row] = eventToRows(meeting({ attendees: crowd(20) }), STAMP, "ec@loveiq.org");
    const meta = row.meta as { attendees: string[]; attendeeCount: number };
    expect(meta.attendees).toHaveLength(12);
    expect(meta.attendeeCount).toBe(20);
  });

  it("agrees with itself when nothing was cut", () => {
    // The control: below the cap the two must match, or the count is just noise.
    const [row] = eventToRows(meeting({ attendees: crowd(5) }), STAMP, "ec@loveiq.org");
    const meta = row.meta as { attendees: string[]; attendeeCount: number };
    expect(meta.attendees).toHaveLength(5);
    expect(meta.attendeeCount).toBe(5);
  });
});

describe("eventsToConfirm — which stored meetings survive the sweep", () => {
  /**
   * Cancelled events are not listed by the Calendar API, so a meeting cancelled after it
   * was indexed was never rewritten and was confirmed forever — the brain kept calling it
   * scheduled. Inside the window, from a calendar we read, not listed means gone.
   */
  const WINDOW = { from: "2025-08-19", to: "2027-01-21" };
  const k = (mailbox: string | null, current = true) => ({ current, mailbox });
  const confirm = (
    known: Array<[string, { current: boolean; mailbox: string | null }]>,
    written: string[] = [],
    read = ["ec@loveiq.org"]
  ) => eventsToConfirm(new Map(known), new Set(written), new Set(read), WINDOW);

  it("drops a meeting inside the window that the walk no longer lists", () => {
    expect(confirm([["event:abc:2026-09-25", k("ec@loveiq.org")]])).toEqual([]);
  });

  it("keeps history from before the window, which nothing re-reads", () => {
    expect(confirm([["event:old:2025-06-01", k("ec@loveiq.org")]])).toEqual([
      "event:old:2025-06-01",
    ]);
  });

  it("keeps a meeting from a calendar whose token failed, so one refusal deletes nothing", () => {
    expect(confirm([["event:abc:2026-09-25", k("mb@loveiq.org")]])).toEqual([
      "event:abc:2026-09-25",
    ]);
  });

  it("keeps a row it cannot attribute, and one whose id carries no day", () => {
    expect(
      confirm([
        ["event:abc:2026-09-25", k(null)],
        ["event:nodate", k("ec@loveiq.org")],
      ]).sort()
    ).toEqual(["event:abc:2026-09-25", "event:nodate"]);
  });

  it("leaves a two-day margin at the window's edges for time-zone slop", () => {
    expect(confirm([["event:edge:2025-08-20", k("ec@loveiq.org")]])).toEqual([
      "event:edge:2025-08-20",
    ]);
    expect(confirm([["event:inside:2025-08-22", k("ec@loveiq.org")]])).toEqual([]);
  });

  it("never confirms a stale-version row, and never confirms what it just wrote", () => {
    expect(confirm([["event:stale:2025-06-01", k("ec@loveiq.org", false)]])).toEqual([]);
    expect(
      confirm(
        [
          ["event:new:2026-09-25", k("ec@loveiq.org")],
          ["event:new:2026-09-25#2", k("ec@loveiq.org")],
        ],
        ["event:new:2026-09-25"]
      )
    ).toEqual([]);
  });

  it("is what the walk actually hands to the touch", () => {
    // A pure function nothing calls is decoration.
    const src = fs.readFileSync("features/brain/server/ingest/calendar.ts", "utf8");
    expect(src).toMatch(/touchChunks\(\s*SOURCE,\s*eventsToConfirm\(/);
    // And `read` is the calendars that ANSWERED: every calendar asked would let one
    // refused token delete that person's meetings.
    expect(src).toMatch(
      /const read = new Set\(boxes\.filter\(\(m\) => !failures\.includes\(m\)\)\)/
    );
  });
});
