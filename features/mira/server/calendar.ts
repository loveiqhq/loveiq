/**
 * The weekly session's calendar maths: when a weekly slot next starts, on the person's own clock.
 * Pure, no IO.
 *
 * A slot is a weekday (ISO: 1 Monday … 7 Sunday), a local time ("19:00") and an IANA time zone.
 * Its starts are found day by day on the zone's own calendar, never by adding 7 × 24 hours, so a
 * session stays at 19:00 local across summer-time changes. A local time that doesn't exist (the
 * spring gap) is read with the offset before the gap, and one that happens twice (the autumn
 * overlap) is the first of the two: the rules of RFC 5545 §3.3.5, which calendar apps apply to
 * the invite too.
 */

export type WeeklySlot = { weekday: number; time: string; timeZone: string };

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;
const WEEKDAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** A wall clock reading in a zone: the date, the time and the ISO weekday (1 Monday … 7 Sunday). */
type Wall = { y: number; m: number; d: number; h: number; min: number; s: number; wd: number };

const formatters = new Map<string, Intl.DateTimeFormat>();

function wall(ms: number, timeZone: string): Wall {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      weekday: "short",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
    });
    formatters.set(timeZone, f);
  }
  const parts = f.formatToParts(new Date(ms));
  const get = (t: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === t)?.value ?? "";
  return {
    y: Number(get("year")),
    m: Number(get("month")),
    d: Number(get("day")),
    h: Number(get("hour")) % 24,
    min: Number(get("minute")),
    s: Number(get("second")),
    wd: WEEKDAY_SHORT.indexOf(get("weekday")) + 1,
  };
}

/** The zone's offset from UTC at an instant, in minutes (Berlin in winter: 60). */
function offsetAt(ms: number, timeZone: string): number {
  const w = wall(ms, timeZone);
  const whole = Math.floor(ms / 1000) * 1000;
  return Math.round((Date.UTC(w.y, w.m - 1, w.d, w.h, w.min, w.s) - whole) / MINUTE_MS);
}

/** The instant a local date and time stand for in a zone, by RFC 5545's gap and overlap rules. */
function instantOf(y: number, m: number, d: number, h: number, min: number, timeZone: string) {
  const local = Date.UTC(y, m - 1, d, h, min);
  // The offsets a day either side: around a change they differ, otherwise they are one offset.
  const before = offsetAt(local - DAY_MS, timeZone);
  const after = offsetAt(local + DAY_MS, timeZone);
  const fits = [local - before * MINUTE_MS, local - after * MINUTE_MS].filter((t) => {
    const w = wall(t, timeZone);
    return w.y === y && w.m === m && w.d === d && w.h === h && w.min === min;
  });
  // Happens twice: the first. Doesn't happen: read with the offset before the gap.
  return fits.length ? Math.min(...fits) : local - before * MINUTE_MS;
}

/** The slot's next start at or after `from`. */
export function nextOccurrence(slot: WeeklySlot, from: Date): Date {
  const [h, min] = slot.time.split(":").map(Number) as [number, number];
  const today = wall(from.getTime(), slot.timeZone);
  // Two weeks of local dates hold at least two of the weekday: one of them is still to come.
  for (let k = 0; k < 15; k++) {
    const date = new Date(Date.UTC(today.y, today.m - 1, today.d + k));
    if (((date.getUTCDay() + 6) % 7) + 1 !== slot.weekday) continue;
    const at = instantOf(
      date.getUTCFullYear(),
      date.getUTCMonth() + 1,
      date.getUTCDate(),
      h,
      min,
      slot.timeZone
    );
    if (at >= from.getTime()) return new Date(at);
  }
  throw new Error("no weekly start within two weeks");
}

/** Reminders go 30 to 60 minutes before a start; the cron runs every 15 minutes, so twice. */
export const REMIND_FROM_MS = 60 * MINUTE_MS;
export const REMIND_UNTIL_MS = 30 * MINUTE_MS;
/** Opening the session this close to a start, before or after it, is attending that one. */
export const JOIN_WINDOW_MS = 30 * MINUTE_MS;

/** The start a reminder is due for now, or null. */
export function reminderDue(slot: WeeklySlot, now: Date): Date | null {
  const start = nextOccurrence(slot, now);
  const lead = start.getTime() - now.getTime();
  return lead >= REMIND_UNTIL_MS && lead <= REMIND_FROM_MS ? start : null;
}

/** The start the session was opened for, when it was opened within 30 minutes of one. */
export function joinedOccurrence(slot: WeeklySlot, at: Date): Date | null {
  const start = nextOccurrence(slot, new Date(at.getTime() - JOIN_WINDOW_MS));
  return start.getTime() - at.getTime() <= JOIN_WINDOW_MS ? start : null;
}

// ── The calendar invite (.ics): RFC 5545, with iTIP's methods (RFC 5546) ────────────────────────

export const SESSION_MINUTES = 15;
const BYDAY = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];

/** A TEXT value: backslash, semicolon and comma escaped, line breaks as \n (RFC 5545 §3.3.11). */
export function escapeText(s: string): string {
  return s.replace(/[\\;,]/g, (c) => `\\${c}`).replace(/\r\n|\r|\n/g, "\\n");
}

/**
 * One content line folded at 75 octets: CRLF and a space start each continuation, and a fold
 * never splits a character's UTF-8 bytes (RFC 5545 §3.1).
 */
export function foldLine(line: string): string {
  const out: string[] = [];
  let current = "";
  let octets = 0;
  for (const ch of line) {
    // The character's UTF-8 length, from its code point (no Buffer: the pages import this too).
    const cp = ch.codePointAt(0)!;
    const size = cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4;
    if (octets + size > 75) {
      out.push(current);
      current = " ";
      octets = 1;
    }
    current += ch;
    octets += size;
  }
  out.push(current);
  return out.join("\r\n");
}

const pad = (n: number) => String(n).padStart(2, "0");
const utcStamp = (d: Date) =>
  d
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
const isoWeekday = (y: number, m: number, d: number) =>
  ((new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7) + 1;
const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const utcOffset = (min: number) =>
  `${min < 0 ? "-" : "+"}${pad(Math.floor(Math.abs(min) / 60))}${pad(Math.abs(min) % 60)}`;

/** A zone's offset changes in one year: when, and from and to which offset (minutes). */
function changesIn(year: number, timeZone: string) {
  const out: Array<{ at: number; from: number; to: number }> = [];
  const end = Date.UTC(year + 1, 0, 1);
  let t = Date.UTC(year, 0, 1);
  let off = offsetAt(t, timeZone);
  while (t < end) {
    const next = Math.min(t + 7 * DAY_MS, end);
    const o = offsetAt(next, timeZone);
    if (o !== off) {
      // The change's minute: the first at which the new offset holds.
      let [lo, hi] = [t, next];
      while (hi - lo > MINUTE_MS) {
        const mid = lo + Math.floor((hi - lo) / 2 / MINUTE_MS) * MINUTE_MS;
        if (offsetAt(mid, timeZone) === off) lo = mid;
        else hi = mid;
      }
      out.push({ at: hi, from: off, to: o });
      off = o;
    }
    t = next;
  }
  return out;
}

/** The day of a month's nth weekday (n = -1: its last). */
function nthWeekday(y: number, m: number, wd: number, n: number): number {
  if (n > 0) return 1 + ((wd - isoWeekday(y, m, 1) + 7) % 7) + (n - 1) * 7;
  const last = daysIn(y, m);
  return last - ((isoWeekday(y, m, last) - wd + 7) % 7);
}

/** Years a derived rule must match before it is written: a wrong rule moves sessions an hour. */
const RULE_CHECK_YEARS = 11;
const zones = new Map<string, string[]>();

/**
 * The VTIMEZONE block for the TZID (RFC 5545 §3.6.5): the zone's yearly summer-time rules as ICU
 * reports its changes, each written as "the nth (or last) weekday of a month" from 1970 and checked
 * against the actual changes for 11 years. A zone whose changes no such rule fits (Israel's Friday
 * before the last Sunday, Egypt's Thursday at 24:00) gets none: calendar apps then go by the zone's
 * IANA name, as they do for most invites anyway.
 */
function vtimezone(timeZone: string, year: number): string[] {
  const key = `${timeZone}:${year}`;
  const cached = zones.get(key);
  if (cached) return cached;
  const seen = Array.from({ length: RULE_CHECK_YEARS }, (_, i) => ({
    y: year + i,
    changes: changesIn(year + i, timeZone),
  }));
  const head = ["BEGIN:VTIMEZONE", `TZID:${timeZone}`];
  let out: string[] = [];
  if (seen.every((s) => s.changes.length === 0)) {
    const off = utcOffset(offsetAt(Date.UTC(year, 0, 1), timeZone));
    out = [...head, "BEGIN:STANDARD", "DTSTART:19700101T000000"];
    out.push(`TZOFFSETFROM:${off}`, `TZOFFSETTO:${off}`, "END:STANDARD", "END:VTIMEZONE");
  } else if (seen.every((s) => s.changes.length === 2)) {
    const blocks = seen[0]!.changes.map((change) => {
      // The change as the clock read it just before: the old offset's local time.
      const old = new Date(change.at + change.from * MINUTE_MS);
      const [m, d] = [old.getUTCMonth() + 1, old.getUTCDate()];
      const [h, min] = [old.getUTCHours(), old.getUTCMinutes()];
      const wd = isoWeekday(old.getUTCFullYear(), m, d);
      const nth = Math.ceil(d / 7);
      const options = d + 7 > daysIn(old.getUTCFullYear(), m) ? [-1, nth] : [nth];
      const n = options.find((k) =>
        seen.every(({ y, changes }) =>
          changes.some(
            (c) =>
              c.from === change.from &&
              c.to === change.to &&
              c.at === Date.UTC(y, m - 1, nthWeekday(y, m, wd, k), h, min) - c.from * MINUTE_MS
          )
        )
      );
      if (n === undefined) return null;
      const kind = change.to > change.from ? "DAYLIGHT" : "STANDARD";
      return [
        `BEGIN:${kind}`,
        `DTSTART:1970${pad(m)}${pad(nthWeekday(1970, m, wd, n))}T${pad(h)}${pad(min)}00`,
        `TZOFFSETFROM:${utcOffset(change.from)}`,
        `TZOFFSETTO:${utcOffset(change.to)}`,
        `RRULE:FREQ=YEARLY;BYMONTH=${m};BYDAY=${n}${BYDAY[wd - 1]}`,
        `END:${kind}`,
      ];
    });
    if (blocks.every(Boolean)) out = [...head, ...(blocks.flat() as string[]), "END:VTIMEZONE"];
  }
  zones.set(key, out);
  return out;
}

export type IcsInput = {
  /** The series' id: the same for every update and the cancellation. */
  uid: string;
  /** Raised with every change, so calendars apply the newest (RFC 5546 §2.1.4). */
  sequence: number;
  /** REQUEST: the invite and its updates. CANCEL: takes the series away. PUBLISH: a download. */
  method: "REQUEST" | "CANCEL" | "PUBLISH";
  slot: WeeklySlot;
  organizer: string;
  attendee?: string;
  summary: string;
  description: string;
  url: string;
  now: Date;
};

/** The weekly session as an iCalendar object, from its next start on. */
export function sessionIcs(input: IcsInput): string {
  const { slot } = input;
  const start = wall(nextOccurrence(slot, input.now).getTime(), slot.timeZone);
  const date = `${start.y}${pad(start.m)}${pad(start.d)}`;
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Applied Psychometrics//Mira//EN",
    "CALSCALE:GREGORIAN",
    `METHOD:${input.method}`,
    ...vtimezone(slot.timeZone, start.y),
    "BEGIN:VEVENT",
    `UID:${input.uid}@loveiq.org`,
    `SEQUENCE:${input.sequence}`,
    `DTSTAMP:${utcStamp(input.now)}`,
    `DTSTART;TZID=${slot.timeZone}:${date}T${slot.time.replace(":", "")}00`,
    `DURATION:PT${SESSION_MINUTES}M`,
    `RRULE:FREQ=WEEKLY;BYDAY=${BYDAY[slot.weekday - 1]}`,
    `STATUS:${input.method === "CANCEL" ? "CANCELLED" : "CONFIRMED"}`,
    `SUMMARY:${escapeText(input.summary)}`,
    `DESCRIPTION:${escapeText(input.description)}`,
    `URL:${input.url}`,
    `ORGANIZER;CN=Mira:mailto:${input.organizer}`,
    ...(input.attendee && input.method !== "PUBLISH"
      ? [`ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED;RSVP=FALSE:mailto:${input.attendee}`]
      : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(foldLine).join("\r\n") + "\r\n";
}

/**
 * Google Calendar's own "add event" form, filled in: weekly, 15 minutes, in the person's zone.
 * An event added this way is the person's own copy: a later change or cancel can't reach it.
 */
export function googleCalendarUrl(input: {
  slot: WeeklySlot;
  now: Date;
  summary: string;
  details: string;
}): string {
  const { slot } = input;
  const start = wall(nextOccurrence(slot, input.now).getTime(), slot.timeZone);
  const [h, min] = slot.time.split(":").map(Number) as [number, number];
  const local = (ms: number) => {
    const d = new Date(ms);
    return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00`;
  };
  const begins = Date.UTC(start.y, start.m - 1, start.d, h, min);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: input.summary,
    dates: `${local(begins)}/${local(begins + SESSION_MINUTES * MINUTE_MS)}`,
    ctz: slot.timeZone,
    recur: `RRULE:FREQ=WEEKLY;BYDAY=${BYDAY[slot.weekday - 1]}`,
    details: input.details,
  });
  return `https://calendar.google.com/calendar/render?${params}`;
}

export const WEEKDAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

/** "Tuesdays at 19:00". */
export const slotLabel = (slot: Pick<WeeklySlot, "weekday" | "time">) =>
  `${WEEKDAYS[slot.weekday - 1]}s at ${slot.time}`;

/** "Berlin time" for Europe/Berlin: the zone's city, the way people say it. */
export const zoneLabel = (timeZone: string) =>
  /^(Etc\/)?(UTC|GMT)$/.test(timeZone)
    ? "UTC"
    : `${timeZone.split("/").pop()!.replace(/_/g, " ")} time`;
