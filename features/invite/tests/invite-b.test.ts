import { describe, expect, it } from "vitest";
import { inviteBEmail } from "@features/invite/emails/invite-b";

const SITE_URL = "https://loveiq.org";
const CTA_URL = "https://loveiq.org?utm_campaign=refer";

describe("inviteBEmail", () => {
  it("uses first-person testimonial framing by default", () => {
    const result = inviteBEmail({
      ctaUrl: CTA_URL,
      referrerName: "Alice Doe",
      siteUrl: SITE_URL,
    });
    expect(result.subject).toContain("I found out something about myself");
    expect(result.html).toContain("This opened my eyes");
    expect(result.html).toContain("real clarity on my intimate patterns");
    expect(result.html).toContain("Alice sent via LoveIQ");
    expect(result.html).toContain("Take the test");
  });

  it("renders the user's custom personal message when provided", () => {
    const personalMessage = "Hey friend — really think you would like this. Take 15 minutes.";
    const { html, text } = inviteBEmail({
      ctaUrl: CTA_URL,
      referrerName: "Alice",
      siteUrl: SITE_URL,
      personalMessage,
    });
    expect(html).toContain(personalMessage);
    expect(text).toContain(personalMessage);
    // Default testimonial should NOT appear when a custom message is supplied.
    expect(html).not.toContain("real clarity on my intimate patterns");
  });

  it("escapes HTML in personalMessage", () => {
    const { html } = inviteBEmail({
      ctaUrl: CTA_URL,
      siteUrl: SITE_URL,
      personalMessage: "<script>alert(1)</script>",
    });
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("falls back to 'A friend' when referrerName missing", () => {
    const { html, text } = inviteBEmail({ ctaUrl: CTA_URL, siteUrl: SITE_URL });
    expect(html).toContain("A friend sent via LoveIQ");
    expect(text).toContain("A friend sent via LoveIQ");
  });
});
