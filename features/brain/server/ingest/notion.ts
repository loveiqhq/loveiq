import { fetchWithTimeout } from "@shared/http/fetch-with-timeout";
import logger from "@shared/observability/logger";
import { sweepStale, upsertChunks, type BrainRow, type IngestResult } from "./upsert";

/**
 * Notion into the company-brain corpus: the task board, and the written pages.
 *
 * WHY NOTION AND NOT JIRA. Decided 2026-08-28: the team runs its board in Notion,
 * so Jira was dropped rather than connected. The `👷🏻‍♂️ Board` database is the
 * direct equivalent — Status, Priority, Impact, assignee, due and completed dates
 * — and it is live: 171 tasks as of that date, oldest 2026-07-09, newest today.
 *
 * WHICH WORKSPACE. This must only ever read LoveIQ's. The Notion account first
 * connected here was `eman.cickusic@aqvc.com`, whose teamspaces were AQVC Labs,
 * Navigate Ventures and 🏛️ Asset Management — another company's finance and
 * ventures material, and no LoveIQ content at all. Indexing that would have put
 * it into a corpus the whole LoveIQ team can search. The token this ingester uses
 * must belong to the LoveIQ workspace, and `NOTION_TEAMSPACE_ID` narrows it
 * further to one teamspace.
 *
 * A CAVEAT THAT HAS NO CODE FIX. Notion enforces per-page permissions; the brain
 * does not. A page only some people can open in Notion becomes readable by anyone
 * who can ask the brain. That is a decision about what to share, not a bug to
 * fix, so `NOTION_EXCLUDE_TITLES` exists to keep named pages out.
 */

const SOURCE = "notion";
const API = "https://api.notion.com/v1";
/** Pinned. Notion breaks response shapes between versions, not within one. */
const NOTION_VERSION = "2022-06-28";
const PAGE_SIZE = 100;
const TIMEOUT_MS = 15_000;

/** 171 tasks is 2 pages; the ceiling stops a bad filter walking forever. */
const MAX_PAGES = 25;

/** Blocks are fetched per page, so this bounds the request count, not the rows. */
const MAX_CONTENT_PAGES = 300;

interface RichText {
  plain_text?: string;
}

interface NotionBlock {
  type?: string;
  has_children?: boolean;
  id?: string;
  [key: string]: unknown;
}

interface NotionPage {
  id?: string;
  url?: string;
  created_time?: string;
  last_edited_time?: string;
  archived?: boolean;
  in_trash?: boolean;
  parent?: { type?: string; database_id?: string };
  properties?: Record<string, unknown>;
}

function headers(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    "Notion-Version": NOTION_VERSION,
    "Content-Type": "application/json",
  };
}

/** Join a rich_text array into plain text. */
function plain(value: unknown): string {
  if (!Array.isArray(value)) return "";
  return value
    .map((r) => (typeof (r as RichText)?.plain_text === "string" ? (r as RichText).plain_text : ""))
    .join("");
}

/**
 * Read one Notion property down to a string.
 *
 * Notion returns a differently-shaped object per property type, so this is a
 * deliberate switch rather than anything clever. Anything unrecognised yields ""
 * so a new property type added in the UI cannot break an ingest.
 */
export function propertyToText(prop: unknown): string {
  if (!prop || typeof prop !== "object") return "";
  const p = prop as Record<string, unknown>;
  switch (p.type) {
    case "title":
    case "rich_text":
      return plain(p[p.type as string]);
    case "select":
      return (p.select as { name?: string } | null)?.name ?? "";
    case "multi_select":
      return Array.isArray(p.multi_select)
        ? (p.multi_select as Array<{ name?: string }>).map((o) => o.name ?? "").join(", ")
        : "";
    case "status":
      return (p.status as { name?: string } | null)?.name ?? "";
    case "people":
      return Array.isArray(p.people)
        ? (p.people as Array<{ name?: string }>)
            .map((u) => u.name ?? "")
            .filter(Boolean)
            .join(", ")
        : "";
    case "date": {
      const d = p.date as { start?: string; end?: string } | null;
      if (!d?.start) return "";
      return d.end ? `${d.start} to ${d.end}` : d.start;
    }
    case "checkbox":
      return p.checkbox ? "yes" : "no";
    case "number":
      return p.number == null ? "" : String(p.number);
    case "url":
    case "email":
    case "phone_number":
      return typeof p[p.type as string] === "string" ? String(p[p.type as string]) : "";
    case "created_time":
    case "last_edited_time":
      return typeof p[p.type as string] === "string" ? String(p[p.type as string]) : "";
    case "formula": {
      const f = p.formula as Record<string, unknown> | null;
      if (!f) return "";
      const v = f[String(f.type)];
      return v == null ? "" : String(v);
    }
    default:
      return "";
  }
}

/** The title property, whatever it happens to be called in this database. */
function titleOf(page: NotionPage): string {
  for (const value of Object.values(page.properties ?? {})) {
    const p = value as Record<string, unknown>;
    if (p?.type === "title") return plain(p.title);
  }
  return "";
}

/** Flatten a block tree to text, one line per block. */
export function blocksToText(blocks: NotionBlock[], depth = 0): string {
  if (depth > 6) return "";
  const lines: string[] = [];
  for (const b of blocks) {
    const type = typeof b.type === "string" ? b.type : "";
    const inner = b[type];
    if (inner && typeof inner === "object") {
      const text = plain((inner as Record<string, unknown>).rich_text);
      if (text.trim()) {
        // Checkboxes carry meaning a bare line would lose: an unticked to-do is
        // outstanding work, and the brain gets asked what is outstanding.
        const done = (inner as { checked?: boolean }).checked;
        const prefix = type === "to_do" ? (done ? "[x] " : "[ ] ") : "";
        lines.push(prefix + text);
      }
    }
    if (Array.isArray((b as { children?: NotionBlock[] }).children)) {
      const child = blocksToText((b as { children: NotionBlock[] }).children, depth + 1);
      if (child) lines.push(child);
    }
  }
  return lines.join("\n");
}

async function notionPost(
  token: string,
  path: string,
  body: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const res = await fetchWithTimeout(`${API}${path}`, {
    method: "POST",
    headers: headers(token),
    body: JSON.stringify(body),
    timeoutMs: TIMEOUT_MS,
  });
  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).slice(0, 300);
    throw new Error(`Notion ${path} failed (${res.status}): ${detail}`);
  }
  return (await res.json()) as Record<string, unknown>;
}

async function notionGet(token: string, path: string): Promise<Record<string, unknown>> {
  const res = await fetchWithTimeout(`${API}${path}`, {
    headers: headers(token),
    timeoutMs: TIMEOUT_MS,
  });
  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).slice(0, 300);
    throw new Error(`Notion ${path} failed (${res.status}): ${detail}`);
  }
  return (await res.json()) as Record<string, unknown>;
}

/** Every block of one page, flattened. Children are followed one level. */
async function pageText(token: string, pageId: string): Promise<string> {
  const out: NotionBlock[] = [];
  let cursor: string | undefined;
  for (let i = 0; i < 5; i++) {
    const qs = cursor
      ? `?start_cursor=${encodeURIComponent(cursor)}&page_size=100`
      : "?page_size=100";
    const json = await notionGet(token, `/blocks/${pageId}/children${qs}`);
    out.push(...((json.results as NotionBlock[]) ?? []));
    cursor = json.has_more ? (json.next_cursor as string) : undefined;
    if (!cursor) break;
  }
  return blocksToText(out);
}

/**
 * One row of the task board as a chunk.
 *
 * Status, priority and assignee go in the BODY, not only in meta, so "what is
 * still open about pricing" is answerable from text retrieval without a
 * structured query — the same reason the Jira ingester did it that way.
 */
export function taskToRow(page: NotionPage, stampedAt: string): BrainRow | null {
  const title = titleOf(page).trim();
  if (!page.id || !title) return null;

  const props = page.properties ?? {};
  const get = (name: string) => propertyToText(props[name]).trim();

  const status = get("Status");
  const priority = get("Priority");
  const impact = get("Impact");
  const assignee = get("Assign") || get("Assignee");
  const due = get("Due Date");
  const completed = get("Date Completed");

  const header = [
    status ? `Status: ${status}` : null,
    priority ? `Priority: ${priority}` : null,
    impact ? `Impact: ${impact}` : null,
    assignee ? `Assigned to: ${assignee}` : null,
    due ? `Due: ${due}` : null,
    completed ? `Completed: ${completed}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const edited = page.last_edited_time ?? page.created_time ?? null;

  return {
    source: SOURCE,
    source_id: `task:${page.id}`,
    title: `Board task: ${title}`,
    url: page.url ?? null,
    body: [title, header].filter(Boolean).join("\n\n"),
    meta: {
      kind: "task",
      status: status || null,
      priority: priority || null,
      impact: impact || null,
      assignee: assignee || null,
      due: due || null,
      completed: completed || null,
      created: page.created_time ?? null,
      edited,
    },
    updated_at: stampedAt,
    // The date this task last MOVED, so a stale backlog item does not outrank a
    // task touched today on a scoring tie.
    period_end: typeof edited === "string" ? edited.slice(0, 10) : null,
  };
}

/** A written page as a chunk. */
export function pageToRow(page: NotionPage, text: string, stampedAt: string): BrainRow | null {
  const title = titleOf(page).trim();
  if (!page.id || !title) return null;
  const edited = page.last_edited_time ?? page.created_time ?? null;

  return {
    source: SOURCE,
    source_id: `page:${page.id}`,
    title: `Notion: ${title}`,
    url: page.url ?? null,
    body: [title, text].filter(Boolean).join("\n\n"),
    meta: { kind: "page", created: page.created_time ?? null, edited },
    updated_at: stampedAt,
    period_end: typeof edited === "string" ? edited.slice(0, 10) : null,
  };
}

/** Titles the team has chosen to keep out, lowercased, from NOTION_EXCLUDE_TITLES. */
function excludedTitles(): string[] {
  return (process.env.NOTION_EXCLUDE_TITLES ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function isExcluded(title: string, excluded: string[]): boolean {
  const t = title.toLowerCase();
  return excluded.some((e) => t.includes(e));
}

export function isNotionConfigured(): boolean {
  return Boolean(process.env.NOTION_TOKEN);
}

export async function ingestNotion(
  stampedAt: string,
  isOutOfTime: () => boolean = () => false
): Promise<IngestResult> {
  const token = process.env.NOTION_TOKEN;
  if (!token) return { source: SOURCE, rows: 0, swept: 0, skipped: "notion-not-configured" };
  if (isOutOfTime()) return { source: SOURCE, rows: 0, swept: 0, skipped: "notion-time-budget" };

  const boardId = process.env.NOTION_BOARD_DATABASE_ID;
  const excluded = excludedTitles();

  const rows: BrainRow[] = [];
  let complete = true;

  // ---- the task board ----------------------------------------------------
  if (boardId) {
    let cursor: string | undefined;
    for (let page = 0; page < MAX_PAGES; page++) {
      if (isOutOfTime()) {
        complete = false;
        break;
      }
      const json = await notionPost(token, `/databases/${boardId}/query`, {
        page_size: PAGE_SIZE,
        ...(cursor ? { start_cursor: cursor } : {}),
      });
      for (const raw of (json.results as NotionPage[]) ?? []) {
        if (raw.archived || raw.in_trash) continue;
        const row = taskToRow(raw, stampedAt);
        if (row && !isExcluded(row.title, excluded)) rows.push(row);
      }
      cursor = json.has_more ? (json.next_cursor as string) : undefined;
      if (!cursor) break;
      if (page === MAX_PAGES - 1) {
        complete = false;
        logger.warn({ got: rows.length }, "brain-ingest notion: board hit the page ceiling");
      }
    }
  } else {
    logger.info("brain-ingest notion: NOTION_BOARD_DATABASE_ID unset, skipping the board");
  }

  // ---- written pages -----------------------------------------------------
  //
  // `/search` returns pages the integration has been shared with, newest edit
  // first. Rows that belong to the board are skipped here: they are already
  // covered above with their status and priority, and re-indexing them as bare
  // pages would put the same task in the corpus twice under two ids.
  const seenPages: NotionPage[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    if (isOutOfTime()) {
      complete = false;
      break;
    }
    const json = await notionPost(token, "/search", {
      filter: { property: "object", value: "page" },
      sort: { direction: "descending", timestamp: "last_edited_time" },
      page_size: PAGE_SIZE,
      ...(cursor ? { start_cursor: cursor } : {}),
    });
    for (const raw of (json.results as NotionPage[]) ?? []) {
      if (raw.archived || raw.in_trash) continue;
      if (raw.parent?.type === "database_id") continue;
      seenPages.push(raw);
    }
    cursor = json.has_more ? (json.next_cursor as string) : undefined;
    if (!cursor) break;
  }

  // Content is one request per page, so this is where the time actually goes.
  let fetched = 0;
  for (const raw of seenPages) {
    if (fetched >= MAX_CONTENT_PAGES || isOutOfTime()) {
      if (fetched < seenPages.length) complete = false;
      break;
    }
    const title = titleOf(raw).trim();
    if (!title || isExcluded(`Notion: ${title}`, excluded)) continue;
    let text = "";
    try {
      text = raw.id ? await pageText(token, raw.id) : "";
    } catch (err) {
      // A single unreadable page must not lose the rest of the run.
      logger.warn({ err, page: raw.id }, "brain-ingest notion: page content unreadable");
      complete = false;
    }
    fetched += 1;
    const row = pageToRow(raw, text, stampedAt);
    if (row) rows.push(row);
  }

  const written = await upsertChunks(rows);

  // Only sweep a run that walked everything. A partial run would delete every
  // task and page it never reached — and `sweepStale` additionally refuses when
  // this run wrote far less than the source already holds.
  const swept = complete ? await sweepStale(SOURCE, stampedAt, written) : 0;

  if (!complete && written === 0) {
    return { source: SOURCE, rows: 0, swept: 0, skipped: "notion-time-budget" };
  }
  return { source: SOURCE, rows: written, swept };
}

/** Teamspace narrowing is advisory only — Notion's search API has no teamspace
 *  filter, so the real boundary is which pages the integration is shared with.
 *  Exported so the cron can log what it believes the scope to be. */
export function notionScope(): string {
  const ts = process.env.NOTION_TEAMSPACE_ID;
  return ts ? `teamspace ${ts}` : "every page shared with the integration";
}
