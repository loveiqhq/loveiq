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
import { escapeSlack, type SlackBlock } from "@shared/observability/slack";
import { context, header, linkButton, section } from "@shared/observability/slack-blocks";

import { UX_REVIEW_MIN_CONFIDENCE, UX_SCANNERS } from "./scanners";

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
  return (payload.results ?? []).map((row) => ({
    scanner: String(row[0] ?? "unknown"),
    observed: Number(row[1]) || 0,
    yes: Number(row[2]) || 0,
  }));
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
export interface VerificationStat {
  reproduced: number;
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
    const ids = rows
      .map((r) => r.posthog_session_id)
      .filter((id): id is string => id !== null && isSafeSessionId(id));
    if (ids.length === 0) return { submissions: 0, observed: 0 };

    // Same id guard as every other per-session lookup here: these are
    // interpolated into HogQL.
    const inList = ids.map((id) => `'${id}'`).join(",");
    const observed = await sessionQuery(
      `SELECT count(DISTINCT properties.session_id) FROM events
       WHERE event = '$recording_observed'
         AND timestamp > now() - INTERVAL 10 DAY
         AND properties.session_id IN (${inList})`
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
export async function fetchVerificationStats(): Promise<VerificationStat | null> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  try {
    const res = await fetchWithTimeout(
      `${url}/rest/v1/ux_finding?select=outcome,delivered&created_at=gte.${since}&limit=500`,
      {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
        timeoutMs: 8_000,
      }
    );
    if (!res.ok) return null;
    const rows = (await res.json()) as Array<{ outcome?: string; delivered?: boolean }>;
    const tally: VerificationStat = {
      reproduced: 0,
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
      if (row.delivered === false) tally.undelivered += 1;
    }
    return tally;
  } catch {
    return null;
  }
}

/** Who was actually watched. The number every other line here is silent about. */
function coverageLine(c: CoverageStat | null): string {
  if (!c) return "*Recordings watched:* could not read the coverage figures.";
  if (c.submissions === 0)
    return "*Recordings watched:* nobody finished the survey in the last 24 hours.";
  const pct = Math.round((c.observed / c.submissions) * 100);
  const missed = c.submissions - c.observed;
  return (
    `*Recordings watched:* ${c.observed} of ${c.submissions} people who finished the survey (${pct}%).` +
    (missed > 0
      ? `\n${missed} were never opened by any scanner, so nothing below can speak for them.`
      : "")
  );
}

/** One plain line of what the probes concluded — the digest's only non-model number. */
function verificationLine(v: VerificationStat | null): string {
  if (!v) return "*Checked by a probe:* could not read the verification record.";
  if (v.total === 0) {
    return "*Checked by a probe:* nothing reached the verifier in the last 24 hours.";
  }
  const parts = [
    v.reproduced && `${v.reproduced} reproduced`,
    v.clear && `${v.clear} could not be reproduced`,
    v.inconclusive && `${v.inconclusive} could not be measured`,
    v.gap && `${v.gap} with no probe yet`,
    v.contradicted && `${v.contradicted} refused by our own events`,
    v.duplicate && `${v.duplicate} already answered`,
  ].filter(Boolean);
  const undelivered = v.undelivered
    ? `\n${v.undelivered} of those could not be delivered — no submission thread for that session.`
    : "";
  return `*Checked by a probe:* ${parts.join(" \u00b7 ")}.${undelivered}`;
}

/**
 * The digest message.
 *
 * Two things it deliberately does NOT hide. An empty day is reported as
 * unusual rather than as all-clear, because a broken scanner and a healthy
 * product otherwise look identical. And it states what the VERIFIER concluded,
 * not just how many recordings a model flagged — a flag is one AI judgement,
 * and until 2026-09-17 this message reported only those, so a reader could not
 * tell a reproduced defect from a refuted guess.
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
  const headline =
    observed === 0
      ? "No recordings were reviewed in the last 24 hours — that is unusual, check the scanners are still enabled."
      : `${observed} recordings reviewed, ${yes} flagged for a closer look.`;
  const lines = stats.map(
    (s) => `• ${escapeSlack(s.scanner)} — ${s.observed} reviewed, ${s.yes} flagged`
  );

  const blocks: SlackBlock[] = [
    header("👁 UX review — last 24 hours"),
    section(headline),
    ...(lines.length ? [section(lines.join("\n"))] : []),
    section(coverageLine(coverage)),
    section(verificationLine(verification)),
    context(
      "A flag is one AI judgment on one recording. It becomes a *finding* only when a probe " +
        "reproduces it in a real browser. Those verdicts are posted in the thread of the submission " +
        "they belong to when the session has one, and every verdict is recorded either way."
    ),
  ];
  return { text: `UX review — last 24 hours. ${headline}`, blocks };
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
async function sessionQuery(query: string): Promise<unknown[][] | null> {
  const key = process.env.POSTHOG_API_KEY;
  if (!key) return null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const res = await fetchWithTimeout(`https://eu.posthog.com/api/projects/${PROJECT}/query/`, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ query: { kind: "HogQLQuery", query } }),
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
  const row = await sessionRow(`SELECT toString(properties.pathname),
                         toString(properties.target_selector),
                         count()
                  FROM events
                  WHERE timestamp > now() - INTERVAL 30 DAY
                    AND properties.$session_id = '${sessionId}'
                    AND event IN ('dead_click', 'rage_click')
                    AND properties.target_selector IS NOT NULL
                  GROUP BY 1, 2
                  ORDER BY 3 DESC
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
