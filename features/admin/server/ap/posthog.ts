/**
 * What AP-Analytics reads from PostHog: the counts our own tables cannot give (a visitor
 * coming back on another day, the landing page's scroll and bounce, clicks inside the survey
 * intro). PostHog records about half of the site's visitors (blockers, bots it drops) and
 * starts on 23 Aug 2026, so the pages show these as shares, labelled as PostHog's.
 *
 * Every query goes through hogqlTable, the app's one HogQL door (its row cap and table
 * allowlist apply), and only on the live site's host.
 */
import { hogqlTable } from "@features/ux-review/server/review";
import logger from "@shared/observability/logger";

import { windowOf } from "./filters";

export const POSTHOG_FROM = "2026-08-23";
const HOST = "www.loveiq.org";

/** A Berlin day boundary as HogQL reads it: an instant, in UTC. */
function at(d: Date): string {
  return `toDateTime('${d.toISOString().slice(0, 19).replace("T", " ")}', 'UTC')`;
}

export type PostHogResult<T> = { ok: true; value: T } | { ok: false; error: string };

const UNREADABLE = "PostHog could not be read just now. Try again in a minute.";

/** A PostHog read that threw: logged with its details, shown to the reader plainly. */
export function postHogFailed(err: unknown): { ok: false; error: string } {
  logger.warn({ err }, "AP: PostHog read threw");
  return { ok: false, error: UNREADABLE };
}

const cache = new Map<string, { at: number; result: Promise<PostHogResult<unknown[][]>> }>();
const CACHE_MS = 5 * 60_000;

/** One HogQL query's rows, cached for five minutes (a failure is not kept). */
function rows(query: string, cap: number): Promise<PostHogResult<unknown[][]>> {
  const key = `${cap}\n${query}`;
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && now - hit.at < CACHE_MS) return hit.result;
  const result = hogqlTable(query, cap).then((r): PostHogResult<unknown[][]> => {
    if (!r.ok) {
      // The details (status, query) are for the logs; the page says it plainly.
      logger.warn({ error: r.error }, "AP: PostHog query failed");
      return { ok: false, error: UNREADABLE };
    }
    if (r.cut)
      return { ok: false, error: "PostHog cut the answer short; the figures would be incomplete." };
    return { ok: true, value: r.rows };
  });
  cache.set(key, { at: now, result });
  result.then(
    (r) => {
      if (!r.ok) cache.delete(key);
    },
    () => cache.delete(key)
  );
  if (cache.size > 100) cache.delete(cache.keys().next().value!);
  return result;
}

export interface NewReturning {
  new: { visitors: number; started: number; completed: number };
  returning: { visitors: number; started: number; completed: number };
}

/**
 * Visitors to the live site in the range, split by whether PostHog had seen them before it,
 * and how many of each started and finished the survey.
 */
export async function fetchNewReturning(
  from: string,
  to: string
): Promise<PostHogResult<NewReturning>> {
  const { since, until } = windowOf({ from, to });
  const q = `
    SELECT grp, count() AS visitors, sum(started) AS started, sum(completed) AS completed
    FROM (
      SELECT person_id,
             if(min(timestamp) >= ${at(since)}, 'new', 'returning') AS grp,
             max(if(event = 'survey_started' AND timestamp >= ${at(since)}, 1, 0)) AS started,
             max(if(event = 'survey_completed' AND timestamp >= ${at(since)}, 1, 0)) AS completed,
             max(if(event = '$pageview' AND timestamp >= ${at(since)}, 1, 0)) AS active
      FROM events
      WHERE properties.$host = '${HOST}'
        AND event IN ('$pageview', 'survey_started', 'survey_completed')
        AND timestamp < ${at(until)}
      GROUP BY person_id
    )
    WHERE active = 1
    GROUP BY grp
    LIMIT 10`;
  const r = await rows(q, 10);
  if (!r.ok) return r;
  const out: NewReturning = {
    new: { visitors: 0, started: 0, completed: 0 },
    returning: { visitors: 0, started: 0, completed: 0 },
  };
  for (const [grp, visitors, started, completed] of r.value) {
    const g = grp === "new" ? out.new : grp === "returning" ? out.returning : null;
    if (g) {
      g.visitors = Number(visitors) || 0;
      g.started = Number(started) || 0;
      g.completed = Number(completed) || 0;
    }
  }
  return { ok: true, value: out };
}

export interface SurveyIntroClicks {
  opened: number;
  skipped: number;
  agreed: number;
  returned: number;
  trust: number;
  terms: number;
  answered: number;
  /** Tapped the silhouette on the intro card (it has no text, only its aria-label). */
  silhouette: number;
}

/**
 * Sessions on the survey page and what they clicked in the intro: the silhouette, Skip Intro,
 * I agree, Return to site, the Trust Zone and the terms links, and whether they answered a
 * question. PostHog's autocapture names a button by its text (or its aria-label in the
 * elements chain), so a renamed button needs this list too.
 * The report's pre-wizard runs on the same page with its own Skip Intro (class wz-skip), so
 * that one is left out here and counted for the report page.
 */
export async function fetchSurveyIntroClicks(
  from: string,
  to: string
): Promise<PostHogResult<SurveyIntroClicks>> {
  const { since, until } = windowOf({ from, to });
  const q = `
    SELECT uniqExact($session_id) AS opened,
           uniqExactIf($session_id, properties.$el_text = 'Skip Intro' AND elements_chain NOT LIKE '%wz-skip%') AS skipped,
           uniqExactIf($session_id, properties.$el_text = 'I agree') AS agreed,
           uniqExactIf($session_id, lower(properties.$el_text) = 'return to site') AS returned,
           uniqExactIf($session_id, properties.$el_text = '> Trust Zone') AS trust,
           uniqExactIf($session_id, properties.$el_text IN ('Terms & Conditions', 'Digital Content & Subscription Terms', 'Terms of Use')) AS terms,
           uniqExactIf($session_id, event = 'survey_answer') AS answered,
           uniqExactIf($session_id, event = '$autocapture' AND elements_chain LIKE '%Continue to survey introduction%') AS silhouette
    FROM events
    WHERE properties.$host = '${HOST}'
      AND properties.$pathname = '/survey'
      AND timestamp >= ${at(since)} AND timestamp < ${at(until)}
    LIMIT 1`;
  const r = await rows(q, 1);
  if (!r.ok) return r;
  const [opened, skipped, agreed, returned, trust, terms, answered, silhouette] = (
    r.value[0] ?? []
  ).map((v) => Number(v) || 0);
  return {
    ok: true,
    value: {
      opened: opened ?? 0,
      skipped: skipped ?? 0,
      agreed: agreed ?? 0,
      returned: returned ?? 0,
      trust: trust ?? 0,
      terms: terms ?? 0,
      answered: answered ?? 0,
      silhouette: silhouette ?? 0,
    },
  };
}

export interface ReportReturns {
  /** Report sessions after a reader's first, by how they arrived. */
  sources: Array<{ source: string; sessions: number }>;
  /** People who opened their report from each email campaign's link. */
  campaigns: Array<{ campaign: string; people: number }>;
  /** Sessions that clicked Skip Intro in the report's pre-wizard (class wz-skip). */
  wizardSkips: number;
}

/**
 * How readers came back to their report: every report session that began more than 30
 * minutes after their first one, by its first page's link (an email link carries
 * utm_source=email or from=email). Report links hold an access token, so only the class
 * of a link leaves PostHog, never the link.
 */
export async function fetchReportReturns(
  from: string,
  to: string
): Promise<PostHogResult<ReportReturns>> {
  const { since, until } = windowOf({ from, to });
  const reportViews = `event = '$pageview' AND properties.$host = '${HOST}' AND properties.$pathname LIKE '/report/%'`;
  const sourcesQ = `
    SELECT cls, count() AS sessions FROM (
      SELECT multiIf(s.url LIKE '%utm_source=email%' OR s.url LIKE '%from=email%', 'Email link',
                     s.url LIKE '%share%', 'Share link from a friend',
                     s.url LIKE '%utm_%' OR s.url LIKE '%gclid%', 'Another tagged link',
                     'Bookmark or direct') AS cls,
             s.t AS t, f.first_t AS first_t
      FROM (SELECT $session_id AS session, person_id AS pid, min(timestamp) AS t, argMin(properties.$current_url, timestamp) AS url
              FROM events WHERE ${reportViews} AND timestamp < ${at(until)} GROUP BY session, pid) AS s
      JOIN (SELECT person_id AS pid, min(timestamp) AS first_t FROM events WHERE ${reportViews} GROUP BY pid) AS f ON s.pid = f.pid
    )
    WHERE t >= ${at(since)} AND t > first_t + INTERVAL 30 MINUTE
    GROUP BY cls
    LIMIT 10`;
  const campaignsQ = `
    SELECT extract(properties.$current_url, 'utm_campaign=([A-Za-z0-9_]+)') AS campaign, uniqExact(person_id) AS people
    FROM events
    WHERE ${reportViews} AND properties.$current_url LIKE '%utm_campaign=%'
      AND timestamp >= ${at(since)} AND timestamp < ${at(until)}
    GROUP BY campaign
    LIMIT 20`;
  const skipsQ = `
    SELECT uniqExactIf($session_id, properties.$el_text = 'Skip Intro' AND elements_chain LIKE '%wz-skip%') AS skips
    FROM events
    WHERE event = '$autocapture' AND properties.$host = '${HOST}' AND properties.$pathname = '/survey'
      AND timestamp >= ${at(since)} AND timestamp < ${at(until)}
    LIMIT 1`;
  const [s, c, k] = await Promise.all([rows(sourcesQ, 10), rows(campaignsQ, 20), rows(skipsQ, 1)]);
  if (!s.ok) return s;
  if (!c.ok) return c;
  if (!k.ok) return k;
  return {
    ok: true,
    value: {
      sources: s.value.map(([source, n]) => ({ source: String(source), sessions: Number(n) || 0 })),
      campaigns: c.value
        .filter(([campaign]) => campaign)
        .map(([campaign, n]) => ({ campaign: String(campaign), people: Number(n) || 0 })),
      wizardSkips: Number(k.value[0]?.[0]) || 0,
    },
  };
}

export interface LandingArmEngagement {
  arm: string;
  /** Sessions that saw the landing page (landing_page_view). */
  sessions: number;
  /** Of those, sessions with no click, no CTA and no other page. */
  bounced: number;
  /** Sessions that clicked a call to action on the landing page. */
  cta: number;
  /**
   * Landing page views that ended (by leaving the site, or by going on to another page, which
   * PostHog records on the next page view), and how far down they had scrolled.
   */
  leaves: number;
  scroll: [number, number, number, number];
  /** Median seconds on the landing page before leaving it. */
  medianSeconds: number | null;
  /** Average seconds on it, each view counted up to 30 minutes (a tab left open is not reading). */
  meanSeconds: number | null;
}

/** A number PostHog returned, or null where it had none. */
const orNull = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

/**
 * The landing page's engagement per arm, from PostHog: bounce, call-to-action clicks, scroll
 * depth and time on the page. The arm is PostHog's own tag, which a returning browser can
 * carry over from an earlier round, so the readout of a test uses our visit log instead.
 */
export async function fetchLandingEngagement(
  from: string,
  to: string
): Promise<PostHogResult<LandingArmEngagement[]>> {
  const { since, until } = windowOf({ from, to });
  const range = `properties.$host = '${HOST}' AND timestamp >= ${at(since)} AND timestamp < ${at(until)}`;
  const sessionsQ = `
    SELECT coalesce(arm, 'unknown') AS arm, count() AS sessions,
           countIf(clicks = 0 AND ctas = 0 AND other_pages = 0) AS bounced, countIf(ctas > 0) AS cta
    FROM (
      SELECT $session_id AS sid, argMax(properties.landing_variant, timestamp) AS arm,
             countIf(event = '$autocapture') AS clicks, countIf(event = 'cta_click') AS ctas,
             countIf(event = '$pageview' AND properties.$pathname != '/') AS other_pages,
             countIf(event = 'landing_page_view') AS landings
      FROM events WHERE ${range}
      GROUP BY sid
    )
    WHERE landings > 0
    GROUP BY arm
    LIMIT 20`;
  // eslint-disable-next-line no-secrets/no-secrets -- HogQL, not a secret
  const leavesQ = `
    SELECT coalesce(properties.landing_variant, 'unknown') AS arm, count() AS leaves,
           countIf(properties.$prev_pageview_max_scroll_percentage >= 0.25) AS s25,
           countIf(properties.$prev_pageview_max_scroll_percentage >= 0.5) AS s50,
           countIf(properties.$prev_pageview_max_scroll_percentage >= 0.75) AS s75,
           countIf(properties.$prev_pageview_max_scroll_percentage >= 0.99) AS s100,
           quantile(0.5)(properties.$prev_pageview_duration) AS median_dur,
           avg(least(toFloat(properties.$prev_pageview_duration), 1800)) AS mean_dur
    FROM events
    WHERE event IN ('$pageleave', '$pageview') AND properties.$prev_pageview_pathname = '/' AND ${range}
    GROUP BY arm
    LIMIT 20`;
  const [s, l] = await Promise.all([rows(sessionsQ, 20), rows(leavesQ, 20)]);
  if (!s.ok) return s;
  if (!l.ok) return l;
  const arms = new Map<string, LandingArmEngagement>();
  const get = (arm: string) => {
    let e = arms.get(arm);
    if (!e)
      arms.set(
        arm,
        (e = {
          arm,
          sessions: 0,
          bounced: 0,
          cta: 0,
          leaves: 0,
          scroll: [0, 0, 0, 0],
          medianSeconds: null,
          meanSeconds: null,
        })
      );
    return e;
  };
  for (const [arm, sessions, bounced, cta] of s.value) {
    const e = get(String(arm));
    e.sessions = Number(sessions) || 0;
    e.bounced = Number(bounced) || 0;
    e.cta = Number(cta) || 0;
  }
  for (const [arm, leaves, s25, s50, s75, s100, med, mean] of l.value) {
    const e = get(String(arm));
    e.leaves = Number(leaves) || 0;
    e.scroll = [Number(s25) || 0, Number(s50) || 0, Number(s75) || 0, Number(s100) || 0];
    e.medianSeconds = orNull(med);
    e.meanSeconds = orNull(mean);
  }
  return { ok: true, value: [...arms.values()] };
}

/** Seconds on the landing page before leaving it: the median, and the capped average. */
export interface LandingTime {
  median: number | null;
  mean: number | null;
}

/**
 * The landing page's time on page, all versions together, read for every view at once:
 * medians don't add up, and the average caps each view at 30 minutes as the arms' does.
 */
export async function fetchLandingTime(
  from: string,
  to: string
): Promise<PostHogResult<LandingTime>> {
  const { since, until } = windowOf({ from, to });
  const q = `
    SELECT quantile(0.5)(properties.$prev_pageview_duration) AS median_dur,
           avg(least(toFloat(properties.$prev_pageview_duration), 1800)) AS mean_dur
    FROM events
    WHERE event IN ('$pageleave', '$pageview') AND properties.$prev_pageview_pathname = '/'
      AND properties.$host = '${HOST}' AND timestamp >= ${at(since)} AND timestamp < ${at(until)}
    LIMIT 1`;
  const r = await rows(q, 1);
  if (!r.ok) return r;
  const [median, mean] = r.value[0] ?? [];
  return { ok: true, value: { median: orNull(median), mean: orNull(mean) } };
}

/**
 * section_seen reached production with #576 on 13 Oct 2026 (20:24 Berlin): section reach is
 * counted from the first whole day after it.
 */
export const SECTIONS_FROM = "2026-10-14";

export interface LandingSections {
  /** The days read: the range from SECTIONS_FROM. */
  from: string;
  to: string;
  /** Sessions that saw the landing page. */
  sessions: number;
  /** Per section: the sessions that reached it (part of it in the top half of the screen). */
  reach: Array<{ section: string; sessions: number }>;
  /** Of the landing sessions, those that answered a survey question. */
  started: number;
  /** The field reports block: sessions that reached it, and of those, how many started. */
  testimonials: { seen: number; started: number };
}

/** How far down the landing page people got, section by section; null before it was recorded. */
export async function fetchLandingSections(
  from: string,
  to: string
): Promise<PostHogResult<LandingSections | null>> {
  const start = from > SECTIONS_FROM ? from : SECTIONS_FROM;
  if (start > to) return { ok: true, value: null };
  const { since, until } = windowOf({ from: start, to });
  const range = `properties.$host = '${HOST}' AND timestamp >= ${at(since)} AND timestamp < ${at(until)}`;
  const reachQ = `
    SELECT section, count() AS sessions
    FROM (
      SELECT DISTINCT $session_id AS sid, properties.section AS section
      FROM events WHERE event = 'section_seen' AND ${range}
    )
    GROUP BY section
    LIMIT 40`;
  const totalsQ = `
    SELECT count() AS sessions, countIf(answered > 0) AS started,
           countIf(reviews > 0) AS seen, countIf(reviews > 0 AND answered > 0) AS seen_started
    FROM (
      SELECT $session_id AS sid,
             countIf(event = 'landing_page_view') AS landings,
             countIf(event = 'survey_answer') AS answered,
             countIf(event = 'section_seen' AND properties.section = 'testimonials') AS reviews
      FROM events
      WHERE event IN ('landing_page_view', 'survey_answer', 'section_seen') AND ${range}
      GROUP BY sid
    )
    WHERE landings > 0
    LIMIT 1`;
  const [r, t] = await Promise.all([rows(reachQ, 40), rows(totalsQ, 1)]);
  if (!r.ok) return r;
  if (!t.ok) return t;
  const [sessions, started, seen, seenStarted] = (t.value[0] ?? []).map((v) => Number(v) || 0);
  return {
    ok: true,
    value: {
      from: start,
      to,
      sessions: sessions ?? 0,
      reach: r.value
        .filter(([s]) => s)
        .map(([section, n]) => ({ section: String(section), sessions: Number(n) || 0 })),
      started: started ?? 0,
      testimonials: { seen: seen ?? 0, started: seenStarted ?? 0 },
    },
  };
}

/**
 * section_time (how long each section was in view) is read from this day. A placeholder until
 * it reaches production: then the first whole day after.
 */
export const SECTION_TIME_FROM = "2026-10-15";

/** A section's time in one visit counts up to 10 minutes: past that it is an idle tab. */
const SECTION_CAP_MS = 600_000;

export interface LandingSectionTime {
  /** The days read: the range from SECTION_TIME_FROM. */
  from: string;
  to: string;
  /** Sessions that saw the landing page. */
  sessions: number;
  /**
   * Per section: the sessions that reached it (section_seen, or any time in view), and their
   * time in view added up, each session's capped.
   */
  sections: Array<{ section: string; sessions: number; ms: number }>;
}

/** How long each landing section was in view, per visit that reached it; null before it was recorded. */
export async function fetchLandingSectionTime(
  from: string,
  to: string
): Promise<PostHogResult<LandingSectionTime | null>> {
  const start = from > SECTION_TIME_FROM ? from : SECTION_TIME_FROM;
  if (start > to) return { ok: true, value: null };
  const { since, until } = windowOf({ from: start, to });
  const range = `properties.$host = '${HOST}' AND timestamp >= ${at(since)} AND timestamp < ${at(until)}`;
  // A visit that reached a section and never had it in view adds a row of no time.
  const timeQ = `
    SELECT section, count() AS sessions, sum(ms) AS total_ms
    FROM (
      SELECT $session_id AS sid, properties.section AS section,
             least(sumIf(toFloat(properties.visible_ms), event = 'section_time'), ${SECTION_CAP_MS}) AS ms
      FROM events
      WHERE event IN ('section_seen', 'section_time') AND ${range}
      GROUP BY sid, section
    )
    GROUP BY section
    LIMIT 40`;
  const landingsQ = `
    SELECT uniqExact($session_id) AS sessions
    FROM events
    WHERE event = 'landing_page_view' AND ${range}
    LIMIT 1`;
  const [s, l] = await Promise.all([rows(timeQ, 40), rows(landingsQ, 1)]);
  if (!s.ok) return s;
  if (!l.ok) return l;
  return {
    ok: true,
    value: {
      from: start,
      to,
      sessions: Number(l.value[0]?.[0]) || 0,
      sections: s.value
        .filter(([section]) => section)
        .map(([section, n, ms]) => ({
          section: String(section),
          sessions: Number(n) || 0,
          ms: Number(ms) || 0,
        })),
    },
  };
}
