import { describe, expect, it } from "vitest";
import { surveyPausedBEmail } from "@features/survey/server/emails/survey-paused-b";

const SITE_URL = "https://loveiq.org";
const RESUME_URL = "https://loveiq.org/survey?session=abc";

describe("surveyPausedBEmail", () => {
  it("uses loss-aversion framing", () => {
    const result = surveyPausedBEmail({
      firstName: "Alice",
      resumeUrl: RESUME_URL,
      siteUrl: SITE_URL,
    });
    expect(result.subject).toBe("Continue your LoveIQ survey");
    expect(result.html).toContain("Your answers are still waiting");
    expect(result.html).toContain("Most people never come back");
    expect(result.html).toContain("Finish your LoveIQ test now");
  });

  it("uses generic greeting when firstName missing", () => {
    const { html } = surveyPausedBEmail({ resumeUrl: RESUME_URL, siteUrl: SITE_URL });
    expect(html).toContain("Hi there,");
  });

  it("includes the resume URL on the CTA", () => {
    const { html } = surveyPausedBEmail({
      firstName: "Alice",
      resumeUrl: RESUME_URL,
      siteUrl: SITE_URL,
    });
    expect(html).toContain(RESUME_URL);
  });
});
