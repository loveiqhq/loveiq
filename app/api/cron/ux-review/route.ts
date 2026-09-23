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
 * events contradict, finalises the rest so they are not re-queried, and once a
 * day posts the digest the 2026-09-08 sync asked for
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
import {
  buildDigestMessage,
  contradiction,
  buildWeeklyScorecard,
  fetchScannerDrift,
  fetchDailyStats,
  fetchFindings,
  fetchCoverageStats,
  fetchVerificationStats,
  fetchSessionEvents,
  MAX_POSTS_PER_RUN,
} from "@features/ux-review/server/review";
import { UX_SCANNERS } from "@features/ux-review/server/scanners";
import {
  isoWeekKey,
  isReportingMonday,
  reportingDay,
  reportingHour,
} from "@shared/time/reporting-day";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Stop STARTING findings past this, leaving the rest of the 30s ceiling for the
 * daily digest below and for recordCronRun to write the row at all.
 */
const LOOP_BUDGET_MS = 18_000;

/**
 * Post the daily summary at or after this hour, BERLIN time — not UTC.
 *
 * Not the first run after midnight: a digest of an empty night reports nothing
 * useful. And not a fixed UTC hour either, which is what this was: Berlin is
 * UTC+1 in winter and UTC+2 in summer, so `getUTCHours() >= 7` lands at 09:00
 * Berlin now and 08:00 Berlin from late October — the digest would quietly move
 * an hour earlier without anyone changing it.
 */
const DIGEST_HOUR_BERLIN = 9;
/** The window the scorecard reports on. Matches score.mjs --ledger's default. */
const SCORECARD_DAYS = 30;

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
    /**
     * The Berlin calendar day, not the UTC one. `toISOString().slice(0, 10)`
     * rolls over at 01:00/02:00 Berlin, so a "once a day" claim taken just
     * after midnight local time belongs to the previous day and the digest can
     * post twice in one Berlin day. Same reasoning as `funnel_event.day`, which
     * produced a 135% GA4 ratio before it was fixed — see shared/time.
     */
    const dayKey = reportingDay();
    let collected = 0;
    let contradicted = 0;
    let suppressed = 0;
    let deferred = 0;

    for (const finding of findings) {
      /**
       * Budget the WALL CLOCK too, not just the count.
       *
       * The count bound alone assumes each finding is cheap, and one of them is
       * not: `fetchSessionEvents` is a HogQL call with a 15s timeout and one
       * retry, so a single slow finding can spend the whole 30s ceiling by
       * itself. PostHog sheds load with 503 under exactly the conditions that
       * produce a busy run — on 2026-09-18, re-queueing 157 observations took
       * this cron from a 0.5-7s baseline to 15.6s and then 20.9s in the two
       * runs that followed, while PostHog answered 503 to other callers.
       *
       * A function killed at maxDuration writes NO cron_run row, so the failure
       * here is not a slow run but an INVISIBLE one: the findings stay
       * unclaimed, the next run inherits them plus its own, and nothing reports
       * that anything went wrong.
       *
       * Checked BEFORE the claim, so a deferred finding is untouched rather
       * than claimed-but-unhandled, and the next run takes it immediately
       * instead of waiting out the ten-minute stale-claim window. Same idiom as
       * NURTURE_TIME_BUDGET_MS in the nurture cron.
       */
      if (Date.now() - startMs > LOOP_BUDGET_MS) {
        deferred = findings.length - (collected + contradicted + suppressed);
        logger.warn(
          { deferred, collected, contradicted, elapsedMs: Date.now() - startMs },
          "ux-review: loop budget spent, deferring the rest to the next run"
        );
        break;
      }

      /**
       * Budget the WORK, not the lookback.
       *
       * This was `findings.slice(0, MAX_POSTS_PER_RUN)`, which took the six
       * newest of up to 25 and then skipped the already-claimed ones among
       * them — so a run could spend its whole budget re-checking findings it
       * had already handled. With a 90-minute lookback on a 30-minute
       * schedule the six newest come back on three consecutive runs, and once
       * six findings arrive inside one gap every older one ranks below them
       * (ORDER BY timestamp DESC) and is never reached: it ages out of the
       * window unclaimed, unverified and uncounted. The drop arrived exactly
       * when the scanners were busiest, and nothing reported it.
       *
       * The bound exists to keep a 30-second function inside its ceiling, and
       * the cost is the session query below, which only an unclaimed finding
       * pays. A claim check is one cheap round-trip, so counting worked
       * findings holds the same ceiling while letting the tail drain.
       */
      if (collected + contradicted >= MAX_POSTS_PER_RUN) break;

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
      if (sessionEvents === null) {
        // Fails open on purpose, but not silently: this is the only thing
        // standing between unverified model prose and a reader's thread.
        logger.warn(
          { session: finding.sessionId },
          "ux-review: session events unreadable, refusal check skipped"
        );
      }
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
       * AND IT IS NOT WRITTEN TO THE BRAIN EITHER, for the same reason.
       *
       * This used to call `recordNotice`, on the argument that the prose was
       * "the searchable record ... so nothing is lost". Both halves were false,
       * measured 2026-09-17:
       *
       *   * Nothing is lost -> everything but the last one was. `noticeId()`
       *     hashes the headline and the day, and the headline is
       *     `UX review: ${scannerName}` — four possible values. Every finding
       *     from one scanner on one day overwrote the previous one. The live
       *     rows prove it: the same hash suffix 56c0167db8 on the 15th, 16th
       *     and 17th, one row per scanner per day.
       *
       *   * A searchable record -> a searchable CLAIM. `brain_search` has no
       *     notice filter, so these are retrievable as company knowledge, and
       *     11 of the 13 notices in the corpus were this. A search for "survey
       *     loops back to the start" returned four of them. The most recent
       *     asserts a reader "is unexpectedly looped back to the survey start
       *     screen" — and the verifier probed that same session the same day
       *     and returned CLEAR on 2/2 devices. Unverified model prose presented
       *     as something the company knows is the exact "false confidence" the
       *     review protocol exists to prevent.
       *
       * The record is `public.ux_finding` now, written by the verifier AFTER a
       * probe has answered, carrying the verdict rather than the claim. A
       * notice for a REPRODUCED finding would be defensible. It stopped being
       * hypothetical on 2026-09-18 — the verifier reproduced a disabled "I
       * agree" on the survey consent gate (D1) on the reader's own device — so
       * that path now has something to be tested against, and is worth adding
       * deliberately rather than as a branch nothing has ever exercised.
       */
      await markSlackAlertDelivered("ux_review", "observation", finding.observationId);
      collected += 1;
    }

    /**
     * The daily summary the 2026-09-08 sync asked for: "generate daily
     * summaries of user UX issues". Once a day, not on the first run after
     * midnight — a digest of an empty night says nothing.
     */
    if (reportingHour() >= DIGEST_HOUR_BERLIN) {
      if (await tryClaimSlackAlert("ux_review_digest", "daily", dayKey)) {
        const { text, blocks } = buildDigestMessage(
          await fetchDailyStats(),
          await fetchVerificationStats(),
          await fetchCoverageStats()
        );
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

    /**
     * The scorecard, which was built and then wired to nothing.
     *
     * `buildScorecardMessage` has existed since the ledger landed and its only
     * caller was its own test — the numbers were computed every Monday into a
     * CI log that nobody opens. How well the watchers are doing is the one
     * question this whole system exists to answer, and it was the one nobody
     * was being told.
     *
     * WEEKLY, not daily. Precision over a 30-day window barely moves between
     * one day and the next, and a number that repeats unchanged every morning
     * is a number people stop reading. Monday, in the same hour as the digest,
     * so it arrives beside the summary rather than as a second interruption.
     *
     * OPS, not the survey channel: this is about the watchers, not about a
     * reader. The digest is where reader-facing news goes.
     *
     * Claimed on the ISO week, so a retry or a second run on Monday cannot
     * post it twice.
     */
    if (reportingHour() >= DIGEST_HOUR_BERLIN && isReportingMonday()) {
      const weekKey = isoWeekKey();
      if (await tryClaimSlackAlert("ux_review_scorecard", "weekly", weekKey)) {
        // Null means the ledger could not be read. A scorecard of nothing reads
        // exactly like a quiet week, which is the shape this repo keeps paying
        // for — so say nothing rather than say zero.
        const scorecard = await buildWeeklyScorecard(SCORECARD_DAYS);
        if (scorecard) {
          const { text, blocks } = scorecard;
          const fitted = fitBlocks(blocks, text);
          await notifySlack({
            channel: "ops",
            kind: "ux_review_scorecard",
            username: "ux_review",
            text,
            blocks: fitted.blocks,
          });
          await markSlackAlertDelivered("ux_review_scorecard", "weekly", weekKey);
        }
      }
    }

    // A prompt edited in the PostHog UI and not brought back to
    // `features/ux-review/server/scanners.ts` means the criteria in git are no
    // longer the criteria being applied. One ops ping a day is enough to notice.
    for (const drift of await fetchScannerDrift()) {
      // Keyed by scanner AND reason: a scanner can be both disabled and running
      // a rewritten prompt, and claiming on the name alone would report the
      // first and swallow the second for the rest of the day.
      const key = `${drift.scannerName}:${drift.reason}`;
      if (await tryClaimSlackAlert("ux_review_drift", key, dayKey)) {
        await notifySlack({
          channel: "ops",
          kind: "ux_review_drift",
          username: "ops_alerts",
          // The closing hint has to match the problem. "scanners.ts is the
          // source of truth" is the fix for a drifted prompt and means nothing
          // for an empty credit pool, which is a billing ceiling in PostHog and
          // not something this repo can set.
          text:
            `:warning: ${drift.reason === "quota" ? "" : "Scanner "}${escapeSlack(drift.scannerName)} — ${escapeSlack(drift.detail)}. ` +
            (drift.reason === "quota"
              ? `Raise the limit in PostHog, or the scanners stay stopped.`
              : `features/ux-review/server/scanners.ts is the source of truth.`),
        });
        await markSlackAlertDelivered("ux_review_drift", key, dayKey);
      }
    }

    return NextResponse.json({
      ok: true,
      considered: findings.length,
      collected,
      contradicted,
      suppressed,
      deferred,
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
