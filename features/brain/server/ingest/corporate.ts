import {
  getGoogleAccessToken,
  googleCredentialShape,
  isGoogleConfigured,
} from "@shared/http/google-oauth";
import logger from "@shared/observability/logger";
import { isoWeek, longDate, longMonth, monthEnd } from "./analytics";
import { ga4Date, isoWeekBounds, num, queryGsc, runGa4Report, type GscRow } from "./google";
import {
  recordSweep,
  shouldSweep,
  sweepStale,
  upsertChunks,
  type BrainRow,
  type IngestResult,
} from "./upsert";

/**
 * appliedpsychometrics.org -- the corporate website of Applied Psychometrics UG, the company
 * that operates LoveIQ -- as source `corporate`: its Google Analytics 4 traffic and the Google
 * searches that find it.
 *
 * OPT-IN, like the books and the papers (migration 20261004150000): a second website's visits
 * sitting beside LoveIQ's own `ga4` rows would answer "how many visitors did we have" with the
 * wrong site's numbers. A caller asks for it by name, `sources: ["corporate"]`.
 *
 * ITS OWN SOURCE, NOT `ga4` AND `gsc`. Every ingester's sweep deletes the rows of its source
 * that the run did not write, so under `ga4` this ingester and LoveIQ's would delete each
 * other's rows every night, and LoveIQ's money rollups read `ga4`.
 *
 * THE WHOLE HISTORY, EVERY RUN. The site went live on 30 September 2026 and has a handful of
 * visits a day, so re-reading everything since launch is a few dozen rows. A weekly or monthly
 * row is therefore always built from its whole period, which is the failure google.ts guards
 * against at length, and a failed night costs nothing the next one does not re-read.
 * ponytail: a full re-read each night; move to google.ts's ten-day window and touchChunks
 * once a report nears GA4's 10,000-row page.
 *
 * GA4 HERE COUNTS ONLY VISITORS WHO ACCEPTED ANALYTICS COOKIES: the site loads it after the
 * CookieYes banner, not before. Every traffic row says so, because the figures look small
 * for a reason a reader would otherwise guess at.
 */
const SOURCE = "corporate";
/** GA4 property "Applied Psychometrics", in LoveIQ's GA account. */
const PROPERTY_ID = "556864746";
const SITE = "sc-domain:appliedpsychometrics.org";
const SITE_NAME = "appliedpsychometrics.org";
/** The day before launch, so no timezone can cut the first day off. */
const SINCE = "2026-09-29";

const WHOSE =
  "Applied Psychometrics' corporate website, appliedpsychometrics.org: the parent company's " +
  "own site, not LoveIQ.";
const CONSENT_NOTE =
  "GA4 counts only visitors who accepted analytics cookies in the site's cookie banner.";

interface Traffic {
  sessions: number;
  users: number | null;
  newUsers: number | null;
  views: number;
  engaged: number;
  channels: Map<string, number>;
}

const emptyTraffic = (): Traffic => ({
  sessions: 0,
  users: null,
  newUsers: null,
  views: 0,
  engaged: 0,
  channels: new Map(),
});

const listOf = (m: Map<string, number>, limit: number, unit = (_n: number) => ""): string =>
  [...m.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([k, v]) => `${k} ${v}${unit(v)}`)
    .join(", ");

function renderTraffic(period: string, t: Traffic, extra: string[] = []): string {
  return [
    WHOSE,
    `Period: ${period}`,
    `Sessions: ${t.sessions} · Users: ${t.users ?? "n/a"} · New users: ${t.newUsers ?? "n/a"} · ` +
      `Page views: ${t.views} · Engaged sessions: ${t.engaged}`,
    t.channels.size ? `Sessions by channel: ${listOf(t.channels, 8)}` : null,
    ...extra,
    CONSENT_NOTE,
  ]
    .filter((l): l is string => Boolean(l))
    .join("\n");
}

interface Search {
  clicks: number;
  impressions: number;
  positionWeighted: number;
  queries: Map<string, number>;
}

function addSearch(s: Search, r: GscRow): void {
  s.clicks += r.clicks ?? 0;
  s.impressions += r.impressions ?? 0;
  s.positionWeighted += (r.position ?? 0) * (r.impressions ?? 0);
}

function renderSearch(period: string, s: Search): string {
  const ctr = s.impressions ? ((s.clicks / s.impressions) * 100).toFixed(2) : "0.00";
  const position = s.impressions ? (s.positionWeighted / s.impressions).toFixed(1) : "n/a";
  return [
    WHOSE,
    `Period: ${period}`,
    `Google search clicks: ${s.clicks} · Impressions: ${s.impressions} · ` +
      `Click-through rate: ${ctr}% · Average position: ${position}`,
    s.queries.size ? `Top search queries by impressions: ${listOf(s.queries, 10)}` : null,
  ]
    .filter((l): l is string => Boolean(l))
    .join("\n");
}

/** "2026-W40" from GA4's isoYearIsoWeek "202640". */
const ga4Week = (raw: string): string => `${raw.slice(0, 4)}-W${raw.slice(4)}`;
/** "2026-10" from GA4's yearMonth "202610". */
const ga4Month = (raw: string): string => `${raw.slice(0, 4)}-${raw.slice(4)}`;

export async function ingestCorporateSite(
  stampedAt: string,
  isOutOfTime: () => boolean = () => false,
  /** Vercel's per-request identity token; see readVercelOidcToken(). */
  oidcToken?: string | null
): Promise<IngestResult> {
  if (isOutOfTime()) return { source: SOURCE, rows: 0, swept: 0, skipped: "corporate-time-budget" };
  if (!isGoogleConfigured()) {
    return { source: SOURCE, rows: 0, swept: 0, skipped: "google-not-configured" };
  }
  const token = await getGoogleAccessToken(Date.now(), oidcToken);
  if (!token) {
    return {
      source: SOURCE,
      rows: 0,
      swept: 0,
      skipped: `google-token-unavailable(${googleCredentialShape(oidcToken)})`,
    };
  }

  const today = stampedAt.slice(0, 10);
  const dateRanges = [{ startDate: SINCE, endDate: "today" }];
  const metrics = [
    { name: "sessions" },
    { name: "totalUsers" },
    { name: "newUsers" },
    { name: "screenPageViews" },
    { name: "engagedSessions" },
  ];
  const report = (dimensions: string[], extra: Record<string, unknown> = {}) =>
    runGa4Report(
      token,
      PROPERTY_ID,
      {
        dateRanges,
        dimensions: dimensions.map((name) => ({ name })),
        metrics,
        limit: 10_000,
        ...extra,
      },
      isOutOfTime
    );

  // Users are not additive, so each grain asks GA4 for its own unique counts; sessions,
  // views and channels are, so weeks and months also total the daily channel rows.
  const [byDay, byWeek, byMonth, byDayChannel] = await Promise.all([
    report(["date"]),
    report(["isoYearIsoWeek"]),
    report(["yearMonth"]),
    report(["date", "sessionDefaultChannelGroup"]),
  ]);

  const days = new Map<string, Traffic>();
  const weeks = new Map<string, Traffic>();
  const months = new Map<string, Traffic>();
  const fill = (into: Map<string, Traffic>, key: string, m: Array<{ value?: string }> = []) => {
    const t = into.get(key) ?? emptyTraffic();
    t.sessions = num(m[0]?.value);
    t.users = num(m[1]?.value);
    t.newUsers = num(m[2]?.value);
    t.views = num(m[3]?.value);
    t.engaged = num(m[4]?.value);
    into.set(key, t);
  };
  for (const r of byDay) fill(days, ga4Date(r.dimensionValues?.[0]?.value ?? ""), r.metricValues);
  for (const r of byWeek) fill(weeks, ga4Week(r.dimensionValues?.[0]?.value ?? ""), r.metricValues);
  for (const r of byMonth)
    fill(months, ga4Month(r.dimensionValues?.[0]?.value ?? ""), r.metricValues);
  for (const r of byDayChannel) {
    const day = ga4Date(r.dimensionValues?.[0]?.value ?? "");
    const channel = r.dimensionValues?.[1]?.value || "Unassigned";
    const sessions = num(r.metricValues?.[0]?.value);
    if (!sessions) continue;
    for (const [into, key] of [
      [days, day],
      [weeks, isoWeek(day)],
      [months, day.slice(0, 7)],
    ] as const) {
      const t = into.get(key) ?? emptyTraffic();
      t.channels.set(channel, (t.channels.get(channel) ?? 0) + sessions);
      into.set(key, t);
    }
  }

  // Best-effort extras for the monthly rows: the pages read most, and the clicks out to
  // LoveIQ, which are the reason the site exists. Losing them must not lose the traffic.
  const topPages = new Map<string, Map<string, number>>();
  const linkClicks = new Map<string, Map<string, number>>();
  // Unknown is not zero: when this report fails, the monthly row says nothing about clicks
  // rather than "none recorded".
  let extrasRead = false;
  try {
    for (const r of await runGa4Report(
      token,
      PROPERTY_ID,
      {
        dateRanges,
        dimensions: [{ name: "yearMonth" }, { name: "pagePath" }],
        metrics: [{ name: "screenPageViews" }],
        limit: 10_000,
      },
      isOutOfTime
    )) {
      const month = ga4Month(r.dimensionValues?.[0]?.value ?? "");
      const page = topPages.get(month) ?? new Map<string, number>();
      page.set(r.dimensionValues?.[1]?.value ?? "(not set)", num(r.metricValues?.[0]?.value));
      topPages.set(month, page);
    }
    for (const r of await runGa4Report(
      token,
      PROPERTY_ID,
      {
        dateRanges,
        dimensions: [{ name: "yearMonth" }, { name: "linkDomain" }],
        metrics: [{ name: "eventCount" }],
        dimensionFilter: { filter: { fieldName: "eventName", stringFilter: { value: "click" } } },
        limit: 10_000,
      },
      isOutOfTime
    )) {
      const month = ga4Month(r.dimensionValues?.[0]?.value ?? "");
      const domain = r.dimensionValues?.[1]?.value;
      if (!domain || domain === "(not set)") continue;
      const clicks = linkClicks.get(month) ?? new Map<string, number>();
      clicks.set(domain, (clicks.get(domain) ?? 0) + num(r.metricValues?.[0]?.value));
      linkClicks.set(month, clicks);
    }
    extrasRead = true;
  } catch (err) {
    logger.warn({ err }, "brain-ingest corporate: top pages or link clicks unavailable");
  }

  // Search Console. Its failure is held until the traffic rows are written, then rethrown,
  // so a bad night still records the visits and still alerts -- and skips the sweep, which
  // would otherwise delete the search rows this run could not rewrite.
  let searchError: unknown = null;
  let searchDays: GscRow[] = [];
  let searchQueries: GscRow[] = [];
  try {
    const body = { startDate: SINCE, endDate: today };
    searchDays = await queryGsc(
      token,
      SITE,
      { ...body, dimensions: ["date"], rowLimit: 5000 },
      isOutOfTime
    );
    searchQueries = await queryGsc(
      token,
      SITE,
      { ...body, dimensions: ["date", "query"], rowLimit: 5000 },
      isOutOfTime
    );
  } catch (err) {
    searchError = err;
  }

  const rows: BrainRow[] = [];
  const row = (
    sourceId: string,
    title: string,
    body: string,
    meta: Record<string, unknown>,
    periodEnd: string
  ) =>
    rows.push({
      source: SOURCE,
      source_id: sourceId,
      title,
      url: null,
      body,
      meta: { site: SITE_NAME, ...meta },
      updated_at: stampedAt,
      period_end: periodEnd,
    });

  for (const [day, t] of days) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
    const label = `${longDate(day)} (${day})${day === today ? ", so far" : ""}`;
    row(
      `ga4-day:${day}`,
      `${SITE_NAME} website traffic — ${longDate(day)}`,
      renderTraffic(label, t),
      { grain: "day", day, sessions: t.sessions, users: t.users },
      day
    );
  }
  for (const [week, t] of weeks) {
    if (!/^\d{4}-W\d{2}$/.test(week)) continue;
    const anyDay = [...days.keys()].find((d) => isoWeek(d) === week);
    if (!anyDay) continue;
    const { first, last } = isoWeekBounds(anyDay);
    const label = `week of ${longDate(first)} to ${longDate(last)} (${week})${last >= today ? ", so far" : ""}`;
    row(
      `ga4-week:${week}`,
      `${SITE_NAME} website traffic — week of ${longDate(first)}`,
      renderTraffic(label, t),
      { grain: "week", week, sessions: t.sessions, users: t.users },
      last < today ? last : today
    );
  }
  for (const [month, t] of months) {
    if (!/^\d{4}-\d{2}$/.test(month)) continue;
    const last = monthEnd(month);
    const label = `${longMonth(month)} (${month})${last >= today ? ", so far" : ""}`;
    const pages = topPages.get(month);
    const clicks = linkClicks.get(month);
    row(
      `ga4-month:${month}`,
      `${SITE_NAME} website traffic — ${longMonth(month)}`,
      renderTraffic(
        label,
        t,
        [
          pages?.size
            ? `Most-viewed pages: ${listOf(pages, 8, (n) => (n === 1 ? " view" : " views"))}`
            : null,
          extrasRead
            ? `Clicks out to other websites: ${clicks?.size ? listOf(clicks, 8) : "none recorded"}`
            : null,
        ].filter((l): l is string => Boolean(l))
      ),
      { grain: "month", month, sessions: t.sessions, users: t.users },
      last < today ? last : today
    );
  }

  const searchByDay = new Map<string, Search>();
  const searchByWeek = new Map<string, Search>();
  const searchByMonth = new Map<string, Search>();
  const blank = (): Search => ({
    clicks: 0,
    impressions: 0,
    positionWeighted: 0,
    queries: new Map(),
  });
  for (const r of searchDays) {
    const day = r.keys?.[0];
    if (!day || (!r.clicks && !r.impressions)) continue;
    for (const [into, key] of [
      [searchByDay, day],
      [searchByWeek, isoWeek(day)],
      [searchByMonth, day.slice(0, 7)],
    ] as const) {
      const s = into.get(key) ?? blank();
      addSearch(s, r);
      into.set(key, s);
    }
  }
  for (const r of searchQueries) {
    const [day, query] = r.keys ?? [];
    if (!day || !query) continue;
    for (const [into, key] of [
      [searchByDay, day],
      [searchByWeek, isoWeek(day)],
      [searchByMonth, day.slice(0, 7)],
    ] as const) {
      const s = into.get(key);
      if (s) s.queries.set(query, (s.queries.get(query) ?? 0) + (r.impressions ?? 0));
    }
  }
  for (const [day, s] of searchByDay) {
    row(
      `gsc-day:${day}`,
      `${SITE_NAME} Google searches — ${longDate(day)}`,
      renderSearch(`${longDate(day)} (${day})`, s),
      { grain: "day", day, clicks: s.clicks, impressions: s.impressions },
      day
    );
  }
  for (const [week, s] of searchByWeek) {
    const anyDay = [...searchByDay.keys()].find((d) => isoWeek(d) === week);
    if (!anyDay) continue;
    const { first, last } = isoWeekBounds(anyDay);
    row(
      `gsc-week:${week}`,
      `${SITE_NAME} Google searches — week of ${longDate(first)}`,
      renderSearch(`week of ${longDate(first)} to ${longDate(last)} (${week})`, s),
      { grain: "week", week, clicks: s.clicks, impressions: s.impressions },
      last < today ? last : today
    );
  }
  for (const [month, s] of searchByMonth) {
    const last = monthEnd(month);
    row(
      `gsc-month:${month}`,
      `${SITE_NAME} Google searches — ${longMonth(month)}`,
      renderSearch(`${longMonth(month)} (${month})`, s),
      { grain: "month", month, clicks: s.clicks, impressions: s.impressions },
      last < today ? last : today
    );
  }

  const written = await upsertChunks(rows);
  if (searchError) throw searchError;

  const sweeping = await shouldSweep(SOURCE);
  if (sweeping) await recordSweep(SOURCE);
  const swept = sweeping ? await sweepStale(SOURCE, stampedAt, written) : 0;
  return { source: SOURCE, rows: written, swept };
}
