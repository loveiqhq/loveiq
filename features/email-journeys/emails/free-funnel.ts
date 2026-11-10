/**
 * The EUR 1.99 funnel's emails before a purchase ("1.99€ Unlock Initial Report" page of the
 * canvas): I1 report ready, I2 what €1.99 opens, I3 the gift, I4 gift still unopened.
 */

import { greetingName } from "@features/unlock-feedback/logic/audience";
import { chapterMap } from "./chapters";
import { ARCHETYPES, CREDIT, GUARANTEE_DAYS, PRICE } from "./facts";
import {
  EMAIL_IMAGES,
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
  steps,
  textFooter,
  textSteps,
  tiles,
  whyUnlock,
  type KitEmail,
  type Step,
} from "./kit";
import { getEmailImageBaseUrl } from "@shared/emails/site-url";

export interface ReaderEmailParams {
  firstName?: string | null;
  reportUrl: string;
  siteUrl: string;
  unsubscribeUrl?: string;
}

const FINISHED_REASON = "You get this email because you finished the LoveIQ test.";
const MATCHED = `We read the pattern in your answers and matched it to one of ${ARCHETYPES} archetypes. It describes how desire, connection and attraction tend to work for you.`;

function lockSrc(siteUrl: string): string {
  return `${getEmailImageBaseUrl(siteUrl)}${EMAIL_IMAGES.iconLock}`;
}

// ── I1 · Your report is ready ────────────────────────────────────────────────────────────

const I1_STEPS: Step[] = [
  { state: "done", title: "Take the survey", detail: "Done, every question answered" },
  { state: "done", title: "Get your result", detail: `Matched to 1 of ${ARCHETYPES} archetypes` },
  {
    state: "next",
    title: "Open your Core Archetype",
    detail: `${PRICE}, with a preview of every chapter`,
  },
  {
    state: "todo",
    title: "Unlock the full report",
    detail: `Every chapter in full, ${CREDIT} off with your Core Archetype`,
    chip: `${CREDIT} off`,
  },
];

/** I1, for a reader the EUR 1.99 gate will stop: it names the price up front. */
export function reportReadyEmail({
  firstName,
  reportUrl,
  siteUrl,
  unsubscribeUrl,
}: ReaderEmailParams): KitEmail {
  const name = greetingName(firstName);
  const subject = name ? `${name}, your Core Archetype is ready to open` : "Your archetype is in";
  const previewText = `It opens for ${PRICE}, with ${CREDIT} off the full report.`;
  const notes = [`${PRICE}, paid once &middot; ${GUARANTEE_DAYS}-day money-back guarantee`];
  const html = shell({
    siteUrl,
    title: subject,
    previewText,
    reason: FINISHED_REASON,
    unsubscribeUrl,
    rows: [
      heading("Your answers point to one archetype"),
      paragraphs([
        `${e(hiLine(name))}<br>You answered every question, which took honesty. It shows in your result.`,
        e(MATCHED),
        `Your Core Archetype opens for <strong style="color:#161021;">${PRICE}</strong>, paid once. Once unlocked, you will receive <strong style="color:#161021;">${CREDIT} off the full report</strong>.`,
      ]),
      archetypeCard(siteUrl),
      button({ href: reportUrl, label: "Open my Core Archetype", notes }),
      steps(I1_STEPS),
      tiles(siteUrl, "What you’ll find inside", INSIDE_TILES),
      signOff(),
    ],
  });
  const text = joinText([
    "Your answers point to one archetype",
    hiLine(name),
    `You answered every question, which took honesty. We matched your answers to one of ${ARCHETYPES} archetypes: the one that describes how desire, connection and attraction tend to work for you.`,
    `Your Core Archetype opens for ${PRICE}, paid once. It comes with ${CREDIT} off the full report.`,
    [`Open my Core Archetype (${PRICE}, ${GUARANTEE_DAYS}-day money-back guarantee):`, reportUrl],
    textSteps(I1_STEPS),
    textFooter(FINISHED_REASON, unsubscribeUrl),
  ]);
  return { subject, html, text };
}

// ── I2 · What €1.99 opens ────────────────────────────────────────────────────────────────

/** I2, 3 h after I1 to a reader who still hasn't paid the EUR 1.99 step. */
export function whatPriceOpensEmail({
  firstName,
  reportUrl,
  siteUrl,
  unsubscribeUrl,
}: ReaderEmailParams): KitEmail {
  const name = greetingName(firstName);
  const subject = `Here’s what ${PRICE} opens for you`;
  const previewText = "Your Core Archetype, three chapters in full and four more partly open.";
  const html = shell({
    siteUrl,
    title: subject,
    previewText,
    reason: FINISHED_REASON,
    unsubscribeUrl,
    rows: [
      heading(subject),
      paragraphs([
        `${e(hiLine(name))}<br>Your Initial Report is ready and your Core Archetype was determined. You can unlock both for just <strong style="color:#161021;">${PRICE}</strong>.`,
        "You will unlock your Core Archetype and your Summary, three chapters in full, and a first look at four featured chapters.",
        `It also gives you <strong style="color:#161021;">${CREDIT} off the full report</strong>.`,
      ]),
      archetypeCard(siteUrl),
      button({
        href: reportUrl,
        label: `Open my Core Archetype for ${PRICE}`,
        notes: [`Paid once, no subscription &middot; ${GUARANTEE_DAYS}-day money-back guarantee`],
      }),
      chapterMap(lockSrc(siteUrl), {
        freeTag: PRICE,
        freeLine: `With ${PRICE}, read these chapters in full.`,
        featuredLine: "The featured chapters open partly.",
        lockedLine: `Every other chapter shows what it covers. Unlock them later with ${CREDIT} off.`,
      }),
      signOff(),
    ],
  });
  const text = joinText([
    subject,
    hiLine(name),
    `Your Initial Report is ready and your Core Archetype was determined. You can unlock both for just ${PRICE}.`,
    `You will unlock your Core Archetype and your Summary, three chapters in full, and a first look at four featured chapters. It also gives you ${CREDIT} off the full report.`,
    [
      `Open my Core Archetype for ${PRICE} (paid once, ${GUARANTEE_DAYS}-day money-back guarantee):`,
      reportUrl,
    ],
    textFooter(FINISHED_REASON, unsubscribeUrl),
  ]);
  return { subject, html, text };
}

// ── I3 · Core Archetype gifted, I4 · gift still unopened ─────────────────────────────────

const GIFT_STEPS: Step[] = [
  { state: "done", title: "Take the survey", detail: "Done, every question answered" },
  { state: "done", title: "Get your Core Archetype", detail: "Unlocked for you, free" },
  {
    state: "next",
    title: "Read your initial report",
    detail: "Your Core Archetype, plus a preview of every chapter",
  },
  {
    state: "todo",
    title: "Unlock the full report",
    detail: `Every chapter in full, with your ${CREDIT} credit`,
    chip: `${CREDIT} credit`,
  },
];

export interface GiftEmailParams extends ReaderEmailParams {
  /** The survey was about a day ago, so the email can say "Yesterday". */
  answeredYesterday?: boolean;
  /** The minutes the reader spent on the questions, when known (surveyMinutesFromDuration). */
  surveyMinutes?: number | null;
}

/** The FREE-tagged map's legend, shared by I3 and U1. */
export const FREE_MAP_LEGEND = {
  freeTag: "FREE",
  freeLine: "Read through your <strong>free chapters</strong>.",
  featuredLine: "Explore our <strong>featured</strong> chapters.",
  lockedLine: `See the <strong>insights waiting for you</strong> in each chapter preview. Use <strong>your ${CREDIT} credit</strong> to unlock them anytime.`,
};

/** I3, the day-1 gift: the initial report unlocked for free, sent with the unlock. */
export function giftEmail({
  answeredYesterday = false,
  firstName,
  reportUrl,
  siteUrl,
  surveyMinutes = null,
  unsubscribeUrl,
}: GiftEmailParams): KitEmail {
  const name = greetingName(firstName);
  const subject = name
    ? `${name}, we unlocked your Core Archetype for you`
    : "We unlocked your Core Archetype for you";
  const previewText = `No payment needed. Your result is waiting, with ${CREDIT} off the full report.`;
  const invested =
    surveyMinutes !== null ? `invested ${surveyMinutes} minutes and answered` : "answered";
  const opening = answeredYesterday
    ? `Yesterday you ${invested} some very personal questions. Your result has been waiting ever since, and we’d rather you read it than leave it there.`
    : `You ${invested} some very personal questions. Your result has been waiting ever since, and we’d rather you read it than leave it there.`;
  const html = shell({
    siteUrl,
    title: subject,
    previewText,
    reason: FINISHED_REASON,
    unsubscribeUrl,
    rows: [
      heading("We unlocked your Core Archetype for you"),
      paragraphs([
        `${e(hiLine(name))}<br>${e(opening)}`,
        "So we’ve unlocked your Initial Report for you, including your Core Archetype. No payment, no catch.",
        e(MATCHED),
        `To learn even more about your Sexual Personality, use the <strong style="color:#161021;">${CREDIT} credit</strong> to unlock the full report.`,
      ]),
      archetypeCard(siteUrl),
      button({ href: reportUrl, label: "Read my Core Archetype" }),
      steps(GIFT_STEPS),
      chapterMap(lockSrc(siteUrl), FREE_MAP_LEGEND),
      whyUnlock(),
      signOff(),
    ],
  });
  const text = joinText([
    "We unlocked your Core Archetype for you",
    hiLine(name),
    opening,
    "So we've unlocked your Initial Report for you, including your Core Archetype. No payment, no catch.",
    `To learn even more about your Sexual Personality, use the ${CREDIT} credit to unlock the full report.`,
    ["Read my Core Archetype:", reportUrl],
    textSteps(GIFT_STEPS),
    textFooter(FINISHED_REASON, unsubscribeUrl),
  ]);
  return { subject, html, text };
}

/** I4, a day after I3, to a gifted reader who hasn't opened their report since. */
export function giftUnopenedEmail({
  firstName,
  reportUrl,
  siteUrl,
  unsubscribeUrl,
}: ReaderEmailParams): KitEmail {
  const name = greetingName(firstName);
  const subject = "Your Core Archetype is still unopened";
  const previewText = "We unlocked it for you yesterday. It’s one tap away.";
  const html = shell({
    siteUrl,
    title: subject,
    previewText,
    reason: FINISHED_REASON,
    unsubscribeUrl,
    rows: [
      heading("Your Core Archetype is still waiting."),
      paragraphs([
        `${e(hiLine(name))}<br>Yesterday we opened your Initial Report for you, free. It looks like you haven’t read it yet.`,
      ]),
      archetypeCard(siteUrl),
      button({ href: reportUrl, label: "Read my Core Archetype" }),
      steps(GIFT_STEPS),
      signOff(),
    ],
  });
  const text = joinText([
    "Your Core Archetype is still waiting.",
    hiLine(name),
    "Yesterday we opened your Initial Report for you, free. It looks like you haven't read it yet.",
    ["Read my Core Archetype:", reportUrl],
    textSteps(GIFT_STEPS),
    textFooter(FINISHED_REASON, unsubscribeUrl),
  ]);
  return { subject, html, text };
}
