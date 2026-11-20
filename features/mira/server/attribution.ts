import { cookies, headers } from "next/headers";
import { z } from "zod";
import { isTeamBrowser } from "@shared/http/team-cookie";
import { sanitizeUtmSource } from "@shared/url/utm";
import { SOURCE_COOKIE, SOURCE_HEADER } from "./config";

/**
 * Where a Mira visit came from, and whether the browser is the team's (21 Nov 2026). Read from
 * the request by logMiraEvent and upsertProfileAtSignIn (store.ts), so every route that logs an
 * event or signs someone in gets both without a line of its own.
 *
 * Where from: the site's own campaign tracker (shared/url/utm.ts, kept in the browser), which
 * Mira's pages send with every call as the `x-mira-source` header (ui/api.ts). Google sign-in is
 * a full-page hand-over that carries no header, so its link leaves the same value in the
 * `mira_source` cookie, sent only to the Google routes, for 10 minutes. chat_opened,
 * chat_started and signup_completed carry it: the link's `source`, `medium` and `campaign`, or,
 * on an untagged visit, the referring site's host (`referrer_host`). `source: null` with neither
 * is a direct visit; an event with no `source` key at all predates this, or came from a page
 * that sent nothing.
 *
 * The team: a browser with `loveiq_team=1` or `loveiq_probe=1` (shared/http/team-cookie.ts).
 * Its events carry `team: true`; an account created or signed in from it gets `is_team`.
 */

/** The events that say where the visit came from. */
export const SOURCED_EVENTS: ReadonlySet<string> = new Set([
  "chat_opened",
  "chat_started",
  "signup_completed",
]);

const tag = z.string().max(500).optional();
const sentSchema = z.object({ source: tag, medium: tag, campaign: tag, referrer_host: tag });

/**
 * The props a sent source (JSON text) becomes, cleaned like every other utm value
 * (sanitizeUtmSource), or null when nothing valid was sent. The browser picks these values, so
 * they are only ever counted, never trusted.
 */
export function sourceProps(json: string | null | undefined): Record<string, string | null> | null {
  if (!json || json.length > 2000) return null;
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    return null;
  }
  const sent = sentSchema.safeParse(value);
  if (!sent.success) return null;
  const source = sanitizeUtmSource(sent.data.source) ?? null;
  const medium = sanitizeUtmSource(sent.data.medium);
  const campaign = sanitizeUtmSource(sent.data.campaign);
  const host = (sent.data.referrer_host ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9.-]/g, "")
    .slice(0, 100);
  return {
    source,
    ...(medium ? { medium } : {}),
    ...(campaign ? { campaign } : {}),
    ...(!source && !medium && !campaign && host ? { referrer_host: host } : {}),
  };
}

const decoded = (v: string | null): string | null => {
  try {
    return v === null ? null : decodeURIComponent(v);
  } catch {
    return null;
  }
};

/**
 * What an event gets from its request: `team: true` from a team browser and, on the SOURCED
 * events, where the visit came from. Nothing outside a request (a cron's own events, a test).
 */
export async function requestExtras(name: string): Promise<Record<string, unknown>> {
  try {
    const [h, jar] = await Promise.all([headers(), cookies()]);
    const out: Record<string, unknown> = {};
    if (SOURCED_EVENTS.has(name)) {
      // The cookie's value comes decoded already (Next decodes cookies); the header's does not.
      const sent = decoded(h.get(SOURCE_HEADER)) ?? jar.get(SOURCE_COOKIE)?.value;
      Object.assign(out, sourceProps(sent));
    }
    if (isTeamBrowser(h.get("cookie"))) out.team = true;
    return out;
  } catch {
    return {};
  }
}

/** Is this request from a team browser? False outside a request. */
export async function fromTeamBrowser(): Promise<boolean> {
  try {
    return isTeamBrowser((await headers()).get("cookie"));
  } catch {
    return false;
  }
}
