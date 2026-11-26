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
 * answer's text, and the log says which survey it was, never the number.
 */

import {
  EXPERT_PHONE_KEY,
  EXPERT_QID,
  expertPhoneValid,
  isExpertYes,
} from "@features/survey/survey2/expert";
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

/** A reader's text as one bounded line Slack shows as text: no mention, no link, no new line. */
function shown(value: string | null, max: number): string {
  const line = (value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
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
    section(
      [
        `Name: *${shown(request.firstName, NAME_MAX)}*`,
        `Phone: *${shown(request.phone, PHONE_MAX)}*`,
        `Country (self-reported): *${shown(request.country, COUNTRY_MAX)}*`,
        `Email: ${codeSpan(maskEmail(request.email))}`,
      ].join("\n")
    ),
  ];
  if (team) blocks.push(context("An @loveiq.org address: no call needed."));
  return {
    text: `${team ? "Team test: " : ""}Free expert talk request from survey submission ${id}`,
    blocks,
  };
}

/** Post one request into #expert-talks. True once Slack has it; never throws. */
export async function postExpertTalkRequest(request: ExpertTalkRequest): Promise<boolean> {
  const { submissionId } = request;
  const channel = expertTalksChannel();
  if (!channel) {
    logger.warn(
      { submissionId },
      "Expert talk request not posted: SLACK_EXPERT_TALKS_CHANNEL_ID or the journey bot is unset"
    );
    return false;
  }
  try {
    const message = buildExpertTalkMessage(request);
    if (await postJourneyMessage({ channel, ...message })) return true;
    logger.error({ submissionId }, "Expert talk request not posted: Slack refused it");
  } catch (err) {
    logger.error(
      { submissionId, reason: err instanceof Error ? err.message : String(err) },
      "Expert talk request not posted"
    );
  }
  return false;
}
