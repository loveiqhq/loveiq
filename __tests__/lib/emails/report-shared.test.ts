import { describe, expect, it } from "vitest";
import { reportSharedEmail } from "@features/report/server/emails/report-shared";

describe("reportSharedEmail", () => {
  const baseParams = {
    shareUrl: "https://loveiq.org/report/rpts_abcdefghijklmnopqrst",
    siteUrl: "https://loveiq.org",
  };

  it("uses static subject regardless of owner", () => {
    const result = reportSharedEmail({ ...baseParams, ownerFirstName: "Eman" });
    expect(result.subject).toBe("A LoveIQ report has been shared with you");
  });

  it("includes owner first name in body and signature", () => {
    const result = reportSharedEmail({ ...baseParams, ownerFirstName: "Eman" });
    expect(result.html).toContain("Eman has taken the LoveIQ test");
    expect(result.html).toContain("Eman sent via");
    expect(result.text).toContain("Eman has taken the LoveIQ test");
    expect(result.text).toContain("Eman sent via LoveIQ");
  });

  it("falls back to 'Someone' when owner name missing", () => {
    const result = reportSharedEmail({ ...baseParams, ownerFirstName: null });
    expect(result.html).toContain("Someone has taken the LoveIQ test");
    expect(result.text).toContain("Someone sent via LoveIQ");
  });

  it("escapes owner name to prevent HTML injection", () => {
    const result = reportSharedEmail({
      ...baseParams,
      ownerFirstName: "<script>alert(1)</script>",
    });
    expect(result.html).not.toContain("<script>");
    expect(result.html).toContain("&lt;script&gt;");
  });

  it("embeds shareUrl as CTA and plain-text fallback", () => {
    const result = reportSharedEmail({ ...baseParams, ownerFirstName: "Ada" });
    expect(result.html).toContain(baseParams.shareUrl);
    expect(result.text).toContain(baseParams.shareUrl);
  });

  it("starts text body with 'Hi :),'", () => {
    const result = reportSharedEmail({ ...baseParams });
    expect(result.text).toContain("Hi :),");
  });

  it("renders personalMessage when provided (escaped + line-break preserved)", () => {
    const result = reportSharedEmail({
      ...baseParams,
      ownerFirstName: "Ada",
      personalMessage: "Line one\n\n<b>bold</b>",
    });
    expect(result.html).toContain("Line one");
    expect(result.html).toContain("&lt;b&gt;bold&lt;/b&gt;");
    expect(result.html).toContain("<br />");
    expect(result.text).toContain("Line one");
    expect(result.text).toContain("<b>bold</b>");
  });

  it("omits personal-message block when empty", () => {
    const withMsg = reportSharedEmail({
      ...baseParams,
      ownerFirstName: "Ada",
      personalMessage: "Hello there",
    });
    const withoutMsg = reportSharedEmail({
      ...baseParams,
      ownerFirstName: "Ada",
      personalMessage: "   ",
    });
    expect(withMsg.html).toContain("Hello there");
    expect(withoutMsg.html).not.toContain("Hello there");
    // Plain-text body has no orphan blank line either.
    expect(withoutMsg.text).not.toMatch(/\n\n\n/);
  });
});
