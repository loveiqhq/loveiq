import { supabaseFetch } from "@features/admin/server/supabase";
import logger from "@shared/observability/logger";
import { attachChildren, notionGet, notionPost } from "./ingest/notion";
import { chunkPage } from "./ingest/upsert";
import { NOTICE_SOURCE, recordNotice, type NoticeInput } from "./notice";

/**
 * WHICH NOTION PAGES DOES THE TEAM USE THAT JARVIS CANNOT OPEN?
 *
 * Jarvis reads Notion as the integration "Claude connection", and Notion shows an
 * integration only the pages someone connected to it, plus their children. A page
 * created at the top of a teamspace is invisible until somebody connects it, and
 * nothing said so: on 2026-10-11 the 📊 KPI database, Product Vision & Playbook,
 * Company Priorities, the Test Repository, Glossary and Learnings were all
 * unreadable, some for a week, and a dry run of this check found 11 more pages the
 * team had linked. One connection even SHOWED in Notion's menu while the API still
 * refused the database, so asking Notion's UI is not a check either.
 *
 * Two kinds of evidence that the team uses a page, both already in the corpus:
 *  - LINKS. A Notion URL in WhatsApp, Slack, an email, a Drive doc or a Notion page.
 *    The host is its own token in `brain_chunk.fts`, so finding them is one indexed
 *    read (a body ILIKE timed out in production: brain-chunk-body-ilike-times-out).
 *  - @-MENTIONS. Notion renders a mention of a page the integration cannot open as
 *    the word "Untitled", with no link in the stored text. Those few pages are read
 *    again through the API to get the ids behind the mentions.
 *
 * Every id is then asked of Notion through Jarvis's own token, the same access the
 * brain uses, so a broken connection counts as broken. What cannot be opened becomes
 * a notice in the daily brief, but only when something changed (new or fixed) and
 * on Mondays as a reminder; the reported set rides in the notice's meta.
 */

export const REACH_KIND = "notion-reach";
/** A link nobody has posted in this long stops being reported (dead links age out). */
export const REACH_LOOKBACK_DAYS = 90;
/** Ids asked of Notion per run, newest reference first. ~0.35s each. */
export const MAX_CHECKS = 80;
/** Pages re-read for their @-mentions per run. */
export const MAX_MENTION_PAGES = 20;
const MAX_REF_ROWS = 5000;
const MENTION_BLOCK_PAGES = 10;
const NOTION_HOSTS = "notion.so | www.notion.so | app.notion.com | notion.site";
/** Documents whose links stay current while the document exists (see the window below). */
export const LIVING_SOURCES: ReadonlySet<string> = new Set(["notion", "drive", "doc"]);

const UUID = /([0-9a-f]{8})-?([0-9a-f]{4})-?([0-9a-f]{4})-?([0-9a-f]{4})-?([0-9a-f]{12})/gi;
const NOTION_URL = /https?:\/\/(?:[\w-]+\.)*notion\.(?:so|site|com)\/[^\s<>()[\]"'`|]+/gi;

/** A Notion id in any of its spellings, as the API's dashed lowercase, or null. */
export function toNotionId(raw: string): string | null {
  const all = [...raw.matchAll(UUID)];
  const m = all[all.length - 1];
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}-${m[4]}-${m[5]}`.toLowerCase();
}

export interface NotionLink {
  id: string;
  /** The title the URL itself spells out ("Review-KPI-Sheet-3dde…"), when it has one. */
  hint: string | null;
}

/**
 * Every Notion page or database a piece of text links to.
 *
 * `?p=` is the page open in a side peek and `?v=` is only a VIEW of the database in
 * the path, so p counts and v does not. Pages under `notion.so/notion/` are Notion's
 * own (its terms and privacy policy, linked from every Notion email), never ours.
 */
export function notionLinksIn(text: string): NotionLink[] {
  const out = new Map<string, NotionLink>();
  for (const match of text.matchAll(NOTION_URL)) {
    let url: URL;
    try {
      url = new URL(match[0].replace(/[.,;:!?*_>…]+$/, ""));
    } catch {
      continue;
    }
    // api.notion.com/v1/blocks/<id> in code and docs is not a page anybody opens.
    if (/^(api|developers)\./i.test(url.hostname)) continue;
    const segments = url.pathname.split("/").filter(Boolean);
    if (segments[0]?.toLowerCase() === "notion") continue;
    const last = decodeURIComponent(segments[segments.length - 1] ?? "");
    const pathId = toNotionId(last);
    const words = last.replace(UUID, "").replace(/[-_]+/g, " ").trim();
    const hint = pathId && words && !/^[0-9a-f\s]+$/i.test(words) ? words : null;
    const peek = url.searchParams.get("p");
    const peekId = peek ? toNotionId(peek) : null;
    if (peekId && !out.has(peekId)) out.set(peekId, { id: peekId, hint: null });
    if (pathId && !out.has(pathId)) out.set(pathId, { id: pathId, hint });
  }
  return [...out.values()];
}

type Block = Record<string, unknown> & { type?: string; children?: Block[] };
type RichItem = {
  type?: string;
  mention?: { type?: string; page?: { id?: string }; database?: { id?: string } };
  text?: { link?: { url?: string } | null };
  href?: string | null;
};

/** Ids of every page or database a block tree @-mentions, links or embeds as a link. */
export function notionIdsInBlocks(blocks: Block[]): string[] {
  const ids = new Set<string>();
  const fromRich = (items: unknown) => {
    if (!Array.isArray(items)) return;
    for (const item of items as RichItem[]) {
      const m = item?.mention;
      const mentioned =
        m?.type === "page" ? m.page?.id : m?.type === "database" ? m.database?.id : null;
      const id = mentioned ? toNotionId(mentioned) : null;
      if (id) ids.add(id);
      const url = item?.text?.link?.url;
      if (url) for (const link of notionLinksIn(url)) ids.add(link.id);
    }
  };
  const walk = (list: Block[]) => {
    for (const b of list) {
      const inner = (b.type ? b[b.type] : null) as Record<string, unknown> | null;
      if (inner && typeof inner === "object") {
        fromRich(inner.rich_text);
        fromRich(inner.caption);
        if (Array.isArray(inner.cells)) for (const cell of inner.cells) fromRich(cell);
        if (b.type === "link_to_page") {
          const target = toNotionId(String(inner.page_id ?? inner.database_id ?? ""));
          if (target) ids.add(target);
        }
      }
      if (Array.isArray(b.children)) walk(b.children);
    }
  };
  walk(blocks);
  return [...ids];
}

export type Reach = "visible" | "missing" | "unknown";

export interface Ref {
  /** Where it was linked, in the corpus's own words: "WhatsApp: LoveIQ — 2026-10-05 09:33". */
  where: string;
  /** The day that record describes, YYYY-MM-DD, or null when it has none. */
  day: string | null;
}

export interface Gap {
  id: string;
  hint: string | null;
  refs: Ref[];
}

/**
 * What changed since the last report.
 *
 * - `listed`: missing AND still linked somewhere in the window. A page nobody has
 *   linked for REACH_LOOKBACK_DAYS ages out silently; that is how a link to a deleted
 *   page stops being reported.
 * - `fixed`: reported last time and found readable THIS run. A page that was simply
 *   not checked (out of time, Notion briefly unavailable) is neither fixed nor new.
 * - `carried`: reported last time, still linked, but not answered this run. It stays
 *   in the reported set so the next run does not announce it as new again.
 */
export function diffReach(
  previous: ReadonlySet<string>,
  reach: ReadonlyMap<string, Reach>,
  referenced: ReadonlySet<string>
): { listed: string[]; fresh: string[]; still: string[]; fixed: string[]; carried: string[] } {
  const listed = [...reach]
    .filter(([id, r]) => r === "missing" && referenced.has(id))
    .map(([id]) => id);
  return {
    listed,
    fresh: listed.filter((id) => !previous.has(id)),
    still: listed.filter((id) => previous.has(id)),
    fixed: [...previous].filter((id) => reach.get(id) === "visible"),
    carried: [...previous].filter(
      (id) => referenced.has(id) && (reach.get(id) ?? "unknown") === "unknown"
    ),
  };
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

function openUrl(id: string): string {
  return `https://www.notion.so/${id.replace(/-/g, "")}`;
}

function gapLine(gap: Gap): string {
  const refs = [...gap.refs].sort((a, b) => (b.day ?? "").localeCompare(a.day ?? ""));
  const first = refs[0];
  const where = first ? `linked in ${first.where}` : "reported before";
  const more = refs.length > 1 ? ` and ${plural(refs.length - 1, "other place")}` : "";
  return gap.hint
    ? `• "${gap.hint}", ${where}${more}: ${openUrl(gap.id)}`
    : `• A page ${where}${more} (the link carries no title): ${openUrl(gap.id)}`;
}

/**
 * The notice, in plain words: what Jarvis cannot open, what is new, what got fixed,
 * and how to fix the rest. Built separately so it can be tested without a network.
 */
export function buildReachNotice(input: {
  gaps: ReadonlyMap<string, Gap>;
  fresh: string[];
  still: string[];
  fixed: string[];
  carried?: string[];
  linked: number;
  checked: number;
  day: string;
}): NoticeInput {
  const { gaps, fresh, still, fixed } = input;
  const open = fresh.length + still.length;
  const line = (id: string) => gapLine(gaps.get(id) ?? { id, hint: null, refs: [] });
  const sections: string[] = [];
  if (fresh.length) sections.push(["New since the last check:", ...fresh.map(line)].join("\n"));
  if (still.length) sections.push(["Still not shared:", ...still.map(line)].join("\n"));
  if (fixed.length) {
    const name = (id: string) => (gaps.get(id)?.hint ? `"${gaps.get(id)?.hint}"` : "A page");
    sections.push(
      ["Jarvis can open these now:", ...fixed.map((id) => `• ${name(id)} ${openUrl(id)}`)].join(
        "\n"
      )
    );
  }
  if (open) {
    sections.push(
      'To fix one: open it in Notion, click ⋯ (top right), then Connections, and add "Claude connection". ' +
        "If Claude connection is already listed, disconnect it and add it again: a connection can show there " +
        "without working. Or ask Claude to connect it for you. A link to a deleted page or to another " +
        `workspace shows up here too, and drops off once nobody has linked it for ${REACH_LOOKBACK_DAYS} days.`
    );
  }
  const headline = open
    ? `Jarvis cannot open ${plural(open, "Notion page")} the team links to` +
      (fresh.length && still.length ? ` (${fresh.length} new)` : "")
    : `Jarvis can now open ${plural(fixed.length, "Notion page")} it could not before`;
  return {
    headline,
    detail: sections.join("\n\n"),
    kind: REACH_KIND,
    evidence:
      `${plural(input.linked, "Notion page")} linked by the team; the ${input.checked} Jarvis does not ` +
      `already hold were asked of Notion through Jarvis's own access on ${input.day}.`,
    meta: { reach_open: [...new Set([...fresh, ...still, ...(input.carried ?? [])])].sort() },
  };
}

// ---- reading the corpus ------------------------------------------------------

interface CorpusRow {
  source: string;
  source_id: string;
  title: string | null;
  body: string | null;
  period_end: string | null;
  meta?: { state?: unknown } | null;
}

/** A finished task is history: its links age out like a message's. */
export function isLiving(row: { source: string; meta?: { state?: unknown } | null }): boolean {
  return LIVING_SOURCES.has(row.source) && row.meta?.state !== "done";
}

async function pagedRows(path: string, cap: number): Promise<CorpusRow[]> {
  const out: CorpusRow[] = [];
  for (let offset = 0; offset < cap; offset += 1000) {
    const res = await supabaseFetch(`${path}&limit=1000&offset=${offset}`);
    const batch = await chunkPage<CorpusRow>(REACH_KIND, res);
    out.push(...batch);
    if (batch.length < 1000) break;
  }
  return out;
}

/** "Notion: Onboarding — Ajna (part 8 of 10)" -> "Notion: Onboarding — Ajna". */
function whereOf(row: CorpusRow): string {
  const title = (row.title ?? row.source).replace(/\s*\(part \d+ of \d+\)$/, "").trim();
  return title || row.source;
}

/** "page:3f2e…#3" -> "3f2e…" (the chunk ids the Notion ingester writes). */
function pageIdOf(sourceId: string): string | null {
  const m = /^(?:page|task):([^#]+)/.exec(sourceId);
  return m?.[1] ? toNotionId(m[1]) : null;
}

export interface ReachResult {
  linked: number;
  checked: number;
  missing: number;
  fresh: number;
  fixed: number;
  unknown: number;
  visibleNotIndexed: number;
  mentionPages: number;
  noticed: boolean;
  /** A notice was due and could not be written: the run must not read as healthy. */
  noticeFailed: boolean;
  /** One line for cron_run and for list_sources. */
  summary: string;
  /** The notice this run wrote, or in a dry run would have written. */
  notice: NoticeInput | null;
}

/**
 * The daily check. Throws when the corpus or the previous report cannot be read, so
 * a broken read is a failed run rather than a report that "everything is fine".
 */
export async function checkNotionReach(
  now: Date,
  isOutOfTime: () => boolean = () => false,
  options: { dryRun?: boolean } = {}
): Promise<ReachResult> {
  const token = process.env.NOTION_TOKEN;
  if (!token) throw new Error("NOTION_TOKEN is unset");
  const day = now.toISOString().slice(0, 10);
  const since = new Date(now.getTime() - REACH_LOOKBACK_DAYS * 86_400_000)
    .toISOString()
    .slice(0, 10);

  // ---- who links to what --------------------------------------------------
  const gaps = new Map<string, Gap>();
  const note = (id: string, hint: string | null, ref: Ref) => {
    const g = gaps.get(id) ?? { id, hint: null, refs: [] };
    if (!g.hint && hint) g.hint = hint;
    if (!g.refs.some((r) => r.where === ref.where)) g.refs.push(ref);
    gaps.set(id, g);
  };

  /**
   * The window applies to MESSAGES only. A link in a WhatsApp or Slack day, an email or
   * a meeting is evidence of use on that day; a link inside a Notion page or a Drive doc
   * is current for as long as that document exists, however old its date. Filtering
   * documents by date hid three Marketing Channels playbooks in the first real run.
   */
  const linkRows = (
    await pagedRows(
      `/rest/v1/brain_chunk?select=source,source_id,title,body,period_end,meta` +
        `&fts=fts(simple).${encodeURIComponent(NOTION_HOSTS)}` +
        `&source=neq.${NOTICE_SOURCE}&order=period_end.desc.nullslast`,
      MAX_REF_ROWS
    )
  ).filter((row) => isLiving(row) || (row.period_end ?? "") >= since);
  for (const row of linkRows) {
    const self = pageIdOf(row.source_id);
    for (const link of notionLinksIn(row.body ?? "")) {
      if (link.id === self) continue;
      note(link.id, link.hint, { where: whereOf(row), day: row.period_end });
    }
  }

  // ---- @-mentions the stored text can only show as "Untitled" -----------------
  const untitled = (
    await pagedRows(
      `/rest/v1/brain_chunk?select=source,source_id,title,body,period_end` +
        `&source=eq.notion&fts=fts(english).untitled&order=period_end.desc.nullslast`,
      1000
    )
  ).filter((r) => /\bUntitled\b/.test(r.body ?? ""));
  const mentionPages = new Map<string, CorpusRow>();
  for (const row of untitled) {
    const id = pageIdOf(row.source_id);
    if (id && !mentionPages.has(id)) mentionPages.set(id, row);
  }
  let mentionRead = 0;
  for (const [pageId, row] of mentionPages) {
    if (mentionRead >= MAX_MENTION_PAGES || isOutOfTime()) break;
    mentionRead += 1;
    try {
      const blocks: Block[] = [];
      let cursor: string | undefined;
      for (let i = 0; i < MENTION_BLOCK_PAGES; i++) {
        const json = await notionGet(
          token,
          `/blocks/${pageId}/children?page_size=100${cursor ? `&start_cursor=${encodeURIComponent(cursor)}` : ""}`
        );
        blocks.push(...((json.results as Block[]) ?? []));
        cursor = json.has_more ? String(json.next_cursor) : undefined;
        if (!cursor) break;
      }
      await attachChildren(token, blocks, 0, { left: 40 }, isOutOfTime);
      for (const id of notionIdsInBlocks(blocks)) {
        if (id !== pageId) note(id, null, { where: whereOf(row), day: row.period_end });
      }
    } catch (err) {
      // One unreadable page costs its mentions this run, never the whole check.
      logger.warn({ err, pageId }, "brain notion-reach: could not re-read a page's mentions");
    }
  }

  // ---- what Jarvis already holds needs no question ----------------------------
  const indexed = new Set<string>();
  for (const row of await pagedRows(
    `/rest/v1/brain_chunk?select=source,source_id,title,period_end&source=eq.notion&order=source_id.asc`,
    20_000
  )) {
    const id = pageIdOf(row.source_id);
    if (id) indexed.add(id);
  }
  // Databases are not chunks (their rows are), so ask which ones are shared. A failed
  // listing only costs requests: every database link is then checked one by one.
  const databases = new Set<string>();
  try {
    let cursor: string | undefined;
    for (let i = 0; i < 5; i++) {
      const json = await notionPost(token, "/search", {
        filter: { property: "object", value: "database" },
        page_size: 100,
        ...(cursor ? { start_cursor: cursor } : {}),
      });
      for (const db of (json.results as Array<{ id?: string }>) ?? []) {
        const id = db.id ? toNotionId(db.id) : null;
        if (id) databases.add(id);
      }
      cursor = json.has_more ? String(json.next_cursor) : undefined;
      if (!cursor) break;
    }
  } catch (err) {
    logger.warn({ err }, "brain notion-reach: database listing failed; checking links one by one");
  }
  const held = (id: string) => indexed.has(id) || databases.has(id);

  // ---- what was reported last time ---------------------------------------------
  const previousRows = await chunkPage<{ meta?: { reach_open?: unknown } | null }>(
    REACH_KIND,
    await supabaseFetch(
      `/rest/v1/brain_chunk?select=meta&source=eq.${NOTICE_SOURCE}` +
        `&meta->>noticed_by=eq.${REACH_KIND}&order=updated_at.desc&limit=1`
    )
  );
  const reported = previousRows[0]?.meta?.reach_open;
  const previous = new Set(
    Array.isArray(reported) ? reported.filter((x): x is string => typeof x === "string") : []
  );

  // ---- ask Notion about the rest, freshest link first ---------------------------
  const referenced = new Set([...gaps.keys()]);
  const lastDay = (g: Gap) => g.refs.reduce((m, r) => ((r.day ?? "") > m ? (r.day ?? "") : m), "");
  const reach = new Map<string, Reach>();
  for (const id of previous) if (held(id)) reach.set(id, "visible");
  const toCheck = [
    ...[...gaps.values()]
      .filter((g) => !held(g.id))
      .sort((a, b) => lastDay(b).localeCompare(lastDay(a)))
      .map((g) => g.id),
    // Reported last time and nobody links it now: still asked, so a fix is noticed.
    ...[...previous].filter((id) => !held(id) && !referenced.has(id)),
  ];
  let checked = 0;
  for (const id of toCheck) {
    if (checked >= MAX_CHECKS || isOutOfTime()) break;
    checked += 1;
    try {
      await notionGet(token, `/blocks/${id}`);
      reach.set(id, "visible");
    } catch (err) {
      const status = Number(/failed \((\d{3})\)/.exec(String(err))?.[1] ?? 0);
      // 404 object_not_found: not shared, deleted, or another workspace. 403: shared
      // without the capability. 400: not a Notion id at all. Anything else (429, 5xx,
      // a timeout) proves nothing either way.
      if (status === 404 || status === 403) reach.set(id, "missing");
      else if (status === 400) referenced.delete(id);
      else reach.set(id, "unknown");
    }
  }

  const { listed, fresh, still, fixed, carried } = diffReach(previous, reach, referenced);
  const unknown = [...reach.values()].filter((r) => r === "unknown").length;
  const visibleNotIndexed = [...reach].filter(([id, r]) => r === "visible" && !held(id)).length;
  const linked = [...referenced].length;

  const due = fresh.length > 0 || fixed.length > 0 || (now.getUTCDay() === 1 && listed.length > 0);
  const notice = due
    ? buildReachNotice({ gaps, fresh, still, fixed, carried, linked, checked, day })
    : null;
  // A dry run writes nothing, so "would have written" is not a failure either.
  const noticed = notice && !options.dryRun ? await recordNotice(notice) : false;

  const names = listed
    .slice(0, 3)
    .map((id) => gaps.get(id)?.hint ?? "untitled")
    .join(", ");
  const summary = listed.length
    ? `${plural(listed.length, "linked Notion page")} Jarvis cannot open (${names}${listed.length > 3 ? ", …" : ""})`
    : unknown
      ? `no linked Notion page found unreadable, ${unknown} could not be checked`
      : `every linked Notion page it checked is readable`;
  return {
    linked,
    checked,
    missing: listed.length,
    fresh: fresh.length,
    fixed: fixed.length,
    unknown,
    visibleNotIndexed,
    mentionPages: mentionRead,
    noticed,
    noticeFailed: due && !options.dryRun && !noticed,
    summary,
    notice,
  };
}
