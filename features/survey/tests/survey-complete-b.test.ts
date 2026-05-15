import { describe, expect, it } from "vitest";
import { surveyCompleteBEmail } from "@features/survey/server/emails/survey-complete-b";

const SITE_URL = "https://loveiq.org";
const REPORT_URL = "https://loveiq.org/report/abc";

describe("surveyCompleteBEmail", () => {
  it("uses curiosity-framed copy", () => {
    const result = surveyCompleteBEmail({
      firstName: "Alice",
      reportUrl: REPORT_URL,
      siteUrl: SITE_URL,
    });
    expect(result.subject).toContain("This might surprise you");
    expect(result.html).toContain("This might change how you see yourself");
    expect(result.html).toContain("Something interesting showed up in your results");
    expect(result.html).toContain("See what we found");
  });

  it("uses generic greeting when firstName missing", () => {
    const { html } = surveyCompleteBEmail({ reportUrl: REPORT_URL, siteUrl: SITE_URL });
    expect(html).toContain("Hi there,");
  });

  it("escapes HTML in firstName", () => {
    const { html } = surveyCompleteBEmail({
      firstName: "<x>",
      reportUrl: REPORT_URL,
      siteUrl: SITE_URL,
    });
    expect(html).not.toContain("<x>");
    expect(html).toContain("&lt;x&gt;");
  });

  it("includes the report URL on the CTA", () => {
    const { html } = surveyCompleteBEmail({
      firstName: "Alice",
      reportUrl: REPORT_URL,
      siteUrl: SITE_URL,
    });
    expect(html).toContain(REPORT_URL);
  });
});
