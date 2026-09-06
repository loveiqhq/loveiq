import { supabaseFetch } from "@features/admin/server/supabase";
import { fetchWithTimeout } from "@shared/http/fetch-with-timeout";
import {
  DIRECTORY_SCOPE,
  getDelegatedToken,
  getGoogleAccessToken,
  googleCredentialShape,
  GMAIL_SCOPE,
} from "@shared/http/google-oauth";
import logger from "@shared/observability/logger";
import { splitBody } from "./notion";
import {
  chunkPage,
  recordSweep,
  shouldSweep,
  sweepMissing,
  upsertChunks,
  type BrainRow,
  type IngestResult,
} from "./upsert";

/**
 * Company email.
 *
 * Where a startup's decisions and relationships actually live: investor threads,
 * customer replies, the supplier who said yes, the thing agreed at 11pm that never
 * reached Notion. The repo has the result, Slack has the argument, and email has
 * everything said to the outside world.
 *
 * ONE CHUNK PER THREAD, not per message — the same reasoning as Slack days. A reply
 * saying "yes, agreed, let's do the 39.99" is meaningless without the message above
 * it, and a thread is the unit somebody actually asks about.
 */

const SOURCE = "gmail";
const API = "https://gmail.googleapis.com/gmail/v1/users";
const TIMEOUT_MS = 20_000;
const PAGE_SIZE = 100;
/**
 * 40 x 100 = 4,000 threads per mailbox. At 20 the first real walk stopped at
 * exactly 2,000 and reported `gmail-walk-incomplete`, which is honest but means
 * the oldest mail is never reached. ec@loveiq.org holds 2,650 threads before
 * filtering.
 */
const MAX_PAGES = 40;

/**
 * A SINGLE-message thread this short is a notification stub, not a conversation.
 *
 * Measured: the "Your secure link to Claude.ai is here" mails reduce to a body of
 * "96" and whitespace — the link lives in HTML that the plain part does not carry,
 * so nothing useful survives (and nothing sensitive is stored either: verified zero
 * URLs in the indexed body). Dozens of those crowd the corpus while being unable to
 * answer anything.
 *
 * The single-message condition is load-bearing. A first attempt tested the whole
 * thread's length and threw away a genuine two-line exchange — "Should we go to
 * 39.99?" / "Yes." — which is short, decisive, and exactly the kind of thing the
 * brain exists to remember. A reply means a human engaged; length is only evidence
 * when nobody did.
 */
const MIN_STUB_CHARS = 60;
/**
 * How many individual thread fetches may fail before the whole walk is called
 * incomplete.
 *
 * One flaky thread out of ~3,900 used to mark the entire walk incomplete, which
 * blocks the sweep — so `brain-gmail` had never once completed and deleted threads
 * lingered forever. A 404 on a single thread is normal: it can be deleted between
 * the listing and the fetch. A systemic failure is different in KIND, and shows up
 * as many failures, not one.
 */
const MAX_TOLERATED_THREAD_FAILURES = 25;

/** Bump when the row SHAPE changes; a mismatch counts as stale. See notion.ts. */
// v2: v1 indexed notification stubs (bodies of "96" and whitespace) as threads.
export const GMAIL_BUILDER_VERSION = 3;

/**
 * Mailboxes to read. `me` is whoever the credential belongs to.
 *
 * Reading a COLLEAGUE's mailbox needs Workspace domain-wide delegation — a user
 * OAuth token only ever reaches its own mail, whatever scope it carries. Listing
 * them here rather than hardcoding `me` means turning that on later is config, not
 * a rewrite.
 */
export function mailboxes(): string[] {
  const configured = (process.env.GMAIL_MAILBOXES ?? "").trim();
  if (!configured) return ["me"];
  return configured
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
}

/**
 * Mailboxes to leave out, whatever the directory says.
 *
 * The directory drops a person when their account is SUSPENDED, which is the right
 * default but not the only case: a colleague can leave with their account still live
 * during handover, and their mail can simply not be wanted in the corpus. This is the
 * switch for that, and it is deliberately an ENV VAR rather than a constant — the
 * repository is public, and a list of named individuals whose mail the company chose
 * not to read does not belong in it. It also means the decision can be changed without
 * a deploy.
 *
 * Excluding a mailbox does NOT remove what is already indexed. `sweepMissing` keeps
 * rows from any mailbox this run did not walk — see the keep-set in `ingestGmail` — so
 * an excluded mailbox's history is preserved rather than quietly deleted. Removing it
 * is a separate, deliberate act.
 */
export function excludeMailboxes(boxes: string[]): string[] {
  const raw = (process.env.GMAIL_EXCLUDE_MAILBOXES ?? "").trim();
  if (!raw) return boxes;
  const drop = new Set(
    raw
      .split(",")
      .map((m) => m.trim().toLowerCase())
      .filter(Boolean)
  );
  const kept = boxes.filter((m) => !drop.has(m.trim().toLowerCase()));
  if (kept.length !== boxes.length) {
    logger.info(
      { excluded: boxes.length - kept.length, walking: kept.length },
      "brain-ingest gmail: mailboxes excluded by configuration"
    );
  }
  return kept;
}

/**
 * Every active person in the Workspace domain, asked of the directory itself.
 *
 * Preferred over a hand-maintained `GMAIL_MAILBOXES` list because that list goes
 * stale the moment somebody joins or leaves — silently, since a missing mailbox
 * looks exactly like a quiet one. Suspended and archived accounts are excluded by
 * the query; a departed colleague's mail stays in the corpus as history but stops
 * being re-read.
 *
 * Needs `admin.directory.user.readonly` on the SAME domain-wide delegation grant,
 * and an admin `subject` to ask as — the directory refuses an ordinary user.
 * Returns null when unavailable, which the caller reads as "fall back to the
 * configured list" rather than "the company has no staff".
 */
export async function domainMailboxes(oidcToken?: string | null): Promise<string[] | null> {
  const admin = (process.env.GOOGLE_WORKSPACE_ADMIN ?? "").trim();
  const domain = (process.env.GOOGLE_WORKSPACE_DOMAIN ?? "").trim();
  /**
   * BOTH of these used to return null in silence, which is why a real outage was
   * invisible: the caller falls back to a single mailbox, that mailbox belongs to
   * a service account with no Gmail, and the API answers 400 "Precondition check
   * failed" — three steps away from the actual cause. Only the directory LISTING
   * refusal logged, and that is the one case that was not happening.
   */
  if (!admin || !domain) {
    logger.warn(
      { hasAdmin: Boolean(admin), hasDomain: Boolean(domain) },
      "brain-ingest gmail: workspace admin/domain not configured, so only one mailbox is reachable"
    );
    return null;
  }

  const token = await getDelegatedToken(admin, DIRECTORY_SCOPE, Date.now(), oidcToken);
  if (!token) {
    logger.warn(
      { admin, credential: googleCredentialShape(oidcToken) },
      "brain-ingest gmail: could not mint a delegated token for the workspace admin — " +
        "domain-wide delegation is not working, so no colleague's mail is reachable"
    );
    return null;
  }

  const out: string[] = [];
  let pageToken = "";
  for (let page = 0; page < 10; page++) {
    const res = await fetchWithTimeout(
      "https://admin.googleapis.com/admin/directory/v1/users" +
        `?domain=${encodeURIComponent(domain)}&maxResults=200&query=isSuspended=false` +
        (pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""),
      { headers: { Authorization: `Bearer ${token}` }, timeoutMs: TIMEOUT_MS }
    );
    if (!res.ok) {
      logger.warn(
        { status: res.status, detail: (await res.text().catch(() => "")).slice(0, 200) },
        "brain-ingest gmail: directory listing refused"
      );
      return out.length > 0 ? out : null;
    }
    const json = (await res.json().catch(() => ({}))) as {
      users?: Array<{ primaryEmail?: string; archived?: boolean; suspended?: boolean }>;
      nextPageToken?: string;
    };
    for (const u of json.users ?? []) {
      if (u.primaryEmail && !u.archived && !u.suspended) out.push(u.primaryEmail);
    }
    pageToken = json.nextPageToken ?? "";
    if (!pageToken) break;
  }
  return out;
}

/**
 * What NOT to index, as a Gmail search query.
 *
 * Promotions, social and forums are Google's own noise buckets and are almost
 * entirely newsletters and marketing. Spam and trash are self-explanatory. Chats is
 * Google Chat history, which is not email.
 *
 * Deliberately NOT excluded: automated mail from Stripe, Vercel and the like. A
 * payment receipt or a failed-deploy notice is real company history, and the team
 * frequently replies to those threads — which is exactly the content that would be
 * lost by filtering on sender.
 */
const EXCLUDE =
  "-in:spam -in:trash -in:chats -category:promotions -category:social -category:forums";

interface GmailHeader {
  name?: string;
  value?: string;
}
interface GmailPart {
  mimeType?: string;
  filename?: string;
  body?: { data?: string; size?: number };
  parts?: GmailPart[];
}
interface GmailMessage {
  id?: string;
  internalDate?: string;
  labelIds?: string[];
  payload?: GmailPart & { headers?: GmailHeader[] };
}
interface GmailThread {
  id?: string;
  historyId?: string;
  messages?: GmailMessage[];
}

async function gmailGet(
  token: string,
  mailbox: string,
  path: string
): Promise<Record<string, unknown> | null> {
  const res = await fetchWithTimeout(`${API}/${encodeURIComponent(mailbox)}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    timeoutMs: TIMEOUT_MS,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    // A missing scope is configuration, not an outage, and naming it turns a dead
    // end into a one-line fix.
    logger.warn(
      { path, status: res.status, detail: body.slice(0, 200) },
      "brain-ingest gmail: api refused"
    );
    return null;
  }
  return (await res.json().catch(() => null)) as Record<string, unknown> | null;
}

const header = (m: GmailMessage, name: string): string =>
  (m.payload?.headers ?? []).find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? "";

/** Gmail encodes bodies as base64url, and omits padding. */
function decode(data: string): string {
  const b64 = data.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(b64, "base64").toString("utf8");
}

/**
 * Plain text out of a MIME tree.
 *
 * Prefers `text/plain`; falls back to stripping tags from `text/html`, because a
 * good share of real mail — anything sent from a phone or a marketing tool — has no
 * plain part at all, and skipping those would silently lose whole conversations.
 */
export function messageText(part?: GmailPart): string {
  if (!part) return "";
  if (part.mimeType === "text/plain" && part.body?.data) return decode(part.body.data);

  if (Array.isArray(part.parts)) {
    for (const p of part.parts) {
      const t = messageText(p);
      if (t.trim()) return t;
    }
  }
  if (part.mimeType === "text/html" && part.body?.data) {
    return decode(part.body.data)
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"');
  }
  return "";
}

/**
 * Strip the quoted copy of the previous message.
 *
 * Without this every reply carries the whole thread beneath it, so a ten-message
 * thread is stored ten times over — the body limit then truncates the actual new
 * text in favour of quoted history, and search matches the same sentence in ten
 * chunks.
 */
export function stripQuoted(text: string): string {
  const cut = text.search(
    /\n\s*(On .{0,120}wrote:|-{2,} ?Original Message ?-{2,}|_{10,}|From: .{0,120}\n(Sent|To):)/
  );
  const body = cut > 0 ? text.slice(0, cut) : text;
  return body
    .split("\n")
    .filter((l) => !/^\s*>/.test(l))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Is this thread BULK MAIL rather than a conversation?
 *
 * `List-Unsubscribe` is the honest signal: RFC 2369 requires it on mail sent to a
 * list, and no human replying from a mail client emits it. Everything else we could
 * reach for is a guess about wording or sender names.
 *
 * `every`, not `some`, and that is the whole subtlety: a newsletter that somebody
 * FORWARDED and the team then argued about is a real conversation, and the replies
 * carry no such header. Requiring it on every message lets those threads back out
 * of the penalty box, while a plain untouched newsletter -- always a single message
 * -- still matches.
 *
 * Rejected alternative, measured: "did anyone reply" (`messages > 1`). JIRA
 * notification threads accumulate messages, so it promoted ticket spam above the
 * actual commits.
 */
export function isBulkMail(msgs: GmailMessage[]): boolean {
  return msgs.length > 0 && msgs.every((m) => header(m, "List-Unsubscribe") !== "");
}

/** A person, without the angle-bracket noise: "Marcus <m@x.com>" -> "Marcus". */
export function person(addr: string): string {
  const named = /^\s*"?([^"<]+?)"?\s*</.exec(addr);
  if (named?.[1]) return named[1].trim();
  return addr.replace(/[<>]/g, "").trim();
}

export function threadToRows(thread: GmailThread, mailbox: string, stampedAt: string): BrainRow[] {
  const msgs = (thread.messages ?? []).filter((m) => m.payload);
  if (!thread.id || msgs.length === 0) return [];

  const first = msgs[0]!;
  const subject = header(first, "Subject").trim() || "(no subject)";
  const last = msgs[msgs.length - 1]!;
  const when = Number(last.internalDate ?? first.internalDate ?? 0);
  const day = when ? new Date(when).toISOString().slice(0, 10) : null;

  const lines: string[] = [];
  for (const m of msgs) {
    const from = person(header(m, "From"));
    const date = Number(m.internalDate ?? 0);
    const stamp = date ? new Date(date).toISOString().slice(0, 10) : "";
    const text = stripQuoted(messageText(m.payload));
    if (!text) continue;
    lines.push(`${from}${stamp ? ` (${stamp})` : ""}: ${text}`);
  }
  if (lines.length === 0) return [];
  const joined = lines.join(" ").replace(/\s+/g, " ").trim();
  if (lines.length === 1 && joined.length < MIN_STUB_CHARS) return [];

  const participants = [
    ...new Set(
      msgs.flatMap((m) => [header(m, "From"), header(m, "To")].filter(Boolean).map(person))
    ),
  ].slice(0, 8);

  const title = `Email: ${subject}`;
  const base: BrainRow = {
    source: SOURCE,
    source_id: `thread:${thread.id}`,
    title,
    url: `https://mail.google.com/mail/u/0/#all/${thread.id}`,
    body: [title, `Between: ${participants.join(", ")}`, "", ...lines].join("\n"),
    meta: {
      kind: "gmail-thread",
      v: GMAIL_BUILDER_VERSION,
      mailbox,
      messages: msgs.length,
      participants,
      // Bulk mail is still INDEXED -- open culture, nothing excluded -- it just
      // must not outrank a colleague's actual answer on a vague question.
      bulk: isBulkMail(msgs),
      // Gmail's own change cursor: a thread whose historyId has not moved has not
      // been replied to, so it never needs refetching.
      historyId: thread.historyId ?? null,
    },
    updated_at: stampedAt,
    period_end: day,
  };

  const parts = splitBody(base.body);
  return parts.map((body, i) =>
    i === 0
      ? { ...base, body }
      : {
          ...base,
          source_id: `${base.source_id}#${i + 1}`,
          title: `${title} (part ${i + 1} of ${parts.length})`,
          body,
          meta: { ...base.meta, part: i + 1, parts: parts.length },
        }
  );
}

/**
 * source_id -> what we already hold for it.
 *
 * `current` is false when the row was built by an older builder version. Such a row
 * must never be TOUCHED: touching says "this is still correct", so a chunk that the
 * current rules would no longer produce — a notification stub, under v2 — would be
 * confirmed forever and never fall to the sweep. Measured: 30 stub threads survived
 * the v2 rebuild exactly this way.
 */
async function knownThreads(): Promise<
  Map<string, { historyId: string | null; current: boolean; mailbox: string | null }>
> {
  const out = new Map<
    string,
    { historyId: string | null; current: boolean; mailbox: string | null }
  >();
  for (let offset = 0; offset < 100_000; offset += 1000) {
    const res = await supabaseFetch(
      `/rest/v1/brain_chunk?select=source_id,meta&source=eq.${SOURCE}` +
        `&order=source_id.asc&limit=1000&offset=${offset}`
    );
    // Fails closed on an unreadable status AND on an unreadable body. See chunkPage.
    const batch = await chunkPage<{
      source_id?: string;
      meta?: { historyId?: string | null; v?: number; mailbox?: string | null } | null;
    }>("gmail", res);
    for (const r of batch) {
      if (!r.source_id) continue;
      const current = r.meta?.v === GMAIL_BUILDER_VERSION;
      out.set(r.source_id, {
        historyId: current ? (r.meta?.historyId ?? null) : null,
        current,
        mailbox: typeof r.meta?.mailbox === "string" ? r.meta.mailbox : null,
      });
    }
    if (batch.length < 1000) break;
  }
  return out;
}

export async function ingestGmail(
  stampedAt: string,
  isOutOfTime: () => boolean = () => false,
  oidcToken?: string | null
): Promise<IngestResult> {
  if (isOutOfTime()) {
    // Never started, which is not the same as started and truncated — and with a
    // bare `skipped` the two were indistinguishable in `cron_run`.
    return {
      source: SOURCE,
      rows: 0,
      swept: 0,
      skipped: "gmail-time-budget",
      complete: false,
      detail: "stopped=time-budget@before-walk",
    };
  }
  const own = await getGoogleAccessToken(Date.now(), oidcToken);
  if (!own) {
    return {
      source: SOURCE,
      rows: 0,
      swept: 0,
      skipped: "google-token-unavailable",
      complete: false,
      detail: `stopped=no-own-token credential=${googleCredentialShape(oidcToken)}`,
    };
  }

  /**
   * A token PER MAILBOX. `me` uses the credential's own token; a named address
   * needs a delegated one, because a user OAuth token reaches only its own mail
   * whatever scope it carries.
   *
   * Minted once per mailbox rather than per request — each one costs a signJwt and
   * a token exchange, and at ~2,400 threads that would otherwise be thousands of
   * round trips.
   */
  const tokenFor = async (mailbox: string): Promise<string | null> =>
    mailbox === "me" ? own : getDelegatedToken(mailbox, GMAIL_SCOPE, Date.now(), oidcToken);

  /**
   * Ask the directory who works here; fall back to the configured list. An empty
   * or failed directory answer must NOT be read as "nobody works here" — that
   * would list no mailboxes, write nothing, and let the sweep delete the corpus.
   */
  const discovered = await domainMailboxes(oidcToken);
  const boxes = excludeMailboxes(discovered && discovered.length > 0 ? discovered : mailboxes());

  const known = await knownThreads();
  const rows: BrainRow[] = [];
  const seen = new Set<string>();
  let complete = true;
  /**
   * WHICH of the six ways to stop actually happened, first one wins.
   *
   * `complete=false` alone is not a diagnosis, and for gmail that mattered:
   * `brain_sweep_state` has no gmail row at all, so the walk has NEVER completed —
   * yet every hourly run recorded `success` with an empty `error_message`, because
   * `gmail-walk-in-progress` is a deliberate skip. Six different faults all looked
   * identical from SQL, and the one line that could tell them apart went only to a
   * log stream that cannot be queried after the fact.
   */
  let stopReason = "";
  const stop = (why: string) => {
    complete = false;
    if (!stopReason) stopReason = why;
  };
  /**
   * WHY the walk is incomplete decides whether anyone should be woken up.
   *
   * Running out of page budget is expected and self-healing: the next run picks up
   * where this one stopped. A mailbox we cannot get a token for, a listing Gmail
   * refuses, or thread fetches failing en masse are faults that will not fix
   * themselves. Both suppress the sweep; only the second kind should alert.
   */
  let degraded = false;
  let fetched = 0;

  const failedMailboxes: string[] = [];
  /** Threads we listed but could not re-read this run. Protected from the sweep. */
  const failedThreads = new Set<string>();

  for (const mailbox of boxes) {
    const token = await tokenFor(mailbox);
    if (!token) {
      // One unreachable mailbox must not fail the others, and must not let the
      // sweep run as if that person's mail had been deleted.
      logger.warn({ mailbox }, "brain-ingest gmail: no token for this mailbox, skipping it");
      failedMailboxes.push(mailbox);
      stop(`no-token@${mailbox}`);
      degraded = true; // a mailbox we cannot reach will not fix itself
      continue;
    }
    let pageToken = "";
    for (let page = 0; page < MAX_PAGES; page++) {
      if (isOutOfTime()) {
        stop(`time-budget@${mailbox}:p${page}`);
        break;
      }
      const listed = await gmailGet(
        token,
        mailbox,
        `/threads?maxResults=${PAGE_SIZE}&q=${encodeURIComponent(EXCLUDE)}` +
          (pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : "")
      );
      if (!listed) {
        stop(`listing-refused@${mailbox}:p${page}`);
        degraded = true; // Gmail refused the listing -- the 2026-08-30 outage shape
        break;
      }
      const threads = (listed.threads as GmailThread[]) ?? [];

      for (const t of threads) {
        if (!t.id) continue;
        const id = `thread:${t.id}`;
        seen.add(id);
        // Gmail's historyId moves whenever a thread changes, so an unchanged
        // thread costs one listing entry and no fetch at all.
        const have = known.get(id);
        if (have?.current && have.historyId && have.historyId === t.historyId) continue;
        if (isOutOfTime()) {
          stop(`time-budget@${mailbox}:p${page}:mid-page`);
          break;
        }
        const full = (await gmailGet(
          token,
          mailbox,
          `/threads/${encodeURIComponent(t.id)}?format=full`
        )) as GmailThread | null;
        if (!full) {
          // NOT `complete = false`. A thread can be deleted between the listing and
          // the fetch, and one such 404 must not block the sweep for the other
          // 3,900. The id is remembered so its existing rows are protected below;
          // a systemic failure trips the threshold instead.
          failedThreads.add(id);
          continue;
        }
        fetched += 1;
        rows.push(...threadToRows(full, mailbox, stampedAt));
      }

      pageToken = (listed.nextPageToken as string) ?? "";
      if (!pageToken) break;
      if (page === MAX_PAGES - 1) stop(`page-cap@${mailbox}`);
    }
  }

  if (failedThreads.size > MAX_TOLERATED_THREAD_FAILURES) {
    logger.warn(
      { failed: failedThreads.size, limit: MAX_TOLERATED_THREAD_FAILURES },
      "brain-ingest gmail: too many thread fetches failed, treating the walk as incomplete"
    );
    stop(`thread-fetch-failures=${failedThreads.size}`);
    degraded = true; // systemic, not the one-deleted-thread case handled above
  }

  const written = await upsertChunks(rows);
  /**
   * Mailboxes this run walked — the only ones the sweep may judge.
   *
   * No need to subtract `failedMailboxes`: a mailbox we could not reach already
   * sets `complete = false`, and the sweep does not run at all on an incomplete
   * walk. Filtering here as well would be unreachable code.
   */
  const walked = new Set(boxes);
  const writtenIds = new Set(rows.map((r) => r.source_id));
  const rewritten = new Set([...writtenIds].map((id) => id.split("#")[0]));
  /**
   * NO TOUCH. Gmail is 9,074 rows, which is 91 confirm requests against a 60s
   * ceiling, and it hit the 8s per-request timeout at 11:11 on 2026-08-31. Drive,
   * larger, failed the same way three hours running. A confirm pass that cannot
   * finish inside one invocation cannot be scheduled into working.
   *
   * The list below is unchanged -- it is precisely "ids that legitimately exist and
   * must not be swept". It used to be written to; now it is simply handed to
   * `sweepMissing` as the set to keep. Same decisions, no writes.
   */
  const confirmed = ((): string[] =>
    [...known.entries()]
      .filter(([id, have]) => {
        if (writtenIds.has(id)) return false;
        const base = id.split("#")[0] ?? id;
        if (rewritten.has(base)) return false;
        /**
         * A thread we FAILED to re-read is confirmed regardless of builder version.
         * We could not look at it, so we know nothing new about it — and deleting
         * a real thread because one fetch returned 404 is far worse than carrying
         * a chunk in an older shape until the next run rewrites it.
         */
        if (failedThreads.has(base)) return true;
        /**
         * A row from a mailbox THIS WALK DID NOT COVER is not missing — it is
         * history, and the sweep has no evidence about it either way.
         *
         * `domainMailboxes` lists `isSuspended=false` users, so an offboarded
         * colleague drops off the list the day their account is suspended. Their
         * mail is then never listed, never written, and — being stale-version by
         * the next builder bump — never confirmed, so `sweepMissing` reads it as
         * deleted. Measured 2026-09-06: 232 rows across philipp.leonhard@, sk@ and
         * teamwork@ were in exactly that state, 3.3% of the source, which clears
         * the majority guard comfortably. The first walk to complete would have
         * deleted every one of them, silently, and the doc comment on
         * `domainMailboxes` promises the opposite: "a departed colleague's mail
         * stays in the corpus as history but stops being re-read."
         *
         * An unattributable row (no mailbox in `meta`) is kept for the same
         * reason — absence of evidence is not evidence of deletion.
         */
        if (!have.mailbox || !walked.has(have.mailbox)) return true;
        // Never confirm a stale-version row FROM A MAILBOX WE DID WALK. It was
        // either dropped from the source or is no longer something we would index
        // (a stub, under v2); either way it belongs to the sweep, not the keep set.
        return have.current;
      })
      .map(([id]) => id))();
  const touched = confirmed.length;

  // Sweep only a complete walk; a truncated one makes real threads look deleted.
  // Once a day, not every run -- see shouldSweep.
  const sweeping = complete && (await shouldSweep(SOURCE));
  // Recorded BEFORE the sweep: a throw after the record defers 20 hours, a throw
  // before it retried hourly forever.
  if (sweeping) await recordSweep(SOURCE);
  const swept = sweeping
    ? await sweepMissing(SOURCE, new Set([...writtenIds, ...confirmed]), {
        scopeKey: "mailbox",
      })
    : 0;

  logger.info(
    {
      mailboxes: boxes.length,
      discovered: discovered?.length ?? null,
      unreachable: failedMailboxes,
      listed: seen.size,
      fetched,
      written,
      touched,
      complete,
      degraded,
    },
    "brain-ingest gmail"
  );

  /**
   * The same facts, in the one place that can still be read tomorrow. Counts and
   * mailbox addresses only — the addresses are already all over the corpus.
   */
  const detail =
    `boxes=${boxes.length}${discovered ? "" : "(directory unavailable, fell back)"} ` +
    `listed=${seen.size} fetched=${fetched} written=${written} kept=${touched} ` +
    `swept=${swept} complete=${complete}` +
    (stopReason ? ` stopped=${stopReason}` : "") +
    (failedMailboxes.length ? ` unreachable=${failedMailboxes.join(",")}` : "");

  /**
   * ORDER MATTERS, and getting it wrong hid a total outage.
   *
   * `gmail-nothing-to-index` is a DELIBERATE skip: it reports success and never
   * alerts, because "the mailbox is empty" is not a fault. But it was checked
   * FIRST, so a run where the Gmail API refused every request — listing nothing,
   * fetching nothing, writing nothing — also matched it and reported success.
   *
   * That is exactly what happened on 2026-08-30: delegation stopped resolving
   * mailboxes, Gmail answered 400 "Precondition check failed" to every listing,
   * and the only thing keeping the failure visible was that the run still TOUCHED
   * 9,061 existing rows. The moment a builder bump stopped those touches — correct
   * behaviour, since a stale-version row must not be confirmed — the same broken
   * run started reporting success instead.
   *
   * An incomplete walk is never "nothing to index". Checking `complete` first is
   * what keeps a silent outage loud.
   */
  /**
   * But "incomplete" alone is not "broken", and treating it as such created the
   * MIRROR of the bug above.
   *
   * A builder bump re-walks ~9,000 threads, which does not fit in one 60s run. The
   * walk advances a few hundred threads per hourly run and converges over ~18 hours
   * — every one of those runs is incomplete, and every one was reporting `error`.
   * An alert that is red for 18 predictable hours cannot show a real Gmail outage
   * inside that window; the permanent red hides exactly what the loud skip existed
   * to reveal.
   *
   * Progress is the signal that separates them. A run that WROTE rows reached Gmail
   * and is converging. A run that wrote nothing AND could not finish is the outage
   * shape from 2026-08-30 — nothing listed, nothing fetched, nothing written.
   *
   * Both still skip the sweep (above), so neither can delete live threads.
   */
  if (!complete) {
    // Quiet ONLY for a budget-truncated walk that actually advanced. A truncated
    // walk that wrote nothing is a stall, not progress -- that is how a mis-set
    // time budget would otherwise defer every run forever in silence.
    // `written`, NOT `written + touched`. `touched` is derived from `known` -- the
    // rows the DATABASE already holds -- so in production it is ~9,000 whether or
    // not Gmail answered a single request, and the sum is satisfied by the corpus
    // rather than by the run. That made the loud branch reachable only while the
    // corpus was EMPTY: once, ever, after a builder bump.
    //
    // Measured live on 2026-09-06: `brain_sweep_state` has no gmail row at all, so
    // gmail has never once completed a walk -- across 24 consecutive runs in 24
    // hours, every one recorded `success` with no error. The comment above already
    // said what it wanted ("a truncated walk that wrote nothing is a stall, not
    // progress"); the expression just measured the wrong thing.
    const converging = !degraded && written > 0;
    return {
      source: SOURCE,
      rows: written + touched,
      swept,
      skipped: converging ? "gmail-walk-in-progress" : "gmail-walk-incomplete",
      complete,
      detail,
    };
  }
  if (written === 0 && touched === 0) {
    return {
      source: SOURCE,
      rows: 0,
      swept: 0,
      skipped: "gmail-nothing-to-index",
      complete,
      detail,
    };
  }
  return { source: SOURCE, rows: written + touched, swept, complete, detail };
}
