import { describe, expect, it } from "vitest";
import { reportSharedBEmail } from "@features/report/server/emails/report-shared-b";
import { reportSharedCEmail } from "@features/report/server/emails/report-shared-c";

const SITE_URL = "https://loveiq.org";
const SHARE_URL = "https://loveiq.org/report/abc123";

describe("reportSharedBEmail", () => {
  it("uses 'View report now' CTA and the original subject", () => {
    const result = reportSharedBEmail({
      ownerFirstName: "Eman",
      shareUrl: SHARE_URL,
      siteUrl: SITE_URL,
    });
    expect(result.subject).toBe("A LoveIQ report has been shared with you");
    expect(result.html).toContain("View report now");
    expect(result.html).toContain("Eman has taken the LoveIQ test");
    expect(result.html).toContain("shared their report with you");
  });

  it("renders the share URL inline (above the CTA)", () => {
    const { html } = reportSharedBEmail({
      ownerFirstName: "Eman",
      shareUrl: SHARE_URL,
      siteUrl: SITE_URL,
    });
    // URL appears at least twice: inline link + CTA href.
    const occurrences = html.split(SHARE_URL).length - 1;
    expect(occurrences).toBeGreaterThanOrEqual(2);
  });

  it("renders the personal message block when provided", () => {
    const { html, text } = reportSharedBEmail({
      ownerFirstName: "Eman",
      shareUrl: SHARE_URL,
      siteUrl: SITE_URL,
      personalMessage: "Hey, I wanted you to read this.",
    });
    expect(html).toContain("Hey, I wanted you to read this");
    expect(text).toContain("Hey, I wanted you to read this");
  });

  it("falls back to 'Someone' when ownerFirstName is missing", () => {
    const { html, text } = reportSharedBEmail({
      shareUrl: SHARE_URL,
      siteUrl: SITE_URL,
    });
    expect(html).toContain("Someone has taken the LoveIQ test");
    expect(text).toContain("Someone has taken the LoveIQ test");
  });

  it("escapes HTML in ownerFirstName and personal message", () => {
    const { html } = reportSharedBEmail({
      ownerFirstName: "<x>",
      shareUrl: SHARE_URL,
      siteUrl: SITE_URL,
      personalMessage: "<script>alert(1)</script>",
    });
    expect(html).not.toContain("<x>");
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });
});

describe("reportSharedCEmail", () => {
  it("uses the personal subject and includes the P.S. line", () => {
    const result = reportSharedCEmail({
      ownerFirstName: "Eman",
      shareUrl: SHARE_URL,
      siteUrl: SITE_URL,
    });
    expect(result.subject).toBe("Something personal I wanted you to see");
    expect(result.html).toContain("Check out LoveIQ");
    expect(result.html).toContain("I think you should also try it");
  });

  it("renders the personal message and inline link", () => {
    const { html } = reportSharedCEmail({
      ownerFirstName: "Eman",
      shareUrl: SHARE_URL,
      siteUrl: SITE_URL,
      personalMessage: "Read this when you have a sec.",
    });
    expect(html).toContain("Read this when you have a sec");
    expect(html).toContain(SHARE_URL);
  });

  it("falls back to 'Someone' when ownerFirstName is missing", () => {
    const { html } = reportSharedCEmail({
      shareUrl: SHARE_URL,
      siteUrl: SITE_URL,
    });
    expect(html).toContain("Someone has taken the LoveIQ test");
  });
});
