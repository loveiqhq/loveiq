import { describe, expect, it, vi } from "vitest";

vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { eventDay, eventToRows, isWorthIndexing } from "@features/brain/server/ingest/calendar";

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
  it("keys on iCalUID, so one meeting is stored once no matter how many calendars hold it", () => {
    const fromEman = eventToRows(meeting({ id: "copy-eman" }), STAMP)[0]!;
    const fromMarcus = eventToRows(meeting({ id: "copy-marcus" }), STAMP)[0]!;
    expect(fromEman.source_id).toBe("event:abc123@google.com");
    expect(fromMarcus.source_id).toBe(fromEman.source_id);
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
