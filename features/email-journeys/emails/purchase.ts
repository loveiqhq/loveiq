/**
 * The emails after a purchase: U1 the Core Archetype unlocked (EUR 1.99), C1 the full report
 * unlocked, C2 back into your report (day 1), C3 and C4 the invite reminders (days 3 and 5).
 */

import { greetingName } from "@features/unlock-feedback/logic/audience";
import { getEmailImageBaseUrl } from "@shared/emails/site-url";
import {
  PART_QUESTIONS,
  chapterMap,
  featuredChapters,
  initialReportMap,
  questionsMap,
} from "./chapters";
import { ARCHETYPES, CREDIT, PRICE } from "./facts";
import { FREE_MAP_LEGEND } from "./free-funnel";
import {
  C,
  EMAIL_IMAGES,
  INSIDE_TILES,
  SANS,
  SERIF,
  archetypeCard,
  button,
  e,
  heading,
  hiLine,
  joinText,
  panel,
  paragraphs,
  row,
  sectionTitle,
  shell,
  signOff,
  smallNote,
  steps,
  textFooter,
  textSteps,
  tiles,
  whyUnlock,
  type KitEmail,
  type Step,
} from "./kit";

export interface PurchaseEmailParams {
  firstName?: string | null;
  reportUrl: string;
  siteUrl: string;
  unsubscribeUrl?: string;
}

const INITIAL_REASON = "You get this email because you bought your LoveIQ initial report.";
export const FULL_REASON = "You get this email because you bought your LoveIQ full report.";

// ── U1 · Core Archetype unlocked ─────────────────────────────────────────────────────────

const U1_STEPS: Step[] = [
  { state: "done", title: "Take the survey", detail: "Done, every question answered" },
  { state: "done", title: "Get your Core Archetype", detail: `Paid ${PRICE}, initial report open` },
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

/**
 * U1: a reader paid EUR 1.99 in their report, or a EUR 1.99 pay-to-start buyer finished the
 * survey. The copy works for both: it thanks them without saying when they paid.
 */
export function coreUnlockedEmail({
  firstName,
  reportUrl,
  siteUrl,
  unsubscribeUrl,
}: PurchaseEmailParams): KitEmail {
  const name = greetingName(firstName);
  const subject = name
    ? `${name}, your Core Archetype was identified`
    : "Your Core Archetype was identified";
  const previewText = `Your Core Archetype is open, with a preview of every chapter and ${CREDIT} off the rest.`;
  const lock = `${getEmailImageBaseUrl(siteUrl)}${EMAIL_IMAGES.iconLock}`;
  const html = shell({
    siteUrl,
    title: subject,
    previewText,
    reason: INITIAL_REASON,
    unsubscribeUrl,
    rows: [
      heading("Your Core Archetype is ready to read"),
      paragraphs([
        `${e(hiLine(name))}<br>Thank you for your purchase. You have unlocked your Initial Report, including your Core Archetype.`,
        `We read the pattern in your answers and matched it to one of ${ARCHETYPES} archetypes. It describes how desire, connection and attraction tend to work for you.`,
        `To learn even more about your Sexual Personality, use the <strong style="color:#161021;">${CREDIT} credit</strong> to unlock the full report.`,
      ]),
      archetypeCard(siteUrl),
      button({ href: reportUrl, label: "Read my Core Archetype" }),
      steps(U1_STEPS),
      chapterMap(lock, FREE_MAP_LEGEND),
      whyUnlock(),
      signOff(),
    ],
  });
  const text = joinText([
    "Your Core Archetype is ready to read",
    hiLine(name),
    "Thank you for your purchase. You have unlocked your Initial Report, including your Core Archetype.",
    `To learn even more about your Sexual Personality, use the ${CREDIT} credit to unlock the full report.`,
    ["Read my Core Archetype:", reportUrl],
    textSteps(U1_STEPS),
    textFooter(INITIAL_REASON, unsubscribeUrl),
  ]);
  return { subject, html, text };
}

// ── C1 · Full report unlocked ────────────────────────────────────────────────────────────

/** The report link with its share window open (`share=1`, read by the report page). */
export function withShareOpen(reportUrl: string): string {
  const url = new URL(reportUrl);
  url.searchParams.set("share", "1");
  return url.toString();
}

export interface FullUnlockedParams extends PurchaseEmailParams {
  /** The report with its share window open (`?share=1`). */
  shareUrl: string;
}

/** C1: a full-report purchase, or a EUR 29.99 pay-to-start buyer who finished the survey. */
export function fullUnlockedEmail({
  firstName,
  reportUrl,
  shareUrl,
  siteUrl,
  unsubscribeUrl,
}: FullUnlockedParams): KitEmail {
  const name = greetingName(firstName);
  const subject = name
    ? `${name}, your full report is open. Here’s where to start`
    : "Your full report is open. Here’s where to start";
  const previewText =
    "Every chapter is yours now. Three good places to begin, and two people you can share it with.";
  const keep = "Keep this email. Your link brings you back to your report whenever you want it.";
  const html = shell({
    siteUrl,
    title: subject,
    previewText,
    reason: FULL_REASON,
    unsubscribeUrl,
    rows: [
      heading("Every chapter is yours now"),
      paragraphs([
        `${e(hiLine(name))}<br>Thank you for trusting us with something this personal. Your full report is open.`,
        "It reads the patterns in your answers across every dimension we measure: your archetype mix, core motivation, relational stage, desire drivers, attachment style and more.",
      ]),
      button({ href: reportUrl, label: "Open my full report", notes: [keep] }),
      panel(siteUrl, {
        icon: "iconShare",
        kicker: "Share your report",
        title: "Share it with up to two people you trust",
        body: "Some of the best conversations start with “this part sounds like me”.",
        href: shareUrl,
        cta: "Share my report",
      }),
      questionsMap(),
      signOff(),
    ],
  });
  const text = joinText([
    "Every chapter is yours now",
    hiLine(name),
    "Thank you for trusting us with something this personal. Your full report is open.",
    ["Open my full report:", reportUrl],
    keep,
    [
      "SHARE YOUR REPORT",
      "Share it with up to two people you trust. Some of the best conversations start with “this part sounds like me”.",
      shareUrl,
    ],
    textFooter(FULL_REASON, unsubscribeUrl),
  ]);
  return { subject, html, text };
}

// ── C2 · Back into your report ───────────────────────────────────────────────────────────

/** A report link that opens at one chapter (the report reads the hash). */
export function chapterLink(reportUrl: string, chapterId: string): string {
  const url = new URL(reportUrl);
  url.hash = chapterId;
  return url.toString();
}

/** The three picks: the first three featured chapters, with the question each answers. */
export function backIntoReportPicks(): Array<{
  id: string;
  label: string;
  part: string;
  question: string;
}> {
  const partOf = new Map<string, { part: string; label: string }>();
  for (const p of initialReportMap()) for (const r of p.rows) partOf.set(r.id, p);
  return featuredChapters()
    .slice(0, 3)
    .map((r) => {
      const p = partOf.get(r.id)!;
      return {
        id: r.id,
        label: r.label,
        part: `${p.part} · ${p.label}`,
        question: PART_QUESTIONS[p.part]?.title ?? r.label,
      };
    });
}

/** C2, a day after a full-report purchase. */
export function backIntoReportEmail({
  firstName,
  reportUrl,
  siteUrl,
  unsubscribeUrl,
}: PurchaseEmailParams): KitEmail {
  const name = greetingName(firstName);
  const subject = "Have you read the part about you yet?";
  const previewText = "Three chapters readers come back to, and where to find them.";
  const picks = backIntoReportPicks();
  const cards = picks
    .map(
      (p) => `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${C.line}; border-radius:16px; margin:0 0 12px;">
  <tr><td style="padding:16px 20px;">
    <div style="font-family:${SANS}; font-size:10px; font-weight:700; letter-spacing:0.8px; text-transform:uppercase; line-height:14px; color:${C.partRed};">${e(p.part)}</div>
    <div style="padding-top:6px; font-family:${SERIF}; font-size:17px; line-height:23px; font-weight:500; color:${C.ink};">${e(p.question)}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:10px;"><tr>
      <td style="font-family:${SANS}; font-size:13px; line-height:20px; font-weight:700; color:${C.body};">${e(p.label)}</td>
      <td align="right"><a href="${e(chapterLink(reportUrl, p.id))}" style="font-family:${SANS}; font-size:13px; line-height:20px; font-weight:700; color:${C.deepViolet}; text-decoration:none;">Read&nbsp;&rarr;</a></td>
    </tr></table>
  </td></tr>
</table>`
    )
    .join("");
  const keep =
    "<strong>Keep this email.</strong> Your link brings you back to your report whenever you want it.";
  const html = shell({
    siteUrl,
    title: subject,
    previewText,
    reason: FULL_REASON,
    unsubscribeUrl,
    rows: [
      heading("Pick up where you left off"),
      paragraphs([
        `${e(hiLine(name))}<br>Your full report is open. These are the chapters readers say sound most like them.`,
      ]),
      row(`${sectionTitle("Where readers find themselves")}${cards}`),
      button({ href: reportUrl, label: "Continue reading", notes: [keep] }),
      signOff(),
    ],
  });
  const text = joinText([
    "Pick up where you left off",
    hiLine(name),
    "Your full report is open. These are the chapters readers say sound most like them.",
    [
      "WHERE READERS FIND THEMSELVES",
      ...picks.map((p, i) => `${i + 1}. ${p.label}: ${p.question}`),
    ],
    ["Continue reading:", reportUrl],
    "Keep this email. Your link brings you back to your report whenever you want it.",
    textFooter(FULL_REASON, unsubscribeUrl),
  ]);
  return { subject, html, text };
}

// ── C3, C4 · Invite reminders ────────────────────────────────────────────────────────────

export interface InviteReminderParams {
  firstName?: string | null;
  inviteUrl: string;
  siteUrl: string;
  unsubscribeUrl?: string;
}

/** C3, day 3 after a full-report (or All 14) purchase, if they haven't invited anyone. */
export function inviteReminderOneEmail({
  firstName,
  inviteUrl,
  siteUrl,
  unsubscribeUrl,
}: InviteReminderParams): KitEmail {
  const name = greetingName(firstName);
  const subject = "Could this help a friend?";
  const previewText = "Someone you know might like to read theirs too.";
  const intro =
    "If your report put words to something you’d felt for a while, there may be someone you know who’d like to find theirs.";
  const html = shell({
    siteUrl,
    title: subject,
    previewText,
    reason: FULL_REASON,
    unsubscribeUrl,
    rows: [
      heading(subject),
      paragraphs([`${e(hiLine(name))}<br>${e(intro)}`]),
      panel(siteUrl, {
        icon: "iconRefer",
        kicker: "Refer a friend",
        title: "Invite a friend to take the test",
        body: "They get their own report. Yours stays private: they don’t see what it says.",
        href: inviteUrl,
        cta: "Invite a friend",
      }),
      tiles(siteUrl, "What you’ll find inside", INSIDE_TILES),
      signOff(),
    ],
  });
  const text = joinText([
    subject,
    hiLine(name),
    intro,
    [
      "Invite a friend to take the test. They get their own report. Yours stays private: they don't see what it says.",
      inviteUrl,
    ],
    textFooter(FULL_REASON, unsubscribeUrl),
  ]);
  return { subject, html, text };
}

/** C4, day 5, still no invite: the last invite reminder. */
export function inviteReminderTwoEmail({
  firstName,
  inviteUrl,
  siteUrl,
  unsubscribeUrl,
}: InviteReminderParams): KitEmail {
  const name = greetingName(firstName);
  const subject = "Why keep this to yourself?";
  const previewText = "One invite, and someone close to you gets their own report.";
  const intro =
    "Some of the best conversations start with “this part sounds like me”. Inviting a partner or a friend makes those conversations easier.";
  const html = shell({
    siteUrl,
    title: subject,
    previewText,
    reason: FULL_REASON,
    unsubscribeUrl,
    rows: [
      heading(subject),
      paragraphs([`${e(hiLine(name))}<br>${e(intro)}`]),
      panel(siteUrl, {
        icon: "iconRefer",
        kicker: "Refer a friend",
        title: "One invite, their own report",
        body: "They take the test on their own. Your answers and your report stay yours.",
        href: inviteUrl,
        cta: "Invite a friend",
      }),
      smallNote("This is the last reminder we send about invites."),
      signOff(),
    ],
  });
  const text = joinText([
    subject,
    hiLine(name),
    intro,
    [
      "One invite, their own report. They take the test on their own. Your answers and your report stay yours.",
      inviteUrl,
    ],
    "This is the last reminder we send about invites.",
    textFooter(FULL_REASON, unsubscribeUrl),
  ]);
  return { subject, html, text };
}
