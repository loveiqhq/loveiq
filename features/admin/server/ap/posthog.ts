/**
 * What AP-Analytics reads from PostHog: the counts our own tables cannot give (a visitor
 * coming back on another day, the landing page's scroll and bounce, clicks inside the survey
 * intro). PostHog records only part of the site's visits (nearly every Google Ads one, far
 * fewer of the rest: blockers, declined cookies, bots it drops) and starts on 23 Aug 2026, so
 * the pages show these as shares, labelled as PostHog's.
 *
 * Every query goes through hogqlTable, the app's one HogQL door (its row cap and table
 * allowlist apply), and only on the live site's host.
 */
import { supabaseFetch } from "@features/admin/server/supabase";
import { countryCodesByTier } from "@features/pricing/logic/reportPricing";
import { hogqlTable } from "@features/ux-review/server/review";
import logger from "@shared/observability/logger";

import { windowOf } from "./filters";
import { OWN_HOST } from "./referrers";
import { teamUserIds } from "./team";

export const POSTHOG_FROM = "2026-08-23";
const HOST = "www.loveiq.org";
/**
 * The live site's events, plus the purchases the server itself sends PostHog after a payment
 * (they carry no host): every event of LoveIQ's that the explorer and the catalog list.
 */
export const SITE_EVENTS = `(properties.$host = '${HOST}' OR (event = 'purchase' AND coalesce(properties.$host, '') = ''))`;

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

let staffCache: { at: number; ids: Promise<string[] | null> } | null = null;

/**
 * The PostHog visits of the team's own finished surveys (its accounts: teamUserIds), whose
 * people every figure leaves out. Read every five minutes; null when they can't be read
 * (logged), which leaves nobody out rather than failing the page.
 */
export function teamVisits(): Promise<string[] | null> {
  const now = Date.now();
  if (staffCache && now - staffCache.at < CACHE_MS) return staffCache.ids;
  const ids = teamUserIds()
    .then((team) =>
      supabaseFetch(
        `/rest/v1/survey_submission?${new URLSearchParams({
          select: "posthog_session_id",
          user_id: `in.(${[...team].join(",") || "0"})`,
          posthog_session_id: "not.is.null",
          order: "id.asc",
        })}`
      )
    )
    .then(async (res) => {
      if (!res.ok) throw new Error(`staff visits ${res.status}`);
      return ((await res.json()) as Array<{ posthog_session_id: string }>)
        .map((r) => r.posthog_session_id)
        .filter((id) => /^[0-9a-f-]{36}$/i.test(id));
    })
    .catch((err: unknown) => {
      logger.warn({ err }, "AP: the team's PostHog visits could not be read");
      staffCache = null;
      return null;
    });
  staffCache = { at: now, ids };
  return ids;
}

/** A HogQL condition leaving out the PostHog people behind the team's own visits. */
async function notStaff(): Promise<string> {
  const ids = await teamVisits();
  return ids?.length
    ? ` AND person_id NOT IN (SELECT person_id FROM events WHERE $session_id IN (${ids
        .map((id) => `'${id}'`)
        .join(", ")}) AND timestamp >= toDateTime('${POSTHOG_FROM} 00:00:00', 'UTC'))`
    : "";
}

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

/** PostHog's session ids are UUIDs; anything else never reaches a query. */
const SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** A session's start and its person's first event, in ms, kept for the process. */
const visitBySession = new Map<string, { started: number; firstSeen: number }>();
/** A visit begins after this much idle time, as PostHog counts visits. */
const VISIT_GAP_MS = 30 * 60_000;

/**
 * Marks each finisher (a submission, a payment's finisher, an answer's) new or returning:
 * returning when PostHog saw the person more than half an hour before the visit the survey
 * began in. That visit's start is the PostHog visit they finished in, or the survey's own
 * start when that came first: a pause of half an hour mid-survey makes PostHog start a new
 * visit, and the person is still on their first. A visit PostHog never saw stays unknown,
 * which neither "new" nor "returning" matches, and is asked again next time. Throws when
 * PostHog can't be read.
 */
export async function markVisitors<P extends { ph: string | null; visitorNew?: boolean | null }>(
  people: P[],
  startOf: (p: P) => string | null | undefined = () => null
): Promise<void> {
  if (visitBySession.size > 50_000) visitBySession.clear();
  const ids = [...new Set(people.map((x) => x.ph))].filter(
    (id): id is string => typeof id === "string" && SESSION_ID.test(id)
  );
  const ask = ids.filter((id) => !visitBySession.has(id.toLowerCase()));
  const since = `toDateTime('${POSTHOG_FROM} 00:00:00', 'UTC')`;
  for (let i = 0; i < ask.length; i += 500) {
    const list = ask
      .slice(i, i + 500)
      .map((id) => `'${id.toLowerCase()}'`)
      .join(",");
    // One person per visit, the same in both reads of it: any() may pick a different one of a
    // visit's persons each time it runs, and the join then drops the visit.
    const visit = `SELECT properties.$session_id AS sid, argMin(person_id, timestamp) AS pid, min(timestamp) AS started
      FROM events WHERE timestamp >= ${since} AND properties.$session_id IN (${list}) GROUP BY sid`;
    const r = await rows(
      `SELECT v.sid, toUnixTimestamp64Milli(v.started) AS started_ms,
              toUnixTimestamp64Milli(f.first_seen) AS first_seen_ms
       FROM (${visit}) v
       JOIN (SELECT person_id, min(timestamp) AS first_seen FROM events
             WHERE timestamp >= ${since} AND person_id IN (SELECT pid FROM (${visit}))
             GROUP BY person_id) f ON f.person_id = v.pid`,
      600
    );
    if (!r.ok) throw new Error(r.error);
    for (const [sid, started, firstSeen] of r.value) {
      if (Number.isFinite(Number(started)) && Number.isFinite(Number(firstSeen)))
        visitBySession.set(String(sid).toLowerCase(), {
          started: Number(started),
          firstSeen: Number(firstSeen),
        });
    }
  }
  for (const p of people) {
    const v = p.ph ? visitBySession.get(p.ph.toLowerCase()) : undefined;
    if (!v) {
      p.visitorNew = null;
      continue;
    }
    const surveyStart = Date.parse(startOf(p) ?? "");
    const began = Number.isFinite(surveyStart) ? Math.min(v.started, surveyStart) : v.started;
    p.visitorNew = v.firstSeen >= began - VISIT_GAP_MS;
  }
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
        AND timestamp < ${at(until)}${await notStaff()}
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

/**
 * Which of fetchNewReturning's groups each visit's person is in for the range: "new" when
 * PostHog first saw them in the range, else "returning", read the way that query reads it.
 * By the visit's id (a finisher's ph), so a payment can be put with its group's visitors; a
 * visit PostHog never saw is left out.
 */
export async function fetchVisitorGroups(
  from: string,
  to: string,
  visits: Array<string | null>
): Promise<PostHogResult<Map<string, "new" | "returning">>> {
  const { since, until } = windowOf({ from, to });
  const ids = [...new Set(visits.map((id) => id?.toLowerCase()))].filter(
    (id): id is string => typeof id === "string" && SESSION_ID.test(id)
  );
  const start = `toDateTime('${POSTHOG_FROM} 00:00:00', 'UTC')`;
  const staff = await notStaff();
  const out = new Map<string, "new" | "returning">();
  for (let i = 0; i < ids.length; i += 500) {
    const list = ids
      .slice(i, i + 500)
      .map((id) => `'${id}'`)
      .join(",");
    // One person per visit, the same in both reads of it (see markVisitors).
    const visit = `SELECT properties.$session_id AS sid, argMin(person_id, timestamp) AS pid
      FROM events WHERE timestamp >= ${start} AND properties.$session_id IN (${list}) GROUP BY sid`;
    const r = await rows(
      `SELECT v.sid, if(f.first_seen >= ${at(since)}, 'new', 'returning') AS grp
       FROM (${visit}) v
       JOIN (SELECT person_id, min(timestamp) AS first_seen FROM events
             WHERE properties.$host = '${HOST}'
               AND event IN ('$pageview', 'survey_started', 'survey_completed')
               AND timestamp >= ${start} AND timestamp < ${at(until)}
               AND person_id IN (SELECT pid FROM (${visit}))${staff}
             GROUP BY person_id) f ON f.person_id = v.pid`,
      600
    );
    if (!r.ok) return r;
    for (const [sid, grp] of r.value) {
      if (grp === "new" || grp === "returning") out.set(String(sid).toLowerCase(), grp);
    }
  }
  return { ok: true, value: out };
}

/** One group of the live site's visits, by what their first page view carried. */
export interface SessionTags {
  src: string | null;
  med: string | null;
  /** A Google Ads click id (gclid, gbraid or wbraid) in the address. */
  ads: boolean;
  /** Meta's click id (fbclid) in the address. */
  fb: boolean;
  /** The referring site, kept only on a visit with no tag and no click id. */
  ref: string | null;
  sessions: number;
}

/** A tag as the survey's tracker stores it: decoded, as URLSearchParams reads it. */
function tagValue(raw: unknown): string | null {
  return typeof raw === "string" && raw ? new URLSearchParams(`v=${raw}`).get("v") || null : null;
}

const OWN_RE = new RegExp(OWN_HOST);

/**
 * The referring site as the tracker keeps it (shared/url/utm.ts): none for a direct visit
 * ("$direct"), our own pages or Stripe's checkout.
 */
function referrer(raw: unknown): string | null {
  const host = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (!host || host === "$direct" || OWN_RE.test(host)) return null;
  return host;
}

/**
 * The live site's visits in a range, one per PostHog session, grouped by what the session's
 * first page view carried: utm_source, utm_medium, a Google Ads click id, Meta's click id and,
 * on an untagged visit only (the one place classifySource reads it, which keeps the groups
 * few), the referring site. Pages the visit log leaves out (admin, Jarvis, the login) are
 * left out here. Our own source rules sort the groups (sourceShares), never PostHog's.
 */
export async function fetchSessionSources(
  from: string,
  to: string
): Promise<PostHogResult<SessionTags[]>> {
  const { since, until } = windowOf({ from, to });
  const q = `
    SELECT src, med, ads, fb, if(src = '' AND med = '' AND ads = 0 AND fb = 0, ref, '') AS r,
           count() AS n
    FROM (
      SELECT lower(extract(url, '[?&]utm_source=([^&#]*)')) AS src,
             lower(extract(url, '[?&]utm_medium=([^&#]*)')) AS med,
             if(url LIKE '%gclid=%' OR url LIKE '%gbraid=%' OR url LIKE '%wbraid=%', 1, 0) AS ads,
             if(url LIKE '%fbclid=%', 1, 0) AS fb,
             lower(coalesce(first_ref, '')) AS ref
      FROM (
        SELECT $session_id AS sid,
               argMin(properties.$current_url, timestamp) AS url,
               argMin(properties.$referring_domain, timestamp) AS first_ref
        FROM events
        WHERE event = '$pageview' AND properties.$host = '${HOST}' AND $session_id != ''
          AND properties.$pathname NOT LIKE '/admin%' AND properties.$pathname NOT LIKE '/jarvis%'
          AND properties.$pathname != '/login'
          AND timestamp >= ${at(since)} AND timestamp < ${at(until)}${await notStaff()}
        GROUP BY sid
        -- A visit that landed on a pay-to-start page is that funnel's (its own page counts it).
        HAVING argMin(properties.$pathname, timestamp) NOT LIKE '/sexual-archetype%'
      )
    )
    GROUP BY src, med, ads, fb, r
    ORDER BY n DESC
    LIMIT 1000`;
  const r = await rows(q, 1000);
  if (!r.ok) return r;
  return {
    ok: true,
    value: r.value.map(([src, med, ads, fb, ref, n]) => ({
      src: tagValue(src),
      med: tagValue(med),
      ads: Number(ads) === 1,
      fb: Number(fb) === 1,
      ref: referrer(ref),
      sessions: Number(n) || 0,
    })),
  };
}

export interface SurveyIntroClicks {
  opened: number;
  skipped: number;
  agreed: number;
  returned: number;
  trust: number;
  terms: number;
  answered: number;
  /** Reached the questions: the question engine started (survey_started) or a question was answered. */
  reachedQ1: number;
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
           uniqExactIf($session_id, event IN ('survey_answer', 'survey_started')) AS reached_q1,
           uniqExactIf($session_id, event = '$autocapture' AND elements_chain LIKE '%Continue to survey introduction%') AS silhouette
    FROM events
    WHERE properties.$host = '${HOST}'
      AND properties.$pathname = '/survey'
      AND timestamp >= ${at(since)} AND timestamp < ${at(until)}${await notStaff()}
    LIMIT 1`;
  const r = await rows(q, 1);
  if (!r.ok) return r;
  const [opened, skipped, agreed, returned, trust, terms, answered, reachedQ1, silhouette] = (
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
      reachedQ1: reachedQ1 ?? 0,
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
 * minutes after their first one, by its first page's link. An email link carries from=email
 * (or utm_source=email); a campaign's (the nurture emails, the chapter nudges) also carries
 * its utm_campaign, while the report-ready and invite-reminder emails carry none. Report
 * links hold an access token, so only the class of a link leaves PostHog, never the link.
 */
export async function fetchReportReturns(
  from: string,
  to: string
): Promise<PostHogResult<ReportReturns>> {
  const { since, until } = windowOf({ from, to });
  const staff = await notStaff();
  const reportViews = `event = '$pageview' AND properties.$host = '${HOST}' AND properties.$pathname LIKE '/report/%'${staff}`;
  const sourcesQ = `
    SELECT cls, count() AS sessions FROM (
      SELECT multiIf((s.url LIKE '%utm_source=email%' OR s.url LIKE '%from=email%') AND s.url LIKE '%utm_campaign=%', 'Email campaign link',
                     s.url LIKE '%utm_source=email%' OR s.url LIKE '%from=email%', 'Email link',
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
      AND timestamp >= ${at(since)} AND timestamp < ${at(until)}${staff}
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
  /** The views that average is over, and the sum of their squared seconds: its spread. */
  timed: number;
  sqSeconds: number;
}

/** A number PostHog returned, or null where it had none. */
const orNull = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

/**
 * A landing view's seconds, up to 30 minutes: the one value the average and its spread read.
 * A view without a duration stays out: PostHog's least() skips a NULL, so least(NULL, 1800)
 * would count it as 30 minutes (none lacked one on 14 Oct 2026, of 1,134 in 14 days).
 */
const CAPPED =
  "if(isNull(properties.$prev_pageview_duration), NULL, least(toFloat(properties.$prev_pageview_duration), 1800))";

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
  const range = `properties.$host = '${HOST}' AND timestamp >= ${at(since)} AND timestamp < ${at(until)}${await notStaff()}`;
  const sessionsQ = `
    SELECT coalesce(arm, 'unknown') AS arm, count() AS sessions,
           countIf(clicks = 0 AND ctas = 0 AND other_pages = 0) AS bounced, countIf(ctas > 0) AS cta
    FROM (
      SELECT $session_id AS sid, argMax(properties.landing_variant, timestamp) AS arm,
             countIf(event = '$autocapture' AND NOT match(elements_chain, '(^|[^a-zA-Z])cky-')) AS clicks,
             countIf(event = 'cta_click') AS ctas,
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
           avg(${CAPPED}) AS mean_dur, count(${CAPPED}) AS timed, sum(${CAPPED} * ${CAPPED}) AS sq_dur
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
          timed: 0,
          sqSeconds: 0,
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
  for (const [arm, leaves, s25, s50, s75, s100, med, mean, timed, sq] of l.value) {
    const e = get(String(arm));
    e.leaves = Number(leaves) || 0;
    e.scroll = [Number(s25) || 0, Number(s50) || 0, Number(s75) || 0, Number(s100) || 0];
    e.medianSeconds = orNull(med);
    e.meanSeconds = orNull(mean);
    e.timed = Number(timed) || 0;
    e.sqSeconds = Number(sq) || 0;
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
           avg(${CAPPED}) AS mean_dur
    FROM events
    WHERE event IN ('$pageleave', '$pageview') AND properties.$prev_pageview_pathname = '/'
      AND properties.$host = '${HOST}' AND timestamp >= ${at(since)} AND timestamp < ${at(until)}${await notStaff()}
    LIMIT 1`;
  const r = await rows(q, 1);
  if (!r.ok) return r;
  const [median, mean] = r.value[0] ?? [];
  return { ok: true, value: { median: orNull(median), mean: orNull(mean) } };
}

/**
 * The first page view of each live-site visit in a range, as a HogQL subquery: its start, the
 * link's tags (source, medium, campaign, keyword, click ids), the referring site, the device,
 * the country and the browser's offset from UTC. Pages the visit log leaves out (admin, Jarvis,
 * the login) are left out, as fetchSessionSources does.
 */
function firstViews(from: string, to: string, staff: string): string {
  const { since, until } = windowOf({ from, to });
  return `
    SELECT $session_id AS sid, argMin(person_id, timestamp) AS pid, min(timestamp) AS first_ts,
           argMin(properties.$current_url, timestamp) AS url,
           argMin(properties.$referring_domain, timestamp) AS first_ref,
           argMin(properties.$device_type, timestamp) AS device,
           argMin(properties.$geoip_country_code, timestamp) AS country,
           argMin(properties.$timezone_offset, timestamp) AS tz_offset
    FROM events
    WHERE event = '$pageview' AND properties.$host = '${HOST}' AND $session_id != ''
      AND properties.$pathname NOT LIKE '/admin%' AND properties.$pathname NOT LIKE '/jarvis%'
      AND properties.$pathname != '/login'
      AND timestamp >= ${at(since)} AND timestamp < ${at(until)}${staff}
    GROUP BY sid
    -- A visit that landed on a pay-to-start page is that funnel's (its own page counts it).
    HAVING argMin(properties.$pathname, timestamp) NOT LIKE '/sexual-archetype%'`;
}

/** The tag columns classifySource reads, from firstViews' columns. */
const TAGS = `lower(extract(url, '[?&]utm_source=([^&#]*)')) AS src,
             lower(extract(url, '[?&]utm_medium=([^&#]*)')) AS med,
             if(url LIKE '%gclid=%' OR url LIKE '%gbraid=%' OR url LIKE '%wbraid=%', 1, 0) AS ads,
             if(url LIKE '%fbclid=%', 1, 0) AS fb,
             lower(coalesce(first_ref, '')) AS ref`;
/** The referring site only on an untagged visit: the one place classifySource reads it. */
const REF = "if(src = '' AND med = '' AND ads = 0 AND fb = 0, ref, '') AS r";

/** A group of visits as classifySource reads it: its tags, the referrer, the count. */
function tagsOf(src: unknown, med: unknown, ads: unknown, fb: unknown, ref: unknown) {
  return {
    src: tagValue(src),
    med: tagValue(med),
    ads: Number(ads) === 1,
    fb: Number(fb) === 1,
    ref: referrer(ref),
  };
}

/** Visits of one bucket that carried the same tags, campaign and keyword. */
export interface SessionGroup extends SessionTags {
  /** The first day of the bucket (a day, a week's Monday or a month's 1st, Berlin). */
  bucket: string;
  /** utm_campaign and utm_term of the visit's first page. */
  camp: string | null;
  term: string | null;
}

const BUCKET: Record<"day" | "week" | "month", string> = {
  day: "toDate(toTimeZone(first_ts, 'Europe/Berlin'))",
  week: "toStartOfWeek(toTimeZone(first_ts, 'Europe/Berlin'), 1)",
  month: "toStartOfMonth(toTimeZone(first_ts, 'Europe/Berlin'))",
};

/**
 * The live site's visits in a range, by bucket and by what their first page view carried,
 * campaign and keyword included: visitors per channel, campaign and keyword are the live visit
 * total split by these shares, and attribution is the share with any source at all.
 */
export async function fetchSessionGroups(
  from: string,
  to: string,
  grain: "day" | "week" | "month"
): Promise<PostHogResult<SessionGroup[]>> {
  const q = `
    SELECT bucket, src, med, ads, fb, ${REF}, camp, term, count() AS n
    FROM (
      SELECT ${BUCKET[grain]} AS bucket, ${TAGS},
             lower(extract(url, '[?&]utm_campaign=([^&#]*)')) AS camp,
             lower(extract(url, '[?&]utm_term=([^&#]*)')) AS term
      FROM (${firstViews(from, to, await notStaff())})
    )
    GROUP BY bucket, src, med, ads, fb, r, camp, term
    ORDER BY n DESC
    LIMIT 5000`;
  const r = await rows(q, 5000);
  if (!r.ok) return r;
  return {
    ok: true,
    value: r.value.map(([bucket, src, med, ads, fb, ref, camp, term, n]) => ({
      bucket: String(bucket).slice(0, 10),
      ...tagsOf(src, med, ads, fb, ref),
      camp: tagValue(camp)?.toLowerCase() ?? null,
      term: tagValue(term)?.toLowerCase() ?? null,
      sessions: Number(n) || 0,
    })),
  };
}

/** The visit dimensions the Traffic page's audience reads from PostHog. */
export type VisitDim = "country" | "device" | "daypart" | "visitor" | "tier";

/** Visits with the same tags and the same value of one dimension. */
export interface VisitGroup extends SessionTags {
  dim: VisitDim;
  /**
   * A country code (or "Other"), "Mobile", "Morning", "new", "tier_1" … ("" when PostHog had
   * none). A tier is the country's price tier, as the pricing code puts it (countryTierOf).
   */
  value: string;
}

/** How many countries are named; the rest are "Other". */
const TOP_COUNTRIES = 12;

/**
 * Who the live site's visits were, by source: the country (PostHog's GeoIP, the most common
 * TOP_COUNTRIES by name), the device, the time of day where the visitor was (the browser's own
 * offset from UTC) and whether PostHog had seen the person more than half an hour before.
 * PostHog records only part of the visits (nearly every Google Ads one, far fewer of the rest),
 * so these are shares of a sample, applied to each source's own visitors (stratified).
 */
export async function fetchVisitAudience(
  from: string,
  to: string
): Promise<PostHogResult<VisitGroup[]>> {
  const views = firstViews(from, to, await notStaff());
  const grouped = (value: string, source: string) => `
    SELECT src, med, ads, fb, ${REF}, value, count() AS n
    FROM (SELECT ${TAGS}, ${value} AS value FROM ${source})
    GROUP BY src, med, ads, fb, r, value
    ORDER BY n DESC
    LIMIT 3000`;
  const topCountries = `SELECT country FROM (${views}) WHERE country != '' GROUP BY country ORDER BY count() DESC LIMIT ${TOP_COUNTRIES}`;
  // Each country's price tier, from the pricing code's own table: every country counted, by
  // source, in a handful of rows.
  const tierOf = [...countryCodesByTier()]
    .map(([tier, codes]) => {
      const list = codes.filter((c) => /^[A-Z]{2}$/.test(c)).map((c) => `'${c}'`);
      return `upper(country) IN (${list.join(", ")}), '${tier}'`;
    })
    .join(", ");
  const queries: Record<VisitDim, string> = {
    tier: grouped(
      `if(coalesce(country, '') = '', '', multiIf(${tierOf}, 'default'))`,
      `(${views})`
    ),
    country: grouped(
      `if(coalesce(country, '') = '', '', if(country IN (${topCountries}), country, 'Other'))`,
      `(${views})`
    ),
    device: grouped("coalesce(device, '')", `(${views})`),
    // The browser's offset is UTC minus local time, in minutes: local = UTC - offset.
    daypart: grouped(
      "if(isNull(tz_offset), '', multiIf(h < 6, 'Night', h < 12, 'Morning', h < 18, 'Afternoon', 'Evening'))",
      `(SELECT *, toHour(toTimeZone(first_ts, 'UTC') - toIntervalMinute(toInt(tz_offset))) AS h FROM (${views}))`
    ),
    // Returning: PostHog saw the person more than half an hour before this visit began.
    visitor: grouped(
      "if(isNull(f.first_seen), '', if(f.first_seen < first_ts - INTERVAL 30 MINUTE, 'returning', 'new'))",
      `(${views}) v LEFT JOIN (SELECT person_id, min(timestamp) AS first_seen FROM events
         WHERE properties.$host = '${HOST}' AND timestamp >= toDateTime('${POSTHOG_FROM} 00:00:00', 'UTC')
         GROUP BY person_id) f ON f.person_id = v.pid`
    ),
  };
  const dims = Object.keys(queries) as VisitDim[];
  // eslint-disable-next-line security/detect-object-injection -- d is one of queries' own keys.
  const results = await Promise.all(dims.map((d) => rows(queries[d], 3000)));
  const out: VisitGroup[] = [];
  for (const [i, r] of results.entries()) {
    if (!r.ok) return r;
    for (const [src, med, ads, fb, ref, value, n] of r.value) {
      out.push({
        dim: dims[i]!,
        value: value === null || value === undefined ? "" : String(value),
        ...tagsOf(src, med, ads, fb, ref),
        sessions: Number(n) || 0,
      });
    }
  }
  return { ok: true, value: out };
}
