/**
 * The survey reminders (canvas step 2, "Started the survey, didn't finish"): R1 an hour after
 * a reader stops, R2 on day 2, each in a free version and a pay-to-start one (sent to the
 * address the buyer paid with, its link the purchase's continue link).
 */

import { greetingName } from "@features/unlock-feedback/logic/audience";
import { ARCHETYPES, PRICE, QUESTIONS, minutesLeft } from "./facts";
import {
  INSIDE_TILES,
  button,
  e,
  heading,
  hiLine,
  joinText,
  minutesText,
  paragraphs,
  progressCard,
  shell,
  signOff,
  steps,
  textFooter,
  textSteps,
  tiles,
  type KitEmail,
  type Step,
} from "./kit";

/** What a pay-to-start buyer paid for: the initial report (EUR 1.99) or the full one. */
export type PaidOffer = "pre" | "full";

export interface SurveyReminderParams {
  firstName?: string | null;
  /** Questions answered in the saved draft. */
  answered: number;
  /** The free survey's link, or a buyer's continue link. */
  resumeUrl: string;
  siteUrl: string;
  unsubscribeUrl?: string;
  /** Set for a pay-to-start buyer: what opens when they finish. */
  paidOffer?: PaidOffer | null;
}

export const STARTED_REASON = "You get this email because you started the LoveIQ test.";
export const BOUGHT_REASON = "You get this email because you bought the LoveIQ test on loveiq.org.";

/** "Payment received · €1.99 for the survey and your initial report". */
export function paymentStep(offer: PaidOffer): Step {
  return {
    state: "done",
    title: "Payment received",
    detail:
      offer === "pre"
        ? `${PRICE} for the survey and your initial report`
        : "For your full LoveIQ report",
  };
}

/** What opens at the end: the Core Archetype, or the full report. */
export function opensWhat(offer: PaidOffer): string {
  return offer === "pre" ? "your Core Archetype" : "your full report";
}

function clampAnswered(answered: number): number {
  return Math.min(Math.max(0, Math.floor(answered)), QUESTIONS - 1);
}

/** R1, an hour after the last saved answer. */
export function surveyPausedEmail({
  firstName,
  answered: rawAnswered,
  resumeUrl,
  siteUrl,
  unsubscribeUrl,
  paidOffer = null,
}: SurveyReminderParams): KitEmail {
  const name = greetingName(firstName);
  const answered = clampAnswered(rawAnswered);
  const pct = Math.round((answered / QUESTIONS) * 100);
  const minutes = minutesLeft(answered);
  const subject = name
    ? `${name}, you’re ${pct}% through your LoveIQ test`
    : `You’re ${pct}% through your LoveIQ test`;
  const left = minutesText(minutes).replace(" left", "");
  const previewText = paidOffer
    ? `Your report is paid for. ${left} and it opens.`
    : `Your answers are saved. ${left} to your Core Archetype.`;
  const stopped = `stopped at question ${answered} of ${QUESTIONS}. Your answers so far are saved on this device, so you can carry on where you left off.`;
  const intro = paidOffer ? `Your report is paid for, and you ${stopped}` : `You ${stopped}`;
  const list: Step[] = paidOffer
    ? [
        paymentStep(paidOffer),
        { state: "next", title: "Take the survey", detail: minutesText(minutes) },
        {
          state: "todo",
          title: paidOffer === "pre" ? "Read your Core Archetype" : "Read your full report",
          detail: "Opens the moment you finish",
        },
      ]
    : [
        { state: "done", title: "Start the survey", detail: `${answered} questions answered` },
        {
          state: "next",
          title: "Finish the survey",
          detail: `${minutesText(minutes).replace(" left", "")}, anonymous by default`,
        },
        {
          state: "todo",
          title: "See your Core Archetype",
          detail: `Which of ${ARCHETYPES} archetypes leads for you`,
        },
      ];
  const reason = paidOffer ? BOUGHT_REASON : STARTED_REASON;
  const html = shell({
    siteUrl,
    title: subject,
    previewText,
    reason,
    unsubscribeUrl,
    rows: [
      heading("Your answers are saved."),
      paragraphs([`${e(hiLine(name))}<br>${e(intro)}`]),
      progressCard({ answered, total: QUESTIONS, minutesLeft: minutes }),
      steps(list),
      button({
        href: resumeUrl,
        label: "Continue my survey",
        notes: ["Same device, same link &middot; Anonymous by default"],
      }),
      signOff(),
    ],
  });
  const text = joinText([
    "Your answers are saved.",
    hiLine(name),
    intro,
    `${answered} of ${QUESTIONS} questions · ${minutesText(minutes)}`,
    ["Continue my survey (same device, same link):", resumeUrl],
    textSteps(list),
    textFooter(reason, unsubscribeUrl),
  ]);
  return { subject, html, text };
}

/** R2, two days after the last saved answer, once R1 went out. The last survey reminder. */
export function surveyStillSavedEmail({
  firstName,
  answered: rawAnswered,
  resumeUrl,
  siteUrl,
  unsubscribeUrl,
  paidOffer = null,
}: SurveyReminderParams): KitEmail {
  const name = greetingName(firstName);
  const answered = clampAnswered(rawAnswered);
  const minutes = minutesLeft(answered);
  const left = minutesText(minutes).replace(" left", "");
  const subject = "Your answers are still saved";
  const previewText = paidOffer
    ? `Your paid report is ${left.replace("About ", "").toLowerCase()} away. This is our last reminder.`
    : `Pick up at question ${answered + 1}. This is our last reminder.`;
  const intro = paidOffer
    ? `Your answers are still waiting where you left them, and your report is already paid for. ${left}, and ${opensWhat(paidOffer)} opens.`
    : `Your answers are still waiting where you left them. ${left}, and you’ll see which archetype leads for you.`;
  const reason = paidOffer ? BOUGHT_REASON : STARTED_REASON;
  const rows = [
    heading("Still saved, whenever you’re ready."),
    paragraphs([`${e(hiLine(name))}<br>${e(intro)}`]),
    progressCard({ answered, total: QUESTIONS, minutesLeft: minutes }),
    ...(paidOffer
      ? []
      : [tiles(siteUrl, "What you’ll find inside your Initial Report", INSIDE_TILES)]),
    button({
      href: resumeUrl,
      label: "Finish my survey",
      notes: ["This is our last reminder about this survey."],
    }),
    signOff(),
  ];
  const html = shell({ siteUrl, title: subject, previewText, reason, unsubscribeUrl, rows });
  const text = joinText([
    "Still saved, whenever you're ready.",
    hiLine(name),
    intro,
    `${answered} of ${QUESTIONS} questions · ${minutesText(minutes)}`,
    ["Finish my survey:", resumeUrl],
    "This is our last reminder about this survey.",
    textFooter(reason, unsubscribeUrl),
  ]);
  return { subject, html, text };
}
