import { describe, expect, it } from "vitest";
import { renderBrandFooter, wrapEmailShell } from "@shared/emails/shared";

describe("renderBrandFooter — unsubscribe link", () => {
  it("omits the unsubscribe row when no URL is provided", () => {
    const html = renderBrandFooter();
    expect(html).not.toContain("Unsubscribe");
  });

  it("renders the refreshed label, 13px font, and 16px top padding when URL is provided", () => {
    const html = renderBrandFooter("https://loveiq.org/api/unsubscribe?token=tok123");
    // Visible label — slightly more descriptive than the old bare "Unsubscribe".
    expect(html).toContain("Unsubscribe from these emails");
    // Size + padding bump for compliance visibility without becoming a CTA-style button.
    expect(html).toContain("font-size:13px");
    expect(html).toContain("padding-top:16px");
    // Anchor preserves the URL so the click hits /api/unsubscribe.
    expect(html).toContain('href="https://loveiq.org/api/unsubscribe?token=tok123"');
  });

  it("escapes special characters in the unsubscribe URL", () => {
    const html = renderBrandFooter("https://x.io/api/unsubscribe?token=ab&y=1");
    expect(html).toContain("token=ab&amp;y=1");
  });

  it("flows through wrapEmailShell without errors", () => {
    const html = wrapEmailShell({
      bodyHtml: "<tr><td>body</td></tr>",
      siteUrl: "https://loveiq.org",
      title: "Test",
      unsubscribeUrl: "https://loveiq.org/api/unsubscribe?token=tok",
    });
    expect(html).toContain("Unsubscribe from these emails");
    expect(html).toContain("font-size:13px");
  });
});
