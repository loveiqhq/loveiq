import { describe, expect, it } from "vitest";
import { inviteReminder1Email } from "@features/invite/emails/invite-reminder-1";
import { inviteReminder2Email } from "@features/invite/emails/invite-reminder-2";

const SITE_URL = "https://loveiq.org";
const INVITE_CTA_URL = "https://loveiq.org/report?invite=1";

describe("inviteReminder1Email", () => {
  it("uses soft framing", () => {
    const result = inviteReminder1Email({
      firstName: "Alice",
      inviteCtaUrl: INVITE_CTA_URL,
      siteUrl: SITE_URL,
    });
    expect(result.subject).toBe("Could this help a friend?");
    expect(result.html).toContain("Know someone who&rsquo;d love this");
    expect(result.html).toContain("Refer a friend and let them discover their own report");
    expect(result.html).toContain(INVITE_CTA_URL);
  });

  it("uses generic greeting when firstName missing", () => {
    const { html } = inviteReminder1Email({
      inviteCtaUrl: INVITE_CTA_URL,
      siteUrl: SITE_URL,
    });
    expect(html).toContain("Hi there,");
  });
});

describe("inviteReminder2Email", () => {
  it("uses stronger framing", () => {
    const result = inviteReminder2Email({
      firstName: "Alice",
      inviteCtaUrl: INVITE_CTA_URL,
      siteUrl: SITE_URL,
    });
    expect(result.subject).toBe("Why keep this to yourself?");
    expect(result.html).toContain("Don&rsquo;t your friends deserve to know");
    expect(result.html).toContain("share some of the love");
    expect(result.html).toContain(INVITE_CTA_URL);
  });

  it("escapes HTML in firstName", () => {
    const { html } = inviteReminder2Email({
      firstName: "<x>",
      inviteCtaUrl: INVITE_CTA_URL,
      siteUrl: SITE_URL,
    });
    expect(html).not.toContain("<x>");
    expect(html).toContain("&lt;x&gt;");
  });
});
