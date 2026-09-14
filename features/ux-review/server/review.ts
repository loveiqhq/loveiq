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
