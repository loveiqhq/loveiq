/**
 * GET /api/cron/brain-reconcile
 *
 * Derives the same numbers two ways and speaks up only when they disagree.
 *
 * Three defects shipped in the conversion digest and survived for months inside data this
 * system already held — staff sandbox purchases counted as sales, two charts drawing the
 * same arms in opposite colours, and a funnel heading that covered rows it did not
 * describe. None was hard to see. Nothing looked, because nothing ever computed a quantity
 * twice and compared.
 *
 * Silence is the normal output. Only a disagreement posts, and all of them post in ONE
 * message: four alerts about one bad number is how a channel gets muted, which is exactly
 * why `funnel-digest` was unscheduled for being FYI-only.
 */
import { NextResponse } from "next/server";
import { countRows, fetchAllRows, supabaseFetch } from "@features/admin/server/supabase";
import { buildReportVoiceRows } from "@features/brain/server/ingest/report-voice";
import { buildDomainRows } from "@features/brain/server/ingest/domain";
import { redactUrlSecrets } from "@features/brain/server/ingest/upsert";
import { sheetTabsWithRows } from "@features/brain/server/ingest/drive";
import { DRIVE_SCOPE, getDelegatedToken, readVercelOidcToken } from "@shared/http/google-oauth";
import { reconcile, summarise, type Reading } from "@features/brain/server/reconcile";
import { recordNotice } from "@features/brain/server/notice";
import { fetchWithTimeout } from "@shared/http/fetch-with-timeout";
import { isProdCronHost } from "@shared/http/is-prod-cron-host";
import { notifySlack } from "@shared/observability/slack";
import {
  recordCronRun,
  startCronTimer,
  verifyCronAuth,
} from "@shared/observability/slack-alert-dedup";
import logger from "@shared/observability/logger";
import { reportingDay, reportingDayStart } from "@shared/time/reporting-day";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/**
 * 120, not 60. The corpus-wide secret scan reads every chunk — 12.5s over 25,000 of them,
 * measured — and that number grows with the corpus. A kill writes NO `cron_run` row, so
 * the worst runs would be the invisible ones. The scan also gives up and reports itself
 * UNREAD rather than returning a false zero; both guards are needed, because a budget
 * without the honest report is how a partial scan becomes a clean bill of health.
 */
export const maxDuration = 120;

const WINDOW_DAYS = 30;

async function rpc<T>(name: string, body: Record<string, unknown>): Promise<T | null> {
  const res = await supabaseFetch(`/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) return null;
  return (await res.json().catch(() => null)) as T | null;
}

/** How many chunks a source currently holds. Null when the count cannot be read. */
async function sourceCount(source: string): Promise<number | null> {
  const res = await supabaseFetch(`/rest/v1/brain_chunk?select=id&source=eq.${source}&limit=1`, {
    headers: { Prefer: "count=exact", Range: "0-0" },
  });
  if (!res.ok) return null;
  const n = Number(res.headers.get("content-range")?.split("/")[1]);
  return Number.isFinite(n) ? n : null;
}

/** Sum of real money in the ledger: succeeded, not staff testing, actually charged. */
async function ledgerRevenue(): Promise<number | null> {
  /**
   * PAGED, because `limit=5000` is a lie: PostgREST caps a response at 1,000 rows
   * and says so only in `Content-Range`. At 41 succeeded payments today this summed
   * correctly; at 1,001 it would silently under-report revenue and the check would
   * report a disagreement that is really its own truncation — failing precisely when
   * the business succeeds.
   */
  const rows = await fetchAllRows<{ amount: number | string }>(
    "/rest/v1/payment?select=amount&status=eq.succeeded&is_test=is.false&amount=gt.0&order=id.asc"
  );
  if (!Array.isArray(rows)) return null;
  return Math.round(rows.reduce((t, r) => t + Number(r.amount ?? 0), 0) * 100) / 100;
}

/** The all-time revenue the corpus publishes — what a caller is actually told. */
async function corpusRevenue(): Promise<number | null> {
  // Built from parts rather than one long literal: as a single string the query trips the
  // `no-secrets` lint rule on entropy, which is a false positive but a blocking one.
  const query = ["select=body", "source=eq.analytics", "source_id=eq.alltime", "limit=1"].join("&");
  const res = await supabaseFetch(`/rest/v1/brain_chunk?${query}`);
  if (!res.ok) return null;
  const body = ((await res.json().catch(() => [])) as Array<{ body?: string }>)[0]?.body ?? "";
  const m = /Revenue: EUR ([\d.]+)/.exec(body);
  return m ? Number(m[1]) : null;
}

/** The first day the SERVER paywall signal wrote anything, as a plain date string. */
async function serverPaywallSignalFirstDay(): Promise<string | null> {
  const res = await supabaseFetch(
    "/rest/v1/report_price_quote?select=paywall_reached_at&paywall_reached_at=not.is.null" +
      "&order=paywall_reached_at.asc&limit=1"
  );
  if (!res.ok) return null;
  const rows = (await res.json().catch(() => [])) as Array<{ paywall_reached_at?: string }>;
  const t = rows[0]?.paywall_reached_at;
  return t ? reportingDay(new Date(t)) : null;
}

/** A date string as days since epoch, so two dates can be compared as a Reading. */
function asDayNumber(day: string): number {
  return Math.round(Date.parse(`${day}T00:00:00Z`) / 86_400_000);
}

export async function buildReadings(): Promise<{ readings: Reading[]; unread: string[] }> {
  /**
   * BERLIN midnight, not UTC midnight.
   *
   * Every RPC read below buckets on a Berlin day, and the sparkline functions
   * generate their day axis from these bounds. A UTC-midnight `until` makes the
   * axis stop a day short of the window it claims, so the newest day is absent
   * rather than zero — which the two series readings below caught on their first
   * run: 414 submissions charted against 416 that exist.
   *
   * `reportingDayStart` rather than arithmetic, because Berlin midnight is 22:00
   * or 23:00 UTC depending on the season, and the 30-day step snaps for the same
   * reason instead of subtracting fixed days across a DST change.
   */
  const until = reportingDayStart(reportingDay(new Date()));
  const since = reportingDayStart(
    reportingDay(new Date(until.getTime() - WINDOW_DAYS * 86_400_000))
  );
  const range = { since_ts: since.toISOString(), until_ts: until.toISOString() };

  const readings: Reading[] = [];
  const unread: string[] = [];

  const cohorts = await rpc<Array<{ axis: string; arm: string; n: number; conversions: number }>>(
    "get_arm_cohorts",
    range
  );
  const axis = await rpc<Array<{ axis: string; arm: string; completions: number; paid: number }>>(
    "get_axis_funnel_daily",
    range
  );

  if (!cohorts || !axis) {
    unread.push("get_arm_cohorts / get_axis_funnel_daily");
  } else {
    const sum = (rows: number[]) => rows.reduce((t, n) => t + Number(n || 0), 0);
    const landCohorts = cohorts.filter((r) => r.axis === "landing");
    const landAxis = axis.filter((r) => r.axis === "landing");
    // These two read the same submissions through the same expression. The SQL comment in
    // get_axis_funnel_daily says outright that "the two cannot disagree" — which nothing
    // has ever checked, and an unchecked invariant is a belief.
    readings.push({
      what: `finished surveys, last ${WINDOW_DAYS} days`,
      left: { source: "get_arm_cohorts", value: sum(landCohorts.map((r) => r.n)) },
      right: { source: "get_axis_funnel_daily", value: sum(landAxis.map((r) => r.completions)) },
      tolerance: 0,
    });
    readings.push({
      what: `paid, last ${WINDOW_DAYS} days`,
      left: { source: "get_arm_cohorts", value: sum(landCohorts.map((r) => r.conversions)) },
      right: { source: "get_axis_funnel_daily", value: sum(landAxis.map((r) => r.paid)) },
      tolerance: 0,
    });
  }

  const cvr = await rpc<{ days?: Array<{ visitors: number }> }>("get_funnel_cvr_sparklines", range);
  const arm = await rpc<{ visitors?: Array<{ n: number }> }>("get_landing_arm_funnel_daily", range);
  if (!cvr?.days || !arm?.visitors) {
    unread.push("get_funnel_cvr_sparklines / get_landing_arm_funnel_daily");
  } else {
    // The funnel's top row and the line under its chart count the same visitor-days. They
    // are drawn side by side in one Slack message, so a gap is visible to the whole team
    // before it is visible to us.
    readings.push({
      what: `visits, last ${WINDOW_DAYS} days`,
      left: {
        source: "the funnel's top row",
        value: arm.visitors.reduce((t, v) => t + Number(v.n || 0), 0),
      },
      right: {
        source: "the survey-reach line",
        value: cvr.days.reduce((t, d) => t + Number(d.visitors || 0), 0),
      },
      tolerance: 0,
    });
  }

  /**
   * The repo-built corpora, counted against what the builders actually produce.
   *
   * `report` and `domain` are built from files rather than fetched, so the number of chunks
   * they SHOULD hold is knowable exactly.
   *
   * `skill` is deliberately NOT here, though this comment used to claim it was. It reads
   * its prompt list back out of the `drive` corpus, so its expected count depends on remote
   * data and cannot be derived from the repo — there is no second way to count it, which is
   * the only thing this check can do.
   *
   * NOTHING WATCHES THE OTHER SOURCES FOR ROW LOSS, and that is a real gap rather than an
   * oversight to fix casually: detecting a shrink needs yesterday's number, and this
   * reconciler is stateless on purpose — every check derives one quantity two ways from
   * what is true right now. `drive`, `gmail` and `notion` have their own majority guard in
   * the sweep; the append-only sources (`decision`, `notice`) have nothing. Their ingesters refuse to sweep on an
   * empty build — but a build that produced HALF its rows would sweep the other half away
   * and look like a normal run. A data file renamed, an export changed shape, a parser that
   * stops matching: all of those are silent, and all of them are caught by counting.
   */
  for (const [source, built] of [
    ["report", buildReportVoiceRows(new Date().toISOString())],
    ["domain", buildDomainRows(new Date().toISOString())],
  ] as Array<[string, Array<{ source_id: string; body: string }>]>) {
    const held = await sourceCount(source);
    if (held === null) {
      unread.push(`${source} chunk count`);
      continue;
    }
    readings.push({
      what: `${source} chunks in the corpus`,
      left: { source: "what the builder produces", value: built.length },
      right: { source: "what the corpus holds", value: held },
      tolerance: 0,
      because:
        "these are built from files in the repo, so the two are the same number or something dropped rows",
    });

    /**
     * COUNTING ROWS CANNOT SEE AN EDIT.
     *
     * Rewriting a report chapter changes no row count at all: the chunk keeps its
     * `source_id` and the corpus keeps the OLD words, so the brain quotes copy we no
     * longer ship and every count above still agrees. The builder's own output is the
     * exact bytes that should be stored, so comparing against it needs no normalising —
     * which matters, because comparing against the raw data file instead means
     * re-deriving the ingester's HTML handling by hand, and four separate attempts at
     * that each reported staleness that was not there.
     */
    const stored = await fetchAllRows<{ source_id: string; body: string }>(
      `/rest/v1/brain_chunk?select=source_id,body&source=eq.${source}&order=source_id.asc`
    );
    if (!stored) {
      unread.push(`${source} chunk text`);
      continue;
    }
    const bodies = new Map(stored.map((r) => [r.source_id, r.body ?? ""]));
    const matching = built.filter((r) => bodies.get(r.source_id) === r.body).length;
    readings.push({
      what: `${source} chunks whose stored text is what the builder produces`,
      left: { source: "what the builder produces", value: built.length },
      right: { source: "what the corpus holds, character for character", value: matching },
      tolerance: 0,
      because:
        "an edit keeps the row and changes the words, so the counts above agree while the brain quotes copy we no longer ship",
    });
  }

  /**
   * NO CHUNK ANYWHERE SHOULD STILL CARRY A SECRET.
   *
   * `upsertChunks` redacts on the way in, so the expected number is exactly zero and any
   * other answer means something wrote around it. Not hypothetical: on 2026-09-17 a full
   * WhatsApp re-sync, run by hand from a checkout that predated the redaction, put six
   * live report-access tokens back into the corpus forty minutes after they had been
   * cleaned out. Hand-run scripts are the hole, and nothing noticed.
   *
   * SCANS EVERYTHING, and the first version of this check did not — it read one page of
   * 5,000 and reported zero while a planted token sat outside it. The daily touch moves
   * `updated_at` on most of the corpus, so "recently written" selects almost everything
   * and a single page is a fifth of it. A bounded scan that reports zero is worse than no
   * check: it answers the question wrongly and confidently.
   */
  let leaking = 0;
  let scanned = 0;
  let scanFailed = false;
  // Well inside the ceiling, and the tail after this still has to run.
  const scanDeadline = Date.now() + 70_000;
  for (let offset = 0; ; offset += 1000) {
    if (Date.now() > scanDeadline) {
      scanFailed = true;
      break;
    }
    const page = await supabaseFetch(
      `/rest/v1/brain_chunk?select=body,title,url&order=id&limit=1000&offset=${offset}`
    );
    if (!page.ok) {
      scanFailed = true;
      break;
    }
    const rows = (await page.json().catch(() => [])) as Array<{
      body: string;
      title: string;
      url: string | null;
    }>;
    if (rows.length === 0) break;
    scanned += rows.length;
    for (const r of rows) {
      if (
        redactUrlSecrets(r.body) !== r.body ||
        redactUrlSecrets(r.title) !== r.title ||
        (r.url !== null && redactUrlSecrets(r.url) !== r.url)
      ) {
        leaking += 1;
      }
    }
    if (rows.length < 1000) break;
  }
  if (scanFailed) {
    // NOT a reading of zero. A scan that stopped early knows nothing about what it did not
    // read, and saying so is the difference between "clean" and "did not look".
    unread.push(`corpus secret scan (stopped after ${scanned} chunks)`);
  } else {
    /**
     * A ROW THE SWEEP CANNOT REACH IS A ROW THAT LIVES FOREVER.
     *
     * `calendar` sweeps with `scopeKey: "mailbox"`, so a chunk whose `meta.mailbox` is
     * absent sits outside every scope the sweep considers and is never a candidate for
     * deletion — whatever happens to the meeting it describes.
     *
     * Measured 2026-09-20: six such rows, all frozen at 2026-09-17 while every other
     * calendar chunk was being touched hourly. Two were occurrences of the Roadmap
     * workshop on dates it had been moved off, so the corpus held three dates for one
     * meeting and two of them were wrong. They are legacy — `mailbox` is a required
     * argument to `eventToRows` now, and the comment there records that a mutation
     * dropping it once compiled and passed every test — so the population is closed,
     * and it was deleted. This check exists so it cannot quietly reopen.
     *
     * Counted for `gmail` too, which scopes the same way and currently has none.
     */
    const unsweepable = await countRows(
      "/rest/v1/brain_chunk?select=id&source=in.(calendar,gmail)&meta->>mailbox=is.null"
    );
    if (unsweepable === null) {
      unread.push("rows the sweep cannot reach");
    } else {
      readings.push({
        what: "chunks outside every scope their source sweeps by",
        left: { source: "what the sweep can reach", value: 0 },
        right: { source: "what carries no scope key", value: unsweepable },
        tolerance: 0,
        because:
          "calendar and gmail sweep scoped by `meta.mailbox`, so a row without one is never a deletion candidate and outlives the meeting or thread it describes",
      });
    }

    /**
     * CAN A BROWSER KEY READ THE CORPUS?
     *
     * `brain_chunk` holds the company's mail, meeting transcripts, contracts and Notion —
     * and it sits behind the same PostgREST the browser talks to. What keeps it private is
     * one row-level-security policy, `service_role_only`, whose `USING` clause is `false`.
     * Delete that policy, or add a permissive one beside it, and the entire corpus becomes
     * world-readable to anyone holding the publishable key, which is in the page source of
     * every visitor's browser.
     *
     * NOTHING ENFORCED THAT. The boundary is covered by `__tests__/integration/`, which
     * skips silently when `SUPABASE_TEST_URL` is unset — and it is unset, in CI and
     * locally. A guard that never runs is a guard that is not there.
     *
     * So it is asked here, the way everything else in this file is asked: derive the same
     * quantity two ways and compare. The policy SAYS zero rows; the anon key is then used
     * to actually try. A key that is missing, or a request that fails, lands in `unread` —
     * "could not check" must never read as "checked and fine", least of all here.
     */
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!anonKey || !supabaseUrl) {
      unread.push("corpus readable by a browser key");
    } else {
      try {
        const probe = await fetchWithTimeout(
          `${supabaseUrl}/rest/v1/brain_chunk?select=id&limit=5`,
          { headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` }, timeoutMs: 10_000 }
        );
        // A refusal (401/403) is the boundary holding just as much as an empty list is.
        // Only a 2xx that actually RETURNS rows is exposure.
        const visible = probe.ok ? ((await probe.json().catch(() => [])) as unknown[]).length : 0;
        if (!probe.ok && probe.status !== 401 && probe.status !== 403) {
          unread.push(`corpus readable by a browser key (HTTP ${probe.status})`);
        } else {
          readings.push({
            what: "corpus rows a browser key can read",
            left: { source: "what the row-level-security policy allows", value: 0 },
            right: { source: "what it actually returns when asked", value: visible },
            tolerance: 0,
            because:
              "brain_chunk holds the company's mail, contracts and meeting transcripts behind one policy whose USING clause is `false`; the publishable key is in every visitor's page source, so anything above zero is the whole corpus being world-readable",
          });
        }
      } catch (err) {
        logger.warn({ err }, "brain-reconcile: anon corpus probe failed");
        unread.push("corpus readable by a browser key");
      }
    }

    readings.push({
      what: `chunks holding a secret (all ${scanned} scanned)`,
      left: { source: "what the redaction rule allows", value: 0 },
      right: { source: "what the corpus holds", value: leaking },
      tolerance: 0,
      because:
        "every write goes through the redaction, so anything above zero means something wrote around it — usually a hand-run script from a checkout that predates the rule. Fix with `npm run brain:redact -- --apply`",
    });
  }

  /**
   * THE SQL-TO-TYPESCRIPT CONTRACT.
   *
   * Nothing else checks it. The unit tests mock every RPC, so a fixture encodes
   * what the RPC is BELIEVED to return and production is free to disagree —
   * which is exactly how `get_paywall_hits` shipped returning the wrong
   * `firstRowDay` for weeks while its tests stayed green, and how four sparkline
   * RPCs bucketed on a UTC day under a Berlin header. The integration lane
   * cannot cover it either: it skips on an unset secret, so a guard there never
   * runs. This cron already runs daily against production with a real database,
   * which makes it the only honest home for these.
   *
   * Each is a fact the RPC must satisfy, not a number someone typed.
   */
  const [paywall, serverFirstDay, cvrForContract] = await Promise.all([
    rpc<{ hits?: number; firstRowDay?: string | null }>("get_paywall_hits", range),
    serverPaywallSignalFirstDay(),
    rpc<{ days?: Array<{ day: string; completions: number }> }>("get_funnel_cvr_sparklines", range),
  ]);

  if (!paywall?.firstRowDay || !serverFirstDay) {
    unread.push("get_paywall_hits firstRowDay");
  } else {
    // firstRowDay must be the LATER of the two paywall signals — the day the step
    // became meaningfully measured. It was MIN across both, which returned the
    // day the LOSSY client event started (2026-05-24) and made the caller's
    // "this row covers N days, not 30" caveat unreachable for ever.
    readings.push({
      what: "paywall signal start, as the digest is told it",
      left: { source: "get_paywall_hits.firstRowDay", value: asDayNumber(paywall.firstRowDay) },
      right: { source: "the server column's first row", value: asDayNumber(serverFirstDay) },
      tolerance: 0,
      because:
        "firstRowDay must be the LATER of the two paywall signals. MIN across both returns the lossy client event's start and silently disables the funnel's coverage caveat",
    });
  }

  const cvrDays = cvrForContract?.days;
  if (!Array.isArray(cvrDays) || cvrDays.length === 0) {
    unread.push("get_funnel_cvr_sparklines day series");
  } else {
    // The series must END on the day before the window closes. A bare `::date` on
    // a Berlin-midnight bound resolves in the pooler's UTC and drops the last day
    // entirely — which is how "visits yesterday were 100% below average" was
    // published on a day with 543 visits.
    const expectedLastDay = reportingDay(new Date(new Date(range.until_ts).getTime() - 1));
    readings.push({
      what: "last day of the daily funnel series",
      left: {
        source: "the RPC's own series",
        value: asDayNumber(cvrDays[cvrDays.length - 1]!.day),
      },
      right: { source: "the day before the window closes", value: asDayNumber(expectedLastDay) },
      tolerance: 0,
      because:
        "a bare ::date on a Berlin-midnight bound resolves in the pooler's UTC zone and cuts the series a day short, so the most recent day reads as zero rather than missing",
    });

    // And the series must CONSERVE rows: every submission in the window has to
    // land on a day the series generates. It did not when the buckets moved to
    // Berlin days while the axis did not.
    const charted = cvrDays.reduce((t, d) => t + Number(d.completions ?? 0), 0);
    const actual = await countRows(
      `/rest/v1/survey_submission?select=id&created_date_time=gte.${range.since_ts}` +
        `&created_date_time=lt.${range.until_ts}`
    );
    if (actual === null) {
      unread.push("survey_submission count for the series check");
    } else {
      readings.push({
        what: "submissions charted vs submissions that exist",
        left: { source: "summed across the RPC's days", value: charted },
        right: { source: "counted in the window", value: actual },
        tolerance: 0,
        because:
          "a row whose Berlin day falls outside the generated axis is dropped from the chart with no error — the window total stays right, so only this comparison sees it",
      });
    }
  }

  const [corpus, ledger] = await Promise.all([corpusRevenue(), ledgerRevenue()]);
  if (corpus === null || ledger === null) {
    unread.push("all-time revenue");
  } else {
    // What the brain TELLS people against what the money says. This is the one a person
    // would quote in a meeting, and it was wrong by EUR 145 this morning because a window
    // started where visitor tracking began rather than where payments did.
    readings.push({
      what: "all-time revenue",
      left: { source: "what the corpus publishes", value: corpus },
      right: { source: "the payment ledger", value: ledger },
      tolerance: 0.01,
      because: "the corpus is rebuilt on a schedule, so it can lag the ledger by one run",
    });
  }

  return { readings, unread };
}

/**
 * DOES THE CORPUS STILL CONTAIN WHAT THE SOURCE CONTAINS?
 *
 * Every other check here compares two numbers we already hold. This one is the only
 * one that leaves the building, and it exists because on 2026-09-19 a spreadsheet was
 * indexed, counted, reconciled to the exact file — and held one tab of two. Nothing
 * failed. The export succeeded, the row existed, the file count was right, and the
 * answer was confidently wrong. No count could have caught it, because counting
 * containers cannot see inside them.
 *
 * Deliberately tiny: three spreadsheets a day, metadata only, no cell values. Enough
 * that a reader change which silently drops content stops being invisible, cheap
 * enough that it can run beside the others forever.
 */
/**
 * How many of a spreadsheet's tabs are actually present in the indexed text.
 *
 * Pure, because this one comparison IS the check — everything around it is network
 * plumbing. A tab counts as present only when its own `## <title>` heading is there,
 * which is what the reader writes; matching the bare title would pass on a sheet that
 * merely mentions the word.
 */
/**
 * Which few documents today's run checks.
 *
 * `sort().slice(0, 3)` checked the SAME three spreadsheets every day and left the
 * other thirty-seven never verified — a check that cannot see most of what it is
 * meant to guard. Rotating by day walks the whole set in about a fortnight, the
 * same shape `constructsForDay` uses for the evidence cycle.
 *
 * Stable order in, stable order out: the walk is by index, so a document is only
 * reordered when the corpus itself gains or loses spreadsheets.
 */
export function sampleForDay<T>(all: T[], dayIndex: number, size: number): T[] {
  if (all.length <= size) return all;
  const start = (((dayIndex * size) % all.length) + all.length) % all.length;
  return Array.from({ length: size }, (_, i) => all[(start + i) % all.length]!);
}

export function tabsPresentInText(text: string, titles: string[]): number {
  return titles.filter((t) => text.includes(`## ${t}`)).length;
}

export async function sheetTabReading(request: Request): Promise<Reading | null> {
  // The SERVICE ACCOUNT token is refused here (403 PERMISSION_DENIED): these
  // spreadsheets belong to people, not to the service account, so reading them needs
  // the same DELEGATED token the drive ingester uses. Getting this wrong does not
  // fail loudly — it lands in `unread` every night, which reads as "not checked yet"
  // rather than "this check has never once run".
  const admin = process.env.GOOGLE_WORKSPACE_ADMIN?.trim();
  if (!admin) return null;
  const token = await getDelegatedToken(
    admin,
    DRIVE_SCOPE,
    Date.now(),
    readVercelOidcToken(request)
  );
  if (!token) return null;

  // Built from parts rather than written out: the percent-encoded form of this filter
  // is high-entropy enough that `no-secrets` refuses the commit, and a literal that
  // trips a secret scanner is a literal somebody will eventually silence the scanner for.
  const spreadsheetFilter = `url=ilike.*${encodeURIComponent("/spreadsheets/")}*`;

  /**
   * IDS FIRST, PAGED — then every chunk of the three sampled documents.
   *
   * This used to read one page of 400 chunks and group whatever came back. There are
   * 1,004 spreadsheet chunks, so a document whose parts fell outside that page had
   * its tabs reported MISSING when they were indexed perfectly well. It fired on
   * 2026-09-20 and named four tabs that were in the corpus, including one of 397
   * rows — a check that cries wolf daily is worse than no check, because the next
   * real disagreement is the one nobody reads.
   *
   * Ids are cheap (no body), so page them properly rather than trusting one request
   * not to hit PostgREST's 1,000-row ceiling.
   */
  const baseIds = new Set<string>();
  for (let offset = 0; offset < 20_000; offset += 1000) {
    const page = await supabaseFetch(
      `/rest/v1/brain_chunk?select=source_id&source=eq.drive&${spreadsheetFilter}` +
        `&order=source_id.asc&limit=1000&offset=${offset}`
    );
    if (!page.ok) return null;
    const rows = (await page.json()) as Array<{ source_id: string }>;
    for (const r of rows) baseIds.add(r.source_id.split("#")[0]!);
    if (rows.length < 1000) break;
  }

  const dayIndex = Math.floor(Date.now() / 86_400_000);
  const sample = sampleForDay([...baseIds].sort(), dayIndex, 3);
  if (sample.length === 0) return null;

  // Every part of the sampled documents, so a tab heading cannot be missed for
  // sitting in a chunk the check never fetched.
  const byDoc = new Map<string, string>();
  for (const base of sample) {
    const rows = await fetchAllRows<{ source_id: string; body: string }>(
      `/rest/v1/brain_chunk?select=source_id,body&source=eq.drive` +
        `&source_id=like.${encodeURIComponent(base)}*&order=source_id.asc`
    );
    if (!rows) return null;
    byDoc.set(base, rows.map((r) => r.body ?? "").join("\n"));
  }

  let expected = 0;
  let found = 0;
  for (const base of sample) {
    const fileId = base.replace(/^doc:/, "");
    // Only tabs that HOLD something: the reader skips an empty tab, so expecting a
    // heading for one is a gap the corpus can never close.
    const titles = await sheetTabsWithRows(token, fileId);
    const text = byDoc.get(base) ?? "";
    expected += titles.length;
    found += tabsPresentInText(text, titles);
  }
  return {
    what: `spreadsheet tabs present in the corpus (${sample.length} sampled)`,
    left: { source: "google sheets", value: expected },
    right: { source: "brain_chunk", value: found },
    tolerance: 0,
  };
}

export async function GET(request: Request) {
  // Returns a boolean, not a response — the same shape every other cron checks.
  if (!verifyCronAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isProdCronHost()) {
    return NextResponse.json({ skipped: "not the production host" });
  }

  const startedAtMs = Date.now();
  const checkSlow = startCronTimer("brain-reconcile", maxDuration);
  let status: "success" | "error" = "success";
  let errorMessage: string | undefined;
  let disagreements = 0;
  let checked = 0;

  try {
    const { readings, unread } = await buildReadings();
    // The only check that leaves the building. "Could not read it" is not "it agrees",
    // so a missing token lands in `unread` rather than passing silently.
    try {
      const tabs = await sheetTabReading(request);
      if (tabs) readings.push(tabs);
      else unread.push("spreadsheet tabs (no Google token)");
    } catch (err) {
      logger.warn({ err }, "brain-reconcile: the spreadsheet tab check could not run");
      unread.push("spreadsheet tabs");
    }
    checked = readings.length;
    const found = reconcile(readings);
    disagreements = found.length;

    // "Could not read it" is not "it agrees". Silence has to mean checked-and-fine, or the
    // whole design — that no news is good news — quietly stops being true.
    if (unread.length) {
      errorMessage = `could not read: ${unread.join(", ")}`;
      logger.warn({ unread }, "brain-reconcile: some checks could not run");
    }

    const message = summarise(found, checked);
    if (message) {
      await notifySlack({ channel: "brain", kind: "brain_reconcile", text: message });
      await recordNotice({
        headline: `${found.length} of the brain's own numbers disagree with themselves`,
        detail: message,
        kind: "brain-reconcile",
        evidence: found.map((f) => f.what).join(", "),
      });
    }
    logger.info({ checked, disagreements, unread: unread.length }, "brain-reconcile");
  } catch (err) {
    status = "error";
    errorMessage = err instanceof Error ? err.message : String(err);
    logger.error({ err }, "brain-reconcile failed");
  } finally {
    await checkSlow();
    await recordCronRun(
      "brain-reconcile",
      startedAtMs,
      status,
      errorMessage ?? `${checked} checks, ${disagreements} disagreed`
    );
  }

  return NextResponse.json({ checked, disagreements });
}
