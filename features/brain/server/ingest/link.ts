import { supabaseFetch } from "@features/admin/server/supabase";
import logger from "@shared/observability/logger";

/**
 * Join a meeting to its own notes.
 *
 * WHY THIS EXISTS. The same meeting is in the corpus twice and neither half knows
 * the other. The calendar event knows who was INVITED and who organised it; the
 * Gemini notes know what was SAID and by whom. So "who was in the room when we
 * decided that" could not be answered from the notes, and "what came out of that
 * meeting" could not be answered from the calendar — each holds exactly the half
 * the question does not start from.
 *
 * DETERMINISTIC, NOT INFERRED. A note is titled
 * `Meeting notes: <name> - YYYY/MM/DD HH:MM TZ - Notes by …` and a calendar body
 * carries `When: YYYY-MM-DD HH:MM`, so the join is name + date + a time window.
 * Measured over the whole corpus 2026-09-11: 0 of 1,993 note titles failed to
 * parse, and 289 of 293 events carry a parseable time.
 *
 * THE WINDOW IS 90 MINUTES, and that number is measured rather than chosen. Note
 * timestamps sit a median of 2 minutes from their event, 78 of 86 within half an
 * hour. The next five land at 45, 57, 58, 59 and 61 minutes — which are meeting
 * DURATIONS, from notes stamped when the recording stopped rather than started.
 * The remaining three are 147, 181 and 446 minutes apart and are simply different
 * meetings that happen to share a name and a day. 90 keeps the five and refuses
 * the three.
 *
 * IT MUST RUN AFTER THE CALENDAR INGEST, and that is not a preference.
 *
 * `ingestCalendar` rewrites every event row on every run, and a rewrite replaces the
 * whole `meta` object — so it wipes `links`, which nothing in the ingest path knows
 * about. Observed directly: a calendar cron at 18:26 left 0 of 83 events linked, and
 * the next linker run restored all 83. Drive is the opposite: it skips chunks whose
 * content has not changed, so note links survive its hourly pass untouched.
 *
 * So the calendar half self-heals ONLY because this is called from that same cron,
 * immediately after. That dependency is invisible from either file, which is why it
 * is written here and guarded by `mcp-links-present` in the MCP battery — if links
 * ever go missing wholesale, that probe is what says so.
 *
 * A WRONG LINK IS WORSE THAN A MISSING ONE. It would attribute one meeting's
 * attendees to another meeting's decisions, silently. So where a name and date
 * have several candidate events the CLOSEST wins, and if even that is outside the
 * window nothing is written.
 */
const WINDOW_MINUTES = 90;

const NOTE_TITLE = /^Meeting notes:\s*(.+?)\s*-\s*(\d{4})\/(\d{2})\/(\d{2})\s+(\d{2}):(\d{2})/;
const EVENT_WHEN = /When:\s*(\d{4}-\d{2}-\d{2})\s+(\d{2}):(\d{2})/;

/** Punctuation and case differ between a calendar title and a note title. */
const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, "");

interface Row {
  id: number;
  source: string;
  source_id: string;
  title: string | null;
  body: string;
  meta: Record<string, unknown> | null;
}

export interface LinkResult {
  source: string;
  rows: number;
  swept: number;
  skipped?: string;
}

async function readAll(query: string): Promise<Row[] | null> {
  const out: Row[] = [];
  for (let offset = 0; ; offset += 1000) {
    const res = await supabaseFetch(`/rest/v1/brain_chunk?${query}&limit=1000&offset=${offset}`);
    // A partial read would compute links from half the corpus and then write them,
    // which is worse than not running: it looks like a completed pass.
    if (!res.ok) return null;
    const page = (await res.json()) as Row[];
    out.push(...page);
    if (page.length < 1000) return out;
  }
}

export async function linkMeetings(): Promise<LinkResult> {
  const events = await readAll("select=id,source,source_id,title,body,meta&source=eq.calendar");
  const notes = await readAll(
    "select=id,source,source_id,title,body,meta&source=eq.drive&title=ilike.Meeting%20notes:*"
  );
  if (!events || !notes)
    return { source: "links", rows: 0, swept: 0, skipped: "corpus-read-failed" };

  // (normalised name, date) -> events that day, with their start minute.
  const byKey = new Map<string, Array<{ id: string; minute: number }>>();
  for (const e of events) {
    const when = EVENT_WHEN.exec(e.body ?? "");
    if (!when || !e.title) continue;
    const key = `${norm(e.title.replace(/^Meeting:\s*/, ""))}|${when[1]}`;
    const minute = Number(when[2]) * 60 + Number(when[3]);
    const list = byKey.get(key) ?? [];
    list.push({ id: `${e.source}/${e.source_id}`, minute });
    byKey.set(key, list);
  }

  // A note document is split into parts; every part shares the document's link.
  const linkFor = new Map<string, string>(); // note document id -> event id
  const noteDocsPerEvent = new Map<string, Set<string>>();
  for (const n of notes) {
    const m = NOTE_TITLE.exec(n.title ?? "");
    if (!m) continue;
    const key = `${norm(m[1]!)}|${m[2]}-${m[3]}-${m[4]}`;
    const candidates = byKey.get(key);
    if (!candidates?.length) continue;
    const minute = Number(m[5]) * 60 + Number(m[6]);
    const best = candidates.reduce((a, b) =>
      Math.abs(a.minute - minute) <= Math.abs(b.minute - minute) ? a : b
    );
    if (Math.abs(best.minute - minute) > WINDOW_MINUTES) continue;
    const doc = n.source_id.split("#")[0]!;
    linkFor.set(doc, best.id);
    const set = noteDocsPerEvent.get(best.id) ?? new Set<string>();
    set.add(`drive/${doc}`);
    noteDocsPerEvent.set(best.id, set);
  }

  let written = 0;
  const patch = async (row: Row, links: string[]): Promise<void> => {
    const existing = (row.meta?.links as string[] | undefined) ?? [];
    // Idempotent: an unchanged link list must not rewrite the row, or every run
    // would churn the table and clear nothing but time.
    if (existing.length === links.length && existing.every((l, i) => l === links[i])) return;
    const res = await supabaseFetch(`/rest/v1/brain_chunk?id=eq.${row.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ meta: { ...(row.meta ?? {}), links } }),
    });
    if (res.ok) written += 1;
    else logger.warn({ id: row.id, status: res.status }, "brain: could not write a meeting link");
  };

  /**
   * IN BATCHES, because a note document is stored as up to 36 parts and every part
   * carries the link. Sequentially that is ~1,400 round trips to a database in
   * another country — measured at over two minutes, which is longer than the cron
   * that would call it. Twenty at a time brings it under ten seconds and stays
   * polite to PostgREST.
   */
  const work: Array<() => Promise<void>> = [];
  for (const n of notes) {
    const target = linkFor.get(n.source_id.split("#")[0]!);
    if (target) work.push(() => patch(n, [target]));
  }
  for (const e of events) {
    const docs = noteDocsPerEvent.get(`${e.source}/${e.source_id}`);
    if (docs) work.push(() => patch(e, [...docs].sort()));
  }
  for (let i = 0; i < work.length; i += 20) {
    await Promise.all(work.slice(i, i + 20).map((f) => f()));
  }

  return { source: "links", rows: written, swept: 0 };
}
