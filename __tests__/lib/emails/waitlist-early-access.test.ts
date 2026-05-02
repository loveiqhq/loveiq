import { describe, it, expect } from "vitest";
import { waitlistEarlyAccessEmail } from "../../../lib/emails/waitlist-early-access";

const SITE_URL = "https://loveiq.org";

describe("waitlistEarlyAccessEmail", () => {
  it("returns subject, html, and text", () => {
    const result = waitlistEarlyAccessEmail({ siteUrl: SITE_URL });
    expect(result.subject).toContain("early access");
    expect(result.html).toContain("You are chosen for early access!");
    expect(result.text).toContain("You are chosen");
  });

  it("uses generic greeting when firstName is missing", () => {
    const result = waitlistEarlyAccessEmail({ siteUrl: SITE_URL });
    expect(result.html).toContain("Hi there,");
    expect(result.text).toContain("Hi there,");
  });

  it("uses generic greeting for null/empty/whitespace firstName", () => {
    for (const firstName of [null, "", "   "]) {
      const { html } = waitlistEarlyAccessEmail({ firstName, siteUrl: SITE_URL });
      expect(html).toContain("Hi there,");
    }
  });

  it("includes firstName in greeting when provided", () => {
    const result = waitlistEarlyAccessEmail({ firstName: "Alice", siteUrl: SITE_URL });
    expect(result.html).toContain("Hi Alice,");
    expect(result.text).toContain("Hi Alice,");
  });

  it("escapes HTML special characters in firstName (XSS prevention)", () => {
    const result = waitlistEarlyAccessEmail({
      firstName: '<script>alert("xss")</script>',
      siteUrl: SITE_URL,
    });
    expect(result.html).not.toContain("<script>");
    expect(result.html).toContain("&lt;script&gt;");
  });

  it("builds the survey CTA from the provided siteUrl", () => {
    const result = waitlistEarlyAccessEmail({ siteUrl: "https://staging.loveiq.org/" });
    expect(result.html).toContain("https://staging.loveiq.org/survey");
    expect(result.text).toContain("https://staging.loveiq.org/survey");
  });

  it("includes all three early-feedback testimonials", () => {
    const { html, text } = waitlistEarlyAccessEmail({ siteUrl: SITE_URL });
    expect(html).toContain("Surprisingly accurate");
    expect(html).toContain("I actually learned something about myself");
    expect(html).toContain("It was worth all the time");
    expect(text).toContain("Surprisingly accurate");
  });

  it("includes the three what-you-get bullets", () => {
    const { html } = waitlistEarlyAccessEmail({ siteUrl: SITE_URL });
    expect(html).toContain("clear report of your sexual archetype");
    expect(html).toContain("desire &amp; intimacy patterns");
    expect(html).toContain("communicate your needs");
  });

  it("HTML output matches snapshot", () => {
    const { html } = waitlistEarlyAccessEmail({ firstName: "Alice", siteUrl: SITE_URL });
    expect(html).toMatchSnapshot();
  });

  it("text output matches snapshot", () => {
    const { text } = waitlistEarlyAccessEmail({ firstName: "Alice", siteUrl: SITE_URL });
    expect(text).toMatchSnapshot();
  });
});
