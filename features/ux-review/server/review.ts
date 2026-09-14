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

/** First sentence of the model's prose — the finding, without the working out. */
export function firstSentence(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  const end = flat.search(/[.!?](\s|$)/);
  return end === -1 ? flat : flat.slice(0, end + 1);
}

/**
 * The Slack message. Four blocks, deliberately short — the card asked for "a
 * very short summary", and a finding nobody reads is worse than no finding.
 *
 * `reasoning` is model prose describing a session that anyone holding the public
 * project token could have staged, so it is escaped and clamped before it
 * reaches a block, and never interpolated into a URL.
 */
export function buildReviewMessage(finding: UxFinding, unratedCount = 0) {
  const headline = firstSentence(finding.reasoning).slice(0, 240);
  const text = `UX review — ${finding.scannerName}: ${headline}`;
  const blocks: SlackBlock[] = [
    header(`👁 UX review — ${finding.scannerName}`.slice(0, 150)),
    section(escapeSlack(headline)),
    linkButton("▶ Watch session recording", recordingLink(finding.sessionId)),
    context(
      `Confidence ${Math.round(finding.confidence * 100)}% · *unreviewed* — one AI judgment on ` +
        `one recording, not a finding until a human rates it 👍/👎 in PostHog.` +
        (unratedCount > 0 ? ` · ${unratedCount} unrated` : "")
    ),
  ];
  return { text, blocks };
}

/** Scanner whose live config has drifted from the version pinned in git. */
export interface ScannerDrift {
  scannerName: string;
  pinnedVersion: number;
  liveVersion: number;
}

export function detectDrift(findings: Array<Pick<UxFinding, "scannerName" | "scannerVersion">>) {
  const drift: ScannerDrift[] = [];
  for (const scanner of UX_SCANNERS) {
    const seen = findings.filter((f) => f.scannerName === scanner.name);
    const live = Math.max(0, ...seen.map((f) => f.scannerVersion));
    if (live > scanner.scannerVersion) {
      drift.push({
        scannerName: scanner.name,
        pinnedVersion: scanner.scannerVersion,
        liveVersion: live,
      });
    }
  }
  return drift;
}

/**
 * Fetch findings above the confidence bar. Returns [] rather than throwing when
 * PostHog is not configured — a cron that cannot read should log and skip, not
 * page someone at 03:00.
 */
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
 * The Slack thread a finding belongs under.
 *
 * Findings used to stack at the bottom of #incoming-surveys, detached from the
 * submission they are about, so reading one meant hunting for the matching
 * survey notification. `survey_submission.posthog_session_id` links a recording
 * to its submission, and `slack_journey_message.message_ts` is the notification
 * already posted for it — so a finding can hang under the very message a reader
 * is looking at.
 *
 * Returns null when there is no thread to hang under (a landing-page session, a
 * submission from before journey messages existed, or a recording with no
 * submission at all). The caller posts to the channel instead: a finding in the
 * wrong place still beats a finding nobody sees.
 */
export async function findThreadTs(sessionId: string): Promise<string | null> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || !sessionId) return null;

  try {
    const submissions = await fetchWithTimeout(
      `${url}/rest/v1/survey_submission?posthog_session_id=eq.${encodeURIComponent(sessionId)}&select=id&limit=1`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` }, timeoutMs: 4000 }
    );
    if (!submissions.ok) return null;
    const rows = (await submissions.json()) as Array<{ id: number }>;
    const submissionId = rows[0]?.id;
    if (!submissionId) return null;

    const messages = await fetchWithTimeout(
      // eslint-disable-next-line no-secrets/no-secrets -- Supabase REST path, not a credential
      `${url}/rest/v1/slack_journey_message?survey_submission_id=eq.${submissionId}&select=message_ts&limit=1`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` }, timeoutMs: 4000 }
    );
    if (!messages.ok) return null;
    const found = (await messages.json()) as Array<{ message_ts: string | null }>;
    return found[0]?.message_ts ?? null;
  } catch {
    // Threading is a nicety; never let it stop the finding being delivered.
    return null;
  }
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
export function contradiction(reasoning: string, events: ReadonlySet<string>): string | null {
  for (const rule of CLAIM_EVIDENCE) {
    if (!rule.claim.test(reasoning)) continue;
    if (rule.requireAny.some((e) => events.has(e))) continue;
    return `the recording describes ${rule.describes}, but the session has none of ${rule.requireAny.join(", ")}`;
  }
  return null;
}

/** Distinct events in one session. Empty set when PostHog is unreachable, which
 *  makes `contradiction()` fall silent rather than refuting everything. */
export async function fetchSessionEvents(sessionId: string): Promise<Set<string>> {
  const key = process.env.POSTHOG_API_KEY;
  if (!key || !isSafeSessionId(sessionId)) return new Set();
  try {
    const res = await fetchWithTimeout(`https://eu.posthog.com/api/projects/${PROJECT}/query/`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        query: {
          kind: "HogQLQuery",
          query: `SELECT DISTINCT event FROM events
                  WHERE timestamp > now() - INTERVAL 30 DAY
                    AND properties.$session_id = '${sessionId}'`,
        },
      }),
      timeoutMs: 8000,
    });
    if (!res.ok) return new Set();
    const payload = (await res.json()) as { results?: unknown[][]; error?: unknown };
    if (payload.error) return new Set();
    return new Set((payload.results ?? []).map((r) => String(r[0])));
  } catch {
    return new Set();
  }
}
