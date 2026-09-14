/**
 * GET /api/cron/ux-review
 *
 * Relays Replay Vision findings to Slack. PostHog's scanners watch every report,
 * survey, rage-click and dead-click recording and emit a verdict; this posts the
 * ones that clear the confidence bar into #incoming-surveys, where Mark already
 * posts recording findings by hand.
 *
 * THIS IS AN ALERT, NOT A DIGEST. `25a9ca64` deliberately unscheduled the
 * informational digests, and this is not a re-run of that: it only posts a
 * verdict of `yes` above `UX_REVIEW_MIN_CONFIDENCE`, at most twice per scanner
 * per day — a ceiling of eight messages, and on most days zero. If it ever
 * becomes chatty, that cap is the thing to tighten, not the schedule.
 *
 * THE EXIT. PostHog ships native Replay Vision alerts with Slack delivery built
 * in. They cannot use our webhook, our replay links, the "unreviewed" framing or
 * the kill switch, which is why this route exists — but if that framing ever
 * stops earning its keep, delete this route and make one `vision-alerts-create`
 * call instead.
 *
 * Protected by `Authorization: Bearer ${CRON_SECRET}`; skipped on staging, which
 * shares the prod database.
 */

import { NextResponse } from "next/server";

import { isProdCronHost } from "@shared/http/is-prod-cron-host";
import { isFeatureEnabled } from "@shared/flags/system-flags";
import logger from "@shared/observability/logger";
import { escapeSlack, notifySlack } from "@shared/observability/slack";
import { fitBlocks } from "@shared/observability/slack-blocks";
import {
  markSlackAlertDelivered,
  recordCronRun,
  startCronTimer,
  tryClaimSlackAlert,
  verifyCronAuth,
} from "@shared/observability/slack-alert-dedup";
import { recordNotice } from "@features/brain/server/notice";
import { isSlackBotConfigured, postJourneyMessage } from "@shared/observability/slack-bot";
import {
  buildReviewMessage,
  contradiction,
  detectDrift,
  fetchFindings,
  fetchSessionEvents,
  findThreadTs,
  MAX_POSTS_PER_RUN,
  recordingLink,
} from "@features/ux-review/server/review";
import { UX_SCANNERS } from "@features/ux-review/server/scanners";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Posts per scanner per UTC day. Deliberately small: this competes for
 *  attention with real survey submissions in the same channel. */
const MAX_POSTS_PER_SCANNER_PER_DAY = 2;

export async function GET(request: Request) {
  if (!verifyCronAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isProdCronHost()) {
    return NextResponse.json({ skipped: true, reason: "non-prod-cron-host" });
  }
  // Silences Slack only. Credits are spent by PostHog's own five-minute sweep,
  // whose stop is the scanner's `credit_limit` or disabling it outright.
  if (!(await isFeatureEnabled("ux_review_alerts", true))) {
    return NextResponse.json({ skipped: true, reason: "flag-off" });
  }

  const trackDuration = startCronTimer("ux-review", 30);
  const startMs = Date.now();
  let cronError: string | undefined;

  try {
    const findings = await fetchFindings();
    const dayKey = new Date().toISOString().slice(0, 10);
    let posted = 0;
    let contradicted = 0;
    let suppressed = 0;

    for (const finding of findings.slice(0, MAX_POSTS_PER_RUN)) {
      // Once per observation, ever.
      const claimed = await tryClaimSlackAlert("ux_review", "observation", finding.observationId);
      if (!claimed) {
        suppressed += 1;
        continue;
      }

      // Per-scanner daily budget, as numbered claim slots on the same table —
      // the first free slot wins, and when none are free the finding waits for
      // tomorrow rather than being lost (its observation claim is already taken,
      // so it will not be re-posted; that is the trade for a hard ceiling).
      let slot = 0;
      for (let n = 1; n <= MAX_POSTS_PER_SCANNER_PER_DAY; n += 1) {
        if (await tryClaimSlackAlert("ux_review_budget", finding.scannerId, `${dayKey}:${n}`)) {
          slot = n;
          break;
        }
      }
      if (slot === 0) {
        suppressed += 1;
        continue;
      }

      /**
       * Refuse a claim our own events contradict, BEFORE it reaches Slack.
       *
       * The first day posted five findings, and the one that read worst — "the
       * user clicked 'Unlock full report', which looped them back to the
       * survey" — came from a session with no unlock event of any kind. The
       * navigation was real and the cause invented. One query is cheap next to
       * a fabricated claim sitting in the channel under a reader's submission.
       *
       * The observation claim is already taken at this point, so a refuted
       * finding is not retried on the next run: it stays refuted.
       */
      const sessionEvents = await fetchSessionEvents(finding.sessionId);
      const refuted = contradiction(finding.reasoning, sessionEvents);
      if (refuted) {
        logger.info(
          { session: finding.sessionId, refuted },
          "ux-review: claim contradicted by events"
        );
        contradicted += 1;
        continue;
      }

      const { text, blocks } = buildReviewMessage(finding);
      const fitted = fitBlocks(blocks, text);

      /**
       * Hang the finding under the survey notification it is about, rather than
       * stacking it at the bottom of the channel where it reads as unrelated to
       * anything. Threading needs chat.postMessage — an incoming webhook cannot
       * reply to a message — so this goes through the bot when one is
       * configured, and falls back to the webhook otherwise.
       */
      const threadTs = isSlackBotConfigured() ? await findThreadTs(finding.sessionId) : null;
      const threaded = threadTs
        ? await postJourneyMessage({ text, blocks: fitted.blocks, threadTs })
        : null;
      if (!threaded) {
        await notifySlack({
          channel: "survey",
          kind: "ux_review",
          username: "ux_review",
          text,
          blocks: fitted.blocks,
        });
      }
      await markSlackAlertDelivered("ux_review", "observation", finding.observationId);
      await markSlackAlertDelivered("ux_review_budget", finding.scannerId, `${dayKey}:${slot}`);
      posted += 1;

      // Second sink, so a finding is searchable later even if the Slack message
      // scrolls away. Swallows its own errors.
      await recordNotice({
        headline: `UX review: ${finding.scannerName}`,
        detail: finding.reasoning.slice(0, 1000),
        kind: "ux-review",
        evidence: recordingLink(finding.sessionId),
      });
    }

    // A prompt edited in the PostHog UI and not brought back to
    // `features/ux-review/server/scanners.ts` means the criteria in git are no
    // longer the criteria being applied. One ops ping a day is enough to notice.
    for (const drift of detectDrift(findings)) {
      if (await tryClaimSlackAlert("ux_review_drift", drift.scannerName, dayKey)) {
        await notifySlack({
          channel: "ops",
          kind: "ux_review_drift",
          username: "ops_alerts",
          text:
            `:warning: Scanner ${escapeSlack(drift.scannerName)} is at version ${drift.liveVersion} ` +
            `in PostHog, the repo pins ${drift.pinnedVersion} — ` +
            `features/ux-review/server/scanners.ts is stale.`,
        });
        await markSlackAlertDelivered("ux_review_drift", drift.scannerName, dayKey);
      }
    }

    return NextResponse.json({
      ok: true,
      considered: findings.length,
      posted,
      contradicted,
      suppressed,
      scanners: UX_SCANNERS.length,
    });
  } catch (err) {
    cronError = err instanceof Error ? err.message : String(err);
    logger.error({ err }, "ux-review cron failed");
    return NextResponse.json({ error: "Internal" }, { status: 500 });
  } finally {
    await trackDuration();
    await recordCronRun("ux-review", startMs, cronError ? "error" : "success", cronError);
  }
}
