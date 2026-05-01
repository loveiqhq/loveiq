import { describe, expect, it } from "vitest";
import { waitlistEarlyAccessBEmail } from "../../../lib/emails/waitlist-early-access-b";

const SITE_URL = "https://loveiq.org";

describe("waitlistEarlyAccessBEmail", () => {
  it("returns subject, html, and text with B-variant copy", () => {
    const result = waitlistEarlyAccessBEmail({ siteUrl: SITE_URL });
    expect(result.subject).toContain("Exclusive access");
    expect(result.html).toContain("Your access link expires in 48h");
    expect(result.text).toContain("48h");
  });

  it("includes the same testimonials as variant A", () => {
    const { html } = waitlistEarlyAccessBEmail({ firstName: "Alice", siteUrl: SITE_URL });
    expect(html).toContain("Surprisingly accurate");
    expect(html).toContain("I actually learned something about myself");
    expect(html).toContain("It was worth all the time");
  });

  it("escapes HTML in firstName", () => {
    const { html } = waitlistEarlyAccessBEmail({
      firstName: "<script>x</script>",
      siteUrl: SITE_URL,
    });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("builds the survey CTA from siteUrl", () => {
    const { html } = waitlistEarlyAccessBEmail({ siteUrl: "https://staging.loveiq.org/" });
    expect(html).toContain("https://staging.loveiq.org/survey");
  });
});
