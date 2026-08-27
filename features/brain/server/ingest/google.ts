import { fetchWithTimeout } from "@shared/http/fetch-with-timeout";
import {
  GA4_SCOPE,
  SEARCH_CONSOLE_SCOPE,
  getGoogleAccessToken,
  googleScopeHint,
  isGoogleConfigured,
} from "@shared/http/google-oauth";
import logger from "@shared/observability/logger";
import { isoWeek, longDate, longMonth, monthEnd } from "./analytics";
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
 *
 * THREE GRAINS, ALSO FOR THE SAME MEASURED REASON. Daily rows alone could not
 * answer "how much did we spend on Google Ads in August and what did we earn" —
 * retrieval returned a single day and the model correctly refused to guess a
 * monthly total from it. Weekly and monthly rows are pre-totalled so the answer
 * is read rather than computed.
 *
 * SEARCH CONSOLE RATES ARE RECOMPUTED, NOT AVERAGED. Click-through rate over a
 * month is total clicks over total impressions, and average position must be
 * weighted by impressions — averaging daily percentages or positions lets a
 * single quiet day with one lucky impression drag the month around.
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

interface AdDay {
  cost: number;
  clicks: number;
  impressions: number;
  /** Campaign name to spend, so a grain can report where the money went. */
  campaigns: Map<string, number>;
}

interface Ga4Row {
  dimensionValues?: Array<{ value?: string }>;
  metricValues?: Array<{ value?: string }>;
}

/** Page ceiling, so a bad request cannot walk forever. 20 x 5,000 = 100,000 rows. */
const MAX_PAGES = 20;

/**
 * Wall-clock ceiling per report.
 *
 * MAX_PAGES alone is not a time bound: 20 pages x a 15s per-request timeout is
 * 300s, and the cron function's `maxDuration` is 60. Only the Jira ingester was
 * given the run's time budget, so a slow GA4 report could burn the whole function
 * and be killed before `recordCronRun` wrote anything at all.
 */
const PAGING_BUDGET_MS = 15_000;

/**
 * One GA4 report, PAGED TO COMPLETION.
 *
 * A single request silently returns at most `limit` rows and nothing in the
 * response body looks like an error. The ad-cost report asks for
 * (date x sessionCampaignName) over 90 days, which is 90 x however many campaigns
 * ran — past the limit, Google just stops, so `Google Ads spend` was understated
 * with no warning, and that figure feeds `Net` and `Cost per paying customer`.
 * `rowCount` is the true total, so it is the loop's terminating condition.
 */
async function runGa4Report(
  token: string,
  propertyId: string,
  body: Record<string, unknown>,
  isOutOfTime: () => boolean = () => false
): Promise<Ga4Row[]> {
  const pageSize = typeof body.limit === "number" ? body.limit : 10_000;
  const all: Ga4Row[] = [];
  let offset = 0;
  const startedAt = Date.now();

  // Stable order is REQUIRED for offset paging; without it Google may return a row
  // twice across pages and ad spend would be DOUBLE-COUNTED.
  //
  // Ordering on the leading dimension alone is not a total order: the two reports
  // that can actually page are (date x sessionDefaultChannelGroup) and
  // (date x sessionCampaignName), so rows within one date stayed unordered and a
  // page boundary landing inside a date group could still repeat or skip a row.
  // Ordering on every dimension makes it total.
  const dimensionNames = Array.isArray(body.dimensions)
    ? body.dimensions
        .map((d) => (d as { name?: string } | undefined)?.name)
        .filter((n): n is string => Boolean(n))
    : [];
  const orderBys = dimensionNames.length
    ? dimensionNames.map((name) => ({ dimension: { dimensionName: name } }))
    : undefined;

  for (let page = 0; page < MAX_PAGES; page++) {
    // BEFORE, not after. Checking only after a page returned meant a report could
    // overshoot its own budget by a full request timeout — measured, 29.8s inside
    // a "15s" budget. And the run-level clock matters more than the per-report
    // one: 3 GA4 reports plus 2 GSC queries at 15s each is an 85s floor against a
    // 60s function limit, so without this a slow Google kills the function and
    // `recordCronRun` never writes at all.
    if (isOutOfTime() || (page > 0 && Date.now() - startedAt > PAGING_BUDGET_MS)) {
      logger.warn(
        { got: all.length, dimensions: body.dimensions },
        "GA4 report stopped early on the time budget — figures derived from it are incomplete"
      );
      return all;
    }

    const res = await fetchWithTimeout(
      `https://analyticsdata.googleapis.com/v1beta/properties/${encodeURIComponent(propertyId)}:runReport`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          ...body,
          limit: pageSize,
          offset,
          ...(orderBys ? { orderBys } : {}),
        }),
        timeoutMs: TIMEOUT_MS,
      }
    );
    if (!res.ok) {
      const detail = (await res.text().catch(() => "")).slice(0, 400);
      const hint = googleScopeHint(res.status, detail, GA4_SCOPE);
      throw new Error(hint ?? `GA4 runReport failed (${res.status}): ${detail}`);
    }
    const json = (await res.json()) as { rows?: Ga4Row[]; rowCount?: number };
    const rows = json.rows ?? [];
    all.push(...rows);

    // `rowCount` IS THE AUTHORITY WHEN PRESENT. It is documented as the total rows
    // in the query result, independent of `limit` and `offset`. Checking the short
    // page first was wrong in the other direction: a 1-row page against
    // `rowCount: 900` stopped the loop and dropped 899 rows with no warning. The
    // short page is only the fallback for when Google omits the count.
    const total = typeof json.rowCount === "number" ? json.rowCount : null;
    if (rows.length === 0) return all;
    if (total !== null ? all.length >= total : rows.length < pageSize) return all;
    offset += rows.length;

    if (Date.now() - startedAt > PAGING_BUDGET_MS) {
      logger.warn(
        { got: all.length, total, dimensions: body.dimensions },
        "GA4 report hit the paging time budget — figures derived from it are incomplete"
      );
      return all;
    }

    if (page === MAX_PAGES - 1) {
      // Never truncate silently: say what was dropped.
      logger.warn(
        { got: all.length, total, dimensions: body.dimensions },
        "GA4 report hit the page ceiling — figures derived from it are incomplete"
      );
    }
  }
  return all;
}

/** `YYYYMMDD` (GA4's `date` dimension) to `YYYY-MM-DD`. */
function ga4Date(raw: string): string {
  return raw.length === 8 ? `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}` : raw;
}

function num(v: string | undefined): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export async function ingestGa4(
  stampedAt: string,
  isOutOfTime: () => boolean = () => false
): Promise<IngestResult> {
  const propertyId = process.env.GA4_PROPERTY_ID;
  if (!propertyId) return { source: GA4_SOURCE, rows: 0, swept: 0, skipped: "ga4-no-property-id" };

  // TWO DIFFERENT THINGS, AND ONLY ONE IS WORTH WAKING SOMEONE FOR.
  // `getGoogleAccessToken()` returns null both when the env vars are unset (a
  // deliberate state) and when the token exchange FAILS — a revoked refresh
  // token, a changed password, a network error. Collapsing them into one
  // `google-not-configured` meant the cron stayed silent for the fault case, so
  // GA4 and Search Console could freeze indefinitely while the brain kept
  // answering from stale ad spend and nobody was told. `isGoogleConfigured()`
  // already existed as exactly this discriminator and was called from nowhere.
  // ALREADY OUT OF TIME BEFORE THE FIRST REQUEST. The clock check inside the
  // paging loop skipped page 0, so every report still fired one request no matter
  // what — five reports at a 15s timeout is a 75s floor against a 60s function
  // limit, and being killed there means `recordCronRun` never writes at all.
  // Reported as a skip so the cron alerts instead of recording a silent success.
  if (isOutOfTime()) {
    return { source: GA4_SOURCE, rows: 0, swept: 0, skipped: "ga4-time-budget" };
  }
  if (!isGoogleConfigured()) {
    return { source: GA4_SOURCE, rows: 0, swept: 0, skipped: "google-not-configured" };
  }
  const token = await getGoogleAccessToken();
  if (!token) {
    return { source: GA4_SOURCE, rows: 0, swept: 0, skipped: "google-token-unavailable" };
  }

  const dateRanges = [{ startDate: `${DAYS}daysAgo`, endDate: "yesterday" }];
  const windowFrom = isoDaysAgo(DAYS);

  const core = await runGa4Report(
    token,
    propertyId,
    {
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
    },
    isOutOfTime
  );

  /**
   * The last day GA4 ACTUALLY RETURNED, not the last day we asked for.
   *
   * `isoDaysAgo(1)` was a UTC guess at what `endDate: "yesterday"` means, but GA4
   * resolves "yesterday" in the PROPERTY's timezone. For a property west of UTC
   * the guess is a day later than the data, so the recorded window over-claimed
   * coverage, the funnel rollup then saw 100%, and a net profit was published with
   * no caveat while a day of spend was missing — the exact defect the window was
   * added to close. Taking the maximum date Google sent removes the timezone
   * assumption entirely: it is ground truth about what exists.
   *
   * (An interior day with no traffic is spanned by [from, to] and so cannot
   * shorten the window; only a trailing zero-traffic day could, which for a site
   * running ~300 sessions a day does not happen.)
   */
  const windowTo =
    core
      .map((r) => ga4Date(r.dimensionValues?.[0]?.value ?? ""))
      .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
      .sort()
      .pop() ?? null;

  // Channel mix and ad spend are enrichment: a failure here must not lose the
  // core numbers, and ad metrics 400 outright on a property with no linked Ads
  // account.
  // Counts per day rather than pre-rendered strings: weekly and monthly grains
  // sum these, and summing a map is correct where re-parsing prose is not.
  const channelCounts = new Map<string, Map<string, number>>();
  try {
    const rows = await runGa4Report(
      token,
      propertyId,
      {
        dateRanges,
        dimensions: [{ name: "date" }, { name: "sessionDefaultChannelGroup" }],
        metrics: [{ name: "sessions" }],
        limit: 2000,
      },
      isOutOfTime
    );
    for (const r of rows) {
      const day = ga4Date(r.dimensionValues?.[0]?.value ?? "");
      const channel = r.dimensionValues?.[1]?.value ?? "unknown";
      const sessions = num(r.metricValues?.[0]?.value);
      if (!day || sessions <= 0) continue;
      const forDay = channelCounts.get(day) ?? new Map<string, number>();
      forDay.set(channel, (forDay.get(channel) ?? 0) + sessions);
      channelCounts.set(day, forDay);
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
  const ads = new Map<string, AdDay>();
  /**
   * The last day the AD report itself covers — not the traffic report's.
   *
   * These are two separate requests with separate limits, separate paging and
   * their own try/catch, and the recorded window was taken from the CORE report
   * while being spent on caveating the AD figures. With the ad report truncated
   * to 10 of 31 days, the chunk published `Net: EUR 519.00` against a true
   * -1581, with no INCOMPLETE line at all — the May-2026 defect through a
   * different door. `orderBys` makes it sharper, not safer: date-ascending means
   * truncation deterministically drops the most RECENT days.
   *
   * Null means "do not trust this at all", which the rollup reads as zero
   * coverage and withholds every derived figure.
   */
  let adWindowTo: string | null = null;
  let adReportComplete = true;
  try {
    const rows = await runGa4Report(
      token,
      propertyId,
      {
        dateRanges,
        dimensions: [{ name: "date" }, { name: "sessionCampaignName" }],
        metrics: [
          { name: "advertiserAdCost" },
          { name: "advertiserAdClicks" },
          { name: "advertiserAdImpressions" },
        ],
        limit: 5000,
      },
      isOutOfTime
    );
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
      if (adWindowTo === null || day > adWindowTo) adWindowTo = day;
    }

    // A report that came back exactly full was probably cut off. Treating it as
    // complete is the failure this whole block exists to prevent.
    if (rows.length >= 5000) {
      adReportComplete = false;
      logger.warn({ rows: rows.length }, "brain-ingest ga4: ad report looks truncated");
    }
  } catch (err) {
    // Expected and harmless when Google Ads is not linked to this property.
    adReportComplete = false;
    logger.info({ err }, "brain-ingest ga4: no linked Google Ads data");
  }
  if (!adReportComplete) adWindowTo = null;

  interface Ga4Totals {
    sessions: number;
    users: number;
    newUsers: number;
    views: number;
    engaged: number;
    adCost: number;
    adClicks: number;
    adImpressions: number;
    channels: Map<string, number>;
    campaigns: Map<string, number>;
    firstDay: string;
    lastDay: string;
  }

  const emptyTotals = (day: string): Ga4Totals => ({
    sessions: 0,
    users: 0,
    newUsers: 0,
    views: 0,
    engaged: 0,
    adCost: 0,
    adClicks: 0,
    adImpressions: 0,
    channels: new Map(),
    campaigns: new Map(),
    firstDay: day,
    lastDay: day,
  });

  const addInto = (t: Ga4Totals, day: string, m: number[], ad?: AdDay): Ga4Totals => {
    const [sessions = 0, users = 0, newUsers = 0, views = 0, engaged = 0] = m;
    t.sessions += sessions;
    t.users += users;
    t.newUsers += newUsers;
    t.views += views;
    t.engaged += engaged;
    if (ad) {
      t.adCost += ad.cost;
      t.adClicks += ad.clicks;
      t.adImpressions += ad.impressions;
      for (const [name, cost] of ad.campaigns) {
        t.campaigns.set(name, (t.campaigns.get(name) ?? 0) + cost);
      }
    }
    for (const [name, n] of channelCounts.get(day) ?? []) {
      t.channels.set(name, (t.channels.get(name) ?? 0) + n);
    }
    if (day < t.firstDay) t.firstDay = day;
    if (day > t.lastDay) t.lastDay = day;
    return t;
  };

  const topOf = (m: Map<string, number>, unit: (n: number) => string, take = 6): string | null => {
    const entries = [...m.entries()].filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
    if (!entries.length) return null;
    return entries
      .slice(0, take)
      .map(([name, n]) => `${name} ${unit(n)}`)
      .join(", ");
  };

  const renderGa4 = (period: string, t: Ga4Totals): string =>
    [
      `Period: ${period}`,
      `Sessions: ${t.sessions} · Users: ${t.users} · New users: ${t.newUsers}`,
      `Page views: ${t.views} · Engaged sessions: ${t.engaged}`,
      topOf(t.channels, (n) => String(n))
        ? `Channels: ${topOf(t.channels, (n) => String(n))}`
        : null,
      t.adCost || t.adClicks
        ? `Google Ads spend: EUR ${t.adCost.toFixed(2)} · ${t.adClicks} ad clicks · ${t.adImpressions} ad impressions`
        : null,
      topOf(t.campaigns, (n) => `EUR ${n.toFixed(2)}`, 5)
        ? `Ad campaigns: ${topOf(t.campaigns, (n) => `EUR ${n.toFixed(2)}`, 5)}`
        : null,
    ]
      .filter((l) => l !== null)
      .join("\n");

  const chunks: BrainRow[] = [];
  const ga4Weeks = new Map<string, Ga4Totals>();
  const ga4Months = new Map<string, Ga4Totals>();

  for (const r of core) {
    const day = ga4Date(r.dimensionValues?.[0]?.value ?? "");
    if (!day) continue;
    const metrics = (r.metricValues ?? []).map((m) => num(m.value));
    const [sessions = 0, users = 0] = metrics;
    if (!sessions && !users) continue;

    const ad = ads.get(day);
    const week = isoWeek(day);
    const month = day.slice(0, 7);
    ga4Weeks.set(week, addInto(ga4Weeks.get(week) ?? emptyTotals(day), day, metrics, ad));
    ga4Months.set(month, addInto(ga4Months.get(month) ?? emptyTotals(day), day, metrics, ad));

    const daily = addInto(emptyTotals(day), day, metrics, ad);
    chunks.push({
      source: GA4_SOURCE,
      source_id: `daily:${day}`,
      title: `Google Analytics — ${longDate(day)}`,
      url: null,
      body: renderGa4(`${longDate(day)} (${day})`, daily),
      meta: {
        grain: "day",
        day,
        sessions,
        users,
        ...(ad ? { ad_cost: ad.cost, ad_clicks: ad.clicks, ad_impressions: ad.impressions } : {}),
        // The window this run ASKED for, not the days that came back. GA4 omits
        // zero-traffic days, so the analytics rollup cannot tell "no spend" from
        // "no data" without this — and it needs to, because it decides whether a
        // period's net profit is safe to publish.
        window_from: windowFrom,
        window_to: windowTo,
        // The AD report's own reach. `window_to` above describes the TRAFFIC
        // report; spending it on ad-spend caveats published a profit where the
        // truth was a loss.
        ad_window_to: adWindowTo,
      },
      updated_at: stampedAt,
      period_end: day,
    });
  }

  for (const [week, t] of ga4Weeks) {
    const label = `week of ${longDate(t.firstDay)} to ${longDate(t.lastDay)}`;
    chunks.push({
      source: GA4_SOURCE,
      source_id: `weekly:${week}`,
      title: `Google Analytics — ${label}`,
      url: null,
      body: renderGa4(`${label} (${week})`, t),
      meta: { grain: "week", week, sessions: t.sessions, ad_cost: t.adCost },
      updated_at: stampedAt,
      period_end: t.lastDay,
    });
  }

  for (const [month, t] of ga4Months) {
    const label = longMonth(month);
    chunks.push({
      source: GA4_SOURCE,
      source_id: `monthly:${month}`,
      title: `Google Analytics — ${label} (monthly total)`,
      url: null,
      body: renderGa4(
        `${label} — ${
          t.lastDay >= monthEnd(month)
            ? "whole month"
            : `month so far, ${longDate(t.firstDay)} to ${longDate(t.lastDay)}`
        } (${month})`,
        t
      ),
      meta: { grain: "month", month, sessions: t.sessions, ad_cost: t.adCost },
      updated_at: stampedAt,
      period_end: t.lastDay,
    });
  }

  const written = await upsertChunks(chunks);
  const swept = await sweepStale(GA4_SOURCE, stampedAt, written);
  return { source: GA4_SOURCE, rows: written, swept };
}

interface GscRow {
  keys?: string[];
  clicks?: number;
  impressions?: number;
  ctr?: number;
  position?: number;
}

/**
 * One Search Console query, PAGED TO COMPLETION via `startRow`.
 *
 * Worse than GA4's truncation in kind: the (date, query) report is ordered by
 * clicks, so cutting it off drops whole quiet days' query rows. The per-query
 * totals in `Top search queries` then became partial sums presented as period
 * totals, while the headline clicks/impressions (from the date-only report) stayed
 * correct — so the two numbers disagreed inside a single chunk.
 *
 * There is no `rowCount` here, so a short page is the terminating signal.
 */
async function queryGsc(
  token: string,
  site: string,
  body: Record<string, unknown>,
  isOutOfTime: () => boolean = () => false
): Promise<GscRow[]> {
  const pageSize = typeof body.rowLimit === "number" ? body.rowLimit : 5000;
  const all: GscRow[] = [];
  let startRow = 0;
  const startedAt = Date.now();

  for (let page = 0; page < MAX_PAGES; page++) {
    if (isOutOfTime() || (page > 0 && Date.now() - startedAt > PAGING_BUDGET_MS)) {
      logger.warn(
        { got: all.length, dimensions: body.dimensions },
        "Search Console query stopped early on the time budget — query totals are incomplete"
      );
      return all;
    }

    const res = await fetchWithTimeout(
      `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site)}/searchAnalytics/query`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, rowLimit: pageSize, startRow }),
        timeoutMs: TIMEOUT_MS,
      }
    );
    if (!res.ok) {
      const detail = (await res.text().catch(() => "")).slice(0, 400);
      const hint = googleScopeHint(res.status, detail, SEARCH_CONSOLE_SCOPE);
      throw new Error(hint ?? `Search Console query failed (${res.status}): ${detail}`);
    }
    const json = (await res.json()) as { rows?: GscRow[] };
    const rows = json.rows ?? [];
    all.push(...rows);

    if (rows.length < pageSize) return all;
    startRow += rows.length;

    if (Date.now() - startedAt > PAGING_BUDGET_MS) {
      logger.warn(
        { got: all.length, dimensions: body.dimensions },
        "Search Console query hit the paging time budget — query totals are incomplete"
      );
      return all;
    }

    if (page === MAX_PAGES - 1) {
      logger.warn(
        { got: all.length, dimensions: body.dimensions },
        "Search Console query hit the page ceiling — query totals are incomplete"
      );
    }
  }
  return all;
}

export async function ingestSearchConsole(
  stampedAt: string,
  isOutOfTime: () => boolean = () => false
): Promise<IngestResult> {
  const site = process.env.SEARCH_CONSOLE_SITE;
  if (!site) return { source: GSC_SOURCE, rows: 0, swept: 0, skipped: "gsc-no-site" };

  // TWO DIFFERENT THINGS, AND ONLY ONE IS WORTH WAKING SOMEONE FOR.
  // `getGoogleAccessToken()` returns null both when the env vars are unset (a
  // deliberate state) and when the token exchange FAILS — a revoked refresh
  // token, a changed password, a network error. Collapsing them into one
  // `google-not-configured` meant the cron stayed silent for the fault case, so
  // GA4 and Search Console could freeze indefinitely while the brain kept
  // answering from stale ad spend and nobody was told. `isGoogleConfigured()`
  // already existed as exactly this discriminator and was called from nowhere.
  // ALREADY OUT OF TIME BEFORE THE FIRST REQUEST. The clock check inside the
  // paging loop skipped page 0, so every report still fired one request no matter
  // what — five reports at a 15s timeout is a 75s floor against a 60s function
  // limit, and being killed there means `recordCronRun` never writes at all.
  // Reported as a skip so the cron alerts instead of recording a silent success.
  if (isOutOfTime()) {
    return { source: GSC_SOURCE, rows: 0, swept: 0, skipped: "gsc-time-budget" };
  }
  if (!isGoogleConfigured()) {
    return { source: GSC_SOURCE, rows: 0, swept: 0, skipped: "google-not-configured" };
  }
  const token = await getGoogleAccessToken();
  if (!token) {
    return { source: GSC_SOURCE, rows: 0, swept: 0, skipped: "google-token-unavailable" };
  }

  // Search Console data lags ~2 days; asking for today returns empty rows.
  const startDate = isoDaysAgo(DAYS);
  const endDate = isoDaysAgo(2);

  const daily = await queryGsc(
    token,
    site,
    {
      startDate,
      endDate,
      dimensions: ["date"],
      rowLimit: 500,
    },
    isOutOfTime
  );

  // The queries are the point: nothing else in our stack knows what people typed
  // into Google to find us.
  const queryStats = new Map<string, Map<string, { clicks: number; impressions: number }>>();
  try {
    const rows = await queryGsc(
      token,
      site,
      {
        startDate,
        endDate,
        dimensions: ["date", "query"],
        rowLimit: 5000,
      },
      isOutOfTime
    );
    for (const r of rows) {
      const day = r.keys?.[0];
      const query = r.keys?.[1];
      if (!day || !query) continue;
      const forDay =
        queryStats.get(day) ?? new Map<string, { clicks: number; impressions: number }>();
      const cur = forDay.get(query) ?? { clicks: 0, impressions: 0 };
      cur.clicks += r.clicks ?? 0;
      cur.impressions += r.impressions ?? 0;
      forDay.set(query, cur);
      queryStats.set(day, forDay);
    }
  } catch (err) {
    logger.warn({ err }, "brain-ingest gsc: query breakdown unavailable");
  }

  interface GscTotals {
    clicks: number;
    impressions: number;
    /** Sum of position x impressions, so the mean can be impression-weighted. */
    positionWeighted: number;
    queries: Map<string, { clicks: number; impressions: number }>;
    firstDay: string;
    lastDay: string;
  }

  const emptyGsc = (day: string): GscTotals => ({
    clicks: 0,
    impressions: 0,
    positionWeighted: 0,
    queries: new Map(),
    firstDay: day,
    lastDay: day,
  });

  const addGsc = (t: GscTotals, day: string, r: GscRow): GscTotals => {
    const clicks = r.clicks ?? 0;
    const impressions = r.impressions ?? 0;
    t.clicks += clicks;
    t.impressions += impressions;
    t.positionWeighted += (r.position ?? 0) * impressions;
    for (const [q, v] of queryStats.get(day) ?? []) {
      const cur = t.queries.get(q) ?? { clicks: 0, impressions: 0 };
      cur.clicks += v.clicks;
      cur.impressions += v.impressions;
      t.queries.set(q, cur);
    }
    if (day < t.firstDay) t.firstDay = day;
    if (day > t.lastDay) t.lastDay = day;
    return t;
  };

  const renderGsc = (period: string, t: GscTotals): string => {
    // Recomputed from totals, never averaged across days: a quiet day with one
    // lucky impression would otherwise drag a whole month's rate around.
    const ctr = t.impressions ? (t.clicks / t.impressions) * 100 : 0;
    const position = t.impressions ? t.positionWeighted / t.impressions : 0;
    const top = [...t.queries.entries()]
      .sort((a, b) => b[1].impressions - a[1].impressions)
      .slice(0, 10)
      .map(([q, v]) => `"${q}" (${v.clicks} clicks, ${v.impressions} impressions)`)
      .join("; ");
    return [
      `Period: ${period}`,
      `Google search clicks: ${t.clicks} · Impressions: ${t.impressions}`,
      `Click-through rate: ${ctr.toFixed(2)}% · Average position: ${position.toFixed(1)}`,
      top ? `Top search queries: ${top}` : null,
    ]
      .filter((l) => l !== null)
      .join("\n");
  };

  const chunks: BrainRow[] = [];
  const gscWeeks = new Map<string, GscTotals>();
  const gscMonths = new Map<string, GscTotals>();

  for (const r of daily) {
    const day = r.keys?.[0];
    if (!day) continue;
    const clicks = r.clicks ?? 0;
    const impressions = r.impressions ?? 0;
    if (!clicks && !impressions) continue;

    const week = isoWeek(day);
    const month = day.slice(0, 7);
    gscWeeks.set(week, addGsc(gscWeeks.get(week) ?? emptyGsc(day), day, r));
    gscMonths.set(month, addGsc(gscMonths.get(month) ?? emptyGsc(day), day, r));

    chunks.push({
      source: GSC_SOURCE,
      source_id: `daily:${day}`,
      title: `Google Search Console — ${longDate(day)}`,
      url: null,
      body: renderGsc(`${longDate(day)} (${day})`, addGsc(emptyGsc(day), day, r)),
      meta: { grain: "day", day, clicks, impressions, position: r.position ?? 0 },
      updated_at: stampedAt,
      period_end: day,
    });
  }

  for (const [week, t] of gscWeeks) {
    const label = `week of ${longDate(t.firstDay)} to ${longDate(t.lastDay)}`;
    chunks.push({
      source: GSC_SOURCE,
      source_id: `weekly:${week}`,
      title: `Google Search Console — ${label}`,
      url: null,
      body: renderGsc(`${label} (${week})`, t),
      meta: { grain: "week", week, clicks: t.clicks, impressions: t.impressions },
      updated_at: stampedAt,
      period_end: t.lastDay,
    });
  }

  for (const [month, t] of gscMonths) {
    const label = longMonth(month);
    chunks.push({
      source: GSC_SOURCE,
      source_id: `monthly:${month}`,
      title: `Google Search Console — ${label} (monthly total)`,
      url: null,
      body: renderGsc(
        `${label} — ${
          t.lastDay >= monthEnd(month)
            ? "whole month"
            : `month so far, ${longDate(t.firstDay)} to ${longDate(t.lastDay)}`
        } (${month})`,
        t
      ),
      meta: { grain: "month", month, clicks: t.clicks, impressions: t.impressions },
      updated_at: stampedAt,
      period_end: t.lastDay,
    });
  }

  const written = await upsertChunks(chunks);
  const swept = await sweepStale(GSC_SOURCE, stampedAt, written);
  return { source: GSC_SOURCE, rows: written, swept };
}

export function googleIngestersConfigured(): boolean {
  return isGoogleConfigured();
}
