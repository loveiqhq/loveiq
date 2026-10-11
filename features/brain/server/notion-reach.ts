import { createHash } from "node:crypto";
import { supabaseFetch } from "@features/admin/server/supabase";
import logger from "@shared/observability/logger";
import { isReportingMonday, reportingDay, reportingDayStart } from "@shared/time/reporting-day";
import { attachChildren, notionGet, notionPost } from "./ingest/notion";
import { chunkPage, MAX_BODY_CHARS } from "./ingest/upsert";
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
 * Three kinds of evidence that the team uses a page:
 *  - LINKS. A Notion URL in WhatsApp, Slack, an email, a Drive doc or a Notion page.
 *    The host is its own token in `brain_chunk.fts`, so finding them is one indexed
 *    read (a body ILIKE timed out in production: brain-chunk-body-ilike-times-out).
 *  - @-MENTIONS. Notion renders a mention of a page the integration cannot open as
 *    the word "Untitled", with no link in the stored text. Those few pages are read
 *    again through the API to get the ids behind the mentions.
 *  - RELATIONS. A database Jarvis can open that relates to one it cannot: every row
 *    points into the hidden one. Read off the database listing, at no extra cost.
 *
 * Every id is then asked of Notion through Jarvis's own token, the same access the
 * brain uses, so a broken connection counts as broken. HOLDING A PAGE PROVES NOTHING:
 * the corpus is memory, and a page whose connection was removed keeps its chunks on
 * purpose (the Notion sweep treats lost access as history, not deletion), so pages
 * Jarvis already holds are asked too, after the rest, in a different order each day.
 * Only Notion's own database listing counts as an answer without a question.
 *
 * What cannot be opened is posted to the brain channel and kept as a notice for the
 * daily brief, but only when something changed (new or fixed) and on Mondays as a
 * reminder; the reported set rides in the notice's meta.
 *
 * Measured 2026-10-11 and deliberately NOT read: hyperlinks with their own text and
 * link-to-page blocks inside Notion pages, which the stored text drops. All 74
 * standalone pages and 60 random rows held 19 such targets, none unreadable; teaching
 * the ingester to keep them means a builder bump (every page re-read). Add it if a
 * gap is ever found behind one.
 */

export const REACH_KIND = "notion-reach";
/** A link nobody has posted in this long stops being reported (dead links age out). */
export const REACH_LOOKBACK_DAYS = 90;
/** Ids asked of Notion per run (~0.35s each); in practice the cron's clock stops it first. */
export const MAX_CHECKS = 200;
/** Pages re-read for their @-mentions per run. */
export const MAX_MENTION_PAGES = 20;
const MAX_REF_ROWS = 5000;
const MENTION_BLOCK_PAGES = 10;
/** The hosts a team page lives on; the workspace's public pages are loveiq.notion.site. */
const TEAM_HOSTS: ReadonlySet<string> = new Set([
  "notion.so",
  "www.notion.so",
  "app.notion.com",
  "loveiq.notion.site",
]);
const NOTION_HOSTS = [...TEAM_HOSTS].join(" | ");
/** First path segments that are Notion's own pages (terms) or its file proxies, never ours. */
const NOT_PAGES: ReadonlySet<string> = new Set(["notion", "image", "signed"]);
/** How long a reported page Jarvis did not see linked today is kept while a run was partial. */
export const HOLD_DAYS = 14;
/** Documents whose links stay current while the document exists (see the window below). */
export const LIVING_SOURCES: ReadonlySet<string> = new Set(["notion", "drive", "doc"]);

/**
 * The id a Notion URL segment ENDS with. Unanchored, "Weekly-20261011-<id>" read the date
 * as the id's first eight digits and reported a page that does not exist.
 */
const TRAILING_ID =
  /(?:^|[^0-9a-f])([0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
// Commas and semicolons end it too: a Drive export glues the next field on ("…<id>,Marcus").
const NOTION_URL = /https?:\/\/[\w.-]*notion\.(?:so|site|com)\/[^\s<>()[\]"'`|,;]+/gi;

/** A Notion id in any of its spellings, as the API's dashed lowercase, or null. */
export function toNotionId(raw: string): string | null {
  const hex = TRAILING_ID.exec(raw.trim())?.[1]?.replace(/-/g, "").toLowerCase();
  if (!hex) return null;
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** A stray "%" ("Plan-100%-done-…") makes decodeURIComponent throw; one link must not end the run. */
function decodeSafely(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
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
 * the path, so p counts and v does not. Only the team's own hosts count: Notion's terms
 * (`notion.so/notion/…`, `notion.notion.site/…`, linked from every Notion email), its
 * file proxies (`/image/`, `/signed/`), its API and its mail or calendar apps never do.
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
    if (!TEAM_HOSTS.has(url.hostname.toLowerCase())) continue;
    const segments = url.pathname.split("/").filter(Boolean);
    if (NOT_PAGES.has(segments[0]?.toLowerCase() ?? "")) continue;
    const last = decodeSafely(segments[segments.length - 1] ?? "");
    const pathId = toNotionId(last);
    const idText = pathId ? (TRAILING_ID.exec(last.trim())?.[1] ?? "") : "";
    const words = last
      .trim()
      .slice(0, last.trim().length - idText.length)
      .replace(/[-_]+/g, " ")
      .trim();
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
  /** Read off a database's relation: the target is a database, and it has no link text. */
  relation?: boolean;
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

/** One long title must not crowd the other pages out of a notice. */
const MAX_LABEL = 70;
function clip(text: string): string {
  return text.length > MAX_LABEL ? `${text.slice(0, MAX_LABEL - 1).trimEnd()}…` : text;
}

function gapLine(gap: Gap): string {
  const refs = [...gap.refs].sort((a, b) => (b.day ?? "").localeCompare(a.day ?? ""));
  const first = refs[0];
  // Held from the last report: still unreadable, but today's run did not see the link.
  if (!first) {
    return gap.hint
      ? `• "${clip(gap.hint)}", reported before (not seen linked today): ${openUrl(gap.id)}`
      : `• A page reported before (not seen linked today): ${openUrl(gap.id)}`;
  }
  const where = `linked in ${clip(first.where)}`;
  const more = refs.length > 1 ? ` and ${plural(refs.length - 1, "other place")}` : "";
  if (!gap.hint && first?.relation) {
    return `• A database that ${clip(first.where)} points to${more}: ${openUrl(gap.id)}`;
  }
  return gap.hint
    ? `• "${clip(gap.hint)}", ${where}${more}: ${openUrl(gap.id)}`
    : `• A page ${where}${more} (the link carries no title): ${openUrl(gap.id)}`;
}

const FIX_TEXT =
  'To fix one: open it in Notion, click ⋯ (top right), then Connections, and add "Claude connection". ' +
  "If Claude connection is already listed, disconnect it and add it again: a connection can show there " +
  "without working. Or ask Claude to connect it for you. A link to a deleted page or to another " +
  `workspace shows up here too, and drops off once nobody has linked it for ${REACH_LOOKBACK_DAYS} days.`;
const MASS_LOSS_AT = 10;
const MASS_LOSS_TEXT =
  "So many at once usually means a whole teamspace or top page lost the connection: add Claude " +
  "connection on that top page and every page under it follows.";

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
  /** Asked of Notion one by one this run. */
  asked: number;
  /** Shown open by Notion's own database listing, so not asked. */
  listed: number;
  /** Linked, but the clock ran out before they were asked. */
  unreached: number;
  /** Asked, and found in Notion's trash: dead links, no longer counted as linked. */
  trashed?: number;
  /** The day each reported page was last seen linked; today when not given. */
  seenOn?: (id: string) => string;
  /** A title from the last report, for a page today's run did not see linked. */
  hintOf?: (id: string) => string | null;
  day: string;
}): NoticeInput {
  const { gaps, fresh, still, fixed } = input;
  const open = fresh.length + still.length;
  const hintFor = (id: string) => gaps.get(id)?.hint ?? input.hintOf?.(id) ?? null;
  const line = (id: string) => gapLine({ id, hint: hintFor(id), refs: gaps.get(id)?.refs ?? [] });
  const fixedLine = (id: string) => {
    const hint = hintFor(id);
    return `• ${hint ? `"${clip(hint)}"` : "A page"} ${openUrl(id)}`;
  };
  const items = [
    ...fresh.map((id) => ["New since the last check:", line(id)] as const),
    ...still.map((id) => ["Still not shared:", line(id)] as const),
    ...fixed.map((id) => ["Jarvis can open these now:", fixedLine(id)] as const),
  ];
  const fix = open ? FIX_TEXT + (open >= MASS_LOSS_AT ? ` ${MASS_LOSS_TEXT}` : "") : "";
  const evidence =
    `${plural(input.linked, "Notion page")} linked by the team, checked on ${input.day} through ` +
    `Jarvis's own Notion access: ${input.asked} asked one by one` +
    (input.trashed ? ` (${input.trashed} of them in Notion's trash, a dead link)` : "") +
    `, ${input.listed} shown open in ` +
    `Notion's own list of databases` +
    (input.unreached ? `, ${input.unreached} not reached before the run's time ran out.` : ".");
  const render = (n: number) => {
    const sections = new Map<string, string[]>();
    for (const [title, text] of items.slice(0, n)) {
      sections.set(title, [...(sections.get(title) ?? []), text]);
    }
    const parts = [...sections].map(([title, lines]) => [title, ...lines].join("\n"));
    if (n < items.length) parts.push(`…and ${items.length - n} more.`);
    if (fix) parts.push(fix);
    return parts.join("\n\n");
  };
  // The stored body is cut at MAX_BODY_CHARS with no marker, which would take the fix
  // and the evidence first. So the list gives way instead; 100 covers the notice's own
  // first line ("Noticed on … without being asked.") and the separators.
  const room = MAX_BODY_CHARS - 100 - evidence.length;
  let shown = items.length;
  while (shown > 0 && render(shown).length > room) shown -= 1;
  const reachOpen = [...new Set([...fresh, ...still, ...(input.carried ?? [])])].sort();
  const headline = open
    ? `Jarvis cannot open ${plural(open, "Notion page")} the team links to` +
      (fresh.length && still.length ? ` (${fresh.length} new)` : "")
    : `Jarvis can now open ${plural(fixed.length, "Notion page")} it could not before`;
  return {
    headline,
    detail: render(shown),
    kind: REACH_KIND,
    evidence,
    meta: {
      reach_open: reachOpen,
      reach_seen: Object.fromEntries(reachOpen.map((id) => [id, input.seenOn?.(id) ?? input.day])),
      reach_hint: Object.fromEntries(
        reachOpen.flatMap((id) => {
          const hint = hintFor(id);
          return hint ? [[id, hint]] : [];
        })
      ),
    },
  };
}

// ---- reading the corpus ------------------------------------------------------

/** The parts of a database object from `/search` this check reads. */
type NotionDatabase = {
  id?: string;
  archived?: boolean;
  in_trash?: boolean;
  title?: Array<{ plain_text?: string }>;
  properties?: Record<string, { type?: string; relation?: { database_id?: string } } | null>;
};

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

/** The HTTP status inside a notionGet/notionPost error; 0 for a timeout or a network failure. */
function statusOf(err: unknown): number {
  return Number(/failed \((\d{3})\)/.exec(String(err))?.[1] ?? 0);
}

/** The reporting day `n` days before `day`; from noon, so a DST night cannot tip it. */
function daysBefore(day: string, n: number): string {
  return reportingDay(new Date(reportingDayStart(day).getTime() + 12 * 3_600_000 - n * 86_400_000));
}

/** A token Notion refuses outright is not a page problem: it fails the run, loudly. */
function rethrowIfTokenRefused(err: unknown): void {
  if (statusOf(err) === 401) throw err;
}

async function pagedRows(path: string, cap: number): Promise<CorpusRow[]> {
  const out: CorpusRow[] = [];
  for (let offset = 0; offset < cap; offset += 1000) {
    const res = await supabaseFetch(`${path}&limit=1000&offset=${offset}`);
    const batch = await chunkPage<CorpusRow>(REACH_KIND, res);
    out.push(...batch);
    if (batch.length < 1000) return out;
  }
  // ponytail: the oldest rows are the ones cut. Page by source if this ever fires (185
  // link rows on 2026-10-11 against 5,000). An error, so it reaches the brain channel.
  logger.error(
    { path: path.slice(0, 120), cap },
    "brain notion-reach: row cap reached, so the oldest rows were not read"
  );
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
  /** Linked ids the clock did not reach this run: neither new nor fixed. */
  unreached: number;
  /** Asked and found in Notion's trash: dropped as dead links. */
  trashed: number;
  /** Pages whose @-mentions were re-read, out of how many carry an "Untitled". */
  mentionTotal: number;
  /** Why this run cannot be trusted as a clean bill, or null. Fails the cron. */
  problem: string | null;
  /**
   * Names a due notice by the pages it shows, not its wording, for the once-a-day Slack
   * claim: Monday's re-run "Still not shared: X" is the same news as that morning's
   * "New since the last check: X", while two different one-page fixes are not.
   */
  findingKey: string | null;
  visibleNotIndexed: number;
  mentionPages: number;
  noticed: boolean;
  /** The last-seen days of reported pages could not be saved on a quiet day. Fails the cron. */
  seenRefreshFailed: boolean;
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
  // Berlin days, like every dated record here (shared/time/reporting-day.ts).
  const day = reportingDay(now);
  /** A per-day order: stable within a day, different the next, so a cap never skips the same ones. */
  const shuffle = (id: string) => createHash("sha1").update(`${day}:${id}`).digest("hex");
  const since = daysBefore(day, REACH_LOOKBACK_DAYS);

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
        `&fts=fts(simple).${encodeURIComponent(NOTION_HOSTS)}&source=neq.${NOTICE_SOURCE}` +
        `&or=(source.in.(${[...LIVING_SOURCES].join(",")}),period_end.gte.${since})` +
        `&order=period_end.desc.nullslast,id.asc`,
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
      `/rest/v1/brain_chunk?select=source,source_id,title,body,period_end,meta` +
        `&source=eq.notion&fts=fts(english).untitled&order=period_end.desc.nullslast,id.asc`,
      1000
    )
  )
    // The same window as links: a finished task's mentions age like a message's.
    .filter((r) => isLiving(r) || (r.period_end ?? "") >= since)
    .filter((r) => /\bUntitled\b/.test(r.body ?? ""));
  const mentionPages = new Map<string, CorpusRow>();
  for (const row of untitled) {
    const id = pageIdOf(row.source_id);
    if (id && !mentionPages.has(id)) mentionPages.set(id, row);
  }
  // Its own slice of the clock, so re-reading can never leave the questions none, and a
  // per-day order, so past the cap a different 20 are read each day.
  const mentionDeadline = Date.now() + 20_000;
  const mentionsOutOfTime = () => isOutOfTime() || Date.now() > mentionDeadline;
  /** Some mentions went unread: what was reported stays referenced rather than dropping off. */
  let mentionsPartial = mentionPages.size > MAX_MENTION_PAGES;
  let mentionRead = 0;
  /** Pages whose mentions were read in full, for the counters. */
  let mentionOk = 0;
  const mentionOrder = [...mentionPages].sort(([a], [b]) => shuffle(a).localeCompare(shuffle(b)));
  for (const [pageId, row] of mentionOrder) {
    if (mentionRead >= MAX_MENTION_PAGES) break;
    if (mentionsOutOfTime()) {
      mentionsPartial = true;
      break;
    }
    mentionRead += 1;
    let page: Record<string, unknown>;
    try {
      page = await notionGet(token, `/pages/${pageId}`);
    } catch (err) {
      rethrowIfTokenRefused(err);
      // A page Jarvis lost access to answers 404/403 every day: that is not a partial
      // read to wait out, and holding for it would keep every reported page held for good.
      const status = statusOf(err);
      if (status !== 404 && status !== 403) mentionsPartial = true;
      logger.warn({ err, pageId }, "brain notion-reach: could not re-read a page's mentions");
      continue;
    }
    // A mention inside a property ("Traffic: Untitled") is stored the same way.
    const blocks: Block[] = [];
    for (const prop of Object.values((page.properties ?? {}) as Record<string, Block | null>)) {
      const rich = prop?.rich_text ?? prop?.title;
      if (Array.isArray(rich)) blocks.push({ type: "paragraph", paragraph: { rich_text: rich } });
    }
    try {
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
      const budget = { left: 40 };
      await attachChildren(token, blocks, 0, budget, mentionsOutOfTime);
      // More blocks than read, the child budget spent, or the clock cut the walk short.
      if (cursor || budget.left <= 0 || mentionsOutOfTime()) mentionsPartial = true;
      else mentionOk += 1;
    } catch (err) {
      rethrowIfTokenRefused(err);
      // The page opened but a block under it did not (one nested 404 is enough): what was
      // gathered still counts, and the rest is a partial read.
      mentionsPartial = true;
      logger.warn({ err, pageId }, "brain notion-reach: could not read all of a page's mentions");
    }
    for (const id of notionIdsInBlocks(blocks)) {
      if (id !== pageId) note(id, null, { where: whereOf(row), day: row.period_end });
    }
  }

  // ---- what Jarvis can open right now, and what it only remembers -------------
  // Indexed pages only decide the ORDER of the questions below (see the header):
  // the corpus is memory, not access.
  const indexed = new Set<string>();
  for (const row of await pagedRows(
    `/rest/v1/brain_chunk?select=source_id&source=eq.notion&order=source_id.asc`,
    20_000
  )) {
    const id = pageIdOf(row.source_id);
    if (id) indexed.add(id);
  }
  // Notion's own list of the databases it lets Jarvis open IS an answer. A failed
  // listing only costs requests: every database link is then asked one by one.
  const databases = new Set<string>();
  const relations: Array<{ target: string; where: string }> = [];
  /** The listing failed or stopped early: relations may be missing (see the hold below). */
  let listingPartial = false;
  try {
    let cursor: string | undefined;
    for (let i = 0; i < 5; i++) {
      const json = await notionPost(token, "/search", {
        filter: { property: "object", value: "database" },
        page_size: 100,
        ...(cursor ? { start_cursor: cursor } : {}),
      });
      for (const db of (json.results as NotionDatabase[]) ?? []) {
        const id = db.id ? toNotionId(db.id) : null;
        // A database in the trash is neither open nor a source of relations; a link to it
        // is asked like any page and dropped as a dead link.
        if (!id || db.archived === true || db.in_trash === true) continue;
        databases.add(id);
        const name =
          (db.title ?? [])
            .map((t) => t.plain_text ?? "")
            .join("")
            .trim() || "a database";
        for (const [prop, def] of Object.entries(db.properties ?? {})) {
          const target =
            def?.type === "relation" ? toNotionId(def.relation?.database_id ?? "") : null;
          // A database's own id is already listed, so a self-relation drops out below.
          if (target) relations.push({ target, where: `the relation "${prop}" on ${name}` });
        }
      }
      cursor = json.has_more ? String(json.next_cursor) : undefined;
      if (!cursor) break;
    }
    if (cursor) listingPartial = true;
  } catch (err) {
    rethrowIfTokenRefused(err);
    listingPartial = true;
    logger.warn({ err }, "brain notion-reach: database listing failed; checking links one by one");
  }
  for (const { target, where } of relations) {
    if (!databases.has(target)) note(target, null, { where, day: null, relation: true });
  }

  // ---- what was reported last time ---------------------------------------------
  const previousRows = await chunkPage<{
    source_id?: string;
    meta?: {
      reach_open?: unknown;
      reach_seen?: unknown;
      reach_hint?: unknown;
      noticed_on?: unknown;
    } | null;
  }>(
    REACH_KIND,
    await supabaseFetch(
      `/rest/v1/brain_chunk?select=source_id,meta&source=eq.${NOTICE_SOURCE}` +
        `&meta->>noticed_by=eq.${REACH_KIND}&order=updated_at.desc&limit=1`
    )
  );
  const reported = previousRows[0]?.meta?.reach_open;
  const previous = new Set(
    Array.isArray(reported) ? reported.filter((x): x is string => typeof x === "string") : []
  );
  const seenMeta = previousRows[0]?.meta?.reach_seen;
  const seenOn = new Map(
    Object.entries(seenMeta && typeof seenMeta === "object" ? seenMeta : {}).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string"
    )
  );
  const lastSeen = (id: string): string | null => seenOn.get(id) ?? null;
  const hintMeta = previousRows[0]?.meta?.reach_hint;
  const hints = new Map(
    Object.entries(hintMeta && typeof hintMeta === "object" ? hintMeta : {}).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string"
    )
  );

  // ---- ask Notion -----------------------------------------------------------------
  // Order: what was reported (so a fix is noticed), then pages Jarvis has never held,
  // freshest link first (the likely gaps), then pages it holds, shuffled by the day so
  // a run the clock cuts short never skips the same ones twice.
  const referenced = new Set([...gaps.keys()]);
  const reach = new Map<string, Reach>();
  for (const id of new Set([...referenced, ...previous])) {
    if (databases.has(id)) reach.set(id, "visible");
  }
  const lastDay = (g: Gap) => g.refs.reduce((m, r) => ((r.day ?? "") > m ? (r.day ?? "") : m), "");
  const linkedGaps = [...gaps.values()].filter((g) => !reach.has(g.id) && !previous.has(g.id));
  const toCheck = [
    ...[...previous].filter((id) => !reach.has(id)),
    ...linkedGaps
      .filter((g) => !indexed.has(g.id))
      .sort((a, b) => lastDay(b).localeCompare(lastDay(a)))
      .map((g) => g.id),
    ...linkedGaps
      .filter((g) => indexed.has(g.id))
      .map((g) => g.id)
      .sort((a, b) => shuffle(a).localeCompare(shuffle(b))),
  ];
  let asked = 0;
  const trashed = new Set<string>();
  for (const id of toCheck) {
    if (asked >= MAX_CHECKS || isOutOfTime()) break;
    asked += 1;
    try {
      const block = await notionGet(token, `/blocks/${id}`);
      // In Notion's trash: a dead link, not a missing connection, and connecting it
      // would fix nothing. It leaves the count, and a reported one quietly drops off.
      if (block.in_trash === true || block.archived === true) {
        referenced.delete(id);
        trashed.add(id);
      } else reach.set(id, "visible");
    } catch (err) {
      rethrowIfTokenRefused(err);
      const status = statusOf(err);
      // 404 object_not_found: not shared, deleted, or another workspace. 403: shared
      // without the capability. Anything else (400, 429, 5xx, a timeout) proves nothing
      // either way, and never drops a link.
      if (status === 404 || status === 403) reach.set(id, "missing");
      else reach.set(id, "unknown");
    }
  }

  const { listed, fresh, still, fixed, carried } = diffReach(previous, reach, referenced);
  /**
   * A run that could not read every mention page or the whole database listing may not
   * have SEEN a page that is still linked. Dropping it from the reported set would
   * announce it as new the day it is seen again, so it is held, for HOLD_DAYS after it
   * was last seen linked: long enough for the per-day order to come back to its page,
   * short enough that a dead link still ages out. Held pages are not listed as linked.
   */
  const holdFrom = daysBefore(day, HOLD_DAYS);
  const heldOver =
    mentionsPartial || listingPartial
      ? [...previous].filter(
          (id) =>
            !referenced.has(id) &&
            !trashed.has(id) &&
            reach.get(id) !== "visible" &&
            (lastSeen(id) ?? day) >= holdFrom
        )
      : [];
  const unknown = [...reach.values()].filter((r) => r === "unknown").length;
  const unreached = [...referenced].filter((id) => !reach.has(id)).length;
  const visibleNotIndexed = [...reach].filter(
    ([id, r]) => r === "visible" && !indexed.has(id) && !databases.has(id)
  ).length;
  const linked = referenced.size;
  const listedOpen = [...referenced].filter((id) => databases.has(id)).length;

  // A held page Notion still refuses is still open: it stays in the list (and in Monday's
  // reminder) as "reported before", never as linked, since today's run could not see where.
  const heldMissing = heldOver.filter((id) => reach.get(id) === "missing");
  // The Monday reminder is for news that has gone quiet: after a report on the weekend (a
  // manual run, say), repeating the same pages on Monday morning is noise, not a reminder.
  const lastReport = previousRows[0]?.meta?.noticed_on;
  const reportIsOld = typeof lastReport !== "string" || lastReport <= daysBefore(day, 3);
  const due =
    fresh.length > 0 ||
    fixed.length > 0 ||
    (isReportingMonday(now) && reportIsOld && listed.length + heldMissing.length > 0);
  const notice = due
    ? buildReachNotice({
        gaps,
        fresh,
        still: [...still, ...heldMissing],
        fixed,
        carried: [...carried, ...heldOver],
        seenOn: (id) => (referenced.has(id) ? day : (lastSeen(id) ?? day)),
        hintOf: (id) => hints.get(id) ?? null,
        linked,
        asked,
        listed: listedOpen,
        unreached,
        trashed: trashed.size,
        day,
      })
    : null;
  // A dry run writes nothing, so "would have written" is not a failure either.
  const noticed = notice && !options.dryRun ? await recordNotice(notice) : false;

  /**
   * reach_seen moves only when a notice is written, so a page seen linked again on a quiet
   * day would keep the date of the last notice, and the hold would count from the last day
   * there was news instead of from the day it was last SEEN. So on a quiet day the dates
   * are refreshed in place on the last report: no new notice reaches the brief, and an
   * update of meta alone leaves updated_at (what marks a notice fresh) and its embedding be.
   */
  const seenAgain = [...previous].filter((id) => referenced.has(id) && lastSeen(id) !== day);
  const last = previousRows[0];
  let seenRefreshFailed = false;
  if (!notice && !options.dryRun && last?.source_id && seenAgain.length) {
    const res = await supabaseFetch(
      `/rest/v1/brain_chunk?source=eq.${NOTICE_SOURCE}&source_id=eq.${encodeURIComponent(last.source_id)}`,
      {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({
          meta: {
            ...last.meta,
            reach_seen: {
              ...Object.fromEntries(seenOn),
              ...Object.fromEntries(seenAgain.map((id) => [id, day])),
            },
          },
        }),
      }
    );
    if (!res.ok) {
      seenRefreshFailed = true;
      logger.warn({ status: res.status }, "brain notion-reach: last-seen days not saved");
    }
  }

  // Named pages first: "untitled" tells a reader of list_sources nothing.
  const names = [...listed]
    .sort((a, b) => Number(!gaps.get(a)?.hint) - Number(!gaps.get(b)?.hint))
    .slice(0, 3)
    .map((id) => gaps.get(id)?.hint ?? "untitled")
    .join(", ");
  // Never "all readable" while some went unasked or unanswered (linked ones: a reported
  // page nobody links any more is not "more").
  const notChecked = [...referenced].filter(
    (id) => reach.get(id) !== "missing" && reach.get(id) !== "visible"
  ).length;
  const summary = listed.length
    ? `${plural(listed.length, "linked Notion page")} Jarvis cannot open (${names}${listed.length > 3 ? ", …" : ""})` +
      (notChecked ? `; ${notChecked} more could not be checked` : "")
    : notChecked
      ? `no linked Notion page found unreadable, but ${notChecked} of ${linked} could not be checked`
      : linked
        ? `${linked === 1 ? "the one linked Notion page is" : `all ${linked} linked Notion pages are`} readable`
        : "found no Notion links to check";
  // A failed listing still asks every link, but relations go unread: say so where it shows.
  const caveat =
    (listingPartial ? "; Notion's database list could not be read in full" : "") +
    (mentionsPartial ? "; some @-mentions could not be re-read" : "");
  const problem =
    asked > 0 && unknown === asked
      ? `Notion answered none of the ${asked} questions it was asked`
      : asked === 0 && toCheck.length > 0
        ? `time ran out before Notion was asked about any of ${plural(toCheck.length, "page")}`
        : null;
  return {
    linked,
    checked: asked,
    missing: listed.length,
    fresh: fresh.length,
    fixed: fixed.length,
    unknown,
    unreached,
    trashed: trashed.size,
    visibleNotIndexed,
    mentionPages: mentionOk,
    mentionTotal: mentionPages.size,
    problem,
    noticed,
    noticeFailed: due && !options.dryRun && !noticed,
    seenRefreshFailed,
    summary: summary + caveat,
    findingKey: notice
      ? createHash("sha1")
          .update(
            `${[...fresh, ...still, ...heldMissing].sort().join(",")}|${[...fixed].sort().join(",")}`
          )
          .digest("hex")
          .slice(0, 10)
      : null,
    notice,
  };
}
