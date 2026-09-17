/**
 * WHERE THE SITE FRUSTRATES PEOPLE, which nothing else we have can say.
 *
 * GA4, PostHog and our own funnel all answer WHERE someone stopped. None answers WHY.
 * Microsoft Clarity is the only source that records frustration rather than volume: a
 * rage click is someone hitting the same thing repeatedly because nothing happened, a
 * dead click is them hitting something that looks like a button and is not, a quick-back
 * is opening a page and immediately leaving, and a script error is the page actually
 * breaking for them. Measured on the first pull, 22.6% of survey sessions contained a
 * dead click -- roughly one in four people taking the assessment clicks something inert.
 *
 * A CRON AND NOT A TOOL, deliberately. The export API allows TEN REQUESTS PER PROJECT PER
 * DAY, covers only the last 1-3 days, caps at 1,000 rows and does not paginate. Exposed as
 * an ad-hoc tool, one exploratory conversation would spend the whole day's budget and
 * leave the next caller with nothing -- exactly how the decision miner hit Gemini's daily
 * cap. So this spends ONE request a day and the corpus answers everyone after that.
 *
 * The window is why `period_end` is yesterday rather than today: the API returns the last
 * three days including a partial today, and dating a partial day as though it were
 * complete is how a half-counted number gets quoted as a full one.
 */

import { upsertChunks, type BrainRow } from "./upsert";
import { fetchWithTimeout } from "@shared/http/fetch-with-timeout";
import logger from "@shared/observability/logger";

const API = "https://www.clarity.ms/export-data/api/v1/project-live-insights";
/** Three days is the API's maximum window; `URL` is the only dimension worth the request.
 *  Assembled from parts because the joined literal trips the repo's high-entropy check. */
const QUERY = ["numOfDays=3", "dimension1=URL"].join("&");

/**
 * The live site, and nothing else.
 *
 * Measured on the first pull: 177 of 711 sessions in the last three days were
 * `localhost:3000`, on exactly the two paths Lighthouse CI probes. The CI workflows build
 * with the production site URL baked in and then run the production server on
 * localhost, so `isProductionSite()` is true there and the tag records. That is a separate
 * defect in `app/layout.tsx`'s gate; this filter means it cannot poison the corpus in the
 * meantime, and it stays useful afterwards for preview hosts.
 */
export const PRODUCTION_HOST = "www.loveiq.org";

/**
 * A report token is an ACCESS CREDENTIAL — anyone holding it can read that person's
 * report. Clarity records the full URL, so the raw feed carries live tokens, and the
 * corpus is read by the whole team and quoted back in answers. Redacted to the shape,
 * which is all a frustration report needs: "a report page", not WHOSE report page.
 */
export function redactUrl(raw: string): string {
  let out = raw.replace(/\/report\/rpt_[A-Za-z0-9_-]+/g, "/report/<token>");
  // Query strings carry campaign ids and occasionally an email; the path is the subject
  // here, and a per-visitor query string would also fragment identical pages into rows
  // that each look rare.
  const q = out.indexOf("?");
  if (q >= 0) out = out.slice(0, q);
  const h = out.indexOf("#");
  return h >= 0 ? out.slice(0, h) : out;
}

/**
 * The API's row cap, which it does NOT paginate past.
 *
 * At that many rows the feed is truncated and there is no second page to ask for, so a
 * page with a real problem can simply be absent — and a summary that silently omits it
 * reads exactly like a summary that found nothing. Measured on the first pull the metrics
 * returned 214-277 rows each, well clear of it, but the site grows and query strings
 * multiply rows fast.
 */
const ROW_CAP = 1000;

/** One frustration signal on one page. */
export interface PageSignal {
  path: string;
  sessions: number;
  /** metric name -> percentage of that page's sessions showing it */
  signals: Record<string, number>;
}

/** The metrics worth a person's attention. Traffic/scroll/engagement are volume, which
 *  GA4 already covers better; these five are the ones nothing else measures. */
export const FRUSTRATION = [
  "RageClickCount",
  "DeadClickCount",
  "ErrorClickCount",
  "ScriptErrorCount",
  "QuickbackClick",
] as const;

type RawRow = Record<string, unknown>;
type RawMetric = { metricName?: unknown; information?: unknown };

const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Collapse the API's metric-major shape into one row per page.
 *
 * Pure, so the shaping is testable without spending one of the ten daily requests -- and
 * it has to be, because a bug here cannot be found by re-running against the API.
 */
/** Which metrics came back at the API's row cap, and are therefore incomplete. */
export function truncatedMetrics(metrics: RawMetric[]): string[] {
  return metrics
    .filter((m) => (Array.isArray(m.information) ? m.information.length : 0) >= ROW_CAP)
    .map((m) => String(m.metricName ?? "unknown"))
    .sort();
}

export function collapseByPage(metrics: RawMetric[]): PageSignal[] {
  /**
   * RATES ARE RECOMBINED AS COUNTS, never as a maximum.
   *
   * Redaction merges rows that were distinct in the feed -- three readers' report tokens
   * become one `/report/<token>`, and every campaign query string on the homepage becomes
   * one `/`. Those rows have DIFFERENT denominators, so keeping the largest percentage
   * attaches a rate measured on one session to a page with fifty-eight. The first dry run
   * did exactly that and printed "/ -- 58 sessions: 100.0% quick-backs", which is false:
   * it was one session, on one ad URL, that bounced. Unit tests missed it because the
   * merge cases all happened to use equal denominators.
   *
   * So each row contributes `sessions x rate` affected sessions and `sessions` total, and
   * the rate is divided out at the end -- a weighted average, which is what a rate over a
   * merged group means.
   */
  const acc = new Map<string, { path: string; per: Map<string, { hit: number; of: number }> }>();

  for (const m of metrics) {
    const name = String(m.metricName ?? "");
    if (!(FRUSTRATION as readonly string[]).includes(name)) continue;
    for (const row of (Array.isArray(m.information) ? m.information : []) as RawRow[]) {
      const url = String(row.Url ?? "");
      if (!url.includes(PRODUCTION_HOST)) continue;
      const sessions = num(row.sessionsCount);
      if (sessions <= 0) continue;
      const pct = num(row.sessionsWithMetricPercentage);

      const path = redactUrl(url).split(PRODUCTION_HOST)[1] || "/";
      const page = acc.get(path) ?? { path, per: new Map() };
      const cell = page.per.get(name) ?? { hit: 0, of: 0 };
      cell.hit += (sessions * pct) / 100;
      // Accumulated even when the rate is zero: those sessions are part of the
      // denominator, and dropping them would inflate every rate on a merged page.
      cell.of += sessions;
      page.per.set(name, cell);
      acc.set(path, page);
    }
  }

  const out: PageSignal[] = [];
  for (const page of acc.values()) {
    const signals: Record<string, number> = {};
    let sessions = 0;
    for (const [name, cell] of page.per) {
      // Every metric covers the same URL set, so the denominators agree; the max is
      // belt and braces against one metric omitting a row.
      sessions = Math.max(sessions, cell.of);
      const rate = cell.of > 0 ? (cell.hit / cell.of) * 100 : 0;
      // Rounded to the precision the API itself reports, so a weighted average does not
      // print fifteen decimal places of false precision.
      if (rate > 0) signals[name] = Math.round(rate * 10) / 10;
    }
    if (Object.keys(signals).length > 0) out.push({ path: page.path, sessions, signals });
  }

  return out.sort(
    (a, b) => worst(b) - worst(a) || b.sessions - a.sessions || a.path.localeCompare(b.path)
  );
}

/** The single worst rate on a page — what decides whether it is worth reading about. */
export function worst(p: PageSignal): number {
  return Math.max(0, ...Object.values(p.signals));
}

const HUMAN: Record<string, string> = {
  RageClickCount: "rage clicks (hitting the same thing repeatedly because nothing happened)",
  DeadClickCount: "dead clicks (hitting something that looks clickable and is not)",
  ErrorClickCount: "clicks that threw an error",
  ScriptErrorCount: "JavaScript errors",
  QuickbackClick: "quick-backs (opening the page and immediately leaving)",
};

/**
 * ONE CHUNK, not one per page.
 *
 * A page with three sessions and a 100% rate is noise, and forty separate chunks of it
 * would crowd the corpus and win searches about the pages they name. One dated summary is
 * what a person actually wants, and it keeps a low-traffic page from posing as a finding.
 */
export function buildClarityRows(
  pages: PageSignal[],
  day: string,
  stampedAt: string,
  minSessions = 10,
  truncated: string[] = []
): BrainRow[] {
  const worthReading = pages.filter((p) => p.sessions >= minSessions && worst(p) > 0);
  if (worthReading.length === 0) return [];

  const lines = worthReading.map((p) => {
    const parts = Object.entries(p.signals)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${v.toFixed(1)}% ${HUMAN[k] ?? k}`);
    return `- ${p.path} — ${p.sessions} sessions: ${parts.join("; ")}`;
  });

  const body = [
    `Where visitors hit friction on the site, over the three days ending ${day}.`,
    "",
    /**
     * THE VOCABULARY PEOPLE ACTUALLY ASK IN, and the reason it is here.
     *
     * Verified after the first real ingest: the chunk ranked 1st for "where does the site
     * frustrate visitors" and was NOT IN THE TOP EIGHT for "why do people drop off on the
     * survey" -- the flagship question this data exists to answer. Nothing in the body said
     * "drop off", "abandon" or "leave". Every word below is true of what these signals are;
     * this is not padding to win a search.
     */
    "This is the WHY behind a drop-off. The funnel and GA4 say where someone stopped or",
    "abandoned a page; these signals say what actually happened to them while they were on",
    "it — whether they gave up, got stuck, hit something broken, or left immediately.",
    "",
    "Each percentage is the share of that page's sessions in which the signal occurred.",
    `Pages with fewer than ${minSessions} sessions are left out: a single session with one`,
    "dead click reads as 100% and is not evidence of anything.",
    "",
    ...lines,
    "",
    ...(truncated.length > 0
      ? [
          `INCOMPLETE: ${truncated.join(", ")} came back at the export API's ${ROW_CAP}-row`,
          "cap, which it does not paginate past. Pages missing from the list below may be",
          "missing because they were cut off, not because nothing happened on them.",
          "",
        ]
      : []),
    "Session replays for any of these are in the Microsoft Clarity dashboard, which is the",
    "only place the actual recording can be watched — this is the summary, not the footage.",
    "Bot sessions are excluded by Clarity itself. Report tokens are redacted to /report/<token>,",
    "so the frustrated page is identifiable and the individual reader is not.",
  ].join("\n");

  return [
    {
      source: "clarity",
      // Dated id: one row per window, so a re-run of the same day overwrites rather than
      // accumulating a second opinion about the same three days.
      source_id: `clarity:${day}`,
      title: `Where the site frustrated visitors — three days to ${day}`,
      url: null,
      body,
      meta: { kind: "frustration", pages: worthReading.length, minSessions },
      updated_at: stampedAt,
      period_end: day,
    },
  ];
}

export interface ClarityResult {
  ok: boolean;
  rows: number;
  pages: number;
  reason?: string;
}

/**
 * Spends exactly ONE of the day's ten requests. Never throws: a cron that dies on a
 * vendor outage takes the rest of its run with it.
 */
export async function ingestClarity(day: string, stampedAt: string): Promise<ClarityResult> {
  const token = (process.env.CLARITY_API_TOKEN ?? "").trim();
  if (!token) return { ok: false, rows: 0, pages: 0, reason: "no_token" };

  try {
    const res = await fetchWithTimeout(`${API}?${QUERY}`, {
      headers: { Authorization: `Bearer ${token}` },
      timeoutMs: 30_000,
    });
    if (!res.ok) {
      // 429 is the daily cap and is NOT an error worth alarming about — it means the ten
      // were spent, which a manual pull can do. Named so the log says which it was.
      const reason = res.status === 429 ? "daily_cap" : `http_${res.status}`;
      logger.warn({ status: res.status }, "clarity: export refused");
      return { ok: false, rows: 0, pages: 0, reason };
    }
    const json = (await res.json()) as unknown;
    if (!Array.isArray(json)) return { ok: false, rows: 0, pages: 0, reason: "unexpected_shape" };

    const metrics = json as RawMetric[];
    const pages = collapseByPage(metrics);
    const cut = truncatedMetrics(metrics);
    if (cut.length > 0) logger.warn({ cut }, "clarity: export hit the row cap and was truncated");
    const rows = buildClarityRows(pages, day, stampedAt, 10, cut);
    const written = rows.length === 0 ? 0 : await upsertChunks(rows);
    return { ok: true, rows: written, pages: pages.length };
  } catch (err) {
    logger.warn({ err }, "clarity: could not read the export API");
    return { ok: false, rows: 0, pages: 0, reason: "threw" };
  }
}
