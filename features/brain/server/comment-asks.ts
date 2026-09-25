import { supabaseFetch } from "@features/admin/server/supabase";
import { loadPeople } from "@features/brain/server/people";
import { fetchWithTimeout } from "@shared/http/fetch-with-timeout";
import { DRIVE_SCOPE, getDelegatedToken } from "@shared/http/google-oauth";
import logger from "@shared/observability/logger";

/**
 * ASKS LEFT IN COMMENTS: who asked whom for what in Figma and Google Docs, and whether it
 * is still open. Plan item A22. Marcus, 18 Sep: "I don't work well with tasks hidden in
 * comments"; Mark wants what needs his eyes in one place, with links.
 *
 * FIGMA is read straight from its comments API: every comment on every file whose link the
 * company has shared anywhere the brain reads, with its `resolved_at`. A mention keeps its
 * "@Name" in the plain message, so who was asked comes from the text itself. That matters:
 * Marcus receives no Figma emails at all since 18 Sep, so an email-based list would have
 * shown him none of his own asks.
 *
 * GOOGLE DOCS has no "comments mentioning X" query, so the notification emails are the index:
 * each one lands in the mailbox of the person mentioned or assigned, and its link carries
 * the comment's id (`disco=`). The Drive API then gives that comment's `resolved` flag and
 * replies, read as the person asked, so `me` marks their own replies exactly.
 *
 * Measured 2026-09-25 on Report 3.0: 100 of its 142 comment threads were resolved. Without
 * the live status the list would be mostly finished work.
 */

export type AskApp = "Figma" | "Google Docs" | "Google Sheets" | "Google Slides";
export type AskStatus = "open" | "answered" | "resolved" | "gone" | "unknown";

export interface CommentAsk {
  /** The person asked: a canonical name when the registry knows them. */
  person: string;
  asker: string;
  app: AskApp;
  kind: "mention" | "action item";
  file: string;
  text: string;
  /** For a bare mention ("@Mark"), what the thread it pings is about. */
  context?: string;
  day: string;
  link: string;
  status: AskStatus;
  /** When the person asked replied without the thread being resolved. */
  answeredOn?: string;
}

const fold = (s: string) => s.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().trim();
const firstName = (name: string) => fold(name).split(/\s+/)[0] ?? "";

/**
 * A person's name from anything that names them: a Figma handle ("Mark"), an address
 * ("sk@loveiq.org") or a canonical name. The registry first; then a first name that belongs
 * to exactly one person on it, which is how "Mark" becomes "Mark Oldenburg". Otherwise the
 * name as given: a guess would merge two people's asks.
 */
export function makePersonOf(
  aliases: Map<string, string>,
  canonicals: string[]
): (who: string) => string {
  return (who) => {
    const direct = aliases.get(fold(who));
    if (direct) return direct;
    const first = firstName(who);
    const hits = [...new Set(canonicals.filter((c) => firstName(c) === first))];
    return hits.length === 1 ? hits[0]! : who.trim();
  };
}

// ── Figma ───────────────────────────────────────────────────────────────────────────

/** A Figma comment as the REST API returns it, the fields this reads. */
export interface FigmaComment {
  id: string;
  parent_id: string;
  message: string;
  created_at: string;
  resolved_at: string | null;
  user: { handle: string };
  client_meta?: { node_id?: string } | null;
}

/**
 * The handles one message @mentions. Handles can hold spaces ("Marcus Börner"), so each "@"
 * takes the LONGEST known handle that follows it, and only up to a word boundary: "@Mark"
 * must not read "@Markus".
 */
export function mentionsIn(message: string, handles: string[]): string[] {
  const byLength = [...handles].sort((a, b) => b.length - a.length);
  const out: string[] = [];
  for (const at of message.matchAll(/@/g)) {
    const rest = message.slice(at.index! + 1);
    // Case-blind: a typed "@mark" addresses Mark as surely as Figma's own "@Mark" token.
    const hit = byLength.find(
      (h) =>
        rest.slice(0, h.length).toLowerCase() === h.toLowerCase() &&
        !/^[\p{L}\d]/u.test(rest.slice(h.length))
    );
    if (hit && !out.includes(hit)) out.push(hit);
  }
  return out;
}

export function figmaLink(fileKey: string, c: FigmaComment): string {
  const node = c.client_meta?.node_id
    ? `?node-id=${encodeURIComponent(c.client_meta.node_id.replace(":", "-"))}`
    : "";
  return `https://www.figma.com/design/${fileKey}${node}#${c.parent_id || c.id}`;
}

const clip = (s: string, n: number) => {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 3)}...` : t;
};

/**
 * Every ask in one file's comments since `since`: one per comment per person it mentions,
 * never the asker's own name. Resolved lives on a thread's root; "answered" means the
 * person asked wrote in the thread after the ask and nobody has resolved it since.
 */
export function figmaAsks(
  fileKey: string,
  fileName: string,
  comments: FigmaComment[],
  since: string,
  personOf: (who: string) => string,
  /** Every handle seen across the files, so a mention of someone who never commented here counts. */
  handles: string[]
): CommentAsk[] {
  const byId = new Map(comments.map((c) => [c.id, c]));
  const out: CommentAsk[] = [];
  for (const c of comments) {
    if (c.created_at.slice(0, 10) < since) continue;
    const asker = personOf(c.user.handle);
    const rootId = c.parent_id || c.id;
    const root = byId.get(rootId) ?? c;
    const thread = comments.filter((x) => x.id === rootId || x.parent_id === rootId);
    const mentioned = mentionsIn(c.message, handles);
    // A bare ping ("@Mark") says nothing on its own; the thread it lands in does.
    const bare = !/[\p{L}\d]/u.test(
      mentioned.reduce((m, h) => m.split(`@${h}`).join(""), c.message)
    );
    for (const handle of mentioned) {
      const person = personOf(handle);
      if (person === asker) continue;
      const reply = thread
        .filter((x) => x.created_at > c.created_at && personOf(x.user.handle) === person)
        .sort((a, b) => a.created_at.localeCompare(b.created_at))[0];
      const resolved = Boolean(c.resolved_at || root.resolved_at);
      out.push({
        person,
        asker,
        app: "Figma",
        kind: "mention",
        file: fileName,
        text: clip(c.message, 220),
        ...(bare && root.id !== c.id ? { context: clip(root.message, 140) } : {}),
        day: c.created_at.slice(0, 10),
        link: figmaLink(fileKey, c),
        status: resolved ? "resolved" : reply ? "answered" : "open",
        ...(!resolved && reply ? { answeredOn: reply.created_at.slice(0, 10) } : {}),
      });
    }
  }
  return out;
}

/**
 * Every brain_chunk row a query matches, a page at a time: PostgREST returns at most 1,000
 * rows per read and says nothing about the rest. Null when a page fails, or past the ceiling,
 * so a partial read is never passed off as the whole.
 */
async function readAll<T>(query: string): Promise<T[] | null> {
  const rows: T[] = [];
  for (let offset = 0; offset < 20_000; offset += 1000) {
    const res = await supabaseFetch(`/rest/v1/brain_chunk?${query}&limit=1000&offset=${offset}`);
    if (!res.ok) return null;
    const batch = (await res.json().catch(() => null)) as T[] | null;
    if (!Array.isArray(batch)) return null;
    rows.push(...batch);
    if (batch.length < 1000) return rows;
  }
  return null;
}

/** A file name as both a link slug and an email title can spell it. */
const nameKey = (s: string) => fold(s).replace(/[^\p{L}\d]+/gu, "");

/**
 * Figma file keys and names, read off the links the company has shared anywhere the brain
 * reads: `figma.com/design/<key>/Report-3.0` is the file "Report 3.0".
 */
export async function figmaFiles(): Promise<Map<string, string> | null> {
  // Newest first, so a renamed file keeps its latest name. Found through the `fts` index,
  // where a link's host is a token of its own: a substring scan read every body in the
  // corpus, 6.8 s cold against an 8 s timeout beside the other reads, and production timed
  // out on it (2026-09-25). The index finds the same eight files in 0.2 s; the pattern
  // below still decides what counts as a file link.
  const rows = await readAll<{ body: string }>(
    `select=body&fts=fts(simple).${encodeURIComponent("www.figma.com | figma.com")}` +
      `&order=period_end.desc,id.asc`
  );
  if (!rows) return null;
  const out = new Map<string, string>();
  for (const r of rows) {
    for (const m of r.body.matchAll(
      // FigJam boards, prototypes and slide decks take comments too.
      /figma\.com\/(?:design|file|board|proto|slides)\/([A-Za-z0-9]{15,40})\/([A-Za-z0-9%_.-]{1,120})/g
    )) {
      let slug = m[2]!;
      try {
        slug = decodeURIComponent(slug);
      } catch {
        // A malformed escape: the raw slug still names the file well enough.
      }
      if (!out.has(m[1]!)) out.set(m[1]!, slug.replace(/-/g, " ").trim());
    }
  }
  return out;
}

/**
 * The Figma files the notification emails name since `since`. A file with comments whose
 * link was never shared anywhere the brain reads cannot be read, and this is how the answer
 * says so instead of leaving it out silently.
 */
export async function figmaMailNames(since: string): Promise<string[] | null> {
  const rows = await readAll<{ title: string | null }>(
    `select=title&source=eq.gmail&period_end=gte.${since}` +
      // Notion, Slack and Claude send "mentioned you in" mail too; only Figma's carries this line.
      // The `fts` condition only narrows the rows through its index; the phrase decides.
      `&fts=fts(english).${encodeURIComponent("figma & design & platform")}` +
      `&body=ilike.*${encodeURIComponent("Figma is a design platform")}*` +
      `&or=(title.ilike.*mentioned%20you%20in*,title.ilike.*new%20comment*,title.ilike.*left%20a%20comment%20in*)` +
      `&order=id.asc`
  );
  if (!rows) return null;
  const names = new Set<string>();
  for (const r of rows) {
    const title = (r.title ?? "").replace(/ \(part \d+ of \d+\)$/, "");
    const m = /(?:mentioned you in|new comments? in|left a comment in) (.+)$/i.exec(title);
    if (m) names.add(m[1]!.trim());
  }
  return [...names];
}

// ── Google ──────────────────────────────────────────────────────────────────────────

export interface GoogleAsk {
  recipient: string;
  asker: string;
  app: AskApp;
  kind: "mention" | "action item";
  file: string;
  text: string;
  day: string;
  fileId: string;
  commentId: string;
  link: string;
}

const GOOGLE_BLOCK =
  /^(.+?) \(Google (Docs|Sheets|Slides)\) \((\d{4}-\d{2}-\d{2})\): .+? \([^)\s]+@[^)\s]+\) (assigned you an action item|mentioned you in a comment) in the following\s+document\s+([^\n]+)\s+\((https:\/\/docs\.google\.com\/[^)\s]+)\)([\s\S]*?)(?:\n_Assigned to you_|\nOpen\n|(?![\s\S]))/gm;

/** The comment text out of the email: from its first @mention, past the quoted anchor. */
function googleText(rest: string): string {
  const lines = rest
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l !== "[Shared externally]");
  const at = lines.findIndex((l) => l.startsWith("@"));
  const body =
    at >= 0
      ? lines.slice(at)
      : lines.filter((l) => l && l !== "." && !/^\d+ comments?$/.test(l) && !l.startsWith("|"));
  return body.join(" ").replace(/\s+/g, " ").trim();
}

/** Every Google ask one email thread carries. Figma emails are ignored: the API is read. */
export function parseGoogleAsks(threadText: string, mailbox: string): GoogleAsk[] {
  const out: GoogleAsk[] = [];
  for (const m of threadText.matchAll(GOOGLE_BLOCK)) {
    const url = m[6]!;
    const fileId = /\/d\/([A-Za-z0-9_-]{10,})/.exec(url)?.[1];
    const commentId = /[?&]disco=([A-Za-z0-9_-]+)/.exec(url)?.[1];
    if (!fileId || !commentId) continue;
    out.push({
      recipient: mailbox,
      asker: m[1]!.trim(),
      app: `Google ${m[2]}` as AskApp,
      kind: m[4] === "assigned you an action item" ? "action item" : "mention",
      file: m[5]!.trim(),
      text: googleText(m[7] ?? ""),
      day: m[3]!,
      fileId,
      commentId,
      link: url,
    });
  }
  return out;
}

/** A Google comment as the Drive API returns it, the fields this reads. */
export interface GoogleComment {
  resolved?: boolean;
  deleted?: boolean;
  content?: string;
  createdTime?: string;
  replies?: Array<{ author?: { me?: boolean }; createdTime?: string }>;
}

export function googleStatus(c: GoogleComment): { status: AskStatus; answeredOn?: string } {
  if (c.deleted) return { status: "gone" };
  if (c.resolved) return { status: "resolved" };
  const reply = (c.replies ?? [])
    .filter((r) => r.author?.me && (r.createdTime ?? "") > (c.createdTime ?? ""))
    .sort((a, b) => (a.createdTime ?? "").localeCompare(b.createdTime ?? ""))[0];
  return reply
    ? { status: "answered", answeredOn: (reply.createdTime ?? "").slice(0, 10) }
    : { status: "open" };
}

interface ChunkRow {
  source_id: string;
  body: string;
  meta: { mailbox?: string } | null;
}

/** The Google notification threads with a message on or after `since`, each as one text. */
export async function googleThreads(
  since: string
): Promise<Array<{ mailbox: string; text: string }> | null> {
  const rows = await readAll<ChunkRow>(
    `select=source_id,body,meta&source=eq.gmail&period_end=gte.${since}` +
      // Narrowed through the `fts` index first: without it every gmail body in the window
      // is read (15,042 buffers against 1,988, measured 2026-09-25). The phrases decide.
      `&fts=fts(english).${encodeURIComponent("(assigned & action & item) | (mentioned & comment)")}` +
      `&or=(body.ilike.*assigned%20you%20an%20action%20item*,body.ilike.*mentioned%20you%20in%20a%20comment%20in%20the*)` +
      `&order=source_id.asc`
  );
  if (!rows) return null;
  const byThread = new Map<string, ChunkRow[]>();
  for (const r of rows) {
    const base = r.source_id.replace(/#\d+$/, "");
    byThread.set(base, [...(byThread.get(base) ?? []), r]);
  }
  const part = (id: string) => Number(/#(\d+)$/.exec(id)?.[1] ?? 1);
  return [...byThread.values()].map((parts) => {
    parts.sort((a, b) => part(a.source_id) - part(b.source_id));
    return { mailbox: parts[0]!.meta?.mailbox ?? "", text: parts.map((p) => p.body).join("\n\n") };
  });
}

// ── Together ────────────────────────────────────────────────────────────────────────

export interface AskDeps {
  figmaFiles: () => Promise<Map<string, string> | null>;
  figmaMailNames: (since: string) => Promise<string[] | null>;
  figmaComments: (fileKey: string) => Promise<FigmaComment[] | null>;
  googleThreads: (since: string) => Promise<Array<{ mailbox: string; text: string }> | null>;
  googleComment: (ask: GoogleAsk) => Promise<GoogleComment | null>;
  people: () => Promise<{ aliases: Map<string, string>; canonicals: string[] } | null>;
}

/** At most this many Google lookups per call, a few at a time. */
export const GOOGLE_LOOKUPS = 60;
const GOOGLE_PARALLEL = 6;

export interface AskResult {
  asks: CommentAsk[];
  /** What could not be read, said in the answer rather than shown as "nothing open". */
  gaps: string[];
}

export async function commentAsks(since: string, deps: AskDeps): Promise<AskResult> {
  const gaps: string[] = [];
  const registry = await deps.people().catch(() => null);
  const personOf = makePersonOf(registry?.aliases ?? new Map(), registry?.canonicals ?? []);
  const asks: CommentAsk[] = [];

  const listed = await deps.figmaFiles().catch(() => null);
  const files = listed ?? new Map<string, string>();
  const read = await Promise.all(
    [...files].map(async ([key, name]) => ({
      key,
      name,
      comments: await deps.figmaComments(key).catch(() => null),
    }))
  );
  const unread = read.filter((f) => !f.comments).map((f) => f.name);
  if (!listed)
    gaps.push("The list of Figma files could not be read, so no Figma comments were read.");
  else if (files.size === 0)
    gaps.push("No Figma file links were found, so no Figma comments were read.");
  else if (unread.length) gaps.push(`These Figma files could not be read: ${unread.join(", ")}.`);
  const known = new Set([...files.values()].map(nameKey));
  const mailNames = await deps.figmaMailNames(since).catch(() => null);
  if (!mailNames) {
    gaps.push("Figma's emails could not be checked for files whose link was never shared.");
  }
  const unknownFiles = (mailNames ?? []).filter((n) => !known.has(nameKey(n)));
  if (unknownFiles.length) {
    gaps.push(
      `Figma files with comments in this period that are not read, because their link was never ` +
        `shared anywhere the brain reads: ${unknownFiles.join(", ")}. Post each link once in Slack or a doc.`
    );
  }
  // Everyone who has commented, plus everyone on the roster by full and first name, so a
  // mention of someone who has never commented in these files still counts.
  const roster = registry?.canonicals ?? [];
  const handles = [
    ...new Set(
      [
        ...read.flatMap((f) => (f.comments ?? []).map((c) => c.user.handle)),
        ...roster,
        ...roster.map((c) => c.split(/\s+/)[0]!),
      ].filter(Boolean)
    ),
  ];
  for (const f of read) {
    if (f.comments) asks.push(...figmaAsks(f.key, f.name, f.comments, since, personOf, handles));
  }

  const threads = await deps.googleThreads(since).catch(() => null);
  if (!threads) {
    gaps.push("The Google comment emails could not be read, so no Google Docs asks are listed.");
  } else {
    const seen = new Set<string>();
    const google = threads
      .flatMap((t) => parseGoogleAsks(t.text, t.mailbox))
      .filter((a) => a.day >= since)
      .filter((a) => {
        const key = `${a.recipient}|${a.commentId}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      // Newest first, so what the cap leaves unchecked is the oldest.
      .sort((a, b) => b.day.localeCompare(a.day));
    if (google.length > GOOGLE_LOOKUPS) {
      gaps.push(
        `Only the newest ${GOOGLE_LOOKUPS} of ${google.length} Google asks were checked live; ` +
          `the rest show as status unknown.`
      );
    }
    for (let i = 0; i < google.length; i += GOOGLE_PARALLEL) {
      const batch = google.slice(i, i + GOOGLE_PARALLEL);
      asks.push(
        ...(await Promise.all(
          batch.map(async (a, j): Promise<CommentAsk> => {
            const c = i + j < GOOGLE_LOOKUPS ? await deps.googleComment(a).catch(() => null) : null;
            const person = personOf(a.recipient);
            return {
              person,
              asker: personOf(a.asker),
              app: a.app,
              kind: a.kind,
              file: a.file,
              text: clip(c?.content ?? a.text, 220),
              day: a.day,
              link: a.link,
              ...(c ? googleStatus(c) : { status: "unknown" as const }),
            };
          })
        ))
      );
    }
  }
  return { asks: asks.filter((a) => a.person !== a.asker), gaps };
}

/** The live fetchers, for the MCP route. */
export function liveDeps(oidc: string | null): AskDeps {
  const tokens = new Map<string, Promise<string | null>>();
  return {
    figmaFiles,
    figmaMailNames,
    googleThreads,
    people: async () => {
      const byAlias = await loadPeople();
      if (!byAlias) return null;
      const aliases = new Map<string, string>();
      for (const [alias, p] of byAlias)
        if (p.kind === "person") aliases.set(fold(alias), p.canonical);
      return { aliases, canonicals: [...new Set(aliases.values())] };
    },
    figmaComments: async (fileKey) => {
      const token = process.env.FIGMA_TOKEN || process.env.FIGMA_ACCESS_TOKEN;
      if (!token) return null;
      // Plain, not `as_md`: markdown drops the "@" that marks a mention.
      const res = await fetchWithTimeout(
        `https://api.figma.com/v1/files/${encodeURIComponent(fileKey)}/comments`,
        { headers: { "X-Figma-Token": token }, timeoutMs: 10_000 }
      );
      if (!res.ok) {
        logger.warn({ status: res.status }, "brain comment asks: Figma comments unreadable");
        return null;
      }
      const body = (await res.json().catch(() => null)) as { comments?: FigmaComment[] } | null;
      return Array.isArray(body?.comments) ? body!.comments : null;
    },
    googleComment: async (ask) => {
      if (!tokens.has(ask.recipient)) {
        tokens.set(
          ask.recipient,
          getDelegatedToken(ask.recipient, DRIVE_SCOPE, Date.now(), oidc).catch(() => null)
        );
      }
      const token = await tokens.get(ask.recipient)!;
      if (!token) return null;
      const res = await fetchWithTimeout(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(ask.fileId)}/comments/` +
          `${encodeURIComponent(ask.commentId)}?fields=resolved,deleted,content,createdTime,` +
          `replies(author(me),createdTime)`,
        { headers: { Authorization: `Bearer ${token}` }, timeoutMs: 8_000 }
      );
      if (!res.ok) return null;
      return (await res.json().catch(() => null)) as GoogleComment | null;
    },
  };
}

const RANK: Record<AskStatus, number> = { open: 0, unknown: 1, answered: 2, resolved: 3, gone: 4 };

export function renderAsks(
  result: AskResult,
  person: string | null,
  includeResolved: boolean
): string {
  // A full name matches exactly; one word matches a first name, so "Marcus" finds Marcus Börner.
  const wanted = person ? fold(person) : null;
  const mine = wanted
    ? result.asks.filter(
        (a) =>
          fold(a.person) === wanted || (!wanted.includes(" ") && firstName(a.person) === wanted)
      )
    : result.asks;
  const shown = mine.filter(
    (a) => includeResolved || (a.status !== "resolved" && a.status !== "gone")
  );
  const closed = mine.length - shown.length;
  const gaps = result.gaps.length ? `\n\nNot read: ${result.gaps.join(" ")}` : "";
  if (shown.length === 0) {
    const who = person ? ` for ${person}` : "";
    return (
      (mine.length === 0
        ? `No asks in Figma or Google comments${who} in this period.`
        : mine.length === 1
          ? `Nothing open${who}: the one ask in this period is resolved or deleted.`
          : `Nothing open${who}: all ${mine.length} asks in this period are resolved or deleted.`) +
      gaps
    );
  }
  const byPerson = new Map<string, CommentAsk[]>();
  for (const a of shown) byPerson.set(a.person, [...(byPerson.get(a.person) ?? []), a]);
  const line = (a: CommentAsk) => {
    const state =
      a.status === "answered"
        ? `answered by them on ${a.answeredOn}, not resolved`
        : a.status === "unknown"
          ? "status unknown (the source could not be checked)"
          : a.status;
    return (
      `- ${a.day} ${a.app} · ${a.file} · ${a.asker}${a.kind === "action item" ? " (action item)" : ""}: ` +
      `"${a.text}"${a.context ? ` (on: "${a.context}")` : ""} → ${state} ${a.link}`
    );
  };
  const open = (list: CommentAsk[]) => list.filter((a) => a.status === "open").length;
  const blocks = [...byPerson.entries()]
    .sort((a, b) => open(b[1]) - open(a[1]))
    .map(([who, list]) => {
      const sorted = [...list].sort(
        (a, b) => RANK[a.status] - RANK[b.status] || b.day.localeCompare(a.day)
      );
      return `${who}: ${open(list)} open of ${list.length} shown\n${sorted.map(line).join("\n")}`;
    });
  // What was not read goes first: a long list can hit the gateway's size ceiling, and the
  // end is what a ceiling cuts.
  return (
    (gaps ? `${gaps.trim()}\n\n` : "") +
    blocks.join("\n\n") +
    (closed > 0 ? `\n\nResolved or deleted, left out: ${closed}.` : "") +
    "\n\nFigma comes live from its API (every file whose link was shared somewhere the brain reads); Google Docs " +
    'comes from each person\'s notification emails, checked live against Drive. "Answered" means the person asked ' +
    "replied in the thread but nobody resolved it."
  );
}
