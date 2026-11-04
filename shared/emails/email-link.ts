/**
 * Our customer emails' links back to the site, tagged one way, as the 72h email and E07 set
 * it: utm_source=email, utm_medium=<the email's family>, utm_campaign=<the email>. GA4 and
 * PostHog credit the visit to Email, and the report page records which email brought a reader
 * back (`email_return`), which the #incoming-surveys message names ("Came back by email").
 *
 * The 72h email and the chapter nudge build their own (`utm_campaign` = their stage); the
 * refer-a-friend and test-link emails keep their older `utm_source=loveiq_email` tags.
 */
export const EMAIL_LINKS = {
  reportReady: { medium: "report", campaign: "report_ready" },
  receipt: { medium: "purchase", campaign: "receipt" },
  payToStart: { medium: "purchase", campaign: "pay_to_start" },
  inviteReminder1: { medium: "nurture", campaign: "invite_reminder_1" },
  inviteReminder2: { medium: "nurture", campaign: "invite_reminder_2" },
  surveyPaused: { medium: "nurture", campaign: "survey_paused" },
  unlockFeedback: { medium: "nurture", campaign: "unlock_feedback" },
  initialGift: { medium: "nurture", campaign: "initial_gift" },
  reportShare: { medium: "share", campaign: "report_share" },
} as const;

export type EmailLink = (typeof EMAIL_LINKS)[keyof typeof EMAIL_LINKS];

/**
 * The day every customer email's links were first tagged (the release of #704), which
 * AP-Analytics names where its numbers shift with it. Correct it if that release moves.
 */
export const EMAIL_LINKS_TAGGED_FROM = "6 Nov 2026";

/** The link with its email's tags, after whatever it already carries (`from=email`, `invite=1`). */
export function tagEmailLink(url: string, link: EmailLink): string {
  const tagged = new URL(url);
  tagged.searchParams.set("utm_source", "email");
  tagged.searchParams.set("utm_medium", link.medium);
  tagged.searchParams.set("utm_campaign", link.campaign);
  return tagged.toString();
}
