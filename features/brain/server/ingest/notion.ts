import { fetchWithTimeout } from "@shared/http/fetch-with-timeout";
import logger from "@shared/observability/logger";
import { supabaseFetch } from "@features/admin/server/supabase";
import { sweepStale, touchChunks, upsertChunks, type BrainRow, type IngestResult } from "./upsert";

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
 * A CAVEAT WITH NO CODE FIX, AND A SETTLED ANSWER. Notion enforces per-page
 * permissions; the brain does not, so a page only some people can open in Notion
 * becomes readable by anyone who can ask the brain — and this workspace holds
 * "Performance management", onboarding pages and job posts naming real people.
 * Raised 2026-08-28; the answer was to index everything, as company-wide policy.
 * See "Who can see what" in CLAUDE.md. `NOTION_EXCLUDE_TITLES` therefore ships
 * empty and exists only if that policy changes.
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

/**
 * BUMP THIS whenever the SHAPE of a row changes — title format, which properties
 * go in the body, what lands in meta.
 *
 * Incremental ingest skips any page whose `last_edited_time` matches what is
 * already indexed, which is what keeps 1,000+ pages inside a 45-second cron. The
 * consequence is that a code change to row CONSTRUCTION is invisible to it: the
 * pages did not change, so they are touched and never rebuilt, and the old shape
 * survives forever. That is not hypothetical — v2 shipped with every database
 * title reading "Untitled database" (a database's name is a top-level `title`,
 * not a property) and those rows would never have self-corrected.
 *
 * A version stamped in meta makes a mismatch count as "changed", so shipping a
 * builder change is enough to re-write the corpus over the following nights.
 */
export const BUILDER_VERSION = 5;

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
export function taskToRow(
  page: NotionPage,
  stampedAt: string,
  dbTitle?: string,
  text?: string
): BrainRow | null {
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

  // Every property, not just the six the board happens to use. A row in
  // "Literature" or "Competitor Tracker" carries its meaning in fields this
  // function had never heard of, and dropping them left 859 rows worth of
  // company knowledge as bare titles.
  const named = new Set([
    "Status", "Priority", "Impact", "Assign", "Assignee", "Due Date", "Date Completed",
  ]);
  const extras = Object.entries(props)
    .filter(([name]) => !named.has(name))
    .map(([name, prop]) => {
      const value = propertyToText(prop).trim();
      // Skip the title property: it is already the chunk title.
      const isTitle = (prop as { type?: string } | null)?.type === "title";
      // Notion allows a property with a BLANK name, which rendered as ": 38" in
      // the Research Papers rows — a value with nothing saying what it measures
      // is worse than no value, because a model will read it as meaningful.
      if (!value || isTitle || !name.trim()) return null;
      return `${name.trim()}: ${value}`;
    })
    .filter(Boolean)
    .join(" · ");

  const label = dbTitle?.trim() || "Board";

  return {
    source: SOURCE,
    source_id: `task:${page.id}`,
    title: `${label}: ${title}`,
    url: page.url ?? null,
    body: [title, header, extras, text?.trim() || null].filter(Boolean).join("\n\n"),
    meta: {
      kind: "task",
      v: BUILDER_VERSION,
      database: label,
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
    meta: { kind: "page", v: BUILDER_VERSION, created: page.created_time ?? null, edited },
    updated_at: stampedAt,
    period_end: typeof edited === "string" ? edited.slice(0, 10) : null,
  };
}

/**
 * Titles always kept out, regardless of policy, because their whole content is a
 * secret rather than a document.
 *
 * `upsert.ts` refuses any chunk matching a known credential PREFIX, which covers
 * most cases automatically. It cannot catch a page whose entire body is one bare
 * opaque string — indistinguishable from a hash or an id by shape alone — which is
 * exactly what "Github token:" in this workspace contains (verified 2026-08-28:
 * one block, one 30+ character string, nothing else).
 *
 * This is not an exception to the open-access policy. That policy is about people
 * reading information; a key pasted into every LLM prompt that retrieves it is a
 * different thing.
 */
const ALWAYS_EXCLUDED = ["github token"];

/** Titles the team has chosen to keep out, lowercased, from NOTION_EXCLUDE_TITLES. */
function excludedTitles(): string[] {
  return [
    ...ALWAYS_EXCLUDED,
    ...(process.env.NOTION_EXCLUDE_TITLES ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  ];
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

  const excluded = excludedTitles();
  const rows: BrainRow[] = [];
  let complete = true;

  // ---- what exists, so unchanged pages need no content fetch ---------------
  const known = await knownNotionEdits();

  // ---- every database, not one ---------------------------------------------
  //
  // This used to read a single database named by NOTION_BOARD_DATABASE_ID and
  // index everything else as a bare page — except the page loop skips anything
  // whose parent is a database, so rows of every OTHER database fell through
  // both loops and were never indexed at all. Measured 2026-08-28: 1,027 of the
  // 1,093 reachable pages are database rows across 35 databases, and 168 were
  // indexed. Literature (80), Research Papers (41+34), Competitor Tracker (28),
  // the article release plans and Beta Testers were entirely absent — and there
  // are TWO databases both called "Board", so even the board was half covered.
  //
  // The env var is gone rather than fixed: a config value that silently decides
  // which 15% of the workspace is visible is the wrong shape. If a database is
  // shared with the integration, it is in.
  const dbResult = await allDatabases(token, isOutOfTime);
  const databases = dbResult.items;
  let crawlTruncated = !dbResult.complete;
  const candidates: Array<{ raw: NotionPage; dbTitle: string | null }> = [];

  for (const [dbId, dbTitle] of databases) {
    if (isOutOfTime()) {
      crawlTruncated = true;
      break;
    }
    const rowResult = await databaseRows(token, dbId, isOutOfTime);
    if (!rowResult.complete) crawlTruncated = true;
    for (const raw of rowResult.items) candidates.push({ raw, dbTitle });
  }

  // ---- standalone pages (not rows of any database) --------------------------
  const pageResult = await standalonePages(token, isOutOfTime);
  if (!pageResult.complete) crawlTruncated = true;
  for (const raw of pageResult.items) candidates.push({ raw, dbTitle: null });

  // ---- classify first, then do the cheap work before the expensive work ----
  //
  // MEASURED: a page's content costs ~1.9s (block children are paginated and
  // nested, and Notion rate-limits to ~3 req/s), so 45 seconds buys about 24
  // pages. A run that simply walked the list in order spent its whole budget on
  // the first 30 pages, touched NOTHING, and therefore could not sweep — and
  // after a BUILDER_VERSION bump, when every page needs rebuilding, convergence
  // would have taken ~36 nights with no sweep in between.
  //
  // So: touch everything that does not need re-reading, then spend what is left
  // of the clock on the pages that do, and touch whatever the clock did not
  // reach. Every page ends up either rewritten or confirmed, which is what lets
  // the sweep run safely on every run instead of only on a complete one.
  const toFetch: Array<{ raw: NotionPage; dbTitle: string | null; sourceId: string }> = [];
  const touch: string[] = [];

  for (const { raw, dbTitle } of candidates) {
    const title = titleOf(raw).trim();
    if (!raw.id || !title) continue;
    const scopedTitle = dbTitle ? `${dbTitle}: ${title}` : `Notion: ${title}`;
    if (isExcluded(scopedTitle, excluded)) continue;

    const sourceId = `${dbTitle ? "task" : "page"}:${raw.id}`;
    const edited = raw.last_edited_time ?? raw.created_time ?? null;
    const seen = known.get(sourceId);

    // Unchanged AND built by the current version: keep it alive for the cost of
    // one PATCH per 100 rows. Compared on the FULL timestamp, not the date, so a
    // page edited twice in one day is still re-read the second time.
    if (edited && seen && seen.edited === edited && seen.v === BUILDER_VERSION) {
      // Also confirm any continuation parts. They share the page's edit state, so
      // if the base is unchanged they are too — but they have their own ids, and
      // touching only the base would leave the sweep to delete every "part 2".
      touch.push(sourceId, ...partIdsOf(known, sourceId));
    } else {
      toFetch.push({ raw, dbTitle, sourceId });
    }
  }

  // ---- fetch what the clock allows -----------------------------------------
  //
  // ponytail: the crawl above costs ~20s of the run because it queries all 35
  // databases every night to learn which pages exist. A cheaper design is
  // available and deliberately not taken yet: `/search` sorted by
  // last_edited_time descending, paginated only until it passes the oldest edit
  // already indexed, gives the CHANGED set in 2-3 requests, and everything else
  // can be confirmed from `known` without being crawled at all. It is not free —
  // a page deleted in Notion would then never be noticed, so the full crawl has
  // to stay as the backfill path. Worth doing if the nightly run starts running
  // out of budget before it fetches anything.
  let fetched = 0;
  for (const item of toFetch) {
    if (isOutOfTime() || fetched >= MAX_CONTENT_PAGES) {
      // Not an error, and not a loss: the rest are CONFIRMED below rather than
      // abandoned, so they keep their existing (older) content until a later run
      // reaches them. Stale content beats deleted content.
      complete = false;
      break;
    }

    let text = "";
    try {
      text = await pageText(token, item.raw.id as string);
    } catch (err) {
      logger.warn({ err, page: item.raw.id }, "brain-ingest notion: page content unreadable");
      complete = false;
    }
    fetched += 1;

    const row = item.dbTitle
      ? taskToRow(item.raw, stampedAt, item.dbTitle, text)
      : pageToRow(item.raw, text, stampedAt);
    if (!row) continue;

    // Split rather than let the write path slice the tail off. Part 1 keeps the
    // base source_id so existing rows update in place instead of orphaning.
    const parts = splitBody(row.body);
    parts.forEach((body, i) => {
      rows.push(
        i === 0
          ? { ...row, body }
          : {
              ...row,
              source_id: `${row.source_id}#${i + 1}`,
              title: `${row.title} (part ${i + 1} of ${parts.length})`,
              body,
              meta: { ...row.meta, part: i + 1, parts: parts.length },
            }
      );
    });
  }

  // Anything the clock did not reach is confirmed, not abandoned.
  const written = await upsertChunks(rows);
  const writtenIds = new Set(rows.map((r) => r.source_id));
  const deferred = toFetch
    .flatMap((i) => [i.sourceId, ...partIdsOf(known, i.sourceId)])
    .filter((id) => !writtenIds.has(id));
  const touched = await touchChunks(SOURCE, [...touch, ...deferred], stampedAt);

  // The sweep is safe whenever every page was either rewritten or confirmed —
  // which is now true even for a run cut short, so stale rows are never deleted
  // just because the clock ran out. It still refuses if the crawl itself was
  // incomplete, because then pages may be missing from `candidates` entirely.
  const crawlComplete = databases.size > 0 && !crawlTruncated;
  const swept = crawlComplete ? await sweepStale(SOURCE, stampedAt, written + touched) : 0;

  logger.info(
    {
      databases: databases.size,
      candidates: candidates.length,
      toFetch: toFetch.length,
      written,
      touched,
      fetched,
      deferred: deferred.length,
      crawlComplete,
      complete,
    },
    "brain-ingest notion"
  );

  if (written === 0 && touched === 0) {
    return { source: SOURCE, rows: 0, swept: 0, skipped: "notion-time-budget" };
  }
  return { source: SOURCE, rows: written + touched, swept };
}


/**
 * The shared write path caps a body at 2,400 characters and slices the excess
 * away silently. Every other source chunks BEFORE it gets there — the repo
 * ingester splits markdown at heading and paragraph boundaries, so its longest
 * chunk lands at 2,392 — but Notion pages went in whole, and 60 of 1,062 arrived
 * at exactly 2,400 with their tails gone and nothing recording the loss.
 *
 * So split here instead, preferring a paragraph break, then a line break, then a
 * hard cut — the hard cut being the case that fires on a wide table where neither
 * break exists inside the limit. Same shape as `hardSplit` in
 * scripts/brain-ingest-repo.mjs.
 *
 * The ceiling itself stays: it is there so no single row can dominate a prompt.
 * The bug was losing content to it, not having it.
 */
const BODY_LIMIT = 2400;
const MIN_SPLIT = 600;

/** Continuation ids already indexed for a page, e.g. `page:abc#2`, `#3`. */
function partIdsOf(known: Map<string, { edited: string; v: number }>, baseId: string): string[] {
  const prefix = `${baseId}#`;
  return [...known.keys()].filter((id) => id.startsWith(prefix));
}

export function splitBody(text: string): string[] {
  const out: string[] = [];
  let rest = text;
  while (rest.length > BODY_LIMIT) {
    const window = rest.slice(0, BODY_LIMIT);
    let cut = window.lastIndexOf("\n\n");
    if (cut < MIN_SPLIT) cut = window.lastIndexOf("\n");
    if (cut < MIN_SPLIT) cut = BODY_LIMIT;
    out.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) out.push(rest);
  return out.filter(Boolean);
}

/** Every database shared with the integration, id → title. */
async function allDatabases(
  token: string,
  isOutOfTime: () => boolean
): Promise<{ items: Map<string, string>; complete: boolean }> {
  const out = new Map<string, string>();
  let complete = true;
  let cursor: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    if (isOutOfTime()) {
      complete = false;
      break;
    }
    const json = await notionPost(token, "/search", {
      filter: { property: "object", value: "database" },
      page_size: PAGE_SIZE,
      ...(cursor ? { start_cursor: cursor } : {}),
    });
    for (const raw of (json.results as NotionPage[]) ?? []) {
      if (raw.archived || raw.in_trash || !raw.id) continue;
      // A DATABASE's name is a top-level `title` array; only a PAGE keeps its
      // title inside `properties`. Running titleOf() here returned "" for every
      // database, which titled all 1,027 rows "Untitled database: …".
      const own = Array.isArray((raw as { title?: RichText[] }).title)
        ? (raw as { title?: RichText[] }).title!.map((t) => t.plain_text ?? "").join("")
        : "";
      out.set(raw.id, own.trim() || titleOf(raw).trim() || "Untitled database");
    }
    cursor = json.has_more ? (json.next_cursor as string) : undefined;
    if (!cursor) break;
    if (page === MAX_PAGES - 1) complete = false;
  }
  return { items: out, complete };
}

/** Every live row of one database. */
async function databaseRows(
  token: string,
  dbId: string,
  isOutOfTime: () => boolean
): Promise<{ items: NotionPage[]; complete: boolean }> {
  const out: NotionPage[] = [];
  let complete = true;
  let cursor: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    if (isOutOfTime()) {
      complete = false;
      break;
    }
    let json;
    try {
      json = await notionPost(token, `/databases/${dbId}/query`, {
        page_size: PAGE_SIZE,
        ...(cursor ? { start_cursor: cursor } : {}),
      });
    } catch (err) {
      // One database the integration cannot query must not lose the other 34 —
      // but it DOES mean the crawl is incomplete, so the sweep must not run: its
      // rows would look absent and be deleted.
      logger.warn({ err, dbId }, "brain-ingest notion: database unreadable");
      return { items: out, complete: false };
    }
    for (const raw of (json.results as NotionPage[]) ?? []) {
      if (raw.archived || raw.in_trash) continue;
      out.push(raw);
    }
    cursor = json.has_more ? (json.next_cursor as string) : undefined;
    if (!cursor) break;
    if (page === MAX_PAGES - 1) complete = false;
  }
  return { items: out, complete };
}

/** Pages that are not rows of a database. Rows are covered by databaseRows(),
 *  and indexing them here too would put the same page in twice under two ids. */
async function standalonePages(
  token: string,
  isOutOfTime: () => boolean
): Promise<{ items: NotionPage[]; complete: boolean }> {
  const out: NotionPage[] = [];
  let complete = true;
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
      out.push(raw);
    }
    cursor = json.has_more ? (json.next_cursor as string) : undefined;
    if (!cursor) break;
    if (page === MAX_PAGES - 1) complete = false;
  }
  return { items: out, complete };
}

/**
 * source_id → the `last_edited_time` already indexed for it.
 *
 * Paginated explicitly: PostgREST caps a response at 1,000 rows by default, and
 * this table now holds more Notion rows than that, so a single unpaginated read
 * would silently report the oldest 1,000 as the whole corpus and re-download
 * every page past the cap on every run.
 */
async function knownNotionEdits(): Promise<Map<string, { edited: string; v: number }>> {
  const out = new Map<string, { edited: string; v: number }>();
  for (let offset = 0; offset < 20_000; offset += 1000) {
    const res = await supabaseFetch(
      `/rest/v1/brain_chunk?select=source_id,meta&source=eq.${SOURCE}&order=source_id.asc&limit=1000&offset=${offset}`
    );
    if (!res.ok) {
      logger.warn({ status: res.status }, "brain-ingest notion: could not read existing chunks — will refetch all content");
      return new Map();
    }
    const batch = (await res.json().catch(() => [])) as Array<{
      source_id?: string;
      meta?: { edited?: unknown; v?: unknown } | null;
    }>;
    for (const row of batch) {
      const edited = row.meta?.edited;
      // A row with no version predates the stamp, so it reads as v0 and gets
      // rebuilt — which is the correct treatment for the rows already written
      // with the wrong database title.
      const v = typeof row.meta?.v === "number" ? row.meta.v : 0;
      if (row.source_id && typeof edited === "string") out.set(row.source_id, { edited, v });
    }
    if (batch.length < 1000) break;
  }
  return out;
}

/** Teamspace narrowing is advisory only — Notion's search API has no teamspace
 *  filter, so the real boundary is which pages the integration is shared with.
 *  Exported so the cron can log what it believes the scope to be. */
export function notionScope(): string {
  const ts = process.env.NOTION_TEAMSPACE_ID;
  return ts ? `teamspace ${ts}` : "every page shared with the integration";
}
