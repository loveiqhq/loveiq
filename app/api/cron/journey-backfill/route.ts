/**
 * One-shot catch-up: re-post the last week of survey notifications in the
 * current format, so the team can skim how the new message reads.
 *
 * WHY RE-POST RATHER THAN EDIT. Of the 83 completions in the trailing week, only
 * 14 have a row in `slack_journey_message` — those were posted by the LoveIQ
 * Journey bot and `chat.update` can edit them. The other 69 came from the
 * incoming webhook, which is a DIFFERENT Slack app, and Slack only lets a token
 * edit its own messages. There is no API that fixes that, so those 69 are
 * permanently frozen in whatever format they were posted in.
 *
 * So the week is rebuilt as REPLIES under one parent message: one thread to open
 * and scroll instead of eighty new messages in the channel. The 14 editable
 * originals are also corrected in place, because they are live-updating messages
 * that must carry the new format going forward — which means those 14 appear
 * twice, once in the channel and once in the thread. That is deliberate; the
 * alternative is a thread with holes in it.
 *
 * WHY A CRON ROUTE FOR A MANUAL JOB. It has to be runnable from the Vercel
 * dashboard's "Run" button, and that only exists for registered crons. An admin
 * route would need a Supabase Auth session, which cannot be supplied that way.
 * The schedule is annual and meaningless — the ENABLE FLAG is the real control,
 * and the run is idempotent regardless.
 *
 * SAFE TO RUN TWICE. `backfilled_at` marks each submission as done, so pressing
 * Run again resumes where it stopped rather than posting the week twice. It
 * returns {posted, updated, remaining} so "am I finished" is answerable without
 * reading Slack.
 */

import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { buildSubmissionJourney } from "@features/attribution/server/journey";
import { buildJourneyMessage, JOURNEY_STEPS } from "@features/attribution/server/slack-journey";
import { journeyStateOf, type JourneyState } from "@features/attribution/server/journey-message";
import { supabaseFetch } from "@features/admin/server/supabase";
import { isProdCronHost } from "@shared/http/is-prod-cron-host";
import {
  isSlackBotConfigured,
  postJourneyMessage,
  updateJourneyMessage,
} from "@shared/observability/slack-bot";
import { recordCronRun, startCronTimer } from "@shared/observability/slack-alert-dedup";
import logger from "@shared/observability/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/**
 * chat.postMessage is limited to roughly one message per second per channel, so
 * ~83 posts plus ~14 edits needs about two minutes. Every other cron here is
 * capped at 60s; this one genuinely cannot be.
 */
export const maxDuration = 300;

/** Days of history to rebuild. */
const WINDOW_DAYS = 7;
/** Slack's own guidance for chat.postMessage: about one per second. */
const PACE_MS = 1200;
/** Backstop against a runaway loop; two runs cover any realistic week. */
const MAX_PER_RUN = 120;
/**
 * The thread parent's `ts` is stored on this reserved row. `slack_journey_message`
 * has a primary key on `survey_submission_id` and NO foreign key to
 * `survey_submission` (verified), so a sentinel id is legal — and it is a much
 * smaller thing than a new table holding one string.
 */
const THREAD_PARENT_ID = 0;

const TABLE = "/rest/v1/slack_journey_message";

function safeCompare(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * The furthest of several claimed steps. Compared by index in JOURNEY_STEPS,
 * never as strings, and an unrecognised value is ignored rather than trusted.
 */
function furthest(claims: Array<string | null | undefined>): JourneyState {
  let best = 0;
  for (const claim of claims) {
    const i = claim ? JOURNEY_STEPS.indexOf(claim as JourneyState) : -1;
    if (i > best) best = i;
  }
  return JOURNEY_STEPS[best]!;
}

interface Candidate {
  id: number;
  questionCount: number;
  /** Row already exists, so its original message is editable in place. */
  stored: { channel: string; ts: string; state: string | null } | null;
}

/** Completions in the window that have not been backfilled yet, oldest first. */
async function loadCandidates(sinceIso: string): Promise<Candidate[]> {
  // One row per question in survey_submission_answer (verified across the whole
  // window: rows == distinct questions on every submission), so the embedded
  // count is the question count and needs no second request or paging.
  const res = await supabaseFetch(
    `/rest/v1/survey_submission?status=eq.completed&created_date_time=gte.${sinceIso}` +
      `&select=id,survey_submission_answer(count)&order=created_date_time.asc&limit=500`
  );
  if (!res.ok) throw new Error(`candidates ${res.status}`);
  const rows = (await res.json()) as Array<{
    id: number;
    survey_submission_answer?: Array<{ count?: number }>;
  }>;
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id);
  const marks = await supabaseFetch(
    `${TABLE}?survey_submission_id=in.(${ids.join(",")})` +
      `&select=survey_submission_id,channel,message_ts,state,backfilled_at`
  );
  if (!marks.ok) throw new Error(`marks ${marks.status}`);
  const byId = new Map(
    (
      (await marks.json()) as Array<{
        survey_submission_id: number;
        channel: string;
        message_ts: string;
        state: string | null;
        backfilled_at: string | null;
      }>
    ).map((m) => [m.survey_submission_id, m])
  );

  const out: Candidate[] = [];
  for (const r of rows) {
    const mark = byId.get(r.id);
    if (mark?.backfilled_at) continue; // already done — resume, do not repeat
    out.push({
      id: r.id,
      questionCount: r.survey_submission_answer?.[0]?.count ?? 0,
      stored: mark ? { channel: mark.channel, ts: mark.message_ts, state: mark.state } : null,
    });
  }
  return out;
}

/**
 * Which submissions the SERVER can see opened their report.
 *
 * Needed because the journey's `reportViewedAt` comes from `analytics_event`,
 * which is consent-gated: measured over this window, 81 of 83 opened their
 * report per `report_session` but only 53 appear in `analytics_event`. Rendering
 * from the milestones alone would therefore paint "Report opened" RED for 28
 * people the server knows opened it — and in a red/green rail that reads as a
 * failure rather than as missing telemetry. Nobody is around to witness a
 * historical milestone, so it is asserted here instead.
 */
async function loadServerOpens(ids: number[]): Promise<Set<number>> {
  if (ids.length === 0) return new Set();
  const res = await supabaseFetch(
    `/rest/v1/personal_report?survey_submission_id=in.(${ids.join(",")})` +
      `&select=survey_submission_id,report_session(count)&limit=500`
  );
  if (!res.ok) return new Set();
  const rows = (await res.json()) as Array<{
    survey_submission_id: number;
    report_session?: Array<{ count?: number }>;
  }>;
  return new Set(
    rows.filter((r) => (r.report_session?.[0]?.count ?? 0) > 0).map((r) => r.survey_submission_id)
  );
}

/**
 * The thread parent's ts, or null when there genuinely is not one yet.
 *
 * THROWS on a failed read rather than returning null. Returning null made a
 * transient PostgREST error indistinguishable from "no thread exists", and the
 * caller's response to that is to post a NEW parent — so one bad read would
 * silently start a second thread and split the week across two of them.
 */
async function readThreadParent(): Promise<string | null> {
  const res = await supabaseFetch(
    `${TABLE}?survey_submission_id=eq.${THREAD_PARENT_ID}&select=message_ts&limit=1`
  );
  if (!res.ok) throw new Error(`readThreadParent ${res.status}`);
  const rows = (await res.json()) as Array<{ message_ts: string }>;
  return rows[0]?.message_ts ?? null;
}

/**
 * Upsert a row, THROWING if the write did not land.
 *
 * The status check is the whole point. `fetchWithTimeout` only throws on abort,
 * timeout or network failure — an HTTP 4xx/5xx resolves normally with
 * `ok: false`. Discarding the response meant a failed `backfilled_at` write
 * looked identical to a successful one, so a submission whose Slack reply had
 * ALREADY been posted stayed unmarked, and the next run posted it a second time.
 * Across ~83 sequential writes one transient non-2xx is entirely plausible.
 *
 * Throwing aborts the run loudly, which is safe precisely because the job is
 * resumable: everything already marked stays done.
 */
async function writeRow(body: Record<string, unknown>): Promise<void> {
  const res = await supabaseFetch(TABLE, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // The conflict target IS the primary key, which is what PostgREST uses by
      // default, so no on_conflict is needed.
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify({ ...body, updated_at: new Date().toISOString() }),
  });
  if (!res.ok) throw new Error(`writeRow ${res.status}`);
}

export async function GET(request: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json({ error: "Service unavailable." }, { status: 503 });
  }
  if (!safeCompare(request.headers.get("authorization") || "", `Bearer ${expected}`)) {
    return NextResponse.json({ error: "Invalid request." }, { status: 401 });
  }
  if (!isProdCronHost()) {
    return NextResponse.json({ skipped: true, reason: "non-prod-cron-host" });
  }

  const dryRun = new URL(request.url).searchParams.get("dryRun") === "1";

  // The real control. The annual schedule exists only so the dashboard shows a
  // Run button; this flag is what decides whether a run does anything, and it
  // should be removed from the environment once the catch-up is done.
  if (!dryRun && process.env.JOURNEY_BACKFILL_ENABLED !== "true") {
    return NextResponse.json({ skipped: true, reason: "JOURNEY_BACKFILL_ENABLED not true" });
  }
  if (!isSlackBotConfigured()) {
    return NextResponse.json({ skipped: true, reason: "slack-bot-not-configured" });
  }

  const trackDuration = startCronTimer("journey-backfill", 290);
  const startMs = Date.now();
  let cronError: string | undefined;

  try {
    const sinceIso = new Date(Date.now() - WINDOW_DAYS * 86_400_000).toISOString();
    const candidates = await loadCandidates(sinceIso);
    const serverOpens = await loadServerOpens(candidates.map((c) => c.id));

    if (dryRun) {
      return NextResponse.json({
        dryRun: true,
        windowDays: WINDOW_DAYS,
        pending: candidates.length,
        editableInPlace: candidates.filter((c) => c.stored).length,
        threadOnly: candidates.filter((c) => !c.stored).length,
        serverKnownReportOpens: serverOpens.size,
        threadParentExists: (await readThreadParent()) !== null,
      });
    }

    const batch = candidates.slice(0, MAX_PER_RUN);
    let threadTs = await readThreadParent();
    if (!threadTs && batch.length > 0) {
      const parent = await postJourneyMessage({
        text: `Catch-up: the last ${WINDOW_DAYS} days of survey notifications, in the new format`,
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text:
                `*The last ${WINDOW_DAYS} days in the new format* — ${candidates.length} finished surveys, oldest first in this thread.\n` +
                "Green means the person reached that step; red means they have not yet. " +
                "Most of these were originally posted by a different Slack app, which cannot be edited, so they are re-posted here rather than changed in place.",
            },
          },
        ],
      });
      if (!parent) throw new Error("thread-parent-post-failed");
      threadTs = parent.ts;
      await writeRow({
        survey_submission_id: THREAD_PARENT_ID,
        channel: parent.channel,
        message_ts: parent.ts,
        state: null,
        question_count: null,
        backfilled_at: new Date().toISOString(),
      });
    }

    let posted = 0;
    let updated = 0;
    let failed = 0;

    for (const [index, c] of batch.entries()) {
      // Nothing to pace against after the final message.
      const last = index === batch.length - 1;
      const journey = await buildSubmissionJourney(c.id);
      if (!journey) {
        failed += 1;
        continue;
      }
      /**
       * The furthest step of THREE sources, because each alone is lossy:
       *
       *  - the derived milestones, whose report-open and paywall steps come from
       *    consent-gated `analytics_event`;
       *  - what `report_session` proves server-side (28 of the 83 in this window
       *    opened their report but are absent from analytics);
       *  - and the state already on the row, which for the messages that ARE
       *    live was written from a step the server WITNESSED at the time.
       *
       * That last one matters. Without it, re-rendering a live message could
       * DOWNGRADE it: a submission whose stored state is `paywall` — witnessed by
       * the route that recorded it — comes back as `report_opened` if the reader
       * declined analytics, and the edit would replace a correct green step with
       * a red one. Re-rendering must never show less than the message it
       * replaces.
       */
      const derived = journeyStateOf(journey.milestones);
      const seen: JourneyState = serverOpens.has(c.id) ? "report_opened" : "completed";
      const state = furthest([derived, seen, c.stored?.state]);
      const message = buildJourneyMessage(journey, {
        kind: "survey_completed",
        questionCount: c.questionCount,
        reachedFloor: state,
      });

      const reply = await postJourneyMessage({
        text: message.text,
        blocks: message.blocks,
        threadTs: threadTs ?? undefined,
      });
      if (!reply) {
        failed += 1;
        if (!last) await sleep(PACE_MS);
        continue;
      }
      posted += 1;

      if (c.stored) {
        // Keep the live message id: this row's future milestones must keep
        // editing the message in the CHANNEL, not the thread reply.
        const ok = await updateJourneyMessage({
          channel: c.stored.channel,
          ts: c.stored.ts,
          text: message.text,
          blocks: message.blocks,
        });
        if (ok) updated += 1;
        await writeRow({
          survey_submission_id: c.id,
          channel: c.stored.channel,
          message_ts: c.stored.ts,
          state,
          question_count: c.questionCount,
          backfilled_at: new Date().toISOString(),
        });
      } else {
        // No live message existed, so the thread reply becomes it — this
        // submission's later milestones will update the reply.
        await writeRow({
          survey_submission_id: c.id,
          channel: reply.channel,
          message_ts: reply.ts,
          state,
          question_count: c.questionCount,
          backfilled_at: new Date().toISOString(),
        });
      }

      if (!last) await sleep(PACE_MS);
    }

    const remaining = Math.max(0, candidates.length - batch.length);
    logger.info({ posted, updated, failed, remaining }, "journey-backfill: run complete");
    return NextResponse.json({ ok: true, posted, updated, failed, remaining });
  } catch (err) {
    cronError = err instanceof Error ? err.message : "unknown";
    logger.error({ err }, "journey-backfill failed");
    return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
  } finally {
    await trackDuration();
    await recordCronRun("journey-backfill", startMs, cronError ? "error" : "success", cronError);
  }
}
