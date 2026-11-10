/**
 * Pay to start before the survey (canvas step 1, "Paid, survey not started"): S2 the payment
 * received, in a EUR 1.99 and a EUR 29.99 version, then S3 (24 h), S4 (day 2) and S5 (day 4,
 * the last) while the survey has not started. One email per step for both offers: only the
 * line about what opens at the end changes.
 */

import { CHAPTER_COUNT } from "./chapters";
import { CREDIT, QUESTIONS, SURVEY_MINUTES } from "./facts";
import {
  INSIDE_TILES,
  archetypeCard,
  button,
  e,
  heading,
  hiLine,
  joinText,
  paragraphs,
  shell,
  signOff,
  smallNote,
  steps,
  textFooter,
  textSteps,
  tiles,
  type KitEmail,
  type Step,
} from "./kit";
import { BOUGHT_REASON, opensWhat, paymentStep, type PaidOffer } from "./survey-reminders";

export interface PayToStartEmailParams {
  offer: PaidOffer;
  continueUrl: string;
  siteUrl: string;
  unsubscribeUrl?: string;
}

const START_NOTES = [
  `Anonymous by default &middot; About ${SURVEY_MINUTES} minutes &middot; No account required`,
];
const KEEP_HTML =
  "<strong>Keep this email.</strong> This button brings you back to your test. Stopped halfway? Open it again on the same device and carry on where you left off.";
const KEEP_TEXT =
  "Keep this email. This link brings you back to your test. Stopped halfway? Open it again on the same device and carry on where you left off.";

function takeStep(): Step {
  return {
    state: "next",
    title: "Take the survey",
    detail: `About ${SURVEY_MINUTES} minutes, anonymous by default`,
  };
}

function readStep(offer: PaidOffer, initialDetail: string): Step {
  return offer === "pre"
    ? { state: "todo", title: "Read your Core Archetype", detail: initialDetail }
    : {
        state: "todo",
        title: "Read your full report",
        detail: `${CHAPTER_COUNT} chapters, every part in full`,
      };
}

/** S2, the moment the payment is confirmed, survey not started. */
export function paymentReceivedEmail({
  offer,
  continueUrl,
  siteUrl,
  unsubscribeUrl,
}: PayToStartEmailParams): KitEmail {
  const pre = offer === "pre";
  const subject = pre
    ? "Payment received. Your survey is ready when you are"
    : "Payment received. Your full report is waiting for you.";
  const previewText = pre
    ? "Payment received. Finish the test to unlock your Core Archetype now."
    : "Finish the survey and every chapter opens straight away.";
  const list: Step[] = pre
    ? [
        {
          state: "done",
          title: "Payment received",
          detail: "For the LoveIQ Survey & Initial Report",
        },
        takeStep(),
        {
          state: "todo",
          title: "Read your initial report",
          detail: "Your Core Archetype, plus a preview of the full report",
        },
        {
          state: "todo",
          title: "Unlock the full report",
          detail: `Every chapter in full, with your ${CREDIT} credit`,
          chip: `${CREDIT} credit`,
        },
      ]
    : [
        { state: "done", title: "Payment received", detail: "For your full LoveIQ report" },
        takeStep(),
        readStep("full", ""),
      ];
  const body = pre
    ? [
        "Thank you for your purchase.<br>You have unlocked the LoveIQ Survey.",
        "After taking the LoveIQ survey, you will receive your Initial Report that includes your Core Archetype.",
        `To learn even more about your Sexual Personality, use the <strong style="color:#161021;">${CREDIT} credit</strong> to unlock the full report.`,
      ]
    : [
        "Thank you for your purchase.",
        "Your full LoveIQ report is paid for. Take the survey, and every chapter opens as soon as you finish.",
      ];
  const reason = pre
    ? `${BOUGHT_REASON} Your receipt comes separately from Stripe.`
    : BOUGHT_REASON;
  const html = shell({
    siteUrl,
    title: subject,
    previewText,
    reason,
    unsubscribeUrl,
    rows: [
      heading(
        pre
          ? "Finish the survey to unlock your Core Archetype."
          : "Finish the survey to open your full report."
      ),
      paragraphs(body),
      steps(list),
      button({ href: continueUrl, label: "Start my test", notes: START_NOTES }),
      smallNote(KEEP_HTML),
      signOff(),
    ],
  });
  const text = joinText([
    pre
      ? "Finish the survey to unlock your Core Archetype."
      : "Finish the survey to open your full report.",
    pre
      ? "Thank you for your purchase. You have unlocked the LoveIQ Survey. After taking it, you will receive your Initial Report that includes your Core Archetype."
      : "Thank you for your purchase. Your full LoveIQ report is paid for. Take the survey, and every chapter opens as soon as you finish.",
    pre
      ? `To learn even more about your Sexual Personality, use the ${CREDIT} credit to unlock the full report.`
      : null,
    [
      `Start my test (anonymous by default, about ${SURVEY_MINUTES} minutes, no account required):`,
      continueUrl,
    ],
    KEEP_TEXT,
    textSteps(list),
    textFooter(reason, unsubscribeUrl),
  ]);
  return { subject, html, text };
}

/** S3, 24 h after the payment, the survey not started. */
export function surveyWaitingEmail({
  offer,
  continueUrl,
  siteUrl,
  unsubscribeUrl,
}: PayToStartEmailParams): KitEmail {
  const subject = "Your LoveIQ survey is still waiting";
  const previewText = `You’ve paid. ${QUESTIONS} questions, about ${SURVEY_MINUTES} minutes, and your report opens.`;
  const list: Step[] = [
    paymentStep(offer),
    takeStep(),
    readStep(offer, `Your initial report, with ${CREDIT} off the full report`),
  ];
  const lines = [
    "You paid for your LoveIQ report yesterday, and the survey is ready when you are.",
    `It’s ${QUESTIONS} questions, about ${SURVEY_MINUTES} minutes, and you can stop and pick it up again on the same device.`,
  ];
  const html = shell({
    siteUrl,
    title: subject,
    previewText,
    reason: BOUGHT_REASON,
    unsubscribeUrl,
    rows: [
      heading("Your survey is still waiting."),
      paragraphs([`${e(hiLine(null))}<br>${e(lines[0]!)}`, e(lines[1]!)]),
      steps(list),
      button({
        href: continueUrl,
        label: "Start my survey",
        notes: ["Your answers are saved as you go"],
      }),
      signOff(),
    ],
  });
  const text = joinText([
    "Your survey is still waiting.",
    hiLine(null),
    lines.join(" "),
    ["Start my survey:", continueUrl],
    textSteps(list),
    textFooter(BOUGHT_REASON, unsubscribeUrl),
  ]);
  return { subject, html, text };
}

/** S4, day 2, still not started and S3 went out. */
export function fifteenMinutesEmail({
  offer,
  continueUrl,
  siteUrl,
  unsubscribeUrl,
}: PayToStartEmailParams): KitEmail {
  const subject = "Fifteen minutes, whenever it suits you";
  const previewText = "How the survey works, and what your report shows you.";
  const opens = `${opensWhat(offer).charAt(0).toUpperCase()}${opensWhat(offer).slice(1)} opens the moment you finish`;
  const lines = [
    "Your survey is paid for and still waiting.",
    `It’s ${QUESTIONS} questions, about ${SURVEY_MINUTES} minutes, and you can stop and pick it up again on the same device.`,
  ];
  const html = shell({
    siteUrl,
    title: subject,
    previewText,
    reason: BOUGHT_REASON,
    unsubscribeUrl,
    rows: [
      heading("Fifteen minutes, whenever suits you"),
      paragraphs([`${e(hiLine(null))}<br>${e(lines[0]!)}`, e(lines[1]!)]),
      tiles(siteUrl, "What you’ll find inside", INSIDE_TILES),
      button({ href: continueUrl, label: "Start my survey", notes: [e(opens)] }),
      signOff(),
    ],
  });
  const text = joinText([
    "Fifteen minutes, whenever suits you",
    hiLine(null),
    lines.join(" "),
    [`Start my survey (${opens.toLowerCase()}):`, continueUrl],
    textFooter(BOUGHT_REASON, unsubscribeUrl),
  ]);
  return { subject, html, text };
}

export interface LastReminderParams extends PayToStartEmailParams {
  /** Whole days since the payment (4 on time). */
  daysSincePayment: number;
}

/** S5, day 4, the last: we stop after this. */
export function lastSurveyReminderEmail({
  offer,
  continueUrl,
  siteUrl,
  unsubscribeUrl,
  daysSincePayment,
}: LastReminderParams): KitEmail {
  const subject =
    offer === "pre"
      ? "Your Core Archetype is still waiting for you"
      : "Your full LoveIQ report is still waiting for you";
  const previewText = `It’s paid for. ${SURVEY_MINUTES} minutes, and you’ll see what drives your desire.`;
  const days = Math.max(2, Math.floor(daysSincePayment));
  const words = ["", "", "two", "three", "four", "five", "six", "seven"];
  const ago = `${words[days] ?? days} days ago`;
  const opens = `${opensWhat(offer).charAt(0).toUpperCase()}${opensWhat(offer).slice(1)} opens the moment you finish`;
  const intro = `You bought the LoveIQ test ${ago}, and your survey is still waiting. It’s paid for, and it takes about ${SURVEY_MINUTES} minutes whenever you have them.`;
  const html = shell({
    siteUrl,
    title: subject,
    previewText,
    reason: BOUGHT_REASON,
    unsubscribeUrl,
    rows: [
      heading("Your report is still waiting for you."),
      paragraphs([`${e(hiLine(null))}<br>${e(intro)}`]),
      archetypeCard(siteUrl),
      button({
        href: continueUrl,
        label: "Start my survey",
        notes: [`About ${SURVEY_MINUTES} minutes &middot; ${e(opens)}`],
      }),
      smallNote("This is the last reminder we send about your survey."),
      signOff(),
    ],
  });
  const text = joinText([
    "Your report is still waiting for you.",
    hiLine(null),
    intro,
    [`Start my survey (${opens.toLowerCase()}):`, continueUrl],
    "This is the last reminder we send about your survey.",
    textFooter(BOUGHT_REASON, unsubscribeUrl),
  ]);
  return { subject, html, text };
}
