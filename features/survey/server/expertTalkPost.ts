/**
 * #expert-talks: one post per survey that asks for a free talk with an expert (Survey 2.0's
 * 17004 answered Yes, with the phone number the expert calls; features/survey/survey2/expert.ts).
 *
 * LoveIQ Sync, 26 Nov 2026 (Marcus): "Just push it into a Slack channel. Mark and I then
 * decide." The channel is private: Mark, Marcus, Fatih, Eman and the journey bot. The post
 * carries the whole number, so they can call from Slack, and so it is the one team post that
 * shows an answer and an unmasked detail (privacy policy §3.6 and §7.7; LAWFUL_BASIS A27). The
 * email stays masked, as on every other post. The notification text, which phones show on the
 * lock screen, names only the survey's id.
 *
 * Off unless SLACK_EXPERT_TALKS_CHANNEL_ID is set (with the journey bot's SLACK_BOT_TOKEN +
 * SLACK_JOURNEY_CHANNEL_ID, and the bot invited to the channel). Never throws: the survey route
 * runs it after its response. A request it can't post stays in the database as the Yes
 * answer's text, and the log line names the survey, never the number. One gap it shares with
 * the #incoming-surveys post: a submit whose save outlives the route's wait answers 503 without
 * posting, and the retry that finds the saved survey posts nothing either.
 *
 * What decides a post is the answers, not the `survey_2` switch: only Survey 2.0 asks 17004,
 * and a 2.0 draft finished after the switch goes off must still reach the team.
 */

import {
  EXPERT_PHONE_KEY,
  EXPERT_QID,
  expertPhoneValid,
  isExpertYes,
} from "@features/survey/survey2/expert";
import { isNonProdDeploy } from "@shared/env/is-non-prod-deploy";
import { isStaffEmail } from "@shared/env/staff-email";
import logger from "@shared/observability/logger";
import { escapeSlack, maskEmail, type SlackBlock } from "@shared/observability/slack";
import { codeSpan, context, section } from "@shared/observability/slack-blocks";
import { isSlackBotConfigured, postJourneyMessage } from "@shared/observability/slack-bot";

/** The country question on the details page (15001), as the reader chose it. */
const COUNTRY_QID = "15001";

/** A reader's words go on one line each, and no line runs on: a number fits in 40. */
const NAME_MAX = 60;
const PHONE_MAX = 40;
const COUNTRY_MAX = 60;

export interface ExpertTalkRequest {
  submissionId: number;
  firstName: string;
  /** The raw address: the post masks it, and it tells a team run from a reader's. */
  email: string;
  /** As stored: the country code and the number as typed, "+49 151 2345678". */
  phone: string;
  /** The country the reader chose on the details page, or null without one. */
  country: string | null;
}

/**
 * The request a submitted run makes, or null: only a Yes on 17004 with a number that has the
 * six digits the screen asks for before Next. Every survey but 2.0 never asks the question.
 */
export function expertTalkRequestOf(input: {
  submissionId: number;
  firstName: string;
  email: string;
  answers: Record<string, unknown>;
}): ExpertTalkRequest | null {
  // Own entries only, as answersSchema reads them: no key can reach the object's prototype.
  const answers = new Map(Object.entries(input.answers));
  if (!isExpertYes(answers.get(EXPERT_QID))) return null;
  const phone = answers.get(EXPERT_PHONE_KEY);
  if (typeof phone !== "string" || !expertPhoneValid(phone)) return null;
  const country = answers.get(COUNTRY_QID);
  return {
    submissionId: input.submissionId,
    firstName: input.firstName,
    email: input.email,
    phone,
    country: typeof country === "string" && country.trim() ? country : null,
  };
}

/** The #expert-talks channel id, or null when the post is off. */
export function expertTalksChannel(): string | null {
  const channel = process.env.SLACK_EXPERT_TALKS_CHANNEL_ID?.trim();
  return channel && isSlackBotConfigured() ? channel : null;
}

/**
 * A reader's text as one bounded line: no new line, cut by characters (never half an emoji)
 * with "…" where it was cut. It goes into a verbatim block, so it can't mention or link.
 */
function shown(value: string | null, max: number): string {
  const chars = Array.from((value ?? "").replace(/\s+/g, " ").trim());
  const line = chars.length > max ? `${chars.slice(0, max - 1).join("")}…` : chars.join("");
  return line ? escapeSlack(line) : "—";
}

/** The post: who asked, the number to call, their country and the survey it came from. */
export function buildExpertTalkMessage(request: ExpertTalkRequest): {
  text: string;
  blocks: SlackBlock[];
} {
  const team = isStaffEmail(request.email);
  const id = `#${request.submissionId}`;
  const blocks: SlackBlock[] = [
    section(
      `:telephone_receiver: ${team ? "*Team test:* " : ""}*Free expert talk request* from survey submission *${id}*`
    ),
    // Verbatim: a plain "@here" in a name or a bare URL in the phone box stays text.
    section(
      [
        `Name: *${shown(request.firstName, NAME_MAX)}*`,
        `Phone: *${shown(request.phone, PHONE_MAX)}*`,
        `Country (self-reported): *${shown(request.country, COUNTRY_MAX)}*`,
        `Email: ${codeSpan(maskEmail(request.email))}`,
      ].join("\n"),
      { verbatim: true }
    ),
  ];
  // Most likely a colleague testing, but the email question invites any address, so the call
  // stays Mark's and Marcus's to make.
  if (team) blocks.push(context("An @loveiq.org address: most likely a team test."));
  return {
    text: `${team ? "Team test: " : ""}Free expert talk request from survey submission ${id}`,
    blocks,
  };
}

/** Post one request into #expert-talks. True once Slack has it; never throws. */
export async function postExpertTalkRequest(request: ExpertTalkRequest): Promise<boolean> {
  const { submissionId } = request;
  // The id goes in the message itself: #prod-alerts shows the message, not the log's fields.
  const what = `Expert talk request from survey submission #${submissionId} not posted`;
  const channel = expertTalksChannel();
  if (!channel) {
    // On production a missing setting drops every request, so it must reach #prod-alerts
    // (errors do, warnings don't); elsewhere the channel is unset on purpose.
    const log = isNonProdDeploy() ? logger.warn : logger.error;
    log.call(
      logger,
      { submissionId },
      `${what}: SLACK_EXPERT_TALKS_CHANNEL_ID or the journey bot is unset`
    );
    return false;
  }
  try {
    const message = buildExpertTalkMessage(request);
    if (await postJourneyMessage({ channel, ...message })) return true;
    logger.error({ submissionId }, `${what}: Slack refused it`);
  } catch (err) {
    logger.error({ submissionId, reason: err instanceof Error ? err.message : String(err) }, what);
  }
  return false;
}
