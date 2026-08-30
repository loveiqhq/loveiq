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
import { sweepStale, touchChunks, upsertChunks, type BrainRow, type IngestResult } from "./upsert";

const SOURCE = "calendar";
const API = "https://www.googleapis.com/calendar/v3/calendars";
const TIMEOUT_MS = 20_000;
const PAGE_SIZE = 250;
const MAX_PAGES = 12;

export const CALENDAR_BUILDER_VERSION = 1;

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
  const humans = (e.attendees ?? []).filter((a) => !a.resource);
  const hasAgenda = (e.description ?? "").trim().length > 0;
  return humans.length > 1 || hasAgenda;
}

export function eventToRows(e: CalEvent, stampedAt: string): BrainRow[] {
  if (!isWorthIndexing(e)) return [];
  /**
   * Keyed on `iCalUID`, NOT on the per-calendar `id`.
   *
   * One meeting exists once on every guest's calendar with a different `id` each
   * time. Using `id` would store a six-person meeting six times; `iCalUID` is the
   * same across all copies, so the upsert collapses them to one and whoever is read
   * last simply confirms it.
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
    source_id: `event:${uid}`,
    title,
    url: e.htmlLink ?? null,
    body: lines.join("\n"),
    meta: {
      kind: "calendar-event",
      v: CALENDAR_BUILDER_VERSION,
      attendees: attending.slice(0, 12),
      organizer: e.organizer ? who(e.organizer) : null,
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
async function knownEvents(): Promise<Map<string, boolean>> {
  const { supabaseFetch } = await import("@features/admin/server/supabase");
  const out = new Map<string, boolean>();
  for (let offset = 0; offset < 100_000; offset += 1000) {
    const res = await supabaseFetch(
      `/rest/v1/brain_chunk?select=source_id,meta&source=eq.${SOURCE}` +
        `&order=source_id.asc&limit=1000&offset=${offset}`
    );
    // FAIL CLOSED, like Gmail: an empty map reads as "nothing indexed", and the
    // sweep would then delete every event we hold.
    if (!res.ok)
      throw new Error(`calendar: could not read what is already indexed (${res.status})`);
    const batch = (await res.json().catch(() => [])) as Array<{
      source_id?: string;
      meta?: { v?: number };
    }>;
    for (const r of batch) {
      if (r.source_id) out.set(r.source_id, r.meta?.v === CALENDAR_BUILDER_VERSION);
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
      // One unreachable calendar must not let the sweep run as if that person's
      // meetings had been deleted.
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
      for (const e of items) rows.push(...eventToRows(e, stampedAt));

      pageToken = (listed.nextPageToken as string) ?? "";
      if (!pageToken) break;
      if (page === MAX_PAGES - 1) complete = false;
    }
  }

  if (failures.length > MAX_TOLERATED_FAILURES) complete = false;

  const written = await upsertChunks(rows);
  const writtenIds = new Set(rows.map((r) => r.source_id));
  const rewritten = new Set([...writtenIds].map((id) => id.split("#")[0]));
  const touched = await touchChunks(
    SOURCE,
    [...known.entries()]
      .filter(([id, current]) => {
        if (writtenIds.has(id)) return false;
        if (rewritten.has(id.split("#")[0] ?? id)) return false;
        return current;
      })
      .map(([id]) => id),
    stampedAt
  );
  const swept = complete ? await sweepStale(SOURCE, stampedAt, written + touched) : 0;

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
