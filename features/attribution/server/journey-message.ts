/**
 * Post the journey notification, then keep it up to date as the person moves.
 *
 * The whole point is that the message in Slack stops being a snapshot of the one
 * instant a survey was submitted. At submit time only "survey done" can be true —
 * report-open, paywall, checkout and paid all read rows that do not exist yet, and
 * the pricing/paywall arms have no quote to read — so the rail was permanently
 * 1-of-5 with two arm rows permanently "Not recorded". Now each milestone edits
 * the original message.
 *
 * Every function here is best-effort and never throws: a Slack notification must
 * not be able to fail a survey submission, a report view, a checkout or a
 * payment. Callers wrap these in `scheduleAfterResponse`, so nothing here is on a
 * user's critical path either.
 *
 * Without `SLACK_BOT_TOKEN` + `SLACK_JOURNEY_CHANNEL_ID` this degrades to exactly
 * the previous behaviour: one webhook post, no updates.
 */

import { buildSubmissionJourney } from "@features/attribution/server/journey";
import {
  buildJourneyMessage,
  JOURNEY_STEPS,
  type JourneyStep,
} from "@features/attribution/server/slack-journey";
import { supabaseFetch } from "@features/admin/server/supabase";
import type { SlackBlock } from "@shared/observability/slack";
import {
  isSlackBotConfigured,
  postJourneyMessage,
  updateJourneyMessage,
} from "@shared/observability/slack-bot";
import logger from "@shared/observability/logger";

const TABLE = "/rest/v1/slack_journey_message";

/**
 * The furthest step reached, as a short token stored on the row. A milestone that
 * does not advance this skips the Slack call, so re-opening a report twenty times
 * costs zero chat.update calls.
 *
 * Ordered, and compared by index — never by string.
 */
// One ordered list, shared with the rail, so the stored state and what is drawn
// can never disagree about what "further along" means.
const STATES = JOURNEY_STEPS;
export type JourneyState = JourneyStep;

export function journeyStateOf(milestones: {
  reportViewedAt: string | null;
  paywallInitiatedAt: string | null;
  checkoutStartedAt: string | null;
  purchasedAt: string | null;
}): JourneyState {
  if (milestones.purchasedAt) return "paid";
  if (milestones.checkoutStartedAt) return "checkout";
  if (milestones.paywallInitiatedAt) return "paywall";
  if (milestones.reportViewedAt) return "report_opened";
  return "completed";
}

function isAdvance(from: string | null | undefined, to: JourneyState): boolean {
  const fromIdx = from ? STATES.indexOf(from as JourneyState) : -1;
  return STATES.indexOf(to) > fromIdx;
}

interface StoredMessage {
  channel: string;
  message_ts: string;
  state: string | null;
  question_count: number | null;
}

async function readStored(submissionId: number): Promise<StoredMessage | null> {
  try {
    const res = await supabaseFetch(
      `${TABLE}?survey_submission_id=eq.${submissionId}&select=channel,message_ts,state,question_count&limit=1`
    );
    if (!res.ok) return null;
    const rows = (await res.json()) as StoredMessage[];
    return rows[0] ?? null;
  } catch {
    return null;
  }
}

async function storeMessage(input: {
  submissionId: number;
  channel: string;
  ts: string;
  state: JourneyState;
  questionCount: number;
}): Promise<void> {
  try {
    await supabaseFetch(TABLE, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Upsert: a resubmitted survey must replace its id, not 409. No
        // `on_conflict` needed — the conflict target IS the primary key, which is
        // what PostgREST uses by default.
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify({
        survey_submission_id: input.submissionId,
        channel: input.channel,
        message_ts: input.ts,
        state: input.state,
        question_count: input.questionCount,
        updated_at: new Date().toISOString(),
      }),
    });
  } catch (err) {
    // A lost id only means the message stops updating; the post already landed.
    logger.warn({ err, submissionId: input.submissionId }, "journey-message: store failed");
  }
}

async function markState(submissionId: number, state: JourneyState): Promise<void> {
  try {
    await supabaseFetch(`${TABLE}?survey_submission_id=eq.${submissionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ state, updated_at: new Date().toISOString() }),
    });
  } catch (err) {
    logger.warn({ err, submissionId }, "journey-message: state update failed");
  }
}

/**
 * Try to post via the bot so the message can be edited later.
 *
 * Returns false when the bot is not configured or the call failed, and the caller
 * then posts through the existing webhook. Deliberately takes an already-built
 * message rather than building its own: `app/api/survey/route.ts` also handles the
 * unreadable-journey fallback and the send logging, and duplicating that here is
 * how two senders drift apart.
 */
export async function tryPostJourneyViaBot(input: {
  submissionId: number;
  questionCount: number;
  message: { text: string; blocks: SlackBlock[] };
  milestones: {
    reportViewedAt: string | null;
    paywallInitiatedAt: string | null;
    checkoutStartedAt: string | null;
    purchasedAt: string | null;
  };
}): Promise<boolean> {
  if (!isSlackBotConfigured()) return false;
  try {
    const posted = await postJourneyMessage({
      text: input.message.text,
      blocks: input.message.blocks,
    });
    if (!posted) return false;
    await storeMessage({
      submissionId: input.submissionId,
      channel: posted.channel,
      ts: posted.ts,
      state: journeyStateOf(input.milestones),
      questionCount: input.questionCount,
    });
    return true;
  } catch (err) {
    logger.warn({ err, submissionId: input.submissionId }, "journey-message: bot post failed");
    return false;
  }
}

/**
 * Re-render the stored message for a submission whose journey has moved on.
 *
 * No-ops when: the bot is not configured, no message was stored (posted before
 * this shipped, or posted via webhook), or the journey has not actually advanced
 * past what is already on screen.
 */
export async function refreshJourneyMessage(
  submissionId: number,
  /**
   * The step the CALLER just witnessed server-side. Required, because deriving it
   * is not reliable: `reportViewedAt` and `paywallInitiatedAt` come from
   * `analytics_event`, which is consent-gated, so a reader who declined analytics
   * looks like they never opened the report. The first version of this derived
   * the state and therefore never advanced past "completed" for those readers —
   * the update silently no-opped.
   */
  witnessed: JourneyState
): Promise<void> {
  if (!isSlackBotConfigured()) return;
  try {
    const stored = await readStored(submissionId);
    if (!stored) return;

    const journey = await buildSubmissionJourney(submissionId);
    if (!journey) return;

    // Whichever is further along: what the data shows, or what the caller saw.
    const derived = journeyStateOf(journey.milestones);
    const state = STATES.indexOf(witnessed) > STATES.indexOf(derived) ? witnessed : derived;
    if (!isAdvance(stored.state, state)) return;

    // Rebuilt from source, so the arms that were unknowable at submit time
    // (pricing needs a quote to exist) fill themselves in on the first update.
    const message = buildJourneyMessage(journey, {
      kind: "survey_completed",
      // Keep the original framing so the message stays recognisable in
      // scrollback rather than mutating into a different-looking post — and
      // reuse the STORED question count, which is not derivable here. Rendering
      // 0 would silently downgrade "59 questions in 12 min" on the first update.
      questionCount: stored.question_count ?? 0,
      // Fill the rail up to what the server witnessed, so a consent gap cannot
      // render a step hollow that we know was reached.
      reachedFloor: state,
    });

    const ok = await updateJourneyMessage({
      channel: stored.channel,
      ts: stored.message_ts,
      text: message.text,
      blocks: message.blocks,
    });
    if (ok) await markState(submissionId, state);
  } catch (err) {
    logger.warn({ err, submissionId }, "journey-message: refresh failed");
  }
}
