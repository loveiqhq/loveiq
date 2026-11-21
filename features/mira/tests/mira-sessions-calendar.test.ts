import { describe, expect, it } from "vitest";
import {
  escapeText,
  foldLine,
  googleCalendarUrl,
  joinedOccurrence,
  nextOccurrence,
  reminderDue,
  sessionIcs,
  slotLabel,
  zoneLabel,
} from "@features/mira/server/calendar";

/**
 * The weekly session's calendar maths (features/mira/server/calendar.ts). Expected instants are
 * worked out by hand from each zone's published rules, never with the code under test.
 */

const iso = (d: Date) => d.toISOString();
const at = (s: string) => new Date(s);

describe("nextOccurrence: the next start of a weekly slot, on the person's own clock", () => {
  it("finds the coming weekday at the local time", () => {
    // Saturday 21 Nov 2026, noon in Berlin (CET, +01:00) → Tuesday 24 Nov, 19:00 CET.
    const slot = { weekday: 2, time: "19:00", timeZone: "Europe/Berlin" };
    expect(iso(nextOccurrence(slot, at("2026-11-21T11:00:00Z")))).toBe("2026-11-24T18:00:00.000Z");
  });

  it("counts a start at exactly `from`, and moves on a week once it has begun", () => {
    const slot = { weekday: 2, time: "19:00", timeZone: "Europe/Berlin" };
    expect(iso(nextOccurrence(slot, at("2026-11-24T18:00:00Z")))).toBe("2026-11-24T18:00:00.000Z");
    expect(iso(nextOccurrence(slot, at("2026-11-24T18:00:01Z")))).toBe("2026-12-01T18:00:00.000Z");
  });

  it("keeps 19:00 local across the spring change (Berlin, 28 Mar 2027)", () => {
    const slot = { weekday: 2, time: "19:00", timeZone: "Europe/Berlin" };
    // Tue 23 Mar is CET (+01:00), Tue 30 Mar is CEST (+02:00).
    expect(iso(nextOccurrence(slot, at("2027-03-22T12:00:00Z")))).toBe("2027-03-23T18:00:00.000Z");
    expect(iso(nextOccurrence(slot, at("2027-03-24T12:00:00Z")))).toBe("2027-03-30T17:00:00.000Z");
  });

  it("keeps 19:00 local across the autumn change (New York, 7 Nov 2027)", () => {
    const slot = { weekday: 1, time: "19:00", timeZone: "America/New_York" };
    // Mon 1 Nov is EDT (−04:00), Mon 8 Nov is EST (−05:00).
    expect(iso(nextOccurrence(slot, at("2027-10-31T12:00:00Z")))).toBe("2027-11-01T23:00:00.000Z");
    expect(iso(nextOccurrence(slot, at("2027-11-02T12:00:00Z")))).toBe("2027-11-09T00:00:00.000Z");
  });

  it("reads a time that doesn't exist (the spring gap) with the offset before it, as RFC 5545 does", () => {
    // Berlin skips 02:00–03:00 on Sun 28 Mar 2027: 02:30 is read as +01:00, so 01:30Z (03:30 CEST).
    const berlin = { weekday: 7, time: "02:30", timeZone: "Europe/Berlin" };
    expect(iso(nextOccurrence(berlin, at("2027-03-27T12:00:00Z")))).toBe(
      "2027-03-28T01:30:00.000Z"
    );
    // The week after is an ordinary CEST Sunday: 02:30 +02:00.
    expect(iso(nextOccurrence(berlin, at("2027-03-28T02:00:00Z")))).toBe(
      "2027-04-04T00:30:00.000Z"
    );
    // New York skips 02:00–03:00 on Sun 14 Mar 2027: 02:30 is read as EST (−05:00).
    const ny = { weekday: 7, time: "02:30", timeZone: "America/New_York" };
    expect(iso(nextOccurrence(ny, at("2027-03-13T12:00:00Z")))).toBe("2027-03-14T07:30:00.000Z");
  });

  it("takes the first of a time that happens twice (the autumn overlap), as RFC 5545 does", () => {
    // Berlin has 02:00–03:00 twice on Sun 31 Oct 2027: the first is CEST (+02:00), 00:30Z.
    const slot = { weekday: 7, time: "02:30", timeZone: "Europe/Berlin" };
    expect(iso(nextOccurrence(slot, at("2027-10-30T12:00:00Z")))).toBe("2027-10-31T00:30:00.000Z");
    // Once that first 02:30 has begun, the next is a week later (CET, +01:00).
    expect(iso(nextOccurrence(slot, at("2027-10-31T00:31:00Z")))).toBe("2027-11-07T01:30:00.000Z");
  });

  it("works south of the equator and with half-hour offsets", () => {
    // Sydney starts summer time on Sun 4 Oct 2026 (02:00 → 03:00, +10:00 → +11:00).
    const sydney = { weekday: 7, time: "02:30", timeZone: "Australia/Sydney" };
    expect(iso(nextOccurrence(sydney, at("2026-10-03T00:00:00Z")))).toBe(
      "2026-10-03T16:30:00.000Z"
    );
    // Lord Howe moves only 30 minutes (02:00 → 02:30, +10:30 → +11:00) the same day.
    const lordHowe = { weekday: 7, time: "02:15", timeZone: "Australia/Lord_Howe" };
    expect(iso(nextOccurrence(lordHowe, at("2026-10-03T00:00:00Z")))).toBe(
      "2026-10-03T15:45:00.000Z"
    );
    // India has no summer time: Monday 07:00 is always 01:30Z.
    const kolkata = { weekday: 1, time: "07:00", timeZone: "Asia/Kolkata" };
    expect(iso(nextOccurrence(kolkata, at("2026-11-21T00:00:00Z")))).toBe(
      "2026-11-23T01:30:00.000Z"
    );
  });

  it("crosses a date line: Sunday 08:00 in Auckland is Saturday in UTC", () => {
    // Auckland is on NZDT (+13:00) in late November.
    const slot = { weekday: 7, time: "08:00", timeZone: "Pacific/Auckland" };
    expect(iso(nextOccurrence(slot, at("2026-11-21T00:00:00Z")))).toBe("2026-11-21T19:00:00.000Z");
  });
});

describe("reminderDue: the reminder goes 30 to 60 minutes before a start", () => {
  // Tuesday 24 Nov 2026, 19:00 Berlin = 18:00Z.
  const slot = { weekday: 2, time: "19:00", timeZone: "Europe/Berlin" };
  const start = "2026-11-24T18:00:00.000Z";

  it("is due from 60 minutes before to 30 minutes before, both included", () => {
    for (const now of ["17:00:00", "17:15:00", "17:30:00"]) {
      expect(reminderDue(slot, at(`2026-11-24T${now}Z`))?.toISOString(), now).toBe(start);
    }
  });

  it("is not due earlier, nor once fewer than 30 minutes are left", () => {
    for (const now of ["16:59:00", "17:30:01", "17:45:00", "18:00:00"]) {
      expect(reminderDue(slot, at(`2026-11-24T${now}Z`)), now).toBeNull();
    }
  });
});

describe("joinedOccurrence: opening the session within 30 minutes of its start", () => {
  const slot = { weekday: 2, time: "19:00", timeZone: "Europe/Berlin" };
  const start = "2026-11-24T18:00:00.000Z";

  it("is that start when opened up to 30 minutes before or after it", () => {
    for (const t of ["17:30:00", "17:59:00", "18:00:00", "18:29:00", "18:30:00"]) {
      expect(joinedOccurrence(slot, at(`2026-11-24T${t}Z`))?.toISOString(), t).toBe(start);
    }
  });

  it("is nothing further away, on another day, or for another weekday", () => {
    for (const t of ["2026-11-24T17:29:00Z", "2026-11-24T18:31:00Z", "2026-11-23T18:00:00Z"]) {
      expect(joinedOccurrence(slot, at(t)), t).toBeNull();
    }
  });
});

describe("the calendar invite (.ics, RFC 5545 and iTIP)", () => {
  const input = {
    uid: "0f1e2d3c-4b5a-4968-8776-655443322110",
    sequence: 2,
    slot: { weekday: 2, time: "19:00", timeZone: "Europe/Berlin" },
    organizer: "hello@send.loveiq.org",
    attendee: "lea@example.com",
    summary: "15 minutes with Mira",
    description:
      "Your weekly session, 15 minutes. When it's time; open it: https://www.loveiq.org/mira/session",
    url: "https://www.loveiq.org/mira/session",
    now: at("2026-11-21T12:34:56Z"),
  };
  /** The content lines, folding undone (RFC 5545 §3.1: CRLF followed by one space). */
  const lines = (ics: string) => ics.replace(/\r\n /g, "").split("\r\n");

  it("ends every line, the last one too, with CRLF and never a bare LF", () => {
    const ics = sessionIcs({ ...input, method: "REQUEST" });
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
  });

  it("is a weekly 15-minute event at the local time, in its zone, from the next start", () => {
    const l = lines(sessionIcs({ ...input, method: "REQUEST" }));
    expect(l.slice(0, 2)).toEqual(["BEGIN:VCALENDAR", "VERSION:2.0"]);
    for (const line of [
      "METHOD:REQUEST",
      "BEGIN:VEVENT",
      "UID:0f1e2d3c-4b5a-4968-8776-655443322110@loveiq.org",
      "SEQUENCE:2",
      "DTSTAMP:20261121T123456Z",
      "DTSTART;TZID=Europe/Berlin:20261124T190000",
      "DURATION:PT15M",
      "RRULE:FREQ=WEEKLY;BYDAY=TU",
      "STATUS:CONFIRMED",
      "SUMMARY:15 minutes with Mira",
      "URL:https://www.loveiq.org/mira/session",
      "ORGANIZER;CN=Mira:mailto:hello@send.loveiq.org",
      "ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED;RSVP=FALSE:mailto:lea@example.com",
      "END:VEVENT",
    ]) {
      expect(l, line).toContain(line);
    }
  });

  it("escapes text values: backslash, semicolon, comma and line breaks", () => {
    expect(escapeText("a\\b;c,d\ne\r\nf")).toBe("a\\\\b\\;c\\,d\\ne\\nf");
    const l = lines(sessionIcs({ ...input, method: "REQUEST" }));
    expect(l).toContain(
      "DESCRIPTION:Your weekly session\\, 15 minutes. When it's time\\; open it: https://www.loveiq.org/mira/session"
    );
  });

  it("folds long lines at 75 octets without splitting a character, and unfolds to the same text", () => {
    const ascii = `DESCRIPTION:${"x".repeat(200)}`;
    const folded = foldLine(ascii);
    for (const part of folded.split("\r\n")) {
      expect(Buffer.byteLength(part)).toBeLessThanOrEqual(75);
    }
    expect(folded.split("\r\n")[0]).toHaveLength(75);
    expect(
      folded
        .split("\r\n")
        .slice(1)
        .every((p) => p.startsWith(" "))
    ).toBe(true);
    expect(folded.replace(/\r\n /g, "")).toBe(ascii);
    // "é" is two octets, "🌙" four: a fold falls before them, never inside, wherever they sit.
    for (const wide of ["é", "🌙"]) {
      expect(foldLine(`${"x".repeat(74)}${wide}`).split("\r\n")[0]).toBe("x".repeat(74));
      for (let n = 68; n <= 76; n++) {
        const line = `${"x".repeat(n)}${wide}${"y".repeat(70)}${wide}`;
        const parts = foldLine(line).split("\r\n");
        for (const part of parts) {
          expect(Buffer.byteLength(part)).toBeLessThanOrEqual(75);
          // A split character would not survive the trip through UTF-8.
          expect(Buffer.from(part, "utf8").toString("utf8"), `${wide} after ${n}`).toBe(part);
        }
        expect(parts.join("\r\n").replace(/\r\n /g, "")).toBe(line);
      }
    }
    expect(foldLine("SHORT:line")).toBe("SHORT:line");
  });

  it("cancels with the same UID, a higher sequence and STATUS:CANCELLED", () => {
    const l = lines(sessionIcs({ ...input, sequence: 3, method: "CANCEL" }));
    expect(l).toContain("METHOD:CANCEL");
    expect(l).toContain("UID:0f1e2d3c-4b5a-4968-8776-655443322110@loveiq.org");
    expect(l).toContain("SEQUENCE:3");
    expect(l).toContain("STATUS:CANCELLED");
    expect(l).not.toContain("STATUS:CONFIRMED");
  });

  it("publishes (a download from the app) without an attendee", () => {
    const l = lines(sessionIcs({ ...input, attendee: undefined, method: "PUBLISH" }));
    expect(l).toContain("METHOD:PUBLISH");
    expect(l.some((x) => x.startsWith("ATTENDEE"))).toBe(false);
    expect(l).toContain("ORGANIZER;CN=Mira:mailto:hello@send.loveiq.org");
  });

  /** The zone's definition the TZID points at, as its blocks' lines (RFC 5545 §3.6.5). */
  const zone = (timeZone: string, now = input.now) => {
    const l = lines(
      sessionIcs({ ...input, now, slot: { ...input.slot, timeZone }, method: "REQUEST" })
    );
    const from = l.indexOf("BEGIN:VTIMEZONE");
    if (from < 0) return null;
    expect(from).toBeLessThan(l.indexOf("BEGIN:VEVENT"));
    const body = l.slice(from + 1, l.indexOf("END:VTIMEZONE"));
    const block = (kind: string) => {
      const i = body.indexOf(`BEGIN:${kind}`);
      return i < 0 ? null : body.slice(i + 1, body.indexOf(`END:${kind}`, i));
    };
    return { tzid: body[0], daylight: block("DAYLIGHT"), standard: block("STANDARD") };
  };

  it("defines the zone it names, with its summer-time rules (Berlin, New York)", () => {
    expect(zone("Europe/Berlin")).toEqual({
      tzid: "TZID:Europe/Berlin",
      daylight: [
        "DTSTART:19700329T020000",
        "TZOFFSETFROM:+0100",
        "TZOFFSETTO:+0200",
        "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU",
      ],
      standard: [
        "DTSTART:19701025T030000",
        "TZOFFSETFROM:+0200",
        "TZOFFSETTO:+0100",
        "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU",
      ],
    });
    expect(zone("America/New_York")).toEqual({
      tzid: "TZID:America/New_York",
      daylight: [
        "DTSTART:19700308T020000",
        "TZOFFSETFROM:-0500",
        "TZOFFSETTO:-0400",
        "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU",
      ],
      standard: [
        "DTSTART:19701101T020000",
        "TZOFFSETFROM:-0400",
        "TZOFFSETTO:-0500",
        "RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU",
      ],
    });
    // The rules start in 1970 whatever the year booked: 2026 shares 1970's calendar, 2027 doesn't.
    expect(zone("Europe/Berlin", at("2027-06-01T12:00:00Z"))?.daylight?.[0]).toBe(
      "DTSTART:19700329T020000"
    );
  });

  it("defines southern and half-hour zones too (Sydney, Lord Howe)", () => {
    expect(zone("Australia/Sydney")).toMatchObject({
      daylight: [
        "DTSTART:19701004T020000",
        "TZOFFSETFROM:+1000",
        "TZOFFSETTO:+1100",
        "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=1SU",
      ],
      standard: [
        "DTSTART:19700405T030000",
        "TZOFFSETFROM:+1100",
        "TZOFFSETTO:+1000",
        "RRULE:FREQ=YEARLY;BYMONTH=4;BYDAY=1SU",
      ],
    });
    expect(zone("Australia/Lord_Howe")).toMatchObject({
      daylight: [
        "DTSTART:19701004T020000",
        "TZOFFSETFROM:+1030",
        "TZOFFSETTO:+1100",
        "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=1SU",
      ],
      standard: [
        "DTSTART:19700405T020000",
        "TZOFFSETFROM:+1100",
        "TZOFFSETTO:+1030",
        "RRULE:FREQ=YEARLY;BYMONTH=4;BYDAY=1SU",
      ],
    });
  });

  it("defines a zone without summer time by its one offset (Kolkata)", () => {
    expect(zone("Asia/Kolkata")).toEqual({
      tzid: "TZID:Asia/Kolkata",
      daylight: null,
      standard: ["DTSTART:19700101T000000", "TZOFFSETFROM:+0530", "TZOFFSETTO:+0530"],
    });
  });

  it("leaves the definition out, rather than write a wrong one, when no simple yearly rule fits", () => {
    // Israel moves to summer time on the Friday before the last Sunday in March: the last Friday
    // in some years, the fourth in others. Calendar apps then use the zone's own name.
    expect(zone("Asia/Jerusalem")).toBeNull();
    const l = lines(
      sessionIcs({
        ...input,
        slot: { ...input.slot, timeZone: "Asia/Jerusalem" },
        method: "REQUEST",
      })
    );
    expect(l).toContain("DTSTART;TZID=Asia/Jerusalem:20261124T190000");
  });
});

describe("Add to Google Calendar, and the words for a slot", () => {
  it("opens Google's event form: weekly, 15 minutes, in the person's zone", () => {
    const url = new URL(
      googleCalendarUrl({
        slot: { weekday: 2, time: "19:00", timeZone: "Europe/Berlin" },
        now: at("2026-11-21T12:00:00Z"),
        summary: "15 minutes with Mira",
        details: "Open it: https://www.loveiq.org/mira/session",
      })
    );
    expect(url.origin + url.pathname).toBe("https://calendar.google.com/calendar/render");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      action: "TEMPLATE",
      text: "15 minutes with Mira",
      dates: "20261124T190000/20261124T191500",
      ctz: "Europe/Berlin",
      recur: "RRULE:FREQ=WEEKLY;BYDAY=TU",
      details: "Open it: https://www.loveiq.org/mira/session",
    });
  });

  it("ends a late session on the next day", () => {
    const url = new URL(
      googleCalendarUrl({
        slot: { weekday: 7, time: "23:50", timeZone: "Europe/Berlin" },
        now: at("2026-11-21T12:00:00Z"),
        summary: "s",
        details: "d",
      })
    );
    expect(url.searchParams.get("dates")).toBe("20261122T235000/20261123T000500");
  });

  it("says a slot and a zone the way people do", () => {
    expect(slotLabel({ weekday: 2, time: "19:00" })).toBe("Tuesdays at 19:00");
    expect(slotLabel({ weekday: 7, time: "08:30" })).toBe("Sundays at 08:30");
    expect(zoneLabel("Europe/Berlin")).toBe("Berlin time");
    expect(zoneLabel("America/New_York")).toBe("New York time");
    expect(zoneLabel("America/Argentina/Buenos_Aires")).toBe("Buenos Aires time");
    expect(zoneLabel("UTC")).toBe("UTC");
  });
});
