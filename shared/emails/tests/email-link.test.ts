import { describe, expect, it } from "vitest";

import { EMAIL_LINKS, tagEmailLink } from "@shared/emails/email-link";

describe("tagEmailLink", () => {
  it("adds the email's tags after what the link already carries", () => {
    expect(
      tagEmailLink(
        "https://www.loveiq.org/report/rpt_ABCDEFGHIJKLMNOPQRST?invite=1&from=email",
        EMAIL_LINKS.inviteReminder1
      )
    ).toBe(
      "https://www.loveiq.org/report/rpt_ABCDEFGHIJKLMNOPQRST?invite=1&from=email" +
        "&utm_source=email&utm_medium=nurture&utm_campaign=invite_reminder_1"
    );
    expect(tagEmailLink("https://www.loveiq.org/survey", EMAIL_LINKS.surveyPaused)).toBe(
      "https://www.loveiq.org/survey?utm_source=email&utm_medium=nurture&utm_campaign=survey_paused"
    );
  });

  it("replaces tags a link carried before, never doubling them", () => {
    const once = tagEmailLink("https://www.loveiq.org/why?r=other", EMAIL_LINKS.unlockFeedback);
    expect(tagEmailLink(once, EMAIL_LINKS.unlockFeedback)).toBe(once);
  });

  it("gives every email its own campaign", () => {
    const campaigns = Object.values(EMAIL_LINKS).map((l) => l.campaign);
    expect(new Set(campaigns).size).toBe(campaigns.length);
  });
});
