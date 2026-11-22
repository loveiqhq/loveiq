import { supabaseFetch } from "@features/admin/server/supabase";
import { getEmailSiteUrl } from "@shared/emails/site-url";
import { googleCalendarUrl, joinedOccurrence, nextOccurrence, type WeeklySlot } from "./calendar";
import { logMiraEvent } from "./store";

/**
 * The weekly session (Marcus, 17 Nov 2026; Sanjin's "Always schedule the next session and send a
 * calendar invite before ending"): one weekly slot per person, booked in the app, in
 * mira_session_slot (supabase/migrations/20261122050000_mira_sessions.sql). Every read and write
 * is scoped to the signed-in account's id. Times only, never words. The emails and the reminder
 * run are in session-emails.ts.
 */

export type StoredSlot = WeeklySlot & { id: string; sequence: number; paused: boolean };

type Row = {
  id: string;
  weekday: number;
  local_time: string;
  time_zone: string;
  sequence: number;
  paused_at: string | null;
};

export const SLOT_COLS = "id,weekday,local_time,time_zone,sequence,paused_at";
const enc = encodeURIComponent;

const isRow = (r: unknown): r is Row => {
  const x = r as Partial<Row> | null;
  return (
    typeof x?.id === "string" &&
    typeof x.weekday === "number" &&
    typeof x.local_time === "string" &&
    typeof x.time_zone === "string"
  );
};

export const toSlot = (r: Row): StoredSlot => ({
  id: r.id,
  weekday: r.weekday,
  time: r.local_time,
  timeZone: r.time_zone,
  sequence: r.sequence ?? 0,
  paused: Boolean(r.paused_at),
});

type Init = Parameters<typeof supabaseFetch>[1];

async function slots(path: string, init?: Init): Promise<StoredSlot[]> {
  const res = await supabaseFetch(path, init);
  if (!res.ok)
    throw new Error(`mira weekly session ${init?.method ?? "read"} failed (${res.status})`);
  const out: unknown = await res.json().catch(() => []);
  return Array.isArray(out) ? out.filter(isRow).map(toSlot) : [];
}

const mine = (userId: string) => `/rest/v1/mira_session_slot?user_id=eq.${enc(userId)}`;
const returning = { Prefer: "return=representation" };

export async function getSlot(userId: string): Promise<StoredSlot | null> {
  return (await slots(`${mine(userId)}&select=${SLOT_COLS}&limit=1`))[0] ?? null;
}

const same = (a: WeeklySlot, b: WeeklySlot) =>
  a.weekday === b.weekday && a.time === b.time && a.timeZone === b.timeZone;

/**
 * Books the slot, or moves the person's series to it (same id, so the invite's UID; the sequence
 * one higher, so calendars take the update). Booking the time already booked changes nothing.
 * A change racing another is retried once against the newer row, so no two updates share a
 * sequence.
 */
export async function saveSlot(
  userId: string,
  slot: WeeklySlot
): Promise<{ slot: StoredSlot; change: "booked" | "moved" | "same" }> {
  const fields = { weekday: slot.weekday, local_time: slot.time, time_zone: slot.timeZone };
  for (let attempt = 0; attempt < 2; attempt++) {
    const had = await getSlot(userId);
    if (had && same(had, slot)) return { slot: had, change: "same" };
    const res = had
      ? await supabaseFetch(
          `${mine(userId)}&id=eq.${enc(had.id)}&sequence=eq.${had.sequence}&select=${SLOT_COLS}`,
          {
            method: "PATCH",
            headers: returning,
            body: JSON.stringify({
              ...fields,
              sequence: had.sequence + 1,
              updated_at: new Date().toISOString(),
            }),
          }
        )
      : await supabaseFetch(`/rest/v1/mira_session_slot?select=${SLOT_COLS}`, {
          method: "POST",
          headers: returning,
          body: JSON.stringify({ user_id: userId, ...fields }),
        });
    if (res.status === 409) continue; // booked at the same moment elsewhere: update that one
    if (!res.ok) throw new Error(`mira weekly session save failed (${res.status})`);
    const saved = ((await res.json()) as unknown[]).filter(isRow).map(toSlot)[0];
    if (saved) return { slot: saved, change: had ? "moved" : "booked" };
  }
  throw new Error("mira weekly session save lost a race twice");
}

/** Reminder emails off (the slot and the calendar entry stay) or back on. */
export async function setPaused(userId: string, paused: boolean): Promise<StoredSlot | null> {
  const now = new Date().toISOString();
  const [slot] = await slots(`${mine(userId)}&select=${SLOT_COLS}`, {
    method: "PATCH",
    headers: returning,
    body: JSON.stringify({ paused_at: paused ? now : null, updated_at: now }),
  });
  return slot ?? null;
}

/**
 * Deletes the person's slot (and with it its reminders), returning what it was: cancelling, and
 * the under-18 stop (server/minor.ts), which sends nothing.
 */
export async function deleteSlot(userId: string): Promise<StoredSlot | null> {
  const [slot] = await slots(`${mine(userId)}&select=${SLOT_COLS}`, {
    method: "DELETE",
    headers: returning,
  });
  return slot ?? null;
}

/** What the pages show of a slot: its time, whether reminders are on, its next start. */
export function slotView(slot: StoredSlot, now = new Date()) {
  return {
    weekday: slot.weekday,
    time: slot.time,
    timeZone: slot.timeZone,
    paused: slot.paused,
    // From half an hour back: a session under way is still "next", so Home can say "now".
    next: nextOccurrence(slot, new Date(now.getTime() - 30 * 60_000)).toISOString(),
    googleUrl: googleCalendarUrl({ slot, now, ...calendarText() }),
  };
}

/**
 * The calendar entry's words: neutral, as the person's calendar may be seen by others. Always the
 * live site's address (getEmailSiteUrl), as an entry outlives any test deployment.
 */
export function calendarText() {
  const url = `${getEmailSiteUrl()}/mira/session`;
  return {
    summary: "15 minutes with Mira",
    details: `Your weekly session with Mira. When it's time, open it here: ${url}`,
    url,
  };
}

/**
 * Attendance: the session was opened while it was open (from its reminder, an hour before, to 30
 * minutes after the start), for a start its reminder went out for. Marked once per start
 * (joined_at), so opening it twice counts once. True when marked now.
 */
export async function markJoined(slot: StoredSlot, userId: string, at: Date): Promise<boolean> {
  const start = joinedOccurrence(slot, at);
  if (!start) return false;
  const res = await supabaseFetch(
    `/rest/v1/mira_session_reminder?slot_id=eq.${enc(slot.id)}&starts_at=eq.${enc(start.toISOString())}&joined_at=is.null&select=id`,
    { method: "PATCH", headers: returning, body: JSON.stringify({ joined_at: at.toISOString() }) }
  );
  if (!res.ok) throw new Error(`mira session join failed (${res.status})`);
  const marked = (await res.json().catch(() => [])) as unknown[];
  if (!Array.isArray(marked) || marked.length === 0) return false;
  logMiraEvent(
    "session_attended",
    { userId },
    { minutes: Math.round((at.getTime() - start.getTime()) / 60_000) }
  );
  return true;
}
