import { fetchWithTimeout } from "@shared/http/fetch-with-timeout";
import logger from "@shared/observability/logger";
import { supabaseFetch } from "@features/admin/server/supabase";
import { splitBody } from "./notion";
import { sweepStale, touchChunks, upsertChunks, type BrainRow, type IngestResult } from "./upsert";

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
const MAX_PAGES = 15;
const MAX_RETRIES = 4;

/** Bump when the row SHAPE changes; a mismatch counts as stale. See notion.ts. */
// v4: v1-v3 stored Slack's HTML entities ("&amp;") rather than the typed text.
// v3: v1-v2 stored every thread reply BEFORE its parent and in reverse order.
// v2: v1 wrote days whose thread replies had been dropped by a 429 without
// recording the gap, so every v1 row must be rebuilt rather than trusted.
export const SLACK_BUILDER_VERSION = 4;

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
  params: Record<string, string | number>
): Promise<Record<string, unknown> | null> {
  const qs = new URLSearchParams(
    Object.entries(params).map(([k, v]) => [k, String(v)])
  ).toString();

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
    // Fail closed: an unreadable list must not look like "nothing is indexed", which
    // would re-fetch every channel and then sweep the real rows away.
    if (!res.ok) return new Map();
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
    const byDay = new Map<string, Array<{ line: string; replies: string[] }>>();
    const threadGaps = new Set<string>();
    let cursor = "";

    for (let page = 0; page < MAX_PAGES; page++) {
      const json = await slackGet(token, "conversations.history", {
        channel: ch.id as string,
        limit: PAGE,
        ...(cursor ? { cursor } : {}),
      });
      if (!json) {
        complete = false;
        break;
      }
      const messages = (json.messages as SlackMessage[]) ?? [];
      for (const m of messages) {
        const line = renderMessage(m, names);
        if (!line || !m.ts) continue;
        const day = tsDate(m.ts);
        const bucket = byDay.get(day) ?? [];
        const entry = { line, replies: [] as string[] };
        bucket.push(entry);

        // Thread replies do NOT appear in channel history, and a thread is usually
        // where the actual argument happens — fetching only the parent would index
        // the question and drop the answer.
        if ((m.reply_count ?? 0) > 0) {
          const replies = isOutOfTime()
            ? null
            : await slackGet(token, "conversations.replies", {
                channel: ch.id as string,
                ts: m.ts,
                limit: 100,
              });
          if (!replies) {
            // Record the gap against the DAY, so this day is rebuilt next run rather
            // than being cached as if the thread had no replies.
            threadGaps.add(day);
          }
          for (const r of (replies?.messages as SlackMessage[]) ?? []) {
            if (r.ts === m.ts) continue;
            const rl = renderMessage(r, names, true);
            if (rl) entry.replies.push(rl);
          }
        }
        byDay.set(day, bucket);
      }
      cursor = ((json.response_metadata as Record<string, string>) ?? {}).next_cursor ?? "";
      if (!cursor) break;
      if (page === MAX_PAGES - 1) complete = false;
    }

    for (const [day, entries] of byDay) {
      // Today's chunk is always rewritten because the day is still accruing. A past
      // day is immutable ONCE FULLY FETCHED, so skip it and save the write — but a
      // day recorded with a thread gap is rebuilt until it is whole.
      if (day !== today && known.get(`ch:${ch.name}:${day}`) === true) continue;
      const whole = !threadGaps.has(day);
      if (!whole) complete = false;
      // Reverse the top-level sequence only, then flatten each thread back in
      // order, so replies follow their parent and read oldest-first.
      const lines = [...entries].reverse().flatMap((e) => [e.line, ...e.replies]);
      rows.push(...dayToRows(ch.name as string, day, lines, stampedAt, whole));
    }
  }

  const written = await upsertChunks(rows);
  const writtenIds = new Set(rows.map((r) => r.source_id));
  const touched = await touchChunks(
    SOURCE,
    [...known.keys()].filter((id) => !writtenIds.has(id)),
    stampedAt
  );
  // Only sweep a complete walk; a truncated one makes past days look deleted.
  const swept = complete ? await sweepStale(SOURCE, stampedAt, written + touched) : 0;

  logger.info(
    { channels: channels.length, namesResolved: names.size, written, touched, complete },
    "brain-ingest slack"
  );
  if (written === 0 && touched === 0) {
    return { source: SOURCE, rows: 0, swept: 0, skipped: "slack-nothing-to-index" };
  }
  return { source: SOURCE, rows: written + touched, swept };
}
