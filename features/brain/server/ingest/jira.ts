import { fetchWithTimeout } from "@shared/http/fetch-with-timeout";
import logger from "@shared/observability/logger";
import { sweepStale, upsertChunks, type BrainRow, type IngestResult } from "./upsert";

/**
 * Jira issues into the company-brain corpus.
 *
 * JIRA CLOUD v3 SEARCH IS NOT WHAT MOST EXAMPLES SHOW. `GET/POST
 * /rest/api/3/search` was deprecated in Oct 2024 and now answers 410 Gone. The
 * live endpoint is POST /rest/api/3/search/jql, it paginates on an opaque
 * `nextPageToken` rather than `startAt`, and it returns NO fields unless you ask
 * for them explicitly.
 *
 * DESCRIPTIONS ARE NOT TEXT. In API v3 `fields.description` is Atlassian Document
 * Format — nested JSON — so it must be flattened before indexing. Storing the raw
 * JSON would fill the corpus with structural keywords ("paragraph", "content")
 * that match every query.
 */

const PROJECTS = ["GROW", "SCRUM", "SHOWUP"];
const PAGE_SIZE = 100;
const SOURCE = "jira";

/** ~1,034 issues is 11 pages; the ceiling stops a bad JQL walking forever. */
const MAX_PAGES = 30;

const FIELDS = [
  "summary",
  "description",
  "status",
  "issuetype",
  "priority",
  "labels",
  "assignee",
  "reporter",
  "created",
  "updated",
  "resolution",
  "project",
];

interface JiraIssue {
  key?: string;
  fields?: Record<string, unknown>;
}

/**
 * Flatten Atlassian Document Format to plain text, collecting every `text` node
 * and breaking at block boundaries so paragraphs and list items do not run
 * together into one unreadable line.
 */
export function adfToText(node: unknown, depth = 0): string {
  if (node == null || depth > 20) return "";
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map((n) => adfToText(n, depth + 1)).join("");

  if (typeof node !== "object") return "";
  const n = node as Record<string, unknown>;
  if (typeof n.text === "string") return n.text;

  const inner = adfToText(n.content, depth + 1);
  const type = typeof n.type === "string" ? n.type : "";
  if (["paragraph", "heading", "listItem", "blockquote", "codeBlock", "rule"].includes(type)) {
    return `${inner}\n`;
  }
  return inner;
}

/**
 * A Jira project's KEY ("GROW"), not its display name ("Growth").
 *
 * `named()` below returns `.name`, and `PROJECTS` is a list of keys — so
 * scoping the sweep on `meta.project` would compare names against keys, match
 * nothing, and silently disable the sweep. That is exactly what the comment
 * next to the sweep used to recommend.
 */
function projectKeyOf(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const v = value as { key?: unknown };
  return typeof v.key === "string" ? v.key : null;
}

function named(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const v = value as { name?: unknown; displayName?: unknown };
  if (typeof v.name === "string") return v.name;
  if (typeof v.displayName === "string") return v.displayName;
  return null;
}

/** Matches upsert.ts MAX_BODY_CHARS; the notice must fit INSIDE the ceiling. */
const JIRA_BODY_LIMIT = 2400;

function truncationNotice(body: string): string {
  if (body.length <= JIRA_BODY_LIMIT) return body;
  const notice = "\n\n[…description truncated — open the ticket for the rest]";
  return body.slice(0, JIRA_BODY_LIMIT - notice.length) + notice;
}

export function toRow(issue: JiraIssue, baseUrl: string, stampedAt: string): BrainRow | null {
  const key = issue.key;
  const f = issue.fields ?? {};
  const summary = typeof f.summary === "string" ? f.summary : "";
  if (!key || !summary) return null;

  const description = adfToText(f.description).trim();
  const status = named(f.status);
  const issueType = named(f.issuetype);
  const assignee = named(f.assignee);
  const labels = Array.isArray(f.labels) ? f.labels.filter((l) => typeof l === "string") : [];

  // Status lives in the BODY, not only in metadata, so "which tickets are still
  // open about X" is answerable from text retrieval without a structured query.
  const header = [
    status ? `Status: ${status}` : null,
    issueType ? `Type: ${issueType}` : null,
    assignee ? `Assignee: ${assignee}` : null,
    labels.length ? `Labels: ${labels.join(", ")}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return {
    source: SOURCE,
    source_id: key,
    title: `${key}: ${summary}`,
    url: `${baseUrl}/browse/${key}`,
    // `clean()` hard-truncates at 2400 chars. Docs and commits are SPLIT into
    // several chunks instead, so nothing is lost; one row per issue means a long
    // description loses its tail — often exactly the acceptance criteria or the
    // final decision that answers "what did we decide on X". Splitting Jira
    // properly belongs with enabling Jira; until then the cut is at least
    // announced, and the ticket URL is right there in the citation.
    body: truncationNotice([summary, header, description].filter(Boolean).join("\n\n")),
    meta: {
      key,
      status,
      type: issueType,
      assignee,
      reporter: named(f.reporter),
      labels,
      project: named(f.project),
      // The key as well as the name: the sweep scopes on this, and PROJECTS is
      // a list of keys. See projectKeyOf.
      projectKey: projectKeyOf(f.project),
      created: typeof f.created === "string" ? f.created : null,
      updated: typeof f.updated === "string" ? f.updated : null,
      resolution: named(f.resolution),
    },
    updated_at: stampedAt,
    // The issue's own last-updated date, so a recently-touched ticket outranks a
    // stale one on a tie rather than being ordered arbitrarily.
    period_end: typeof f.updated === "string" ? f.updated.slice(0, 10) : null,
  };
}

export async function ingestJira(
  stampedAt: string,
  isOutOfTime: () => boolean
): Promise<IngestResult> {
  const baseUrl = process.env.JIRA_BASE_URL?.replace(/\/+$/, "");
  const email = process.env.JIRA_EMAIL;
  const token = process.env.JIRA_API_TOKEN;

  if (!baseUrl || !email || !token) {
    return { source: SOURCE, rows: 0, swept: 0, skipped: "jira-not-configured" };
  }

  const auth = Buffer.from(`${email}:${token}`).toString("base64");
  // ORDER BY key, NOT `updated DESC`. With a recency sort, an issue on a
  // not-yet-fetched page that someone edits mid-walk jumps to page 1 — already
  // consumed — so it is never re-emitted, keeps the PREVIOUS run's `updated_at`,
  // and `sweepStale` deletes it. The most actively worked ticket was the one most
  // likely to silently vanish from the corpus. `key` is immutable, so pagination
  // over it is stable. (Losing the recency ordering costs nothing: a run cut short
  // by the time budget does not sweep at all.)
  const jql = `project in (${PROJECTS.join(", ")}) ORDER BY key ASC`;

  let nextPageToken: string | null = null;
  let pages = 0;
  let written = 0;
  let completed = false;

  do {
    if (isOutOfTime()) {
      logger.info({ pages, written }, "brain-ingest jira: time budget reached, deferring rest");
      break;
    }

    const res = await fetchWithTimeout(`${baseUrl}/rest/api/3/search/jql`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        jql,
        fields: FIELDS,
        maxResults: PAGE_SIZE,
        ...(nextPageToken ? { nextPageToken } : {}),
      }),
      timeoutMs: 10_000,
    });

    if (!res.ok) {
      throw new Error(`Jira search failed: ${res.status}`);
    }

    const page = (await res.json()) as {
      issues?: JiraIssue[];
      nextPageToken?: string | null;
      isLast?: boolean;
    };

    const rows = (page.issues ?? [])
      .map((i) => toRow(i, baseUrl, stampedAt))
      .filter((r): r is BrainRow => r !== null);
    written += await upsertChunks(rows);

    nextPageToken = page.nextPageToken ?? null;
    pages += 1;
    // `isLast` is the documented signal; a missing token is the fallback.
    if (page.isLast === true || !nextPageToken) completed = true;
  } while (nextPageToken && pages < MAX_PAGES);

  /**
   * Only sweep after walking the whole result set. Sweeping a run cut short by
   * the time budget would delete every issue the run never reached.
   *
   * NOT SCOPED, and deliberately left that way for now. Every other sweep in
   * this directory now passes `scopeKey` + `walkedScopes` so that a scope the
   * run could not see reads as history rather than as deleted rows — gmail by
   * mailbox, drive by owner, notion by database, slack by channel, calendar by
   * mailbox. Jira has the same shape and already writes `project` into meta, so
   * the guard is four lines.
   *
   * Scoped on the project KEY, and the distinction is the whole point: an
   * earlier note here recommended `scopeKey: "project"` with
   * `walkedScopes: new Set(PROJECTS)`, which would have been wrong.
   * `meta.project` holds the display NAME ("Growth") while PROJECTS holds keys
   * ("GROW"), so that filter would have matched nothing and silently disabled
   * the sweep — the failure mode is a sweep that never deletes, which looks
   * exactly like a sweep with nothing to do.
   *
   * Wired now rather than left as a note because the source is EMPTY: zero jira
   * rows, so adding `projectKey` to meta costs no rewrite and needs no builder
   * bump. Doing it later would.
   *
   * PROJECTS is a hardcoded list, so removing a project from it deletes that
   * project's issues. That may well be what you want; it should be a decision
   * rather than a surprise.
   */
  const swept = completed
    ? await sweepStale(SOURCE, stampedAt, written, {
        scopeKey: "projectKey",
        walkedScopes: new Set(PROJECTS),
      })
    : 0;

  // A run cut short by the time budget returned `{rows: 0, swept: 0}` with no
  // `skipped` and no `error` — indistinguishable from a clean no-op, and Jira is
  // the ONLY source given the budget, so it is the one that gets starved. Naming
  // it means the cron's skip alert fires instead of reporting success.
  if (!completed && written === 0) {
    return { source: SOURCE, rows: 0, swept: 0, skipped: "jira-time-budget" };
  }
  return { source: SOURCE, rows: written, swept };
}
