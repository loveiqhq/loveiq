/**
 * Google Calendar — the meetings behind everything else.
 *
 * The rest of the corpus records what was WRITTEN. Calendar records who actually
 * sat down with whom, and when, which is the frame a lot of the writing only makes
 * sense inside: the call notes in Drive, the decision in Notion, the follow-up
 * email all hang off a meeting that had a title, an agenda and a guest list.
 *
 * Reads every mailbox in the domain, like Gmail does, over domain-wide delegation.
 */

import {
  CALENDAR_SCOPE,
  getDelegatedToken,
  getGoogleAccessToken,
  googleCredentialShape,
} from "@shared/http/google-oauth";
import { fetchWithTimeout } from "@shared/http/fetch-with-timeout";
import logger from "@shared/observability/logger";
import { domainMailboxes } from "./gmail";
import { splitBody } from "./notion";
import {
  chunkPage,
  recordSweep,
  shouldSweep,
  sweepStale,
  touchChunks,
  upsertChunks,
  type BrainRow,
  type IngestResult,
  isJobApplication,
} from "./upsert";

const SOURCE = "calendar";
const API = "https://www.googleapis.com/calendar/v3/calendars";
const TIMEOUT_MS = 20_000;
const PAGE_SIZE = 250;
const MAX_PAGES = 12;

/**
 * 2 — the occurrence key. THE BUMP IS LOAD-BEARING HERE, unlike in the other ingesters
 * where it only forces a re-fetch.
 *
 * `known` is read solely to decide which stored rows to TOUCH, so that the sweep does not
 * take them. Every row written under version 1 is keyed on the bare `iCalUID`, and those
 * ids will never be written again — so if they still counted as current they would be
 * touched forever and the old series-collapsed rows would outlive the fix. Marking them
 * stale is what lets the sweep clear them once the new rows exist.
 *
 * The sweep's majority-deletion guard permits it: ~92 stale rows against the ~350 the
 * corrected key produces is nowhere near a majority. Until the first sweep runs, both
 * shapes are present and one occurrence per series appears twice.
 */
/**
 * 3: events carry the `mailbox` they were walked from, so the sweep can tell a
 * calendar it did not walk from one whose meetings were deleted. Rows written
 * under 2 have no mailbox and are simply rewritten on the next walk.
 */
export const CALENDAR_BUILDER_VERSION = 3;

/**
 * How far back and forward to read.
 *
 * Backwards is history worth having; forwards is what is ABOUT to happen, which is
 * the half a person actually asks about ("what is on this week"). Both are bounded
 * so a recurring standup created in 2019 does not expand into thousands of copies.
 */
const DAYS_BACK = 400;
const DAYS_FORWARD = 120;

/** Same tolerance as the Gmail walk, and for the same reason. */
const MAX_TOLERATED_FAILURES = 10;

interface CalEvent {
  id?: string;
  iCalUID?: string;
  status?: string;
  summary?: string;
  description?: string;
  location?: string;
  htmlLink?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  organizer?: { email?: string; displayName?: string; self?: boolean };
  attendees?: Array<{
    email?: string;
    displayName?: string;
    responseStatus?: string;
    resource?: boolean;
  }>;
}

/** A person, preferring the name they chose over their address. */
function who(a: { email?: string; displayName?: string }): string {
  return (a.displayName || a.email || "").trim();
}

/** The day an event happens, for `period_end`. All-day events carry `date`. */
export function eventDay(e: CalEvent): string | null {
  const raw = e.start?.dateTime || e.start?.date || "";
  return /^\d{4}-\d{2}-\d{2}/.test(raw) ? raw.slice(0, 10) : null;
}

/**
 * Is this worth indexing at all?
 *
 * A calendar is full of things that are not meetings — "Focus time", "Lunch", a
 * blocked-out morning, a birthday from the contacts calendar. They have no guests,
 * no agenda, and answering a question with one would be noise. A cancelled event is
 * dropped for the same reason: it did not happen.
 */
export function isWorthIndexing(e: CalEvent): boolean {
  if (e.status === "cancelled") return false;
  if (!e.summary?.trim()) return false;
  // A candidate interview names the candidate in its title and invites them by address.
  if (isJobApplication(e.summary)) return false;
  const humans = (e.attendees ?? []).filter((a) => !a.resource);
  const hasAgenda = (e.description ?? "").trim().length > 0;
  return humans.length > 1 || hasAgenda;
}

/**
 * `mailbox` is REQUIRED, not optional. It was optional first, and a mutation
 * that dropped it at the only call site compiled and passed every test — the
 * rows would simply have carried `mailbox: null` and the sweep would have had
 * nothing to scope by. Making it required turns that into a compile error.
 */
export function eventToRows(e: CalEvent, stampedAt: string, mailbox: string | null): BrainRow[] {
  if (!isWorthIndexing(e)) return [];
  /**
   * Keyed on `iCalUID` PLUS THE DAY, and the day is not optional.
   *
   * `iCalUID` alone is right for one half of the problem and catastrophically wrong for
   * the other. One meeting exists once on every guest's calendar with a different `id`
   * each time, so keying on `id` would store a six-person meeting six times — that is
   * what the uid solves. But `iCalUID` is ALSO shared by every occurrence of a recurring
   * series, and `singleEvents=true` expands those into one item per occurrence. So every
   * weekly sync collapsed onto a single row and whichever occurrence was written last
   * won.
   *
   * MEASURED 2026-02: sixteen instances on the calendar, FOUR distinct iCalUIDs — nine
   * daily "LoveIQ Sync" occurrences sharing one. The corpus held 4 rows for that month
   * against 14 meetings that produced notes, and 92 rows in total for fourteen months of
   * a company that meets several times a week. Every one of those meetings had happened;
   * the record of all but the last of each series was simply overwritten.
   *
   * `uid + day` keeps the property that mattered — every guest's copy of one occurrence
   * shares both — while separating occurrences. An event with no resolvable day keeps
   * the old shape, since there is nothing to separate it by.
   *
   * ponytail: day granularity, not the full start timestamp. A series recurring twice in
   * one day would still collapse; nothing in this workspace does, and a timestamp key
   * changes on every reschedule and orphans the old row.
   */
  const uid = (e.iCalUID || e.id || "").trim();
  if (!uid) return [];

  const day = eventDay(e);
  const guests = (e.attendees ?? [])
    .filter((a) => !a.resource)
    .map(who)
    .filter(Boolean);
  const declined = new Set(
    (e.attendees ?? [])
      .filter((a) => a.responseStatus === "declined")
      .map(who)
      .filter(Boolean)
  );
  const attending = guests.filter((g) => !declined.has(g));

  const title = `Meeting: ${e.summary!.trim()}`;
  const lines = [
    title,
    day
      ? `When: ${day}${e.start?.dateTime ? ` ${e.start.dateTime.slice(11, 16)}` : " (all day)"}`
      : "",
    e.organizer ? `Organised by: ${who(e.organizer)}` : "",
    attending.length ? `With: ${attending.join(", ")}` : "",
    declined.size ? `Declined: ${[...declined].join(", ")}` : "",
    e.location?.trim() ? `Where: ${e.location.trim()}` : "",
    "",
    (e.description ?? "").trim(),
  ].filter(Boolean);

  const base: BrainRow = {
    source: SOURCE,
    source_id: day ? `event:${uid}:${day}` : `event:${uid}`,
    title,
    url: e.htmlLink ?? null,
    body: lines.join("\n"),
    meta: {
      kind: "calendar-event",
      v: CALENDAR_BUILDER_VERSION,
      attendees: attending.slice(0, 12),
      /**
       * The TRUE count, because the list above is capped at 12 and one meeting in
       * the corpus sits exactly on that cap — indistinguishable, from the row
       * alone, from a meeting that really had twelve people. Cheap to record and
       * it stops a reader counting a truncated list as the attendance.
       */
      attendeeCount: attending.length,
      organizer: e.organizer ? who(e.organizer) : null,
      /**
       * The calendar this row was walked from. One meeting is stored ONCE
       * (keyed on iCalUID plus the day), so this is whichever attendee's
       * calendar last wrote it — which is exactly what the sweep needs: if that
       * person is still walked the row is touched, and if they are not, the row
       * belongs to a calendar this run could not see.
       */
      mailbox,
    },
    updated_at: stampedAt,
    period_end: day,
  };

  const parts = splitBody(base.body);
  return parts.map((body, i) =>
    i === 0
      ? { ...base, body }
      : {
          ...base,
          source_id: `${base.source_id}#${i + 1}`,
          title: `${title} (part ${i + 1} of ${parts.length})`,
          body,
          meta: { ...base.meta, part: i + 1, parts: parts.length },
        }
  );
}

async function calGet(token: string, path: string): Promise<Record<string, unknown> | null> {
  const res = await fetchWithTimeout(`${API}/primary/${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    timeoutMs: TIMEOUT_MS,
  });
  if (!res.ok) {
    logger.warn(
      { status: res.status, detail: (await res.text().catch(() => "")).slice(0, 200) },
      "brain-ingest calendar: api refused"
    );
    return null;
  }
  return (await res.json().catch(() => null)) as Record<string, unknown> | null;
}

/** source_id -> whether the row is on the current builder version. */
/** What a stored calendar row tells the keep decision: its builder version and whose it is. */
export interface KnownEvent {
  current: boolean;
  mailbox: string | null;
}

/**
 * The stored rows to CONFIRM — keep through the sweep — after a walk.
 *
 * A row outside the listing window is history: nothing re-reads it, so it is kept. A row
 * INSIDE the window, from a calendar this walk actually read, that the walk did not write
 * is not history — it is a meeting that was cancelled, deleted or moved, or one now
 * refused (an interview, since 2026-09-23). The Calendar API does not list cancelled
 * events by default, so before this a meeting cancelled after it was indexed was never
 * rewritten, was confirmed forever, and the brain went on describing it as scheduled.
 *
 * `read` is the calendars that answered, NOT every calendar asked: up to ten token
 * failures leave the walk complete, and `walkedScopes` includes those mailboxes, so their
 * rows must still be confirmed or one refused token would delete a person's meetings.
 * A two-day margin at each edge of the window absorbs time-zone slop in the day the id
 * carries; an id with no day is confirmed, as before.
 */
export function eventsToConfirm(
  known: Map<string, KnownEvent>,
  writtenIds: Set<string>,
  read: ReadonlySet<string>,
  window: { from: string; to: string }
): string[] {
  const rewritten = new Set([...writtenIds].map((id) => id.split("#")[0]));
  const shift = (day: string, days: number) =>
    new Date(Date.parse(`${day}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
  const inside = { from: shift(window.from, 2), to: shift(window.to, -2) };
  return [...known.entries()]
    .filter(([id, k]) => {
      if (writtenIds.has(id)) return false;
      const base = id.split("#")[0] ?? id;
      if (rewritten.has(base)) return false;
      if (!k.current) return false;
      const day = /:(\d{4}-\d{2}-\d{2})$/.exec(base)?.[1];
      const inWindow = day !== undefined && day >= inside.from && day <= inside.to;
      if (inWindow && k.mailbox && read.has(k.mailbox)) return false;
      return true;
    })
    .map(([id]) => id);
}

async function knownEvents(): Promise<Map<string, KnownEvent>> {
  const { supabaseFetch } = await import("@features/admin/server/supabase");
  const out = new Map<string, KnownEvent>();
  for (let offset = 0; offset < 100_000; offset += 1000) {
    const res = await supabaseFetch(
      `/rest/v1/brain_chunk?select=source_id,meta&source=eq.${SOURCE}` +
        `&order=source_id.asc&limit=1000&offset=${offset}`
    );
    // Fails closed on an unreadable status AND on an unreadable body: an empty or
    // truncated map reads as "nothing indexed" and the sweep deletes the difference.
    const batch = await chunkPage<{
      source_id?: string;
      meta?: { v?: number; mailbox?: string | null };
    }>("calendar", res);
    for (const r of batch) {
      if (r.source_id) {
        out.set(r.source_id, {
          current: r.meta?.v === CALENDAR_BUILDER_VERSION,
          mailbox: typeof r.meta?.mailbox === "string" ? r.meta.mailbox : null,
        });
      }
    }
    if (batch.length < 1000) break;
  }
  return out;
}

export async function ingestCalendar(
  stampedAt: string,
  isOutOfTime: () => boolean = () => false,
  oidcToken?: string | null
): Promise<IngestResult> {
  if (isOutOfTime()) {
    return { source: SOURCE, rows: 0, swept: 0, skipped: "calendar-time-budget" };
  }

  const own = await getGoogleAccessToken(Date.now(), oidcToken);
  if (!own) return { source: SOURCE, rows: 0, swept: 0, skipped: "google-token-unavailable" };

  const boxes = await domainMailboxes(oidcToken);
  if (!boxes || boxes.length === 0) {
    logger.warn(
      { credential: googleCredentialShape(oidcToken) },
      "brain-ingest calendar: no mailboxes discovered, so no calendar is reachable"
    );
    return { source: SOURCE, rows: 0, swept: 0, skipped: "calendar-no-mailboxes" };
  }

  const now = Date.now();
  const timeMin = new Date(now - DAYS_BACK * 86_400_000).toISOString();
  const timeMax = new Date(now + DAYS_FORWARD * 86_400_000).toISOString();

  const known = await knownEvents();
  const rows: BrainRow[] = [];
  const failures: string[] = [];
  let complete = true;
  let seenEvents = 0;

  for (const mailbox of boxes) {
    if (isOutOfTime()) {
      complete = false;
      break;
    }
    const token = await getDelegatedToken(mailbox, CALENDAR_SCOPE, Date.now(), oidcToken);
    if (!token) {
      /**
       * THIS is what a missing calendar scope looks like, not `calendar-no-mailboxes`.
       *
       * Mailbox discovery uses the DIRECTORY scope, which already works — so the
       * domain list comes back fine and then every per-calendar token is refused.
       * If this fires for every mailbox, the delegation grant in the Google Admin
       * console is missing `.../auth/calendar.readonly`.
       *
       * One unreachable calendar must also not let the sweep run as if that
       * person's meetings had been deleted.
       */
      failures.push(mailbox);
      complete = false;
      continue;
    }

    let pageToken = "";
    for (let page = 0; page < MAX_PAGES; page++) {
      if (isOutOfTime()) {
        complete = false;
        break;
      }
      const listed = await calGet(
        token,
        `events?singleEvents=true&orderBy=startTime&maxResults=${PAGE_SIZE}` +
          `&timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}` +
          (pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : "")
      );
      if (!listed) {
        complete = false;
        break;
      }
      const items = (listed.items as CalEvent[]) ?? [];
      seenEvents += items.length;
      for (const e of items) rows.push(...eventToRows(e, stampedAt, mailbox));

      pageToken = (listed.nextPageToken as string) ?? "";
      if (!pageToken) break;
      if (page === MAX_PAGES - 1) complete = false;
    }
  }

  if (failures.length > MAX_TOLERATED_FAILURES) complete = false;
  if (failures.length === boxes.length && boxes.length > 0) {
    logger.warn(
      { mailboxes: boxes.length, scope: CALENDAR_SCOPE },
      "brain-ingest calendar: EVERY calendar refused a delegated token — the calendar scope is " +
        "almost certainly missing from the domain-wide delegation grant in the Google Admin console"
    );
  }

  const written = await upsertChunks(rows);
  const writtenIds = new Set(rows.map((r) => r.source_id));
  // Sweeping about once a day instead of every run: the touch it needs rewrites
  // four indexes per row, and a deleted source document can wait a day to be
  // noticed. See shouldSweep.
  const sweeping = complete && (await shouldSweep(SOURCE));
  // BEFORE the touch, not after. The touch can throw (it fails closed so a failed
  // confirm never lets the sweep delete those rows), and with the record after it,
  // a throw meant the attempt was never written -- so brain-drive retried its
  // 16,000-row touch EVERY HOUR, timing out at the same place and generating
  // exactly the disk IO this change exists to remove. Recording the attempt first
  // is what the comment on recordSweep already claimed the code did.
  if (sweeping) await recordSweep(SOURCE);
  const read = new Set(boxes.filter((m) => !failures.includes(m)));
  const touched = await touchChunks(
    SOURCE,
    eventsToConfirm(known, writtenIds, read, {
      from: timeMin.slice(0, 10),
      to: timeMax.slice(0, 10),
    }),
    stampedAt,
    sweeping
  );
  const swept = sweeping
    ? await sweepStale(SOURCE, stampedAt, written + touched, {
        scopeKey: "mailbox",
        /**
         * `domainMailboxes()` lists `isSuspended=false` users, so an offboarded
         * colleague DROPS OFF this list — no token failure, nothing to set
         * `complete = false`, and the walk finishes cleanly over everyone else.
         * Their meetings then go stale and are deleted. It is the same root
         * cause as the Gmail mailbox sweep, through the same function, and the
         * unreachable-calendar guard above does not reach it: that one only
         * fires when a token is refused.
         */
        walkedScopes: new Set(boxes),
      })
    : 0;

  logger.info(
    {
      mailboxes: boxes.length,
      unreachable: failures,
      seenEvents,
      written,
      touched,
      swept,
      complete,
    },
    "brain-ingest calendar"
  );

  if (!complete) {
    return { source: SOURCE, rows: written + touched, swept, skipped: "calendar-walk-incomplete" };
  }
  if (written === 0 && touched === 0) {
    return { source: SOURCE, rows: 0, swept: 0, skipped: "calendar-nothing-to-index" };
  }
  return { source: SOURCE, rows: written + touched, swept };
}
