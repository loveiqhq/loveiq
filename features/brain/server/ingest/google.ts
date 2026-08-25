import { fetchWithTimeout } from "@shared/http/fetch-with-timeout";
import {
  GA4_SCOPE,
  SEARCH_CONSOLE_SCOPE,
  getGoogleAccessToken,
  googleScopeHint,
  isGoogleConfigured,
} from "@shared/http/google-oauth";
import logger from "@shared/observability/logger";
import { longDate } from "./analytics";
import { sweepStale, upsertChunks, type BrainRow, type IngestResult } from "./upsert";

/**
 * GA4 and Search Console, as dated daily facts.
 *
 * WHAT THIS ADDS THAT OUR OWN DATABASE CANNOT. `funnel_event.utm_source` already
 * measures Google traffic, and conversion and revenue only exist in our tables
 * anyway — so `analytics.ts` covers most questions. The two things genuinely
 * unavailable first-party are SEARCH QUERIES (what people typed to find us,
 * Search Console) and AD SPEND (what a click cost, GA4 when Google Ads is
 * linked). Those are the reason this file exists.
 *
 * GOOGLE ADS NEEDS NO SEPARATE INTEGRATION. The Google Ads API requires a
 * developer token behind a manual approval, which is days of waiting. When the
 * Ads account is linked to GA4 — ours is — the same GA4 credential exposes
 * `advertiserAdCost`, `advertiserAdClicks` and `advertiserAdImpressions`, which
 * are the numbers anyone actually asks about. Each enrichment report is kept
 * SEPARATE and best-effort so one of them failing cannot cost us the core
 * traffic numbers.
 *
 * EVERY PIECE DEGRADES ALONE. No credentials, no property id, no site: skip and
 * say so. Search Console failing must not cost us the GA4 numbers.
 *
 * DATES ARE SPELLED OUT for the same measured reason as `analytics.ts`: nobody
 * asks a question containing the string "2026-08", so a chunk that only carries
 * the ISO form is unreachable by "what did we spend on ads in August".
 */

const DAYS = 90;
const GA4_SOURCE = "ga4";
const GSC_SOURCE = "gsc";
const TIMEOUT_MS = 15_000;

function isoDaysAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

interface Ga4Row {
  dimensionValues?: Array<{ value?: string }>;
  metricValues?: Array<{ value?: string }>;
}

async function runGa4Report(
  token: string,
  propertyId: string,
  body: Record<string, unknown>
): Promise<Ga4Row[]> {
  const res = await fetchWithTimeout(
    `https://analyticsdata.googleapis.com/v1beta/properties/${encodeURIComponent(propertyId)}:runReport`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      timeoutMs: TIMEOUT_MS,
    }
  );
  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).slice(0, 400);
    const hint = googleScopeHint(res.status, detail, GA4_SCOPE);
    throw new Error(hint ?? `GA4 runReport failed (${res.status}): ${detail}`);
  }
  const json = (await res.json()) as { rows?: Ga4Row[] };
  return json.rows ?? [];
}

/** `YYYYMMDD` (GA4's `date` dimension) to `YYYY-MM-DD`. */
function ga4Date(raw: string): string {
  return raw.length === 8 ? `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}` : raw;
}

function num(v: string | undefined): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export async function ingestGa4(stampedAt: string): Promise<IngestResult> {
  const propertyId = process.env.GA4_PROPERTY_ID;
  if (!propertyId) return { source: GA4_SOURCE, rows: 0, swept: 0, skipped: "ga4-no-property-id" };

  const token = await getGoogleAccessToken();
  if (!token) return { source: GA4_SOURCE, rows: 0, swept: 0, skipped: "google-not-configured" };

  const dateRanges = [{ startDate: `${DAYS}daysAgo`, endDate: "yesterday" }];

  const core = await runGa4Report(token, propertyId, {
    dateRanges,
    dimensions: [{ name: "date" }],
    metrics: [
      { name: "sessions" },
      { name: "totalUsers" },
      { name: "newUsers" },
      { name: "screenPageViews" },
      { name: "engagedSessions" },
    ],
    limit: 400,
  });

  // Channel mix and ad spend are enrichment: a failure here must not lose the
  // core numbers, and ad metrics 400 outright on a property with no linked Ads
  // account.
  const channels = new Map<string, string[]>();
  try {
    const rows = await runGa4Report(token, propertyId, {
      dateRanges,
      dimensions: [{ name: "date" }, { name: "sessionDefaultChannelGroup" }],
      metrics: [{ name: "sessions" }],
      limit: 2000,
    });
    for (const r of rows) {
      const day = ga4Date(r.dimensionValues?.[0]?.value ?? "");
      const channel = r.dimensionValues?.[1]?.value ?? "unknown";
      const sessions = num(r.metricValues?.[0]?.value);
      if (!day || sessions <= 0) continue;
      const list = channels.get(day) ?? [];
      list.push(`${channel} ${sessions}`);
      channels.set(day, list);
    }
  } catch (err) {
    logger.warn({ err }, "brain-ingest ga4: channel breakdown unavailable");
  }

  // Ad spend. The date dimension ALONE is rejected: GA4 answers
  //   400 "Please add sessionCampaignName to make the request compatible"
  // because advertiser cost metrics are campaign-scoped and cannot be reported
  // against a bare date. So the campaign dimension is required, and the rows come
  // back per (day, campaign) — which is better anyway, since "what is Performance
  // Max costing us" is a question someone will actually ask.
  //
  // Still best-effort: a property with no linked Google Ads account returns
  // nothing, and that must not cost us the core numbers above.
  const ads = new Map<
    string,
    { cost: number; clicks: number; impressions: number; campaigns: Map<string, number> }
  >();
  try {
    const rows = await runGa4Report(token, propertyId, {
      dateRanges,
      dimensions: [{ name: "date" }, { name: "sessionCampaignName" }],
      metrics: [
        { name: "advertiserAdCost" },
        { name: "advertiserAdClicks" },
        { name: "advertiserAdImpressions" },
      ],
      limit: 5000,
    });
    for (const r of rows) {
      const day = ga4Date(r.dimensionValues?.[0]?.value ?? "");
      const campaign = r.dimensionValues?.[1]?.value ?? "";
      const cost = num(r.metricValues?.[0]?.value);
      const clicks = num(r.metricValues?.[1]?.value);
      const impressions = num(r.metricValues?.[2]?.value);
      if (!day || (!cost && !clicks && !impressions)) continue;

      const entry = ads.get(day) ?? { cost: 0, clicks: 0, impressions: 0, campaigns: new Map() };
      entry.cost += cost;
      entry.clicks += clicks;
      entry.impressions += impressions;
      if (campaign && campaign !== "(not set)" && cost > 0) {
        entry.campaigns.set(campaign, (entry.campaigns.get(campaign) ?? 0) + cost);
      }
      ads.set(day, entry);
    }
  } catch (err) {
    // Expected and harmless when Google Ads is not linked to this property.
    logger.info({ err }, "brain-ingest ga4: no linked Google Ads data");
  }

  const chunks: BrainRow[] = [];
  for (const r of core) {
    const day = ga4Date(r.dimensionValues?.[0]?.value ?? "");
    if (!day) continue;
    const [sessions, users, newUsers, views, engaged] = (r.metricValues ?? []).map((m) =>
      num(m.value)
    );
    if (!sessions && !users) continue;

    const ad = ads.get(day);
    const body = [
      `Period: ${longDate(day)} (${day})`,
      `Sessions: ${sessions} · Users: ${users} · New users: ${newUsers}`,
      `Page views: ${views} · Engaged sessions: ${engaged}`,
      channels.get(day)?.length ? `Channels: ${channels.get(day)!.slice(0, 6).join(", ")}` : null,
      ad
        ? `Google Ads spend: EUR ${ad.cost.toFixed(2)} · ${ad.clicks} ad clicks · ${ad.impressions} ad impressions`
        : null,
      ad && ad.campaigns.size
        ? `Ad campaigns: ${[...ad.campaigns.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([name, cost]) => `${name} EUR ${cost.toFixed(2)}`)
            .join(", ")}`
        : null,
    ]
      .filter((l) => l !== null)
      .join("\n");

    chunks.push({
      source: GA4_SOURCE,
      source_id: `daily:${day}`,
      title: `Google Analytics — ${longDate(day)}`,
      url: null,
      body,
      meta: {
        day,
        sessions,
        users,
        newUsers,
        views,
        engaged,
        ...(ad ? { ad_cost: ad.cost, ad_clicks: ad.clicks, ad_impressions: ad.impressions } : {}),
      },
      updated_at: stampedAt,
    });
  }

  const written = await upsertChunks(chunks);
  const swept = await sweepStale(GA4_SOURCE, stampedAt);
  return { source: GA4_SOURCE, rows: written, swept };
}

interface GscRow {
  keys?: string[];
  clicks?: number;
  impressions?: number;
  ctr?: number;
  position?: number;
}

async function queryGsc(
  token: string,
  site: string,
  body: Record<string, unknown>
): Promise<GscRow[]> {
  const res = await fetchWithTimeout(
    `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site)}/searchAnalytics/query`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      timeoutMs: TIMEOUT_MS,
    }
  );
  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).slice(0, 400);
    const hint = googleScopeHint(res.status, detail, SEARCH_CONSOLE_SCOPE);
    throw new Error(hint ?? `Search Console query failed (${res.status}): ${detail}`);
  }
  const json = (await res.json()) as { rows?: GscRow[] };
  return json.rows ?? [];
}

export async function ingestSearchConsole(stampedAt: string): Promise<IngestResult> {
  const site = process.env.SEARCH_CONSOLE_SITE;
  if (!site) return { source: GSC_SOURCE, rows: 0, swept: 0, skipped: "gsc-no-site" };

  const token = await getGoogleAccessToken();
  if (!token) return { source: GSC_SOURCE, rows: 0, swept: 0, skipped: "google-not-configured" };

  // Search Console data lags ~2 days; asking for today returns empty rows.
  const startDate = isoDaysAgo(DAYS);
  const endDate = isoDaysAgo(2);

  const daily = await queryGsc(token, site, {
    startDate,
    endDate,
    dimensions: ["date"],
    rowLimit: 500,
  });

  // The queries are the point: nothing else in our stack knows what people typed
  // into Google to find us.
  const queriesByDay = new Map<string, string[]>();
  try {
    const rows = await queryGsc(token, site, {
      startDate,
      endDate,
      dimensions: ["date", "query"],
      rowLimit: 5000,
    });
    for (const r of rows) {
      const day = r.keys?.[0];
      const query = r.keys?.[1];
      if (!day || !query) continue;
      const list = queriesByDay.get(day) ?? [];
      if (list.length < 8) {
        list.push(`"${query}" (${r.clicks ?? 0} clicks, ${r.impressions ?? 0} impressions)`);
      }
      queriesByDay.set(day, list);
    }
  } catch (err) {
    logger.warn({ err }, "brain-ingest gsc: query breakdown unavailable");
  }

  const chunks: BrainRow[] = daily
    .map((r): BrainRow | null => {
      const day = r.keys?.[0];
      if (!day) return null;
      const clicks = r.clicks ?? 0;
      const impressions = r.impressions ?? 0;
      if (!clicks && !impressions) return null;

      const body = [
        `Period: ${longDate(day)} (${day})`,
        `Google search clicks: ${clicks} · Impressions: ${impressions}`,
        `Click-through rate: ${((r.ctr ?? 0) * 100).toFixed(2)}% · Average position: ${(r.position ?? 0).toFixed(1)}`,
        queriesByDay.get(day)?.length
          ? `Top search queries: ${queriesByDay.get(day)!.join("; ")}`
          : null,
      ]
        .filter((l) => l !== null)
        .join("\n");

      return {
        source: GSC_SOURCE,
        source_id: `daily:${day}`,
        title: `Google Search Console — ${longDate(day)}`,
        url: null,
        body,
        meta: { day, clicks, impressions, ctr: r.ctr ?? 0, position: r.position ?? 0 },
        updated_at: stampedAt,
      };
    })
    .filter((r): r is BrainRow => r !== null);

  const written = await upsertChunks(chunks);
  const swept = await sweepStale(GSC_SOURCE, stampedAt);
  return { source: GSC_SOURCE, rows: written, swept };
}

export function googleIngestersConfigured(): boolean {
  return isGoogleConfigured();
}
