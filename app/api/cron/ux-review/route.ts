/**
 * GET /api/cron/ux-review
 *
 * Collects Replay Vision findings, and posts ONE summary a day.
 *
 * It does not post findings. It used to, and on 2026-09-14 that was measured:
 * of the five it published, the stated mechanism was wrong in all five — an
 * unlock click in a session with no click event, a redirect to a screen that
 * cannot emit a pageview, and an "Unable to process request." error where the
 * only error was an invisible React hydration warning. Confidence sat at
 * 0.8-1.0 across BOTH verdicts, so the 0.7 bar filtered nothing.
 *
 * The reason is structural, not a tuning problem: this runs in a 30-second
 * function and cannot open a browser, so model prose is the only thing it could
 * publish. A finding earns a Slack post by being REPRODUCED at the viewport the
 * session reported — that is scripts/verify-ux-findings.mjs, every three hours
 * in CI, replying in the submission's own thread. On those same five findings
 * the probes reject all five.
 *
 * So this route now: claims each observation once, refuses the ones our own
 * events contradict, writes the rest to the notice table so they stay
 * searchable, and once a day posts the digest the 2026-09-08 sync asked for
 * ("generate daily summaries of user UX issues"). An empty day is reported as
 * unusual rather than as all-clear, because a broken scanner and a healthy
 * product otherwise look identical.
 *
 * THE EXIT. PostHog ships native Replay Vision alerts with Slack delivery built
 * in. They cannot use our webhook, our replay links or the kill switch, which is
 * why this route exists — but if that ever stops earning its keep, delete the
 * route and make one `vision-alerts-create` call instead.
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
import {
  buildDigestMessage,
  contradiction,
  detectDrift,
  fetchDailyStats,
  fetchFindings,
  fetchSessionEvents,
  MAX_POSTS_PER_RUN,
  recordingLink,
} from "@features/ux-review/server/review";
import { UX_SCANNERS } from "@features/ux-review/server/scanners";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Post the daily summary at or after this UTC hour. Not the first run after
 *  midnight — a digest of an empty night reports nothing useful. */
const DIGEST_HOUR_UTC = 7;

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
    let collected = 0;
    let contradicted = 0;
    let suppressed = 0;

    for (const finding of findings.slice(0, MAX_POSTS_PER_RUN)) {
      // Once per observation, ever.
      const claimed = await tryClaimSlackAlert("ux_review", "observation", finding.observationId);
      if (!claimed) {
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
       * The claim is finalised on this path too (see below), so a refuted
       * finding is not re-queried on the next run: it stays refuted.
       */
      const sessionEvents = await fetchSessionEvents(finding.sessionId);
      const refuted = contradiction(finding.reasoning, sessionEvents);
      if (refuted) {
        logger.info(
          { session: finding.sessionId, refuted },
          "ux-review: claim contradicted by events"
        );
        contradicted += 1;
        // Finalise the claim. tryClaimSlackAlert is phase one of a two-phase
        // commit: a claim never marked delivered goes stale after ten minutes
        // and is handed to the next caller, so with a 90-minute lookback on a
        // 30-minute schedule every refuted finding was re-fetched and
        // re-queried against PostHog on each of the next three runs. The
        // comment above used to assert the opposite.
        await markSlackAlertDelivered("ux_review", "observation", finding.observationId);
        continue;
      }

      /**
       * Deliberately NOT posted to Slack.
       *
       * This cron runs in a 30-second Vercel function; it cannot open a
       * browser, so the only thing it could publish is the model's prose. On
       * 2026-09-14 that prose was measured against our own events: five
       * findings, and the stated mechanism was wrong on all five. An unverified
       * claim sitting under a reader's submission costs more trust than it buys
       * attention, which is exactly the "false confidence" the review protocol
       * exists to prevent.
       *
       * A finding earns a Slack post by being REPRODUCED in a real browser at
       * the viewport the session reported. That is scripts/verify-ux-findings.mjs,
       * which runs every three hours in CI and posts into the submission's own
       * thread. Correctness check on the same five: the probes reject all of them.
       *
       * What stays here is the searchable record and the daily count below, so
       * nothing is lost — only the unearned alert is.
       */
      await recordNotice({
        headline: `UX review: ${finding.scannerName}`,
        detail: finding.reasoning.slice(0, 1000),
        kind: "ux-review",
        evidence: recordingLink(finding.sessionId),
      });
      await markSlackAlertDelivered("ux_review", "observation", finding.observationId);
      collected += 1;
    }

    /**
     * The daily summary the 2026-09-08 sync asked for: "generate daily
     * summaries of user UX issues". Once a day, not on the first run after
     * midnight — a digest of an empty night says nothing.
     */
    if (new Date().getUTCHours() >= DIGEST_HOUR_UTC) {
      if (await tryClaimSlackAlert("ux_review_digest", "daily", dayKey)) {
        const { text, blocks } = buildDigestMessage(await fetchDailyStats());
        const fitted = fitBlocks(blocks, text);
        await notifySlack({
          channel: "survey",
          kind: "ux_review_digest",
          username: "ux_review",
          text,
          blocks: fitted.blocks,
        });
        await markSlackAlertDelivered("ux_review_digest", "daily", dayKey);
      }
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
      collected,
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
