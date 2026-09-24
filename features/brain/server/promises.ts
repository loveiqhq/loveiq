import { supabaseFetch } from "@features/admin/server/supabase";

/**
 * WHAT PEOPLE PROMISED IN MEETINGS, read off the notes by code rather than by a model.
 *
 * Gemini ends every set of meeting notes with a "Next steps" list in one fixed shape:
 *
 *   * [Mark Oldenburg, Sanjin Kacevac] Finalize Content: Finalize the fantasy versus reality chapter.
 *   * [The group] Review Chapters: Review four chapters of content across archetypes.
 *
 * So "what did I promise this week" does not need a search and a model's reading of it,
 * which can skip a line or merge two. This parses every such line in a date range, one
 * item per owner, with the meeting it came from. Plan item G11 (meetings to tasks); Mark
 * asked for "What was Done with Links… in order of priority" and Marcus does not "work well
 * with tasks hidden" anywhere.
 *
 * It lists promises, it does not judge them done: nothing here is matched against Notion,
 * and the output says so rather than implying a tracked state it does not have.
 */

export interface MeetingPromise {
  owners: string[];
  title: string;
  detail: string;
  meeting: string;
  date: string;
  id: string;
  url: string | null;
}

const ITEM = /^\s*[*•-]\s*\[([^\]]+)\]\s*([^:]{2,120}):\s*(.+?)\s*$/;

/**
 * The meeting's name and day from Gemini's title, "Meeting notes: LoveIQ Sync - 2026/09/24
 * 11:59 CEST - Notes by Gemini". The day comes from the title when it has one, because the
 * document's own date can be the next morning, when the notes were written up.
 */
export function meetingOf(title: string, fallbackDate: string): { name: string; date: string } {
  const bare = title
    .replace(/^Meeting notes:\s*/i, "")
    .replace(/\s*-\s*Notes by Gemini.*$/i, "")
    .replace(/\s*\(part \d+ of \d+\)\s*$/i, "")
    .trim();
  const day = /(\d{4})\/(\d{2})\/(\d{2})/.exec(bare);
  return {
    name:
      bare.replace(/\s*-\s*\d{4}\/\d{2}\/\d{2}(?:\s+\d{1,2}:\d{2})?(?:\s+[A-Z]{2,5})?\s*$/, "") ||
      bare,
    date: day ? `${day[1]}-${day[2]}-${day[3]}` : fallbackDate,
  };
}

/**
 * The "Next steps" items in one body. Only lines after the heading count, and the list
 * ends at the first line that is not an item once items have started, so a bracketed line
 * elsewhere in the notes is never read as a promise.
 */
export function parseNextSteps(
  body: string
): Array<{ owners: string[]; title: string; detail: string }> {
  const at = body.search(/^\s*Next steps\s*$/im);
  if (at < 0) return [];
  const out: Array<{ owners: string[]; title: string; detail: string }> = [];
  let started = false;
  for (const line of body.slice(at).split("\n").slice(1)) {
    const m = ITEM.exec(line);
    if (!m) {
      if (started && line.trim()) break;
      continue;
    }
    started = true;
    out.push({
      owners: m[1]!
        .split(",")
        .map((o) => o.trim())
        .filter(Boolean),
      title: m[2]!.trim(),
      detail: m[3]!.trim(),
    });
  }
  return out;
}

interface NoteRow {
  source_id: string;
  title: string | null;
  url: string | null;
  body: string;
  period_end: string | null;
}

/** Every promise in meeting notes dated `since` to `until`, newest meeting first. */
export async function meetingPromises(
  since: string,
  until: string | null
): Promise<{ ok: true; promises: MeetingPromise[] } | { ok: false; status: number }> {
  const rows: NoteRow[] = [];
  for (let offset = 0; offset < 20_000; offset += 1000) {
    const res = await supabaseFetch(
      `/rest/v1/brain_chunk?select=source_id,title,url,body,period_end&source=eq.drive` +
        `&meta->>section=eq.summary&period_end=gte.${since}` +
        (until ? `&period_end=lte.${until}` : "") +
        `&body=ilike.*Next%20steps*` +
        `&order=period_end.desc,source_id.asc&limit=1000&offset=${offset}`
    );
    if (!res.ok) return { ok: false, status: res.status };
    const batch = (await res.json().catch(() => null)) as NoteRow[] | null;
    if (!Array.isArray(batch)) return { ok: false, status: res.status };
    rows.push(...batch);
    if (batch.length < 1000) break;
  }
  const seen = new Set<string>();
  const promises: MeetingPromise[] = [];
  // Newest meeting first by the meeting's own day, which can differ from the stored date.
  for (const r of rows) {
    const id = `drive/${r.source_id.replace(/#\d+$/, "")}`;
    for (const item of parseNextSteps(r.body)) {
      const key = `${id}|${item.owners.join(",")}|${item.title}|${item.detail}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const meeting = meetingOf(r.title ?? "", r.period_end ?? "");
      promises.push({ ...item, meeting: meeting.name, date: meeting.date, id, url: r.url });
    }
  }
  promises.sort((a, b) => b.date.localeCompare(a.date));
  return { ok: true, promises };
}

/**
 * Promises grouped by owner, one line each. With `person`, only theirs, plus what was
 * given to the whole group, which is theirs too.
 */
export function renderPromises(promises: MeetingPromise[], person: string | null): string {
  const byOwner = new Map<string, MeetingPromise[]>();
  for (const p of promises) {
    for (const owner of p.owners) {
      if (person && owner !== person && !/^the group$/i.test(owner)) continue;
      const list = byOwner.get(owner) ?? [];
      list.push(p);
      byOwner.set(owner, list);
    }
  }
  if (byOwner.size === 0) {
    return person
      ? `No meeting notes in this period give ${person} a next step. Check the exact spelling against the roster.`
      : "No meeting notes in this period carry a next-steps list.";
  }
  const blocks = [...byOwner.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .map(
      ([owner, list]) =>
        `${owner} (${list.length}):\n` +
        list
          .map((p) => `- ${p.date} ${p.meeting}: ${p.title}: ${p.detail} (${p.url ?? p.id})`)
          .join("\n")
    );
  return (
    blocks.join("\n\n") +
    '\n\nRead off each meeting\'s "Next steps" list. Not checked against Notion, so an item ' +
    "here may already be done; nothing was dropped for looking finished."
  );
}
