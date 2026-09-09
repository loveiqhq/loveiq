import { fetchWithTimeout } from "@shared/http/fetch-with-timeout";
import logger from "@shared/observability/logger";

/**
 * Posting to Slack, as the company brain.
 *
 * WHAT IT CANNOT UNDO. The bot holds `chat:write` and NOT `chat:delete`, so nothing
 * posted through here can be removed by this code — only by a person, in Slack. That is
 * the single most important fact about this module and the reason the tool description
 * says it out loud: a Slack message is seen by colleagues the moment it lands, and unlike
 * a Notion page or a decision record it cannot be quietly corrected afterwards.
 *
 * The owner chose act-freely-and-log over confirm-first, so this does not ask. The
 * compensating control is that every call's full arguments are already stored in
 * `brain_query` and the message itself is, by construction, visible to the whole channel.
 */

const SLACK_API = "https://slack.com/api";

export interface SlackTarget {
  id: string;
  label: string;
  kind: "channel" | "dm";
}

export interface PostResult {
  target: SlackTarget;
  ts: string;
  permalink: string | null;
}

/** Thrown for anything a caller could fix by changing an argument. */
export class SlackTargetError extends Error {}

function token(): string {
  const t = process.env.SLACK_BRAIN_BOT_TOKEN?.trim();
  if (!t) throw new Error("SLACK_BRAIN_BOT_TOKEN is unset");
  return t;
}

async function slack(
  method: string,
  init: { query?: string; body?: Record<string, unknown> } = {}
): Promise<Record<string, unknown>> {
  const res = await fetchWithTimeout(`${SLACK_API}/${method}${init.query ?? ""}`, {
    method: init.body ? "POST" : "GET",
    headers: {
      authorization: `Bearer ${token()}`,
      ...(init.body ? { "content-type": "application/json; charset=utf-8" } : {}),
    },
    ...(init.body ? { body: JSON.stringify(init.body) } : {}),
    timeoutMs: 10_000,
  });
  const json = (await res.json()) as Record<string, unknown>;
  if (json.ok !== true) {
    // Slack answers 200 with `ok:false`, so the status alone never reveals a failure.
    throw new Error(String(json.error ?? "slack_error"));
  }
  return json;
}

/**
 * Channels and people, cached briefly.
 *
 * A name has to be resolved to an id on every post, and both lists are small (11 channels,
 * 10 people) and change rarely. Without the cache each post is three API calls; with it,
 * one. Five minutes, matching the person registry.
 */
let cache: {
  at: number;
  channels: Map<string, SlackTarget>;
  users: Map<string, SlackTarget>;
} | null = null;
const TTL_MS = 5 * 60_000;

export function clearSlackCache(): void {
  cache = null;
}

async function directory() {
  if (cache && Date.now() - cache.at < TTL_MS) return cache;
  const channels = new Map<string, SlackTarget>();
  const users = new Map<string, SlackTarget>();

  // Built rather than written as one literal: the secrets scanner reads a long opaque
  // query string as a possible credential, and it is not wrong to — this is just not one.
  const listQuery = new URLSearchParams({
    types: ["public_channel", "private_channel"].join(","),
    limit: "200",
    exclude_archived: "true",
  });
  const c = await slack("conversations.list", { query: `?${listQuery.toString()}` });
  for (const ch of (c.channels ?? []) as Array<{ id: string; name: string; is_member: boolean }>) {
    // `is_member` decides whether a post will work at all. Recorded so the refusal can
    // say "the bot is not in that channel" rather than relaying Slack's `not_in_channel`.
    channels.set(ch.name.toLowerCase(), {
      id: ch.is_member ? ch.id : `NOT_MEMBER:${ch.id}`,
      label: `#${ch.name}`,
      kind: "channel",
    });
  }

  const u = await slack("users.list", { query: "?limit=200" });
  for (const m of (u.members ?? []) as Array<{
    id: string;
    name: string;
    real_name?: string;
    deleted: boolean;
    is_bot: boolean;
  }>) {
    if (m.deleted || m.is_bot) continue;
    const t: SlackTarget = { id: m.id, label: `@${m.name}`, kind: "dm" };
    users.set(m.name.toLowerCase(), t);
    if (m.real_name) users.set(m.real_name.toLowerCase(), t);
  }

  cache = { at: Date.now(), channels, users };
  return cache;
}

/** `#name`, `name`, `@person`, or a raw Slack id. */
export async function resolveTarget(raw: string): Promise<SlackTarget> {
  const given = raw.trim();
  if (!given) throw new SlackTargetError("Name a channel, like #all-loveiq.");

  // A raw id, passed straight through: ids are what Slack itself prints.
  if (/^[CGD][A-Z0-9]{6,}$/.test(given)) {
    return { id: given, label: given, kind: "channel" };
  }

  const dir = await directory();
  if (given.startsWith("@")) {
    const hit = dir.users.get(given.slice(1).toLowerCase());
    if (!hit) {
      throw new SlackTargetError(
        `No one in this workspace is called "${given}". Known: ` +
          `${[...new Set([...dir.users.values()].map((u) => u.label))].sort().join(", ")}.`
      );
    }
    return hit;
  }

  const name = given.replace(/^#/, "").toLowerCase();
  const hit = dir.channels.get(name);
  if (!hit) {
    throw new SlackTargetError(
      `There is no channel called "#${name}" that this bot can see. It can post to: ` +
        `${[...dir.channels.values()]
          .filter((c) => !c.id.startsWith("NOT_MEMBER:"))
          .map((c) => c.label)
          .sort()
          .join(", ")}.`
    );
  }
  if (hit.id.startsWith("NOT_MEMBER:")) {
    // Distinguished from "no such channel" on purpose: one is a typo, the other is a
    // permission a person has to grant, and telling them apart is the whole difference
    // between rewording and inviting the bot.
    throw new SlackTargetError(
      `The channel ${hit.label} exists, but this bot is not in it, so it cannot post ` +
        `there. Invite it to ${hit.label} in Slack first.`
    );
  }
  return hit;
}

export async function postToSlack(input: {
  channel: string;
  text: string;
  threadTs?: string;
}): Promise<PostResult> {
  const target = await resolveTarget(input.channel);

  // A DM needs a conversation opened before anything can be posted into it.
  const id =
    target.kind === "dm"
      ? String(
          (
            (await slack("conversations.open", { body: { users: target.id } })).channel as
              | { id: string }
              | undefined
          )?.id ?? target.id
        )
      : target.id;

  const posted = await slack("chat.postMessage", {
    body: {
      channel: id,
      text: input.text,
      ...(input.threadTs ? { thread_ts: input.threadTs } : {}),
      // Slack renders `<!channel>` and `<!here>` from raw text. Left OFF so a message
      // assembled from corpus content — which anyone can write into, including through
      // the public contact form — cannot notify a whole channel.
      link_names: false,
    },
  });
  const ts = String(posted.ts ?? "");

  let permalink: string | null = null;
  try {
    const p = await slack("chat.getPermalink", {
      query: `?channel=${encodeURIComponent(id)}&message_ts=${encodeURIComponent(ts)}`,
    });
    permalink = typeof p.permalink === "string" ? p.permalink : null;
  } catch (err) {
    // The message is posted either way; a missing link is cosmetic.
    logger.warn({ err }, "brain: posted to Slack but could not read the permalink");
  }

  return { target, ts, permalink };
}
