import { fetchWithTimeout } from "@shared/http/fetch-with-timeout";

import {
  type CoverageStat,
  fetchCoverageStats,
  fetchVerificationStats,
  isSafeSessionId,
  MIN_WATCHABLE_ACTIVE_MS,
  PROJECT,
  sessionQuery,
  type VerificationStat,
} from "./review";

/**
 * DOES THE DAILY DIGEST TELL THE TRUTH?
 *
 * Every probe in this pipeline checks the PRODUCT against something it did not
 * produce. Nothing checked the digest, and on 2026-09-24 rendering the next
 * morning's message from live data found four things it said that were false:
 * a confirmation a person had closed as wrong, "19 had no survey entry" when 9
 * had none, and readers promised "not lost" that no survey or report scanner
 * had ever opened, the week's worst sessions among them. Each was a field whose
 * meaning changed under a reader that kept telling the old story, and each
 * passed its tests, because the tests were written from the same assumptions.
 *
 * So this re-asks each claim of the digest that was actually delivered, over
 * that digest's own 24 hours, from a source the digest did not use: the survey
 * tables for threads, GitHub for pull requests, PostHog for who watched whom.
 * It does not re-derive the counts the digest reads straight off the ledger
 * ("17 did not happen again"); a second copy of that arithmetic would agree
 * with the first and prove nothing.
 *
 * NOT CHECKED: that a "posted" verdict's reply is really in its Slack thread.
 * This checks the thread exists; reading the reply needs a Slack token that
 * can read history, and the one CI has can only write.
 */

export interface DigestFacts {
  /** When the digest was delivered; every window below ends here. */
  at: number;
  verification: VerificationStat;
  coverage: CoverageStat;
  /** Every survey_submission in the digest's window, recorded or not. */
  finishers: number;
  /** Session id → does the reader have a survey thread. */
  threads: ReadonlyMap<string, boolean>;
  /** Pull request URL → its state on GitHub. */
  prs: ReadonlyMap<string, PrState>;
  /** Every finding that ever opened a pull request, with its label. */
  labelled: ReadonlyArray<{ prUrl: string; label: string | null }>;
  /**
   * Finishers a day or more old whom the survey scanner still never opened, with what
   * PostHog holds for that recording: null when it was never asked to watch it.
   */
  stillUnwatched: ReadonlyArray<{
    submissionId: number;
    sessionId: string;
    posthog?: { status: string; reason: string } | null;
  }>;
}

export interface PrState {
  state: "open" | "merged" | "closed";
  closedAt: string | null;
}

export interface DigestCheck {
  claim: string;
  ok: boolean;
  detail: string;
}

/** The label job runs hourly, and GitHub drops some runs; a newer close is not yet late. */
export const LABEL_GRACE_MS = 4 * 60 * 60 * 1000;

const list = (xs: readonly (string | number)[]) =>
  xs.length > 5 ? `${xs.slice(0, 5).join(", ")} and ${xs.length - 5} more` : xs.join(", ");

/** Pure: every claim, its verdict and why. Tested without a network. */
export function checkDigest(f: DigestFacts): DigestCheck[] {
  const checks: DigestCheck[] = [];
  const v = f.verification;

  const hasThread = v.undeliveredSessions.filter((s) => f.threads.get(s) === true);
  checks.push({
    claim: `"${v.undelivered} of these had no survey entry to post under"`,
    ok: hasThread.length === 0,
    detail: hasThread.length
      ? `${hasThread.length} of them do have one (${list(hasThread)})`
      : `each of the ${v.undeliveredSessions.length} checked has no thread`,
  });

  for (const item of v.reproducedItems) {
    const who = item.sessionId ?? "an unnamed session";
    const thread = item.sessionId ? f.threads.get(item.sessionId) : undefined;
    if (item.heldForAPerson) {
      checks.push({
        claim: `Confirmed for ${who}, "nothing was posted"`,
        ok: !item.delivered,
        detail: item.delivered ? "it was posted" : "not posted",
      });
    } else if (item.delivered) {
      checks.push({
        claim: `Confirmed for ${who}, "posted in that person's thread"`,
        ok: thread !== false,
        detail: thread === false ? "the reader has no survey thread" : "the thread exists",
      });
    } else {
      checks.push({
        claim: `Confirmed for ${who}, "no survey entry to post it under"`,
        ok: thread !== true,
        detail:
          thread === true ? "the reader has a thread; the verdict never reached it" : "no thread",
      });
    }
    const pr = item.prUrl ? f.prs.get(item.prUrl) : undefined;
    if (pr?.state === "closed") {
      checks.push({
        claim: `Counted ${who} as "a problem confirmed on a real phone"`,
        ok: false,
        detail: `its pull request was closed unmerged: ${item.prUrl}`,
      });
    }
  }

  const late = (pr: PrState) => !pr.closedAt || f.at - Date.parse(pr.closedAt) > LABEL_GRACE_MS;
  const wrongLabels = f.labelled.flatMap(({ prUrl, label }) => {
    const pr = f.prs.get(prUrl);
    if (!pr) return [];
    if (pr.state === "open") return label ? [`${prUrl} is open but labelled ${label}`] : [];
    const want = pr.state === "merged" ? "agree" : "disagree";
    return label !== want && late(pr)
      ? [`${prUrl} is ${pr.state} but labelled ${label ?? "nothing"}`]
      : [];
  });
  checks.push({
    claim: "Each fix pull request is scored the way a person judged it",
    ok: wrongLabels.length === 0,
    detail: wrongLabels.length ? list(wrongLabels) : `${f.labelled.length} labels match GitHub`,
  });

  const said = f.coverage.submissions + (f.coverage.unrecorded ?? 0);
  checks.push({
    claim:
      `"of the ${f.coverage.submissions} people who finished the survey"` +
      (f.coverage.unrecorded ? ` and "${f.coverage.unrecorded} more with no recording"` : ""),
    ok: said === f.finishers,
    detail:
      said === f.finishers ? `${f.finishers} finished` : `${f.finishers} finished, not ${said}`,
  });

  /**
   * "Queued" is the promise, not "watched": PostHog gives up on some recordings for good
   * (one it cannot render, an answer with personal data it could not strip), and the
   * re-queue reports those rather than resending them forever. A reader PostHog was never
   * asked to watch is the broken promise. One it gave up on is named, with its reason.
   */
  const neverSent = f.stillUnwatched.filter((u) => !u.posthog);
  const gaveUp = f.stillUnwatched.flatMap((u) => (u.posthog ? [{ ...u, look: u.posthog }] : []));
  checks.push({
    claim: `Unwatched readers "are queued automatically for another look"`,
    ok: neverSent.length === 0,
    detail: neverSent.length
      ? `${neverSent.length} who finished a day or more ago, with a recording, were never ` +
        `sent to the survey scanner (submissions ${list(neverSent.map((u) => u.submissionId))})`
      : gaveUp.length
        ? `every unwatched finisher was sent; PostHog could not watch ` +
          list(
            gaveUp.map((u) => `${u.submissionId} (${u.look.reason.split(":")[0] || u.look.status})`)
          )
        : "every finisher from the last 14 days with a recording was opened",
  });

  return checks;
}

// ─── Reading the facts ────────────────────────────────────────────────────

type Env = { url: string; key: string };

async function rest<T>(env: Env, path: string): Promise<T> {
  const res = await fetchWithTimeout(`${env.url}/rest/v1/${path}`, {
    headers: { apikey: env.key, Authorization: `Bearer ${env.key}` },
    timeoutMs: 10_000,
  });
  if (!res.ok) throw new Error(`${path.split("?")[0]} ${res.status}`);
  return (await res.json()) as T;
}

async function countOf(env: Env, path: string): Promise<number> {
  const res = await fetchWithTimeout(`${env.url}/rest/v1/${path}`, {
    headers: { apikey: env.key, Authorization: `Bearer ${env.key}`, Prefer: "count=exact" },
    timeoutMs: 10_000,
  });
  if (!res.ok) throw new Error(`${path.split("?")[0]} ${res.status}`);
  const total = Number(res.headers.get("content-range")?.split("/")[1]);
  if (!Number.isFinite(total)) throw new Error(`${path.split("?")[0]}: no count`);
  return total;
}

/**
 * Written here, not borrowed from the verifier: this is the other side of the
 * check. `submission:<id>` is how the restart lane names a reader PostHog
 * never recorded.
 */
async function threadExists(env: Env, sessionId: string): Promise<boolean> {
  const direct = /^submission:(\d+)$/.exec(sessionId);
  let id: number | null = direct ? Number(direct[1]) : null;
  if (id === null) {
    if (!isSafeSessionId(sessionId)) return false;
    const subs = await rest<Array<{ id: number }>>(
      env,
      `survey_submission?posthog_session_id=eq.${encodeURIComponent(sessionId)}&select=id&limit=1`
    );
    id = subs[0]?.id ?? null;
  }
  if (id === null) return false;
  const msgs = await rest<unknown[]>(
    env,
    `slack_journey_message?select=message_ts&limit=1` + `&survey_submission_id=eq.${id}`
  );
  return msgs.length > 0;
}

async function prState(url: string): Promise<PrState> {
  const m = /github\.com\/([^/]+\/[^/]+)\/pull\/(\d+)/.exec(url);
  if (!m) throw new Error(`not a pull request URL: ${url}`);
  const token = process.env.GITHUB_TOKEN;
  const res = await fetchWithTimeout(`https://api.github.com/repos/${m[1]}/pulls/${m[2]}`, {
    headers: {
      Accept: "application/vnd.github+json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    timeoutMs: 10_000,
  });
  if (!res.ok) throw new Error(`GitHub ${res.status} for ${url}`);
  const pr = (await res.json()) as {
    state: string;
    merged_at: string | null;
    closed_at: string | null;
  };
  return {
    state: pr.merged_at ? "merged" : pr.state === "open" ? "open" : "closed",
    closedAt: pr.closed_at,
  };
}

/**
 * Finishers one to fourteen days old, with a recording worth watching, whom
 * the survey scanner never opened. Not only those whose visit fired
 * `survey_started`: a reader who resumes in a new session finishes in a visit
 * the scanner's query never matches, the digest still counts them, and the
 * re-queue owes them (asFinisher). A day is the grace
 * for PostHog's own lag and the hourly re-queue; fourteen is how far the
 * re-queue reaches, so past that the promise was never made.
 */
async function stillUnwatched(env: Env, at: number) {
  const iso = (ms: number) => new Date(ms).toISOString();
  const subs = await rest<Array<{ id: number; posthog_session_id: string | null }>>(
    env,
    `survey_submission?select=id,posthog_session_id&posthog_session_id=not.is.null` +
      `&created_date_time=gte.${iso(at - 14 * 86_400_000)}&created_date_time=lt.${iso(at - 86_400_000)}` +
      `&limit=2000`
  );
  const byId = new Map(
    subs
      .filter((s) => s.posthog_session_id && isSafeSessionId(s.posthog_session_id))
      .map((s) => [s.posthog_session_id as string, s.id])
  );
  if (byId.size === 0) return [];
  const inList = [...byId.keys()].map((id) => `'${id}'`).join(",");
  const [watched, watchable] = await Promise.all([
    sessionQuery(
      `SELECT DISTINCT toString(properties.session_id) FROM events
       WHERE event = '$recording_observed' AND timestamp > now() - INTERVAL 17 DAY
         AND toString(properties.scanner_name) = 'LoveIQ survey UX'
         AND properties.session_id IN (${inList})`
    ),
    sessionQuery(
      `SELECT r.sid FROM (
         SELECT session_id AS sid, sum(active_milliseconds) AS active FROM raw_session_replay_events
         WHERE min_first_timestamp > now() - INTERVAL 17 DAY AND session_id IN (${inList})
         GROUP BY session_id
       ) AS r
       WHERE r.active >= ${MIN_WATCHABLE_ACTIVE_MS}`
    ),
  ]);
  if (watched === null || watchable === null) throw new Error("PostHog did not answer");
  const seen = new Set(watched.map((r) => String(r[0])));
  return watchable
    .map((r) => String(r[0]))
    .filter((sid) => !seen.has(sid))
    .map((sessionId) => ({ sessionId, submissionId: byId.get(sessionId) as number }))
    .sort((a, b) => a.submissionId - b.submissionId);
}

let surveyScannerId: Promise<string> | null = null;

/**
 * What PostHog holds for the survey scanner and this recording, newest first: null when
 * it was never asked to watch it. Throws when PostHog cannot say, so an outage is
 * "could not read a source", never a broken promise.
 */
async function surveyObservation(
  sessionId: string
): Promise<{ status: string; reason: string } | null> {
  const get = async <T>(path: string): Promise<T> => {
    const res = await fetchWithTimeout(
      `https://eu.posthog.com/api/projects/${PROJECT}/vision/scanners/${path}`,
      { headers: { Authorization: `Bearer ${process.env.POSTHOG_API_KEY}` }, timeoutMs: 10_000 }
    );
    if (!res.ok) throw new Error(`vision/scanners ${res.status}`);
    return (await res.json()) as T;
  };
  surveyScannerId ??= get<{ results?: Array<{ id: string; name: string }> }>("").then((r) => {
    const id = r.results?.find((s) => s.name === "LoveIQ survey UX")?.id;
    if (!id) throw new Error("no LoveIQ survey UX scanner");
    return id;
  });
  const id = await surveyScannerId;
  const { results = [] } = await get<{
    results?: Array<{ status?: string; error_reason?: string; created_at?: string }>;
  }>(`${id}/observations/?session_id=${encodeURIComponent(sessionId)}`);
  const latest = [...results].sort((a, b) =>
    String(b.created_at).localeCompare(String(a.created_at))
  )[0];
  return latest
    ? { status: String(latest.status ?? ""), reason: String(latest.error_reason ?? "") }
    : null;
}

/**
 * The facts behind the last digest that was DELIVERED, or null when it cannot
 * say. `staleAfterMs` is how old that digest may be before its absence is
 * itself the finding.
 */
export async function gatherDigestFacts(): Promise<
  { facts: DigestFacts } | { missing: string } | null
> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || !process.env.POSTHOG_API_KEY) return null;
  const env = { url, key };
  try {
    const [last] = await rest<Array<{ sent_at: string }>>(
      env,
      "slack_alert_sent?select=sent_at&kind=eq.ux_review_digest&delivered=eq.true" +
        "&order=sent_at.desc&limit=1"
    );
    if (!last) return { missing: "no digest has ever been delivered" };
    const at = Date.parse(last.sent_at);
    if (Date.now() - at > 26 * 60 * 60 * 1000) {
      return { missing: `the last digest was delivered at ${last.sent_at}, over a day ago` };
    }
    const iso = (ms: number) => new Date(ms).toISOString();
    const [verification, coverage, finishers, labelledRows, unwatched] = await Promise.all([
      fetchVerificationStats(at),
      fetchCoverageStats(at),
      countOf(
        env,
        `survey_submission?select=id&created_date_time=gte.${iso(at - 86_400_000)}` +
          `&created_date_time=lt.${iso(at)}`
      ),
      rest<Array<{ pr_url: string; human_label: string | null }>>(
        env,
        "ux_finding?pr_url=not.is.null&limit=1000" + "&select=pr_url,human_label"
      ),
      stillUnwatched(env, at),
    ]);
    if (!verification || !coverage) return null;
    const looked = [];
    for (const u of unwatched) looked.push({ ...u, posthog: await surveyObservation(u.sessionId) });

    const sessions = new Set([
      ...verification.undeliveredSessions,
      ...verification.reproducedItems.flatMap((i) => (i.sessionId ? [i.sessionId] : [])),
    ]);
    const threads = new Map<string, boolean>();
    for (const s of sessions) threads.set(s, await threadExists(env, s));

    const urls = new Set([
      ...labelledRows.map((r) => r.pr_url),
      ...verification.reproducedItems.flatMap((i) => (i.prUrl ? [i.prUrl] : [])),
    ]);
    const prs = new Map<string, PrState>();
    for (const u of urls) prs.set(u, await prState(u));

    return {
      facts: {
        at,
        verification,
        coverage,
        finishers,
        threads,
        prs,
        labelled: labelledRows.map((r) => ({ prUrl: r.pr_url, label: r.human_label })),
        stillUnwatched: looked,
      },
    };
  } catch (err) {
    console.error(`could not read a source: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

/** The Slack text for a digest that said something untrue. */
export function digestAuditMessage(at: number, failed: readonly DigestCheck[], runUrl?: string) {
  const when = new Date(at).toLocaleString("en-GB", {
    timeZone: "Europe/Berlin",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  return (
    `:mag: *The UX digest sent ${when} said ${failed.length === 1 ? "something" : `${failed.length} things`} ` +
    `our records disagree with*\n` +
    failed.map((c) => `• ${c.claim}: ${c.detail}.`).join("\n") +
    (runUrl ? `\n<${runUrl}|The full check>` : "")
  );
}
