/**
 * Trial sends of the email journeys' emails (features/email-journeys): each one as a reader
 * gets it, with sample data and a trial notice on top, to team addresses only. Mark reviews a
 * trial of every new or redesigned email before its switch goes on (#all-loveiq, 6 Nov 2026).
 *
 *   npx tsx scripts/email-trials.ts --to ec@loveiq.org,mo@loveiq.org             # dry run
 *   npx tsx scripts/email-trials.ts --to ec@loveiq.org --only i2,c1 --send      # sends
 *
 * Needs RESEND_API_KEY in the environment (`set -a; . ./.env.local; set +a`). Refuses any
 * address outside @loveiq.org. Links are sample links: they show the real shape and open no
 * real report. Tagged `stage=trial` with no submission, so no metric counts them.
 */

import { Resend } from "resend";
import { CARD_TOP, type KitEmail } from "@features/email-journeys/emails/kit";
import {
  giftEmail,
  giftUnopenedEmail,
  reportReadyEmail,
  whatPriceOpensEmail,
} from "@features/email-journeys/emails/free-funnel";
import {
  backIntoReportEmail,
  coreUnlockedEmail,
  fullUnlockedEmail,
  inviteReminderOneEmail,
  inviteReminderTwoEmail,
  withShareOpen,
} from "@features/email-journeys/emails/purchase";
import {
  fifteenMinutesEmail,
  lastSurveyReminderEmail,
  paymentReceivedEmail,
  surveyWaitingEmail,
} from "@features/email-journeys/emails/pay-to-start";
import {
  surveyPausedEmail,
  surveyStillSavedEmail,
} from "@features/email-journeys/emails/survey-reminders";
import { EMAIL_LINKS, tagEmailLink } from "@shared/emails/email-link";
import { escapeHtml } from "@shared/format/html-escape";

const SITE = "https://www.loveiq.org";
const UNSUB = `${SITE}/unsubscribe?trial=1`;
const report = (link: (typeof EMAIL_LINKS)[keyof typeof EMAIL_LINKS]) =>
  tagEmailLink(`${SITE}/report/trial-sample?from=email`, link);
const survey = (link: (typeof EMAIL_LINKS)[keyof typeof EMAIL_LINKS]) =>
  tagEmailLink(`${SITE}/survey`, link);
const continueLink = (link: (typeof EMAIL_LINKS)[keyof typeof EMAIL_LINKS]) =>
  tagEmailLink(`${SITE}/sexual-archetype/continue?t=trial-sample`, link);

interface Trial {
  key: string;
  code: string;
  name: string;
  when: string;
  build: () => KitEmail;
}

/** Every email, in the canvas's order, with when it goes out. */
export const TRIALS: Trial[] = [
  {
    key: "s2-199",
    code: "S2",
    name: "Payment received (€1.99)",
    when: "Pay to start: the moment the payment is confirmed, survey not started.",
    build: () =>
      paymentReceivedEmail({
        offer: "pre",
        continueUrl: continueLink(EMAIL_LINKS.payToStart),
        siteUrl: SITE,
        unsubscribeUrl: UNSUB,
      }),
  },
  {
    key: "s2-2999",
    code: "S2",
    name: "Payment received (€29.99)",
    when: "Pay to start: the moment the payment is confirmed, survey not started.",
    build: () =>
      paymentReceivedEmail({
        offer: "full",
        continueUrl: continueLink(EMAIL_LINKS.payToStart),
        siteUrl: SITE,
        unsubscribeUrl: UNSUB,
      }),
  },
  {
    key: "s3",
    code: "S3",
    name: "Your survey is waiting",
    when: "Pay to start: 24 h after paying, if the survey hasn't started.",
    build: () =>
      surveyWaitingEmail({
        offer: "pre",
        continueUrl: continueLink(EMAIL_LINKS.ptsSurveyWaiting),
        siteUrl: SITE,
        unsubscribeUrl: UNSUB,
      }),
  },
  {
    key: "s4",
    code: "S4",
    name: "Fifteen minutes, whenever suits you",
    when: "Pay to start: day 2, still not started, after S3.",
    build: () =>
      fifteenMinutesEmail({
        offer: "pre",
        continueUrl: continueLink(EMAIL_LINKS.ptsFifteenMinutes),
        siteUrl: SITE,
        unsubscribeUrl: UNSUB,
      }),
  },
  {
    key: "s5",
    code: "S5",
    name: "One last reminder",
    when: "Pay to start: day 4, still not started, after S4. The last one.",
    build: () =>
      lastSurveyReminderEmail({
        offer: "pre",
        continueUrl: continueLink(EMAIL_LINKS.ptsLastReminder),
        siteUrl: SITE,
        unsubscribeUrl: UNSUB,
        daysSincePayment: 4,
      }),
  },
  {
    key: "r1",
    code: "R1",
    name: "Survey paused",
    when: "1 h after a reader stops the survey (free survey).",
    build: () =>
      surveyPausedEmail({
        firstName: "Alex",
        answered: 37,
        resumeUrl: survey(EMAIL_LINKS.surveyPaused),
        siteUrl: SITE,
        unsubscribeUrl: UNSUB,
      }),
  },
  {
    key: "r1-pts",
    code: "R1",
    name: "Survey paused (pay to start)",
    when: "1 h after a buyer stops the survey, to the address they paid with.",
    build: () =>
      surveyPausedEmail({
        firstName: "Alex",
        answered: 37,
        resumeUrl: continueLink(EMAIL_LINKS.ptsSurveyPaused),
        siteUrl: SITE,
        unsubscribeUrl: UNSUB,
        paidOffer: "pre",
      }),
  },
  {
    key: "r2",
    code: "R2",
    name: "Your answers are still saved",
    when: "Day 2 after the last saved answer, after R1, still not finished. The last one.",
    build: () =>
      surveyStillSavedEmail({
        firstName: "Alex",
        answered: 37,
        resumeUrl: survey(EMAIL_LINKS.surveyPaused2),
        siteUrl: SITE,
        unsubscribeUrl: UNSUB,
      }),
  },
  {
    key: "r2-pts",
    code: "R2",
    name: "Your answers are still saved (pay to start)",
    when: "Day 2 after the buyer's last saved answer, after R1, to the paid address.",
    build: () =>
      surveyStillSavedEmail({
        firstName: "Alex",
        answered: 37,
        resumeUrl: continueLink(EMAIL_LINKS.ptsSurveyPaused2),
        siteUrl: SITE,
        unsubscribeUrl: UNSUB,
        paidOffer: "pre",
      }),
  },
  {
    key: "i1",
    code: "I1",
    name: "Your report is ready",
    when: "The moment a reader the €1.99 step will stop submits the survey.",
    build: () =>
      reportReadyEmail({
        firstName: "Alex",
        reportUrl: report(EMAIL_LINKS.reportReady),
        siteUrl: SITE,
        unsubscribeUrl: UNSUB,
      }),
  },
  {
    key: "i2",
    code: "I2",
    name: "What €1.99 opens",
    when: "3 h after I1, if they still haven't paid.",
    build: () =>
      whatPriceOpensEmail({
        firstName: "Alex",
        reportUrl: report(EMAIL_LINKS.whatPriceOpens),
        siteUrl: SITE,
        unsubscribeUrl: UNSUB,
      }),
  },
  {
    key: "i3",
    code: "I3",
    name: "Core Archetype gift (E07)",
    when: "Day 1 after the survey, to the gift group (80%) of readers who didn't pay.",
    build: () =>
      giftEmail({
        firstName: "Alex",
        reportUrl: report(EMAIL_LINKS.initialGift),
        siteUrl: SITE,
        unsubscribeUrl: UNSUB,
        answeredYesterday: true,
        surveyMinutes: 14,
      }),
  },
  {
    key: "i4",
    code: "I4",
    name: "Gift still unopened",
    when: "A day after I3, if they haven't opened their report since.",
    build: () =>
      giftUnopenedEmail({
        firstName: "Alex",
        reportUrl: report(EMAIL_LINKS.giftUnopened),
        siteUrl: SITE,
        unsubscribeUrl: UNSUB,
      }),
  },
  {
    key: "u1",
    code: "U1",
    name: "Core Archetype unlocked (€1.99)",
    when: "The moment a reader pays €1.99, or a €1.99 pay-to-start buyer finishes the survey.",
    build: () =>
      coreUnlockedEmail({
        firstName: "Alex",
        reportUrl: report(EMAIL_LINKS.receipt),
        siteUrl: SITE,
        unsubscribeUrl: UNSUB,
      }),
  },
  {
    key: "c1",
    code: "C1",
    name: "Full report unlocked",
    when: "The moment a full-report purchase succeeds, or a €29.99 buyer finishes the survey.",
    build: () =>
      fullUnlockedEmail({
        firstName: "Alex",
        reportUrl: report(EMAIL_LINKS.receipt),
        shareUrl: withShareOpen(report(EMAIL_LINKS.receipt)),
        siteUrl: SITE,
        unsubscribeUrl: UNSUB,
      }),
  },
  {
    key: "c2",
    code: "C2",
    name: "Back into your report",
    when: "Day 1 after a full-report purchase.",
    build: () =>
      backIntoReportEmail({
        firstName: "Alex",
        reportUrl: report(EMAIL_LINKS.backIntoReport),
        siteUrl: SITE,
        unsubscribeUrl: UNSUB,
      }),
  },
  {
    key: "c3",
    code: "C3",
    name: "Invite reminder 1",
    when: "Day 3 after a full-report purchase, if they haven't invited anyone.",
    build: () =>
      inviteReminderOneEmail({
        firstName: "Alex",
        inviteUrl: tagEmailLink(
          `${SITE}/report/trial-sample?invite=1&from=email`,
          EMAIL_LINKS.inviteReminder1
        ),
        siteUrl: SITE,
        unsubscribeUrl: UNSUB,
      }),
  },
  {
    key: "c4",
    code: "C4",
    name: "Invite reminder 2",
    when: "Day 5, still no invite. The last invite reminder.",
    build: () =>
      inviteReminderTwoEmail({
        firstName: "Alex",
        inviteUrl: tagEmailLink(
          `${SITE}/report/trial-sample?invite=1&from=email`,
          EMAIL_LINKS.inviteReminder2
        ),
        siteUrl: SITE,
        unsubscribeUrl: UNSUB,
      }),
  },
];

/** The trial notice: which email, when it goes, and that the data and links are samples. */
export function withTrialNotice(
  trial: Trial,
  email: KitEmail,
  index: number,
  total: number
): KitEmail {
  const notice = `<tr><td style="padding:16px 40px 0;"><div style="padding:12px 16px; border-radius:12px; background-color:#fff7e6; border:1px solid #f2d39b; font-family:Arial, Helvetica, sans-serif; font-size:13px; line-height:19px; color:#5c4410;"><strong>Trial ${index}/${total} · ${escapeHtml(trial.code)} · ${escapeHtml(trial.name)}</strong><br>${escapeHtml(trial.when)}<br>Sample data (Alex). Buttons open sample links, not a real report.</div></td></tr>`;
  if (!email.html.includes(CARD_TOP)) throw new Error(`${trial.key}: no card-top marker`);
  return {
    subject: `[Trial ${trial.code}] ${email.subject}`,
    html: email.html.replace(CARD_TOP, notice),
    text: `TRIAL ${index}/${total} · ${trial.code} · ${trial.name}\n${trial.when}\nSample data (Alex). Links are sample links.\n\n${email.text}`,
  };
}

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? (process.argv[i + 1] ?? null) : null;
}

async function main(): Promise<void> {
  const to = (arg("to") ?? "")
    .split(",")
    .map((a) => a.trim().toLowerCase())
    .filter(Boolean);
  if (to.length === 0) throw new Error("--to <addresses> is required");
  const outside = to.filter((a) => !/^[^@\s]+@loveiq\.org$/.test(a));
  if (outside.length) throw new Error(`team addresses only (@loveiq.org): ${outside.join(", ")}`);
  const only = (arg("only") ?? "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
  const unknown = only.filter((k) => !TRIALS.some((t) => t.key === k));
  if (unknown.length)
    throw new Error(
      `unknown email: ${unknown.join(", ")} (keys: ${TRIALS.map((t) => t.key).join(", ")})`
    );
  const picked = only.length ? TRIALS.filter((t) => only.includes(t.key)) : TRIALS;
  const send = process.argv.includes("--send");
  const resend = send ? new Resend(process.env.RESEND_API_KEY) : null;
  if (send && !process.env.RESEND_API_KEY) throw new Error("RESEND_API_KEY is not set");

  for (const [i, trial] of picked.entries()) {
    const email = withTrialNotice(trial, trial.build(), i + 1, picked.length);
    for (const address of to) {
      if (!resend) {
        console.log(`dry run · ${address} · ${email.subject} · ${Buffer.byteLength(email.html)} B`);
        continue;
      }
      const { data, error } = await resend.emails.send({
        from: process.env.RESEND_FROM || "LoveIQ <hello@send.loveiq.org>",
        to: address,
        replyTo: process.env.RESEND_REPLY_TO || "hello@loveiq.org",
        subject: email.subject,
        html: email.html,
        text: email.text,
        tags: [{ name: "stage", value: "trial" }],
      });
      console.log(
        error
          ? `FAILED · ${address} · ${email.subject} · ${error.message}`
          : `sent · ${address} · ${email.subject} · ${data?.id}`
      );
      await new Promise((r) => setTimeout(r, 600));
    }
  }
}

if (process.argv[1]?.endsWith("email-trials.ts")) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
