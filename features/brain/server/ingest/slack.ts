import { fetchWithTimeout } from "@shared/http/fetch-with-timeout";
import logger from "@shared/observability/logger";
import { supabaseFetch } from "@features/admin/server/supabase";
import { splitBody } from "./notion";
import {
  recordSweep,
  shouldSweep,
  sweepStale,
  touchChunks,
  upsertChunks,
  type BrainRow,
  type IngestResult,
} from "./upsert";

/**
 * Slack conversation history — the company's real decision log.
 *
 * Most of what a team agrees is never written down anywhere else: it happens in a
 * channel, in prose, with the reasoning attached. The repo has the RESULT of those
 * decisions and Notion has the tasks, but the argument only exists here.
 *
 * ONE CHUNK PER CHANNEL PER DAY, not per message. A single Slack message is
 * usually meaningless alone ("yeah agreed", "let's do the second one") — the unit
 * that answers a question is the exchange around it. Grouping by day keeps related
 * turns together, gives `period_end` something real to sort on, and stops 3,000
 * one-line chunks from crowding out every other source.
 *
 * BOT MESSAGES ARE EXCLUDED, which is why joining every public channel is safe.
 * `#commits-prod-staging` and `#prod-alerts` are almost entirely machine output,
 * and the commits are already indexed from git — 1,537 of them. Filtering on
 * authorship rather than on a channel allow-list means a human comment in an alerts
 * channel is still kept, and a new bot channel needs no configuration.
 */

const SOURCE = "slack";
const API = "https://slack.com/api";
const TIMEOUT_MS = 20_000;
const PAGE = 200;
/**
 * Per-channel history ceiling for a FULL walk: MAX_PAGES x PAGE messages. The
 * nightly pass is bounded by `oldest` instead, so this only caps a first-time or
 * rebuild walk. At 15 pages the ceiling was 3,000 and #all-loveiq already held
 * 2,575 (86%) — anything past it would have been permanently unreachable, silently.
 */
const MAX_PAGES = 50;
/** Replies are their own paginated list; 200 x 10 covers any realistic thread. */
const MAX_REPLY_PAGES = 10;
const MAX_RETRIES = 4;

/** Bump when the row SHAPE changes; a mismatch counts as stale. See notion.ts. */
// v5: v1-v4 never fetched replies under a bot parent, and truncated any thread
// past 100 replies.
// v4: v1-v3 stored Slack's HTML entities ("&amp;") rather than the typed text.
// v3: v1-v2 stored every thread reply BEFORE its parent and in reverse order.
// v2: v1 wrote days whose thread replies had been dropped by a 429 without
// recording the gap, so every v1 row must be rebuilt rather than trusted.
export const SLACK_BUILDER_VERSION = 5;

/**
 * Message subtypes that are membership bookkeeping, not conversation. Slack emits
 * "has joined the channel" as a real message with a `user`, so filtering bots alone
 * leaves a channel looking like nothing but arrivals.
 */
const NOISE_SUBTYPES = new Set([
  "channel_join",
  "channel_leave",
  "channel_topic",
  "channel_purpose",
  "channel_name",
  "channel_archive",
  "channel_unarchive",
  "bot_message",
  "bot_add",
  "bot_remove",
  "tombstone",
]);

interface SlackMessage {
  type?: string;
  subtype?: string;
  user?: string;
  bot_id?: string;
  text?: string;
  ts?: string;
  thread_ts?: string;
  reply_count?: number;
}

interface SlackChannel {
  id?: string;
  name?: string;
  is_member?: boolean;
  is_archived?: boolean;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function slackGet(
  token: string,
  path: string,
  params: Record<string, string | number>,
  isOutOfTime: () => boolean = () => false
): Promise<Record<string, unknown> | null> {
  const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString();

  let res: Response | null = null;
  // `conversations.replies` is Slack Tier 3 (~50/min) and a busy channel trips it
  // within seconds. Discarding the page on 429 silently drops a whole thread while
  // the run still reports success, so honour Retry-After instead — it is the one
  // status where the server has told us exactly how to succeed.
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    res = await fetchWithTimeout(`${API}/${path}?${qs}`, {
      headers: { Authorization: `Bearer ${token}` },
      timeoutMs: TIMEOUT_MS,
    });
    if (res.status !== 429) break;
    if (attempt === MAX_RETRIES) {
      logger.warn({ path, attempts: attempt + 1 }, "brain-ingest slack: rate limited, giving up");
      return null;
    }
    const wait = Math.min(Number(res.headers.get("retry-after") ?? "2") || 2, 30);
    // NEVER SLEEP PAST THE DEADLINE. Slack's Retry-After can be 30s, and honouring
    // it blindly turned a 4-second pass into 40 and blew the cron's budget — one
    // rate-limited thread could eat the whole run. Giving up here is cheap: the
    // caller records a thread gap and the next run repairs that day.
    if (isOutOfTime()) {
      logger.warn({ path }, "brain-ingest slack: rate limited with no clock left, deferring");
      return null;
    }
    await sleep(wait * 1000);
  }
  if (!res || !res.ok) {
    logger.warn({ path, status: res?.status }, "brain-ingest slack: http error");
    return null;
  }
  const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!json?.ok) {
    // `missing_scope` is configuration, not an outage, and naming the scope turns a
    // dead end into a one-line fix.
    logger.warn(
      { path, error: json?.error, needed: json?.needed },
      "brain-ingest slack: api refused"
    );
    return null;
  }
  return json;
}

/** display name per user id, so a chunk reads "Marcus: …" not "<@U0B…>: …". */
async function userNames(token: string): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  let cursor = "";
  for (let page = 0; page < 5; page++) {
    const json = await slackGet(token, "users.list", { limit: 200, ...(cursor ? { cursor } : {}) });
    // Needs `users:read`. Without it every mention stays a raw id, which is
    // legible but much less useful — so this degrades rather than failing.
    if (!json) return out;
    for (const m of (json.members as Array<Record<string, unknown>>) ?? []) {
      const id = m.id as string | undefined;
      const profile = (m.profile ?? {}) as Record<string, unknown>;
      const name =
        (profile.real_name as string) || (profile.display_name as string) || (m.name as string);
      if (id && name) out.set(id, name);
    }
    cursor = ((json.response_metadata as Record<string, string>) ?? {}).next_cursor ?? "";
    if (!cursor) break;
  }
  return out;
}

export function renderMessage(
  m: SlackMessage,
  names: Map<string, string>,
  indent = false
): string | null {
  if (m.bot_id || !m.user) return null;
  if (m.subtype && NOISE_SUBTYPES.has(m.subtype)) return null;
  const text = (m.text ?? "").trim();
  if (!text) return null;

  // Rewrite <@Uxxxx> mentions inline too — a message about a person is only
  // searchable by that person's name if the name is actually in the text.
  const body = text
    .replace(/<@([A-Z0-9]+)>/g, (_, id: string) => `@${names.get(id) ?? id}`)
    // Slack escapes exactly these three in message text, so storing the raw string
    // put "&amp;" in the corpus where the author typed "&".
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
  const who = names.get(m.user) ?? m.user;
  return `${indent ? "  ↳ " : ""}${who}: ${body}`;
}

/**
 * Midnight UTC on `day`, in Slack's timestamp format.
 *
 * Slack rejects a bare integer with `invalid_ts_oldest` — it wants the seconds.
 * microseconds form its own `ts` values use. Getting this wrong makes
 * `conversations.history` fail for the whole channel, which is silent apart from
 * the completeness flag.
 */
export function slackTs(day: string): string {
  const ms = Date.parse(`${day}T00:00:00Z`);
  // Never hand Slack a NaN: it answers `invalid_ts_oldest` and the caller loses the
  // whole channel with nothing but a warn to show for it.
  if (!Number.isFinite(ms)) return "";
  return `${Math.floor(ms / 1000)}.000000`;
}

/** UTC date of a Slack timestamp ("1787941701.811139"). */
export function tsDate(ts: string): string {
  return new Date(Number(ts.split(".")[0]) * 1000).toISOString().slice(0, 10);
}

export function dayToRows(
  channel: string,
  day: string,
  lines: string[],
  stampedAt: string,
  threadsComplete = true
): BrainRow[] {
  if (lines.length === 0) return [];
  const title = `Slack #${channel} — ${day}`;
  const base: BrainRow = {
    source: SOURCE,
    source_id: `ch:${channel}:${day}`,
    title,
    url: null,
    body: [title, ...lines].join("\n"),
    meta: {
      kind: "slack-day",
      v: SLACK_BUILDER_VERSION,
      channel,
      day,
      messages: lines.length,
      // False when a reply fetch was rate-limited away. A past day is otherwise
      // skipped forever on later runs, so without this flag a thread lost to one
      // 429 would never come back.
      threadsComplete,
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

/** source_id -> whether that day's threads were fully fetched last time. */
async function knownSlackDays(): Promise<Map<string, boolean>> {
  const out = new Map<string, boolean>();
  for (let offset = 0; offset < 50_000; offset += 1000) {
    const res = await supabaseFetch(
      `/rest/v1/brain_chunk?select=source_id,meta&source=eq.${SOURCE}&order=source_id.asc&limit=1000&offset=${offset}`
    );
    if (!res.ok) {
      /**
       * FAIL CLOSED, and loudly. Returning an empty map reads as "nothing is
       * indexed": every existing row is then neither written nor confirmed, and the
       * sweep in this same run deletes it. Returning quietly was already safer than
       * continuing, but it still let the run report success on a corpus it could
       * not see.
       */
      throw new Error(
        `brain-ingest slack: could not read the existing chunk list (status ${res.status}) — ` +
          `aborting before the sweep rather than treating the corpus as empty`
      );
    }
    const batch = (await res.json().catch(() => [])) as Array<{
      source_id?: string;
      meta?: { threadsComplete?: boolean; v?: number };
    }>;
    for (const r of batch) {
      if (!r.source_id) continue;
      const ok = r.meta?.threadsComplete !== false && r.meta?.v === SLACK_BUILDER_VERSION;
      out.set(r.source_id, ok);
    }
    if (batch.length < 1000) break;
  }
  return out;
}

export async function ingestSlack(
  stampedAt: string,
  isOutOfTime: () => boolean = () => false
): Promise<IngestResult> {
  const token = process.env.SLACK_BRAIN_BOT_TOKEN ?? process.env.SLACK_BOT_TOKEN;
  if (!token) return { source: SOURCE, rows: 0, swept: 0, skipped: "slack-not-configured" };

  // A run that starts with no clock left must SAY so. Without this it made zero
  // history calls, wrote nothing, confirmed all 521 existing rows via touchChunks,
  // and returned {rows: 521} with no `skipped` — so the cron's "wrote 0 rows" alert
  // never fired and a frozen source looked perfectly healthy. Its two sibling
  // ingesters already had this guard.
  if (isOutOfTime()) {
    return { source: SOURCE, rows: 0, swept: 0, skipped: "slack-time-budget" };
  }

  const listed = await slackGet(token, "conversations.list", {
    types: "public_channel",
    limit: 200,
    exclude_archived: "true",
  });
  if (!listed) return { source: SOURCE, rows: 0, swept: 0, skipped: "slack-list-failed" };

  const channels = ((listed.channels as SlackChannel[]) ?? []).filter(
    (c) => c.is_member && !c.is_archived && c.id && c.name
  );
  // Membership is the boundary: the bot reads only channels somebody added it to,
  // and Slack enforces that regardless of scope.
  if (channels.length === 0) {
    return { source: SOURCE, rows: 0, swept: 0, skipped: "slack-no-channels-joined" };
  }

  const names = await userNames(token);
  const known = await knownSlackDays();
  const rows: BrainRow[] = [];
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.parse(`${today}T00:00:00Z`) - 86_400_000)
    .toISOString()
    .slice(0, 10);
  let complete = true;

  for (const ch of channels) {
    if (isOutOfTime()) {
      complete = false;
      break;
    }
    /**
     * Per day, a list of ENTRIES rather than a flat list of lines: each entry is a
     * top-level message plus its thread replies.
     *
     * A flat list broke ordering. `conversations.history` returns newest-first, so
     * the day is reversed at the end to read chronologically — but replies were
     * appended directly behind their parent, so that same reverse put every reply
     * BEFORE its parent and in backwards order. A thread read bottom-up, answer
     * first, which is close to unreadable and actively misleading about who replied
     * to whom. Reversing entries and flattening afterwards keeps each thread intact.
     */
    const byDay = new Map<string, Array<{ line: string | null; replies: string[] }>>();
    const threadGaps = new Set<string>();
    let cursor = "";

    /**
     * ONLY ASK FOR WHAT WE DO NOT ALREADY HOLD.
     *
     * This used to walk every channel's full history on every run — 15 pages of 200
     * plus a `conversations.replies` call per thread — and then discard the days it
     * already had at WRITE time. The fetching still happened, so a full pass took
     * 266 seconds against a 38-second budget: in production the nightly reached one
     * channel of nine, wrote nothing, and reported success.
     *
     * `oldest` is the start of the earliest day still needing work: today (always
     * rewritten, since it is still accruing) or any earlier day recorded incomplete.
     * A channel with nothing indexed yet is left unbounded for its first full walk.
     */
    /**
     * BASE ids only. A day too long for one chunk is stored as `…:DAY`, `…:DAY#2`,
     * `…:DAY#3`. When that day is later rewritten shorter it produces fewer parts,
     * and the extras are orphaned on an old builder version.
     *
     * Counting those orphans as "needs work" created a loop that fed itself: the
     * orphan dragged `oldest` back to February, so the channel walked its whole
     * history, ran out of clock, reported `complete: false`, which blocked the very
     * sweep that would have deleted the orphan. Every night, forever. The base
     * chunk's version is the authoritative answer for whether a day needs refetching.
     */
    const needsWork = [...known.entries()]
      .filter(([id, done]) => id.startsWith(`ch:${ch.name}:`) && !id.includes("#") && !done)
      // A long day is split into `ch:name:DAY#2`, `#3`… so the part suffix has to
      // come off — `Date.parse("2026-08-24#2T00:00:00Z")` is NaN, which Slack
      // rejects as `invalid_ts_oldest` and which silently skips the whole channel.
      .map(([id]) => (id.split(":")[2] ?? "").split("#")[0] ?? "")
      .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
    const haveAny = [...known.keys()].some((id) => id.startsWith(`ch:${ch.name}:`));
    /**
     * YESTERDAY IS NOT FINAL. The cron runs at 04:47 UTC, so it writes "today" when
     * the day is four hours old, and on the next run that day is past and is
     * skipped — every message posted after 04:47 was therefore lost permanently.
     * Re-reading the previous day as well costs one extra day of messages and
     * closes the hole regardless of what hour the cron runs at.
     */
    const from = [yesterday, ...needsWork].sort()[0] ?? yesterday;
    const oldest = haveAny ? slackTs(from) : "";

    for (let page = 0; page < MAX_PAGES; page++) {
      const json = await slackGet(
        token,
        "conversations.history",
        {
          channel: ch.id as string,
          limit: PAGE,
          ...(oldest ? { oldest } : {}),
          ...(cursor ? { cursor } : {}),
        },
        isOutOfTime
      );
      if (!json) {
        complete = false;
        break;
      }
      const messages = (json.messages as SlackMessage[]) ?? [];
      for (const m of messages) {
        if (!m.ts) continue;
        const line = renderMessage(m, names);
        /**
         * A THREAD UNDER A BOT PARENT IS STILL A HUMAN CONVERSATION.
         *
         * This used to `continue` whenever the parent did not render — a bot post, a
         * tombstone, an empty message — which skipped the reply fetch entirely. In
         * #incoming-surveys and #bugs-issues the team frequently replies in-thread
         * to an automated post, and every one of those replies was invisible to the
         * brain. The parent is dropped as noise; its replies are not.
         */
        if (!line && !(m.reply_count ?? 0)) continue;
        const day = tsDate(m.ts);
        const bucket = byDay.get(day) ?? [];
        const entry = { line, replies: [] as string[] };

        // Thread replies do NOT appear in channel history, and a thread is usually
        // where the actual argument happens — fetching only the parent would index
        // the question and drop the answer.
        if ((m.reply_count ?? 0) > 0) {
          // PAGINATE. A single limit=100 call with no cursor silently truncated any
          // thread past 100 replies AND still stamped the day threadsComplete, so it
          // was cached as immutable with the tail missing.
          let rCursor = "";
          for (let rp = 0; rp < MAX_REPLY_PAGES; rp++) {
            const replies: Record<string, unknown> | null = isOutOfTime()
              ? null
              : await slackGet(
                  token,
                  "conversations.replies",
                  {
                    channel: ch.id as string,
                    ts: m.ts,
                    limit: 200,
                    ...(rCursor ? { cursor: rCursor } : {}),
                  },
                  isOutOfTime
                );
            if (!replies) {
              // Record the gap against the DAY, so this day is rebuilt next run
              // rather than being cached as if the thread had no replies.
              threadGaps.add(day);
              break;
            }
            for (const r of (replies.messages as SlackMessage[]) ?? []) {
              if (r.ts === m.ts) continue;
              const rl = renderMessage(r, names, true);
              if (rl) entry.replies.push(rl);
            }
            rCursor =
              ((replies.response_metadata as Record<string, string>) ?? {}).next_cursor ?? "";
            if (!rCursor) break;
            // Ran out of pages with more still to come: the day is not whole.
            if (rp === MAX_REPLY_PAGES - 1) threadGaps.add(day);
          }
        }
        // Keep the entry only if something human survived: the parent, a reply, or
        // both. A bot parent with no human replies contributes nothing.
        if (entry.line || entry.replies.length > 0) {
          bucket.push(entry);
          byDay.set(day, bucket);
        }
      }
      cursor = ((json.response_metadata as Record<string, string>) ?? {}).next_cursor ?? "";
      if (!cursor) break;
      if (page === MAX_PAGES - 1) complete = false;
    }

    for (const [day, entries] of byDay) {
      // Today's chunk is always rewritten because the day is still accruing. A past
      // day is immutable ONCE FULLY FETCHED, so skip it and save the write — but a
      // day recorded with a thread gap is rebuilt until it is whole.
      if (day < yesterday && known.get(`ch:${ch.name}:${day}`) === true) continue;
      const whole = !threadGaps.has(day);
      if (!whole) complete = false;
      // Reverse the top-level sequence only, then flatten each thread back in
      // order, so replies follow their parent and read oldest-first.
      const lines = [...entries]
        .reverse()
        .flatMap((e) => (e.line ? [e.line, ...e.replies] : e.replies));
      rows.push(...dayToRows(ch.name as string, day, lines, stampedAt, whole));
    }
  }

  const written = await upsertChunks(rows);
  const writtenIds = new Set(rows.map((r) => r.source_id));
  // Days rewritten this run, by their base id. Any OTHER stored part of such a day
  // is an orphan from a longer previous version, and touching it would keep it
  // alive — and searchable — forever. Leaving it untouched lets the sweep take it.
  const rewrittenDays = new Set([...writtenIds].map((id) => id.split("#")[0]));

  /**
   * A stored part is an ORPHAN when its base day is on the current builder version
   * but the part itself is not: the day was rewritten shorter and this part is a
   * leftover of the longer version. Refusing to touch it lets the sweep remove it.
   *
   * Without this the orphans were immortal — they are never rewritten (their day is
   * already current) and they were touched every run, so stale text with the old
   * thread order and raw HTML entities stayed searchable indefinitely.
   */
  const isOrphanPart = (id: string): boolean => {
    const hash = id.indexOf("#");
    if (hash < 0) return false;
    return known.get(id) === false && known.get(id.slice(0, hash)) === true;
  };

  // Sweeping about once a day instead of every run: the touch it needs rewrites
  // four indexes per row, and a deleted source document can wait a day to be
  // noticed. See shouldSweep.
  const sweeping = complete && (await shouldSweep(SOURCE));
  const touched = await touchChunks(
    SOURCE,
    [...known.keys()].filter(
      (id) => !writtenIds.has(id) && !rewrittenDays.has(id.split("#")[0] ?? id) && !isOrphanPart(id)
    ),
    stampedAt,
    sweeping
  );
  // Only sweep a complete walk; a truncated one makes past days look deleted.
  const swept = sweeping ? await sweepStale(SOURCE, stampedAt, written + touched) : 0;
  if (sweeping) await recordSweep(SOURCE);

  logger.info(
    { channels: channels.length, namesResolved: names.size, written, touched, complete },
    "brain-ingest slack"
  );
  if (written === 0 && touched === 0) {
    return { source: SOURCE, rows: 0, swept: 0, skipped: "slack-nothing-to-index" };
  }
  /**
   * Say so when the walk did not finish, the way notion does. `rows` is
   * `written + touched`, and touching means "this old row still exists" — so a run
   * that fetched NOTHING still reports rows in the hundreds and reads as healthy.
   * `slack-walk-incomplete` is not in the cron's DELIBERATE_SKIPS, so it alerts.
   */
  if (!complete) {
    return { source: SOURCE, rows: written + touched, swept, skipped: "slack-walk-incomplete" };
  }
  return { source: SOURCE, rows: written + touched, swept };
}
