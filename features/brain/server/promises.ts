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
 * Each promise is then looked up on the Notion board (`matchTask`), so "did it happen" has
 * an answer where the board has one, and "nobody is tracking this" is visible where it has
 * none. Measured on 149 promises from two weeks: 18 matched a board task, about 14 of them
 * correctly, and the other 131 were on no board at all. That gap is the finding.
 */

export interface MeetingPromise {
  owners: string[];
  title: string;
  detail: string;
  meeting: string;
  date: string;
  id: string;
  url: string | null;
  /** The board task that looks like this promise, when one does. */
  task?: BoardTask | null;
}

/** A task on the Notion board, as the promise matcher needs it. */
export interface BoardTask {
  title: string;
  url: string | null;
  status: string | null;
  /** `open`, `done` or `idea`, from the Notion ingester. */
  state: string | null;
  due: string | null;
  /** Lower-case first names: the assignee, the people, and the "<Name> - WIP" status. */
  owners: string[];
  /** The day a done task was finished; a task finished before the meeting was not its promise. */
  finished: string | null;
}

const firstName = (name: string) => name.trim().split(/\s+/)[0]!.toLowerCase();

/** A crude stem, the same on both sides, so "updates", "updated" and "update" meet. */
const stem = (w: string) => w.replace(/(ing|ed|es|e|s)$/, "");

/**
 * Words every next step shares, whatever it is about ("review", "send", "the group"), so
 * sharing them proves nothing. Without this, "Review Psychometrics Model" matched "Review
 * Applied Psychometrics Website Changes" on three words, one of them "review".
 */
const GENERIC = new Set(
  (
    "review update check send share create provide finalize make prepare schedule examine " +
    "evaluate discuss follow complete work look final feedback ensure confirm clarify verify " +
    "include based regarding relevant potential specific current next week with that this " +
    "from have will into about their them they what when which would there should could also " +
    "sure more some other than then these those each just like over only very team group " +
    "using notion where were been does after before until still within without across being " +
    "the and for all via any are but can has its not our out own per put was who why how you one " +
    "may now yet let off too add get set use run try fix new"
  )
    .split(" ")
    .map(stem)
);

function words(text: string): Set<string> {
  return new Set(
    (text.toLowerCase().match(/[\p{L}\d]{3,}/gu) ?? []).map(stem).filter((w) => !GENERIC.has(w))
  );
}

/**
 * A matcher over the whole board: given a promise, the task it most looks like, or null.
 *
 * Owner first. A task owned by someone else is never the match, whatever words it shares:
 * "Create Branded Avatars" (Eman) shared three words with a task of Mark's.
 *
 * Then words, weighted by how rare they are on the board, because the common ones match
 * everything: "Discuss Figma Report" covered every promise that mentioned Figma and a
 * report, eleven of them in one month, all wrong. A match needs two shared words, enough
 * rare ones between them (INFO), and most of the task's own title (by weight), since task
 * titles are short and promises are sentences. A task nobody owns needs more of its title.
 * Tuned on a month of real promises (265): 20 matches, about 18 of them right, against 31
 * matches and about 20 right when every word counted the same.
 */
const INFO = 6.5;

export function boardMatcher(tasks: BoardTask[]): (p: MeetingPromise) => BoardTask | null {
  const named = tasks.map((t) => [...words(t.title)]);
  const df = new Map<string, number>();
  for (const ws of named) for (const w of ws) df.set(w, (df.get(w) ?? 0) + 1);
  const idf = (w: string) => Math.log((tasks.length + 1) / ((df.get(w) ?? 0) + 1));
  const weigh = (ws: string[]) => ws.reduce((sum, w) => sum + idf(w), 0);
  return (p) => {
    const promised = words(`${p.title} ${p.detail}`);
    const anyone = p.owners.some((o) => /^the group$/i.test(o.trim()));
    const owners = p.owners.map(firstName);
    let best: { task: BoardTask; score: number } | null = null;
    tasks.forEach((task, i) => {
      const owned = task.owners.length > 0;
      if (owned && !anyone && !owners.some((o) => task.owners.includes(o))) return;
      if (task.state === "done" && (task.finished ?? "") < p.date) return;
      const title = named[i]!;
      const shared = title.filter((w) => promised.has(w));
      if (shared.length < 2 || weigh(shared) < INFO) return;
      const score = weigh(shared) / weigh(title);
      if (score < (owned ? 0.55 : 2 / 3)) return;
      if (!best || score > best.score) best = { task, score };
    });
    return (best as { task: BoardTask } | null)?.task ?? null;
  };
}

interface TaskRow {
  title: string | null;
  url: string | null;
  meta: {
    status?: string | null;
    state?: string | null;
    due?: string | null;
    assignee?: string | null;
    people?: string[] | null;
    completed?: string | null;
    edited?: string | null;
  } | null;
}

export function toBoardTask(r: TaskRow): BoardTask {
  const m = r.meta ?? {};
  const owners = new Set([...(m.people ?? []), m.assignee ?? ""].filter(Boolean).map(firstName));
  const wip = /^(.+?) - WIP$/.exec(m.status ?? "");
  if (wip) owners.add(firstName(wip[1]!));
  return {
    title: (r.title ?? "").replace(/^Notion task(?: \([^)]*\))?:\s*/, ""),
    url: r.url,
    status: m.status ?? null,
    state: m.state ?? null,
    due: m.due ?? null,
    owners: [...owners],
    finished: (m.completed ?? m.edited ?? "").slice(0, 10) || null,
  };
}

/** Every task on the board (both databases named "Board"), first parts only. */
export async function boardTasks(): Promise<
  { ok: true; tasks: BoardTask[] } | { ok: false; status: number }
> {
  const tasks: BoardTask[] = [];
  for (let offset = 0; offset < 20_000; offset += 1000) {
    const res = await supabaseFetch(
      `/rest/v1/brain_chunk?select=title,url,meta&source=eq.notion&meta->>database=eq.Board` +
        `&source_id=not.like.*%23*&order=source_id.asc&limit=1000&offset=${offset}`
    );
    if (!res.ok) return { ok: false, status: res.status };
    const batch = (await res.json().catch(() => null)) as TaskRow[] | null;
    if (!Array.isArray(batch)) return { ok: false, status: res.status };
    tasks.push(...batch.map(toBoardTask));
    if (batch.length < 1000) break;
  }
  return { ok: true, tasks };
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

/** Where the board stands on one promise, for the end of its line. */
function boardNote(p: MeetingPromise, today: string): string {
  if (p.task === undefined) return "";
  if (!p.task) return " → not on the board";
  const t = p.task;
  const overdue = t.state !== "done" && t.due && t.due < today ? ", overdue" : "";
  const status = [t.status, t.due ? `due ${t.due}${overdue}` : null].filter(Boolean).join(", ");
  return ` → board: "${t.title}"${status ? ` (${status})` : ""}${t.url ? ` ${t.url}` : ""}`;
}

/**
 * Promises grouped by owner, one line each. With `person`, only theirs, plus what was
 * given to the whole group, which is theirs too.
 */
export function renderPromises(
  promises: MeetingPromise[],
  person: string | null,
  today: string = new Date().toISOString().slice(0, 10)
): string {
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
          .map(
            (p) =>
              `- ${p.date} ${p.meeting}: ${p.title}: ${p.detail} (${p.url ?? p.id})${boardNote(p, today)}`
          )
          .join("\n")
    );
  // One promise can sit under two owners; count it once.
  const checked = [...new Set([...byOwner.values()].flat())].filter((p) => p.task !== undefined);
  if (checked.length === 0) {
    return (
      blocks.join("\n\n") +
      '\n\nRead off each meeting\'s "Next steps" list. Not checked against Notion, so an item ' +
      "here may already be done; nothing was dropped for looking finished."
    );
  }
  const tracked = checked.filter((p) => p.task);
  const done = tracked.filter((p) => p.task!.state === "done").length;
  return (
    `On the Notion board: ${tracked.length} of ${checked.length} (${done} done, ` +
    `${tracked.length - done} not done). Not on the board: ${checked.length - tracked.length}.\n\n` +
    blocks.join("\n\n") +
    '\n\nRead off each meeting\'s "Next steps" list, then looked up on the Notion board by owner ' +
    "and shared words. A match can be wrong, so open it before trusting it, and an item with no " +
    "match may be tracked under other words. Nothing was dropped for looking finished."
  );
}
