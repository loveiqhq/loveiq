import { supabaseRestUrl } from "@shared/env/supabase-urls";
import { fetchWithTimeout } from "@shared/http/fetch-with-timeout";
import { newShortCode, type ShortLinkFields } from "@features/short-links/logic/shortLink";

/** A redirect waits on this, so it is kept short: a slow answer sends people on untagged. */
const REDIRECT_TIMEOUT_MS = 2_500;
/**
 * Seedlane's API calls can wait longer. A create cut short can still commit, so a timeout here
 * would hand Seedlane an error for a link that exists.
 */
const API_TIMEOUT_MS = 8_000;

export interface ShortLinkRow extends ShortLinkFields {
  code: string;
  meta: Record<string, unknown>;
  clicks: number;
  first_click_at: string | null;
  last_click_at: string | null;
  created_at: string;
}

const COLUMNS =
  "code,influencer,platform,placement,meta,clicks,first_click_at,last_click_at,created_at";

function rest(path: string, timeoutMs: number, init: RequestInit = {}): Promise<Response> {
  const url = supabaseRestUrl();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("supabase_not_configured");
  return fetchWithTimeout(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
    timeoutMs,
  });
}

/**
 * The link a code names, counting the click when `count`; null for a code nobody created.
 * Throws when the database cannot answer.
 */
export async function followShortLink(
  code: string,
  count: boolean
): Promise<ShortLinkFields | null> {
  const res = count
    ? await rest("rpc/short_link_click", REDIRECT_TIMEOUT_MS, {
        method: "POST",
        body: JSON.stringify({ p_code: code }),
      })
    : await rest(
        `short_link?code=eq.${encodeURIComponent(code)}&select=influencer,platform,placement`,
        REDIRECT_TIMEOUT_MS
      );
  if (!res.ok) throw new Error(`short_link lookup failed (${res.status})`);
  const rows = (await res.json()) as ShortLinkFields[];
  return rows[0] ?? null;
}

/** Stores a new link under a fresh code; a code already taken is drawn again. */
export async function createShortLink(
  fields: ShortLinkFields,
  meta: Record<string, unknown>,
  drawCode: () => string = newShortCode
): Promise<ShortLinkRow> {
  for (let draw = 0; draw < 3; draw++) {
    const res = await rest(`short_link?select=${COLUMNS}`, API_TIMEOUT_MS, {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ code: drawCode(), ...fields, meta }),
    });
    if (res.status === 409) continue;
    if (!res.ok) throw new Error(`short_link insert failed (${res.status})`);
    const [row] = (await res.json()) as ShortLinkRow[];
    if (!row) throw new Error("short_link insert returned no row");
    return row;
  }
  throw new Error("short_link insert: three codes in a row were taken");
}

/** Links, newest first, with their clicks. */
export async function listShortLinks(filter: {
  code?: string;
  influencer?: string;
  since?: string;
  limit: number;
}): Promise<ShortLinkRow[]> {
  const params = new URLSearchParams({
    select: COLUMNS,
    order: "created_at.desc",
    limit: String(filter.limit),
  });
  if (filter.code) params.set("code", `eq.${filter.code}`);
  if (filter.influencer) params.set("influencer", `eq.${filter.influencer}`);
  if (filter.since) params.set("created_at", `gte.${filter.since}`);
  const res = await rest(`short_link?${params}`, API_TIMEOUT_MS);
  if (!res.ok) throw new Error(`short_link list failed (${res.status})`);
  return (await res.json()) as ShortLinkRow[];
}
