/**
 * Read Replay Vision findings and shape them for Slack.
 *
 * PostHog's scanners watch the recordings; this only relays what they said. It
 * never judges a session itself — the judgement is the prompt in `scanners.ts`,
 * which changes through a reviewed PR, plus a human thumbs up/down afterwards.
 * That is the inverse of `conversion-digest`'s rule ("significance is computed,
 * never narrated by a model"): here everything IS model prose, so all of it is
 * labelled as unreviewed on the way out.
 *
 * Observations are read as `$recording_observed` EVENTS rather than through the
 * vision REST list, because one HogQL call returns verdict, confidence, prose,
 * scanner name and version together, and the confidence bar can live in the
 * WHERE clause — so a weak finding never reaches Slack and never burns a
 * dedupe claim.
 */
import { fetchWithTimeout } from "@shared/http/fetch-with-timeout";
import logger from "@shared/observability/logger";
import { escapeSlack, type SlackBlock } from "@shared/observability/slack";
import { context, header, linkButton, section } from "@shared/observability/slack-blocks";

import { UX_REVIEW_MIN_CONFIDENCE, UX_SCANNERS } from "./scanners";

/**
 * Scanners the digest must stay silent about.
 *
 * A challenger is an experiment running alongside its champion on the same
 * trigger event. The verifier already refuses to post its verdicts and to open
 * its pull requests — but the DIGEST reads PostHog and the ledger directly and
 * had no notion of role, so the first challenger produced a second bullet
 * reading "The report — watched 3, suspected 0" directly beneath the
 * champion's "The report — watched 85, suspected 27". Two lines, the same
 * label, different numbers, in the one message written for someone who does
 * not read the code.
 *
 * Same rule as everywhere else: a challenger is measured, never consulted.
 * `scripts/replay-bench/score.mjs --ledger` is where the comparison belongs.
 */
/**
 * A read that came back exactly full is a read that was CUT SHORT.
 *
 * These three fetches go straight to PostgREST via `fetchWithTimeout`, not
 * through `features/admin/server/supabase.ts`, so the max-rows guard that
 * shouts about this elsewhere does not cover them. Each states its own `limit`,
 * and none of them is close to it today — but that is a fact about current
 * volume, not a property of the code, and the failure mode is the quiet one:
 * the digest reports a coverage percentage or an outcome tally computed on a
 * slice, with nothing anywhere saying a slice is what it was.
 *
 * ERROR, not warn: only error and fatal are mirrored to Slack.
 */
export function warnIfTruncated(rows: readonly unknown[], limit: number, what: string): void {
  if (rows.length < limit) return;
  logger.error(
    { what, returned: rows.length, limit },
    "ux-review: a read came back exactly at its limit — rows are MISSING and the figure built from them is computed on a slice"
  );
}

/**
 * MATCHED BY NAME CONVENTION, not by the pinned list in scanners.ts. Three
 * reasons, the first of which is the one that bit on 2026-09-21:
 *
 *  - A RETIRED challenger leaves the pinned list while its rows stay in the
 *    ledger and its events stay in PostHog for another month. Keyed off the
 *    list, the digest would start reporting a dead experiment's numbers as
 *    production on the day it was deleted.
 *  - A challenger created in PostHog and not yet committed would be reported
 *    as a live scanner. That is the exact state the drift check exists to
 *    catch, and the digest should not compound it.
 *  - `championChallengerPairs` already keys on this convention, so one rule
 *    governs both and one test proves it.
 *
 * `<champion name> (challenger: …)` is the convention; scanners.ts documents it
 * and __tests__/scripts/challenger-scanner.test.ts enforces it.
 */
const CHALLENGER_NAME = / \(challenger[^)]*\)$/;
/** Exported to be tested. An unknown scanner counts as production. */
export const isChallengerScanner = (name: string | null | undefined): boolean =>
  CHALLENGER_NAME.test(String(name ?? ""));

const PROJECT = "244778";
const POSTHOG_REPLAY_BASE = `https://eu.posthog.com/project/${PROJECT}/replay`;

/** How far back each run looks. 3x the 30-minute schedule, so one missed tick
 *  and any ingestion lag are both absorbed. Re-reading the same observation is
 *  free: the claim table is the dedupe, so there is no cursor to keep. */
export const LOOKBACK_MINUTES = 90;

/** Most Slack posts one run may make, across all scanners. */
export const MAX_POSTS_PER_RUN = 6;

export interface UxFinding {
  observationId: string;
  sessionId: string;
  scannerId: string;
  scannerName: string;
  scannerVersion: number;
  confidence: number;
  reasoning: string;
}

export function recordingLink(sessionId: string): string {
  return `${POSTHOG_REPLAY_BASE}/${encodeURIComponent(sessionId)}`;
}

/** Scanner whose live config has drifted from the version pinned in git. */
export interface ScannerDrift {
  scannerName: string;
  /** What is wrong, so the alert can say it rather than imply it. */
  reason: "missing" | "disabled" | "version" | "prompt" | "limit";
  detail: string;
}

/** The subset of PostHog's scanner record this comparison needs. */
export interface LiveScanner {
  name: string;
  enabled?: boolean;
  scanner_version?: number;
  scanner_config?: { prompt?: string } | null;
  limit_reached?: boolean;
}

/**
 * Compare what PostHog is actually running against what git pins.
 *
 * THE OLD VERSION INFERRED DRIFT FROM OBSERVATIONS and could not see the cases
 * that matter. It took the findings list — already filtered to verdict=yes above
 * 0.7 confidence in the last 90 minutes — and did
 * `Math.max(0, ...seen.map(f => f.scannerVersion)) > pinned`. Three holes:
 *
 *   * a scanner that produced no high-confidence YES in 90 minutes yields
 *     `Math.max(0)` = 0, which never exceeds the pinned version. So a QUIET or
 *     DISABLED scanner could have its prompt rewritten in the PostHog UI
 *     indefinitely and nothing would ever fire.
 *   * only `live > pinned` fired, so a rollback was invisible.
 *   * a prompt edited WITHOUT bumping the version — the likeliest way a UI edit
 *     happens — was invisible by construction, and the prompt is the thing the
 *     comment said it was protecting.
 *
 * The scanner list is readable (`GET /vision/scanners/`), carries the prompt in
 * `scanner_config`, and `scripts/sync-vision-scanners.ts` already writes through
 * it. Comparing the real thing is both simpler and actually capable of failing.
 *
 * Pure, so it can be tested without the network; `fetchScannerDrift` is the
 * thin wrapper that fetches.
 */
export function compareScanners(live: readonly LiveScanner[]): ScannerDrift[] {
  const drift: ScannerDrift[] = [];
  for (const pinned of UX_SCANNERS) {
    const found = live.find((s) => s.name === pinned.name);
    if (!found) {
      drift.push({
        scannerName: pinned.name,
        reason: "missing",
        detail:
          "it is pinned in git but PostHog has no scanner by that name, so nothing observes it",
      });
      continue;
    }
    if (found.enabled === false) {
      drift.push({
        scannerName: pinned.name,
        reason: "disabled",
        detail: "it is disabled in PostHog, so it observes nothing — silent, not noisy",
      });
    }
    if (
      typeof found.scanner_version === "number" &&
      found.scanner_version !== pinned.scannerVersion
    ) {
      drift.push({
        scannerName: pinned.name,
        reason: "version",
        detail: `PostHog is at version ${found.scanner_version}, git pins ${pinned.scannerVersion}`,
      });
    }
    /**
     * Both sides trimmed, for symmetry. The pinned side is a no-op today — all
     * four prompts in scanners.ts have `len === trim().length` — so a mutation
     * test that removes `pinned.prompt.trim()` survives. That is an equivalent
     * mutant, not a missing test: the day someone reformats scanners.ts with a
     * template literal that opens on a newline, an asymmetric comparison would
     * report drift on every scanner, every day, forever.
     */
    const livePrompt = (found.scanner_config?.prompt ?? "").trim();
    // Only when PostHog actually returned one: an empty field is a response
    // shape we do not understand, and reporting drift from it would be noise.
    if (livePrompt && livePrompt !== pinned.prompt.trim()) {
      drift.push({
        scannerName: pinned.name,
        reason: "prompt",
        detail:
          `the prompt in PostHog differs from the one in git ` +
          `(${livePrompt.length} chars live, ${pinned.prompt.trim().length} pinned) — ` +
          `the criteria being applied are not the criteria in the repo`,
      });
    }
    if (found.limit_reached) {
      drift.push({
        scannerName: pinned.name,
        reason: "limit",
        detail: "it has hit its credit limit, so it has stopped observing",
      });
    }
  }
  return drift;
}

/** Read the live scanners and compare. Empty on any failure — never a false alarm. */
export async function fetchScannerDrift(): Promise<ScannerDrift[]> {
  const key = process.env.POSTHOG_API_KEY;
  if (!key) return [];
  try {
    const res = await fetchWithTimeout(
      `https://eu.posthog.com/api/projects/${PROJECT}/vision/scanners/`,
      {
        headers: { Authorization: `Bearer ${key}` },
        timeoutMs: 8000,
      }
    );
    if (!res.ok) return [];
    const payload = (await res.json()) as { results?: LiveScanner[] };
    // A missing list is an unreadable response, not "no scanners exist" — and
    // reporting all four as missing on a bad read would be the false alarm this
    // alert exists to avoid.
    if (!Array.isArray(payload.results)) return [];
    return compareScanners(payload.results);
  } catch {
    return [];
  }
}

/**
 * Fetch findings above the confidence bar. Returns [] rather than throwing when
 * PostHog is not configured — a cron that cannot read should log and skip, not
 * page someone at 03:00.
 */
/** One scanner's last 24 hours, for the daily summary. */
export interface DailyStat {
  scanner: string;
  observed: number;
  yes: number;
}

/**
 * The daily summary the 2026-09-08 sync asked for ("generate daily summaries of
 * user UX issues"). Counts every verdict, not just the YES ones, because the
 * ratio is the interesting number: on day one it was 5 yes / 31 observed and
 * every one of the five was wrong about why.
 */
export async function fetchDailyStats(): Promise<DailyStat[]> {
  const key = process.env.POSTHOG_API_KEY;
  if (!key) return [];

  const query = `
    SELECT toString(properties.scanner_name),
           count(),
           countIf(toString(properties.scanner_output_verdict) = 'yes')
    FROM events
    WHERE event = '$recording_observed'
      AND timestamp > now() - INTERVAL 24 HOUR
    GROUP BY toString(properties.scanner_name)
    ORDER BY count() DESC
    LIMIT 20
  `;

  const res = await fetchWithTimeout(`https://eu.posthog.com/api/projects/${PROJECT}/query/`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: { kind: "HogQLQuery", query } }),
    timeoutMs: 12_000,
  });
  if (!res.ok) throw new Error(`posthog daily query ${res.status}`);
  const payload = (await res.json()) as { results?: unknown[][]; error?: unknown };
  if (payload.error) {
    throw new Error(`posthog daily query error: ${String(payload.error).slice(0, 200)}`);
  }
  return (
    (payload.results ?? [])
      .map((row) => ({
        // `?? "unknown"` does not fire: HogQL's toString(NULL) is the EMPTY
        // STRING, not null, so a missing scanner_name arrived here as "" and
        // reached Marcus's digest as a bullet with no name ("• — watched 1").
        scanner: String(row[0] || "unknown"),
        observed: Number(row[1]) || 0,
        yes: Number(row[2]) || 0,
      }))
      // An experiment does not get a line in the daily summary.
      .filter((r) => !isChallengerScanner(r.scanner))
  );
}

/** The six outcomes `ux_finding.outcome` may hold — mirrors the table's CHECK. */
const OUTCOMES = [
  "reproduced",
  "clear",
  "inconclusive",
  "gap",
  "contradicted",
  "duplicate",
] as const;
type Outcome = (typeof OUTCOMES)[number];

/** What the verifier concluded, over the same 24 hours the digest covers. */
/** A confirmed problem, named so the digest can say what it was. */
export interface ReproducedFinding {
  criterion: string | null;
  urlPath: string | null;
  delivered: boolean;
  /**
   * True when the finding came from our own dead_click events rather than a
   * model watching a recording. Worth saying out loud: those are mechanical,
   * so "we found this without an AI" is a different and stronger claim than
   * "an AI noticed it and a probe agreed".
   */
  fromOwnRecords: boolean;
}

export interface VerificationStat {
  reproduced: number;
  /** The confirmed ones themselves. A count alone is not actionable. */
  reproducedItems: ReproducedFinding[];
  clear: number;
  inconclusive: number;
  gap: number;
  contradicted: number;
  duplicate: number;
  /** Verdicts that reached no human: the session had no submission thread. */
  undelivered: number;
  total: number;
}

/** How many of the readers who finished the survey were actually watched. */
export interface CoverageStat {
  /** Submissions in the window that carry a PostHog session id. */
  submissions: number;
  /** Of those, how many any scanner opened a recording for. */
  observed: number;
}

/**
 * Coverage: the question "did anyone look at this reader at all".
 *
 * Everything else in this digest counts what the scanners SAID. None of it can
 * show what they never opened, and that turned out to be most of it — measured
 * 2026-09-18 over seven days, 39 of 118 submissions were observed by any
 * scanner, so 67% of the people who finished the survey were never watched by
 * anything.
 *
 * Neither credits nor triggers explain it: the four scanners used 4% of their
 * 5,200-credit allowance over thirty days, and the trigger events fired for
 * roughly 710 sessions in the week against 105 observed. The throttle is
 * `samplingMode: "focused"` in the PostHog scanner config, which is a spend
 * decision rather than a bug — but one nobody could see from here, because
 * a digest that only counts findings looks identical whether coverage is 33%
 * or 100%.
 *
 * Returns null when it cannot be read, and the digest says so, for the same
 * reason the verification line does: a missing number must not read as a
 * healthy one.
 */
export async function fetchCoverageStats(): Promise<CoverageStat | null> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const posthogKey = process.env.POSTHOG_API_KEY;
  if (!url || !key || !posthogKey) return null;

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  try {
    const res = await fetchWithTimeout(
      `${url}/rest/v1/survey_submission?select=posthog_session_id` +
        `&created_date_time=gte.${since}&posthog_session_id=not.is.null&limit=500`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` }, timeoutMs: 8_000 }
    );
    if (!res.ok) return null;
    const rows = (await res.json()) as Array<{ posthog_session_id: string | null }>;
    warnIfTruncated(rows, 500, "coverage: survey_submission");
    const ids = rows
      .map((r) => r.posthog_session_id)
      .filter((id): id is string => id !== null && isSafeSessionId(id));
    if (ids.length === 0) return { submissions: 0, observed: 0 };

    // Same id guard as every other per-session lookup here: these are
    // interpolated into HogQL.
    const inList = ids.map((id) => `'${id}'`).join(",");
    /**
     * Watched BY THE PRODUCTION FLEET. A challenger observing a recording is
     * not coverage: it is an experiment, it can be deleted tomorrow, and if the
     * champion failed to open a session while the challenger did, counting it
     * here would report the reader as watched when the scanner that speaks to
     * the team never looked. Narrow today — the challenger only sweeps
     * sessions its champion already saw — and wrong in exactly the direction
     * that hides a gap, which is the failure this figure exists to expose.
     */
    const observed = await sessionQuery(
      `SELECT count(DISTINCT properties.session_id) FROM events
       WHERE event = '$recording_observed'
         AND timestamp > now() - INTERVAL 10 DAY
         AND properties.session_id IN (${inList})
         AND toString(properties.scanner_name) NOT LIKE '% (challenger%'`
    );
    if (observed === null) return null;
    return { submissions: ids.length, observed: Number(observed[0]?.[0]) || 0 };
  } catch {
    return null;
  }
}

/**
 * Read the verification ledger for the digest.
 *
 * Counted in JS from at most a few dozen rows a day rather than through a
 * PostgREST aggregate, because the row count is tiny and the aggregate syntax
 * is version-dependent — not worth a dependency on the deployed PostgREST
 * version for a number this small.
 *
 * Returns null when the ledger cannot be read, and the digest SAYS so. A
 * missing line would be indistinguishable from a quiet day, which is the
 * failure this whole feature exists to avoid.
 */
/** One scanner's record, as the scorecard reports it. */
export interface ScannerScore {
  scanner: string;
  right: number;
  wrong: number;
  contradicted: number;
}

/**
 * Read every labelled finding and score each scanner.
 *
 * `reproduced` is the scanner being right; `clear` from a mutation-proven probe
 * and `contradicted` from our own events are it being wrong. `inconclusive`,
 * `gap` and `duplicate` carry no verdict and are excluded — a denominator that
 * counts them would flatter everything equally.
 *
 * Challengers are NOT filtered here, unlike everywhere else in this file: the
 * scorecard is the one place whose entire purpose is to compare them.
 */
export async function fetchScannerScores(days = 30): Promise<ScannerScore[] | null> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const LIMIT = 5000;
  try {
    const res = await fetchWithTimeout(
      `${url}/rest/v1/ux_finding?select=outcome,scanner_name` +
        `&outcome=in.(reproduced,clear,contradicted)&created_at=gte.${since}&limit=${LIMIT}`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` }, timeoutMs: 8_000 }
    );
    if (!res.ok) return null;
    const rows = (await res.json()) as Array<{ outcome?: string; scanner_name?: string | null }>;
    warnIfTruncated(rows, LIMIT, "scorecard: ux_finding");
    const by = new Map<string, ScannerScore>();
    for (const r of rows) {
      const name = String(r.scanner_name ?? "unknown");
      const e = by.get(name) ?? { scanner: name, right: 0, wrong: 0, contradicted: 0 };
      if (r.outcome === "reproduced") e.right += 1;
      else e.wrong += 1;
      if (r.outcome === "contradicted") e.contradicted += 1;
      by.set(name, e);
    }
    return [...by.values()].sort((a, b) => b.right + b.wrong - (a.right + a.wrong));
  } catch {
    return null;
  }
}

/**
 * The weekly scorecard: what each scanner is actually worth, in plain words.
 *
 * WHY THIS EXISTS. `scripts/replay-bench/score.mjs --ledger` already computes
 * all of it, and prints it into a CI log. Nobody reads CI logs — that is the
 * failure mode behind most of what went wrong in this pipeline, and running a
 * champion/challenger experiment whose result lands there is the same mistake
 * with a nicer name. The number has to reach a person on its own.
 *
 * Pure, so it can be rendered and read before it is ever sent.
 */
export function buildScorecardMessage(
  scores: readonly ScannerScore[],
  days = 30
): { text: string; blocks: SlackBlock[] } {
  const n = (s: ScannerScore) => s.right + s.wrong;
  const pct = (s: ScannerScore) => (n(s) === 0 ? "n/a" : `${Math.round((s.right / n(s)) * 100)}%`);
  const live = scores.filter((s) => !isChallengerScanner(s.scanner));
  const right = live.reduce((a, s) => a + s.right, 0);
  const total = live.reduce((a, s) => a + n(s), 0);

  const lines = scores.map((s) => {
    /**
     * A challenger shares its champion's plain name — `plainScanner` maps both
     * "LoveIQ report UX" and "LoveIQ report UX (challenger: …)" to "The report"
     * — so without this the scorecard prints two lines called the same thing
     * with different numbers. That exact shape already reached Marcus once in
     * the daily digest; the suffix here is what stops it reaching him again.
     */
    const trial = isChallengerScanner(s.scanner) ? " — new version being tested" : "";
    const refuted = s.contradicted
      ? `, ${s.contradicted} described something our records say did not happen`
      : "";
    return `• ${escapeSlack(plainScanner(s.scanner))}${trial} — ${s.right} of ${n(s)} held up (${pct(s)})${refuted}`;
  });

  const blocks: SlackBlock[] = [
    header("🎯 How good are the recording checks?"),
    section(
      total === 0
        ? "*No checks have been scored yet.* Nothing to report."
        : `*Across the last ${days} days, ${right} of ${total} suspected problems held up when we re-tested them.*` +
            ` The rest were false alarms.`
    ),
    ...(lines.length ? [section(lines.join("\n"))] : []),
  ];

  /**
   * The trial is reported against the one it is trying to beat, and only when
   * BOTH have enough findings to mean anything. A comparison printed at n=2
   * invites a decision at n=2, which is the thing the sample size exists to
   * prevent.
   */
  const MIN = 30;
  for (const c of scores.filter((s) => isChallengerScanner(s.scanner))) {
    const base = c.scanner.replace(/ \(challenger[^)]*\)$/, "");
    const champ = scores.find((s) => s.scanner === base);
    if (!champ) continue;
    blocks.push(
      section(
        n(c) < MIN
          ? `*Trial in progress:* a second version of "${escapeSlack(plainScanner(base))}" is being` +
              ` tested quietly. ${n(c)} of the ${MIN} results needed before it can be judged. It` +
              ` says nothing to anyone until it wins.`
          : `*Trial result:* the new version got ${pct(c)} right against the current` +
              ` ${pct(champ)}, and described something impossible ${c.contradicted} times against` +
              ` ${champ.contradicted}. A person decides what happens next.`
      )
    );
  }

  blocks.push(
    context(
      "A check 'holds up' only when a real browser reproduces it at the reader's own screen size. " +
        "These are not opinions about the site; they are how often the AI watching recordings was right."
    )
  );
  return { text: `Recording checks — ${right} of ${total} held up over ${days} days.`, blocks };
}

export async function fetchVerificationStats(): Promise<VerificationStat | null> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  try {
    const res = await fetchWithTimeout(
      `${url}/rest/v1/ux_finding?select=outcome,delivered,criterion,url_path,scanner_name` +
        `&created_at=gte.${since}&limit=500`,
      {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
        timeoutMs: 8_000,
      }
    );
    if (!res.ok) return null;
    const allRows = (await res.json()) as Array<{
      outcome?: string;
      delivered?: boolean;
      criterion?: string | null;
      url_path?: string | null;
      scanner_name?: string | null;
    }>;
    /**
     * Production rows only. The digest reports what the CURRENT fleet
     * concluded; a challenger's verdicts are experiment data and would inflate
     * every count Marcus reads — including "undelivered", which is always true
     * for a challenger by design, so its findings would show up as verdicts
     * that reached nobody rather than as an experiment doing what it is meant
     * to do.
     */
    warnIfTruncated(allRows, 500, "verification: ux_finding");
    const rows = allRows.filter((r) => !isChallengerScanner(r.scanner_name));

    const tally: VerificationStat = {
      reproduced: 0,
      reproducedItems: [],
      clear: 0,
      inconclusive: 0,
      gap: 0,
      contradicted: 0,
      duplicate: 0,
      undelivered: 0,
      total: rows.length,
    };
    for (const row of rows) {
      // An explicit list, not `outcome in tally`: `in` walks the prototype
      // chain, so an outcome of "constructor" or "toString" would pass the
      // guard and turn a counter into NaN. The CHECK constraint makes that
      // unreachable from our own writes, which is exactly why it would survive
      // review — the list costs nothing and does not depend on that staying true.
      if (OUTCOMES.includes(row.outcome as Outcome)) tally[row.outcome as Outcome] += 1;
      if (row.outcome === "reproduced") {
        tally.reproducedItems.push({
          criterion: row.criterion ?? null,
          urlPath: row.url_path ?? null,
          delivered: row.delivered !== false,
          fromOwnRecords: (row.scanner_name ?? "").includes("our own"),
        });
      }
      if (row.delivered === false) tally.undelivered += 1;
    }
    return tally;
  } catch {
    return null;
  }
}

/** Who was actually watched. The number every other line here is silent about. */
/**
 * Plain English for a criterion id, for the one reader this message is written
 * for: a non-technical strategy lead reading it in Slack without context.
 *
 * Deliberately says what a VISITOR experienced, not what the code did. "L1" and
 * "a dead control" are both meaningless to him; "a button that looks live and
 * does nothing" is not. A criterion with no entry falls back to a neutral
 * sentence rather than leaking the id.
 */
const PLAIN_CRITERION: Record<string, string> = {
  L1: "people were sent back to an earlier screen instead of forwards",
  D1: "a button or link looked live but did nothing when tapped",
  B1: "people lost their place after dealing with the cookie banner",
  C1: "a heading or button was hidden behind something else",
  V1: "the main button was unusable at that screen size",
  Z1: "the survey jumped to the wrong question",
};

/** Where it happened, in words rather than a URL path. */
function placeOf(urlPath: string | null): string {
  if (!urlPath) return "the site";
  if (urlPath.startsWith("/survey")) return "the survey";
  if (urlPath.startsWith("/report")) return "someone's report";
  if (urlPath.startsWith("/checkout")) return "the checkout page";
  if (urlPath === "/" || urlPath.startsWith("/?")) return "the home page";
  return `the ${urlPath.replace(/^\//, "").split("/")[0]} page`;
}

/**
 * What each AI reviewer is actually watching for.
 *
 * The scanners are named for how they are configured in PostHog — "LoveIQ
 * dead-click cause" — which tells a reader nothing and reads like an error
 * code. An unknown name falls through unchanged rather than being dropped, so
 * adding a scanner cannot silently remove a line from this message.
 */
function plainScanner(name: string): string {
  const n = name.toLowerCase();
  // Every caller, not just the digest: a nameless scanner is still a real
  // observation and must be reported, but never as an empty bullet.
  if (!n.trim() || n === "unknown") return "An unnamed check";
  if (n.includes("survey")) return "The survey";
  if (n.includes("report")) return "The report";
  // Findings synthesised from our OWN dead_click events rather than from a model
  // watching a recording. It reached the scorecard as the raw string
  // "our own dead_click events" — an internal name in a message written for
  // someone who does not read the code.
  if (n.includes("our own")) return "Taps our own code recorded";
  if (n.includes("dead-click")) return "Taps that did nothing";
  if (n.includes("rage-click")) return "Repeated frustrated tapping";
  return name;
}

function coverageLine(c: CoverageStat | null): string {
  if (!c) return "*How much we watched:* could not read the coverage figures.";
  if (c.submissions === 0)
    return "*How much we watched:* nobody finished the survey in the last 24 hours.";
  const pct = Math.round((c.observed / c.submissions) * 100);
  const missed = c.submissions - c.observed;
  /**
   * "not watched yet", not "never watched".
   *
   * Marcus read this line and reasonably asked why we still are not watching
   * everyone. Two different things were being reported as one. PostHog opens a
   * recording about 38 minutes after it ends, so the most recent hour of any
   * 24-hour window is always still pending — and separately, it genuinely
   * skips roughly half the recordings that match a scanner's query (measured
   * 2026-09-19: 103 of 211 eligible sessions watched by nothing). "Never"
   * claimed the second for cases that were only the first, and implied nothing
   * was being done about either.
   *
   * Both are now handled the same way: anything unwatched is re-queued every
   * three hours by the verify workflow, so the honest word is "yet".
   */
  return (
    `*How much we watched:* ${c.observed} of the ${c.submissions} people who finished ` +
    `the survey (${pct}%).` +
    (missed > 0
      ? ` The other ${missed} had not been watched when this was written — ` +
        `they are queued automatically for another look, so they are not lost.`
      : " Everyone was watched.")
  );
}

/**
 * The confirmed problems, by name — the only part of this message anyone can
 * act on.
 *
 * It used to report `2 reproduced` and stop, so the one number that means "this
 * is real, a visitor hit it, and we hit it again ourselves" arrived with no
 * indication of WHAT was real. Marcus asked for the message to be more
 * specific and actionable on 2026-09-18; this is that.
 */
function confirmedBlock(v: VerificationStat | null): string {
  if (!v || v.reproduced === 0) return "";
  /**
   * Grouped by what-and-where, because two people hitting the SAME problem is
   * one thing to fix, not two lines. Ungrouped, a day with two identical L1s
   * printed the same sentence twice and read like a copy-paste mistake.
   */
  const groups = new Map<
    string,
    { what: string; where: string; n: number; undelivered: number; own: number }
  >();
  for (const f of v.reproducedItems) {
    const what = (f.criterion && PLAIN_CRITERION[f.criterion]) ?? "something did not work";
    const where = placeOf(f.urlPath);
    const k = `${where}|${what}`;
    const g = groups.get(k) ?? { what, where, n: 0, undelivered: 0, own: 0 };
    g.n += 1;
    if (!f.delivered) g.undelivered += 1;
    if (f.fromOwnRecords) g.own += 1;
    groups.set(k, g);
  }
  const all = [...groups.values()].sort((a, b) => b.n - a.n);
  const lines = all.slice(0, 5).map((g) => {
    const who = g.n === 1 ? "" : ` (${g.n} people)`;
    const posted =
      g.undelivered === 0
        ? g.n === 1
          ? "Posted in that person's thread."
          : "Posted in their threads."
        : g.undelivered === g.n
          ? "No survey entry to post it under."
          : `${g.undelivered} of them had no survey entry to post under.`;
    // Named because it is the stronger claim: no model was involved at any
    // point, so there is nothing here that could have been imagined.
    const how = g.own === g.n ? " Found in our own records, without any AI." : "";
    return `• On ${escapeSlack(g.where)}, ${escapeSlack(g.what)}${who}.${how} ${posted}`;
  });
  const more = all.length > 5 ? `\n…and ${all.length - 5} more.` : "";
  const one = v.reproduced === 1;
  const noun = one ? "problem" : "problems";
  return (
    `*⚠️ ${v.reproduced} ${noun} confirmed on a real phone* — we re-tested ` +
    `${one ? "it" : "each one"} at the screen size that visitor used and hit the same ` +
    `thing they did.\n` +
    lines.join("\n") +
    more
  );
}

/** Everything that did NOT turn into a confirmed problem, in one short sentence. */
function dismissedLine(v: VerificationStat | null): string {
  if (!v) return "*Everything else:* could not read the verification record.";
  if (v.total === 0) return "*Everything else:* nothing reached the re-testing step today.";
  // `was/were` and `has/have` agree with the count, because "1 were already
  // answered" is the kind of thing that makes a reader trust the rest less.
  const were = (n: number) => (n === 1 ? "was" : "were");
  const parts = [
    v.clear && `${v.clear} did not happen again when we re-tested`,
    v.contradicted && `${v.contradicted} ${were(v.contradicted)} contradicted by our own records`,
    v.inconclusive && `${v.inconclusive} could not be tested`,
    v.gap && `${v.gap} ${v.gap === 1 ? "has" : "have"} no test for that kind of problem yet`,
    v.duplicate && `${v.duplicate} ${were(v.duplicate)} already answered`,
  ].filter(Boolean);
  if (parts.length === 0) return "";
  /**
   * Undelivered verdicts still get a mention, even though the confirmed ones
   * already say so line by line. Dropping it entirely was tempting — a verdict
   * of "we could not reproduce it" that reaches nobody costs nothing — but it
   * is also the only signal that sessions are arriving with no survey entry
   * attached, and that is worth someone noticing.
   */
  const nowhere = v.undelivered
    ? ` ${v.undelivered} of these had no survey entry to post under.`
    : "";
  return `*Everything else:* ${parts.join(", ")}.${nowhere}`;
}

/**
 * The digest message.
 *
 * Three things it deliberately does NOT hide. An empty day is reported as
 * unusual rather than as all-clear, because a broken scanner and a healthy
 * product otherwise look identical. It leads with what was CONFIRMED rather
 * than with how many recordings a model flagged — a flag is one AI judgement,
 * and until 2026-09-17 this message reported only those, so a reader could not
 * tell a reproduced defect from a refuted guess. And it says plainly when
 * nothing was confirmed, rather than letting a list of counts imply work.
 */
export function buildDigestMessage(
  stats: readonly DailyStat[],
  verification: VerificationStat | null,
  coverage: CoverageStat | null
): {
  text: string;
  blocks: SlackBlock[];
} {
  const observed = stats.reduce((n, s) => n + s.observed, 0);
  const yes = stats.reduce((n, s) => n + s.yes, 0);
  const confirmed = confirmedBlock(verification);

  const headline =
    observed === 0
      ? "No recordings were reviewed in the last 24 hours — that is unusual, check the scanners are still enabled."
      : confirmed
        ? ""
        : "*Nothing needs your attention today.* Nothing we suspected held up when we re-tested it.";

  const lines = stats.map(
    (s) => `• ${escapeSlack(plainScanner(s.scanner))} — watched ${s.observed}, suspected ${s.yes}`
  );

  const blocks: SlackBlock[] = [
    header("👁 UX review — last 24 hours"),
    ...(confirmed ? [section(confirmed)] : []),
    ...(headline ? [section(headline)] : []),
    section(dismissedLine(verification)),
    section(coverageLine(coverage)),
    ...(lines.length ? [section(`*What the AI watched for:*\n${lines.join("\n")}`)] : []),
    context(
      "The AI suspects a problem from watching a recording; it is often wrong about why. " +
        "It only counts as confirmed once we reproduce it in a real browser at that person's " +
        "screen size. Confirmed problems are posted in the thread of the survey entry they " +
        "belong to, and every verdict is recorded either way."
    ),
  ];
  // "unusual" survives into the NOTIFICATION text, not just the blocks. That
  // one line is the Slack push preview and the channel list entry, so a silent
  // detector must be legible as a problem before anyone opens the message.
  const summary =
    observed === 0
      ? "no recordings reviewed at all — that is unusual"
      : verification?.reproduced
        ? `${verification.reproduced} confirmed on a real phone`
        : `nothing confirmed, ${yes} suspected of ${observed} watched`;
  return { text: `UX review — last 24 hours. ${summary}.`, blocks };
}

export async function fetchFindings(): Promise<UxFinding[]> {
  const key = process.env.POSTHOG_API_KEY;
  if (!key) return [];

  const query = `
    SELECT toString(uuid),
           toString(properties.session_id),
           toString(properties.scanner_id),
           toString(properties.scanner_name),
           toFloat(properties.scanner_version),
           toFloat(properties.scanner_output_confidence),
           toString(properties.scanner_output_reasoning)
    FROM events
    WHERE event = '$recording_observed'
      AND timestamp > now() - INTERVAL ${LOOKBACK_MINUTES} MINUTE
      AND properties.scanner_output_verdict = 'yes'
      AND toFloat(properties.scanner_output_confidence) >= ${UX_REVIEW_MIN_CONFIDENCE}
    ORDER BY timestamp DESC
    LIMIT 25
  `;

  const res = await fetchWithTimeout(`https://eu.posthog.com/api/projects/${PROJECT}/query/`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: { kind: "HogQLQuery", query } }),
    timeoutMs: 12_000,
  });
  if (!res.ok) throw new Error(`posthog query ${res.status}`);
  const payload = (await res.json()) as { results?: unknown[][]; error?: unknown };
  // PostHog answers a BAD query with HTTP 200 and an `error` field. Checking
  // res.ok alone would turn a broken query into "nothing to report", which is
  // indistinguishable from a healthy product and is exactly how a dead detector
  // goes unnoticed.
  if (payload.error) throw new Error(`posthog query error: ${String(payload.error).slice(0, 200)}`);

  return (payload.results ?? []).map((row) => ({
    observationId: String(row[0]),
    sessionId: String(row[1]),
    scannerId: String(row[2]),
    scannerName: String(row[3]),
    scannerVersion: Number(row[4]) || 0,
    confidence: Number(row[5]) || 0,
    reasoning: String(row[6] ?? ""),
  }));
}

/**
 * Claims that name an action we instrument, and the events that must exist if
 * the action really happened.
 *
 * Reading the first day's findings showed one consistent failure: the scanners
 * see that something changed on screen and invent why. One said "the user
 * clicked 'Unlock full report', which looped them back to the survey" for a
 * session containing no unlock_click, no paywall_initiated and no checkout
 * event — the navigation was real, the cause fabricated, at 0.9 confidence.
 *
 * So: if the prose names an action, require its event in the same session.
 * Absent means our own telemetry contradicts the claim, and it must not be
 * posted as a finding.
 *
 * Deliberately narrow. Only actions with an unambiguous event are listed, and a
 * claim matching no rule is "cannot check", never "contradicted".
 */
/**
 * Measured 2026-09-14 against the five known-false findings of day one: this
 * table refutes 1 of 5. Four extra rules were written for the other four claim
 * shapes (redirect / error-on-screen / dead click / rage) and every one of them
 * scored ZERO, because those sessions really do contain $pageview, $exception
 * and dead_click — the claims are wrong in their SPECIFICS, which the presence
 * of a coarse event cannot discriminate. They were deleted rather than shipped:
 * a gate that looks like it works and catches nothing is worse than no gate.
 *
 * What does discriminate is re-running the defect in a browser. All five are
 * correctly rejected by their criterion's probe, which is why the probe, not
 * this table, is the gate that earns a Slack post. See
 * scripts/verify-ux-findings.mjs.
 */
export const CLAIM_EVIDENCE: ReadonlyArray<{
  claim: RegExp;
  requireAny: readonly string[];
  describes: string;
}> = [
  {
    claim: /clicked? ['"]?unlock|unlock full report|pressed unlock|tapped unlock/i,
    requireAny: ["unlock_click", "paywall_initiated", "sticky_unlock_clicked", "lock_icon_clicked"],
    describes: "an unlock click",
  },
  {
    claim: /checkout|payment modal|stripe/i,
    requireAny: ["checkout_started", "begin_checkout", "paywall_initiated", "unlock_click"],
    describes: "reaching checkout",
  },
  {
    claim: /completed the survey|finished the survey|after completion/i,
    requireAny: ["survey_completed"],
    describes: "completing the survey",
  },
];

/**
 * Session ids originate in the visitor's browser, so they are
 * attacker-influenceable text on their way into a query. Only UUID-shaped ids
 * can be legitimate; anything else is refused rather than escaped.
 */
export function isSafeSessionId(sessionId: string): boolean {
  return /^[A-Za-z0-9-]{1,64}$/.test(sessionId);
}

/**
 * The reader's OWN report token, so a probe can open the report they saw.
 *
 * Every report probe opens one hardcoded internal report, because nothing ever
 * passed a token. So a probe's answer is about a different reader's report than
 * the one the finding is about — which is most of why 26 of 27 probes return
 * the same verdict whoever raised the claim.
 *
 * SAFE TO PASS, AND THIS REPOSITORY IS PUBLIC, so the handling matters:
 *  - it travels in the child process ENV, which Actions does not print;
 *  - the caller emits `::add-mask::` first, so GitHub redacts it from every
 *    subsequent log line even if a probe echoes a URL;
 *  - `redactReportToken` already strips it from probe output before anything is
 *    stored in `ux_finding` or posted to Slack.
 *
 * Only what PERSISTS is redacted. The probe needs the real token inside the run
 * or it cannot open the report at all, which is the entire point.
 *
 * Returns null when the reader has no report yet — a survey-only session — and
 * the probe then keeps its own default rather than being handed a guess.
 */
export async function reportTokenForSession(sessionId: string): Promise<string | null> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || !isSafeSessionId(sessionId)) return null;
  const headers = { apikey: key, Authorization: `Bearer ${key}` };
  try {
    const subRes = await fetchWithTimeout(
      `${url}/rest/v1/survey_submission?select=id&posthog_session_id=eq.${encodeURIComponent(sessionId)}&limit=2`,
      { headers, timeoutMs: 8_000 }
    );
    if (!subRes.ok) return null;
    const subs = (await subRes.json()) as Array<{ id: number }>;
    warnIfTruncated(subs, 2, "report token: survey_submission");
    const submissionId = subs[0]?.id;
    if (typeof submissionId !== "number") return null;

    const tokRes = await fetchWithTimeout(
      `${url}/rest/v1/report_access_token?select=token,revoked_at` +
        `&survey_submission_id=eq.${submissionId}&revoked_at=is.null&order=created_at.desc&limit=2`,
      { headers, timeoutMs: 8_000 }
    );
    if (!tokRes.ok) return null;
    const toks = (await tokRes.json()) as Array<{ token: string | null }>;
    warnIfTruncated(toks, 2, "report token: report_access_token");
    const token = toks[0]?.token;
    // Shape-checked before it becomes part of a URL a probe navigates to.
    return typeof token === "string" && /^rpt_[A-Za-z0-9]{8,}$/.test(token) ? token : null;
  } catch {
    return null;
  }
}

/** The reason our telemetry contradicts this claim, or null. */
export function contradiction(
  reasoning: string,
  events: ReadonlySet<string> | null
): string | null {
  // NULL means the lookup failed; an EMPTY SET means it succeeded and found
  // nothing, which cannot happen in reality — a session only reaches a scanner
  // by emitting the trigger event that selected it, so >=1 event always exists.
  // Both fail OPEN: an outage must not refute every checkable claim, because
  // then an outage looks exactly like a quiet, healthy day.
  //
  // They were the same value until 2026-09-17, and that was the bug. Any
  // failure — an 8s timeout, a non-2xx, a throw — became an empty set, so the
  // refusal gate switched itself off with no trace, and the SAME finding got
  // opposite verdicts on consecutive runs: refuted at 16:20 ("the recording
  // describes an unlock click, but the session has none"), then "Reproduced in
  // production" at 17:40. The caller now knows which happened and says so.
  if (events === null || events.size === 0) return null;
  for (const rule of CLAIM_EVIDENCE) {
    if (!rule.claim.test(reasoning)) continue;
    if (rule.requireAny.some((e) => events.has(e))) continue;
    return `the recording describes ${rule.describes}, but the session has none of ${rule.requireAny.join(", ")}`;
  }
  return null;
}

/**
 * Distinct events in one session, or NULL when they could not be read.
 *
 * This is the input to the refusal gate, and it used to have its own 8-second
 * budget with no retry while its two sibling lookups shared a retried 15s one —
 * even though the measurement that justified the retry was taken on this very
 * query: session 01a0aea6 carries 330 events and timed at 526, 82, 71, 3433,
 * 72, 1577, 80, 84, 79, 77 ms. The tail is seconds, so from a CI runner the
 * biggest sessions were the ones that lost, and losing meant the gate silently
 * stopped running.
 */
export async function fetchSessionEvents(sessionId: string): Promise<Set<string> | null> {
  if (!isSafeSessionId(sessionId)) return null;
  const rows = await sessionQuery(`SELECT DISTINCT event FROM events
                  WHERE timestamp > now() - INTERVAL 30 DAY
                    AND properties.$session_id = '${sessionId}'`);
  return rows === null ? null : new Set(rows.map((r) => String(r[0])));
}

/**
 * The screen the finding actually happened on.
 *
 * A defect reproduced at 390px proves nothing about the reader who hit it at
 * 262px, and the citation-URL overflow found on 2026-09-14 was invisible at
 * every width our device matrix covered. So a probe should render at the
 * viewport of the session that produced the claim, not at a default phone.
 *
 * Returns the narrowest and widest viewport seen in the session: narrowest
 * because that is where layout breaks, and both because a foldable moves — the
 * Galaxy Z Flip in that finding ranged 262px to 715px within one recording.
 */
/**
 * What this reader actually tapped, from OUR events rather than the model's prose.
 *
 * `dead_click` and `rage_click` are captured by shared/observability/uxSignals.ts
 * and carry `pathname` plus a real CSS `target_selector`. Two of the four
 * scanners trigger on exactly these events, and until now nothing downstream
 * read them: the verifier asked a language model what the reader touched, and
 * the model's stated mechanism has been wrong in 5 of 5 measured findings at
 * 0.8-1.0 confidence. A narration can be wrong about which control was pressed.
 * An event that names the element either fired or it did not.
 *
 * The most-clicked pair in the session, because a reader hammering one dead
 * control is the signal; a single stray tap on a paragraph is not.
 */
/**
 * One HogQL row, retried once, for the two per-session lookups.
 *
 * These two failed intermittently in a way that looked random and was not.
 * Session 01a0aea6 carries 330 events — the most of any recent session — and
 * timing it ten times gave 526, 82, 71, 3433, 72, 1577, 80, 84, 79, 77 ms. The
 * median is 80ms and the tail is seconds, so against an 8s budget from a CI
 * runner the biggest sessions were the ones that lost, twice for that same id.
 *
 * A miss is not harmless: no viewport means the probes fall back to their own
 * device lists and the run silently stops being session-specific, which is the
 * whole point of it. A retry costs 80ms in the normal case.
 *
 * Only the verifier calls these — a CI script with a 25-minute budget that then
 * drives browsers for minutes — so the longer budget is free. Returns null on
 * every failure, because a caller that cannot tell "no data" from "query
 * failed" must not act as though it can.
 */
/**
 * PostHog applies a DEFAULT LIMIT OF 100 to any HogQL query that does not state
 * one, silently — no error, no flag, no count. Every query in this file is
 * bounded to a single session and the widest of them returns at most 36 rows
 * today, so none is truncated; the cap is stated anyway because "it happens to
 * fit" is not a property anyone re-checks when adding the next query. The same
 * guard lives in scripts/lib/hogql.mjs for the scripts, and
 * __tests__/scripts/hogql-cap.test.ts fails if a third construction site
 * appears without one.
 */
const HOG_ROW_CAP = 50_000;

async function sessionQuery(query: string): Promise<unknown[][] | null> {
  const key = process.env.POSTHOG_API_KEY;
  if (!key) return null;
  // Anchored at the end: a LIMIT inside a subquery says nothing about the outer
  // result, and reading it as "already capped" would leave the silent 100.
  const capped = /\bLIMIT\s+\d+\s*$/i.test(query.trim())
    ? query
    : `${query.trimEnd()}\nLIMIT ${HOG_ROW_CAP}`;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const res = await fetchWithTimeout(`https://eu.posthog.com/api/projects/${PROJECT}/query/`, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ query: { kind: "HogQLQuery", query: capped } }),
        timeoutMs: 15_000,
      });
      if (!res.ok) continue;
      const payload = (await res.json()) as { results?: unknown[][]; error?: unknown };
      // A bad query will fail identically on the retry; only a timeout or a
      // transport error is worth a second attempt.
      if (payload.error) return null;
      return payload.results ?? [];
    } catch {
      /* timeout or transport — try once more */
    }
  }
  return null;
}

/** The first row, or null. */
async function sessionRow(query: string): Promise<unknown[] | null> {
  const rows = await sessionQuery(query);
  return rows === null ? null : (rows[0] ?? null);
}

export async function sessionClickTarget(
  sessionId: string
): Promise<{ pathname: string; selector: string; clicks: number } | null> {
  if (!isSafeSessionId(sessionId)) return null;
  /**
   * A CONTROL first, then the most-clicked.
   *
   * This was `ORDER BY count() DESC` alone, which is the wrong tiebreak on the
   * shape these sessions actually have. One measured session emitted 22 dead
   * clicks: twenty-one on decoration — `p`, `span`, `strong`, `article`,
   * `section`, `svg` — and exactly one on a real control, the survey consent
   * gate's `button.flex-1`. Every count was 1, so the winner was arbitrary and
   * almost certainly a paragraph. `verify-dead-click-target.mjs` then answered,
   * correctly, "ordinary content, not a control — a tap on it is not a defect",
   * and the finding was reported CLEAR while the dead button was never looked
   * at. The scanner had flagged that session at 0.9 confidence.
   *
   * Decoration taps are the overwhelming majority — 807 of 827 sessions over 30
   * days — so picking by frequency picks noise nearly every time. The control is
   * the evidence worth probing, and the same rule already governs the recall
   * denominator in scripts/replay-bench/score.mjs.
   */
  const row = await sessionRow(`SELECT toString(properties.pathname),
                         toString(properties.target_selector),
                         count(),
                         max(if(startsWith(toString(properties.target_selector), 'button')
                             OR startsWith(toString(properties.target_selector), 'a.')
                             OR startsWith(toString(properties.target_selector), 'a#')
                             OR toString(properties.target_selector) = 'a'
                             OR startsWith(toString(properties.target_selector), '[data-track-id')
                             OR startsWith(toString(properties.target_selector), '[role=button'),
                             1, 0))
                  FROM events
                  WHERE timestamp > now() - INTERVAL 30 DAY
                    AND properties.$session_id = '${sessionId}'
                    AND event IN ('dead_click', 'rage_click')
                    AND properties.target_selector IS NOT NULL
                  GROUP BY 1, 2
                  ORDER BY 4 DESC, 3 DESC
                  LIMIT 1`);
  const pathname = String(row?.[0] ?? "");
  const selector = String(row?.[1] ?? "");
  // "unknown" is what selectorFor() emits when it cannot describe the target.
  // Passing it to a probe would be passing a guess.
  if (!pathname.startsWith("/") || !selector || selector === "unknown") return null;
  return { pathname, selector, clicks: Number(row?.[2] ?? 0) };
}

export async function sessionViewport(
  sessionId: string
): Promise<{ min: number; max: number; os: string } | null> {
  if (!isSafeSessionId(sessionId)) return null;
  const row = await sessionRow(`SELECT min(toFloat(properties.$viewport_width)),
                         max(toFloat(properties.$viewport_width)),
                         any(properties.$os)
                  FROM events
                  WHERE timestamp > now() - INTERVAL 30 DAY
                    AND properties.$session_id = '${sessionId}'
                    AND properties.$viewport_width IS NOT NULL`);
  const min = Number(row?.[0]);
  const max = Number(row?.[1]);
  if (!Number.isFinite(min) || min <= 0) return null;
  return {
    min: Math.round(min),
    max: Math.round(max) || Math.round(min),
    os: String(row?.[2] ?? ""),
  };
}
