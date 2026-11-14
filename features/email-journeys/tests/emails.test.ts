import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { WIZARD_DRAWER } from "@features/survey/ui/wizard/wizardContent";
import { INITIAL_UNLOCK_CREDIT_CENTS } from "@features/report/logic/initialUnlock";
import { INITIAL_UNLOCK_PRICE_CENTS } from "@features/report/logic/initialUnlockGate";
import { QUESTIONS_ASKED } from "@features/report/logic/reportFacts";
import { EMAIL_IMAGES, buttonWidth } from "../emails/kit";
import { CHAPTER_COUNT, PART_COUNT, initialReportMap } from "../emails/chapters";
import { CREDIT, PRICE, eur, minutesLeft } from "../emails/facts";
import {
  giftEmail,
  giftUnopenedEmail,
  reportReadyEmail,
  whatPriceOpensEmail,
} from "../emails/free-funnel";
import {
  backIntoReportEmail,
  backIntoReportPicks,
  chapterLink,
  coreUnlockedEmail,
  fullUnlockedEmail,
  inviteReminderOneEmail,
  inviteReminderTwoEmail,
  withShareOpen,
} from "../emails/purchase";
import {
  fifteenMinutesEmail,
  lastSurveyReminderEmail,
  paymentReceivedEmail,
  surveyWaitingEmail,
} from "../emails/pay-to-start";
import { surveyPausedEmail, surveyStillSavedEmail } from "../emails/survey-reminders";
import { TRIALS, withTrialNotice } from "../../../scripts/email-trials";

const SITE = "https://www.loveiq.org";
const REPORT = `${SITE}/report/tok_abc?from=email&utm_source=email&utm_medium=report&utm_campaign=report_ready`;
const RESUME = `${SITE}/survey?utm_source=email&utm_medium=nurture&utm_campaign=survey_paused`;
const CONTINUE = `${SITE}/sexual-archetype/continue?t=rpp_x&utm_source=email&utm_medium=nurture&utm_campaign=pts_survey_waiting`;
const UNSUB = `${SITE}/api/unsubscribe?t=signed`;
const HOSTILE = `<script>alert(1)</script>`;

const reader = { firstName: "alex", reportUrl: REPORT, siteUrl: SITE, unsubscribeUrl: UNSUB };
const buyer = { continueUrl: CONTINUE, siteUrl: SITE, unsubscribeUrl: UNSUB };

/** Every email, each with the link its main button must carry. */
const ALL = {
  I1: { email: reportReadyEmail(reader), link: REPORT },
  I2: { email: whatPriceOpensEmail(reader), link: REPORT },
  I3: { email: giftEmail({ ...reader, answeredYesterday: true, surveyMinutes: 14 }), link: REPORT },
  I4: { email: giftUnopenedEmail(reader), link: REPORT },
  R1: {
    email: surveyPausedEmail({
      firstName: "alex",
      answered: 37,
      resumeUrl: RESUME,
      siteUrl: SITE,
      unsubscribeUrl: UNSUB,
    }),
    link: RESUME,
  },
  "R1 pay to start": {
    email: surveyPausedEmail({
      firstName: null,
      answered: 37,
      resumeUrl: CONTINUE,
      siteUrl: SITE,
      unsubscribeUrl: UNSUB,
      paidOffer: "pre",
    }),
    link: CONTINUE,
  },
  R2: {
    email: surveyStillSavedEmail({
      firstName: "alex",
      answered: 37,
      resumeUrl: RESUME,
      siteUrl: SITE,
      unsubscribeUrl: UNSUB,
    }),
    link: RESUME,
  },
  "R2 pay to start": {
    email: surveyStillSavedEmail({
      firstName: "alex",
      answered: 37,
      resumeUrl: CONTINUE,
      siteUrl: SITE,
      unsubscribeUrl: UNSUB,
      paidOffer: "full",
    }),
    link: CONTINUE,
  },
  U1: { email: coreUnlockedEmail(reader), link: REPORT },
  C1: { email: fullUnlockedEmail({ ...reader, shareUrl: withShareOpen(REPORT) }), link: REPORT },
  C2: { email: backIntoReportEmail(reader), link: REPORT },
  "S2 €1.99": { email: paymentReceivedEmail({ ...buyer, offer: "pre" }), link: CONTINUE },
  "S2 €29.99": { email: paymentReceivedEmail({ ...buyer, offer: "full" }), link: CONTINUE },
  S3: { email: surveyWaitingEmail({ ...buyer, offer: "pre" }), link: CONTINUE },
  S4: { email: fifteenMinutesEmail({ ...buyer, offer: "full" }), link: CONTINUE },
  S5: {
    email: lastSurveyReminderEmail({ ...buyer, offer: "pre", daysSincePayment: 4 }),
    link: CONTINUE,
  },
} as const;

const INVITE = `${SITE}/report/tok_abc?invite=1&from=email`;
const INVITES = {
  C3: inviteReminderOneEmail({
    firstName: "alex",
    inviteUrl: INVITE,
    siteUrl: SITE,
    unsubscribeUrl: UNSUB,
  }),
  C4: inviteReminderTwoEmail({
    firstName: "alex",
    inviteUrl: INVITE,
    siteUrl: SITE,
    unsubscribeUrl: UNSUB,
  }),
};

const everyEmail = () => [
  ...Object.entries(ALL).map(([name, v]) => [name, v.email] as const),
  ...Object.entries(INVITES),
];

/** The 14 archetypes' names, from their breakdown images ("sensual-connector.svg"). */
function archetypeNames(): string[] {
  return readdirSync(join(process.cwd(), "public/images/archetypes/breakdown"))
    .filter((f) => f.endsWith(".svg") && !/^(cta-|methodology|pill-)/.test(f))
    .map((f) =>
      f
        .replace(/\.svg$/, "")
        .split("-")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ")
    );
}

const escAttr = (s: string) => s.replace(/&/g, "&amp;");

describe("the reworked emails", () => {
  it.each(everyEmail())("%s: subject, preview-sized HTML and a plain-text part", (_name, email) => {
    expect(email.subject.length).toBeGreaterThan(5);
    // Gmail clips an email over 102 KB and hides the rest behind "View entire message".
    expect(Buffer.byteLength(email.html)).toBeLessThan(100_000);
    expect(email.text.length).toBeGreaterThan(100);
    expect(email.html).toContain("<!DOCTYPE html>");
    expect(email.html).toContain(UNSUB.replace(/&/g, "&amp;"));
    expect(email.text).toContain(UNSUB);
    expect(email.text).toContain("Applied Psychometrics UG");
  });

  it.each(everyEmail())("%s: no placeholder from the canvas is left", (_name, email) => {
    for (const part of [email.subject, email.html, email.text]) {
      expect(part).not.toMatch(/\[(€|Alex|URL|x\]|62|10€|1\.99€)/);
      expect(part).not.toContain("A Snapshot");
      expect(part).not.toContain("undefined");
      expect(part).not.toContain("null");
      expect(part).not.toContain("NaN");
    }
  });

  it.each(Object.entries(ALL))(
    "%s: the main button, its Outlook twin and the paste-this-link line carry one link",
    (_name, { email, link }) => {
      const href = escAttr(link);
      expect(email.html).toContain(`<a class="btn" href="${href}"`);
      expect(email.html).toContain(
        `<v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${href}"`
      );
      expect(email.html).toContain(`Or paste this link into your browser: <a href="${href}"`);
      expect(email.text).toContain(link);
    }
  );

  it("names no archetype anywhere: the €1.99 step sells the name, and every card blurs it", () => {
    const names = archetypeNames();
    expect(names).toHaveLength(14);
    for (const [, email] of everyEmail()) {
      for (const n of names) {
        expect(email.html).not.toContain(n);
        expect(email.text).not.toContain(n);
        expect(email.subject).not.toContain(n);
      }
    }
  });

  it("escapes what a reader typed as their name", () => {
    // A name with digits is no name at all (greetingName): "Hi there,".
    expect(reportReadyEmail({ ...reader, firstName: HOSTILE }).html).not.toContain("<script>");
    const tag = `<img/src=x>Eve`;
    for (const email of [
      reportReadyEmail({ ...reader, firstName: tag }),
      surveyPausedEmail({ firstName: tag, answered: 3, resumeUrl: RESUME, siteUrl: SITE }),
      coreUnlockedEmail({ ...reader, firstName: tag }),
    ]) {
      expect(email.html).not.toContain("<img/src=x>");
      expect(email.html).toContain("&lt;img/src=x&gt;Eve");
    }
  });

  it("greets by the first name, or says Hi there when it is no name", () => {
    expect(ALL.I1.email.html).toContain("Hi Alex,");
    expect(ALL.I1.email.subject).toBe("Alex, your Core Archetype is ready to open");
    const initials = reportReadyEmail({ ...reader, firstName: "J" });
    expect(initials.subject).toBe("Your archetype is in");
    expect(initials.html).toContain("Hi there,");
  });

  it("states prices and counts from the code that makes them true", () => {
    expect(PRICE).toBe(eur(INITIAL_UNLOCK_PRICE_CENTS));
    expect(CREDIT).toBe(eur(INITIAL_UNLOCK_CREDIT_CENTS));
    expect(eur(199)).toBe("€1.99");
    expect(eur(1000)).toBe("€10");
    expect(ALL.I1.email.html).toContain(`${PRICE}</strong>, paid once`);
    expect(ALL.I1.email.html).toContain(`${CREDIT} off the full report`);
    expect(ALL.S3.email.text).toContain(`${QUESTIONS_ASKED} questions`);
  });

  it("draws the report's own chapter map: its parts, rows and counts", () => {
    const rows = WIZARD_DRAWER.flatMap((p) => p.rows.map((r) => r.label));
    for (const label of rows) expect(ALL.U1.email.html).toContain(label.replace(/&/g, "&amp;"));
    expect(ALL.U1.email.html).toContain(`${PART_COUNT} Parts,<br>${CHAPTER_COUNT} Chapters`);
    expect(PART_COUNT).toBe(6);
    expect(CHAPTER_COUNT).toBe(17);
    const map = initialReportMap().flatMap((p) => p.rows);
    // With the initial report: the Core Archetype and the rows everyone has in full, the four
    // featured chapters partly open, the rest locked.
    expect(map.find((r) => r.id === "core_archetype")?.access).toBe("free");
    expect(map.find((r) => r.id === "constellation")?.access).toBe("free");
    expect(map.filter((r) => r.access === "open")).toHaveLength(4);
    // I2 tags the rows the €1.99 opens with the price, U1 (paid) with IN FULL, I3 (gifted) with
    // FREE: the report's own rule since 27.10, free wording 14 Nov.
    expect(ALL.I2.email.html).toContain(`>${PRICE}</span>`);
    expect(ALL.U1.email.html).toContain(">IN FULL</span>");
    expect(ALL.I3.email.html).toContain(">FREE</span>");
  });

  it("C1's share button opens the report's share window; C2's picks open their chapters", () => {
    expect(withShareOpen(REPORT)).toContain("share=1");
    expect(ALL.C1.email.html).toContain(escAttr(withShareOpen(REPORT)));
    const picks = backIntoReportPicks();
    expect(picks.map((p) => p.label)).toEqual([
      "Typical Beliefs",
      "Accelerators & Brakes",
      "Challenges in Partnerships",
    ]);
    for (const p of picks) {
      const link = chapterLink(REPORT, p.id);
      expect(link.endsWith(`#${p.id}`)).toBe(true);
      expect(link).toContain("utm_campaign=report_ready");
      expect(ALL.C2.email.html).toContain(escAttr(link));
    }
  });

  it("survey reminders count what is left at the survey's pace and never claim 100%", () => {
    expect(minutesLeft(37)).toBe(Math.ceil(((QUESTIONS_ASKED - 37) / QUESTIONS_ASKED) * 15));
    expect(minutesLeft(QUESTIONS_ASKED)).toBe(1);
    expect(minutesLeft(0)).toBe(15);
    const full = surveyPausedEmail({
      firstName: "a",
      answered: 999,
      resumeUrl: RESUME,
      siteUrl: SITE,
    });
    expect(full.subject).not.toContain("100%");
    expect(ALL.R1.email.html).toContain(`37 of ${QUESTIONS_ASKED} questions`);
    expect(ALL["R2"].email.subject).toBe("Your answers are still saved");
    expect(ALL["R2"].email.text).toContain(
      "Pick up at question 38".replace("Pick up at question 38", "")
    ); // preview only
  });

  it("pay to start says what opens at the end: the Core Archetype, or the full report", () => {
    expect(ALL["S2 €1.99"].email.html).toContain(`${CREDIT} credit`);
    expect(ALL["S2 €29.99"].email.html).not.toContain(`${CREDIT} credit`);
    expect(ALL["S2 €29.99"].email.html).toContain(`${CHAPTER_COUNT} chapters, every part in full`);
    expect(ALL.S4.email.html).toContain("Your full report opens the moment you finish");
    expect(ALL.S5.email.subject).toBe("Your Core Archetype is still waiting for you");
    expect(ALL.S5.email.text).toContain("four days ago");
    expect(ALL["R2 pay to start"].email.text).toContain("your full report opens");
  });

  it("every image it links exists under /images/ (proxy.ts never blocks it in a webmail)", () => {
    for (const path of Object.values(EMAIL_IMAGES)) {
      expect(path.startsWith("/images/email/")).toBe(true);
      expect(existsSync(join(process.cwd(), "public", path))).toBe(true);
    }
  });

  it("sizes the Outlook button to its label", () => {
    expect(buttonWidth("Go")).toBe(220);
    expect(buttonWidth("Open my Core Archetype for €1.99")).toBeGreaterThan(300);
  });
});

describe("trial sends (scripts/email-trials.ts)", () => {
  it("covers every email, each with its notice, and refuses nothing at render", () => {
    expect(TRIALS.map((t) => t.code)).toEqual([
      "S2",
      "S2",
      "S3",
      "S4",
      "S5",
      "R1",
      "R1",
      "R2",
      "R2",
      "I1",
      "I2",
      "I3",
      "I4",
      "U1",
      "C1",
      "C2",
      "C3",
      "C4",
    ]);
    for (const [i, t] of TRIALS.entries()) {
      const out = withTrialNotice(t, t.build(), i + 1, TRIALS.length);
      expect(out.subject.startsWith(`[Trial ${t.code}] `)).toBe(true);
      expect(out.html).toContain(`Trial ${i + 1}/${TRIALS.length}`);
      expect(out.html).not.toContain("<!-- loveiq:card-top -->");
      expect(out.text.startsWith("TRIAL ")).toBe(true);
    }
  });
});

// Free wording (14 Nov): the report says IN FULL, never FREE, once a reader has paid (27.10),
// and Marcus: no claim we can't deliver on. A EUR 1.99 buyer's chapters are paid for, not
// free; the day-1 gift's really are free, so I3 keeps the word.
describe("what the chapter map's legend calls free", () => {
  it("never tells a EUR 1.99 buyer their chapters are free (U1)", () => {
    const { html, text } = coreUnlockedEmail(reader);
    expect(html).not.toMatch(/\bfree\b/i);
    expect(text).not.toMatch(/\bfree\b/i);
    expect(html).toContain("IN FULL");
    expect(html).toContain("Read your opening chapters <strong>in full</strong>.");
  });

  it("still calls the gifted chapters free (I3)", () => {
    const { html } = giftEmail({ ...reader, answeredYesterday: true });
    expect(html).toContain("free chapters");
  });
});
